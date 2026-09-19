'use strict'
// #8 — mdfind 응답 시간 (FILE-01·03, D-09). 3글자 질의 5종 × 3회. 첫 바이트와 종료 둘 다 잰다.
// 실행: node bench-mdfind.js   (macOS만. Windows Search는 poc/list-apps.ps1 옆에 별도 스크립트로)
const { spawn, execFileSync } = require('node:child_process')

if (process.platform !== 'darwin') { console.log('macOS만. Windows Search는 따로 잰다.'); process.exit(0) }

// FILE-05 — 색인이 켜져 있는지 먼저
try { console.log('mdutil -s /  →', execFileSync('mdutil', ['-s', '/'], { encoding: 'utf8' }).trim().split('\n').pop()) } catch (e) { console.log('mdutil 실패:', e.message) }

const QUERIES = ['설정', '회의', '노트', 'pack', 'main']
function once (q) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint()
    let first = null, bytes = 0, lines = 0
    const p = spawn('mdfind', ['-name', q])
    p.stdout.on('data', (d) => { if (first === null) first = Number(process.hrtime.bigint() - t0) / 1e6; bytes += d.length; lines += (d.toString().match(/\n/g) || []).length })
    p.on('close', () => resolve({ q, firstMs: first == null ? null : +first.toFixed(1), totalMs: +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1), lines }))
  })
}
;(async () => {
  const rows = []
  for (const q of QUERIES) for (let i = 0; i < 3; i++) rows.push(await once(q))
  console.log('\n질의     첫바이트   종료      결과수')
  for (const r of rows) console.log(`${r.q.padEnd(7)} ${String(r.firstMs ?? '-').padStart(7)}ms ${String(r.totalMs).padStart(7)}ms ${String(r.lines).padStart(7)}`)
  const med = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  console.log(`\n중앙값: 첫바이트 ${med(rows.map(r => r.firstMs))}ms · 종료 ${med(rows.map(r => r.totalMs))}ms`)
  console.log('→ 03 §11 #8. D-11의 "늦게 합류" 예산을 이 값으로 정한다.')
})()
