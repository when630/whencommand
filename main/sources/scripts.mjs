// main/sources/scripts.mjs — 스크립트 명령(EXT). ~/.whencommand/scripts/의 파일이 곧 명령이다(D-07).
// 폴더를 시작 시 한 번 읽어 캐시하고(apps와 같은 이유), 실행은 platform.scriptRunner가 정한 실행기로 한다(EXT-03).
// 이름·설명·아이콘 파싱과 출력 분류는 ../scripts.mjs(순수)에 있다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { match } from '../search.mjs';
import { parseHeader } from '../scripts.mjs';
import { platform } from '../platform/index.mjs';

export const SCRIPTS_DIR = path.join(os.homedir(), '.whencommand', 'scripts');
const TIMEOUT_MS = 60_000; // 이보다 오래 도는 건 명령이 아니라 작업이다 — 죽이고 실패로 보인다
const MAX_OUTPUT = 256 * 1024;

let cache = [];

// 폴더가 없으면 예제 하나와 함께 만든다(EXT-06). 있으면 손대지 않는다 — 사용자가 예제를 지웠으면 그게 뜻이다.
function ensureDir() {
  if (fs.existsSync(SCRIPTS_DIR)) return;
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  const ex = platform.exampleScript();
  try { fs.writeFileSync(path.join(SCRIPTS_DIR, ex.name), ex.content, 'utf8'); } catch {}
}

function scan() {
  ensureDir();
  let entries;
  try { entries = fs.readdirSync(SCRIPTS_DIR, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.')) continue;
    const file = path.join(SCRIPTS_DIR, e.name);
    if (!platform.scriptRunner(file)) continue; // 실행기를 모르는 확장자(README.md 같은 것)는 명령이 아니다
    let head = '';
    try {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(4096);
      const n = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      head = buf.subarray(0, n).toString('utf8').replace(/^﻿/, '');
    } catch {}
    out.push({ ...parseHeader(head, e.name), path: file });
  }
  return out;
}

const toItem = (s, args = []) => ({
  key: `scripts:${s.path}`,
  source: 'scripts',
  title: s.name,
  subtitle: s.description || null,
  icon: s.icon,
  action: { type: 'run-script', path: s.path, args },
});

// 실행 — stdout·stderr·종료 코드·걸린 시간. 시작 자체가 실패하면(실행기 없음·권한) 그 오류가 stderr다. args는 스크립트의 첫 인자부터(D-32)
export function run(file, args = []) {
  const runner = platform.scriptRunner(file, args);
  const t0 = Date.now();
  if (!runner) return Promise.resolve({ code: null, stdout: '', stderr: `실행기를 모르는 확장자입니다: ${path.basename(file)}`, ms: 0 });
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (code, extra = '') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr: stderr + extra, ms: Date.now() - t0 });
    };
    let child;
    try {
      child = spawn(runner.cmd, runner.args, { cwd: os.homedir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return finish(null, String(e.message ?? e));
    }
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(null, `\n${TIMEOUT_MS / 1000}초가 지나 중단했습니다`);
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { if (stdout.length < MAX_OUTPUT) stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { if (stderr.length < MAX_OUTPUT) stderr += d.toString('utf8'); });
    child.on('error', (e) => finish(null, String(e.message ?? e)));
    child.on('close', (code) => finish(code));
  });
}

export default {
  id: 'scripts',
  dir: SCRIPTS_DIR,
  async ready() {
    cache = scan();
  },
  refresh() {
    cache = scan();
    return cache.length;
  },
  count: () => cache.length,
  byPath: (p) => { const r = path.resolve(p); return cache.find((s) => path.resolve(s.path) === r) ?? null; }, // 출력 모드의 "다시 실행"이 경로만 들고 온다
  run,
  // 폴백(D-32) — `# fallback: yes`를 선언한 스크립트에 입력 전체를 첫 인자로. 결과가 없을 때만 보인다
  fallback(q) {
    return cache.filter((s) => s.fallback).map((s) => ({ ...toItem(s, [q]), subtitle: `“${q}”`, base: 1, fallback: true }));
  },
  async query(q) {
    const out = [];
    for (const s of cache) {
      const m = match(q, s.name);
      if (m.score > 0) out.push({ ...toItem(s), base: m.score, positions: m.positions, via: m.via });
    }
    return out;
  },
};
