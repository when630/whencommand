// 샌드박스 preload — ESM을 쓸 수 없으므로 CJS로 둔다(형제 앱 동일).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('whencommand', {
  init: () => ipcRenderer.invoke('app:init'),
  query: (q) => ipcRenderer.invoke('query:run', q),
  run: (key) => ipcRenderer.invoke('item:run', key),
  hide: () => ipcRenderer.send('win:hide'),
  resize: (h) => ipcRenderer.send('panel:resize', h),
  onShown: (cb) => ipcRenderer.on('panel:shown', () => cb()),
  onHidden: (cb) => ipcRenderer.on('panel:hidden', (_e, why) => cb(why)),
  // 스크립트 출력 모드(EXT-04·05)
  onOutput: (cb) => ipcRenderer.on('script:output', (_e, payload) => cb(payload)),
  rerun: (path) => ipcRenderer.invoke('script:rerun', path),
  openScript: (path) => ipcRenderer.invoke('script:open', path),
  copy: (text) => ipcRenderer.invoke('clip:copy', text),
});
