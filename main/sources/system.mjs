// main/sources/system.mjs — 시스템 명령(EXT-07, D-33). 화면 잠금·절전·휴지통 비우기·음소거 전환·다크 모드 전환.
// 무엇이 있고 어떻게 실행하는지는 platform.systemCommands()가 안다(PLAT-01) — 여기는 다른 공급원과 같은 모양으로 목록에 올리고,
// 고르면 그 실행 사양(cmd·args)을 셸 없이 execFile로 돈다. 저장하는 것은 없다(D-02). 실패는 false로 돌아와 랭킹에 남지 않는다.
import { execFile } from 'node:child_process';
import { match } from '../search.mjs';
import { platform } from '../platform/index.mjs';

const WEIGHT = 0.9; // 앱 이름과 같은 글자로 걸리면 앱이 먼저다 — 시스템 명령은 자주 고르면 랭킹(D-10)으로 올라온다
const TIMEOUT_MS = 15_000;

let list = [];

export default {
  id: 'system',
  async ready() {
    list = platform.systemCommands();
  },
  count: () => list.length,
  async query(q) {
    const out = [];
    for (const c of list) {
      const m = match(q, c.title);
      if (m.score <= 0) continue;
      out.push({
        key: `system:${c.id}`,
        source: 'system',
        title: c.title,
        subtitle: c.description || null,
        icon: c.icon,
        base: m.score * WEIGHT,
        positions: m.positions,
        via: m.via,
        action: { type: 'system', id: c.id },
      });
    }
    return out;
  },
  run(id) {
    const c = list.find((x) => x.id === id);
    if (!c) return Promise.resolve(false);
    return new Promise((resolve) => {
      try {
        execFile(c.exec.cmd, c.exec.args, { windowsHide: true, timeout: TIMEOUT_MS }, (err) => resolve(!err));
      } catch {
        resolve(false);
      }
    });
  },
};
