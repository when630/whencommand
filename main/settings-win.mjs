// main/settings-win.mjs — 설정 창(D-16). 이 앱의 **유일한 '창'**이다 — 입력줄은 순간적이지만 설정은 머무는 화면이라 따로 둔다.
// 540px 고정 폭, 높이는 렌더러가 내용에 맞춰 알려 준다(형제 앱 목록 길이가 기기마다 다르다). 한 번 만들고 show/hide만 한다.
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 540;
const H_MIN = 320;
const H_MAX = 860;

export function createSettingsWin(ctx) {
  let win = null;

  function get() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      width: W,
      height: 640,
      minWidth: W,
      maxWidth: W,
      frame: false,
      resizable: false,
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      show: false,
      title: 'WHENCOMMAND 설정',
      backgroundColor: '#16171c',
      roundedCorners: true,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(HERE, 'preload-settings.cjs'), sandbox: true, contextIsolation: true },
    });
    win.setMenu?.(null);
    win.loadFile(path.join(HERE, '..', 'renderer', 'settings.html'));
    win.on('close', (e) => {
      if (ctx.quitting) return;
      e.preventDefault(); // 닫아도 다음에 바로 뜨게 — 창은 하나뿐이라 아까울 것 없다
      win.hide();
    });
    win.on('closed', () => { win = null; });
    return win;
  }

  function show() {
    if (ctx.quitting) return;
    const w = get();
    if (!w.isVisible()) {
      // 커서가 있는 디스플레이 가운데 — 설정은 잠깐 보는 창이라 자리를 기억하지 않는다
      const a = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      const [cw, ch] = w.getSize();
      w.setPosition(Math.round(a.x + (a.width - cw) / 2), Math.round(a.y + (a.height - ch) / 2));
    }
    w.show();
    w.focus();
    w.webContents.send('settings:refresh'); // 열 때마다 최신 상태로 — 형제 앱이 그새 붙었을 수 있다
  }

  function resize(contentH) {
    const w = get();
    const h = Math.max(H_MIN, Math.min(H_MAX, Math.round(contentH)));
    const [cw, ch] = w.getSize();
    if (ch === h) return;
    const [x, y] = w.getPosition();
    w.setBounds({ x, y: Math.max(0, y - Math.round((h - ch) / 2)), width: cw, height: h }, false);
  }

  return {
    show,
    hide: () => { if (win && !win.isDestroyed()) win.hide(); },
    resize,
    get win() { return win; },
    isVisible: () => !!(win && !win.isDestroyed() && win.isVisible()),
  };
}
