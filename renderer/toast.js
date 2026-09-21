// renderer/toast.js — 받은 것을 그린다. 상태도 입력도 없다.
'use strict';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

window.toast.onShow(({ title, body, copied, icon, ms }) => {
  document.getElementById('ic').textContent = icon || '$';
  document.getElementById('t').textContent = title || '';
  const $b = document.getElementById('b');
  const text = String(body ?? '').trim();
  $b.textContent = text || '(출력 없음)';
  $b.classList.toggle('none', !text);
  document.getElementById('m').innerHTML =
    (copied ? '<span class="chip"><span class="d"></span>복사됨</span>' : '') +
    (ms != null ? `<span>${esc((ms / 1000).toFixed(1))}s</span>` : '');
});
