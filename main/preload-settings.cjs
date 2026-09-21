// 설정 창 preload — 채널은 domain:action(03 §8). 실패는 돌려받은 값으로 확인한다(PLAT-02·05).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  hotkeySet: (accel) => ipcRenderer.invoke('hotkey:set', accel),
  autostart: (on) => ipcRenderer.invoke('settings:autostart', on),
  openScripts: () => ipcRenderer.invoke('settings:openScripts'),
  openSiblings: () => ipcRenderer.invoke('settings:openSiblings'),
  refreshLists: () => ipcRenderer.invoke('settings:refreshLists'),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  resetRanking: () => ipcRenderer.invoke('store:reset'),
  resetPosition: () => ipcRenderer.invoke('panel:resetPosition'),
  resize: (h) => ipcRenderer.send('settings:resize', h),
  close: () => ipcRenderer.send('settings:close'),
  onRefresh: (cb) => ipcRenderer.on('settings:refresh', () => cb()),
});
