'use strict'

const viewport = document.getElementById('viewport')
const track = document.getElementById('track')
const groupA = document.getElementById('groupA')
const groupB = document.getElementById('groupB')
const slotA = document.getElementById('slotA')
const slotB = document.getElementById('slotB')
const shell = document.getElementById('shell')
const prog = document.getElementById('prog')
const measureEl = document.getElementById('measure')
const emptyEl = document.getElementById('empty')
const warnEl = document.getElementById('warn')

const SWAP_MS = 640        // 内容切换过渡时长，与 CSS 保持一致

let cfg = { opacity: 0.86, scrollSpeed: 55, carouselInterval: 6, displayMode: 'carousel' }
let quotes = []
let quoteMap = new Map()

let mode = 'carousel'
let placing = false

/* 滚动模式状态 */
let baseHTML = ''
let renderedSig = ''
let groupW = 0
let offset = 0
let last = 0
let speed = 55

/* 轮播模式状态 */
let activeSlot = slotA
let idleSlot = slotB
let carIndex = 0
let carTimer = null
let lastSentWidth = -1
let lastCarInterval = null
let swapToken = 0
let lastSwitchAt = 0   // 上次切换时间：切换后短暂静默，避免刷新脉冲和切换动画挤在一起

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

function chgText(q, cls) {
  const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : ''
  return `${arrow ? `<i class="arr">${arrow}</i>` : ''}${q.pct > 0 ? '+' : ''}${q.pct.toFixed(2)}%`
}

/** 一行内容（不含背景），轮播时用 */
function itemInner(q, cls) {
  return (
    `<span class="nm">${esc(q.name)}</span>` +
    `<span class="pr">${esc(fmtPrice(q))}</span>` +
    `<span class="chg">${chgText(q, cls)}</span>`
  )
}

function itemHTML(q) {
  const cls = clsFor(q.pct)
  return `<div class="item ${cls}" data-symbol="${esc(q.symbol)}">${itemInner(q, cls)}</div>`
}

/** 滚动模式用的完整气泡（自带背景） */
function pillHTML(q) {
  const cls = clsFor(q.pct)
  return `<div class="pill ${cls}" data-symbol="${esc(q.symbol)}">${itemInner(q, cls)}</div>`
}

function pulse(el) {
  el.classList.add('pulse')
  setTimeout(() => el.classList.remove('pulse'), 560)
}

/** 就地更新价格/涨跌（.pill 与 .item 通用）。刷新不该抢镜：刚切过来的一瞬间不闪。 */
function updateQuoteEl(el, q) {
  const cls = clsFor(q.pct)
  if (el.dataset.pct !== cls) {
    el.classList.remove('up', 'down', 'flat')
    el.classList.add(cls)
    el.dataset.pct = cls
  }
  const pr = el.querySelector('.pr')
  const chg = el.querySelector('.chg')
  const nm = el.querySelector('.nm')
  const priceTxt = fmtPrice(q)
  if (pr && pr.textContent !== priceTxt) {
    pr.textContent = priceTxt
    // stale = 这一笔是沿用的旧数据，不值得闪
    if (!q.stale && Date.now() - lastSwitchAt > 1300) pulse(el)
  }
  const t = chgText(q, cls)
  if (chg && chg.innerHTML !== t) chg.innerHTML = t
  if (nm && nm.textContent !== q.name) nm.textContent = q.name
}

/* ------------------------------------------------------------ 滚动模式 */

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

function updateScrollFields() {
  quoteMap = new Map(quotes.map((q) => [String(q.symbol).toLowerCase(), q]))
  track.querySelectorAll('.pill').forEach((el) => {
    const q = quoteMap.get(String(el.dataset.symbol || '').toLowerCase())
    if (q) updateQuoteEl(el, q)
  })
}

/* ------------------------------------------------------------ 轮播模式 */

function setShellAccent(q) {
  const cls = clsFor(q.pct)
  if (!shell.classList.contains(cls)) {
    shell.classList.remove('up', 'down', 'flat')
    shell.classList.add(cls)
  }
}

/** 进度条重来一遍（挂在外壳上，位置始终不动） */
function restartProgress() {
  const dur = Math.max(1, Number(cfg.carouselInterval) || 6)
  prog.style.setProperty('--dur', dur + 's')
  prog.classList.remove('run')
  void prog.offsetWidth
  prog.classList.add('run')
}

/** 首次渲染 / 重置（无过渡） */
function renderCarousel() {
  if (quotes.length === 0) return
  if (carIndex >= quotes.length || carIndex < 0) carIndex = 0
  const q = quotes[carIndex]
  activeSlot.innerHTML = itemHTML(q)
  activeSlot.classList.remove('leaving')
  activeSlot.classList.add('on')
  idleSlot.classList.remove('on', 'leaving')
  idleSlot.innerHTML = ''
  setShellAccent(q)
  restartProgress()
}

/** 切换：外壳不动，旧内容向上淡出、新内容自下浮入（交叉过渡） */
function switchTo(i) {
  if (quotes.length === 0) return
  const idx = ((i % quotes.length) + quotes.length) % quotes.length
  const q = quotes[idx]
  if (!q) return

  const outSlot = activeSlot
  const inSlot = idleSlot

  inSlot.innerHTML = itemHTML(q)
  inSlot.classList.remove('on', 'leaving')
  void inSlot.offsetWidth // 让浏览器先认下"起始态"，过渡才会生效
  inSlot.classList.add('on')

  outSlot.classList.remove('on')
  outSlot.classList.add('leaving')

  setShellAccent(q)
  restartProgress()
  lastSwitchAt = Date.now()

  activeSlot = inSlot
  idleSlot = outSlot
  carIndex = idx

  // 过渡结束后清掉退场的那一份内容
  const token = ++swapToken
  setTimeout(() => {
    if (token !== swapToken) return
    outSlot.innerHTML = ''
    outSlot.classList.remove('leaving', 'on')
  }, SWAP_MS + 80)
}

function startCarouselTimer() {
  if (carTimer) {
    clearInterval(carTimer)
    carTimer = null
  }
  if (mode !== 'carousel' || quotes.length < 2) return
  const ms = Math.max(1, Number(cfg.carouselInterval) || 6) * 1000
  carTimer = setInterval(() => switchTo(carIndex + 1), ms)
}

/**
 * 量出最长的一只气泡有多宽，让窗口（也就是外壳）一次固定成这个宽度。
 * 之后切换股票时宽度不变 —— 这是"气泡不动"的关键。
 * 带迟滞：只在明显变宽时才扩，避免价格数字变化导致窗口反复微调。
 */
function reportWidth(force) {
  if (mode !== 'carousel' || quotes.length === 0) return
  measureEl.innerHTML = quotes
    .map((q) => {
      const cls = clsFor(q.pct)
      return `<div class="probe"><i></i><div class="item ${cls}">${itemInner(q, cls)}</div></div>`
    })
    .join('')
  let max = 0
  Array.from(measureEl.children).forEach((el) => {
    max = Math.max(max, el.getBoundingClientRect().width)
  })
  measureEl.innerHTML = ''
  if (max <= 40) return

  const w = Math.ceil(max) + 8   // 留 8px 余量，吸收价格位数变化（如 9.99 → 10.00）
  if (lastSentWidth > 0 && !force) {
    if (w <= lastSentWidth) return          // 不变窄
    if (w - lastSentWidth < 8) return       // 小幅变宽忽略
  }
  if (Math.abs(w - lastSentWidth) < 2) return

  lastSentWidth = w
  window.api.setBarWidth(w)
}

/* ------------------------------------------------------------ 数据入口 */

function showWarn(msg) {
  if (msg) {
    warnEl.textContent = '⚠'
    warnEl.title = msg
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
    activeSlot.innerHTML = ''
    idleSlot.innerHTML = ''
    shell.classList.remove('up', 'down', 'flat')
    shell.classList.add('flat')
    showWarn(error)
    return
  }
  emptyEl.classList.remove('show')
  showWarn(error)

  const sig = quotes.map((q) => q.symbol).join(',')
  if (sig !== renderedSig) {
    renderedSig = sig
    baseHTML = quotes.map((q) => pillHTML(q)).join('')
    carIndex = 0
    if (mode === 'scroll') {
      layoutTrack()
    } else {
      renderCarousel()
      reportWidth(true)
      startCarouselTimer()
    }
  } else if (mode === 'scroll') {
    updateScrollFields()
  } else {
    quoteMap = new Map(quotes.map((q) => [String(q.symbol).toLowerCase(), q]))
    const q = quotes[carIndex]
    const el = activeSlot.querySelector('.item')
    if (q && el) {
      updateQuoteEl(el, q)
      setShellAccent(q)
    }
    // 注意：刷新只更新当前这一项的数字，
    // 不重新量宽度、不重排、不碰轮播计时 —— 刷新与切换彻底分开。
  }
}

/* ------------------------------------------------------------ 配置 */

function applyConfig() {
  document.documentElement.style.setProperty('--op', String(cfg.opacity))
  speed = Number(cfg.scrollSpeed) || 0
  const nextMode = cfg.displayMode === 'scroll' ? 'scroll' : 'carousel'
  const modeChanged = nextMode !== mode
  mode = nextMode

  document.body.classList.toggle('mode-scroll', mode === 'scroll')
  document.body.classList.toggle('mode-carousel', mode === 'carousel')
  document.body.classList.toggle('unlocked', !cfg.clickThrough)

  if (mode === 'scroll') {
    if (carTimer) {
      clearInterval(carTimer)
      carTimer = null
    }
    prog.classList.remove('run')
    if (baseHTML) layoutTrack()
  } else {
    offset = 0
    if (quotes.length) {
      const intervalChanged = lastCarInterval !== cfg.carouselInterval
      // 只有模式或间隔真的变了才重置轮播，避免调透明度之类的操作把节奏打断
      if (modeChanged || intervalChanged || !activeSlot.querySelector('.item')) {
        lastCarInterval = cfg.carouselInterval
        renderCarousel()
        startCarouselTimer()
      }
      if (modeChanged) reportWidth(true)
    }
  }
}

/* ------------------------------------------------------------ 主循环 */

function tick(t) {
  if (!last) last = t
  const dt = Math.min(0.08, (t - last) / 1000)
  last = t
  if (mode === 'scroll' && groupW > 0 && speed > 0) {
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
    const prevSig = [cfg.displayMode, cfg.carouselInterval].join('|')
    cfg = Object.assign(cfg, c)
    applyConfig()
    const nextSig = [cfg.displayMode, cfg.carouselInterval].join('|')
    if (prevSig !== nextSig && quotes.length) {
      lastSentWidth = -1
      setQuotes(quotes, '')
    }
  })

  window.api.onPlace((on) => {
    placing = !!on
    document.body.classList.toggle('placing', placing)
  })
}

let rzTimer = null
window.addEventListener('resize', () => {
  clearTimeout(rzTimer)
  rzTimer = setTimeout(() => {
    if (mode === 'scroll') layoutTrack()
    else reportWidth(false)
  }, 60)
})

init()
