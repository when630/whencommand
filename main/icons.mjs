// main/icons.mjs — 앱·파일 아이콘(LNCH-04). OS가 그 파일에 붙인 아이콘을 app.getFileIcon으로 받아 data URL로 캐시한다.
// 시작할 때 전부 뽑지 않는다(오픈이슈 #4) — 렌더러가 **화면에 보이는 줄**만 묻고, 한 번 받은 건 세션 동안 기억한다(D-23).
// 못 뽑는 것(UWP shell: 경로, 지워진 파일)은 null — 렌더러가 첫 글자 상자로 둔다. 실패가 앱을 멈추지 않는다.
import { app } from 'electron';
import { platform } from './platform/index.mjs';

export function createIconCache() {
  const cache = new Map(); // path → dataUrl | null
  const inflight = new Map(); // path → Promise

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
      return out;
    },
    size: () => cache.size,
  };
}
