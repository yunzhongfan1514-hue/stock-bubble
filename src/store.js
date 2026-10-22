'use strict'

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json')

const DEFAULT_STOCKS = [
  { symbol: 'sh000001', name: '上证指数' },
  { symbol: 'sz399001', name: '深证成指' },
  { symbol: 'sh600519', name: '贵州茅台' },
  { symbol: 'sz000001', name: '平安银行' },
  { symbol: 'hk00700', name: '腾讯控股' },
  { symbol: 'usAAPL', name: '苹果' }
]

const CONFIG_VERSION = 2

const DEFAULT_CONFIG = {
  cfgVersion: CONFIG_VERSION,
  stocks: DEFAULT_STOCKS,
  displayMode: 'carousel', // carousel 轮播（单气泡循环切换） | scroll 横向滚动
  carouselInterval: 6,  // 轮播切换间隔（秒）
  refreshInterval: 5,   // 秒
  scrollSpeed: 55,      // 像素/秒
  barHeight: 34,        // 气泡条高度
  widthRatio: 1,        // 占屏幕工作区宽度比例（滚动模式）
  bottomGap: 4,         // 距离任务栏上沿的间距
  opacity: 0.86,        // 气泡不透明度
  showPrice: true,
  clickThrough: true,   // 鼠标穿透（锁定）
  alwaysOnTop: true,
  autoLaunch: false,
  visible: true,
  layoutMode: 'taskbar', // taskbar 贴任务栏居中 | custom 自定义位置（可拖到任意处）
  pos: { x: null, y: null }
}

let config = null

function clamp(n, min, max) {
  n = Number(n)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** 把用户输入的各种写法归一化成腾讯行情接口的 symbol */
function normalizeSymbol(input) {
  let s = String(input || '').trim()
  if (!s) return null
  s = s.replace(/[，,；;\s]/g, '')
  const upper = s.toUpperCase()

  // 600519.SH / 00700.HK / AAPL.US
  let m = upper.match(/^([0-9A-Z.]+)\.(SH|SZ|BJ|HK|US)$/)
  if (m) {
    const code = m[1].replace(/\./g, '')
    return m[2].toLowerCase() + code
  }
  // 已带前缀
  m = upper.match(/^(SH|SZ|BJ|HK|US)([0-9A-Z.]+)$/)
  if (m) {
    return m[1].toLowerCase() + m[2].replace(/\./g, '')
  }
  // 纯数字
  if (/^\d{6}$/.test(s)) {
    if (/^[6895]/.test(s)) return 'sh' + s
    if (/^[023]/.test(s)) return 'sz' + s
    if (/^[48]/.test(s)) return 'bj' + s
    return 'sh' + s
  }
  if (/^\d{5}$/.test(s)) return 'hk' + s
  if (/^\d{1,4}$/.test(s)) return 'hk' + s.padStart(5, '0')
  // 纯字母 => 美股
  if (/^[A-Z][A-Z.\-]{0,9}$/.test(upper)) return 'us' + upper.replace(/\./g, '')
  return null
}

function load() {
  const def = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  let needMigrate = false
  try {
    const raw = fs.readFileSync(CONFIG_FILE(), 'utf8')
    const saved = JSON.parse(raw)
    config = Object.assign(def, saved || {})
    if (!Array.isArray(config.stocks) || config.stocks.length === 0) {
      config.stocks = def.stocks
    }
    needMigrate = !saved || !saved.cfgVersion || Number(saved.cfgVersion) < CONFIG_VERSION
    // v1 -> v2：旧默认 4 秒切得太急，内容还没看清就换了，统一放慢到 6 秒
    if (needMigrate && Number(config.carouselInterval) <= 4) {
      config.carouselInterval = 6
    }
    config.cfgVersion = CONFIG_VERSION
  } catch (e) {
    config = def
  }
  sanitize()
  if (needMigrate) save()
  return config
}

function sanitize() {
  config.displayMode = config.displayMode === 'scroll' ? 'scroll' : 'carousel'
  config.carouselInterval = clamp(config.carouselInterval, 2, 30)
  config.refreshInterval = clamp(config.refreshInterval, 2, 120)
  config.scrollSpeed = clamp(config.scrollSpeed, 0, 400)
  config.barHeight = clamp(config.barHeight, 24, 80)
  config.widthRatio = clamp(config.widthRatio, 0.3, 1)
  config.bottomGap = clamp(config.bottomGap, 0, 200)
  config.opacity = clamp(config.opacity, 0.2, 1)
  config.layoutMode = config.layoutMode === 'custom' ? 'custom' : 'taskbar'

  const pos = config.pos && typeof config.pos === 'object' ? config.pos : {}
  const px = Number(pos.x)
  const py = Number(pos.y)
  config.pos = {
    x: Number.isFinite(px) ? Math.round(px) : null,
    y: Number.isFinite(py) ? Math.round(py) : null
  }
  // 没有记录过坐标就不能算自定义位置，退回贴任务栏
  if (config.pos.x === null || config.pos.y === null) config.layoutMode = 'taskbar'

  config.stocks = config.stocks
    .map((s) => {
      const symbol = normalizeSymbol(s.symbol)
      if (!symbol) return null
      return { symbol, name: String(s.name || symbol) }
    })
    .filter(Boolean)
    .slice(0, 40)
  if (config.stocks.length === 0) config.stocks = DEFAULT_STOCKS.slice(0, 3)
}

function save() {
  sanitize()
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true })
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify(config, null, 2), 'utf8')
  } catch (e) {
    console.error('save config failed', e)
  }
  return config
}

function get() {
  if (!config) load()
  return config
}

function update(patch) {
  config = Object.assign(get(), patch || {})
  return save()
}

module.exports = { load, get, save, update, normalizeSymbol, DEFAULT_CONFIG }
