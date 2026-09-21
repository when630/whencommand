// main/ipc.mjs — 렌더러 경계. 채널은 domain:action(03 §8). 렌더러는 항목의 key만 돌려주고, 무엇을 할지는 여기가 정한다.
import { ipcMain, clipboard, shell } from 'electron';
import { platform } from './platform/index.mjs';

async function runAction(ctx, item) {
  const a = item.action ?? {};
  switch (a.type) {
    case 'open-app':
      return platform.openApp(a.path);
    case 'copy':
      clipboard.writeText(String(a.text ?? ''));
      return true;
    case 'open-path':
      return !(await shell.openPath(a.path));
    case 'open-url':
      await shell.openExternal(a.url);
      return true;
    default:
      return false;
  }
}

export function registerIpc(ctx) {
  ipcMain.handle('app:init', () => ({
    platform: platform.name,
    hotkey: ctx.hotkey,
    hotkeyLabel: platform.hotkeyLabel(ctx.hotkey),
    hotkeyOk: ctx.hotkeyOk,
    appCount: ctx.sources.appCount(),
  }));

  ipcMain.handle('query:run', (_e, q) => ctx.sources.query(q));

  ipcMain.handle('item:run', async (_e, key) => {
    const item = ctx.sources.find(key);
    if (!item) return false;
    ctx.panel.hide('run'); // 먼저 숨긴다 — 앱이 뜨는 동안 입력줄이 남아 있으면 느려 보인다
    const ok = await runAction(ctx, item);
    if (ok && item.source !== 'calc') ctx.store.pick(item.key, item.source); // 계산 결과는 랭킹을 타지 않는다
    return ok;
  });

  ipcMain.on('win:hide', () => ctx.panel.hide('esc'));
  ipcMain.on('panel:resize', (_e, h) => ctx.panel?.resize(Number(h) || 0));
}
