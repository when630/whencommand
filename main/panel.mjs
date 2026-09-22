// main/panel.mjs — 입력줄 창. 미리 만들어 숨겨 두고 show()/hide()만 한다(D-06 — 실측 #6: 29ms vs 새 창 144ms).
// 보일 때·숨길 때의 활성화 방식은 platform이 안다(실측 #7 — macOS는 app.focus({steal}) / app.hide()).
import { BrowserWindow, screen } from 'electron';
import { log } from './log.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from './platform/index.mjs';
import { pickPosition } from './place.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CARD_W = 560; // 시안 ㉤
const PAD = 28; // 그림자가 들어갈 여백 — 창은 이만큼 더 크고, 그 밖은 투명하다
const WIN_W = CARD_W + PAD * 2;
const WIN_H_MAX = 54 + 1 + 6 + 8 * 40 + 6 + PAD * 2; // 입력 행 + 8줄 (하단 바는 뺐다, D-15 보충)
const WIN_H_MIN = 54 + PAD * 2; // 입력 행만 — 열릴 때는 항상 이 높이다(SRCH-07: 빈 입력은 입력줄만)
const POS_KEY = 'panel.pos'; // settings.json — 마우스로 옮긴 창 좌표(D-19)

export function createPanel(ctx) {
  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H_MAX,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // resizable:false는 min·max 크기를 생성 크기로 못 박아 setSize가 조용히 무시된다(실측 — getMinimumSize가 443). 그래서 resizable은 true,
    // 대신 thickFrame:false로 사용자가 끌 수 있는 테두리(WS_THICKFRAME)를 없애고 will-resize도 막는다. 높이는 아래 min·max 안에서 코드만 바꾼다
    resizable: true,
    thickFrame: false,
    movable: true, // 마우스로 옮긴다 — 끌 수 있는 자리는 렌더러의 -webkit-app-region(D-19)
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
  // resizable:false는 크기를 생성 크기(WIN_H_MAX)로 못 박는다 — setSize가 조용히 무시돼 창이 항상 443이었다(오픈이슈 #10).
  // 폭은 고정, 높이만 입력줄~8줄 사이로 풀어 준다. 사용자가 끌어 늘릴 수 있는 테두리는 없다(frame:false)
  win.setMinimumSize(WIN_W, WIN_H_MIN);
  win.setMaximumSize(WIN_W, WIN_H_MAX);
  win.on('will-resize', (e) => e.preventDefault()); // 사람이 끄는 크기 변경만 온다(프로그램 setSize는 안 온다) — 전부 막는다
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); // PANEL-04
  win.setMenu?.(null);
  win.loadFile(path.join(HERE, '..', 'renderer', 'panel.html'));

  // 옮겨 둔 자리가 있으면 거기, 없거나 화면 밖이면 커서가 있는 디스플레이의 위 28% 중앙(D-08·D-19, place.mjs centerY:false).
  // 저장값은 창 좌표라 그대로 쓰고, 계산값은 카드 좌표라 그림자 여백만큼 올린다.
  function place() {
    const saved = ctx.settings.get(POS_KEY);
    const cursorArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const workAreas = screen.getAllDisplays().map((d) => d.workArea);
    const size = { width: WIN_W, height: WIN_H_MAX };
    const pos = pickPosition({ saved, size, workAreas, cursorArea, centerY: false });
    const fromSaved = saved && pos.x === saved.x && pos.y === saved.y;
    win.setPosition(pos.x, fromSaved ? pos.y : pos.y - PAD);
  }

  // 마우스로 옮기면 그 자리를 기억한다. setPosition으로 옮긴 것은 'moved'가 오지 않아 저장되지 않는다
  function remember() {
    if (ctx.smoke || win.isDestroyed() || !win.isVisible() || win.getOpacity() === 0) return;
    const [x, y] = win.getPosition();
    ctx.settings.set(POS_KEY, { x, y });
  }

  // 기억한 자리를 지우고 기본 자리로 — 트레이 메뉴
  function resetPosition() {
    ctx.settings.remove(POS_KEY);
    if (win.isVisible()) place();
  }

  // 보이기·숨기기 한 줄 로그 — 다른 PC에서 "한 번 쓰면 굳는다"가 어느 단계인지 로그만으로 좁히기 위해(D-28). 상태는 부르기 전 것
  const state = () => `visible=${win.isVisible()} minimized=${win.isMinimized()} focused=${win.isFocused()} opacity=${win.getOpacity()} h=${win.getSize()[1]}`;

  // 보이기(D-30) — 최소화돼 있던 동안 렌더러는 프레임을 못 내므로, 그냥 보이면 **직전 검색 화면**이 한 프레임 먼저 오르고 그 뒤
  // 빈 입력줄로 바뀐다(0.1.6 실사용: "전에 검색했던 게 한 번 보이고 새로 뜬다"). 그래서 투명(opacity 0)으로 띄워 렌더러가
  // 빈 화면을 그렸다는 신호(panel:painted)를 받은 뒤에 나타낸다. 신호가 없어도 REVEAL_MS 뒤에는 보인다 — 굳은 창을 숨겨 두지 않는다
  const REVEAL_MS = 150;
  const LEAVE_MS = 80; // 렌더러의 나가기 전환(70ms)보다 조금 길게 — 마지막 프레임까지 보인 뒤 숨긴다(D-31)
  let revealTimer = null;
  let hideTimer = null; // 사라지는 중 — 이 동안의 hide·toggle은 무시, show는 취소하고 다시 뜬다
  let showSeq = 0;

  function reveal() {
    clearTimeout(revealTimer);
    revealTimer = null;
    if (win.isDestroyed() || !win.isVisible()) return;
    win.setOpacity(1);
    win.focus();
  }

  function show() {
    if (ctx.quitting) return;
    log('panel.show', state());
    const my = ++showSeq;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } // 사라지던 중에 다시 부르면 그 자리에서 다시 뜬다
    place();
    win.setOpacity(0); // 나타나는 순간까지 아무것도 안 보인다 — 직전 프레임도, 크기 변화도
    platform.activate(win); // restore/show/focus — 순서와 조합은 OS가 다르다(실측 #7·D-29)
    // 최소화된 창의 setSize는 먹지 않으므로 restore 뒤에 맞춘다. 열릴 때 내용은 항상 빈 입력줄(panel:hidden·shown에서 비운다)
    if (win.getSize()[1] !== WIN_H_MIN) win.setSize(WIN_W, WIN_H_MIN, false);
    win.webContents.send('panel:shown');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => { if (my === showSeq) { log('panel.reveal(timeout)'); reveal(); } }, REVEAL_MS);
  }

  // 렌더러가 빈 입력줄을 그렸다(두 rAF 뒤) — 이제 보여도 된다
  function painted() {
    if (!win.isVisible() || win.getOpacity() > 0 || hideTimer) return;
    reveal();
  }

  // 숨기기(D-31) — 렌더러에 leave를 보내 70ms 페이드 아웃하고 LEAVE_MS 뒤에 실제로 숨긴다. 렌더러가 굳어 있어도 타이머로 숨긴다.
  // 아직 나타나지 않은 창(opacity 0)·스모크·종료 중에는 바로 숨긴다
  function hide(why) {
    if (!win.isVisible() || hideTimer) return;
    log(`panel.hide(${why})`, state());
    clearTimeout(revealTimer);
    revealTimer = null;
    showSeq += 1; // 진행 중이던 reveal 무효화
    const finish = () => {
      hideTimer = null;
      if (win.isDestroyed() || !win.isVisible()) return;
      platform.deactivate(win);
      win.webContents.send('panel:hidden', why);
    };
    if (ctx.quitting || ctx.smoke || win.getOpacity() === 0) return finish();
    win.webContents.send('panel:leave');
    hideTimer = setTimeout(finish, LEAVE_MS);
  }

  function toggle() {
    if (hideTimer) return; // 사라지는 중 — 80ms 안의 두 번째 누름은 버린다
    if (win.isVisible()) hide('hotkey');
    else show();
  }

  // 스크립트의 긴 출력·실패(EXT-04·05) — 같은 패널이 아래로 자란다(D-17). 실행 전에 숨겼던 창을 다시 보이고 출력을 넘긴다.
  // 'panel:shown'이 먼저 가서 렌더러가 입력 상태를 비우고, 그 뒤 출력이 도착해 출력 모드로 바뀐다.
  function showOutput(payload) {
    if (ctx.quitting) return;
    if (!win.isVisible()) show();
    win.webContents.send('script:output', payload);
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
    if (!win.isVisible()) return; // 숨긴 뒤 렌더러가 비우며 보내는 resize — 최소화된 창의 크기를 건드리지 않는다. show()가 맞춘다
    const h = Math.max(WIN_H_MIN, Math.min(WIN_H_MAX, Math.round(cardH) + PAD * 2));
    const [w, before] = win.getSize();
    if (before === h) return;
    win.setSize(w, h, false);
    if (win.getSize()[1] !== h) log(`panel.resize ${before}→${h} 실패 (지금 ${win.getSize()[1]}, min ${win.getMinimumSize()[1]} max ${win.getMaximumSize()[1]})`); // 크기가 안 먹으면 그 사실을 남긴다(오픈이슈 #10)
  }

  win.webContents.once('did-finish-load', warmUp);
  win.on('moved', remember);
  win.on('blur', () => {
    // PANEL-05: 포커스 이탈로 닫힌다. 워밍업(opacity 0) 중에는 아니다.
    if (win.isVisible() && win.getOpacity() > 0 && !ctx.quitting && !ctx.smoke) hide('blur');
  });
  win.on('closed', () => { ctx.panel = null; });
  // 렌더러가 멈추면(D-28) 다시 불러온다 — 굳은 입력줄을 사용자가 되살릴 방법이 없다
  win.on('unresponsive', () => { log('panel unresponsive → reload', state()); try { win.webContents.reload(); } catch {} });
  win.on('responsive', () => log('panel responsive'));

  return { win, show, hide, toggle, resize, painted, resetPosition, showOutput, isVisible: () => win.isVisible() };
}
