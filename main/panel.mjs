// main/panel.mjs — 입력줄 창. 미리 만들어 숨겨 두고 show()/hide()만 한다(D-06 — 실측 #6: 29ms vs 새 창 144ms).
// 보일 때·숨길 때의 활성화 방식은 platform이 안다(실측 #7 — macOS는 app.focus({steal}) / app.hide()).
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from './platform/index.mjs';
import { pickPosition } from './place.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CARD_W = 560; // 시안 ㉤
const PAD = 28; // 그림자가 들어갈 여백 — 창은 이만큼 더 크고, 그 밖은 투명하다
const WIN_W = CARD_W + PAD * 2;
const WIN_H_MAX = 54 + 1 + 6 + 8 * 40 + 6 + 34 + PAD * 2; // 입력 행 + 8줄 + 하단 바

export function createPanel(ctx) {
  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H_MAX,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false, // 그림자는 렌더러가 그린다 — 창 그림자는 투명 창에서 사각형으로 뜬다
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); // PANEL-04
  win.setMenu?.(null);
  win.loadFile(path.join(HERE, '..', 'renderer', 'panel.html'));

  // 화면 위 28% 중앙 — 커서가 있는 디스플레이 기준(D-08, place.mjs centerY:false)
  function place() {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const size = { width: WIN_W, height: WIN_H_MAX };
    const pos = pickPosition({ saved: null, size, workAreas: [d.workArea], cursorArea: d.workArea, centerY: false });
    win.setPosition(pos.x, pos.y - PAD);
  }

  function show() {
    if (ctx.quitting) return;
    place();
    win.show();
    platform.activate(win);
    win.webContents.send('panel:shown');
  }

  function hide(why) {
    if (!win.isVisible()) return;
    platform.deactivate(win);
    win.webContents.send('panel:hidden', why);
  }

  function toggle() {
    if (win.isVisible()) hide('hotkey');
    else show();
  }

  // 실측 #6: 한 번도 그려진 적 없는 창의 첫 페인트는 446ms(콜드 캐시). 시작 직후 보이지 않게 한 번 그려 둔다.
  function warmUp() {
    win.setOpacity(0);
    place();
    win.showInactive();
    setTimeout(() => {
      win.hide();
      win.setOpacity(1);
    }, 120);
  }

  // 렌더러가 카드 높이를 보내면 창을 거기에 맞춘다 — 남는 투명 영역이 아래 창의 클릭을 먹지 않게
  function resize(cardH) {
    const h = Math.max(54 + PAD * 2, Math.min(WIN_H_MAX, Math.round(cardH) + PAD * 2));
    const [w] = win.getSize();
    if (win.getSize()[1] !== h) win.setSize(w, h, false);
  }

  win.webContents.once('did-finish-load', warmUp);
  win.on('blur', () => {
    // PANEL-05: 포커스 이탈로 닫힌다. 워밍업(opacity 0) 중에는 아니다.
    if (win.isVisible() && win.getOpacity() > 0 && !ctx.quitting && !ctx.smoke) hide('blur');
  });
  win.on('closed', () => { ctx.panel = null; });

  return { win, show, hide, toggle, resize, isVisible: () => win.isVisible() };
}
