// renderer/panel.js — 입력줄 렌더러. 프레임워크 없음(형제 앱 동일). 상태는 다섯: 질의·결과·선택·초기 정보·스크립트 출력.
// 결정은 메인이 한다 — 여기는 key를 돌려주고 그린다.
'use strict';

const $q = document.getElementById('q');
const $qtag = document.getElementById('qtag');
const $list = document.getElementById('list');
const $extra = document.getElementById('extra');
const $out = document.getElementById('out');
const $hint = document.getElementById('hint');
const $panel = document.getElementById('panel');

let info = { platform: 'darwin', hotkeyLabel: '', appCount: 0 };
let items = [];
let sel = 0;
let seq = 0; // 늦게 도착한 응답을 버리기 위한 순번
let out = null; // 출력 모드(EXT-04·05) — 스크립트 결과가 패널을 차지한다. null이면 보통의 입력 모드
let lastResult = { empty: true }; // 늦은 합류(D-11)가 다시 그릴 때 쓰는 직전 응답의 부가 정보(notice 등)

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 매칭 위치를 강조색으로 되짚어 준다 — 왜 이게 걸렸는지 설명 없이 보인다. positions는 UTF-16 인덱스(search.mjs 규약).
function highlight(title, positions) {
  const set = new Set(positions || []);
  let out = '';
  for (let i = 0; i < title.length; i++) out += set.has(i) ? `<em>${esc(title[i])}</em>` : esc(title[i]);
  return out;
}

// 앱 아이콘은 v1에서 뽑지 않는다(LNCH-04는 다음) — 이름 첫 글자를 색 상자에 둔다. 색은 이름에서 결정적으로.
function avatar(it) {
  if (it.source === 'calc') return `<span class="ic calc">=</span>`;
  if (it.source === 'scripts') return `<span class="ic scr">${esc(it.icon || '$')}</span>`;
  // 파일은 확장자, 폴더는 ▸ — 아이콘 추출(LNCH-04와 같은 이유)은 다음
  if (it.source === 'files') return `<span class="ic file${it.kind === 'dir' ? ' dir' : ''}">${it.kind === 'dir' ? '▸' : esc((it.icon || '·').slice(0, 4))}</span>`;
  let h = 0;
  for (const c of it.title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const ch = it.title.replace(/^when/i, '').trim()[0]?.toUpperCase() ?? '?';
  return `<span class="ic" style="background:linear-gradient(140deg,hsl(${hue} 55% 58%),hsl(${(hue + 30) % 360} 50% 42%))">${esc(ch)}</span>`;
}

const CHIP = { apps: ['앱', ''], calc: ['복사', ''], files: ['파일', ''], scripts: ['스크립트', 'scr'] };
function chip(it) {
  if (it.source === 'sibling') return `<span class="chip sib"><span class="d"></span>${esc(it.app ?? '')}</span>`;
  if (it.source === 'files' && it.kind === 'dir') return `<span class="chip"><span class="d"></span>폴더</span>`;
  const [label, cls] = CHIP[it.source] ?? [it.source, ''];
  return `<span class="chip ${cls}"><span class="d"></span>${esc(label)}</span>`;
}

function row(it, i) {
  const calc = it.source === 'calc';
  return `<div class="row${calc ? ' calc' : ''}${i === sel ? ' sel' : ''}" data-i="${i}">
    ${avatar(it)}
    <span class="tin"><span class="tt">${calc ? esc(it.title) : highlight(it.title, it.positions)}</span>${it.subtitle ? `<span class="sb">${esc(it.subtitle)}</span>` : ''}</span>
    ${chip(it)}<span class="kb">↵</span></div>`;
}

function render(result) {
  const q = $q.value.trim();
  $list.innerHTML = '';
  $extra.innerHTML = '';
  // 빈 입력은 입력줄만(D-18) — 목록도 안내도 없다
  if (!result.empty) {
    if (items.length) $list.innerHTML = items.map(row).join('');
    else $extra.innerHTML = `<div class="empty"><div class="t1">찾은 것이 없습니다</div><div class="t2">앱 ${info.appCount}개에서 찾았습니다 · 초성·영문 자판 모두 봤습니다</div></div>`;
    // 색인을 못 쓰면 그 사실을 한 줄로(FILE-05) — 조용히 결과 0으로 두지 않는다
    if (result.notice) $extra.innerHTML += `<div class="notice">${esc(result.notice)}</div>`;
  }
  $hint.textContent = q && items.length ? `${items.length}개` : '';
  // 카드 높이를 메인에 알린다 — 남는 투명 영역이 아래 창의 클릭을 먹지 않게
  requestAnimationFrame(() => window.whencommand.resize($panel.offsetHeight));
}

async function query() {
  const my = ++seq;
  const q = $q.value;
  $hint.textContent = '';
  const result = await window.whencommand.query(q, my);
  if (my !== seq) return; // 더 새 입력이 있었다
  items = result.items;
  sel = 0;
  lastResult = result;
  render(result);
}

// 느린 공급원(파일)이 늦게 합류한다(D-11). 순번이 다르면 버린다. **커서까지의 행은 그대로 두고** 그 아래만 점수순으로 섞는다 —
// 방향키를 누른 직후 도착해도 보고 있던 것이 밀리거나 커서가 튀지 않는다. 첫 줄이 고정되는 대가로 더 잘 맞는 파일은 둘째 줄부터 온다
function more(r) {
  if (r.seq !== seq || out || !r.items.length) return;
  const have = new Set(items.map((it) => it.key));
  const fresh = r.items.filter((it) => !have.has(it.key));
  if (!fresh.length) return;
  const fixed = items.slice(0, sel + 1);
  const rest = [...items.slice(sel + 1), ...fresh].sort((a, b) => b.final - a.final);
  items = [...fixed, ...rest].slice(0, 8); // PANEL-08
  // 고정된 행은 다시 그리지 않는다 — 깜빡임은 여기서 났다
  const rows = $list.querySelectorAll('.row');
  rows.forEach((el, i) => { if (i > sel) el.remove(); });
  $list.insertAdjacentHTML('beforeend', items.slice(sel + 1).map((it, i) => row(it, sel + 1 + i)).join(''));
  $hint.textContent = `${items.length}개`;
  requestAnimationFrame(() => window.whencommand.resize($panel.offsetHeight));
}

function move(d) {
  if (!items.length) return;
  sel = (sel + d + items.length) % items.length;
  $list.querySelectorAll('.row').forEach((el, i) => el.classList.toggle('sel', i === sel));
  $list.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' });
}

async function run(i = sel, alt = false) {
  const it = items[i];
  if (!it) return;
  await (alt ? window.whencommand.alt(it.key) : window.whencommand.run(it.key));
}

// ── 출력 모드(시안 §5 ②·③) — 입력줄 자리에 스크립트 이름표, 아래는 고정폭 출력. 실패면 전부 --danger로.
const MOD = () => (info.platform === 'darwin' ? '⌘' : 'Ctrl+');
const shortPath = (p) => String(p).replace(/^.*[\\/](\.whencommand[\\/])/, '~/$1').replace(/\\/g, '/');

function outputText() {
  const failed = out.code !== 0;
  return failed ? (out.stderr.trim() || out.stdout.trim() || '(출력 없음)') : out.stdout.replace(/\s+$/, '');
}

function renderOutput() {
  const failed = out.code !== 0;
  const text = outputText();
  const n = text ? text.split('\n').length : 0;
  $panel.classList.add('outmode');
  $panel.classList.toggle('failed', failed);
  $q.hidden = true;
  $qtag.hidden = false;
  $qtag.textContent = out.title;
  $hint.textContent = `${failed ? '실패' : '완료'} · ${(out.ms / 1000).toFixed(1)}s`;
  $list.innerHTML = '';
  $extra.innerHTML = '';
  const where = out.line != null ? `${shortPath(out.path)}:${out.line}` : shortPath(out.path);
  $out.hidden = false;
  $out.innerHTML = `<div class="out-head"><span class="st ${failed ? 'bad' : 'ok'}">exit ${out.code ?? '—'}</span><span>${failed ? 'stderr' : `${n}줄`}</span><span class="sp"></span>
      <kbd>${MOD()}C</kbd><span>복사</span><kbd>↵</kbd><span>다시 실행</span>${failed ? `<kbd>${MOD()}↵</kbd><span>스크립트 열기</span>` : ''}<kbd>esc</kbd></div>
    <pre class="outbody">${esc(text)}${failed ? `\n<span class="dim">${esc(where)}</span>` : ''}</pre>`;
  requestAnimationFrame(() => window.whencommand.resize($panel.offsetHeight));
}

function leaveOutput() {
  out = null;
  $panel.classList.remove('outmode', 'failed');
  $q.hidden = false;
  $qtag.hidden = true;
  $out.hidden = true;
  $out.innerHTML = '';
}

function outputKeys(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape') { e.preventDefault(); window.whencommand.hide(); return; }
  if (e.key === 'Enter' && mod) { e.preventDefault(); window.whencommand.openScript(out.path); window.whencommand.hide(); return; }
  if (e.key === 'Enter') { e.preventDefault(); window.whencommand.rerun(out.path); return; }
  if (mod && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
    e.preventDefault();
    window.whencommand.copy(outputText());
    $hint.textContent = '복사됨';
  }
}

$q.addEventListener('input', query);
document.addEventListener('keydown', (e) => {
  if (out) return outputKeys(e);
  if (e.key === 'Escape') { e.preventDefault(); window.whencommand.hide(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
  // ⌘·Ctrl+Enter — 보조 동작(파일이 든 폴더 열기, FILE-04). 없는 항목이면 본 동작과 같다
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(sel, true); return; }
  if (e.key === 'Enter') { e.preventDefault(); run(); return; }
  // ⌘·Ctrl + 숫자로 직접 선택(PANEL-09)
  if ((e.metaKey || e.ctrlKey) && /^[1-8]$/.test(e.key)) { e.preventDefault(); run(Number(e.key) - 1); }
});
$list.addEventListener('mousemove', (e) => {
  const el = e.target.closest('.row');
  if (el && Number(el.dataset.i) !== sel) { sel = Number(el.dataset.i); move(0); }
});
$list.addEventListener('click', (e) => {
  const el = e.target.closest('.row');
  if (el) run(Number(el.dataset.i));
});

// 다시 부르면 **항상 빈 줄**로 시작한다(PANEL-07). 출력 모드도 여기서 끝난다 — 다음 부름은 늘 입력줄이다
window.whencommand.onShown(() => { leaveOutput(); $q.value = ''; $q.focus(); query(); });
window.whencommand.onHidden(() => { leaveOutput(); $q.value = ''; });
window.whencommand.onOutput((payload) => { out = payload; renderOutput(); });
window.whencommand.onMore(more);

(async () => {
  info = await window.whencommand.init();
  $q.placeholder = info.hotkeyOk ? 'WHENCOMMAND' : `${info.hotkeyLabel} 를 등록하지 못했습니다 — 트레이에서 부르세요`;
  query();
})();
