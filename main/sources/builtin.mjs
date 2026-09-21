// main/sources/builtin.mjs — 이 앱 자신의 명령. "설정"을 치면 설정 창이 뜬다(D-16) — 트레이 메뉴를 찾아가지 않아도 되게.
// 다른 공급원과 같은 모양이고, 항목이 늘면 입력줄로 옮길 게 있다는 신호가 아니라 트레이에서 뺄 게 있다는 신호다.
import { match } from '../search.mjs';
import { SCRIPTS_DIR } from './scripts.mjs';
import { APPS_DIR } from './siblings.mjs';

const ITEMS = [
  { key: 'builtin:settings', title: '설정', subtitle: 'WHENCOMMAND 설정 — 단축키·자동 실행·형제 앱', icon: '⚙', action: { type: 'open-settings' } },
  { key: 'builtin:scripts', title: '스크립트 폴더', subtitle: SCRIPTS_DIR, icon: '$', action: { type: 'open-path', path: SCRIPTS_DIR } },
  { key: 'builtin:siblings', title: '형제 앱 폴더', subtitle: APPS_DIR, icon: '⌘', action: { type: 'open-path', path: APPS_DIR } },
];

export default {
  id: 'builtin',
  async ready() {},
  async query(q) {
    const out = [];
    for (const it of ITEMS) {
      const m = match(q, it.title);
      if (m.score > 0) out.push({ ...it, source: 'builtin', app: 'WHENCOMMAND', base: m.score * 0.9, positions: m.positions, via: m.via });
    }
    return out;
  },
};
