import test from 'node:test';
import assert from 'node:assert/strict';
import { calc, convert, fmt } from '../main/sources/calc.mjs';

test('사칙·우선순위·괄호·거듭제곱', () => {
  assert.equal(calc('1920*0.28').value, 537.6);
  assert.equal(calc('2+3*4').value, 14);
  assert.equal(calc('(2+3)*4').value, 20);
  assert.equal(calc('2^10').value, 1024);
  assert.equal(calc('2^3^2').value, 512); // 오른쪽 결합
  assert.equal(calc('10 % 3').value, 1);
});

test('단항 마이너스·함수·상수·천 단위 구분', () => {
  assert.equal(calc('-3+5').value, 2);
  assert.equal(calc('2*-3').value, -6);
  assert.equal(calc('sqrt(16)+1').value, 5);
  assert.equal(calc('round(2.6)*2').value, 6);
  assert.equal(calc('1,000*2').value, 2000);
  assert.ok(Math.abs(calc('2*pi').value - 6.283185307) < 1e-9);
});

test('표시: 부동소수 찌꺼기를 없앤다', () => {
  assert.equal(calc('0.1+0.2').display, '0.3');
  assert.equal(fmt(1234567), '1,234,567');
  assert.equal(fmt(537.6), '537.6');
});

test('수식이 아닌 것은 null — 검색을 밀어내지 않는다 (CALC-04)', () => {
  assert.equal(calc('노트'), null);
  assert.equal(calc('2026'), null);        // 숫자 하나는 파일·앱 이름일 수 있다
  assert.equal(calc('chrome 2'), null);    // 모르는 낱말
  assert.equal(calc('회의 3+1'), null);
  assert.equal(calc(''), null);
});

test('깨진 식·0으로 나누기는 null', () => {
  assert.equal(calc('2+'), null);
  assert.equal(calc('(2+3'), null);
  assert.equal(calc('10/0'), null);
  assert.equal(calc('2 3'), null);
});

test('단위 변환 (CALC-03)', () => {
  assert.ok(Math.abs(convert('3.5kg to lb').value - 7.7161792) < 1e-6);
  assert.equal(convert('3.5kg to lb').display, '7.716179176 lb'); // 유효숫자 10자리
  assert.equal(convert('100c to f').value, 212);
  assert.equal(convert('32 f in c').value, 0);
  assert.equal(convert('2 GB → MB').value, 2000);
  assert.equal(convert('1 gib to mib').value, 1024);
  assert.equal(convert('1 km to mi').display, '0.6213711922 mi');
});

test('단위 변환: 모르는 단위·서로 다른 종류는 null', () => {
  assert.equal(convert('3 kg to km'), null);
  assert.equal(convert('3 zz to kg'), null);
  assert.equal(convert('kg to lb'), null);
});
