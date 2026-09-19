// main/platform/win32.mjs — Windows(및 그 외 OS의 기본값). whennote에서 복사(D-14).
//
// ⚠ 이 앱의 Windows 쪽은 **실기기에서 검증되지 않았다**(03 §11 #5·#9, 2026-09-19 기준 macOS에서만 개발).
// 확인할 것: Alt+Space가 창 시스템 메뉴보다 먼저 잡히는가, 숨긴 뒤 직전 창으로 포커스가 돌아가는가.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { nativeImage, shell } from 'electron';

export default {
  name: 'win32',

  // PowerToys Run의 자리. 창 시스템 메뉴 기본값과 겹치므로 실측 #5가 남아 있다(D-05).
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

  // Windows는 show()가 곧 활성화다. 숨기면 OS가 직전 창으로 포커스를 돌려준다(미검증 — 03 §11 #7).
  activate(win) {
    win.focus();
  },
  deactivate(win) {
    win.hide();
  },

  // 트레이 아이콘. Windows는 컬러 그대로 쓴다.
  trayImage(root) {
    const p = path.join(root, 'build', 'tray.png');
    return fs.existsSync(p) ? nativeImage.createFromBuffer(fs.readFileSync(p)) : nativeImage.createEmpty();
  },

  // 설치된 앱 목록(LNCH-03) — 시작 메뉴 .lnk와 UWP(Get-StartApps) **둘 다** 본다. 하나만 보면 반쪽이다.
  // 미검증(03 §11 #9): Get-StartApps가 .lnk 항목까지 돌려주면 그것 하나로 충분할 수 있다.
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

  // 로그인 시 자동 실행. Windows는 실행 파일 경로가 그대로 등록된다.
  setLoginItem(app, openAtLogin) {
    app.setLoginItemSettings({ openAtLogin, args: [] });
    return app.getLoginItemSettings().openAtLogin === openAtLogin;
  },

  getLoginItem(app) {
    return app.getLoginItemSettings().openAtLogin;
  },
};
