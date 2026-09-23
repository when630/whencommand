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
import { classifyClipboard, brief } from '../clip.mjs';
import { log } from '../log.mjs';
import fs from 'node:fs';

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
  let lastQuery = ''; // 고른 순간 무엇을 치고 있었나 — 지름길 힌트(D-36)가 "그보다 짧은가"를 잰다
  let clipItems = []; // 입력줄이 뜬 순간의 클립보드로 할 수 있는 것(D-37) — 빈 입력 상태에만 보인다
  let lastClip = ''; // 같은 내용은 한 번만 — 안 골랐으면 다음에도 안 보인다

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
    appPaths: () => apps.paths(),
    scripts,
    files,
    siblings,
    system,
    async query(raw, seq = 0) {
      const q = String(raw ?? '').trim();
      lastSeq = seq;
      lastQuery = q;
      const picks = ctx.store.picks();
      if (!q) return { seq, query: q, items: remember(clipItems), empty: true, clip: clipItems.length > 0 }; // 빈 입력은 입력줄만(D-18) — 클립보드 행만 예외(D-37)
      const results = [];
      for (const s of fast) results.push(...(await s.query(q, ctx)));
      // 의도 라우팅(D-35) — 문장에서 짚은 형제 앱 명령. 제목으로 이미 걸린 같은 명령이 있으면 그쪽(인자 분리가 더 정확하다)을 남긴다
      const have = new Set(results.map((it) => it.key));
      for (const it of siblings.intents(q)) if (!have.has(it.key)) results.push(it);
      const items = rank(results, picks).slice(0, MAX_ROWS).map(withActions);
      // 폴백(SRCH-09, D-32) — 빠른 공급원이 0개면 "이 글로 할 수 있는 것": 인자를 받는 형제 앱 명령 + `# fallback: yes` 스크립트.
      // 렌더러는 늦은 파일 답까지 0개일 때만 이걸 보인다. 순서는 역시 랭킹(D-10) — 자주 고른 폴백이 위로
      const fallback = items.length ? [] : rank([...siblings.fallback(q), ...scripts.fallback(q)], picks).slice(0, MAX_ROWS).map(withActions);
      const wantFiles = q.length >= files.minChars; // FILE-03
      // 느린 공급원은 기다리지 않는다(SRCH-08). 도착하면 같은 순번일 때만 점수를 붙여 보내고, **어디에 끼울지는 렌더러가 정한다** —
      // 커서까지의 행은 고정하고 그 아래만 순위로 섞는다(D-11·D-21). 여기서 전체를 다시 매기면 방향키를 누른 직후 커서가 튄다
      const pending = wantFiles && files.status().ok; // 렌더러는 이게 참이면 "찾은 것이 없습니다"를 늦은 답이 올 때까지 미룬다
      if (pending) {
        const t0 = performance.now(); // 계측 — 질의에서 파일 합류(query:more)까지. 디바운스 120ms가 들어 있다
        files.late(q).then((more) => {
          if (!more || seq !== lastSeq || ctx.quitting) return; // null = 더 새 질의에 밀렸다
          const ranked = rank(more, ctx.store.picks()).slice(0, MAX_ROWS).map(withActions);
          last = new Map([...last, ...ranked.map((it) => [it.key, it])]); // 앞서 보낸 것에 더한다 — 렌더러가 무엇을 남기든 찾을 수 있게
          log(`perf.more ${JSON.stringify(q)} ${Math.round(performance.now() - t0)}ms → 파일 ${ranked.length}개`);
          ctx.panel?.win.webContents.send('query:more', { seq, items: ranked }); // 0개여도 보낸다 — 그래야 빈 안내를 낼 수 있다
        });
      }
      // appCount는 매번 — 렌더러 초기화가 앱 수집보다 먼저 끝나 app:init의 값은 0일 수 있다
      remember([...items, ...fallback]);
      return { seq, query: q, items, fallback, empty: false, pending, notice: wantFiles ? files.notice() : null, appCount: apps.count() };
    },
    find: (key) => last.get(key) ?? null,
    lastQuery: () => lastQuery,
    // 클립보드 즉시 동작(PANEL-13, D-37) — 입력줄이 뜰 때 메인이 한 번 읽어 넘긴 글. 감시·저장 없음. 최대 세 줄:
    // URL이면 '링크 열기', 있는 경로면 '열기', 그리고 글이 짚이는 의도의 명령(둘까지) — 아니면 퀵 메모(note 표)
    setClipboard(raw) {
      const c = classifyClipboard(raw, (p) => fs.existsSync(p));
      if (!c || c.value === lastClip) { clipItems = []; return clipItems; }
      lastClip = c.value;
      const items = [];
      if (c.kind === 'url') items.push({ key: 'clip:url', source: 'clip', title: '링크 열기', subtitle: brief(c.value), icon: '↗', action: { type: 'open-url', url: c.value } });
      else if (c.kind === 'path') items.push({ key: 'clip:path', source: 'clip', title: '열기', subtitle: brief(c.value), icon: '▸', action: { type: 'open-path', path: c.value }, alt: { type: 'reveal', path: c.value } });
      const routed = siblings.intents(c.value);
      const dest = routed.length ? routed : siblings.forIntent('note', c.value).slice(0, 1);
      for (const it of dest) items.push({ ...it, subtitle: `“${brief(c.value, 40)}”`, clip: true });
      clipItems = items.slice(0, 3).map(withActions);
      return clipItems;
    },
    // 부작용 없는 검색(D-36) — 빠른 공급원만, last·순번·늦은 합류를 건드리지 않는다. 지름길 후보가 정말 첫 줄에 오는지 재는 데 쓴다
    async probe(q) {
      const results = [];
      for (const s of fast) results.push(...(await s.query(q, ctx)));
      return rank(results, ctx.store.picks()).slice(0, MAX_ROWS);
    },
  };
}
