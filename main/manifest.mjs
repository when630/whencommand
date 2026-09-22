// main/manifest.mjs — 형제 앱 매니페스트(~/.when/apps/<id>.json)의 순수 부분(LINK). 규약은 when-protocol 저장소(D-12).
//
//   parseManifest  JSON 문자열 → { ok, manifest } | { ok:false, error }. 깨진 파일은 **그 파일만** 건너뛴다(LINK-05)
//   splitCommand   입력이 "명령 제목 + 인자"인지 — `메모 검색 회의록` → '회의록', `메모 검색` → '', 아니면 null
//   buildUrl       딥링크 — whennote://search?q=%ED%9A%8C%EC%9D%98 (LINK-03)
//   usageOf        설정 창(D-16·D-25)이 보여 주는 사용법 한 줄 — 입력줄에 무엇을 치면 이 명령이 되는지
//   fallbackCommands  결과가 없을 때 입력 전체를 첫 인자로 받을 수 있는 명령(D-32) — string 인자가 있는 것만

export const PROTOCOL = 1;
const ID = /^[a-z][a-z0-9-]{1,31}$/;

function bad(error) {
  return { ok: false, error };
}

export function parseManifest(text) {
  let m;
  try { m = JSON.parse(String(text ?? '')); } catch (e) { return bad(`JSON이 아니다 — ${e.message}`); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return bad('객체가 아니다');
  if (m.protocol !== PROTOCOL) return bad(`모르는 protocol ${JSON.stringify(m.protocol)} — 이 앱은 ${PROTOCOL}만 읽는다`);
  for (const k of ['id', 'name', 'scheme']) if (typeof m[k] !== 'string' || !m[k].trim()) return bad(`${k}가 없다`);
  if (!ID.test(m.id)) return bad(`id는 소문자·숫자·하이픈 2~32자 — ${JSON.stringify(m.id)}`);
  if (!ID.test(m.scheme)) return bad(`scheme은 소문자·숫자·하이픈 2~32자 — ${JSON.stringify(m.scheme)}`);
  if (m.verify != null && (typeof m.verify !== 'object' || Array.isArray(m.verify))) return bad('verify는 { darwin, win32 } 객체다');
  if (!Array.isArray(m.commands) || !m.commands.length) return bad('commands가 비어 있다');
  const commands = [];
  const seen = new Set();
  for (const c of m.commands) {
    if (!c || typeof c.id !== 'string' || !ID.test(c.id)) return bad(`command.id가 잘못됐다 — ${JSON.stringify(c?.id)}`);
    if (typeof c.title !== 'string' || !c.title.trim()) return bad(`command ${c.id}에 title이 없다`);
    if (seen.has(c.id)) return bad(`command.id가 겹친다 — ${c.id}`);
    seen.add(c.id);
    const args = [];
    for (const a of c.args ?? []) {
      if (!a || typeof a.name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(a.name)) return bad(`command ${c.id}의 arg 이름이 잘못됐다`);
      if (a.type != null && a.type !== 'string') return bad(`command ${c.id}의 arg ${a.name}: type은 string만 — v1`);
      args.push({ name: a.name, type: 'string', optional: a.optional === true });
    }
    commands.push({ id: c.id, title: c.title.trim(), description: typeof c.description === 'string' ? c.description : '', args });
  }
  return {
    ok: true,
    manifest: {
      protocol: PROTOCOL,
      id: m.id,
      name: m.name.trim(),
      scheme: m.scheme,
      verify: m.verify ?? null,
      commands,
    },
  };
}

// 입력이 이 명령의 제목으로 시작하면 그 뒤를 인자로 돌려준다. 대소문자·앞뒤 공백은 무시. 아니면 null.
export function splitCommand(query, title) {
  const q = String(query ?? '').trim();
  const t = String(title ?? '').trim();
  if (!q || !t) return null;
  if (q.toLowerCase() === t.toLowerCase()) return '';
  if (q.toLowerCase().startsWith(t.toLowerCase() + ' ')) return q.slice(t.length + 1).trim();
  return null;
}

// 첫 string 인자에 입력의 나머지를 넣는다. 인자가 없는 명령은 나머지를 버린다 — 형제 앱은 모르는 쿼리를 무시하면 된다.
export function buildUrl(manifest, command, rest = '') {
  const params = [];
  const arg = command.args?.[0];
  if (arg && rest) params.push(`${encodeURIComponent(arg.name)}=${encodeURIComponent(rest)}`);
  return `${manifest.scheme}://${command.id}${params.length ? `?${params.join('&')}` : ''}`;
}

// 필수 인자를 아직 안 받았는가 — 부제로 "뒤에 …를 붙이세요"를 보이는 데 쓴다. 실행은 그래도 된다(형제 앱이 빈 값을 처리한다)
export function missingArg(command, rest) {
  const arg = command.args?.[0];
  return arg && !arg.optional && !rest ? arg.name : null;
}

// 설정 창의 접힌 사용법(D-25) — 사용자가 입력줄에 칠 모양 그대로. `메모 검색 ‹q›` · `퀵 메모 [text]` · `메모 창 열기`.
// 인자 이름은 매니페스트에 적힌 영문 그대로 둔다 — 입력줄 부제("뒤에 q를 붙이세요", D-22)와 같은 말이어야 한다.
export function usageOf(command) {
  const arg = command.args?.[0];
  const line = !arg ? command.title : `${command.title} ${arg.optional ? `[${arg.name}]` : `‹${arg.name}›`}`;
  const argNote = !arg ? '' : arg.optional ? `${arg.name}는 빼도 됩니다` : `${arg.name}는 꼭 붙입니다 — 없이 실행하면 앱이 빈 값으로 엽니다`;
  return { line, argNote, description: command.description || '' };
}

// 폴백(SRCH-09, D-32) — 찾은 것이 없을 때 "이 글로 할 수 있는 것". 첫 string 인자가 있는 명령만 — 인자 없는 명령에 글을 붙여도 버려진다(buildUrl)
export function fallbackCommands(manifest) {
  return (manifest?.commands ?? []).filter((c) => c.args?.[0]);
}

