// main/platform/win32.mjs — Windows(및 그 외 OS의 기본값). whennote에서 복사(D-14).
//
// 2026-09-21 Windows 11 실기기에서 확인(03 §11 #5·#7·#9): Alt+Space는 시스템 메뉴보다 먼저 잡히고, 다른 런처가
// 먼저 쥐고 있으면 register()가 false를 돌려준다(먼저 등록한 쪽이 이긴다 — macOS와 반대). UWP 42개는 Get-StartApps로만 보인다.
// 남은 미검증: 미서명 앱의 로그인 항목(#2)은 패키징 후에.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { nativeImage, shell } from 'electron';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export default {
  name: 'win32',

  // PowerToys Run·Raycast의 자리. 시스템 메뉴보다 먼저 잡힌다(실측 #5) — 대신 그 런처들이 먼저 떠 있으면 register()가 false다(D-05).
  defaultHotkey: 'Alt+Space',

  // Windows NSIS는 서명 없이도 electron-updater가 내려받아 설치한다.
  // (설치 시 SmartScreen이 한 번 더 물을 수 있지만 업데이트 경로 자체는 막히지 않는다)
  canAutoUpdate: true,

  // 사람에게 보여줄 조합 표기 — Electron 표기(Alt+Space)를 그대로 읽히게 둔다
  hotkeyLabel: (accel) => String(accel).replace(/\bControl\b/g, 'Ctrl'),

  // 첫 실행 안내(PLAT-07). 트레이 아이콘이 **어디에 있는지**가 핵심이다 —
  // Windows 11은 새 트레이 아이콘을 기본으로 숨김 영역(^)에 넣어, 안내 없이는
  // 앱이 떴는데도 사라진 것처럼 보인다.
  firstRunHint: (hotkeyLabel) => ({
    title: 'WHENCOMMAND가 트레이에 있습니다',
    body: `작업 표시줄 오른쪽 ^ 를 눌러 ⌘ 아이콘을 찾고, 끌어다 고정하면 계속 보입니다. ${hotkeyLabel} 로 어디서든 부르세요.`,
  }),

  // Windows에는 OS가 미리 쥔 Alt+Space 소유자를 읽을 방법이 없다 — 등록 결과와 실제 발화로만 안다.
  hotkeyConflict() {
    return null;
  },

  // Windows는 알림에 AppUserModelId가 있어야 앱 이름·아이콘이 제대로 붙는다.
  prepareApp(app, { appId }) {
    app.setAppUserModelId(appId);
  },

  // Windows는 show()가 곧 활성화다. 단 **hide()만으로는 직전 창에 포커스가 돌아오지 않는다**(실측 2026-09-21, 03 §11 #7) —
  // 항상-위·작업표시줄-제외 창을 숨기면 OS가 Z순서에서 아무 창이나 고른다. 숨기기 전에 minimize()를 거치면
  // 최소화의 정규 활성화 경로가 직전 포그라운드 창을 복귀시킨다. 최소화된 창은 isVisible()=false라 show() 전에 restore()가 필요하다.
  activate(win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  },
  deactivate(win) {
    win.minimize();
    win.hide();
  },

  // 트레이 아이콘. Windows는 컬러 그대로 쓴다.
  trayImage(root) {
    const p = path.join(root, 'build', 'tray.png');
    return fs.existsSync(p) ? nativeImage.createFromBuffer(fs.readFileSync(p)) : nativeImage.createEmpty();
  },

  // 설치된 앱 목록(LNCH-03) — 시작 메뉴 .lnk와 UWP(Get-StartApps) **둘 다** 본다. 하나만 보면 반쪽이다.
  // 실측 #9(2026-09-21): .lnk 105 + UWP 42 → 137. 스토어 앱 42개는 .lnk에 없다.
  async listApps() {
    const out = new Map();
    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.lnk$/i.test(e.name)) {
          const name = e.name.replace(/\.lnk$/i, '');
          if (/uninstall|제거|readme|help/i.test(name)) continue;
          out.set(name.toLowerCase(), { name, path: p, id: null });
        }
      }
    };
    for (const base of [process.env.ProgramData, process.env.APPDATA]) {
      if (base) walk(path.join(base, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
    }
    try {
      const json = await new Promise((resolve, reject) =>
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-StartApps | ConvertTo-Json -Compress'], { encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout))));
      const list = JSON.parse(json);
      for (const a of Array.isArray(list) ? list : [list]) {
        if (!a?.Name || !a?.AppID) continue;
        if (!a.AppID.includes('!')) continue; // '!'가 있으면 UWP — 데스크톱 앱은 .lnk로 이미 들어왔다
        if (!out.has(a.Name.toLowerCase())) out.set(a.Name.toLowerCase(), { name: a.Name, path: `shell:AppsFolder\\${a.AppID}`, id: a.AppID });
      }
    } catch {
      // PowerShell이 없거나 막혔으면 .lnk만으로 간다 — 목록이 반쪽이 되지만 앱은 산다
    }
    return [...out.values()];
  },

  // 앱 실행. UWP는 explorer가 shell:AppsFolder 경로를 풀어 준다.
  async openApp(p) {
    if (p.startsWith('shell:')) {
      spawn('explorer.exe', [p], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return true;
    }
    return !(await shell.openPath(p));
  },

  // 스크립트 실행기(EXT-03) — 확장자로 정한다. Windows는 .ps1(PowerShell)·.cmd/.bat(cmd). 모르는 확장자는 null.
  // ⚠ 한국어 Windows의 콘솔 코드 페이지는 cp949라, 출력 인코딩을 UTF-8로 못 박지 않으면 한글 출력이 전부 깨진다.
  //   그래서 -File 대신 -Command로 감싸 [Console]::OutputEncoding을 먼저 세운다. cmd는 chcp 65001.
  scriptRunner(file) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.ps1') {
      const quoted = `'${file.replace(/'/g, "''")}'`;
      return {
        cmd: 'powershell',
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
          // 스크립트가 없거나 마지막 명령이 실패하면 $?가 false다 — $LASTEXITCODE만 보면 0으로 끝나 실패가 묻힌다(EXT-05)
          `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; & ${quoted}; if (-not $?) { exit 1 }; exit $LASTEXITCODE`],
      };
    }
    if (ext === '.cmd' || ext === '.bat') return { cmd: 'cmd.exe', args: ['/d', '/s', '/c', `chcp 65001>nul & "${file}"`] };
    return null;
  },

  // 파일 검색(FILE-01, D-09) — Windows Search 색인을 ADODB로 읽는다. PowerShell 시작이 ~400ms라 **한 번 띄워 두고**
  // stdin/stdout으로 질의한다(win32-search.ps1). 실측 2026-09-21: 질의 8~75ms. 서비스(WSearch)가 꺼져 있으면 Open이 던지고
  // ready가 false로 온다 — 그 사실을 status()로 알려 한 줄 안내가 된다(FILE-05).
  createFileSearch() {
    // 패키징본에서는 이 파일이 app.asar 안에 있어 PowerShell이 읽지 못한다(2026-09-21 패키징 smoke에서 "파일 검색 불가").
    // package.json build.asarUnpack이 이 파일을 app.asar.unpacked/에 풀어 두므로 경로만 그쪽으로 돌린다
    const script = path.join(HERE, 'win32-search.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    let child = null;
    let buf = '';
    let nextId = 1;
    const pending = new Map();
    let status = { ok: false, reason: '파일 검색을 아직 시작하지 않았습니다' };
    let readyResolve = null;
    const onLine = (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if ('ready' in msg) {
        status = msg.ready ? { ok: true } : { ok: false, reason: `Windows Search를 쓸 수 없습니다 — 서비스(WSearch)가 꺼져 있으면 파일 검색이 되지 않습니다 (${msg.error ?? ''})` };
        readyResolve?.(status);
        return;
      }
      const p = pending.get(String(msg.id));
      if (!p) return;
      pending.delete(String(msg.id));
      const raw = Array.isArray(msg.items) ? msg.items : msg.items ? [msg.items] : [];
      p(raw.filter((x) => x && x.p).map((x) => ({ name: x.n, path: x.p, isDir: !!x.d })));
    };
    return {
      ready() {
        return new Promise((resolve) => {
          readyResolve = resolve;
          try {
            child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
          } catch (e) {
            status = { ok: false, reason: `PowerShell을 띄우지 못했습니다 — ${e.message}` };
            return resolve(status);
          }
          child.stdout.setEncoding('utf8');
          child.stdout.on('data', (chunk) => {
            buf += chunk;
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (line) onLine(line);
            }
          });
          child.on('error', (e) => { status = { ok: false, reason: `PowerShell을 띄우지 못했습니다 — ${e.message}` }; resolve(status); });
          child.on('exit', (code) => {
            if (status.ok) status = { ok: false, reason: 'Windows Search 질의 프로세스가 끝났습니다 — 앱을 다시 시작하면 되살아납니다' };
            else if (!status.ok && !/Windows Search를 쓸 수 없습니다/.test(status.reason)) status = { ok: false, reason: `Windows Search 질의 프로세스가 시작 직후 끝났습니다 (exit ${code}) — 스크립트를 읽지 못했을 수 있습니다` };
            for (const p of pending.values()) p([]);
            pending.clear();
            child = null;
            resolve(status);
          });
        });
      },
      status: () => status,
      query(q, limit = 30) {
        if (!child || !status.ok) return Promise.resolve([]);
        const id = String(nextId++);
        return new Promise((resolve) => {
          pending.set(id, resolve);
          child.stdin.write(`${id}\t${limit}\t${Buffer.from(String(q), 'utf8').toString('base64')}\n`);
        });
      },
      dispose() {
        try { child?.stdin.end(); child?.kill(); } catch {}
      },
    };
  },

  // 첫 실행 때 폴더와 함께 만드는 예제(EXT-06). PowerShell 5.1은 BOM 없는 UTF-8을 cp949로 읽어 한글 주석이 깨지므로 BOM을 붙인다.
  exampleScript() {
    return {
      name: '내-ip.ps1',
      content: '\uFEFF' + [
        '# name: 내 IP',
        '# description: 이 PC의 로컬 IP — 한 줄이라 자동으로 복사됩니다',
        '# icon: @',
        '(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4Address.IPAddress',
        '',
      ].join('\r\n'),
    };
  },

  // 아이콘을 뽑을 경로(LNCH-04). 시작 메뉴 항목은 .lnk라 그대로 물으면 "바로가기" 그림이 온다 — 대상을 풀어 그쪽 아이콘을 받는다.
  // 못 풀면(깨진 바로가기) 원래 경로 — 그러면 바로가기 그림이라도 뜬다
  resolveIconPath(p) {
    if (!/\.lnk$/i.test(p)) return p;
    try {
      const { target } = shell.readShortcutLink(p);
      return target && fs.existsSync(target) ? target : p;
    } catch {
      return p;
    }
  },

  // 매니페스트의 verify 경로에 든 %VAR%를 푼다(LINK-04). 모르는 변수는 그대로 둔다 — 그러면 existsSync가 false를 돌려준다
  expandPath(p) {
    return String(p).replace(/%([^%]+)%/g, (whole, name) => process.env[name] ?? process.env[name.toUpperCase()] ?? whole);
  },

  // 로그인 시 자동 실행. Windows는 실행 파일 경로가 그대로 등록된다.
  setLoginItem(app, openAtLogin) {
    app.setLoginItemSettings({ openAtLogin, args: [] });
    return app.getLoginItemSettings().openAtLogin === openAtLogin;
  },

  getLoginItem(app) {
    return app.getLoginItemSettings().openAtLogin;
  },
};
