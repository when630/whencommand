import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ALIASES, loadUserAliases, mergeAliases, aliasesFor, matchWithAliases } from '../main/aliases.mjs';

const TABLE = mergeAliases(DEFAULT_ALIASES);

test('별칭: ㅋㄹ로 Google Chrome이 걸린다 — 초성이 별칭에 붙는다 (오픈이슈 #7)', () => {
  const aliases = aliasesFor('Google Chrome', TABLE);
  assert.ok(aliases.includes('크롬'));
  const m = matchWithAliases('ㅋㄹ', 'Google Chrome', aliases);
  assert.ok(m.score > 0, 'ㅋㄹ이 0점이면 안 된다');
  assert.equal(m.via, 'alias');
  assert.equal(m.alias, '크롬');
  assert.deepEqual(m.positions, []); // 제목에 없는 글자라 강조할 자리가 없다
});

test('별칭: 직접 맞은 것이 별칭보다 앞선다', () => {
  const m = matchWithAliases('chrome', 'Google Chrome', ['크롬']);
  assert.equal(m.via, 'direct');
});

test('별칭: 이름 조각은 대소문자 무시 부분 일치 — 여러 조각 중 하나만 맞아도 붙는다', () => {
  assert.ok(aliasesFor('Windows Terminal', TABLE).includes('터미널'));
  assert.ok(aliasesFor('iTerm', TABLE).includes('터미널'));
  assert.ok(aliasesFor('microsoft edge', TABLE).includes('엣지'));
  assert.deepEqual(aliasesFor('Blender', TABLE), []);
  assert.deepEqual(aliasesFor('', TABLE), []);
});

test('사용자 별칭 파일: 문자열·배열 둘 다 받고, 깨졌으면 빈 표 — 기본 표를 막지 않는다', () => {
  assert.deepEqual(loadUserAliases('{ "블렌더": "Blender", "브라우저": ["Chrome", "Edge"] }'), { 블렌더: ['Blender'], 브라우저: ['Chrome', 'Edge'] });
  assert.deepEqual(loadUserAliases('﻿{ "블렌더": "Blender" }'), { 블렌더: ['Blender'] }); // BOM 있는 파일
  assert.deepEqual(loadUserAliases('{ broken'), {});
  assert.deepEqual(loadUserAliases('[1,2]'), {});
  assert.deepEqual(loadUserAliases(''), {});
  assert.deepEqual(loadUserAliases('{ "": "x", "빈값": "" }'), {});
});

test('병합: 같은 별칭이면 사용자 것이 이긴다', () => {
  const t = mergeAliases({ 크롬: 'Google Chrome' }, { 크롬: ['Chromium'] });
  assert.deepEqual(t.크롬, ['Chromium']);
  assert.ok(aliasesFor('Chromium', t).includes('크롬'));
  assert.ok(!aliasesFor('Google Chrome', t).includes('크롬'));
});
