// renderer/panel.js — 입력줄 렌더러. 프레임워크 없음(형제 앱 동일). 상태는 넷: 질의·결과·선택·초기 정보.
// 결정은 메인이 한다 — 여기는 key를 돌려주고 그린다.
'use strict';

const $q = document.getElementById('q');
const $list = document.getElementById('list');
const $extra = document.getElementById('extra');
const $hint = document.getElementById('hint');
const $panel = document.getElementById('panel');
const $footRun = document.getElementById('foot-run');

let info = { platform: 'darwin', hotkeyLabel: '', hasPicks: false, appCount: 0 };
let items = [];
let sel = 0;
let seq = 0; // 늦게 도착한 응답을 버리기 위한 순번

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
  let h = 0;
  for (const c of it.title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const ch = it.title.replace(/^when/i, '').trim()[0]?.toUpperCase() ?? '?';
  return `<span class="ic" style="background:linear-gradient(140deg,hsl(${hue} 55% 58%),hsl(${(hue + 30) % 360} 50% 42%))">${esc(ch)}</span>`;
}

const CHIP = { apps: ['앱', ''], calc: ['복사', ''], files: ['파일', ''], scripts: ['스크립트', 'scr'] };
function chip(it) {
  if (it.source === 'sibling') return `<span class="chip sib"><span class="d"></span>${esc(it.app ?? '')}</span>`;
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
  if (result.empty) {
    if (items.length) $list.innerHTML = `<div class="gh">자주 쓰는 것</div>` + items.map(row).join('');
    else $extra.innerHTML = `<div class="hintline"><span class="dot"></span><span>앱 이름을 <b>몇 글자만</b> — 초성도 됩니다(<code>ㅋㄹ</code> → 크롬). 수식을 치면 계산합니다.<br>자주 고른 것이 여기 쌓입니다.</span></div>`;
  } else if (!items.length) {
    $extra.innerHTML = `<div class="empty"><div class="t1">찾은 것이 없습니다</div><div class="t2">앱 ${info.appCount}개에서 찾았습니다 · 초성·영문 자판 모두 봤습니다</div></div>`;
  } else {
    $list.innerHTML = items.map(row).join('');
  }
  $hint.textContent = q && items.length ? `${items.length}개` : '';
  $footRun.innerHTML = items[sel]?.source === 'calc' ? '<kbd>↵</kbd> 복사' : '<kbd>↵</kbd> 실행';
  // 카드 높이를 메인에 알린다 — 남는 투명 영역이 아래 창의 클릭을 먹지 않게
  requestAnimationFrame(() => window.whencommand.resize($panel.offsetHeight));
}

async function query() {
  const my = ++seq;
  const q = $q.value;
  $hint.textContent = '';
  const result = await window.whencommand.query(q);
  if (my !== seq) return; // 더 새 입력이 있었다
  items = result.items;
  sel = 0;
  render(result);
}

function move(d) {
  if (!items.length) return;
  sel = (sel + d + items.length) % items.length;
  $list.querySelectorAll('.row').forEach((el, i) => el.classList.toggle('sel', i === sel));
  $list.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' });
  $footRun.innerHTML = items[sel]?.source === 'calc' ? '<kbd>↵</kbd> 복사' : '<kbd>↵</kbd> 실행';
}

async function run(i = sel) {
  const it = items[i];
  if (!it) return;
  await window.whencommand.run(it.key);
}

$q.addEventListener('input', query);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); window.whencommand.hide(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
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

// 다시 부르면 **항상 빈 줄**로 시작한다(PANEL-07)
window.whencommand.onShown(() => { $q.value = ''; $q.focus(); query(); });
window.whencommand.onHidden(() => { $q.value = ''; });

(async () => {
  info = await window.whencommand.init();
  $q.placeholder = info.hotkeyOk ? '하려는 일을 적으세요' : `${info.hotkeyLabel} 를 등록하지 못했습니다 — 트레이에서 부르세요`;
  query();
})();
