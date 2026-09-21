import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 플랫폼 모듈은 electron을 import한다 — node --test에서는 electron이 없으므로
// 파일을 읽어 계약을 검사한다(whennote 승계). 이 테스트가 지키려는 것은 **두 구현이 어긋나지 않는 것**이다:
// 이 앱은 macOS에서 개발되므로 이번엔 Windows 쪽이 조용히 깨질 차례다(형제 앱과 반대).

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, 'main', 'platform', f), 'utf8');

// 두 구현이 반드시 내보내야 하는 이름. 하나라도 빠지면 그 OS에서만 undefined가 되어
// 호출하는 순간 죽는다 — 그 순간을 실기기에서 처음 만나면 늦다.
const CONTRACT = [
  'name',
  'defaultHotkey',
  'canAutoUpdate',
  'hotkeyLabel',
  'firstRunHint',
  'hotkeyConflict',
  'prepareApp',
  'activate',
  'deactivate',
  'trayImage',
  'listApps',
  'openApp',
  'scriptRunner',
  'exampleScript',
  'createFileSearch',
  'setLoginItem',
  'getLoginItem',
];

test('파일 검색은 OS 색인에 위임한다 — mdfind / Windows Search (D-09)', () => {
  assert.match(read('darwin.mjs'), /spawn\('mdfind', \['-name'/);
  assert.match(read('darwin.mjs'), /mdutil/); // FILE-05 — 색인 상태
  assert.match(read('win32.mjs'), /win32-search\.ps1/);
  const ps = read('win32-search.ps1');
  assert.match(ps, /Search\.CollatorDSO/);
  // 실제 경로는 ItemUrl에서 — ItemPathDisplay는 "C:\사용자\…" 같은 현지화 표시 경로다
  assert.match(ps, /System\.ItemUrl/);
  assert.ok(!/Fields\.Item\('System\.ItemPathDisplay'\)/.test(ps), 'ItemPathDisplay를 경로로 쓰면 안 된다');
  // 두 구현 모두 같은 모양의 객체를 돌려준다
  for (const impl of ['win32.mjs', 'darwin.mjs']) {
    for (const key of ['ready', 'status', 'query', 'dispose']) assert.match(read(impl), new RegExp(`\\b${key}\\s*[:(]`), `${impl}의 createFileSearch에 ${key}가 없다`);
  }
});

test('스크립트 실행기는 OS 관례를 따른다 — sh / powershell (EXT-03)', () => {
  assert.match(read('darwin.mjs'), /'\.sh'.*\/bin\/sh/);
  assert.match(read('win32.mjs'), /'\.ps1'[\s\S]*?cmd: 'powershell'/);
  // 한국어 Windows 콘솔은 cp949 — UTF-8로 못 박지 않으면 한글 출력이 깨진다
  assert.match(read('win32.mjs'), /OutputEncoding=\[System\.Text\.Encoding\]::UTF8/);
  // PowerShell 5.1은 BOM 없는 UTF-8을 cp949로 읽는다 — 예제 파일에 BOM
  assert.match(read('win32.mjs'), /\\uFEFF/);
});

for (const impl of ['win32.mjs', 'darwin.mjs']) {
  test(`${impl}는 플랫폼 계약의 모든 이름을 내보낸다`, () => {
    const src = read(impl);
    for (const key of CONTRACT) {
      assert.match(src, new RegExp(`\\b${key}\\s*[:(]`), `${impl}에 ${key}가 없다`);
    }
  });
}

test('OS 분기는 main/platform/ 안에만 있다 (PLAT-01)', () => {
  const dir = path.join(ROOT, 'main');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  const srcFiles = fs.existsSync(path.join(dir, 'sources'))
    ? fs.readdirSync(path.join(dir, 'sources')).filter((f) => f.endsWith('.mjs')).map((f) => path.join('sources', f))
    : [];
  for (const f of [...files, ...srcFiles]) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/process\.platform/.test(src), `main/${f}가 process.platform을 직접 본다`);
  }
});

test('플랫폼 진입점은 darwin일 때만 darwin 구현을 고른다', () => {
  assert.match(read('index.mjs'), /process\.platform === 'darwin' \? darwin : win32/);
});

test('단축키는 OS별로 다르다 — ⌘Space / Alt+Space (D-05)', () => {
  assert.match(read('darwin.mjs'), /defaultHotkey: 'Command\+Space'/);
  assert.match(read('win32.mjs'), /defaultHotkey: 'Alt\+Space'/);
});

test('macOS는 Dock 아이콘을 감춘다 (메뉴바 상주, PLAT-06)', () => {
  assert.match(read('darwin.mjs'), /app\.dock\?\.hide\(\)/);
  // Windows에는 dock이 없다 — 있으면 잘못 복사한 것이다
  assert.ok(!/app\.dock/.test(read('win32.mjs')));
});

test('macOS 활성화는 steal, 숨김은 app.hide — 실측 #7의 결론', () => {
  // Dock을 숨긴 액세서리 앱은 win.focus()만으로 앞에 나오지 않고, app.hide() 없이는 직전 앱으로 돌아가지 않는다.
  const src = read('darwin.mjs');
  assert.match(src, /app\.focus\(\{ steal: true \}\)/);
  assert.match(src, /deactivate\(win\) \{[\s\S]*?app\.hide\(\)/);
});

test('macOS 메뉴바 아이콘은 Template로 넘긴다 — 다크 모드에서 뭉개지지 않게', () => {
  assert.match(read('darwin.mjs'), /setTemplateImage\(true\)/);
});

test('macOS는 Spotlight 충돌을 시스템 설정에서 읽는다 (PLAT-03)', () => {
  assert.match(read('darwin.mjs'), /com\.apple\.symbolichotkeys/);
});

test('Windows는 알림 귀속을 위해 AppUserModelId를 세운다', () => {
  assert.match(read('win32.mjs'), /setAppUserModelId/);
});

test('자동 시작은 설정한 뒤 실제로 켜졌는지 돌려받아 확인한다 (PLAT-05)', () => {
  // 미서명 macOS에서 setLoginItemSettings는 실패해도 던지지 않는다 —
  // getLoginItemSettings로 되읽지 않으면 조용히 안 켜진 채로 켜졌다고 표시된다.
  for (const impl of ['win32.mjs', 'darwin.mjs']) {
    assert.match(read(impl), /getLoginItemSettings\(\)\.openAtLogin === openAtLogin/, `${impl}가 되읽어 확인하지 않는다`);
  }
});

test('두 OS의 첫 실행 안내는 아이콘 위치와 단축키를 모두 말한다 (PLAT-07)', () => {
  assert.match(read('win32.mjs'), /트레이/);
  assert.match(read('darwin.mjs'), /메뉴바/);
  for (const impl of ['win32.mjs', 'darwin.mjs']) {
    assert.match(read(impl), /firstRunHint: \(hotkeyLabel\)/, `${impl}의 안내가 단축키를 받지 않는다`);
  }
});

test('미검증 경고는 검증되지 않은 것에만 남아 있다', () => {
  // 양 OS 실기기 실측 완료(macOS 2026-09-19, Windows 2026-09-21). 남은 건 패키징본에서만 잴 수 있는 #2(로그인 항목)뿐이다 —
  // 두 구현 모두 그 사실을 머리에 적어 두고, 포괄적인 "미검증" 경고는 어디에도 없어야 한다.
  assert.doesNotMatch(read('win32.mjs'), /실기기에서 검증되지 않았다/);
  assert.match(read('win32.mjs'), /남은 미검증.*#2/);
  assert.match(read('darwin.mjs'), /아직 실기기에서 검증되지 않았다/);
});
