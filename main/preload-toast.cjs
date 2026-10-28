// 토스트 창 preload — 받는 채널 하나뿐이다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toast', {
  onShow: (cb) => ipcRenderer.on('toast:show', (_e, payload) => cb(payload)),
});

// Appearance is stored by the main process and broadcast to every app window.
contextBridge.exposeInMainWorld('whenAppearance', {
  initial: ipcRenderer.sendSync('appearance:get'),
  set: (patch) => ipcRenderer.invoke('appearance:set', patch),
  onChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('appearance:changed', listener);
    return () => ipcRenderer.removeListener('appearance:changed', listener);
  },
});
