// main/sources/apps.mjs — 설치된 앱(LNCH). 목록은 platform.listApps()가 OS별로 모으고, 여기는 캐시와 매칭만 한다.
// 영문 이름에는 한글 별칭이 붙는다(D-24) — `ㅋㄹ`이 Google Chrome에 걸리는 길이 그것이다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { platform } from '../platform/index.mjs';
import { DEFAULT_ALIASES, loadUserAliases, mergeAliases, aliasesFor, matchWithAliases } from '../aliases.mjs';

export const ALIASES_FILE = path.join(os.homedir(), '.whencommand', 'aliases.json');

let cache = [];

// 기본 표 + 사용자 파일. 목록을 읽을 때마다 함께 읽는다 — 파일을 고치고 "목록 새로고침"이면 반영된다
function aliasTable() {
  let user = {};
  try { user = loadUserAliases(fs.readFileSync(ALIASES_FILE, 'utf8')); } catch {}
  return mergeAliases(DEFAULT_ALIASES, user);
}

function withAliases(list) {
  const table = aliasTable();
  return list.map((a) => ({ ...a, aliases: aliasesFor(a.name, table) }));
}

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
    cache = withAliases(await platform.listApps());
  },
  async refresh() {
    cache = withAliases(await platform.listApps());
    return cache.length;
  },
  count: () => cache.length,
  async query(q) {
    const out = [];
    for (const a of cache) {
      const m = matchWithAliases(q, a.name, a.aliases);
      // 별칭으로 걸렸으면 왜 걸렸는지 부제로 — 제목에는 강조할 글자가 없다
      if (m.score > 0) out.push({ ...toItem(a), aliases: a.aliases, base: m.score, positions: m.positions, via: m.via, subtitle: m.via === 'alias' ? `별칭 ${m.alias}` : null });
    }
    return out;
  },
};
