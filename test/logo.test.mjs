import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLogo } from '../main/platform/win32-logo.mjs';

// 실측 #12(2026-10-19) 이 PC의 실제 파일 목록에서 뗀 것
const calc = [
  'CalculatorAppList.scale-200.png', 'CalculatorAppList.scale-200_contrast-black.png',
  'CalculatorAppList.targetsize-16.png', 'CalculatorAppList.targetsize-16_altform-unplated.png',
  'CalculatorAppList.targetsize-32.png', 'CalculatorAppList.targetsize-32_altform-unplated.png',
  'CalculatorAppList.targetsize-32_altform-lightunplated.png', 'CalculatorAppList.targetsize-32_altform-lightunplated_contrast-black.png',
  'CalculatorAppList.targetsize-48_altform-unplated.png', 'CalculatorAppList.targetsize-256_altform-unplated.png',
  'CalculatorLargeTile.scale-200.png',
];

test('로고: 32px 이상에서 가장 작은, 테마에 맞는 판 없는 변형', () => {
  assert.equal(pickLogo('CalculatorAppList.png', calc, { dark: true }), 'CalculatorAppList.targetsize-32_altform-unplated.png');
  assert.equal(pickLogo('CalculatorAppList.png', calc, { dark: false }), 'CalculatorAppList.targetsize-32_altform-lightunplated.png');
});

test('로고: 고대비는 버리고, 다른 자원 이름(LargeTile)은 섞지 않는다', () => {
  const only = ['CalculatorAppList.targetsize-32_altform-lightunplated_contrast-black.png', 'CalculatorLargeTile.scale-200.png'];
  assert.equal(pickLogo('CalculatorAppList.png', only), null);
});

test('로고: 한정자 순서가 거꾸로여도 읽는다 (Power Automate)', () => {
  const pa = ['PowerAutomateAppIcon.altform-lightunplated_targetsize-16.png', 'PowerAutomateAppIcon.altform-unplated_targetsize-32.png', 'PowerAutomateAppIcon.altform-unplated_targetsize-256.png'];
  assert.equal(pickLogo('PowerAutomateAppIcon.png', pa, { dark: true }), 'PowerAutomateAppIcon.altform-unplated_targetsize-32.png');
});

test('로고: 작은 판 없는 것보다 크기가 맞는 판 있는 것 — 키우면 흐려진다', () => {
  const f = ['A.targetsize-16_altform-unplated.png', 'A.targetsize-32.png'];
  assert.equal(pickLogo('A.png', f, { dark: true }), 'A.targetsize-32.png');
});

test('로고: 한정자 없는 원본 하나뿐이면 그것 (Intel·Python 관리자)', () => {
  assert.equal(pickLogo('setupx44.png', ['setupx44.png', 'other.png']), 'setupx44.png');
  // scale만 있으면 44px 논리 크기의 배율 — scale-100(44)이 scale-400(176)보다 가깝다
  assert.equal(pickLogo('S.png', ['S.scale-400.png', 'S.scale-100.png', 'S.scale-200.png']), 'S.scale-100.png');
});

test('로고: theme-light 변형은 어두운 테마에서 고르지 않는다 (사진)', () => {
  const f = ['PhotosAppList.scale-100.png', 'PhotosAppList.scale-100_altform-colorful_theme-light.png'];
  assert.equal(pickLogo('PhotosAppList.png', f, { dark: true }), 'PhotosAppList.scale-100.png');
});
