// main/sources/index.mjs — 공급원 등록·병합·순위(03 §2·§3). **모든 결과는 같은 모양의 공급원에서 나온다.**
// 빠른 공급원(apps·calc·scripts)은 캐시에서 즉시 답하고, 느린 공급원(files)은 늦게 도착해 query:more로 합류한다(D-11).
// siblings는 같은 모양으로 여기에 한 줄 더해진다.
import { rank } from '../rank.mjs';
import apps from './apps.mjs';
import calc from './calc.mjs';
import scripts from './scripts.mjs';
import files from './files.mjs';

const MAX_ROWS = 8; // PANEL-08

export function createSources(ctx) {
  const fast = [apps, calc, scripts];
  // 렌더러는 key만 돌려준다 — 직전 결과를 들고 있어야 item:run이 무엇인지 안다
  let last = new Map();
  let lastSeq = 0; // 늦게 온 답이 아직 보고 있는 질의의 것인지 가리는 순번 — 렌더러가 매긴다

  const remember = (items) => {
    last = new Map(items.map((it) => [it.key, it]));
    return items;
  };

  return {
    async ready() {
      await Promise.all([...fast, files].map((s) => s.ready(ctx)));
    },
    // 트레이 "목록 새로고침" — 캐시를 갖는 공급원 둘을 다시 읽는다
    async refresh() {
      return { apps: await apps.refresh(), scripts: scripts.refresh() };
    },
    appCount: () => apps.count(),
    scripts,
    files,
    async query(raw, seq = 0) {
      const q = String(raw ?? '').trim();
      lastSeq = seq;
      const picks = ctx.store.picks();
      if (!q) return { seq, query: q, items: remember([]), empty: true }; // 빈 입력은 입력줄만(D-18)
      const results = [];
      for (const s of fast) results.push(...(await s.query(q, ctx)));
      const items = rank(results, picks).slice(0, MAX_ROWS);
      const wantFiles = q.length >= files.minChars; // FILE-03
      // 느린 공급원은 기다리지 않는다(SRCH-08). 도착하면 같은 순번일 때만 다시 순위를 매겨 밀어 넣는다
      if (wantFiles) {
        files.late(q).then((more) => {
          if (!more || !more.length || seq !== lastSeq || ctx.quitting) return;
          const merged = rank([...results, ...more], ctx.store.picks()).slice(0, MAX_ROWS);
          ctx.panel?.win.webContents.send('query:more', { seq, items: remember(merged) });
        });
      }
      return { seq, query: q, items: remember(items), empty: false, notice: wantFiles ? files.notice() : null };
    },
    find: (key) => last.get(key) ?? null,
  };
}
