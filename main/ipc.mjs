// main/ipc.mjs — 렌더러 경계. 채널은 domain:action(03 §8). 렌더러는 항목의 key만 돌려주고, 무엇을 할지는 여기가 정한다.
import { ipcMain, clipboard, shell } from 'electron';
import { platform } from './platform/index.mjs';
import { route, locate, lineCount } from './scripts.mjs';

// 스크립트 실행 → 출력 길이로 가른다(D-17). 3줄 이하 성공은 토스트(한 줄이면 복사), 그 밖은 패널이 자란다(EXT-04·05).
// 패널은 이미 숨겨진 상태다 — 긴 출력·실패일 때만 다시 보인다.
export async function runScript(ctx, { title, icon }, file) {
  const r = await ctx.sources.scripts.run(file);
  if (route(r) === 'toast') {
    const text = r.stdout.trim();
    const copied = lineCount(text) === 1;
    if (copied) clipboard.writeText(text);
    ctx.toast?.show({ title, icon, body: text, copied, ms: r.ms });
  } else {
    ctx.panel.showOutput({ title, icon, path: file, code: r.code, stdout: r.stdout, stderr: r.stderr, ms: r.ms, line: locate(r.stderr, file) });
  }
  return true; // 골랐다는 사실은 결과와 무관하게 랭킹에 남는다
}

async function runAction(ctx, item) {
  const a = item.action ?? {};
  switch (a.type) {
    case 'open-app':
      return platform.openApp(a.path);
    case 'run-script':
      return runScript(ctx, item, a.path);
    case 'copy':
      clipboard.writeText(String(a.text ?? ''));
      return true;
    case 'open-path':
      return !(await shell.openPath(a.path));
    case 'reveal': // 파일이 든 폴더를 열고 그 파일을 고른다(FILE-04) — 양 OS 공통 API
      shell.showItemInFolder(a.path);
      return true;
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

  ipcMain.handle('query:run', (_e, q, seq) => ctx.sources.query(q, seq));

  // alt=true면 보조 동작(⌘·Ctrl+Enter) — 항목에 alt가 없으면 본 동작과 같다
  async function runItem(key, alt = false) {
    const item = ctx.sources.find(key);
    if (!item) return false;
    ctx.panel.hide('run'); // 먼저 숨긴다 — 앱이 뜨는 동안 입력줄이 남아 있으면 느려 보인다
    const ok = await runAction(ctx, alt && item.alt ? { ...item, action: item.alt } : item);
    if (ok && item.source !== 'calc') ctx.store.pick(item.key, item.source); // 계산 결과는 랭킹을 타지 않는다
    return ok;
  }
  ipcMain.handle('item:run', (_e, key) => runItem(key, false));
  ipcMain.handle('item:alt', (_e, key) => runItem(key, true));

  // 출력 모드의 키(EXT-04·05): ↵ 다시 실행 · ⌘/Ctrl+↵ 스크립트 열기 · ⌘/Ctrl+C 복사
  ipcMain.handle('script:rerun', async (_e, file) => {
    const s = ctx.sources.scripts.byPath(file);
    if (!s) return false;
    ctx.panel.hide('run');
    return runScript(ctx, { title: s.name, icon: s.icon }, file);
  });
  ipcMain.handle('script:open', async (_e, file) => !(await shell.openPath(file)));
  ipcMain.handle('clip:copy', (_e, text) => { clipboard.writeText(String(text ?? '')); return true; });

  ipcMain.on('win:hide', () => ctx.panel.hide('esc'));
  ipcMain.on('panel:resize', (_e, h) => ctx.panel?.resize(Number(h) || 0));
}
