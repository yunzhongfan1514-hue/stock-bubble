'use strict'

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const storeCfg = require('./store')
const quotesApi = require('./quotes')

const BAR_HTML = path.join(__dirname, 'bar.html')
const SETTINGS_HTML = path.join(__dirname, 'settings.html')
const PRELOAD = path.join(__dirname, 'preload.js')
const ICON = path.join(__dirname, '..', 'build', 'icon.ico')
const TRAY_ICON = path.join(__dirname, '..', 'build', 'tray.png')

let barWin = null
let settingsWin = null
let tray = null
let timer = null
let lastQuotes = []
let lastError = ''
let isQuitting = false

let placeMode = false   // 定位模式：临时解除鼠标穿透，允许拖动气泡
let settingsWasMinimized = false
let contentWidth = 0    // 轮播模式由渲染层上报的内容宽度
let pendingShow = false // 等宽度上报后再显示气泡
let moveTimer = null
let placeTimeout = null

function revealBar() {
  pendingShow = false
  if (!barWin || barWin.isDestroyed()) return
  if (!storeCfg.get().visible) return
  if (placeMode) barWin.show()
  else barWin.showInactive()
}

// 气泡条是轻量界面，禁用 GPU 硬件加速以最大化兼容性（避免显卡驱动导致的崩溃/黑块）
app.disableHardwareAcceleration()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showSettings()
  })
}

/* ---------------------------------------------------------------- 窗口布局 */

function barSize(cfg) {
  const display = screen.getPrimaryDisplay()
  const h = Math.round(cfg.barHeight)
  let w
  if (cfg.displayMode === 'carousel' && contentWidth > 0) {
    // 轮播模式：窗口刚好包裹当前最大的一只气泡
    w = Math.min(900, Math.max(80, Math.round(contentWidth)))
  } else {
    w = Math.max(320, Math.round(display.workArea.width * cfg.widthRatio) - 12)
  }
  return { w, h }
}

/** 把坐标限制在显示器可见范围内，防止拖出屏幕后找不回来 */
function clampToScreen(x, y, w, h) {
  const display = screen.getDisplayNearestPoint({ x, y })
  const a = display.bounds
  const nx = Math.min(Math.max(Math.round(x), a.x - 0), a.x + a.width - Math.min(w, 60))
  const ny = Math.min(Math.max(Math.round(y), a.y - 0), a.y + a.height - Math.min(h, 18))
  return { x: nx, y: ny }
}

function computeBounds(cfg) {
  const { w, h } = barSize(cfg)

  // 自定义位置：用户拖到哪就停在哪（可以压到任务栏上）
  if (cfg.layoutMode === 'custom' && Number.isFinite(cfg.pos.x) && Number.isFinite(cfg.pos.y)) {
    const p = clampToScreen(cfg.pos.x, cfg.pos.y, w, h)
    return { x: p.x, y: p.y, width: w, height: h }
  }

  const display = screen.getPrimaryDisplay()
  const { bounds, workArea } = display
  const x = Math.round(workArea.x + (workArea.width - w) / 2)

  // 任务栏是否在屏幕底部（workArea 底边比屏幕底边高）
  const bottomTaskbarHeight = bounds.y + bounds.height - (workArea.y + workArea.height)
  let y
  if (bottomTaskbarHeight > 4) {
    y = Math.round(workArea.y + workArea.height - h - cfg.bottomGap)
  } else {
    // 任务栏在侧边/顶部或已隐藏：贴住屏幕底部
    y = Math.round(bounds.y + bounds.height - h - cfg.bottomGap)
  }
  return { x, y, width: w, height: h }
}

function layoutBar(animate = false) {
  if (!barWin || barWin.isDestroyed()) return
  if (placeMode) return // 拖动过程中不要抢位置
  const cfg = storeCfg.get()
  const b = computeBounds(cfg)
  barWin.setBounds(b, animate)
  barWin.setAlwaysOnTop(!!cfg.alwaysOnTop, 'screen-saver')
}

function applyMouseMode() {
  if (!barWin || barWin.isDestroyed()) return
  if (placeMode) {
    barWin.setIgnoreMouseEvents(false)
    return
  }
  const cfg = storeCfg.get()
  if (cfg.clickThrough) {
    barWin.setIgnoreMouseEvents(true, { forward: true })
  } else {
    barWin.setIgnoreMouseEvents(false)
  }
}

/* ------------------------------------------------------------ 定位（拖动） */

function setPlaceMode(on) {
  placeMode = !!on
  clearTimeout(placeTimeout)
  // 进了定位模式却一直没拖：90 秒后自动退出，避免气泡长期挡住鼠标
  if (placeMode) {
    placeTimeout = setTimeout(() => {
      if (placeMode) setPlaceMode(false)
    }, 90 * 1000)
  }
  if (barWin && !barWin.isDestroyed()) {
    if (placeMode) {
      if (!barWin.isVisible()) barWin.showInactive()
      barWin.setIgnoreMouseEvents(false)
      barWin.moveTop()
    } else {
      applyMouseMode()
      if (!storeCfg.get().visible && barWin.isVisible()) barWin.hide()
    }
  }
  // 定位时把设置窗口收起来，免得挡住要拖的地方
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (placeMode) {
      if (settingsWin.isVisible() && !settingsWin.isMinimized()) {
        settingsWasMinimized = true
        settingsWin.minimize()
      }
    } else if (settingsWasMinimized) {
      settingsWasMinimized = false
      settingsWin.restore()
      settingsWin.focus()
    }
  }
  sendToBar('place:mode', placeMode)
  sendToSettings('place:mode', placeMode)
  if (tray) tray.setContextMenu(buildTrayMenu())
}

function saveBarPosition(autoExit = true) {
  if (!barWin || barWin.isDestroyed()) return
  const b = barWin.getBounds()
  storeCfg.update({ layoutMode: 'custom', pos: { x: b.x, y: b.y } })
  if (autoExit) setPlaceMode(false)
  sendToSettings('config:changed', storeCfg.get())
  if (tray) tray.setContextMenu(buildTrayMenu())
}

/** 轮播模式：按内容宽度调整窗口，保持中心不动 */
function applyContentWidth(nw) {
  const cfg = storeCfg.get()
  if (!barWin || barWin.isDestroyed()) return
  if (cfg.displayMode !== 'carousel') return
  const b = barWin.getBounds()
  const display = screen.getDisplayMatching(b)
  const a = display.bounds
  let x = Math.round(b.x + b.width / 2 - nw / 2)
  x = Math.min(Math.max(x, a.x), a.x + a.width - nw)
  barWin.setBounds({ x, y: b.y, width: nw, height: b.height })
  if (cfg.layoutMode === 'custom') {
    storeCfg.update({ pos: { x, y: b.y } })
  }
}

/* ------------------------------------------------------------------ 气泡条 */

function createBarWindow() {
  const cfg = storeCfg.get()
  const b = computeBounds(cfg)
  barWin = new BrowserWindow({
    ...b,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: !!cfg.alwaysOnTop,
    hasShadow: false,
    focusable: true,
    show: false,
    roundedCorners: false,
    title: 'StockBubble',
    icon: ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  barWin.loadFile(BAR_HTML)
  barWin.once('ready-to-show', () => {
    layoutBar()
    applyMouseMode()
    if (!storeCfg.get().visible) return
    if (storeCfg.get().displayMode === 'carousel') {
      // 轮播模式要等第一笔宽度上报后再显示，避免先宽后窄闪一下
      pendingShow = true
      setTimeout(() => {
        if (pendingShow) revealBar()
      }, 1200)
    } else {
      revealBar()
    }
  })
  barWin.on('closed', () => {
    barWin = null
  })

  // 拖动时记住新位置，松手约 0.5 秒后自动保存
  barWin.on('move', () => {
    // 只有可拖动状态（定位模式，或关掉了鼠标穿透）才记录
    if (!placeMode && storeCfg.get().clickThrough) return
    clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      saveBarPosition(placeMode)
    }, 550)
  })

  // 防止被任务栏或其它窗口遮住
  barWin.setAlwaysOnTop(!!cfg.alwaysOnTop, 'screen-saver')
  barWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}

function sendToBar(channel, payload) {
  try {
    if (barWin && !barWin.isDestroyed()) {
      barWin.webContents.send(channel, payload)
    }
  } catch (e) {
    /* 渲染层可能正在重建，忽略 */
  }
}

function sendToSettings(channel, payload) {
  try {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send(channel, payload)
    }
  } catch (e) {
    /* ignore */
  }
}

/* -------------------------------------------------------------- 行情轮询 */

async function refreshQuotes() {
  const cfg = storeCfg.get()
  const stocks = Array.isArray(cfg.stocks) ? cfg.stocks : []
  const symbols = stocks.map((s) => s.symbol)
  if (symbols.length === 0) {
    lastQuotes = []
    sendToBar('quotes:update', { quotes: [], error: '' })
    return
  }

  const prev = new Map(lastQuotes.map((q) => [String(q.symbol || '').toLowerCase(), q]))

  /** 接口缺项/失败时，用上一笔数据占位，保证顺序与数量永远和自选股一致 */
  const fillMissing = (key, index) => {
    const s = stocks[index]
    const old = prev.get(key)
    if (old) return Object.assign({}, old, { name: (s && s.name) || old.name, stale: true })
    return {
      symbol: s ? s.symbol : key,
      name: (s && s.name) || key,
      code: '',
      market: '',
      price: 0,
      priceText: '',
      prevClose: 0,
      open: 0,
      change: 0,
      pct: 0,
      high: 0,
      low: 0,
      time: '',
      ts: Date.now(),
      stale: true
    }
  }

  try {
    const list = await quotesApi.fetchQuotes(symbols)

    // 用接口返回的名称回填（名称还等于代码时）
    let changed = false
    list.forEach((q) => {
      const item = stocks.find((s) => s.symbol.toLowerCase() === q.symbol.toLowerCase())
      if (item && q.name && item.name.toLowerCase() === item.symbol.toLowerCase()) {
        item.name = q.name
        changed = true
      }
    })
    if (changed) storeCfg.save()

    const got = new Map(list.map((q) => [String(q.symbol).toLowerCase(), q]))
    // 关键：始终按自选股顺序、等长返回。一次接口缺项不应该被渲染层当成
    // "自选股变了"（那会重置轮播、重启进度条），所以这里补齐而不是过滤。
    lastQuotes = stocks.map((s, i) => {
      const key = String(s.symbol).toLowerCase()
      const q = got.get(key)
      if (!q) return fillMissing(key, i)
      return Object.assign({}, q, { name: s.name || q.name, stale: false })
    })
    lastError = ''
  } catch (e) {
    lastError = e && e.message ? e.message : '行情获取失败'
    // 请求失败也保持结构不变，沿用上一笔（标记 stale，界面上不闪）
    lastQuotes = stocks.map((s, i) => fillMissing(String(s.symbol).toLowerCase(), i))
  }

  const payload = { quotes: lastQuotes, error: lastError, updatedAt: Date.now() }
  sendToBar('quotes:update', payload)
  sendToSettings('quotes:update', payload)
}

function restartTimer() {
  if (timer) clearInterval(timer)
  const cfg = storeCfg.get()
  timer = setInterval(refreshQuotes, Math.max(2, cfg.refreshInterval) * 1000)
  refreshQuotes()
}

/* ---------------------------------------------------------------- 设置窗口 */

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 600,
    height: 840,
    minWidth: 520,
    minHeight: 600,
    title: '股票气泡 · 设置',
    icon: ICON,
    backgroundColor: '#f6f7f9',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  settingsWin.setMenuBarVisibility(false)
  settingsWin.loadFile(SETTINGS_HTML)
  settingsWin.once('ready-to-show', () => {
    settingsWin.show()
    settingsWin.focus()
  })
  settingsWin.on('closed', () => {
    settingsWin = null
  })
}

function showSettings() {
  createSettingsWindow()
}

/* -------------------------------------------------------------------- 托盘 */

function trayImage() {
  try {
    const img = nativeImage.createFromPath(TRAY_ICON)
    if (!img.isEmpty()) return img
  } catch (e) {
    /* ignore */
  }
  return nativeImage.createFromPath(ICON)
}

function buildTrayMenu() {
  const cfg = storeCfg.get()
  const items = [
    {
      label: cfg.visible ? '隐藏气泡' : '显示气泡',
      click: () => {
        const next = !storeCfg.get().visible
        storeCfg.update({ visible: next })
        if (barWin && !barWin.isDestroyed()) {
          if (next) barWin.showInactive()
          else barWin.hide()
        }
        buildTrayMenu()
      }
    },
    { label: '刷新行情', click: () => refreshQuotes() },
    { type: 'separator' },
    {
      label: '显示方式',
      submenu: [
        {
          label: '轮播（单气泡循环切换）',
          type: 'radio',
          checked: cfg.displayMode !== 'scroll',
          click: () => {
            storeCfg.update({ displayMode: 'carousel' })
            broadcastConfig()
          }
        },
        {
          label: '横向滚动',
          type: 'radio',
          checked: cfg.displayMode === 'scroll',
          click: () => {
            storeCfg.update({ displayMode: 'scroll' })
            broadcastConfig()
          }
        }
      ]
    },
    {
      label: '移动气泡位置…',
      type: 'checkbox',
      checked: !!placeMode,
      click: (mi) => setPlaceMode(mi.checked)
    },
    {
      label: '气泡回到任务栏',
      enabled: cfg.layoutMode === 'custom',
      click: () => {
        storeCfg.update({ layoutMode: 'taskbar', pos: { x: null, y: null } })
        setPlaceMode(false)
        broadcastConfig()
      }
    },
    { type: 'separator' },
    {
      label: '锁定（鼠标穿透）',
      type: 'checkbox',
      checked: !!cfg.clickThrough,
      click: (mi) => {
        storeCfg.update({ clickThrough: mi.checked })
        applyMouseMode()
        sendToBar('config:changed', storeCfg.get())
        sendToSettings('config:changed', storeCfg.get())
      }
    },
    {
      label: '总在最前',
      type: 'checkbox',
      checked: !!cfg.alwaysOnTop,
      click: (mi) => {
        storeCfg.update({ alwaysOnTop: mi.checked })
        if (barWin && !barWin.isDestroyed()) barWin.setAlwaysOnTop(mi.checked, 'screen-saver')
        sendToSettings('config:changed', storeCfg.get())
      }
    },
    { type: 'separator' },
    { label: '设置…', click: () => showSettings() },
    {
      label: '打开配置文件',
      click: () => shell.showItemInFolder(path.join(app.getPath('userData'), 'config.json'))
    },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() }
  ]
  return Menu.buildFromTemplate(items)
}

function createTray() {
  tray = new Tray(trayImage())
  tray.setToolTip('股票气泡 · 双击打开设置')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => showSettings())
  tray.on('click', () => {
    if (tray && tray.popUpContextMenu) tray.popUpContextMenu()
  })
}

function quitApp() {
  isQuitting = true
  app.quit()
}

/* -------------------------------------------------------------------- IPC */

function broadcastConfig() {
  const cfg = storeCfg.get()
  layoutBar()
  applyMouseMode()
  sendToBar('config:changed', cfg)
  sendToSettings('config:changed', cfg)
  if (tray) tray.setContextMenu(buildTrayMenu())
}

ipcMain.handle('config:get', () => storeCfg.get())

ipcMain.handle('config:update', (_e, patch) => {
  const prev = storeCfg.get()
  const next = storeCfg.update(patch || {})
  broadcastConfig()
  if (prev.refreshInterval !== next.refreshInterval) restartTimer()
  if (prev.autoLaunch !== next.autoLaunch) {
    try {
      app.setLoginItemSettings({ openAtLogin: !!next.autoLaunch, path: process.execPath })
    } catch (e) {
      /* ignore */
    }
  }
  return next
})

// 渲染层上报气泡内容宽度（轮播模式窗口需要刚好包住气泡）
ipcMain.on('bar:width', (_e, w) => {
  const nw = Math.round(Number(w) || 0)
  if (!Number.isFinite(nw) || nw <= 0) return
  if (Math.abs(nw - contentWidth) < 2) return
  contentWidth = Math.min(900, Math.max(80, nw))
  const cfg = storeCfg.get()
  if (cfg.displayMode !== 'carousel') return
  applyContentWidth(contentWidth)
  if (pendingShow) revealBar()
})

ipcMain.handle('app:place-mode', (_e, on) => {
  setPlaceMode(!!on)
  return { placeMode }
})

ipcMain.handle('app:reset-position', () => {
  setPlaceMode(false)
  storeCfg.update({ layoutMode: 'taskbar', pos: { x: null, y: null } })
  broadcastConfig()
  return storeCfg.get()
})

ipcMain.handle('quotes:last', () => ({
  quotes: lastQuotes,
  error: lastError,
  updatedAt: Date.now()
}))

ipcMain.handle('quotes:refresh', async () => {
  await refreshQuotes()
  return { quotes: lastQuotes, error: lastError }
})

ipcMain.handle('stock:search', async (_e, keyword) => {
  try {
    return await quotesApi.search(keyword)
  } catch (e) {
    return []
  }
})

ipcMain.handle('stock:resolve', async (_e, input) => {
  const symbol = storeCfg.normalizeSymbol(input)
  if (!symbol) return { ok: false, message: '无法识别的代码，请输入如 600519 / 000001 / 00700 / AAPL' }
  try {
    const list = await quotesApi.fetchQuotes([symbol])
    if (!list.length) return { ok: false, message: '未查询到该代码的行情，请检查代码是否正确' }
    return { ok: true, symbol, name: list[0].name, quote: list[0] }
  } catch (e) {
    return { ok: false, message: '查询失败：' + (e.message || '网络异常') }
  }
})

ipcMain.handle('stock:add', async (_e, input) => {
  const cfg = storeCfg.get()
  const symbol = storeCfg.normalizeSymbol(input)
  if (!symbol) return { ok: false, message: '无法识别的代码' }
  if (cfg.stocks.some((s) => s.symbol.toLowerCase() === symbol.toLowerCase())) {
    return { ok: false, message: '该股票已在列表中' }
  }
  if (cfg.stocks.length >= 30) return { ok: false, message: '最多添加 30 只' }
  try {
    const list = await quotesApi.fetchQuotes([symbol])
    if (!list.length) return { ok: false, message: '未查询到该代码的行情' }
    const q = list[0]
    const stocks = cfg.stocks.concat([{ symbol: q.symbol, name: q.name }])
    storeCfg.update({ stocks })
    broadcastConfig()
    refreshQuotes()
    return { ok: true, symbol: q.symbol, name: q.name }
  } catch (e) {
    return { ok: false, message: '查询失败：' + (e.message || '网络异常') }
  }
})

ipcMain.handle('stock:remove', (_e, symbol) => {
  const cfg = storeCfg.get()
  const stocks = cfg.stocks.filter((s) => s.symbol.toLowerCase() !== String(symbol).toLowerCase())
  if (stocks.length === 0) return { ok: false, message: '至少保留一只股票' }
  storeCfg.update({ stocks })
  broadcastConfig()
  refreshQuotes()
  return { ok: true }
})

ipcMain.handle('app:quit', () => quitApp())

ipcMain.handle('app:open-config', () => {
  shell.showItemInFolder(path.join(app.getPath('userData'), 'config.json'))
})

/* -------------------------------------------------------- 快捷方式图标修复 */

/**
 * 安装目录被移动/删除后，桌面与开始菜单的快捷方式会指向不存在的图标，
 * 表现为「快捷方式没有图标」。启动时检查并修好它。
 */
function repairShortcuts() {
  if (process.platform !== 'win32') return
  // 打包后就用自己；开发态优先用已打包好的程序，否则不动用户快捷方式
  let exe = process.execPath
  if (!app.isPackaged) {
    const built = path.join(app.getAppPath(), 'release', 'win-unpacked', 'StockBubble.exe')
    if (fs.existsSync(built)) {
      exe = built
    } else {
      return
    }
  }
  const dirs = [
    path.join(app.getPath('home'), 'Desktop'),
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')
  ]
  dirs.forEach((dir) => {
    let files = []
    try {
      files = fs.readdirSync(dir).filter((f) => /\.lnk$/i.test(f))
    } catch (e) {
      return
    }
    files.forEach((f) => {
      if (!/气泡|stock\s*bubble|stockbubble/i.test(f)) return
      const lnkPath = path.join(dir, f)
      let link
      try {
        link = shell.readShortcutLink(lnkPath)
      } catch (e) {
        return
      }
      const targetMissing = !link.target || !fs.existsSync(link.target)
      const iconMissing = !!link.icon && !fs.existsSync(link.icon)
      // 指向开发用 electron.exe 也是坏链接（双击只会打开空白 Electron 窗口）
      const pointsToDev = /[\\/]electron(\.exe)?$/i.test(String(link.target || ''))
      if (!targetMissing && !iconMissing && !pointsToDev) return
      try {
        shell.writeShortcutLink(lnkPath, 'update', {
          target: exe,
          cwd: path.dirname(exe),
          icon: exe,
          iconIndex: 0,
          description: '股票气泡 · 桌面实时行情'
        })
        console.log('[shortcut] repaired', lnkPath)
      } catch (e) {
        console.error('[shortcut] repair failed', lnkPath, e.message)
      }
    })
  })
}

/* -------------------------------------------------------------- 生命周期 */

app.on('window-all-closed', () => {
  // 托盘常驻：关闭窗口（甚至关闭气泡）都不退出应用
  if (isQuitting) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  if (timer) clearInterval(timer)
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.workbuddy.stockbubble')
  storeCfg.load()
  repairShortcuts()
  createBarWindow()
  createTray()
  restartTimer()

  screen.on('display-metrics-changed', () => layoutBar())
  screen.on('display-added', () => layoutBar())
  screen.on('display-removed', () => layoutBar())

  // 自动重启行情（防止长时间运行后定时器停摆）
  setInterval(() => {
    if (!timer) restartTimer()
  }, 60 * 1000)

  // 调试：--debug-capture 截取气泡与设置页后退出
  if (process.argv.includes('--debug-capture')) {
    const dbg = (n) => path.join(__dirname, '..', 'debug', n)
    require('fs').mkdirSync(dbg(''), { recursive: true })
    setTimeout(async () => {
      try {
        console.log('[debug] capturing bar, visible=', barWin && barWin.isVisible())
        if (barWin && !barWin.isDestroyed()) {
          const img = await barWin.webContents.capturePage()
          require('fs').writeFileSync(dbg('bar.png'), img.toPNG())
          console.log('[debug] bar saved')
        }
        createSettingsWindow()
        setTimeout(async () => {
          try {
            if (settingsWin && !settingsWin.isDestroyed()) {
              const img2 = await settingsWin.webContents.capturePage()
              require('fs').writeFileSync(dbg('settings.png'), img2.toPNG())
              console.log('[debug] settings saved')
            }
          } catch (e) {
            console.error('[debug] settings capture failed', e)
          }
          quitApp()
        }, 2500)
      } catch (e) {
        console.error('[debug] bar capture failed', e)
        quitApp()
      }
    }, 4000)
  }
})

app.on('activate', () => showSettings())
