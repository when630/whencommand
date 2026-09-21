// main/sources/files.mjs — 파일 열기(FILE). OS 색인에 위임한다(D-09) — 실제 질의는 platform.createFileSearch()가 한다.
// 다른 공급원과 모양은 같지만 **즉시 답이 없다**: query()는 빈 배열이고, late()가 늦게 합류한다(D-11, SRCH-08).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { match } from '../search.mjs';
import { platform } from '../platform/index.mjs';

export const MIN_CHARS = 3; // FILE-03 — 한두 글자로 디스크를 훑으면 쓸모없고 느리다
const LIMIT = 30;
const DELAY_MS = 120; // 타이핑 연타를 한 번으로 — 색인 질의는 키 입력보다 느리다
const TIMEOUT_MS = 1500; // 이 안에 못 오면 버린다 — 늦게 온 결과는 이미 다른 것을 치고 있는 사용자를 방해한다
const FILE_WEIGHT = 0.85; // 같은 이름이면 앱이 파일보다 앞에 — "크롬"은 앱이지 chrome.txt가 아니다(D-21)
const FLOOR = 0.15; // 색인은 걸었는데 우리 매칭이 0인 것(현지화 표시 이름 등) — 그래도 목록에는 둔다

const HOME = os.homedir();
const shortDir = (p) => {
  const d = path.dirname(p);
  return d.startsWith(HOME) ? `~${d.slice(HOME.length)}` : d;
};

let search = null;
let current = null; // 대기 중인 늦은 질의 — 새 질의가 오면 취소한다

function toItem(q, r) {
  let isDir = r.isDir;
  if (isDir == null) {
    try { isDir = fs.statSync(r.path).isDirectory(); } catch { return null; } // 색인에는 있는데 지워진 파일
  }
  const m = match(q, r.name);
  return {
    key: `files:${r.path}`,
    source: 'files',
    kind: isDir ? 'dir' : 'file',
    title: r.name,
    subtitle: shortDir(r.path), // FILE-02 — 같은 이름이 여럿일 때 경로로 가른다
    icon: isDir ? 'dir' : path.extname(r.name).slice(1).toLowerCase(),
    base: (m.score > 0 ? m.score : FLOOR) * FILE_WEIGHT,
    positions: m.positions,
    via: m.via,
    action: { type: 'open-path', path: r.path }, // 폴더면 탐색기/Finder가 연다(FILE-04)
    alt: { type: 'reveal', path: r.path }, // ⌘·Ctrl+Enter — 파일이 든 폴더를 연다(FILE-04)
  };
}

export default {
  id: 'files',
  minChars: MIN_CHARS,
  async ready() {
    search = platform.createFileSearch();
    await Promise.race([search.ready(), new Promise((r) => setTimeout(r, 8000))]);
  },
  // FILE-05 — 색인을 못 쓰면 그 이유 한 줄. 쓸 수 있으면 null
  notice: () => (search?.status().ok ? null : (search?.status().reason || '파일 검색을 쓸 수 없습니다')),
  status: () => search?.status() ?? { ok: false, reason: '시작 전' },
  async query() {
    return [];
  },
  // 늦은 답. 새 질의가 오면 앞 질의는 null로 끝난다 — 호출부는 null을 "버려라"로 읽는다
  late(q) {
    if (current) { clearTimeout(current.timer); current.resolve(null); current = null; }
    if (q.length < MIN_CHARS || !search?.status().ok) return Promise.resolve([]);
    return new Promise((resolve) => {
      const me = { resolve, timer: null };
      current = me;
      me.timer = setTimeout(async () => {
        if (current !== me) return;
        const guard = setTimeout(() => { if (current === me) { current = null; resolve([]); } }, TIMEOUT_MS);
        let rows = [];
        try { rows = await search.query(q, LIMIT); } catch {}
        clearTimeout(guard);
        if (current !== me) return; // 그사이 새 질의가 왔다 — 이미 null로 끝났다
        current = null;
        resolve(rows.map((r) => toItem(q, r)).filter(Boolean));
      }, DELAY_MS);
    });
  },
  dispose: () => search?.dispose(),
};
