// 샌드박스 preload — ESM을 쓸 수 없으므로 CJS로 둔다(형제 앱 동일).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('whencommand', {
  init: () => ipcRenderer.invoke('app:init'),
  query: (q, seq) => ipcRenderer.invoke('query:run', q, seq),
  onMore: (cb) => ipcRenderer.on('query:more', (_e, r) => cb(r)), // 느린 공급원의 늦은 합류(D-11)
  icons: (paths) => ipcRenderer.invoke('icon:get', paths), // 보이는 줄의 앱·파일 아이콘(LNCH-04)
  painted: () => ipcRenderer.send('panel:painted'), // panel:shown 뒤 빈 입력줄을 그렸다 — 메인이 그때 창을 보인다(D-30)
  run: (key) => ipcRenderer.invoke('item:run', key),
  alt: (key) => ipcRenderer.invoke('item:alt', key), // ⌘·Ctrl+Enter — 보조 동작(파일이 든 폴더 열기 등)
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
