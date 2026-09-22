import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntents, routeIntents, THRESHOLD } from '../main/intent.mjs';

const cal = { id: 'whencalendar', name: 'WHENCALENDAR', commands: [{ id: 'add', title: '일정 추가', args: [{ name: 'text', optional: true }] }, { id: 'search', title: '일정 검색', args: [{ name: 'q' }] }, { id: 'open', title: '일정 보기', args: [] }] };
const work = { id: 'whenwork', name: 'WHENWORK', commands: [{ id: 'add', title: '할 일 추가', args: [{ name: 'text' }] }, { id: 'today', title: '오늘 할 일', args: [] }] };
const note = { id: 'whennote', name: 'WHENNOTE', commands: [{ id: 'capture', title: '퀵 메모', args: [{ name: 'text', optional: true }] }, { id: 'search', title: '메모 검색', args: [{ name: 'q' }] }] };
const mail = { id: 'whenmail', name: 'WHENMAIL', commands: [{ id: 'search', title: '사람 검색', args: [{ name: 'q' }] }] };
const music = { id: 'whenmusic', name: 'WHENMUSIC', commands: [{ id: 'history', title: '청취 이력', args: [{ name: 'q', optional: true }] }, { id: 'now', title: '지금 듣는 것', args: [] }] };
const ALL = [cal, work, note, mail, music];
const top = (q) => detectIntents(q)[0]?.intent ?? null;

test('의도: 시각·날짜 어투는 schedule, 해야·까지는 todo, 메모·적어는 note, 직함은 person, 노래·들은은 music (SRCH-10)', () => {
  assert.equal(top('담주 화 3시 김부장 미팅'), 'schedule');
  assert.equal(top('내일 회의'), 'schedule');
  assert.equal(top('10월 3일 출장'), 'schedule');
  assert.equal(top('금요일까지 보고서 보내기'), 'todo');
  assert.equal(top('우유 사기'), 'todo');
  assert.equal(top('이 아이디어 적어 둬'), 'note');
  assert.equal(top('김부장 연락처'), 'person');
  assert.equal(top('홍길동 님 메일'), 'person');
  assert.equal(top('어제 들은 노래'), 'music');
});

test('의도: 문턱 아래는 아무것도 아니다 — 앱 이름·짧은 글·회의록처럼 낱말 하나만 걸린 것', () => {
  assert.deepEqual(detectIntents('chrome'), []);
  assert.deepEqual(detectIntents('회의록 정리'), []); // 회의(1) + 정리하기? — '정리'만으로는 todo도 아니다
  assert.deepEqual(detectIntents('메'), []);
  assert.ok(THRESHOLD >= 2);
});

test('의도: 한 문장에 둘이 겹치면 무게순으로 둘 다 — 시각이 직함보다 무겁다', () => {
  const r = detectIntents('담주 화 3시 김부장 미팅');
  assert.deepEqual(r.map((x) => x.intent), ['schedule', 'person']);
  assert.ok(r[0].weight > r[1].weight);
});

test('라우팅: 알려진 앱 표로 명령을 찾고, 글을 받을 인자가 있는 명령만 (D-35)', () => {
  const r = routeIntents('담주 화 3시 김부장 미팅', ALL);
  assert.deepEqual(r.map((x) => `${x.manifest.id}:${x.command.id}`), ['whencalendar:add', 'whenmail:search']);
  assert.deepEqual(routeIntents('금요일까지 보고서 보내기', ALL).map((x) => x.command.title), ['할 일 추가', '일정 추가']);
  assert.deepEqual(routeIntents('어제 들은 노래', ALL).map((x) => x.command.id), ['history']);
  assert.deepEqual(routeIntents('chrome', ALL), []);
  assert.deepEqual(routeIntents('내일 회의', []), []);
});

test('라우팅: 매니페스트의 intents 선언이 있으면 표보다 우선한다', () => {
  const custom = { id: 'whennote', name: 'WHENNOTE', commands: [{ id: 'new', title: '새 메모', args: [{ name: 'text', optional: true }], intents: ['note', 'todo'] }, { id: 'capture', title: '퀵 메모', args: [{ name: 'text', optional: true }] }] };
  const r = routeIntents('이 아이디어 적어 둬', [custom]);
  assert.deepEqual(r.map((x) => x.command.id), ['new']); // capture는 선언이 없고 표는 이 앱에 선언이 있으면 안 쓴다… 선언한 명령만
  assert.deepEqual(routeIntents('우유 사기', [custom]).map((x) => x.command.id), ['new']);
});
