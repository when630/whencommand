// tools/make-icon.mjs — 배포용 아이콘을 굽는다. WHENWORK tools/make-icon.mjs를 복사해 시작했다(D-14).
//
// 원본은 assets/icon/whencommand.png 하나뿐이다(사용자 제작, 2026-09-19 — 오픈이슈 #5).
// ⌘ 매듭 글리프(시안→핑크 그라데이션)가 남색 둥근 사각형 위에 얹혀 있고, 사각형 바깥으로
// 파란 글로우가 번진다. 여기서 두 가지를 만든다:
//
//   build/icon.png         — 설치 파일·실행 파일·Dock/dmg가 쓰는 앱 아이콘. 원본을 그대로
//                            512px로 줄인다(글로우 여백도 함께 — Dock은 자기 여백을 두지 않는다).
//
//   build/tray*.png        — 트레이/메뉴바 글리프. 배경을 버리고 **⌘ 도형만** 떼어내 그 경계로
//                            잘라 줄인다. WHENWORK와 다른 점은 **글리프가 흰색이 아니라는 것**이다.
//                            그래서 기준을 바꿨다 — 아래 glyphMask 주석.
//
//   build/tray-Template*.png — macOS 메뉴바용. 알파만 남긴 검정 — OS가 다크/라이트에 맞춰
//                            칠한다(main/platform/darwin.mjs가 이 파일을 먼저 찾는다).
//
// 원본이 흰 바탕(불투명)으로 저장돼 오는 경우도 받는다 — 네 모서리가 불투명 흰색이면
// 흰색을 투명으로 뚫는다(knockoutWhite). 배경 제거본이면 이 단계는 그냥 지나간다.
//
// 외부 의존성을 두지 않으려고 PNG 디코더·인코더를 직접 넣었다(zlib만 쓴다).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'build');
const SRC = path.join(ROOT, 'assets', 'icon', 'whencommand.png');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── PNG 디코더 (8비트 RGBA/RGB, 비인터레이스만 — 원본이 그 형식이다)
export function decodePng(buf) {
  let o = 8;
  let ihdr = null;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.slice(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (!ihdr) throw new Error('IHDR 없음');
  if (ihdr.depth !== 8 || ihdr.interlace !== 0 || (ihdr.color !== 6 && ihdr.color !== 2)) {
    throw new Error(`지원하지 않는 PNG 형식: depth=${ihdr.depth} color=${ihdr.color} interlace=${ihdr.interlace}`);
  }
  const ch = ihdr.color === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.w * ch;
  const out = Buffer.alloc(ihdr.w * ihdr.h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < ihdr.h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    // PNG 필터 되돌리기 — 여기를 틀리면 그림이 사선으로 흐른다
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + add) & 0xff;
    }
    prev = line;
    for (let x = 0; x < ihdr.w; x++) {
      const s = x * ch;
      const d = (y * ihdr.w + x) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = ch === 4 ? line[s + 3] : 0xff;
    }
  }
  return { w: ihdr.w, h: ihdr.h, rgba: out };
}

// 흰 바탕으로 저장된 원본을 받는다. 네 모서리가 전부 불투명 흰색이면 "매트가 깔린 것"으로
// 보고, 흰색에 가까운 정도를 투명도로 바꾼다. 배경 제거본은 모서리 알파가 0이라 건너뛴다.
// 글리프의 가장 밝은 색(연시안 #8fe0ff, 연핑크 #f0b4fa)은 세 채널이 전부 0.94를 넘지 않아 살아남는다.
export function knockoutWhite(rgba, w, h) {
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  const matte = corners.every((i) => rgba[i * 4 + 3] === 255 && Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) >= 245);
  if (!matte) return { rgba, knocked: false };
  const out = Buffer.from(rgba);
  const LO = 0.94;
  for (let i = 0; i < w * h; i++) {
    const d = i * 4;
    const minCh = Math.min(out[d], out[d + 1], out[d + 2]) / 255;
    if (minCh <= LO) continue;
    const v = (minCh - LO) / (1 - LO); // 0(색 있음) → 1(순백)
    out[d + 3] = Math.round(out[d + 3] * (1 - v));
  }
  return { rgba: out, knocked: true };
}

// 보이는 부분의 경계 상자. 정사각으로 맞춘다 — 가로세로 비가 틀어지면 원이 타원이 된다.
export function bbox(rgba, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const side = Math.max(x1 - x0, y1 - y0) + 1;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    x0: Math.max(0, Math.round(cx - side / 2)),
    y0: Math.max(0, Math.round(cy - side / 2)),
    x1: Math.min(w - 1, Math.round(cx + side / 2)),
    y1: Math.min(h - 1, Math.round(cy + side / 2)),
  };
}

// 박스 평균 축소. **알파를 곱해 평균한 뒤 되나눈다** — 안 그러면 투명한 가장자리의
// 색(보통 0,0,0)이 섞여 들어와 테두리가 거뭇해진다. 16px에서는 그 반투명 가장자리가
// 곧 형태라, 여기를 대충 하면 글리프가 뭉개진다.
export function resize(src, w, h, size, bb = null) {
  const box = bb ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const X0 = box.x0 + Math.floor((x * bw) / size);
      const X1 = box.x0 + Math.max(Math.floor(((x + 1) * bw) / size), Math.floor((x * bw) / size) + 1);
      const Y0 = box.y0 + Math.floor((y * bh) / size);
      const Y1 = box.y0 + Math.max(Math.floor(((y + 1) * bh) / size), Math.floor((y * bh) / size) + 1);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = Y0; yy < Y1 && yy < h; yy++) {
        for (let xx = X0; xx < X1 && xx < w; xx++) {
          const i = (yy * w + xx) * 4;
          const al = src[i + 3] / 255;
          r += src[i] * al;
          g += src[i + 1] * al;
          b += src[i + 2] * al;
          a += src[i + 3];
          n++;
        }
      }
      const d = (y * size + x) * 4;
      const am = n ? a / n : 0;
      const aw = am / 255;
      out[d] = aw > 0 ? Math.min(255, Math.round(r / n / aw)) : 0;
      out[d + 1] = aw > 0 ? Math.min(255, Math.round(g / n / aw)) : 0;
      out[d + 2] = aw > 0 ? Math.min(255, Math.round(b / n / aw)) : 0;
      out[d + 3] = Math.round(am);
    }
  }
  return out;
}

// 앱 아이콘에서 **⌘ 글리프만** 떼어낸다.
//
// WHENWORK는 흰 글리프라 "세 채널이 전부 높다"(최소 채널 ≥ 0.62)로 잘랐다. 우리 글리프는
// 시안→핑크 그라데이션이라 그 기준으론 중간의 보라 구간이 떨어져 나간다. 그래도 기준은
// 여전히 **가장 어두운 채널**이다 — 배경과 글로우는 파란 채널만 높고 나머지가 낮기 때문이다:
//   연시안 (143,224,255) → 0.56   연핑크 (240,180,250) → 0.71   보라 중간 (140,120,240) → 0.47
//   남색 배경 (15,25,60) → 0.06   테두리 글로우 (70,60,210) → 0.24   ⌘ 아래 그림자 → 0.05
// 0.30~0.45 사이를 선형 램프로 두면 보라 중간(0.47)은 완전히 살고 글로우(0.24)는 완전히
// 죽는다. 경계의 반투명 픽셀이 남아야 16px에서 획이 이어지므로 이진화하지 않는다.
export function glyphMask(rgba, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const LO = 0.3;
  const HI = 0.45;
  for (let i = 0; i < w * h; i++) {
    const d = i * 4;
    const a = rgba[d + 3] / 255;
    const minCh = Math.min(rgba[d], rgba[d + 1], rgba[d + 2]) / 255;
    const v = Math.min(1, Math.max(0, (minCh - LO) / (HI - LO)));
    out[d] = rgba[d];
    out[d + 1] = rgba[d + 1];
    out[d + 2] = rgba[d + 2];
    out[d + 3] = Math.round(255 * v * a);
  }
  return out;
}

// 마스크를 한 가지 색으로 칠한다. Windows 트레이는 밝은·어두운 작업 표시줄 양쪽에
// 서므로 중간 톤 한 색을 쓴다 — 그라데이션은 16px에서 얼룩이 된다.
export function tint(rgba, [r, g, b]) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

// macOS Template: 색은 버리고 알파만 남긴다(검정) — OS가 다크/라이트에 맞춰 칠한다.
export function toTemplate(rgba) {
  return tint(rgba, [0, 0, 0]);
}

// 트레이 색 — **글리프 픽셀의 평균**이다. WHENWORK는 배경 평균을 썼지만 우리 배경은 남색이라
// 트레이에서 죽는다. 글리프 평균은 시안·핑크가 섞인 중간 보라(≈ #a8a0f5)로, 형제 앱 토큰
// --accent(#7aa2f7)와 한 계열이다.
export function accentColor(mask, w, h) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const d = i * 4;
    if (mask[d + 3] < 200) continue;
    r += mask[d];
    g += mask[d + 1];
    b += mask[d + 2];
    n++;
  }
  if (!n) return [0x7a, 0xa2, 0xf7];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

export function buildIcons() {
  if (!fs.existsSync(SRC)) {
    // postinstall에서도 불린다 — 원본이 아직 없으면(오픈이슈 #5) 조용히 지나간다. 빌드는 막지 않는다.
    return { skipped: true, reason: `${path.relative(ROOT, SRC)} 없음` };
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const decoded = decodePng(fs.readFileSync(SRC));
  const { rgba, knocked } = knockoutWhite(decoded.rgba, decoded.w, decoded.h);
  const { w, h } = decoded;

  // 앱 아이콘 — 원본 그대로. 둥근 사각형과 글로우가 곧 앱 아이콘의 모양이다.
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), encodePng(512, 512, resize(rgba, w, h, 512)));

  // 트레이/메뉴바 — 배경을 버리고 ⌘만 떼어내 **그 도형의 경계로** 다시 자른다.
  const mask = glyphMask(rgba, w, h);
  const gb = bbox(mask, w, h);
  const accent = accentColor(mask, w, h);
  for (const size of [16, 32]) {
    const px = resize(mask, w, h, size, gb);
    const suffix = size === 16 ? '' : '@2x';
    fs.writeFileSync(path.join(OUT_DIR, `tray${suffix}.png`), encodePng(size, size, tint(px, accent)));
    fs.writeFileSync(path.join(OUT_DIR, `tray-Template${suffix}.png`), encodePng(size, size, toTemplate(px)));
  }
  return {
    src: `${w}x${h}`,
    knocked,
    glyph: gb.x1 - gb.x0 + 1,
    accent: accent.map((v) => v.toString(16).padStart(2, '0')).join(''),
  };
}

if (process.argv[1] && process.argv[1].endsWith('make-icon.mjs')) {
  const info = buildIcons();
  if (info.skipped) console.log(`icons: 건너뜀 — ${info.reason}`);
  else console.log(`icons written to build/ (source ${info.src}${info.knocked ? ', 흰 바탕 제거' : ''} → icon.png 512, glyph ${info.glyph}px crop, accent #${info.accent})`);
}
