// main/settings-win.mjs — 설정 창(D-16). 이 앱의 **유일한 '창'**이다 — 입력줄은 순간적이지만 설정은 머무는 화면이라 따로 둔다.
// 540px 고정 폭, 높이는 렌더러가 내용에 맞춰 알려 준다(형제 앱 목록 길이가 기기마다 다르다). 한 번 만들고 show/hide만 한다.
// 내용이 화면보다 길면 창은 작업영역 안에서 멈추고 본문이 스크롤된다 — 2026-09-21 형제 앱 셋만 붙어도 860을 넘어 '정보'가 잘렸다.
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './log.mjs';
import { platform } from './platform/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 540;
const H_MIN = 320;
const H_MAX = 1100; // 형제 앱 다섯이 붙으면 900을 넘는다 — 실제 상한은 작업영역이 정한다(maxH)
const H_MARGIN = 48; // 작업영역 위아래로 남기는 여백 — 창이 작업표시줄에 닿지 않게

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
    // 오픈이슈 #11(macOS에서 ⌘ 조합이 단축키 잡기에 안 들어온다): ⌘ keydown이 webContents까지 오는지 로그로 가른다 —
    // 여기 찍히면 렌더러·등록 쪽, 안 찍히면 창 포커스·AppKit 쪽이다. before-input-event는 페이지·메뉴보다 앞이다
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.meta) log('settings key', input.code, input.modifiers.join('+'));
    });
    win.loadFile(path.join(HERE, '..', 'renderer', 'settings.html'));
    win.on('close', (e) => {
      if (ctx.quitting) return;
      e.preventDefault(); // 닫아도 다음에 바로 뜨게 — 창은 하나뿐이라 아까울 것 없다
      platform.deactivate(win); // 직전 창으로 포커스가 돌아가게 — 패널과 같은 길(D-41)
    });
    win.on('closed', () => { win = null; });
    return win;
  }

  function show() {
    if (ctx.quitting) return;
    const w = get();
    // 커서가 있는 디스플레이 가운데 — 설정은 잠깐 보는 창이라 자리를 기억하지 않는다.
    // 자리 잡기는 activate 안에서 restore 뒤에 돈다 — 숨길 때 minimize를 거치므로(D-41) 최소화 중의 setPosition은 버려진다
    const place = w.isVisible() ? null : () => {
      const a = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      const [cw, ch] = w.getSize();
      w.setPosition(Math.round(a.x + (a.width - cw) / 2), Math.round(a.y + (a.height - ch) / 2));
    };
    // macOS: Dock을 숨긴 액세서리 앱은 show()+focus()만으로 키 창이 되지 않는다(실측 #7) — 트레이 클릭 직후라 협력적 활성화가 통한다.
    // Windows: 최소화됐던 창은 restore→자리→show→focus 순이어야 렌더러가 프레임을 낸다(D-29·D-41)
    platform.activate(w, place);
    w.webContents.send('settings:refresh'); // 열 때마다 최신 상태로 — 형제 앱이 그새 붙었을 수 있다
  }

  // 상한은 고정값과 지금 창이 있는 디스플레이의 작업영역 중 작은 쪽 — 노트북 화면에서 860은 이미 화면보다 크다
  function maxH(w) {
    const a = screen.getDisplayMatching(w.getBounds()).workArea;
    return Math.max(H_MIN, Math.min(H_MAX, a.height - H_MARGIN));
  }

  function resize(contentH) {
    const w = get();
    const h = Math.max(H_MIN, Math.min(maxH(w), Math.round(contentH)));
    const [cw, ch] = w.getSize();
    if (ch === h) return;
    const [x, y] = w.getPosition();
    const a = screen.getDisplayMatching(w.getBounds()).workArea;
    // 가운데를 지키며 늘리되 작업영역 밖으로는 나가지 않는다
    const ny = Math.min(Math.max(a.y, y - Math.round((h - ch) / 2)), a.y + a.height - h);
    w.setBounds({ x, y: ny, width: cw, height: h }, false);
  }

  return {
    show,
    // Esc·× 가 부른다. Windows는 minimize를 거쳐야 직전 창에 포커스가 돌아온다(함정 #8) — 보일 때 restore는 show()의 platform.activate가 맡는다
    hide: () => { if (win && !win.isDestroyed() && win.isVisible()) platform.deactivate(win); },
    resize,
    get win() { return win; },
    isVisible: () => !!(win && !win.isDestroyed() && win.isVisible()),
  };
}
