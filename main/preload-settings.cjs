// 설정 창 preload — 채널은 domain:action(03 §8). 실패는 돌려받은 값으로 확인한다(PLAT-02·05).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  hotkeySet: (accel) => ipcRenderer.invoke('hotkey:set', accel),
  autostart: (on) => ipcRenderer.invoke('settings:autostart', on),
  clipboardRow: (on) => ipcRenderer.invoke('settings:clipboardRow', on), // 클립보드 한 줄(D-37)
  openScripts: () => ipcRenderer.invoke('settings:openScripts'),
  openSiblings: () => ipcRenderer.invoke('settings:openSiblings'),
  refreshLists: () => ipcRenderer.invoke('settings:refreshLists'),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  resetRanking: () => ipcRenderer.invoke('store:reset'),
  resetPosition: () => ipcRenderer.invoke('panel:resetPosition'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  icons: (paths) => ipcRenderer.invoke('icon:get', paths), // 형제 앱 설치본 아이콘(D-26) — 입력줄과 같은 캐시
  resize: (h) => ipcRenderer.send('settings:resize', h),
  close: () => ipcRenderer.send('settings:close'),
  onRefresh: (cb) => ipcRenderer.on('settings:refresh', () => cb()),
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
