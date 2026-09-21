import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHeader, nameFromFile, route, locate, lineCount } from '../main/scripts.mjs';

test('헤더: 셔뱅을 건너뛰고 name·description·icon을 읽는다 (EXT-02)', () => {
  const h = parseHeader('#!/bin/sh\n# name: 내 IP\n# description: 로컬 IP 한 줄\n# icon: @\necho hi\n# name: 뒤늦은 주석은 무시\n', 'my-ip.sh');
  assert.deepEqual(h, { name: '내 IP', description: '로컬 IP 한 줄', icon: '@' });
});

test('헤더: 선언이 없으면 파일명이 이름이다 — -·_는 공백으로', () => {
  assert.equal(nameFromFile('git-status_all.ps1'), 'git status all');
  const h = parseHeader('Get-Date\n', 'git-status.ps1');
  assert.equal(h.name, 'git status');
  assert.equal(h.description, '');
  assert.equal(h.icon, '$');
});

test('헤더: 한글 키·= 구분자·// 주석도 받는다. 아이콘은 첫 글자 하나(이모지 포함)', () => {
  const h = parseHeader('// 이름 = 배포\n// 아이콘: 🚀x\n// 설명: 스테이징에 올린다\n', 'deploy.sh');
  assert.equal(h.name, '배포');
  assert.equal(h.icon, '🚀');
  assert.equal(h.description, '스테이징에 올린다');
});

test('헤더: 주석 아닌 첫 줄에서 멈춘다 — 본문 속 "name:"은 읽지 않는다', () => {
  const h = parseHeader('echo "name: 가짜"\n# name: 진짜\n', 'x.sh');
  assert.equal(h.name, 'x');
});

test('route: 3줄 이하 + exit 0은 토스트, 넘거나 실패하면 패널 (D-17)', () => {
  assert.equal(route({ code: 0, stdout: '192.168.0.12\n' }), 'toast');
  assert.equal(route({ code: 0, stdout: 'a\nb\nc\n' }), 'toast');
  assert.equal(route({ code: 0, stdout: '' }), 'toast'); // 출력 없는 성공도 토스트로 알린다
  assert.equal(route({ code: 0, stdout: 'a\nb\nc\nd' }), 'panel');
  assert.equal(route({ code: 1, stdout: 'ok' }), 'panel'); // 실패는 짧아도 패널 — 조용히 지나가지 않는다(EXT-05)
  assert.equal(route({ code: null, stdout: '' }), 'panel'); // 시간 초과로 죽인 것도 실패다
});

test('lineCount: 끝 개행은 줄로 세지 않는다', () => {
  assert.equal(lineCount(''), 0);
  assert.equal(lineCount('a\n'), 1);
  assert.equal(lineCount('a\r\nb\r\n'), 2);
});

test('locate: sh와 PowerShell의 오류 줄 번호를 찾는다, 없으면 null (EXT-05)', () => {
  assert.equal(locate('/Users/me/.whencommand/scripts/deploy.sh: line 14: git: command not found', '/Users/me/.whencommand/scripts/deploy.sh'), 14);
  assert.equal(locate('At C:\\Users\\me\\.whencommand\\scripts\\deploy.ps1:3 char:1\n+ throw "x"', 'C:\\Users\\me\\.whencommand\\scripts\\deploy.ps1'), 3);
  assert.equal(locate('error: failed to push some refs', '/x/deploy.sh'), null);
  assert.equal(locate('', ''), null);
});
