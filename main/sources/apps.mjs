// main/sources/apps.mjs — 설치된 앱(LNCH). 목록은 platform.listApps()가 OS별로 모으고, 여기는 캐시와 매칭만 한다.
import { match } from '../search.mjs';
import { platform } from '../platform/index.mjs';

let cache = [];

const toItem = (a) => ({
  key: `apps:${a.path}`,
  source: 'apps',
  title: a.name,
  subtitle: null,
  icon: 'app',
  action: { type: 'open-app', path: a.path },
});

export default {
  id: 'apps',
  // 시작 시 한 번(LNCH-05). 새로 설치한 앱은 refresh()로 — 트레이 메뉴 "앱 목록 새로고침"
  async ready() {
    cache = await platform.listApps();
  },
  async refresh() {
    cache = await platform.listApps();
    return cache.length;
  },
  count: () => cache.length,
  // 빈 입력의 "자주 쓰는 것"이 고를 후보(SRCH-07)
  all: () => cache.map(toItem),
  async query(q) {
    const out = [];
    for (const a of cache) {
      const m = match(q, a.name);
      if (m.score > 0) out.push({ ...toItem(a), base: m.score, positions: m.positions, via: m.via });
    }
    return out;
  },
};
