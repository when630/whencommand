// main/ipc.mjs — 렌더러 경계. 채널은 domain:action(03 §8). 렌더러는 항목의 key만 돌려주고, 무엇을 할지는 여기가 정한다.
import { app, ipcMain, clipboard, shell, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import { platform } from './platform/index.mjs';
import { route, locate, lineCount } from './scripts.mjs';
import { SCRIPTS_DIR } from './sources/scripts.mjs';
import { APPS_DIR } from './sources/siblings.mjs';
import { usageOf } from './manifest.mjs';
import { updateLine } from './update.mjs';

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
    case 'open-settings':
      ctx.settingsWin?.show();
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
  ipcMain.handle('icon:get', (_e, paths) => ctx.icons.get(paths)); // 화면에 보이는 줄의 아이콘만(LNCH-04, D-23)

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

  // ── 설정 창(D-16). 실패는 돌려받은 값으로 확인해 돌려준다(PLAT-02·05) — 화면이 그 값을 그대로 적는다
  ipcMain.handle('settings:get', () => {
    const sib = ctx.sources.siblings;
    return {
      platform: platform.name,
      version: app.getVersion(),
      packaged: app.isPackaged,
      hotkey: ctx.hotkey,
      hotkeyLabel: platform.hotkeyLabel(ctx.hotkey),
      hotkeyOk: ctx.hotkeyOk,
      hotkeyConflict: ctx.hotkeyConflict,
      openAtLogin: app.isPackaged ? platform.getLoginItem(app) : false,
      scripts: { dir: SCRIPTS_DIR, count: ctx.sources.scripts.count() },
      siblings: {
        dir: APPS_DIR,
        exists: fs.existsSync(APPS_DIR),
        // 명령마다 사용법 한 줄(D-25) — 설정 창이 캡션 뒤에 접어 둔다. 렌더러는 문구를 만들지 않는다
        apps: sib.apps().map((m) => ({
          id: m.id,
          name: m.name,
          icon: m.name.replace(/^when/i, '')[0]?.toUpperCase() ?? '?',
          path: m.path || null, // 설치본 경로 — 설정 창이 icon:get으로 실제 아이콘을 받는다(D-26)
          commands: m.commands.map((c) => ({ id: c.id, ...usageOf(c) })),
        })),
        skipped: sib.skipped().map((s) => ({ file: s.file.split(/[\\/]/).pop(), error: s.error })),
      },
      store: { file: ctx.store.file },
      update: { ...(ctx.update ?? { status: 'idle' }), line: updateLine(ctx.update ?? {}, { canAutoUpdate: platform.canAutoUpdate, current: app.getVersion() }), canAutoUpdate: platform.canAutoUpdate },
    };
  });

  // ── 업데이트(REL-02, whenwork 승계). Windows는 설치(재시작), 미서명 macOS는 받는 곳 열기 — 돌려주는 값이 그 차이를 말한다
  ipcMain.handle('update:check', async () => {
    const st = await (ctx.checkForUpdate?.() ?? Promise.resolve(ctx.update ?? { status: 'idle' }));
    return { ok: true, ...st, line: updateLine(st ?? {}, { canAutoUpdate: platform.canAutoUpdate, current: app.getVersion() }) };
  });
  ipcMain.handle('update:install', () => ({ ok: true, installing: !!ctx.installUpdate?.() }));

  // PLAT-02: 새 조합의 등록 성공까지 확인한다. 실패하면 저장하지 않고 이전 조합으로 되돌린다 —
  // 저장해 두면 다음 실행에서도 안 잡히는 조합으로 조용히 시작한다.
  ipcMain.handle('hotkey:set', (_e, accel) => {
    const next = String(accel ?? '').trim();
    if (!next) return { ok: false, error: '조합이 비어 있습니다' };
    const prev = ctx.hotkey;
    if (ctx.applyHotkey(next)) {
      ctx.settings.set('hotkey', next);
      ctx.settings.flush();
      return { ok: true, hotkey: next, label: platform.hotkeyLabel(next) };
    }
    ctx.applyHotkey(prev);
    return { ok: false, error: `${platform.hotkeyLabel(next)} 를 등록하지 못했습니다 — 다른 앱이 쓰고 있거나 잘못된 조합입니다. 이전 조합을 유지합니다` };
  });

  // PLAT-05: 켠 뒤 실제로 켜졌는지 되읽는다 — 미서명 앱에서 조용히 실패한다
  ipcMain.handle('settings:autostart', (_e, on) => {
    if (!app.isPackaged) return { ok: false, error: '개발 실행에서는 켤 수 없습니다' };
    const ok = platform.setLoginItem(app, !!on);
    if (ok) ctx.settings.set('openAtLogin', !!on);
    return { ok, openAtLogin: platform.getLoginItem(app) };
  });

  ipcMain.handle('settings:openScripts', async () => !(await shell.openPath(SCRIPTS_DIR)));
  ipcMain.handle('settings:openSiblings', async () => {
    try { fs.mkdirSync(APPS_DIR, { recursive: true }); } catch {}
    return !(await shell.openPath(APPS_DIR));
  });
  ipcMain.handle('settings:refreshLists', () => ctx.sources.refresh());
  ipcMain.handle('panel:resetPosition', () => { ctx.panel?.resetPosition(); return true; });
  ipcMain.handle('store:reset', () => { try { ctx.store.reset(); return { ok: true }; } catch { return { ok: false }; } }); // STOR-03

  // STOR-04: 설정만 — 단축키·자동 실행·입력줄 위치. 랭킹은 기기마다 다른 데이터라 담지 않는다
  const EXPORT_KEYS = ['hotkey', 'openAtLogin', 'panel.pos'];
  ipcMain.handle('settings:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    try {
      const res = await dialog.showSaveDialog(win, {
        title: '설정 내보내기',
        defaultPath: `whencommand-settings-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      const settings = {};
      for (const k of EXPORT_KEYS) { const v = ctx.settings.get(k); if (v != null) settings[k] = v; }
      fs.writeFileSync(res.filePath, JSON.stringify({ app: 'whencommand', version: app.getVersion(), settings }, null, 2), 'utf8');
      return { ok: true, path: res.filePath };
    } catch {
      return { ok: false, error: '내보내기에 실패했습니다' };
    } finally {
      win?.focus();
    }
  });
  ipcMain.handle('settings:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    try {
      const res = await dialog.showOpenDialog(win, { title: '설정 가져오기', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
      if (res.canceled || !res.filePaths?.[0]) return { ok: false, canceled: true };
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8').replace(/^﻿/, '')); } catch { return { ok: false, error: 'JSON 파일이 아닙니다' }; }
      if (parsed?.app !== 'whencommand' || typeof parsed.settings !== 'object') return { ok: false, error: 'WHENCOMMAND 설정 파일이 아닙니다' };
      const s = parsed.settings;
      let hotkeyFailed = null;
      if (typeof s.hotkey === 'string' && s.hotkey && s.hotkey !== ctx.hotkey) {
        const prev = ctx.hotkey;
        if (ctx.applyHotkey(s.hotkey)) ctx.settings.set('hotkey', s.hotkey);
        else { ctx.applyHotkey(prev); hotkeyFailed = platform.hotkeyLabel(s.hotkey); }
      }
      if (s['panel.pos'] && Number.isFinite(s['panel.pos'].x) && Number.isFinite(s['panel.pos'].y)) ctx.settings.set('panel.pos', { x: s['panel.pos'].x, y: s['panel.pos'].y });
      if (typeof s.openAtLogin === 'boolean' && app.isPackaged && platform.setLoginItem(app, s.openAtLogin)) ctx.settings.set('openAtLogin', s.openAtLogin);
      ctx.settings.flush();
      return { ok: true, hotkeyFailed };
    } catch {
      return { ok: false, error: '가져오기에 실패했습니다' };
    } finally {
      win?.focus();
    }
  });
  ipcMain.on('settings:resize', (_e, h) => ctx.settingsWin?.resize(Number(h) || 0));
  ipcMain.on('settings:close', () => ctx.settingsWin?.hide());

  ipcMain.on('win:hide', () => ctx.panel.hide('esc'));
  ipcMain.on('panel:resize', (_e, h) => ctx.panel?.resize(Number(h) || 0));
}
