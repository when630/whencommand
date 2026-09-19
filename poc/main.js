'use strict'

// whencommand 입력줄 PoC — 03 §11 실측 로그의 빈칸을 채운다. 버릴 코드.
// 검증 목표 (번호는 docs/03_기술_스펙.md §11과 같다)
//  1) globalShortcut.register()가 true를 돌려주고도 안 눌리는가 (macOS)
//     → 대조군 Ctrl+Alt+W(비어 있는 조합)와 나란히 등록해 둘 다 눌리는지 본다
//  2) 미서명 setLoginItemSettings가 실제로 켜지는가
//     → 시스템을 건드리므로 `npm run login-item`으로만. 읽고→켜고→읽고→원상복구
//  3) app.dock.hide()로 Dock 아이콘이 완전히 빠지는가
//  4) Command+Space를 Spotlight보다 먼저 잡는가 (macOS)
//  5) Alt+Space를 창 시스템 메뉴보다 먼저 잡는가 (Windows)
//  6) 숨긴 창 show() → 첫 페인트까지 ms — 미리 만든 창 vs 매번 새 창, 각 5회
//  7) 숨긴 뒤 직전 앱으로 포커스가 돌아가는가 — app.hide() vs win.hide()
//
// 실행: cd poc && npm i && npm start
//   3·6·7은 켜자마자 자동으로 돌고, 1·4·5는 사람이 단축키를 눌러야 한다.
//   결과는 콘솔과 poc/results.json에 쌓인다. Ctrl+Alt+Q 종료.
//   macOS는 첫 실행 때 "System Events 제어" 허용을 물을 수 있다(#7이 frontmost를 읽는다).

const { app, BrowserWindow, globalShortcut, screen, ipcMain } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const IS_MAC = process.platform === 'darwin'
const PANEL_W = 560
const PANEL_H = 330
const OUT = path.join(__dirname, 'results.json')

// ── #3 Dock — whenReady 전에 불러도 된다 (형제 앱 darwin.mjs 승계)
if (IS_MAC) app.dock?.hide()

const results = {
  platform: process.platform,
  electron: process.versions.electron,
  startedAt: new Date().toISOString(),
  dock: null,          // #3
  shortcuts: {},       // #1 #4 #5 — { accel: { registerReturned, isRegistered, fires, lastFireAt } }
  latency: { prebuilt: [], fresh: [], hotkey: [] },   // #6 ms
  focus: [],           // #7 [{ method, before, during, activated, keyWindow, after, restored }]
  hotkeyFocus: [],     // #7 사람이 눌렀을 때 [{ accel, frontmost, activated, keyWindow }]
  loginItem: null,     // #2
  notes: []
}

let win = null
let autoDone = false   // 자동 측정이 끝나기 전엔 blur→hide를 끈다 (#7 측정이 흔들린다)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }

function log (...a) { console.log(new Date().toISOString().slice(11, 23), ...a) }
function save () {
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2))
  if (win && !win.isDestroyed()) win.webContents.send('stats', summary())
}
function summary () {
  return {
    dock: results.dock,
    shortcuts: results.shortcuts,
    prebuilt: median(results.latency.prebuilt),
    fresh: median(results.latency.fresh),
    hotkey: median(results.latency.hotkey),
    focus: results.focus,
    hotkeyFocus: results.hotkeyFocus,
    loginItem: results.loginItem,
    autoDone
  }
}

// ── 창
function panelOptions () {
  return {
    width: PANEL_W,
    height: PANEL_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  }
}

// 화면 위 28% 중앙 — 커서가 있는 디스플레이 기준 (D-08, place.mjs centerY:false)
function place (w) {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const a = d.workArea
  w.setPosition(
    Math.round(a.x + (a.width - PANEL_W) / 2),
    Math.round(a.y + a.height * 0.28)
  )
}

function decorate (w) {
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}

function createPanel () {
  win = new BrowserWindow(panelOptions())
  decorate(win)
  win.loadFile(path.join(__dirname, 'panel.html'))
  win.on('blur', () => { if (autoDone && win.isVisible()) hidePanel('blur') })
  return new Promise(resolve => win.webContents.once('did-finish-load', resolve))
}

// ── #6 표시 지연
// 렌더러가 'shown'을 받고 rAF 두 번 뒤 Date.now()를 돌려준다. 양쪽 다 벽시계라 origin 차이가 없다.
function waitPainted (wc) {
  return new Promise(resolve => {
    const on = (e, t) => { if (e.sender.id === wc.id) { ipcMain.off('painted', on); resolve(t) } }
    ipcMain.on('painted', on)
  })
}
async function showAndMeasure (w) {
  const p = waitPainted(w.webContents)
  const t0 = Date.now()
  place(w)
  w.show()
  w.webContents.send('shown')
  return (await p) - t0
}
async function measurePrebuilt (n = 5) {
  for (let i = 0; i < n; i++) {
    await sleep(300)
    const ms = await showAndMeasure(win)
    results.latency.prebuilt.push(ms)
    log(`#6 미리 만든 창 show() → 페인트 ${ms}ms`)
    await sleep(300)
    win.hide()
  }
  save()
}
async function measureFresh (n = 5) {
  for (let i = 0; i < n; i++) {
    await sleep(300)
    const t0 = Date.now()
    const w = new BrowserWindow(panelOptions())
    decorate(w)
    const p = waitPainted(w.webContents)
    w.loadFile(path.join(__dirname, 'panel.html'))
    await new Promise(r => w.webContents.once('did-finish-load', r))
    place(w)
    w.show()
    w.webContents.send('shown')
    const ms = (await p) - t0
    results.latency.fresh.push(ms)
    log(`#6 새 창 생성 → 페인트 ${ms}ms`)
    await sleep(300)
    w.destroy()
  }
  save()
}

// ── #7 포커스 복귀
function frontmost () {
  if (!IS_MAC) return '(Windows: 수동 확인)'
  try {
    return execFileSync('osascript', [
      '-e', 'tell application "System Events" to get name of first application process whose frontmost is true'
    ], { encoding: 'utf8', timeout: 3000 }).trim()
  } catch (e) {
    return `(읽기 실패: ${String(e.message).split('\n')[0].slice(0, 80)})`
  }
}
// 1차 실측(2026-09-19): Dock을 숨긴 앱은 win.focus()만으로 앞으로 나오지 않았다(during=Safari).
// 그래서 'steal' 변형을 더해 app.focus({steal:true})가 활성화를 만드는지 본다 — 활성화가 안 되면 복귀 여부는 무의미하다.
// 2차(2026-09-19): steal도 안 됐다. 가설 (A) dock.hide()가 원인 → 'policy'·'dockshow' 우회로 확인
//                   가설 (B) OS의 협력적 활성화 → 프로그램으론 불가, 사람이 단축키를 눌러야 판정 (hotkeyFocus)
async function testFocus (method) {
  const before = frontmost()
  if (IS_MAC && method.startsWith('policy')) app.setActivationPolicy('regular')
  if (IS_MAC && method.startsWith('dockshow')) await app.dock.show()
  place(win)
  win.show()
  if (IS_MAC && (method.startsWith('steal') || method.startsWith('policy') || method.startsWith('dockshow'))) app.focus({ steal: true })
  win.focus()
  await sleep(500)
  const during = frontmost()
  const keyWindow = win.isFocused()          // 앱이 앞으로 안 나와도 창이 키 입력을 받는지 — 두 번째 신호
  const activated = /electron|whencommand/i.test(during)
  if (method.endsWith('app.hide') && IS_MAC) app.hide()
  else win.hide()
  if (IS_MAC && method.startsWith('policy')) app.setActivationPolicy('accessory')
  if (IS_MAC && method.startsWith('dockshow')) app.dock.hide()
  await sleep(500)
  const after = frontmost()
  const r = { method, before, during, activated, keyWindow, after, restored: before === after }
  results.focus.push(r)
  log(`#7 ${method}: ${before} → (${during}${activated ? '' : ' — 활성화 안 됨'}, isFocused=${keyWindow}) → ${after}  ${activated && r.restored ? '✓ 복귀' : activated ? '✗ 안 돌아옴' : '— 판정 불가'}`)
  save()
}

// ── #2 로그인 항목 (opt-in)
function testLoginItem () {
  const orig = app.getLoginItemSettings().openAtLogin
  app.setLoginItemSettings({ openAtLogin: true, args: [] })
  const readBack = app.getLoginItemSettings().openAtLogin
  app.setLoginItemSettings({ openAtLogin: orig, args: [] })   // 원상복구
  const restored = app.getLoginItemSettings().openAtLogin === orig
  results.loginItem = { orig, setTrueThenRead: readBack, ok: readBack === true, restored, packaged: app.isPackaged }
  results.notes.push('#2는 패키징된 미서명 앱에서 다시 재야 한다 — 개발 실행은 Electron 바이너리를 등록하므로 반쪽 답이다')
  log(`#2 로그인 항목: 원래 ${orig} → 켜고 읽음 ${readBack} → 복구 ${restored}  (packaged=${app.isPackaged})`)
  save()
}

// ── 단축키 (#1 #4 #5)
let typedSince = 0
ipcMain.on('typed', (_e, n) => {
  typedSince = n
  const last = results.hotkeyFocus[results.hotkeyFocus.length - 1]
  if (last) { last.typed = n; save() }
  if (n === 1 || n % 5 === 0) log(`  타이핑 ${n}글자 들어옴 (${last?.mode})`)
})
function hidePanel (why) {
  const before = frontmost()
  win.hide()
  if (IS_MAC) app.hide()   // 직전 앱으로 포커스 복귀 — #7 결과에 따라 확정
  if (IS_MAC && usingPolicy) app.setActivationPolicy('accessory')
  const last = results.hotkeyFocus[results.hotkeyFocus.length - 1]
  setTimeout(() => {
    const after = frontmost()
    if (last) { last.hiddenBy = why; last.after = after; save() }
    log(`숨김 (${why}) · 타이핑 ${typedSince}글자 · 복귀 → ${after}`)
  }, 400)
}
// 3차: 'policy' 방식만 앱을 활성화했다. 사람이 눌렀을 때 두 방식을 비교한다 —
//   ⌘Space  → 액세서리 그대로(활성화 없이 키 입력이 들어오는지가 핵심 질문)
//   ⌃⌥W     → setActivationPolicy('regular') 전환 (Dock 아이콘이 잠깐 보이는 대가)
let usingPolicy = false
async function togglePanel (accel) {
  const s = results.shortcuts[accel]
  s.fires++
  s.lastFireAt = new Date().toISOString()
  if (win.isVisible()) { hidePanel(accel); save(); return }
  usingPolicy = accel === 'Control+Alt+W'
  if (IS_MAC && usingPolicy) app.setActivationPolicy('regular')
  typedSince = 0
  const ms = await showAndMeasure(win)
  if (IS_MAC) app.focus({ steal: true })
  win.focus()
  results.latency.hotkey.push(ms)
  await sleep(300)
  const fm = frontmost()
  const hf = { accel, mode: usingPolicy ? 'policy' : 'accessory', frontmost: fm, activated: /electron|whencommand/i.test(fm), keyWindow: win.isFocused(), typed: 0 }
  results.hotkeyFocus.push(hf)
  log(`${accel} 눌림 (${s.fires}회, ${hf.mode}) → 페인트 ${ms}ms · frontmost=${fm} · isFocused=${hf.keyWindow}  ${hf.activated ? '✓ 활성화' : '✗ 활성화 안 됨'} — 이제 글자를 쳐 보세요`)
  save()
}
function reg (accel, fn) {
  const registerReturned = globalShortcut.register(accel, fn)
  const isRegistered = globalShortcut.isRegistered(accel)
  results.shortcuts[accel] = { registerReturned, isRegistered, fires: 0, lastFireAt: null }
  log(`register('${accel}') → ${registerReturned}, isRegistered=${isRegistered}`)
  return registerReturned
}
function bindShortcuts () {
  const primary = IS_MAC ? 'Command+Space' : 'Alt+Space'   // #4 / #5
  reg(primary, () => togglePanel(primary))
  reg('Control+Alt+W', () => togglePanel('Control+Alt+W'))   // #1 대조군 — 비어 있는 조합
  reg('Control+Alt+L', async () => { log('재측정'); await measurePrebuilt(3); await measureFresh(3) })
  reg('Control+Alt+Q', () => app.quit())
  if (!results.shortcuts[primary].registerReturned) {
    results.notes.push(`${primary} 등록 실패 — 다른 앱이 쥐고 있다 (macOS면 Spotlight일 가능성)`)
  }
  save()
}

ipcMain.on('hide', () => hidePanel('esc'))

app.whenReady().then(async () => {
  results.dock = IS_MAC ? { hideCalled: true, isVisible: app.dock.isVisible() } : { na: 'macOS만' }
  log(`#3 Dock: hide() 호출 → isVisible=${results.dock.isVisible}`)

  await createPanel()
  bindShortcuts()
  save()

  log('── 자동 측정 시작 (창이 몇 번 깜빡인다) ──')
  await measurePrebuilt(5)
  await measureFresh(5)
  await testFocus('app.hide')
  await testFocus('win.hide')
  await testFocus('steal+app.hide')
  await testFocus('policy+app.hide')
  await testFocus('dockshow+app.hide')
  if (process.argv.includes('--login-item')) testLoginItem()
  autoDone = true
  save()

  const S = summary()
  log('── 자동 측정 끝 ──')
  log(`#6 미리 만든 창 중앙값 ${S.prebuilt}ms · 새 창 ${S.fresh}ms  (예산 120ms)`)
  log(`#7 app.hide 복귀=${results.focus[0]?.restored} · win.hide 복귀=${results.focus[1]?.restored}`)
  log(`이제 ${IS_MAC ? '⌘Space' : 'Alt+Space'} 와 Ctrl+Alt+W 를 몇 번 눌러 보세요. Ctrl+Alt+Q 종료.`)
})

app.on('will-quit', () => { globalShortcut.unregisterAll(); save() })
app.on('window-all-closed', () => app.quit())
