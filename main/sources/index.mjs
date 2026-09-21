// main/sources/index.mjs — 공급원 등록·병합·순위(03 §2·§3). **모든 결과는 같은 모양의 공급원에서 나온다.**
// 지금은 apps·calc 둘. scripts·siblings·files는 같은 모양으로 여기에 한 줄씩 더해진다.
import { rank } from '../rank.mjs';
import apps from './apps.mjs';
import calc from './calc.mjs';

const MAX_ROWS = 8; // PANEL-08
const HINT_UNTIL_PICKS = 3; // SRCH-07 — 세 번 고르면 사용법 힌트가 사라진다

export function createSources(ctx) {
  const list = [apps, calc];
  // 렌더러는 key만 돌려준다 — 직전 결과를 들고 있어야 item:run이 무엇인지 안다
  let last = new Map();

  const remember = (items) => {
    last = new Map(items.map((it) => [it.key, it]));
    return items;
  };

  return {
    async ready() {
      await Promise.all(list.map((s) => s.ready(ctx)));
    },
    async refresh() {
      return apps.refresh();
    },
    appCount: () => apps.count(),
    async query(raw) {
      const q = String(raw ?? '').trim();
      const picks = ctx.store.picks();
      // 빈 입력은 입력줄만 — 목록을 채우지 않는다(D-18). 첫 실행에만 사용법 한 줄(SRCH-07)
      if (!q) return { query: q, items: remember([]), empty: true, hint: picks.size < HINT_UNTIL_PICKS };
      const results = [];
      for (const s of list) results.push(...(await s.query(q, ctx)));
      const items = rank(results, picks).slice(0, MAX_ROWS);
      return { query: q, items: remember(items), empty: false };
    },
    find: (key) => last.get(key) ?? null,
  };
}
