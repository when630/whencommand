'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('poc', {
  // 메인이 show() 직후 보낸다 → 렌더러는 두 프레임 뒤 페인트 시각을 돌려준다 (#6)
  onShown: (fn) => ipcRenderer.on('shown', () => fn()),
  painted: (t) => ipcRenderer.send('painted', t),
  onStats: (fn) => ipcRenderer.on('stats', (_e, s) => fn(s)),
  hide: () => ipcRenderer.send('hide'),
  typed: (n) => ipcRenderer.send('typed', n)   // 활성화 없이 키 입력이 들어오는지 (#7)
})
