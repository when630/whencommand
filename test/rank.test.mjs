import test from 'node:test';
import assert from 'node:assert/strict';
import { recency, score, rank, frequent } from '../main/rank.mjs';

const NOW = 1_700_000_000_000;
const H = 3_600_000;

test('최근성 버킷 경계', () => {
  assert.equal(recency(0), 4);
  assert.equal(recency(H - 1), 4);
  assert.equal(recency(H), 2);
  assert.equal(recency(24 * H - 1), 2);
  assert.equal(recency(24 * H), 1);
  assert.equal(recency(7 * 24 * H), 0.4);
  assert.equal(recency(NaN), 0.4);
});

test('매칭 0이면 아무리 자주 골랐어도 0', () => {
  assert.equal(score(0, { hits: 999, lastAt: NOW }, NOW), 0);
});

test('고른 적 없으면 매칭 점수 그대로', () => {
  assert.equal(score(0.7, null, NOW), 0.7);
  assert.equal(score(0.7, { hits: 0 }, NOW), 0.7);
});

test('빈도 100은 빈도 10의 10배가 아니다 (log1p)', () => {
  const a = score(1, { hits: 10, lastAt: NOW }, NOW);
  const b = score(1, { hits: 100, lastAt: NOW }, NOW);
  assert.ok(b > a);
  assert.ok(b / a < 2);
});

test('같은 빈도면 최근 것이 위', () => {
  const fresh = score(1, { hits: 3, lastAt: NOW - H / 2 }, NOW);
  const stale = score(1, { hits: 3, lastAt: NOW - 30 * 24 * H }, NOW);
  assert.ok(fresh > stale);
});

test('rank: 매칭이 낮아도 자주 고른 것이 위로 온다 — 그러나 매칭 0은 빠진다', () => {
  const items = [
    { key: 'a', title: 'Alpha', base: 0.9 },
    { key: 'b', title: 'Beta', base: 0.5 },
    { key: 'c', title: 'Gamma', base: 0 },
  ];
  const picks = new Map([['b', { hits: 5, lastAt: NOW }]]);
  const out = rank(items, picks, NOW);
  assert.deepEqual(out.map((x) => x.key), ['b', 'a']);
});

test('rank: 동점이면 짧은 제목이 먼저', () => {
  const out = rank([{ key: 'x', title: 'Terminal Pro', base: 0.5 }, { key: 'y', title: 'Term', base: 0.5 }], new Map(), NOW);
  assert.deepEqual(out.map((x) => x.key), ['y', 'x']);
});

test('frequent: 한 번도 고르지 않은 것은 빈 입력에 나오지 않는다 (첫 실행은 힌트)', () => {
  const items = [{ key: 'a', title: 'A', base: 1 }, { key: 'b', title: 'B', base: 1 }];
  assert.deepEqual(frequent(items, new Map(), 4, NOW), []);
  const picks = new Map([['b', { hits: 2, lastAt: NOW }]]);
  assert.deepEqual(frequent(items, picks, 4, NOW).map((x) => x.key), ['b']);
});
