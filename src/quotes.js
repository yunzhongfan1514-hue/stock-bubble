'use strict'

const https = require('https')
const iconv = require('iconv-lite')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function httpGetText(url, encoding = 'gbk', timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        timeout,
        headers: {
          'User-Agent': UA,
          Referer: 'https://finance.qq.com/',
          Accept: '*/*'
        }
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume()
          reject(new Error('HTTP ' + res.statusCode))
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          try {
            resolve(iconv.decode(buf, encoding))
          } catch (e) {
            resolve(buf.toString('utf8'))
          }
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
  })
}

function marketOf(symbol) {
  const p = symbol.slice(0, 2)
  if (p === 'sh') return 'SH'
  if (p === 'sz') return 'SZ'
  if (p === 'bj') return 'BJ'
  if (p === 'hk') return 'HK'
  if (p === 'us') return 'US'
  return ''
}

function formatTime(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{14}$/.test(s)) {
    // 20261022100203
    return `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`
  }
  const parts = s.split(' ')
  if (parts.length >= 2) return parts[1].slice(0, 5)
  return s
}

function parseLine(line) {
  const m = line.match(/v_([A-Za-z0-9._]+)\s*=\s*"([^"]*)"/)
  if (!m) return null
  const symbol = m[1]
  const f = m[2].split('~')
  if (f.length < 35) return null

  const price = parseFloat(f[3])
  const prevClose = parseFloat(f[4])
  const open = parseFloat(f[5])
  let change = parseFloat(f[31])
  let pct = parseFloat(f[32])
  if (!Number.isFinite(change) && Number.isFinite(price) && Number.isFinite(prevClose)) {
    change = price - prevClose
  }
  if (!Number.isFinite(pct) && Number.isFinite(prevClose) && prevClose !== 0) {
    pct = ((price - prevClose) / prevClose) * 100
  }

  return {
    symbol,
    name: (f[1] || symbol).trim(),
    code: (f[2] || '').trim(),
    market: marketOf(symbol),
    price: Number.isFinite(price) ? price : 0,
    priceText: (f[3] || '').trim(),
    prevClose: Number.isFinite(prevClose) ? prevClose : 0,
    open: Number.isFinite(open) ? open : 0,
    change: Number.isFinite(change) ? change : 0,
    pct: Number.isFinite(pct) ? pct : 0,
    high: parseFloat(f[33]) || 0,
    low: parseFloat(f[34]) || 0,
    time: formatTime(f[30]),
    ts: Date.now()
  }
}

async function fetchQuotes(symbols) {
  const list = (symbols || []).filter(Boolean)
  if (list.length === 0) return []
  const url = 'https://qt.gtimg.cn/q=' + list.join(',')
  const text = await httpGetText(url, 'gbk')
  const map = new Map()
  text.split(';').forEach((line) => {
    const q = parseLine(line)
    if (q) map.set(q.symbol.toLowerCase(), q)
  })
  return list
    .map((s) => map.get(String(s).toLowerCase()))
    .filter(Boolean)
}

/** 按名称/代码搜索股票，返回候选列表 */
async function search(keyword) {
  const q = String(keyword || '').trim()
  if (!q) return []
  const url = 'https://smartbox.gtimg.cn/s3/?q=' + encodeURIComponent(q) + '&t=all'
  const text = await httpGetText(url, 'gbk')
  const m = text.match(/v_hint\s*=\s*"([^"]*)"/)
  if (!m || !m[1] || m[1] === 'N') return []
  return m[1]
    .split('^')
    .map((item) => {
      const p = item.split('~')
      if (p.length < 5) return null
      const market = String(p[0]).toLowerCase() // sh / sz / hk / us / bj
      const code = p[1]
      const name = p[2]
      const symbol = market + code
      return { symbol, name, code, market: market.toUpperCase() }
    })
    .filter(Boolean)
    .slice(0, 8)
}

module.exports = { fetchQuotes, search }
