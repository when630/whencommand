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
let pendingMove = 0; // 늦은 답을 기다리는 빈 목록에서 누른 방향키 — 도착하면 적용한다. 버리면 "눌렀는데 안 내려간다"가 된다

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 매칭 위치를 강조색으로 되짚어 준다 — 왜 이게 걸렸는지 설명 없이 보인다. positions는 UTF-16 인덱스(search.mjs 규약).
function highlight(title, positions) {
  const set = new Set(positions || []);
  let out = '';
  for (let i = 0; i < title.length; i++) out += set.has(i) ? `<em>${esc(title[i])}</em>` : esc(title[i]);
  return out;
}

// 앱·파일 아이콘은 OS 것을 쓴다(LNCH-04) — 받기 전까지, 그리고 못 뽑는 것(UWP)은 이름 첫 글자를 색 상자에 둔다. 색은 이름에서 결정적으로.
// 아이콘은 화면에 보이는 줄만 묻고 세션 동안 기억한다(D-23). 도착하면 그 줄의 상자만 바꾼다 — 목록을 다시 그리지 않는다.
const iconCache = new Map(); // path → dataUrl | null
function iconPath(it) {
  if (it.source === 'apps' || it.source === 'files') return it.action?.path ?? null;
  if (it.source === 'siblings') return it.path ?? null; // 형제 앱 설치본의 아이콘(D-26) — 매니페스트 verify 경로
  return null;
}
function avatar(it) {
  const p = iconPath(it);
  if (p && iconCache.get(p)) return `<span class="ic img"><img src="${iconCache.get(p)}" alt=""></span>`;
  if (it.source === 'calc') return `<span class="ic calc">=</span>`;
  if (it.source === 'scripts') return `<span class="ic scr">${esc(it.icon || '$')}</span>`;
  if (it.source === 'siblings' || it.source === 'builtin') return `<span class="ic sib">${esc(it.icon || '?')}</span>`; // 형제 앱·이 앱은 시리즈 색(--accent)으로 — 시안 §3
  // 파일은 확장자, 폴더는 ▸ — 아이콘 추출(LNCH-04와 같은 이유)은 다음
  if (it.source === 'files') return `<span class="ic file${it.kind === 'dir' ? ' dir' : ''}">${it.kind === 'dir' ? '▸' : esc((it.icon || '·').slice(0, 4))}</span>`;
  let h = 0;
  for (const c of it.title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const ch = it.title.replace(/^when/i, '').trim()[0]?.toUpperCase() ?? '?';
  return `<span class="ic" style="background:linear-gradient(140deg,hsl(${hue} 55% 58%),hsl(${(hue + 30) % 360} 50% 42%))">${esc(ch)}</span>`;
}

const CHIP = { apps: ['앱', ''], calc: ['복사', ''], files: ['파일', ''], scripts: ['스크립트', 'scr'], builtin: ['이 앱', 'sib'] };
function chip(it) {
  if (it.source === 'siblings') return `<span class="chip sib"><span class="d"></span>${esc(it.app ?? '')}</span>`;
  if (it.source === 'files' && it.kind === 'dir') return `<span class="chip"><span class="d"></span>폴더</span>`;
  const [label, cls] = CHIP[it.source] ?? [it.source, ''];
  return `<span class="chip ${cls}"><span class="d"></span>${esc(label)}</span>`;
}

// 그려진 줄 중 아이콘을 아직 못 받은 것만 묻는다. 응답이 올 때 그 줄이 아직 같은 항목이면 상자만 바꾼다
async function fetchIcons() {
  const want = [...new Set(items.map(iconPath).filter((p) => p && !iconCache.has(p)))];
  if (!want.length) return;
  const got = await window.whencommand.icons(want);
  for (const [p, url] of Object.entries(got)) iconCache.set(p, url);
  $list.querySelectorAll('.row').forEach((el) => {
    const it = items[Number(el.dataset.i)];
    const p = it && iconPath(it);
    if (!p || !iconCache.get(p)) return;
    const ic = el.querySelector('.ic');
    if (ic && !ic.classList.contains('img')) ic.outerHTML = avatar(it);
  });
}

function row(it, i) {
  const calc = it.source === 'calc';
  return `<div class="row${calc ? ' calc' : ''}${i === sel ? ' sel' : ''}" data-i="${i}" data-key="${esc(it.key)}">
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
    // 느린 공급원의 답을 기다리는 중이면 빈 안내를 내지 않는다 — 0.2초 뒤 파일이 오면서 깜빡이던 자리다
    else if (!result.pending) $extra.innerHTML = `<div class="empty"><div class="t1">찾은 것이 없습니다</div><div class="t2">앱 ${result.appCount ?? info.appCount}개에서 찾았습니다 · 초성·영문 자판 모두 봤습니다</div></div>`;
    // 색인을 못 쓰면 그 사실을 한 줄로(FILE-05) — 조용히 결과 0으로 두지 않는다
    if (result.notice) $extra.innerHTML += `<div class="notice">${esc(result.notice)}</div>`;
  }
  $hint.textContent = q && items.length ? `${items.length}개` : (q && result.pending ? '…' : '');
  // 카드 높이를 메인에 알린다 — 남는 투명 영역이 아래 창의 클릭을 먹지 않게
  requestAnimationFrame(() => window.whencommand.resize($panel.offsetHeight));
  if (items.length) fetchIcons();
}

let lastQueried = null; // 마지막으로 검색한 문자열 — 한글 IME가 조합을 확정하며 내는 값 같은 input을 걸러 낸다
async function query() {
  const my = ++seq;
  const q = $q.value;
  lastQueried = q;
  $hint.textContent = '';
  const result = await window.whencommand.query(q, my);
  if (my !== seq) return; // 더 새 입력이 있었다
  items = result.items;
  sel = 0;
  pendingMove = 0;
  lastResult = result;
  render(result);
}

// 느린 공급원(파일)이 늦게 합류한다(D-11). 순번이 다르면 버린다. **커서까지의 행은 그대로 두고** 그 아래만 점수순으로 섞는다 —
// 방향키를 누른 직후 도착해도 보고 있던 것이 밀리거나 커서가 튀지 않는다. 첫 줄이 고정되는 대가로 더 잘 맞는 파일은 둘째 줄부터 온다
function more(r) {
  if (r.seq !== seq || out) return;
  lastResult = { ...lastResult, pending: false }; // 늦은 답이 왔다 — 이제 비어 있으면 정말 없는 것이다
  const have = new Set(items.map((it) => it.key));
  const fresh = r.items.filter((it) => !have.has(it.key));
  if (!fresh.length) { if (!items.length) render(lastResult); return; }
  const keep = Math.min(sel + 1, items.length); // 빠른 결과가 없었으면 고정할 행도 없다
  const rest = [...items.slice(keep), ...fresh].sort((a, b) => b.final - a.final);
  items = [...items.slice(0, keep), ...rest].slice(0, 8); // PANEL-08
  if (!keep) {
    // 기다리는 동안 누른 방향키를 이제 적용한다
    sel = ((pendingMove % items.length) + items.length) % items.length;
    pendingMove = 0;
    render(lastResult);
    return;
  }
  // 고정된 행은 다시 그리지 않는다 — 깜빡임은 여기서 났다
  $list.querySelectorAll('.row').forEach((el, i) => { if (i >= keep) el.remove(); });
  $list.insertAdjacentHTML('beforeend', items.slice(keep).map((it, i) => row(it, keep + i)).join(''));
  $hint.textContent = `${items.length}개`;
  requestAnimationFrame(() => window.whencommand.resize($panel.offsetHeight));
  fetchIcons();
}

function move(d) {
  if (!items.length) { if (lastResult.pending) pendingMove += d; return; }
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

// 한글 IME는 ↑↓·Enter로 조합이 확정될 때 **값이 같은 input을 한 번 더** 낸다. 그걸 새 입력으로 보면 방금 옮긴 커서가 0으로 돌아가고
// 목록이 다시 그려져 깜빡인다 — 값이 안 바뀌었으면 검색하지 않는다
$q.addEventListener('input', () => { if ($q.value !== lastQueried) query(); });
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
window.whencommand.onShown(() => {
  $panel.classList.remove('leave');
  $panel.classList.add('enter'); // 시작 자세(투명·살짝 위) — 창이 나타나는 첫 프레임이 이것이다(D-31)
  leaveOutput(); $q.value = ''; $q.focus(); query();
  // 빈 입력줄이 실제로 그려진 뒤(두 rAF — 첫 rAF는 그리기 전, 둘째는 합성 뒤) 메인에 알린다. 그때까지 창은 투명하다(D-30).
  // 알린 다음 프레임에 .enter를 떼면 90ms 전환이 시작된다 — 메인이 창을 보이는 것과 거의 동시
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.whencommand.painted();
    requestAnimationFrame(() => $panel.classList.remove('enter'));
  }));
});
window.whencommand.onLeave(() => $panel.classList.add('leave')); // 메인이 LEAVE_MS 뒤에 숨긴다 — 그동안 페이드 아웃(D-31)
window.whencommand.onHidden(() => { $panel.classList.remove('leave'); $panel.classList.add('enter'); leaveOutput(); $q.value = ''; query(); }); // 목록까지 비운다 — 다음에 뜰 첫 프레임에 옛 결과가 남지 않게(D-27)
window.whencommand.onOutput((payload) => { out = payload; renderOutput(); });
window.whencommand.onMore(more);

(async () => {
  info = await window.whencommand.init();
  $q.placeholder = info.hotkeyOk ? 'WHENCOMMAND' : `${info.hotkeyLabel} 를 등록하지 못했습니다 — 트레이에서 부르세요`;
  query();
})();
