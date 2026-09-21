// main/icons.mjs — 앱·파일 아이콘(LNCH-04). OS가 그 파일에 붙인 아이콘을 app.getFileIcon으로 받아 data URL로 캐시한다.
// 시작할 때 전부 뽑지 않는다(오픈이슈 #4) — 렌더러가 **화면에 보이는 줄**만 묻고, 한 번 받은 건 세션 동안 기억한다(D-23).
// 못 뽑는 것(UWP shell: 경로, 지워진 파일)은 null — 렌더러가 첫 글자 상자로 둔다. 실패가 앱을 멈추지 않는다.
import { app } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { platform } from './platform/index.mjs';

export function createIconCache() {
  const cache = new Map(); // path → dataUrl | null
  const inflight = new Map(); // path → Promise
  let generic = null; // 셸이 '모르는 exe'에 주는 기본 실행 파일 아이콘 — 이것과 같으면 진짜가 아니다(D-26 보충)

  async function genericExe() {
    if (generic !== null) return generic;
    try {
      const img = await app.getFileIcon(path.join(os.tmpdir(), 'whencommand-generic-probe.exe'), { size: 'normal' });
      generic = img && !img.isEmpty() ? img.toDataURL() : '';
    } catch { generic = ''; }
    return generic;
  }

  async function one(p) {
    if (cache.has(p)) return cache.get(p);
    if (inflight.has(p)) return inflight.get(p);
    const job = (async () => {
      let url = null;
      if (!/^shell:/i.test(p)) {
        try {
          // Windows 시작 메뉴는 .lnk — 그대로 물으면 "바로가기" 그림이 온다. platform이 대상을 푼다
          const img = await app.getFileIcon(platform.resolveIconPath(p), { size: 'normal' }); // 32px — 24px 상자에 줄여 그린다
          if (img && !img.isEmpty()) url = img.toDataURL();
        } catch {}
      }
      cache.set(p, url);
      inflight.delete(p);
      return url;
    })();
    inflight.set(p, job);
    return job;
  }

  return {
    // paths[] → { path: dataUrl|null }. 한 화면은 최대 8줄이라 병렬로 한 번에
    async get(paths) {
      const list = [...new Set((paths ?? []).filter((p) => typeof p === 'string' && p))].slice(0, 16);
      const out = {};
      await Promise.all(list.map(async (p) => { out[p] = await one(p); }));
      // 셸이 기본 실행 파일 아이콘을 준 exe는 리소스에서 직접 뽑는다(win32만 — darwin은 빈 객체). 한 번 뽑으면 캐시에 남아 다시 안 묻는다
      const g = await genericExe();
      const fallback = g ? list.filter((p) => out[p] === g && /\.exe$/i.test(platform.resolveIconPath(p))) : [];
      if (fallback.length) {
        const byResolved = new Map(fallback.map((p) => [platform.resolveIconPath(p), p]));
        const got = await platform.extractIcons([...byResolved.keys()]);
        for (const [resolved, url] of Object.entries(got)) {
          const p = byResolved.get(resolved);
          if (p && url) { cache.set(p, url); out[p] = url; }
        }
      }
      return out;
    },
    size: () => cache.size,
  };
}
