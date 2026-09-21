import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, splitCommand, buildUrl, missingArg } from '../main/manifest.mjs';

const GOOD = {
  protocol: 1,
  id: 'whennote',
  name: 'WHENNOTE',
  scheme: 'whennote',
  verify: { darwin: '/Applications/WHENNOTE.app', win32: '%LOCALAPPDATA%\\Programs\\WHENNOTE\\WHENNOTE.exe' },
  commands: [
    { id: 'capture', title: '퀵 메모', description: '작은 메모 창', args: [{ name: 'text', type: 'string', optional: true }] },
    { id: 'search', title: '메모 검색', args: [{ name: 'q', type: 'string' }] },
    { id: 'open', title: '메모 창 열기' },
  ],
};

test('매니페스트: 올바른 파일은 정규화되어 읽힌다', () => {
  const r = parseManifest(JSON.stringify(GOOD));
  assert.equal(r.ok, true);
  assert.equal(r.manifest.commands.length, 3);
  assert.deepEqual(r.manifest.commands[1].args, [{ name: 'q', type: 'string', optional: false }]);
  assert.deepEqual(r.manifest.commands[2].args, []);
  assert.equal(r.manifest.commands[0].description, '작은 메모 창');
});

test('매니페스트: 깨진 JSON·없는 필드·모르는 protocol은 그 파일만 건너뛰는 오류가 된다 (LINK-05)', () => {
  assert.equal(parseManifest('{ not json').ok, false);
  assert.match(parseManifest('{ not json').error, /JSON/);
  assert.match(parseManifest(JSON.stringify({ ...GOOD, protocol: 2 })).error, /protocol/);
  assert.match(parseManifest(JSON.stringify({ ...GOOD, scheme: undefined })).error, /scheme/);
  assert.match(parseManifest(JSON.stringify({ ...GOOD, commands: [] })).error, /commands/);
  assert.match(parseManifest(JSON.stringify({ ...GOOD, id: 'When Note' })).error, /id/);
  assert.match(parseManifest(JSON.stringify({ ...GOOD, commands: [{ id: 'aa', title: 'x' }, { id: 'aa', title: 'y' }] })).error, /겹친다/);
  assert.match(parseManifest(JSON.stringify({ ...GOOD, commands: [{ id: 'aa', title: 'x', args: [{ name: 'n', type: 'number' }] }] })).error, /string만/);
  assert.equal(parseManifest('[]').ok, false);
  assert.equal(parseManifest('').ok, false);
});

test('splitCommand: 제목으로 시작하면 나머지가 인자, 제목만이면 빈 문자열, 아니면 null', () => {
  assert.equal(splitCommand('메모 검색 회의록', '메모 검색'), '회의록');
  assert.equal(splitCommand('메모 검색', '메모 검색'), '');
  assert.equal(splitCommand('  메모 검색   9월 회의 ', '메모 검색'), '9월 회의');
  assert.equal(splitCommand('메모 검색기', '메모 검색'), null); // 제목 뒤에 공백이 없으면 다른 말이다
  assert.equal(splitCommand('ㅁㅁ', '메모 검색'), null); // 초성은 퍼지 매칭의 몫
  assert.equal(splitCommand('Quick Note hi', 'quick note'), 'hi');
});

test('buildUrl: 딥링크는 scheme://command?arg=값, 값은 URL 인코딩 (LINK-03)', () => {
  const m = parseManifest(JSON.stringify(GOOD)).manifest;
  assert.equal(buildUrl(m, m.commands[1], '회의록'), 'whennote://search?q=%ED%9A%8C%EC%9D%98%EB%A1%9D');
  assert.equal(buildUrl(m, m.commands[1], ''), 'whennote://search'); // 인자를 안 줬으면 쿼리도 없다 — 형제 앱이 빈 값을 처리한다
  assert.equal(buildUrl(m, m.commands[2], '아무말'), 'whennote://open'); // 인자가 없는 명령은 나머지를 버린다
  assert.equal(buildUrl(m, m.commands[0], 'a b&c=d'), 'whennote://capture?text=a%20b%26c%3Dd');
});

test('missingArg: 필수 인자를 안 받았을 때만 이름을 돌려준다', () => {
  const m = parseManifest(JSON.stringify(GOOD)).manifest;
  assert.equal(missingArg(m.commands[1], ''), 'q');
  assert.equal(missingArg(m.commands[1], '회의'), null);
  assert.equal(missingArg(m.commands[0], ''), null); // optional
  assert.equal(missingArg(m.commands[2], ''), null); // 인자 없음
});
