import test from 'node:test';
import assert from 'node:assert/strict';
import { toChoseong, keyboardToLatin, fuzzy, match, isChoseongQuery } from '../main/search.mjs';

test('초성 변환은 인덱스를 보존한다 — 강조 표시가 이 성질에 기댄다', () => {
  assert.equal(toChoseong('크롬 Chrome'), 'ㅋㄹ Chrome');
  assert.equal(toChoseong('크롬').length, '크롬'.length);
  assert.equal(toChoseong(''), '');
});

test('초성 질의 판정', () => {
  assert.ok(isChoseongQuery('ㅋㄹ'));
  assert.ok(!isChoseongQuery('크롬'));
  assert.ok(!isChoseongQuery('ㅋr'));
});

test('한글 자판으로 친 영문을 되돌린다 (SRCH-03)', () => {
  assert.equal(keyboardToLatin('초개ㅡㄷ'), 'chrome');   // c h r o m e
  assert.equal(keyboardToLatin('ㅍㄴㅊ'), 'vsc');
  assert.equal(keyboardToLatin('ㄴㅣㅁㅊㅏ'), 'slack');   // 낱자모도 1:1로 돌아간다
  assert.equal(keyboardToLatin('abc 가'), 'abc rk');     // 한글이 아닌 글자는 그대로
});

test('퍼지: 순서만 맞으면 걸리고, 순서가 틀리면 0', () => {
  assert.ok(fuzzy('vsc', 'Visual Studio Code').score > 0);
  assert.equal(fuzzy('csv', 'Visual Studio Code').score, 0);
  assert.equal(fuzzy('', 'x').score, 0);
});

test('퍼지: 단어 첫 글자 정렬을 우선한다 — vsc는 V·S·C에 붙는다', () => {
  const { positions } = fuzzy('vsc', 'Visual Studio Code');
  assert.deepEqual(positions, [0, 7, 14]);
});

test('퍼지: 연속 세 글자가 흩어진 머리글자 셋을 이긴다 — chr는 Chrome', () => {
  assert.ok(fuzzy('chr', 'Chrome').score > fuzzy('chr', 'Cache Handler Runner').score);
});

test('퍼지: 정확히 같으면 1', () => {
  assert.equal(fuzzy('ㅋㄹ', 'ㅋㄹ').score, 1);
  assert.equal(fuzzy('Slack', 'Slack').score, 1);
});

test('퍼지: 연속 매칭은 단어 첫 글자보다 우선한다 — chr는 c·h·r이 붙는다', () => {
  const { positions } = fuzzy('chr', 'Google Chrome Helper');
  assert.deepEqual(positions, [7, 8, 9]);
});

test('퍼지: 같은 질의면 짧은 이름이 조금 높다', () => {
  assert.ok(fuzzy('term', 'Terminal').score > fuzzy('term', 'Terminal Emulator Deluxe Edition').score);
});

test('match: 세 경로 중 최고 — 초성', () => {
  const r = match('ㅋㄹ', '크롬');
  assert.equal(r.via, 'choseong');
  assert.ok(r.score > 0.9);
  assert.deepEqual(r.positions, [0, 1]);
});

test('match: 세 경로 중 최고 — 자판 교정은 직접 매칭을 이기지 못한다', () => {
  const k = match('초개ㅡㄷ', 'Google Chrome');
  assert.equal(k.via, 'keyboard');
  assert.ok(k.score > 0);
  const d = match('chrome', 'Google Chrome');
  assert.ok(d.score > k.score);
});

test('match: 한글 대상에는 자판 교정을 시도하지 않는다', () => {
  assert.equal(match('초개', '초개 파일').via, 'direct');
});

test('match: 빈 질의·빈 대상은 0', () => {
  assert.equal(match('', 'x').score, 0);
  assert.equal(match('x', '').score, 0);
});
