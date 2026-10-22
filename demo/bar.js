'use strict'

const viewport = document.getElementById('viewport')
const track = document.getElementById('track')
const groupA = document.getElementById('groupA')
const groupB = document.getElementById('groupB')
const emptyEl = document.getElementById('empty')
const warnEl = document.getElementById('warn')

let cfg = { opacity: 0.86, scrollSpeed: 55, clickThrough: true }
let quotes = []
let quoteMap = new Map()
let baseHTML = ''
let renderedSig = ''
let groupW = 0
let offset = 0
let last = 0
let speed = 55

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )

const clsFor = (pct) => (pct > 0.00001 ? 'up' : pct < -0.00001 ? 'down' : 'flat')

function fmtPrice(q) {
  const t = q.priceText
  if (t !== undefined && t !== null && String(t).trim() !== '') return String(t).trim()
  const v = Number(q.price)
  if (!Number.isFinite(v) || v === 0) return '--'
  return v >= 100 ? v.toFixed(2) : v.toFixed(v < 1 ? 3 : 2)
}

function pillHTML(q) {
  const cls = clsFor(q.pct)
  const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : ''
  const sign = q.pct > 0 ? '+' : ''
  return (
    `<div class="pill ${cls}" data-symbol="${esc(q.symbol)}">` +
    `<span class="nm">${esc(q.name)}</span>` +
    `<span class="pr">${esc(fmtPrice(q))}</span>` +
    `<span class="chg">${arrow ? `<i class="arr">${arrow}</i>` : ''}${sign}${q.pct.toFixed(2)}%</span>` +
    `</div>`
  )
}

/* 把一组气泡复制到足够宽，实现无缝滚动 */
function layoutTrack() {
  if (!baseHTML) return
  groupA.innerHTML = baseHTML
  const one = groupA.getBoundingClientRect().width
  if (one <= 0) return
  const gap = 9
  const need = Math.max(1, Math.ceil((viewport.clientWidth * 1.2) / (one + gap)))
  groupA.innerHTML = baseHTML.repeat(need)
  groupB.innerHTML = baseHTML.repeat(need)
  groupW = groupA.getBoundingClientRect().width + gap
  if (groupW > 0 && offset >= groupW) offset = offset % groupW
  track.style.transform = `translate3d(${-offset}px,0,0)`
}

function updateFields(list) {
  quoteMap = new Map(list.map((q) => [String(q.symbol).toLowerCase(), q]))
  const nodes = track.querySelectorAll('.pill')
  nodes.forEach((el) => {
    const q = quoteMap.get(String(el.dataset.symbol || '').toLowerCase())
    if (!q) return
    const cls = clsFor(q.pct)
    if (!el.classList.contains(cls)) el.className = 'pill ' + cls
    const pr = el.querySelector('.pr')
    const chg = el.querySelector('.chg')
    const nm = el.querySelector('.nm')
    const priceTxt = fmtPrice(q)
    if (pr.textContent !== priceTxt) {
      pr.textContent = priceTxt
      el.classList.add('pulse')
      setTimeout(() => el.classList.remove('pulse'), 560)
    }
    const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : ''
    const chgTxt = `${arrow ? `<i class="arr">${arrow}</i>` : ''}${q.pct > 0 ? '+' : ''}${q.pct.toFixed(2)}%`
    if (chg.innerHTML !== chgTxt) chg.innerHTML = chgTxt
    if (nm.textContent !== q.name) nm.textContent = q.name
  })
}

function showWarn(msg) {
  if (msg) {
    warnEl.textContent = '⚠ ' + msg
    warnEl.classList.add('show')
  } else {
    warnEl.classList.remove('show')
  }
}

function setQuotes(list, error) {
  quotes = Array.isArray(list) ? list : []
  if (quotes.length === 0) {
    emptyEl.classList.add('show')
    baseHTML = ''
    renderedSig = ''
    groupA.innerHTML = ''
    groupB.innerHTML = ''
    groupW = 0
    showWarn(error)
    return
  }
  emptyEl.classList.remove('show')
  const sig = quotes.map((q) => q.symbol).join(',')
  if (sig !== renderedSig) {
    renderedSig = sig
    baseHTML = quotes.map(pillHTML).join('')
    layoutTrack()
  } else {
    updateFields(quotes)
  }
  showWarn(error)
}

function applyConfig() {
  document.documentElement.style.setProperty('--op', String(cfg.opacity))
  speed = Number(cfg.scrollSpeed) || 0
  document.body.classList.toggle('unlocked', !cfg.clickThrough)
  if (baseHTML) layoutTrack()
}

function tick(t) {
  if (!last) last = t
  const dt = Math.min(0.08, (t - last) / 1000)
  last = t
  if (groupW > 0 && speed > 0) {
    offset += speed * dt
    if (offset >= groupW) offset -= groupW
    track.style.transform = `translate3d(${-offset.toFixed(2)}px,0,0)`
  }
  requestAnimationFrame(tick)
}

async function init() {
  try {
    cfg = Object.assign(cfg, await window.api.getConfig())
  } catch (e) {
    /* ignore */
  }
  applyConfig()
  requestAnimationFrame(tick)

  try {
    const snap = await window.api.getQuotes()
    setQuotes(snap.quotes, snap.error)
  } catch (e) {
    /* ignore */
  }

  window.api.onQuotes((p) => setQuotes(p.quotes, p.error))
  window.api.onConfig((c) => {
    cfg = Object.assign(cfg, c)
    applyConfig()
    if (quotes.length) setQuotes(quotes, '')
  })
}

let rzTimer = null
window.addEventListener('resize', () => {
  clearTimeout(rzTimer)
  rzTimer = setTimeout(layoutTrack, 60)
})

init()
