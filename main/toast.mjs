// main/toast.mjs — 짧은 스크립트 출력용 자체 토스트(D-17). OS 알림이 아니다 — 권한을 묻지 않고, 알림 센터에 쌓이지 않고,
// 두 OS에서 같은 모양이다. 커서가 있는 디스플레이 우상단에 4초 머문다. 포커스를 받지 않아 하던 일을 끊지 않는다.
// 패널과 같은 이유로 미리 만들어 두고 showInactive()/hide()만 한다.
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 340;
const H = 132;
const MARGIN = 16;
const STAY_MS = 4000;

export function createToast(ctx) {
  const win = new BrowserWindow({
    width: W,
    height: H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(HERE, 'preload-toast.cjs'), sandbox: true, contextIsolation: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true); // 클릭이 통과한다 — 아래 창을 가리지 않는다
  win.setMenu?.(null);
  win.loadFile(path.join(HERE, '..', 'renderer', 'toast.html'));

  let timer = null;

  function place() {
    const a = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    win.setPosition(a.x + a.width - W - MARGIN, a.y + MARGIN);
  }

  // { title, body, copied, icon }
  function show(payload) {
    if (ctx.quitting || win.isDestroyed()) return;
    clearTimeout(timer);
    place();
    win.webContents.send('toast:show', payload);
    win.showInactive();
    timer = setTimeout(() => { if (!win.isDestroyed()) win.hide(); }, STAY_MS);
  }

  win.on('closed', () => { ctx.toast = null; });
  return { win, show };
}
