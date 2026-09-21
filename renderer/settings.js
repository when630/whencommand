// renderer/settings.js — 설정 창(D-16). 상태는 메인이 갖고 여기는 그린다. 실패는 돌려받은 값으로 확인해 화면에 적는다(PLAT-02·05) —
// 토글이 켜진 채 안 되는 것이 가장 나쁜 상태다.
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let st = null;
let capturing = false; // 단축키 바꾸는 중 — 다음 키 조합을 받는다
const opened = new Set(); // 사용법을 펼친 형제 앱 id — 다시 그려도(다시 읽기·refresh) 펼친 채로 남는다

function msg(text, kind = '') {
  const el = $('msg');
  el.textContent = text || '';
  el.className = `msg ${kind}`;
}

// 본문은 창 상한에 걸리면 스크롤되므로(offsetHeight는 잘린 높이) 내용 높이는 scrollHeight로 잰다. 메인이 화면에 맞춰 자른다
function fit() {
  requestAnimationFrame(() => window.settings.resize($('body').scrollHeight + document.querySelector('.tb').offsetHeight));
}

function render() {
  // 단축키
  $('hk').textContent = st.hotkeyLabel;
  $('hk').className = `keyf${st.hotkeyOk ? '' : ' bad'}`;
  const d = $('hkDesc');
  if (!st.hotkeyOk) { d.textContent = `${st.hotkeyLabel} 를 등록하지 못했습니다 — 다른 앱이 이미 쓰고 있습니다. 눌러서 바꾸세요`; d.className = 'd bad'; }
  else if (st.hotkeyConflict) { d.textContent = `${st.hotkeyConflict.app}도 이 조합을 씁니다 — 둘이 함께 뜹니다. ${st.hotkeyConflict.howTo}`; d.className = 'd warn'; }
  else { d.textContent = '어디서든 입력줄을 띄웁니다 · 눌러서 바꿉니다'; d.className = 'd'; }

  // 자동 실행
  $('as').className = `tog${st.openAtLogin ? ' on' : ''}`;
  const a = $('asDesc');
  if (!st.packaged) { a.textContent = '개발 실행에서는 켤 수 없습니다 — 설치본에서만'; a.className = 'd'; }
  else if (st.openAtLogin) { a.textContent = '켜져 있음 — 로그인 항목에서 확인됨'; a.className = 'd ok'; }
  else { a.textContent = '꺼져 있음'; a.className = 'd'; }

  // 스크립트
  $('scDesc').innerHTML = `<code>${esc(st.scripts.dir)}</code> · ${st.scripts.count}개 · 상단 주석 <code># name:</code>으로 이름·설명을 선언합니다`;

  // 형제 앱 — 폴더 자체가 없으면 섹션이 통째로 사라진다(LINK-01)
  const sec = $('sibSec');
  if (!st.siblings.exists) sec.innerHTML = '';
  else {
    const rows = [];
    for (const s of st.siblings.apps) {
      // 사용법은 캡션 뒤에 접혀 있다(D-25) — 상태표는 한 줄로 남고, 궁금한 사람만 연다
      const on = opened.has(s.id);
      rows.push(`<div class="sib can${on ? ' open' : ''}" data-app="${esc(s.id)}" title="${on ? '사용법 접기' : '사용법 펼치기'}"><span class="ic">${esc(s.icon)}</span><span class="nm">${esc(s.name)}</span><span class="cnt">${s.commands.length}개 명령 · <span class="cap">사용법</span><span class="chev">›</span></span><span class="st ok">연결됨</span></div>`);
      rows.push(`<div class="how${on ? ' open' : ''}" data-how="${esc(s.id)}">` +
        `<div class="lead"><kbd>${esc(st.hotkeyLabel)}</kbd> 를 누르고 아래처럼 칩니다. 제목 뒤에 띄어 쓴 것이 <span class="arg">‹ ›</span> 자리에 들어갑니다 — <code>${esc(s.name.toLowerCase())}</code> 만 쳐도 이 앱 명령이 전부 나옵니다</div>` +
        s.commands.map((c) => {
          const ln = esc(c.line).replace(/(‹[^›]*›|\[[^\]]*\])$/, '<span class="arg">$1</span>');
          const ds = [c.description && esc(c.description), c.argNote && `<span class="an">${esc(c.argNote)}</span>`].filter(Boolean).join(' · ');
          return `<div class="cmd"><div class="ln">${ln}</div>${ds ? `<div class="ds">${ds}</div>` : ''}</div>`;
        }).join('') + `</div>`);
    }
    for (const s of st.siblings.skipped) {
      const gone = s.error === '설치돼 있지 않다';
      rows.push(`<div class="sib off"><span class="ic">${esc(s.file[0]?.toUpperCase() ?? '?')}</span><span class="nm">${esc(s.file)}<small>${gone ? '매니페스트는 있으나 앱이 없음 · 목록에서 숨김' : esc(s.error) + ' · 이 파일만 건너뜀'}</small></span><span class="st ${gone ? 'gone' : 'bad'}">${gone ? '설치 안 됨' : '매니페스트 오류'}</span></div>`);
    }
    sec.innerHTML = `<div class="sec">형제 앱 — <code>${esc(st.siblings.dir)}</code> 를 자동으로 읽습니다</div>` +
      (rows.join('') || `<div class="empty">아직 매니페스트를 떨어뜨린 형제 앱이 없습니다. WHENNOTE 0.1.1부터 실행되면 스스로 등록합니다.</div>`) +
      `<div class="opt" style="padding-top:4px"><div class="l"><div class="d">규약: <code>when630/when-protocol</code></div></div><span class="btn" id="refreshLists">다시 읽기</span><span class="btn" id="openSiblings">폴더 열기</span></div>`;
    $('refreshLists').addEventListener('click', async () => { await window.settings.refreshLists(); await load(); msg('목록을 다시 읽었습니다', 'ok'); });
    $('openSiblings').addEventListener('click', () => window.settings.openSiblings());
    for (const row of sec.querySelectorAll('.sib.can')) {
      row.addEventListener('click', () => {
        const id = row.dataset.app;
        const how = sec.querySelector(`[data-how="${id}"]`);
        const on = !opened.has(id);
        if (on) opened.add(id); else opened.delete(id);
        row.classList.toggle('open', on);
        row.title = on ? '사용법 접기' : '사용법 펼치기';
        how.classList.toggle('open', on);
        fit(); // 펼치면 창이 자란다 — 상한에 걸리면 본문이 스크롤된다
        if (on) requestAnimationFrame(() => how.scrollIntoView({ block: 'nearest' }));
      });
    }
  }

  // 정보
  $('ver').textContent = `WHENCOMMAND ${st.version}`;
  $('verDesc').innerHTML = `${st.packaged ? '설치본' : '개발 실행'} · ${esc(st.platform)} · 랭킹 <code>${esc(st.store.file)}</code>`;
  renderUpdate(st.update);
  fit();
}

// 업데이트 줄(REL-02) — 트레이와 같은 문구(update.mjs updateLine). 버튼은 상태에 따라 확인·설치·받기가 된다
function renderUpdate(u) {
  const el = $('updLine');
  el.textContent = u.line;
  el.className = `d${u.status === 'error' ? ' bad' : u.status === 'ready' || u.status === 'available' ? ' ok' : ''}`;
  const b = $('upd');
  b.textContent = u.status === 'ready' ? (u.canAutoUpdate ? '지금 설치' : '받는 곳 열기') : u.status === 'available' && !u.canAutoUpdate ? '받는 곳 열기' : '업데이트 확인';
  b.classList.toggle('busy', u.status === 'checking' || u.status === 'downloading');
}

async function load() {
  st = await window.settings.get();
  render();
}

// ── 단축키 바꾸기(PLAT-02) — 칸을 누르고 조합을 누른다. 실패는 메인이 돌려주고, 이전 조합으로 되돌린 상태다
const CODE_TO_ACCEL = {
  Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Comma: ',', Period: '.', Slash: '/',
  Backquote: '`', Quote: "'",
};
function accelKeyOf(e) {
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (/^Numpad[0-9]$/.test(code)) return 'num' + code.slice(6);
  return CODE_TO_ACCEL[code] ?? null;
}
function accelModsOf(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push(st.platform === 'darwin' ? 'Command' : 'Super');
  return mods;
}
function startCapture() {
  capturing = true;
  $('hk').textContent = '키를 누르세요…';
  $('hk').className = 'keyf rec';
  $('hkDesc').textContent = '원하는 조합을 지금 누르세요 · Esc 취소';
  $('hkDesc').className = 'd';
}
async function finishCapture(accel) {
  capturing = false;
  if (!accel) return render();
  const r = await window.settings.hotkeySet(accel);
  await load();
  if (r.ok) msg(`단축키를 ${r.label} 로 바꿨습니다`, 'ok');
  else msg(r.error, 'bad');
}
$('hk').addEventListener('click', () => { if (!capturing) startCapture(); });

document.addEventListener('keydown', (e) => {
  if (capturing) {
    e.preventDefault();
    if (e.key === 'Escape') return finishCapture(null);
    const key = accelKeyOf(e);
    const mods = accelModsOf(e);
    if (!key) return; // 수식키만 눌린 상태
    if (!mods.length && !/^F\d+$/.test(key)) { $('hkDesc').textContent = '수식키(Ctrl·Alt·Shift)를 함께 눌러 주세요 — F키는 단독도 됩니다'; return; }
    return finishCapture([...mods, key].join('+'));
  }
  if (e.key === 'Escape') window.settings.close();
});

// ── 자동 실행(PLAT-05) — 돌려받은 값으로 토글을 맞춘다
$('as').addEventListener('click', async () => {
  if (!st.packaged) return msg('개발 실행에서는 켤 수 없습니다', 'bad');
  $('as').classList.add('busy');
  const r = await window.settings.autostart(!st.openAtLogin);
  await load();
  if (!r.ok) msg(r.error || '켜지 못했습니다 — 미서명 앱은 시스템이 거부할 수 있습니다. 시스템 설정 › 로그인 항목에서 직접 추가하세요', 'bad');
  else msg(r.openAtLogin ? '로그인할 때 자동으로 실행됩니다' : '자동 실행을 껐습니다', 'ok');
});

$('openScripts').addEventListener('click', () => window.settings.openScripts());
$('exp').addEventListener('click', async () => {
  const r = await window.settings.exportSettings();
  if (r.ok) msg(`내보냈습니다 — ${r.path}`, 'ok');
  else if (!r.canceled) msg(r.error || '내보내기에 실패했습니다', 'bad');
});
$('imp').addEventListener('click', async () => {
  const r = await window.settings.importSettings();
  await load();
  if (r.ok) msg(`가져왔습니다${r.hotkeyFailed ? ` — 단축키 ${r.hotkeyFailed} 는 등록되지 않아 이전 조합을 유지합니다` : ''}`, r.hotkeyFailed ? 'bad' : 'ok');
  else if (!r.canceled) msg(r.error || '가져오기에 실패했습니다', 'bad');
});
$('resetPos').addEventListener('click', async () => { await window.settings.resetPosition(); msg('입력줄이 기본 자리로 돌아갑니다', 'ok'); });

// 랭킹 초기화 — 두 번 눌러야 한다. 되돌릴 수 없는 일에 확인 대화상자를 하나 더 띄우는 대신 버튼이 스스로 확인이 된다
let armed = null;
$('resetRank').addEventListener('click', async () => {
  const b = $('resetRank');
  if (!armed) {
    b.textContent = '정말 초기화';
    b.classList.add('confirm');
    armed = setTimeout(() => { armed = null; b.textContent = '초기화'; b.classList.remove('confirm'); }, 3000);
    return;
  }
  clearTimeout(armed); armed = null;
  b.textContent = '초기화'; b.classList.remove('confirm');
  const r = await window.settings.resetRanking();
  msg(r.ok ? '랭킹을 지웠습니다 — 처음 상태입니다' : '지우지 못했습니다', r.ok ? 'ok' : 'bad');
});

$('upd').addEventListener('click', async () => {
  const u = st.update;
  if (u.status === 'ready' || (u.status === 'available' && !u.canAutoUpdate)) { await window.settings.updateInstall(); return; }
  $('updLine').textContent = '업데이트 확인 중…';
  const r = await window.settings.updateCheck();
  st.update = { ...st.update, ...r };
  renderUpdate(st.update);
});

$('close').addEventListener('click', () => window.settings.close());
window.settings.onRefresh(() => { msg(''); load(); });
document.fonts?.ready.then(() => fit()); // 웹폰트가 늦게 오면 줄 높이가 바뀐다 — 한 번 더 맞춘다
load();
