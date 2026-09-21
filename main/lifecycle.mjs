// main/lifecycle.mjs — 앱 수명·트레이·전역 단축키·창 소유. 형제 앱 lifecycle.mjs의 뼈대를 따르되 이 앱 것으로 썼다(D-14).
// OS 분기는 여기 없다 — 전부 platform이 안다(PLAT-01).
import { app, Tray, Menu, globalShortcut, Notification, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from './platform/index.mjs';
import { createSettings } from './settings.mjs';
import { createStore } from './store.mjs';
import { createSources } from './sources/index.mjs';
import { createPanel } from './panel.mjs';
import { createToast } from './toast.mjs';
import { createSettingsWin } from './settings-win.mjs';
import { createIconCache } from './icons.mjs';
import { initLog, log, traceQuit } from './log.mjs';
import { setupUpdater, updateLine } from './update.mjs';
import { registerIpc, runScript } from './ipc.mjs';
import { SCRIPTS_DIR } from './sources/scripts.mjs';

const APP_ID = 'com.when630.whencommand';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function bootstrap() {
  initLog(path.join(app.getPath('userData'), 'whencommand.log'));
  traceQuit(app);
  // 두 번째 인스턴스는 첫 인스턴스의 입력줄을 띄우고 물러난다 — 트레이에서 못 찾고 다시 실행하는 경우가 그 자리다
  if (!app.requestSingleInstanceLock()) {
    log('두 번째 인스턴스 — 물러난다', process.argv);
    app.quit();
    return;
  }
  platform.prepareApp(app, { appId: APP_ID });
  log(`시작 pid=${process.pid} ${app.isPackaged ? '설치본' : '개발'} ${app.getVersion()}`, process.argv.slice(1));

  const ctx = { root: ROOT, quitting: false, panel: null, tray: null, hotkey: null, hotkeyOk: false };

  app.on('second-instance', (_e, argv) => { log('second-instance', argv); ctx.panel?.show(); });
  app.on('window-all-closed', () => log('window-all-closed')); // 창이 닫혀도 트레이에 남는다(PANEL-11)
  app.on('before-quit', () => { ctx.quitting = true; log('before-quit'); });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    ctx.settings?.flush();
    ctx.store?.close();
    ctx.sources?.files.dispose(); // Windows Search 질의 프로세스를 함께 끝낸다
  });

  app.whenReady().then(async () => {
    const userData = app.getPath('userData');
    ctx.settings = createSettings(path.join(userData, 'settings.json'));
    ctx.store = createStore(path.join(userData, 'whencommand.db'));
    ctx.sources = createSources(ctx);
    ctx.panel = createPanel(ctx);
    ctx.toast = createToast(ctx);
    ctx.settingsWin = createSettingsWin(ctx);
    ctx.icons = createIconCache();
    registerIpc(ctx);

    bindHotkey(ctx);
    makeTray(ctx);

    // 알림 한 줄 — 첫 실행 안내·업데이트 준비. 스모크에서는 띄우지 않는다
    ctx.notify = (title, body, { onClick } = {}) => {
      if (ctx.smoke || process.argv.includes('--smoke')) return true;
      try {
        if (!Notification.isSupported()) return false;
        const n = new Notification({ title, body });
        if (onClick) n.on('click', onClick);
        n.show();
        return true;
      } catch { return false; }
    };

    await ctx.sources.ready(); // 앱 목록 — 실측 ~100ms(8 병렬). 단축키는 이미 살아 있다
    // 형제 앱 아이콘만 미리 받아 둔다(D-26 보충). 다섯 개뿐인데 셸이 기본 아이콘을 주면 PowerShell 폴백이 콜드 ~800ms라,
    // 첫 질의에서 글자 상자만 보이다 바뀐다. 시작 직후 한 박자 뒤, 그리고 매니페스트가 바뀔 때마다. 앱 목록 전체는 여전히 보이는 줄만(D-23)
    ctx.warmSiblingIcons = () => setTimeout(() => ctx.icons.get(ctx.sources.siblings.apps().map((m) => m.path).filter(Boolean)).catch(() => {}), 1500);
    ctx.sources.siblings.onChange(() => ctx.warmSiblingIcons());
    ctx.warmSiblingIcons();
    setupUpdater(ctx); // 릴리스 확인 — 60초 뒤 첫 확인, 이후 하루 한 번(main/update.mjs). 개발 실행은 unsupported
    if (process.argv.includes('--check-update')) {
      // 설치본에서 업데이트 경로가 실제로 도는지 보는 모드(REL-02). 결과를 찍고 끝낸다
      const st = await ctx.checkForUpdate();
      console.log(`UPDATE_CHECK status=${st.status} version=${st.version ?? '-'} canAutoUpdate=${platform.canAutoUpdate} line=${updateLine(st, { canAutoUpdate: platform.canAutoUpdate, current: app.getVersion() })}`);
      if (st.rawError) console.log(`UPDATE_RAW ${st.rawError}`);
      ctx.quitting = true;
      return app.exit(st.status === 'error' ? 1 : 0);
    }
    if (process.argv.includes('--probe-login')) {
      // 실측 #2(PLAT-05) — 미서명 설치본에서 로그인 항목이 실제로 켜지는가. 켜고 되읽고, 끄고 되읽고, 원래대로 두고 끝낸다
      const before = platform.getLoginItem(app);
      const onOk = platform.setLoginItem(app, true);
      const readOn = platform.getLoginItem(app);
      const offOk = platform.setLoginItem(app, false);
      const readOff = platform.getLoginItem(app);
      if (before) platform.setLoginItem(app, true);
      console.log(`LOGIN_PROBE packaged=${app.isPackaged} before=${before} setOn=${onOk} readOn=${readOn} setOff=${offOk} readOff=${readOff}`);
      ctx.quitting = true;
      return app.exit(onOk && readOn && offOk && !readOff ? 0 : 1);
    }
    if (process.argv.includes('--probe-icons')) {
      // 실측 — app.getFileIcon이 주어진 실행 파일에서 실제 아이콘을 주는가, 기본 실행 파일 아이콘을 주는가.
      // ICON_PROBE_PATHS=a;b;c (없으면 형제 앱 매니페스트의 설치본 경로). 크기별 md5를 찍고 PNG를 temp에 남긴다
      const crypto = await import('node:crypto');
      const os = await import('node:os');
      const md5 = (img) => crypto.createHash('md5').update(img.toPNG()).digest('hex').slice(0, 8);
      const generic = {};
      for (const size of ['small', 'normal', 'large']) {
        try { generic[size] = md5(await app.getFileIcon(path.join(os.tmpdir(), 'zz-nonexistent-probe.exe'), { size })); } catch { generic[size] = '-'; }
      }
      console.log(`ICON_PROBE generic(없는 exe) ${JSON.stringify(generic)}`);
      const paths = process.env.ICON_PROBE_PATHS ? process.env.ICON_PROBE_PATHS.split(';') : ctx.sources.siblings.apps().map((m) => m.path).filter(Boolean);
      for (const p of paths) {
        const line = [p, fs.existsSync(p) ? 'exists' : 'MISSING'];
        for (const size of ['small', 'normal', 'large']) {
          try {
            const img = await app.getFileIcon(platform.resolveIconPath(p), { size });
            const h = md5(img);
            line.push(`${size}=${img.getSize().width}px:${h}${h === generic[size] ? '(=generic)' : ''}`);
            fs.writeFileSync(path.join(os.tmpdir(), `probe-${path.basename(p)}-${size}.png`), img.toPNG());
          } catch (e) { line.push(`${size}=ERR ${e.message}`); }
        }
        console.log('ICON_PROBE ' + line.join(' '));
      }
      // 앱이 실제로 쓰는 경로(icons.mjs — 기본 아이콘이면 platform.extractIcons 폴백)로도 한 번
      const t0 = Date.now();
      const viaCache = await ctx.icons.get(paths);
      console.log(`ICON_PROBE cache ${paths.length}개 ${Date.now() - t0}ms (콜드 — 폴백 포함)`);
      const t1 = Date.now();
      await ctx.icons.get(paths);
      console.log(`ICON_PROBE cache 재요청 ${Date.now() - t1}ms`);
      for (const p of paths) {
        const url = viaCache[p];
        const h = url ? crypto.createHash('md5').update(url).digest('hex').slice(0, 8) : 'null';
        const g = await app.getFileIcon(path.join(os.tmpdir(), 'zz-nonexistent-probe.exe'), { size: 'normal' }).then((i) => i.toDataURL()).catch(() => '');
        console.log(`ICON_PROBE cache ${path.basename(p)} ${url === g ? 'GENERIC' : 'real'} ${h} ${url ? url.length + 'B' : ''}`);
        if (url && url !== g) fs.writeFileSync(path.join(os.tmpdir(), `probe-cache-${path.basename(p)}.png`), Buffer.from(url.split(',')[1], 'base64'));
      }
      ctx.quitting = true;
      return app.exit(0);
    }
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
  const sib = ctx.sources.siblings;
  console.log(`smoke: 앱 ${n}개 · 스크립트 ${ctx.sources.scripts.count()}개(${SCRIPTS_DIR}) · 형제 앱 ${sib.count()}개(${sib.apps().map((a) => `${a.name} ${a.commands.length}명령`).join(', ') || '없음'}${sib.skipped().length ? ` · 건너뜀 ${sib.skipped().map((s) => `${path.basename(s.file)}: ${s.error}`).join(' / ')}` : ''}) · 단축키 ${ctx.hotkey} ${ctx.hotkeyOk ? 'ok' : 'FAIL'}${ctx.hotkeyConflict ? ` · 충돌 ${ctx.hotkeyConflict.app}` : ''}`);
  if (!n || !ctx.hotkeyOk) bad = true;
  for (const q of ['', 'ㅋㄹ', 'chrome', '초개ㅡㄷ', 'vsc', '노트', '내 ip', '메모 검색 회의록', '퀵', '1920*0.28', '3.5kg to lb', 'ㅁㄴㅇㄹㅁㄴㅇㄹ']) {
    const r = await ctx.sources.query(q);
    const line = r.items.slice(0, 4).map((i) => `${i.app ? `${i.app}:` : ''}${i.title}${i.final != null ? `(${i.final.toFixed(2)}${i.via && i.via !== 'direct' ? ',' + i.via : ''})` : ''}${i.action?.url ? ` → ${i.action.url}` : ''}`).join(' · ');
    console.log(`  ${(q || '(빈 입력)').padEnd(14)} → ${line || '(0개)'}`);
  }
  // 아이콘(LNCH-04) — 한 화면(8줄)을 뽑는 데 얼마나 드는지. 콜드·웜 둘 다
  {
    const r = await ctx.sources.query('c', 0);
    const paths = r.items.map((i) => i.action?.path).filter(Boolean);
    let t0 = Date.now();
    const cold = {};
    for (const p of paths) { // 하나씩 — 어느 경로가 느린지 보이게
      const t = Date.now();
      Object.assign(cold, await ctx.icons.get([p]));
      const ms = Date.now() - t;
      if (ms > 100) console.log(`  icon ${ms}ms ${p}`);
    }
    const coldMs = Date.now() - t0;
    t0 = Date.now();
    await ctx.icons.get(paths);
    const got = Object.values(cold).filter(Boolean).length;
    console.log(`smoke: 아이콘 ${paths.length}개 중 ${got}개 · 콜드 ${coldMs}ms · 웜 ${Date.now() - t0}ms`);
  }
  // 파일 검색(FILE) — 늦은 공급원은 따로 기다려 본다. 색인이 없으면 그 사실이 한 줄로 나와야 한다(FILE-05)
  const fst = ctx.sources.files.status();
  console.log(`smoke: 파일 검색 ${fst.ok ? 'ok' : `불가 — ${fst.reason}`}`);
  for (const q of ['readme', '회의록', 'when630']) { // 3글자부터(FILE-03) — 2글자는 돌지 않는 게 맞다
    const t0 = Date.now();
    const more = await ctx.sources.files.late(q);
    const n = more?.length ?? 0;
    console.log(`  files ${q.padEnd(9)} → ${n}개 ${Date.now() - t0}ms${n ? ` · ${more[0].title}(${more[0].kind}) ${more[0].subtitle}` : ''}`);
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
  // SMOKE_RUN=<스크립트 경로> — 실제로 실행해 출력 분기(D-17)를 찍는다. 토스트면 토스트 창을, 패널이면 출력 모드를 캡처한다
  if (process.env.SMOKE_RUN) {
    const file = process.env.SMOKE_RUN;
    const s = ctx.sources.scripts.byPath(file);
    ctx.panel.hide('smoke');
    await runScript(ctx, { title: s?.name ?? path.basename(file), icon: s?.icon ?? '$' }, file);
    await sleep(700);
    const target = ctx.panel.isVisible() ? ctx.panel.win : ctx.toast.win;
    const shot = await target.webContents.capturePage();
    const out2 = out.replace(/\.png$/, '-run.png');
    fs.writeFileSync(out2, shot.toPNG());
    console.log(`smoke: 실행 → ${ctx.panel.isVisible() ? '패널 출력 모드' : '토스트'} · 캡처 → ${out2}`);
  }
  // SMOKE_SETTINGS=1 — 설정 창을 열어 찍는다(D-16). 형제 앱 목록·단축키 상태가 화면에 어떻게 서는지.
  // SMOKE_SETTINGS=open — 형제 앱 사용법(D-25)을 전부 펼친 채로 찍는다. 창이 상한에 걸려 스크롤되는 모양까지 본다
  if (process.env.SMOKE_SETTINGS) {
    ctx.panel.hide('smoke');
    ctx.settingsWin.show();
    await sleep(900);
    if (process.env.SMOKE_SETTINGS === 'open') {
      await ctx.settingsWin.win.webContents.executeJavaScript(`document.querySelectorAll('.sib.can:not(.open)').forEach((r) => r.click())`);
      await sleep(400);
    }
    const shot = await ctx.settingsWin.win.webContents.capturePage();
    const out3 = out.replace(/\.png$/, '-settings.png');
    fs.writeFileSync(out3, shot.toPNG());
    console.log(`smoke: 설정 창 ${shot.getSize().width}×${shot.getSize().height} · 캡처 → ${out3}`);
    ctx.settingsWin.hide();
  }
  ctx.panel.hide('smoke');
  await sleep(200);
  process.exitCode = bad ? 1 : 0;
  app.quit();
}

// 단축키 하나를 (다시) 등록한다 — 처음도, 설정에서 바꿀 때도 같은 함수(PLAT-02). 등록 결과가 ctx에 남고 트레이가 그걸 읽는다.
function applyHotkey(ctx, accel) {
  globalShortcut.unregisterAll();
  ctx.hotkey = accel;
  try {
    ctx.hotkeyOk = globalShortcut.register(accel, () => ctx.panel?.toggle()) && globalShortcut.isRegistered(accel);
  } catch {
    ctx.hotkeyOk = false; // 조합 문자열 자체가 잘못되면 register가 던진다
  }
  // 실측 #1·#4: register()가 true여도 Spotlight가 켜져 있으면 둘이 함께 뜬다 — 반환값은 충돌을 말해 주지 않는다.
  // 시스템 설정을 읽어 충돌을 따로 본다(PLAT-03). 오픈이슈 #6(뒤늦게 뺏김)은 v1에서 다루지 않는다.
  ctx.hotkeyConflict = ctx.hotkeyOk ? platform.hotkeyConflict(accel) : null;
  ctx.tray?.setToolTip(`WHENCOMMAND — ${platform.hotkeyLabel(accel)}`);
  ctx.refreshTray?.();
  return ctx.hotkeyOk;
}

function bindHotkey(ctx) {
  ctx.applyHotkey = (accel) => applyHotkey(ctx, accel);
  applyHotkey(ctx, ctx.settings.get('hotkey', platform.defaultHotkey));
}

function makeTray(ctx) {
  const tray = new Tray(platform.trayImage(ctx.root));
  tray.setToolTip(`WHENCOMMAND — ${platform.hotkeyLabel(ctx.hotkey)}`);
  const menu = () =>
    Menu.buildFromTemplate([
      { label: '부르기', accelerator: ctx.hotkey, click: () => ctx.panel?.toggle() },
      { type: 'separator' },
      {
        label: '목록 새로고침',
        click: async () => {
          const n = await ctx.sources.refresh();
          ctx.warmSiblingIcons?.();
          tray.setToolTip(`WHENCOMMAND — 앱 ${n.apps}개 · 스크립트 ${n.scripts}개`);
        },
      },
      { label: '스크립트 폴더 열기', click: () => shell.openPath(SCRIPTS_DIR) }, // EXT-06
      { label: '입력줄 위치 되돌리기', click: () => ctx.panel?.resetPosition() },
      { type: 'separator' },
      { label: '설정…', click: () => ctx.settingsWin?.show() }, // D-16
      {
        // 업데이트 상태는 늘 보인다 — 새 버전이 준비돼도 말이 없으면 영영 안 깔린다(REL-02, whenwork 승계)
        label: updateLine(ctx.update ?? {}, { canAutoUpdate: platform.canAutoUpdate, current: app.getVersion() }),
        enabled: ctx.update?.status === 'ready' || ctx.update?.status === 'available',
        click: () => ctx.installUpdate?.(),
      },
      { type: 'separator' },
      { label: 'WHENCOMMAND 종료', role: 'quit' },
    ]);
  tray.setContextMenu(menu());
  ctx.refreshTray = () => tray.setContextMenu(menu()); // 단축키를 바꾸면 "부르기"의 표기도 따라간다
  tray.on('click', () => ctx.panel?.toggle()); // Windows 습관 — 왼쪽 클릭으로도 부른다
  ctx.tray = tray;
}

// 첫 실행 안내(PLAT-07) — 아이콘이 어디 있는지가 먼저, 그다음 단축키. Spotlight가 ⌘Space를 쥐고 있으면 그것도(PLAT-03).
function firstRun(ctx) {
  if (ctx.settings.get('firstRunDone')) return;
  ctx.settings.set('firstRunDone', true);
  const label = platform.hotkeyLabel(ctx.hotkey);
  const hint = platform.firstRunHint(label);
  let body = hint.body;
  if (!ctx.hotkeyOk) body += `\n${label} 를 등록하지 못했습니다 — 다른 앱이 쓰고 있습니다.`;
  else if (ctx.hotkeyConflict) body += `\n${label} 는 ${ctx.hotkeyConflict.app}도 쓰고 있어 둘이 함께 뜹니다. ${ctx.hotkeyConflict.howTo}.`;
  ctx.notify(hint.title, body);
}
