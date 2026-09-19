// main/lifecycle.mjs — 앱 수명·트레이·전역 단축키·창 소유. 형제 앱 lifecycle.mjs의 뼈대를 따르되 이 앱 것으로 썼다(D-14).
// OS 분기는 여기 없다 — 전부 platform이 안다(PLAT-01).
import { app, Tray, Menu, globalShortcut, Notification } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from './platform/index.mjs';
import { createSettings } from './settings.mjs';
import { createStore } from './store.mjs';
import { createSources } from './sources/index.mjs';
import { createPanel } from './panel.mjs';
import { registerIpc } from './ipc.mjs';

const APP_ID = 'com.when630.whencommand';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function bootstrap() {
  // 두 번째 인스턴스는 첫 인스턴스의 입력줄을 띄우고 물러난다 — 트레이에서 못 찾고 다시 실행하는 경우가 그 자리다
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  platform.prepareApp(app, { appId: APP_ID });

  const ctx = { root: ROOT, quitting: false, panel: null, tray: null, hotkey: null, hotkeyOk: false };

  app.on('second-instance', () => ctx.panel?.show());
  app.on('window-all-closed', () => {}); // 창이 닫혀도 트레이에 남는다(PANEL-11)
  app.on('before-quit', () => { ctx.quitting = true; });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    ctx.settings?.flush();
    ctx.store?.close();
  });

  app.whenReady().then(async () => {
    const userData = app.getPath('userData');
    ctx.settings = createSettings(path.join(userData, 'settings.json'));
    ctx.store = createStore(path.join(userData, 'whencommand.db'));
    ctx.sources = createSources(ctx);
    ctx.panel = createPanel(ctx);
    registerIpc(ctx);

    bindHotkey(ctx);
    makeTray(ctx);

    await ctx.sources.ready(); // 앱 목록 — 실측 ~100ms(8 병렬). 단축키는 이미 살아 있다
    if (process.argv.includes('--smoke')) return smoke(ctx);
    firstRun(ctx);
  });
}

// `npm run smoke` — 사람 손 없이 끝까지 한 번 돈다(형제 앱 관례). 질의 몇 개를 돌려 찍고, 패널을 띄워
// 렌더링을 PNG로 캡처한 뒤 끝낸다. 단축키 등록 실패나 앱 0개면 1로 끝난다.
async function smoke(ctx) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  ctx.smoke = true;
  let bad = false;
  const n = ctx.sources.appCount();
  console.log(`smoke: 앱 ${n}개 · 단축키 ${ctx.hotkey} ${ctx.hotkeyOk ? 'ok' : 'FAIL'}${ctx.hotkeyConflict ? ` · 충돌 ${ctx.hotkeyConflict.app}` : ''}`);
  if (!n || !ctx.hotkeyOk) bad = true;
  for (const q of ['', 'ㅋㄹ', 'chrome', '초개ㅡㄷ', 'vsc', '노트', '1920*0.28', '3.5kg to lb', 'ㅁㄴㅇㄹㅁㄴㅇㄹ']) {
    const r = await ctx.sources.query(q);
    const line = r.items.slice(0, 4).map((i) => `${i.title}${i.final != null ? `(${i.final.toFixed(2)}${i.via && i.via !== 'direct' ? ',' + i.via : ''})` : ''}`).join(' · ');
    console.log(`  ${(q || '(빈 입력)').padEnd(14)} → ${line || '(0개)'}`);
  }
  ctx.panel.show();
  await sleep(500);
  // 렌더러에 질의를 넣어 그린 상태를 찍는다 — panel.js가 input 이벤트로 질의한다
  const smokeQuery = process.env.SMOKE_QUERY ?? 'chrome'; // 캡처에 넣을 질의 — 결과가 있는 화면을 찍는다
  await ctx.panel.win.webContents.executeJavaScript(`(() => { const i = document.getElementById('q'); i.value = ${JSON.stringify(smokeQuery)}; i.dispatchEvent(new Event('input')); })()`);
  await sleep(600);
  const out = process.argv[process.argv.indexOf('--smoke') + 1]?.endsWith('.png')
    ? process.argv[process.argv.indexOf('--smoke') + 1]
    : path.join(app.getPath('temp'), 'whencommand-smoke.png');
  const img = await ctx.panel.win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  console.log(`smoke: 캡처 → ${out} (${img.getSize().width}×${img.getSize().height})`);
  ctx.panel.hide('smoke');
  await sleep(200);
  process.exitCode = bad ? 1 : 0;
  app.quit();
}

function bindHotkey(ctx) {
  const accel = ctx.settings.get('hotkey', platform.defaultHotkey);
  ctx.hotkey = accel;
  ctx.hotkeyOk = globalShortcut.register(accel, () => ctx.panel?.toggle());
  // 실측 #1·#4: register()가 true여도 Spotlight가 켜져 있으면 둘이 함께 뜬다 — 반환값은 충돌을 말해 주지 않는다.
  // 시스템 설정을 읽어 충돌을 따로 본다(PLAT-03). 오픈이슈 #6(뒤늦게 뺏김)은 v1에서 다루지 않는다.
  ctx.hotkeyConflict = platform.hotkeyConflict(accel);
}

function makeTray(ctx) {
  const tray = new Tray(platform.trayImage(ctx.root));
  tray.setToolTip(`WHENCOMMAND — ${platform.hotkeyLabel(ctx.hotkey)}`);
  const menu = () =>
    Menu.buildFromTemplate([
      { label: '부르기', accelerator: ctx.hotkey, click: () => ctx.panel?.toggle() },
      { type: 'separator' },
      {
        label: '앱 목록 새로고침',
        click: async () => {
          const n = await ctx.sources.refresh();
          tray.setToolTip(`WHENCOMMAND — 앱 ${n}개`);
        },
      },
      { type: 'separator' },
      { label: 'WHENCOMMAND 종료', role: 'quit' },
    ]);
  tray.setContextMenu(menu());
  tray.on('click', () => ctx.panel?.toggle()); // Windows 습관 — 왼쪽 클릭으로도 부른다
  ctx.tray = tray;
}

// 첫 실행 안내(PLAT-07) — 아이콘이 어디 있는지가 먼저, 그다음 단축키. Spotlight가 ⌘Space를 쥐고 있으면 그것도(PLAT-03).
function firstRun(ctx) {
  if (ctx.settings.get('firstRunDone')) return;
  ctx.settings.set('firstRunDone', true);
  if (!Notification.isSupported()) return;
  const label = platform.hotkeyLabel(ctx.hotkey);
  const hint = platform.firstRunHint(label);
  let body = hint.body;
  if (!ctx.hotkeyOk) body += `\n${label} 를 등록하지 못했습니다 — 다른 앱이 쓰고 있습니다.`;
  else if (ctx.hotkeyConflict) body += `\n${label} 는 ${ctx.hotkeyConflict.app}도 쓰고 있어 둘이 함께 뜹니다. ${ctx.hotkeyConflict.howTo}.`;
  new Notification({ title: hint.title, body }).show();
}
