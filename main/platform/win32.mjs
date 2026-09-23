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
  // 숨길 때 minimize()를 거쳤으니(아래) 보일 때는 restore()가 먼저다. restore()가 창을 보이게 하므로 그 뒤 show()는 안 부른다 —
  // show() 뒤에 restore()를 부르면 두 번 그려져 깜빡였다(2026-09-21 실사용, D-27)
  activate(win) {
    if (win.isMinimized()) win.restore();
    // restore()만으로는 isVisible()이 true가 되지만 웹 콘텐츠는 '숨김'으로 남아 **프레임을 내지 않는다** — 직전 화면이 굳은 채 보이고
    // 키가 안 듣는다(2026-09-22 실기기 재현, D-29). show()는 보이는 창에도 다시 불러야 렌더러가 WasShown을 받는다
    win.show();
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
  // args는 폴백(D-32)이 넘기는 입력 전체 — 스크립트의 첫 인자($args[0]·%1·$1)로 간다
  scriptRunner(file, args = []) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.ps1') {
      const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
      return {
        cmd: 'powershell',
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
          // 스크립트가 없거나 마지막 명령이 실패하면 $?가 false다 — $LASTEXITCODE만 보면 0으로 끝나 실패가 묻힌다(EXT-05)
          `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; & ${[file, ...args].map(psq).join(' ')}; if (-not $?) { exit 1 }; exit $LASTEXITCODE`],
      };
    }
    if (ext === '.cmd' || ext === '.bat') {
      const cq = (s) => `"${String(s).replace(/"/g, '')}"`; // cmd에는 안전한 따옴표 이스케이프가 없다 — 큰따옴표는 뺀다
      return { cmd: 'cmd.exe', args: ['/d', '/s', '/c', `chcp 65001>nul & ${[file, ...args].map(cq).join(' ')}`] };
    }
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

  // 시스템 명령(EXT-07, D-33) — 셸 없이 execFile로 돈다. 저장하는 것은 없다. 종료·재시작은 넣지 않는다 — 되돌릴 수 없고 입력줄에서 실수하기 쉽다
  systemCommands() {
    const ps = (script) => ({ cmd: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', script] });
    return [
      { id: 'lock', title: '화면 잠금', description: '지금 잠급니다 — 로그인 화면으로', icon: '⌁', exec: { cmd: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] } },
      { id: 'sleep', title: '절전', description: '잠자기 — 최대 절전이 켜져 있으면 최대 절전으로 들어갑니다', icon: '☾', exec: { cmd: 'rundll32.exe', args: ['powrprof.dll,SetSuspendState', '0,1,0'] } },
      { id: 'empty-trash', title: '휴지통 비우기', description: '되돌릴 수 없습니다', icon: '♺', exec: ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue') },
      { id: 'mute', title: '음소거 전환', description: '소리를 끄거나 켭니다', icon: '◌', exec: ps('(New-Object -ComObject WScript.Shell).SendKeys([char]173)') },
      { id: 'dark-mode', title: '다크 모드 전환', description: '앱·작업 표시줄 테마를 뒤집습니다', icon: '◐', exec: ps("$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'; $v=(Get-ItemProperty $k).AppsUseLightTheme; $n=1-$v; Set-ItemProperty $k AppsUseLightTheme $n; Set-ItemProperty $k SystemUsesLightTheme $n") },
    ];
  },

  // 아이콘을 뽑을 경로(LNCH-04). 시작 메뉴 항목은 .lnk라 그대로 물으면 "바로가기" 그림이 온다 — 대상을 풀어 그쪽 아이콘을 받는다.
  // 못 풀면(깨진 바로가기) 원래 경로 — 그러면 바로가기 그림이라도 뜬다
  resolveIconPath(p) {
    return this.iconSource(p).file;
  },

  // 아이콘의 **출처**(D-39, 실측 2026-09-23) — { file, index }. 바로가기는 대상 exe가 아니라 자기 IconLocation을 따른다:
  // Git 셋은 `git-for-windows.ico`, Chrome 앱(GitHub·VIA)은 프로필 폴더의 `.ico`, Office 비교 도구는 대상이 런처 `AppVLP.exe`고 아이콘은 다른 exe,
  // 작업 관리자는 `Taskmgr.exe,-30651`(음수 = 리소스 ID), iSCSI는 `iscsicpl.dll,-1`. 대상 exe만 보면 이들 전부가 Windows 기본 앱 아이콘이 된다.
  // IconLocation이 비었거나(`,0`) 없는 파일이면 대상 exe, 그것도 없으면 .lnk 자신. %windir% 같은 변수는 expandPath가 푼다
  iconSource(p) {
    if (!/\.lnk$/i.test(p)) return { file: p, index: 0 };
    try {
      const { target, icon, iconIndex } = shell.readShortcutLink(p);
      const iconFile = icon ? this.expandPath(icon) : '';
      if (iconFile && fs.existsSync(iconFile)) return { file: iconFile, index: Number(iconIndex) || 0 };
      if (target && fs.existsSync(target)) return { file: target, index: 0 };
    } catch {}
    return { file: p, index: 0 };
  },

  // app.getFileIcon이 **기본 실행 파일 아이콘**을 돌려준 exe의 진짜 아이콘(D-26 보충, 실측 2026-09-21), 그리고 인덱스가 있는 exe/dll 리소스(D-39).
  // 셸 아이콘 캐시에 없는 exe(탐색기가 한 번도 안 보여 준 설치본 — 형제 앱 다섯이 그랬다)는 셸이 파일을 열어 보지 않고 종류별 기본 그림을 준다.
  // Win32 ExtractIconEx가 파일·인덱스(음수면 리소스 ID)로 32px를 뽑고, 0번이 없으면 .NET ExtractAssociatedIcon으로 한 번 더.
  // PowerShell 한 번에 여러 항목 — 프로세스 시작이 ~400ms라 항목마다 띄우지 않는다. items는 [{ file, index }], 결과는 { `${file}\t${index}`: dataUrl }
  // (실패한 항목은 빠진다). 실패가 앱을 멈추지 않는다
  extractIcons(items) {
    const list = items.map((it) => (typeof it === 'string' ? { file: it, index: 0 } : it)).filter((it) => it?.file && /\.(exe|dll)$/i.test(it.file));
    if (!list.length) return Promise.resolve({});
    const script = [
      'Add-Type -AssemblyName System.Drawing',
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WCIco { [DllImport(\"shell32.dll\", CharSet=CharSet.Unicode)] public static extern uint ExtractIconEx(string f, int i, IntPtr[] l, IntPtr[] s, uint n); [DllImport(\"user32.dll\")] public static extern bool DestroyIcon(IntPtr h); }'",
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
      "foreach ($item in $env:WC_ICON_ITEMS.Split('|')) {", // 문자열 Split — 정규식 -split은 이스케이프가 JS·PS 두 겹이라 깨지기 쉽다
      '  try {',
      '    $parts = $item.Split("`t"); $f = $parts[0]; $oi = [int]$parts[1]',
      // 셸 규약의 -1은 "리소스 ID 1"인데 ExtractIconEx의 -1은 "개수 반환" 특수값과 겹쳐 실패한다(실측 2026-09-23 — 접근성 도구 다섯이 전부 `,-1`).
      // 리소스 ID 1은 거의 항상 파일의 첫 아이콘이라 위치 0으로 뽑는다
      '    $idx = if ($oi -eq -1) { 0 } else { $oi }',
      '    $icon = $null; $l = New-Object IntPtr[] 1; $s = New-Object IntPtr[] 1',
      '    $n = [WCIco]::ExtractIconEx($f, $idx, $l, $s, 1)',
      '    if ($n -gt 0 -and $l[0] -ne [IntPtr]::Zero) { $icon = [System.Drawing.Icon]::FromHandle($l[0]) }',
      '    elseif ($idx -eq 0) { $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($f) }',
      '    if ($icon) {',
      '      $ms = New-Object IO.MemoryStream',
      '      $icon.ToBitmap().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
      '      Write-Output ($f + "`t" + $oi + "`t" + [Convert]::ToBase64String($ms.ToArray()))',
      '    }',
      '    if ($l[0] -ne [IntPtr]::Zero) { [void][WCIco]::DestroyIcon($l[0]) }',
      '  } catch {}',
      '}',
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64'); // -EncodedCommand — 따옴표·cp949 문제를 피한다
    return new Promise((resolve) => {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, WC_ICON_ITEMS: list.map((it) => `${it.file}\t${it.index | 0}`).join('|') } },
        (err, stdout) => {
          const out = {};
          if (!err) {
            for (const line of String(stdout).split(/\r?\n/)) {
              const parts = line.split('\t');
              if (parts.length === 3 && parts[2].trim()) out[`${parts[0]}\t${Number(parts[1]) || 0}`] = `data:image/png;base64,${parts[2].trim()}`;
            }
          }
          resolve(out);
        });
    });
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
