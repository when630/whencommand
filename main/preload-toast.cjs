// 토스트 창 preload — 받는 채널 하나뿐이다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toast', {
  onShow: (cb) => ipcRenderer.on('toast:show', (_e, payload) => cb(payload)),
});
