'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (patch) => ipcRenderer.invoke('config:update', patch),
  getQuotes: () => ipcRenderer.invoke('quotes:last'),
  refreshQuotes: () => ipcRenderer.invoke('quotes:refresh'),
  searchStock: (kw) => ipcRenderer.invoke('stock:search', kw),
  resolveStock: (input) => ipcRenderer.invoke('stock:resolve', input),
  addStock: (input) => ipcRenderer.invoke('stock:add', input),
  removeStock: (symbol) => ipcRenderer.invoke('stock:remove', symbol),
  quit: () => ipcRenderer.invoke('app:quit'),
  openConfig: () => ipcRenderer.invoke('app:open-config'),
  setBarWidth: (w) => ipcRenderer.send('bar:width', w),
  setPlaceMode: (on) => ipcRenderer.invoke('app:place-mode', on),
  resetPosition: () => ipcRenderer.invoke('app:reset-position'),
  onPlace: (cb) => {
    const handler = (_e, on) => cb(on)
    ipcRenderer.on('place:mode', handler)
    return () => ipcRenderer.removeListener('place:mode', handler)
  },
  onQuotes: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('quotes:update', handler)
    return () => ipcRenderer.removeListener('quotes:update', handler)
  },
  onConfig: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('config:changed', handler)
    return () => ipcRenderer.removeListener('config:changed', handler)
  }
})
