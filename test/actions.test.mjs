import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsFor, altAction } from '../main/actions.mjs';

const app = { source: 'apps', title: 'Google Chrome', action: { type: 'open-app', path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Google Chrome.lnk' } };
const uwp = { source: 'apps', title: 'Claude', action: { type: 'open-app', path: 'shell:AppsFolder\\Anthropic.Claude_abc!App' } };
const file = { source: 'files', kind: 'file', title: 'README.md', action: { type: 'open-path', path: 'C:\\Users\\me\\README.md' }, alt: { type: 'reveal', path: 'C:\\Users\\me\\README.md' } };
const dir = { source: 'files', kind: 'dir', title: 'when630', action: { type: 'open-path', path: 'C:\\Users\\me\\when630' } };
const script = { source: 'scripts', title: '내 IP', action: { type: 'run-script', path: 'C:\\Users\\me\\.whencommand\\scripts\\my-ip.ps1' } };
const sib = { source: 'siblings', title: '메모 검색', action: { type: 'open-url', url: 'whennote://search?q=%ED%9A%8C' } };
const calc = { source: 'calc', title: '537.6', action: { type: 'copy', text: '537.6' } };
const sys = { source: 'system', title: '화면 잠금', action: { type: 'system', id: 'lock' } };

test('동작 목록: 첫째는 항목의 본 동작이고 종류별로 위치 열기·경로 복사가 붙는다 (PANEL-12)', () => {
  assert.deepEqual(actionsFor(app).map((a) => a.id), ['open', 'reveal', 'copy-path']);
  assert.equal(actionsFor(app)[0].action, app.action);
  assert.deepEqual(actionsFor(app)[2].action, { type: 'copy', text: app.action.path });
  assert.deepEqual(actionsFor(file).map((a) => a.id), ['open', 'reveal', 'copy-path']);
  assert.equal(actionsFor(dir)[0].title, '폴더 열기');
  assert.deepEqual(actionsFor(script).map((a) => a.id), ['run', 'edit', 'reveal']);
  assert.deepEqual(actionsFor(script)[1].action, { type: 'open-path', path: script.action.path });
  assert.deepEqual(actionsFor(sib).map((a) => a.id), ['run', 'copy-url']);
  assert.deepEqual(actionsFor(sib)[1].action, { type: 'copy', text: sib.action.url });
  assert.deepEqual(actionsFor(calc).map((a) => a.id), ['copy']);
  assert.deepEqual(actionsFor(sys).map((a) => a.id), ['run']);
});

test('동작 목록: UWP 앱(shell:)은 파일이 아니라 위치·경로가 없다', () => {
  assert.deepEqual(actionsFor(uwp).map((a) => a.id), ['open']);
});

test('보조 동작(⌘·Ctrl+Enter): 파일·앱은 폴더에서 보기, 스크립트는 열기, 그 밖은 없다(본 동작과 같다)', () => {
  assert.deepEqual(altAction(file), { type: 'reveal', path: file.action.path });
  assert.deepEqual(altAction(app), { type: 'reveal', path: app.action.path });
  assert.equal(altAction(uwp), null);
  assert.deepEqual(altAction(script), { type: 'open-path', path: script.action.path });
  assert.equal(altAction(sib), null);
  assert.equal(altAction(calc), null);
  assert.equal(altAction(null), null);
});
