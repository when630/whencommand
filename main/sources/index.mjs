// main/sources/index.mjs — 공급원 등록·병합·순위(03 §2·§3). **모든 결과는 같은 모양의 공급원에서 나온다.**
// 빠른 공급원(apps·calc·scripts)은 캐시에서 즉시 답하고, 느린 공급원(files)은 늦게 도착해 query:more로 합류한다(D-11).
// siblings는 같은 모양으로 여기에 한 줄 더해진다.
import { rank } from '../rank.mjs';
import apps from './apps.mjs';
import calc from './calc.mjs';
import scripts from './scripts.mjs';
import files from './files.mjs';
import siblings from './siblings.mjs';
import builtin from './builtin.mjs';
import system from './system.mjs';
import { actionsFor, altAction } from '../actions.mjs';

const MAX_ROWS = 8; // PANEL-08

export function createSources(ctx) {
  const fast = [apps, calc, scripts, siblings, builtin, system];
  // 항목마다 동작 목록(PANEL-12) — 렌더러는 제목만 보이고 고른 id를 돌려준다. 실행은 ipc runItem이 actionsFor로 다시 찾는다
  const withActions = (it) => {
    const list = actionsFor(it);
    const alt = altAction(it);
    return { ...it, actions: list.map(({ id, title }) => ({ id, title })), altId: alt ? list.find((x) => x.action === alt)?.id ?? null : null };
  };
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
    // 트레이 "목록 새로고침" — 캐시를 갖는 공급원 셋을 다시 읽는다
    async refresh() {
      return { apps: await apps.refresh(), scripts: scripts.refresh(), siblings: siblings.refresh() };
    },
    appCount: () => apps.count(),
    scripts,
    files,
    siblings,
    system,
    async query(raw, seq = 0) {
      const q = String(raw ?? '').trim();
      lastSeq = seq;
      const picks = ctx.store.picks();
      if (!q) return { seq, query: q, items: remember([]), empty: true }; // 빈 입력은 입력줄만(D-18)
      const results = [];
      for (const s of fast) results.push(...(await s.query(q, ctx)));
      const items = rank(results, picks).slice(0, MAX_ROWS).map(withActions);
      // 폴백(SRCH-09, D-32) — 빠른 공급원이 0개면 "이 글로 할 수 있는 것": 인자를 받는 형제 앱 명령 + `# fallback: yes` 스크립트.
      // 렌더러는 늦은 파일 답까지 0개일 때만 이걸 보인다. 순서는 역시 랭킹(D-10) — 자주 고른 폴백이 위로
      const fallback = items.length ? [] : rank([...siblings.fallback(q), ...scripts.fallback(q)], picks).slice(0, MAX_ROWS).map(withActions);
      const wantFiles = q.length >= files.minChars; // FILE-03
      // 느린 공급원은 기다리지 않는다(SRCH-08). 도착하면 같은 순번일 때만 점수를 붙여 보내고, **어디에 끼울지는 렌더러가 정한다** —
      // 커서까지의 행은 고정하고 그 아래만 순위로 섞는다(D-11·D-21). 여기서 전체를 다시 매기면 방향키를 누른 직후 커서가 튄다
      const pending = wantFiles && files.status().ok; // 렌더러는 이게 참이면 "찾은 것이 없습니다"를 늦은 답이 올 때까지 미룬다
      if (pending) {
        files.late(q).then((more) => {
          if (!more || seq !== lastSeq || ctx.quitting) return; // null = 더 새 질의에 밀렸다
          const ranked = rank(more, ctx.store.picks()).slice(0, MAX_ROWS).map(withActions);
          last = new Map([...last, ...ranked.map((it) => [it.key, it])]); // 앞서 보낸 것에 더한다 — 렌더러가 무엇을 남기든 찾을 수 있게
          ctx.panel?.win.webContents.send('query:more', { seq, items: ranked }); // 0개여도 보낸다 — 그래야 빈 안내를 낼 수 있다
        });
      }
      // appCount는 매번 — 렌더러 초기화가 앱 수집보다 먼저 끝나 app:init의 값은 0일 수 있다
      remember([...items, ...fallback]);
      return { seq, query: q, items, fallback, empty: false, pending, notice: wantFiles ? files.notice() : null, appCount: apps.count() };
    },
    find: (key) => last.get(key) ?? null,
  };
}
