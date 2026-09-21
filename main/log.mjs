// main/log.mjs — 앱이 조용히 사라진 이유를 남기는 한 줄 로그(userData/whencommand.log). 2026-09-21 Windows 실사용에서 두 번,
// stdout·stderr에 아무것도 없이 exit 0으로 내려갔다 — 그 경로는 app.quit()뿐이라 누가 불렀는지 스택을 남긴다.
// 1MB를 넘으면 앞을 버린다. 실패해도 앱을 멈추지 않는다.
import fs from 'node:fs';

let file = null;

export function initLog(path) {
  file = path;
  try {
    const st = fs.statSync(file);
    if (st.size > 1024 * 1024) fs.writeFileSync(file, '');
  } catch {}
}

export function log(...parts) {
  if (!file) return;
  const line = `${new Date().toISOString()} ${parts.map((p) => (p instanceof Error ? p.stack ?? p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  try { fs.appendFileSync(file, line); } catch {}
}

// app.quit()이 어디서 불렸는지 — 종료 원인 추적. 한 번만 감는다.
export function traceQuit(app) {
  const orig = app.quit.bind(app);
  app.quit = (...args) => {
    log('app.quit()', new Error('호출 위치'));
    return orig(...args);
  };
  const exit = app.exit.bind(app);
  app.exit = (...args) => {
    log('app.exit()', args, new Error('호출 위치'));
    return exit(...args);
  };
  process.on('uncaughtException', (e) => log('uncaughtException', e));
  process.on('unhandledRejection', (e) => log('unhandledRejection', e instanceof Error ? e : String(e)));
  process.on('exit', (code) => log(`process exit ${code}`));
}
