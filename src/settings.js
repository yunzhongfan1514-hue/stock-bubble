'use strict'

const $ = (id) => document.getElementById(id)
let cfg = null
let quotes = []

const fmt = (q) => {
  if (!q) return '--'
  const t = q.priceText
  if (t) return String(t)
  const v = Number(q.price)
  return Number.isFinite(v) ? v.toFixed(2) : '--'
}
const clsOf = (pct) => (pct > 0.00001 ? 'up' : pct < -0.00001 ? 'down' : 'flat')

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )

function marketLabel(symbol) {
  return String(symbol).replace(/^([a-z]{2})(.*)$/i, (_m, p, c) => p.toUpperCase() + ' ' + c.toUpperCase())
}

function renderList() {
  const list = $('list')
  if (!cfg || !cfg.stocks || cfg.stocks.length === 0) {
    list.innerHTML = '<div class="empty-row">还没有自选股，在下面输入代码添加</div>'
    return
  }
  list.innerHTML = cfg.stocks
    .map((s) => {
      const q = quotes.find((x) => String(x.symbol).toLowerCase() === s.symbol.toLowerCase())
      const cls = q ? clsOf(q.pct) : 'flat'
      const pctTxt = q ? `${q.pct > 0 ? '+' : ''}${q.pct.toFixed(2)}%` : '--'
      return `<div class="row" data-symbol="${esc(s.symbol)}">
        <div class="meta">
          <div class="nm">${esc(s.name)}</div>
          <div class="cd">${esc(marketLabel(s.symbol))}</div>
        </div>
        <div class="px ${cls}">${esc(q ? fmt(q) : '--')}</div>
        <div class="pc ${cls}">${pctTxt}</div>
        <button class="del" title="移除">×</button>
      </div>`
    })
    .join('')
}

function updatePrices() {
  document.querySelectorAll('#list .row').forEach((row) => {
    const symbol = String(row.dataset.symbol || '')
    const q = quotes.find((x) => String(x.symbol).toLowerCase() === symbol.toLowerCase())
    const px = row.querySelector('.px')
    const pc = row.querySelector('.pc')
    if (!q) {
      px.textContent = '--'
      px.className = 'px flat'
      pc.textContent = '--'
      pc.className = 'pc flat'
      return
    }
    const cls = clsOf(q.pct)
    px.textContent = fmt(q)
    px.className = 'px ' + cls
    pc.textContent = `${q.pct > 0 ? '+' : ''}${q.pct.toFixed(2)}%`
    pc.className = 'pc ' + cls
  })
}

function applyQuotes(list, error) {
  quotes = Array.isArray(list) ? list : []
  if (cfg) updatePrices()
  const t = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  $('updated').textContent = error
    ? '行情连接中断，稍后自动重试'
    : `行情更新于 ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
}

/* ------------------------------------------------------------------ 控件 */

let saveTimer = null
function savePatch(patch) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    cfg = await window.api.updateConfig(patch)
  }, 110)
}

function bindSliders() {
  const map = [
    ['carousel', 'vCarousel', (v) => `${v} 秒`, (v) => ({ carouselInterval: v })],
    ['speed', 'vSpeed', (v) => `${v} px/s`, (v) => ({ scrollSpeed: v })],
    ['height', 'vHeight', (v) => `${v} px`, (v) => ({ barHeight: v })],
    ['opacity', 'vOpacity', (v) => `${v}%`, (v) => ({ opacity: v / 100 })],
    ['width', 'vWidth', (v) => `${v}% 屏宽`, (v) => ({ widthRatio: v / 100 })],
    ['gap', 'vGap', (v) => `${v} px`, (v) => ({ bottomGap: v })],
    ['refresh', 'vRefresh', (v) => `${v} 秒`, (v) => ({ refreshInterval: v })]
  ]
  map.forEach(([id, labelId, label, toPatch]) => {
    const el = $(id)
    if (!el) return
    el.addEventListener('input', () => {
      const v = Number(el.value)
      $(labelId).textContent = label(v)
      savePatch(toPatch(v))
    })
  })
}

function bindModeSeg() {
  $('modeSeg').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-mode]')
    if (!btn) return
    const mode = btn.dataset.mode
    if (cfg.displayMode === mode) return
    cfg = await window.api.updateConfig({ displayMode: mode })
    syncSliders()
  })
}

function syncSliders() {
  const v = {
    carousel: cfg.carouselInterval,
    speed: cfg.scrollSpeed,
    height: cfg.barHeight,
    opacity: Math.round(cfg.opacity * 100),
    width: Math.round(cfg.widthRatio * 100),
    gap: cfg.bottomGap,
    refresh: cfg.refreshInterval
  }
  Object.entries(v).forEach(([id, val]) => {
    const el = $(id)
    if (el) el.value = val
  })
  $('vCarousel').textContent = `${v.carousel} 秒`
  $('vSpeed').textContent = `${v.speed} px/s`
  $('vHeight').textContent = `${v.height} px`
  $('vOpacity').textContent = `${v.opacity}%`
  $('vWidth').textContent = `${v.width}% 屏宽`
  $('vGap').textContent = `${v.gap} px`
  $('vRefresh').textContent = `${v.refresh} 秒`

  // 显示方式相关的控件按当前模式显示
  const scroll = cfg.displayMode === 'scroll'
  document.querySelectorAll('#modeSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === (scroll ? 'scroll' : 'carousel'))
  })
  $('carouselField').style.display = scroll ? 'none' : ''
  $('speedField').style.display = scroll ? '' : 'none'
  $('widthField').style.display = scroll ? '' : 'none'
  $('modeHint').textContent = scroll ? '多只股票横向滚动' : '气泡不动，内容循环切换'

  // 位置状态
  const custom = cfg.layoutMode === 'custom'
  $('posHint').textContent = custom ? '已使用自定义位置' : '贴在任务栏上方居中'
  $('gapField').style.display = custom ? 'none' : ''

  $('swClick').classList.toggle('on', !!cfg.clickThrough)
  $('swTop').classList.toggle('on', !!cfg.alwaysOnTop)
  $('swAuto').classList.toggle('on', !!cfg.autoLaunch)
}

function bindSwitches() {
  const toggle = (id, key) => {
    $(id).addEventListener('click', async () => {
      const next = !cfg[key]
      cfg = await window.api.updateConfig({ [key]: next })
      syncSliders()
    })
  }
  toggle('swClick', 'clickThrough')
  toggle('swTop', 'alwaysOnTop')
  toggle('swAuto', 'autoLaunch')
}

function bindPosition() {
  const placeBtn = $('placeBtn')

  const setPlacing = (on) => {
    placeBtn.classList.toggle('on', on)
    placeBtn.textContent = on ? '完成定位' : '拖动定位气泡'
    $('posMsg').textContent = on
      ? '气泡已解锁：按住它拖到任意位置（可以压到任务栏上），松手后自动保存并重新锁定。'
      : '点击「拖动定位气泡」后，把气泡拖到桌面任意位置（也能压到任务栏上），松手自动保存。'
  }

  placeBtn.addEventListener('click', async () => {
    const on = !placeBtn.classList.contains('on')
    const res = await window.api.setPlaceMode(on)
    setPlacing(!!res.placeMode)
  })

  $('resetPosBtn').addEventListener('click', async () => {
    cfg = await window.api.resetPosition()
    setPlacing(false)
    syncSliders()
  })

  window.api.onPlace((on) => setPlacing(!!on))
}

function setMsg(text, type) {
  const el = $('msg')
  el.textContent = text || ''
  el.className = 'msg' + (type ? ' ' + type : '')
  if (text) {
    clearTimeout(setMsg._t)
    setMsg._t = setTimeout(() => {
      el.textContent = ''
      el.className = 'msg'
    }, 3500)
  }
}

let adding = false
async function addStock() {
  if (adding) return
  const input = $('addInput')
  const raw = input.value.trim()
  if (!raw) return
  adding = true
  $('addBtn').disabled = true
  setMsg('查询中…', '')
  const res = await window.api.addStock(raw)
  adding = false
  $('addBtn').disabled = false
  if (res.ok) {
    input.value = ''
    setMsg(`已添加 ${res.name}（${res.symbol.toUpperCase()}）`, 'ok')
    cfg = await window.api.getConfig()
    renderList()
    applyQuotes(quotes, '')
  } else {
    setMsg(res.message || '添加失败', 'err')
  }
}

async function boot() {
  cfg = await window.api.getConfig()
  bindSliders()
  bindModeSeg()
  bindSwitches()
  bindPosition()
  syncSliders()
  renderList()

  const snap = await window.api.getQuotes()
  applyQuotes(snap.quotes, snap.error)

  window.api.onQuotes((p) => applyQuotes(p.quotes, p.error))
  window.api.onConfig((c) => {
    cfg = c
    syncSliders()
    renderList()
  })

  $('addBtn').addEventListener('click', addStock)
  $('addInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addStock()
  })

  $('list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.del')
    if (!btn) return
    const row = btn.closest('.row')
    const symbol = row.dataset.symbol
    const res = await window.api.removeStock(symbol)
    if (!res.ok) {
      setMsg(res.message || '删除失败', 'err')
      return
    }
    cfg = await window.api.getConfig()
    renderList()
    applyQuotes(quotes, '')
    setMsg('已移除', 'ok')
  })

  $('quitBtn').addEventListener('click', async () => {
    await window.api.quit()
  })
}

boot()
