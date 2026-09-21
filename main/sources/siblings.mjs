// main/sources/siblings.mjs — 형제 앱 명령(LINK). ~/.when/apps/<id>.json 매니페스트를 읽어 그 앱의 명령을 목록에 합친다(D-04).
// 폴더가 없으면 조용히 넘어간다 — 오류도 안내도 없다(LINK-01, D-03). 파일 하나가 깨졐으면 그 파일만 건너뛴다(LINK-05).
// 실행은 딥링크 한 줄(LINK-03) — 앱이 꺼져 있으면 OS가 띄워 준다. 규약은 when-protocol 저장소(D-12).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { match } from '../search.mjs';
import { parseManifest, splitCommand, buildUrl, missingArg } from '../manifest.mjs';
import { platform } from '../platform/index.mjs';

export const APPS_DIR = path.join(os.homedir(), '.when', 'apps');
const NAME_WEIGHT = 0.7; // 앱 이름으로 걸린 것(`노트` → WHENNOTE의 모든 명령)은 제목으로 걸린 것보다 뒤에

let apps = []; // 설치 확인까지 끝난 매니페스트
let skipped = []; // { file, error } — 설정 창(D-16)이 보여 줄 자리. 목록에는 나오지 않는다
let watcher = null;
let watchTimer = null;
let onChange = null;

// 매니페스트에 적힌 앱이 실제로 있는가(LINK-04). 이 OS 항목이 없으면 이 OS에는 없는 앱이다. verify 자체가 없으면 확인할 길이 없어 있다고 본다
function installed(m) {
  if (!m.verify) return true;
  const p = m.verify[platform.name];
  if (!p) return false;
  try { return fs.existsSync(platform.expandPath(p)); } catch { return false; }
}

function scan() {
  let entries;
  try { entries = fs.readdirSync(APPS_DIR, { withFileTypes: true }); } catch { return { apps: [], skipped: [] }; } // 폴더가 없다 — 그게 정상일 수 있다
  const found = [];
  const bad = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const file = path.join(APPS_DIR, e.name);
    let text = '';
    try { text = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch (err) { bad.push({ file, error: err.message }); continue; }
    const r = parseManifest(text);
    if (!r.ok) { bad.push({ file, error: r.error }); continue; }
    if (!installed(r.manifest)) { bad.push({ file, error: '설치돼 있지 않다' }); continue; }
    found.push(r.manifest);
  }
  return { apps: found, skipped: bad };
}

function load() {
  ({ apps, skipped } = scan());
  return apps;
}

// 형제 앱이 매니페스트를 떨어뜨리는 순간 목록에 들어오게 — 폴더가 생기기 전엔 못 지켜본다(refresh가 다시 시도한다)
function watch() {
  if (watcher) return;
  try {
    watcher = fs.watch(APPS_DIR, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => { load(); onChange?.(); }, 300);
    });
    watcher.on('error', () => { watcher = null; });
  } catch { watcher = null; }
}

function toItem(m, c, rest, base, positions, via) {
  const need = missingArg(c, rest);
  return {
    key: `siblings:${m.id}:${c.id}`,
    source: 'siblings',
    app: m.name,
    title: c.title,
    subtitle: rest ? `“${rest}”` : need ? `뒤에 ${need}를 붙이세요` : c.description || null,
    icon: m.name.replace(/^when/i, '')[0]?.toUpperCase() ?? '?',
    base,
    positions,
    via,
    action: { type: 'open-url', url: buildUrl(m, c, rest) },
  };
}

export default {
  id: 'siblings',
  dir: APPS_DIR,
  async ready() {
    load();
    watch();
  },
  refresh() {
    load();
    watch();
    return apps.length;
  },
  onChange: (cb) => { onChange = cb; },
  count: () => apps.length,
  apps: () => apps,
  skipped: () => skipped,
  async query(q) {
    const out = [];
    for (const m of apps) {
      const byName = match(q, m.name);
      for (const c of m.commands) {
        // "메모 검색 회의록" — 제목으로 시작하면 나머지가 인자다. 이 경로가 가장 정확하니 점수도 가장 높다
        const rest = splitCommand(q, c.title);
        if (rest !== null) { out.push(toItem(m, c, rest, rest ? 0.95 : 1, null, 'command')); continue; }
        const byTitle = match(q, c.title);
        const score = Math.max(byTitle.score, byName.score * NAME_WEIGHT);
        if (score > 0) out.push(toItem(m, c, '', score, byTitle.score >= byName.score * NAME_WEIGHT ? byTitle.positions : null, byTitle.via));
      }
    }
    return out;
  },
};
