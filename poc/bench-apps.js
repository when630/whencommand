'use strict'
// LNCH-02·05 — 앱 목록 수집 비용. 두 방법을 나란히 잰다:
//   A) 폴더 스캔 + plutil로 Info.plist 이름 읽기 (앱마다 프로세스 하나)
//   B) mdfind 한 번으로 전부 (kMDItemContentType == application-bundle, 이름 포함)
// 실행: node bench-apps.js   (macOS). Windows는 list-apps.ps1.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

if (process.platform !== 'darwin') { console.log('macOS만. Windows는 list-apps.ps1'); process.exit(0) }

const DIRS = ['/Applications', '/System/Applications', '/System/Applications/Utilities', path.join(os.homedir(), 'Applications')]
const t = () => Number(process.hrtime.bigint()) / 1e6

// A
let tA = t()
const apps = []
for (const d of DIRS) {
  if (!fs.existsSync(d)) continue
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.endsWith('.app')) apps.push(path.join(d, e.name))
    else if (e.isDirectory()) {  // 한 단계 아래 (예: /Applications/Utilities)
      try { for (const f of fs.readdirSync(path.join(d, e.name))) if (f.endsWith('.app')) apps.push(path.join(d, e.name, f)) } catch {}
    }
  }
}
const tScan = t() - tA
let named = 0, failed = 0
tA = t()
for (const a of apps) {
  const plist = path.join(a, 'Contents', 'Info.plist')
  // plutil은 키가 없으면 0이 아닌 코드로 끝난다 — DisplayName 없는 앱이 많아 폴백은 따로 감싼다
  const read = (key) => { try { return execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
  const name = read('CFBundleDisplayName') || read('CFBundleName')
  if (name) named++; else failed++
}
const tPlist = t() - tA
console.log(`A) 폴더 스캔 ${apps.length}개 · ${tScan.toFixed(0)}ms  +  plutil 이름 ${named}개(실패 ${failed}) · ${tPlist.toFixed(0)}ms  = ${(tScan + tPlist).toFixed(0)}ms`)

// B
const tB = t()
let mdLines = 0
try {
  const out = execFileSync('mdfind', ['kMDItemContentType == "com.apple.application-bundle"'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  mdLines = out.split('\n').filter(Boolean).length
} catch (e) { console.log('mdfind 실패:', e.message) }
console.log(`B) mdfind 한 번 · ${mdLines}개 · ${(t() - tB).toFixed(0)}ms   (이름은 kMDItemDisplayName으로 -attr 추가 조회 필요)`)
console.log('\n→ A가 수백 ms면 LNCH-05(시작 시 한 번 + 캐시)가 필수. B는 Spotlight 의존이라 FILE-05와 같은 실패 조건을 진다.')
