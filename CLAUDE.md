# WHENCOMMAND

자기 명사를 갖지 않는 앱. 단축키 한 번, 몇 글자로 **앱·파일·형제 앱 명령**에 닿는다. 저장하는 것은 무엇을 얼마나 자주 골랐는지뿐이다.

`when630` 시리즈의 여섯 번째 앱이다. 형제 앱은 GitHub `when630/`의 `whennote`·`whenwork`·`whencalendar`·`whenmusic`·`whenmail`(Windows 개발 PC에서는 `D:\when630\`). 이 앱은 시리즈에서 **처음으로 macOS에서 개발·검증**됐고, **두 OS를 동등하게** 낸다.

## 먼저 읽을 것

작업 전에 **`docs/` 3종이 단일 원본**이다. 여기 없는 결정은 내린 적이 없는 것으로 본다.

| 문서 | 내용 |
|---|---|
| `docs/01_프로젝트.md` | 정의·페르소나·스코프·형제 앱 경계 |
| `docs/02_요구사항.md` | 요구사항 ID 62개 (PANEL·SRCH·LNCH·FILE·CALC·EXT·LINK·PLAT·STOR·REL·DONE). 체크는 테스트가 증명한 것만 |
| `docs/03_기술_스펙.md` | 스택·모듈·데이터 모델·**결정 기록 D-01~D-17**·**실측 로그 §11**·오픈이슈 |

디자인 시안은 `design/mockups/panel-options.html`(확정안은 §0의 ㉤), 실측 스크립트는 `poc/`.

## 현재 단계

**v0.1.0 공개(2026-09-21)** — `github.com/when630/whencommand/releases/tag/v0.1.0`. Windows NSIS + macOS dmg/zip(arm64·x64), CI 세 OS. macOS는 실기기 검증 전.

**Phase 3 — 앱·스크립트·파일·계산이 한 목록에 온다.** `⌘Space` → 입력줄 → 앱·스크립트를 초성·퍼지·자판 교정으로 찾고, 3글자부터 파일이 늦게 합류해(D-11·D-21) `Enter`로 실행. 스크립트 출력은 길이로 갈려 토스트 또는 패널 출력 모드(D-17). `npm run smoke`가 사람 손 없이 끝까지 돌고 렌더링을 PNG로 찍는다 — `SMOKE_RUN=<스크립트>`면 실제로 실행해 출력 분기까지 찍는다.

끝난 것: Phase 0 실측(10개 중 9개 답 — macOS 2026-09-19, Windows 2026-09-21, `docs/03 §11`), 시안 ㉤ 확정(D-15), 아이콘, 양 OS `smoke` 통과, Windows 실사용 첫날의 다듬기(D-18·D-19, 하단 바 제거), EXT(D-20), FILE(D-21 — Windows Search 실기기, mdfind 쪽은 미검증), LINK 양쪽(D-22 — `manifest.mjs`·`sources/siblings.mjs`; WHENNOTE에 스킴·매니페스트 붙여 Windows 실기기 검증; 규약 레포 `github.com/when630/when-protocol`), 설정 창(D-16 보충 — `settings-win.mjs`, 내장 명령 `설정`), `update.mjs`(whenwork 복사 — 트레이·설정 창에 업데이트 줄, `--check-update` 모드).
v0.1.0 공개 뒤: 앱·파일 아이콘(D-23, LNCH-04), WHENNOTE 0.1.1 공개(딥링크 들어간 설치본).
실측 #2 Windows 확정(`--probe-login`). 형제 앱 다섯 전부 스킴 부착 — WHENNOTE 0.1.1 · WHENWORK 0.2.1 · WHENCALENDAR 0.1.3 · WHENMUSIC(옆 세션, `d9b28f5`) · WHENMAIL 0.8.1. 각 앱의 `add`류 결은 when-protocol README "붙인 앱" 절.
남은 것(순서대로): macOS 실기기에서 FILE·LINK·설치본 첫 실행·실측 #2 검증(오픈이슈 #8) → 오픈이슈 #7(한글 별칭) → 오픈이슈 #6(단축키 뒤늦게 뺏김 — Windows엔 없음, macOS만) → v0.2.0.

## 밟으면 아픈 함정 (전부 실측으로 확인된 것 — `docs/03 §11`)

1. **Dock을 숨긴 액세서리 앱은 `win.focus()`로 앞에 나오지 않는다.** 사용자가 단축키를 누른 직후에만 `app.focus({steal:true})`가 통한다(협력적 활성화) — 프로그램이 스스로 띄우면 실패한다. 숨길 땐 `app.hide()`를 함께 불러야 직전 앱으로 돌아간다. 전부 `platform/darwin.mjs`의 `activate`/`deactivate`에 있다
2. **`⌘Space`는 Spotlight가 켜져 있으면 둘이 함께 뜬다.** 앱이 막을 수 없다. `register()`는 그래도 true를 돌려준다 — 반환값은 충돌을 말해 주지 않는다(PLAT-03은 `symbolichotkeys` 64번을 읽는다). 그리고 Carbon 핫키는 **나중에 등록한 앱이 이긴다** — Raycast가 쥔 ⌘Space를 이 앱이 가져갔고, 반대로 뺏길 수도 있다(오픈이슈 #6)
3. **미리 만든 창도 첫 페인트는 446ms**(설치 직후, GPU 캐시 콜드). 두 번째 실행부터 29ms. `panel.mjs`가 시작 직후 opacity 0으로 한 번 그려 둔다
4. **앱 이름 읽기는 `plutil` 프로세스가 앱당 ~4ms** → 122개면 500ms. 시작 시 한 번 8병렬로 모으고 캐시한다(LNCH-05). 매 검색마다 디스크를 훑지 말 것
5. **`node:sqlite`는 Electron 내장 Node에만 있다.** 개발 PC의 Node 22.12 `node --test`에서는 못 연다 — `store.mjs` 테스트는 Electron 안(`--smoke`)에서만 검증된다
6. **초성 검색은 한글 이름에만 걸린다.** macOS 앱 이름은 거의 영문이라 `ㅋㄹ`로 Chrome을 못 찾는다(오픈이슈 #7 — 별칭). 영문을 한글 자판으로 친 것(`초개ㅡㄷ`→chrome)은 `keyboardToLatin`이 되돌린다
7. **퍼지 점수에서 연속 매칭 가산을 단어 첫 글자보다 낮게 두면 흩어진 머리글자가 항상 이긴다** — `chr`이 Chrome보다 Cache Handler Runner에 붙었다. 지금은 같다(`search.mjs` 주석)
8. **Windows는 `win.hide()`만으로 직전 창에 포커스가 돌아오지 않는다.** 항상-위·작업표시줄-제외 창을 숨기면 OS가 아무 창이나 고른다. `minimize()`를 거쳐 숨기면 돌아오고, 그래서 보일 때 `restore()`가 먼저다 — `platform/win32.mjs`. 단축키는 macOS와 반대로 **먼저 등록한 앱이 이기고** `register()`가 false를 정직하게 돌려준다(Raycast for Windows가 떠 있으면 FAIL)
9. **직전 인스턴스를 죽인 직후 바로 띄우면 단일 인스턴스 락에 걸려 조용히 종료된다**(exit 0, 출력 없음). 몇 초 뒤 다시 띄우면 된다. `npm start`를 멈춰도 자식 `electron.exe`는 남는다 — whencommand 것만 골라 끄고, 개발 실행은 `Start-Process`로 셸과 분리해 띄운다
10. **PowerShell은 실패해도 exit 0으로 끝날 수 있다.** 파일이 없거나 마지막 명령이 실패하면 `$LASTEXITCODE`가 비어 있다 — `$?`를 함께 본다(`platform/win32.mjs scriptRunner`). 그리고 한국어 콘솔은 cp949라 `[Console]::OutputEncoding`을 UTF-8로 먼저 세우지 않으면 한글 출력이 깨진다
11. **Windows Search의 `System.ItemPathDisplay`는 경로가 아니다** — `C:\사용자\forcs\…`처럼 현지화된 표시용이다. 실제 경로는 `System.ItemUrl`(`file:C:/Users/…`)에서 뽑는다(`platform/win32-search.ps1`). PowerShell은 질의마다 띄우면 ~400ms라 한 번 띄워 stdin으로 묻는다
12. **한글 IME는 ↑↓·Enter로 조합이 확정될 때 값이 같은 `input`을 한 번 더 낸다.** 그걸 새 입력으로 보면 방금 옮긴 커서가 0으로 돌아가고 목록이 깜빡인다 — `panel.js`는 값이 안 바뀐 `input`을 버린다. 영문 질의로만 시험하면 절대 안 드러난다
13. **외부 프로세스에 넘기는 파일은 asar 밖에 둬야 한다.** `win32-search.ps1`을 PowerShell에 `-File`로 넘기는데 패키징본에선 `app.asar` 안이라 읽지 못했다(패키징 smoke "파일 검색 불가"). `package.json build.asarUnpack`에 올리고 코드에서 `app.asar` → `app.asar.unpacked`로 경로를 돌린다. **개발 실행에선 절대 안 드러난다 — 패키징 smoke가 유일한 검증**
14. **Windows 시작 메뉴 항목의 아이콘은 `.lnk`를 그대로 물으면 "바로가기" 그림이 온다.** `shell.readShortcutLink`로 대상을 풀어 그쪽을 물어야 한다(`platform/win32.mjs resolveIconPath`). UWP(`shell:AppsFolder`)는 `getFileIcon`이 못 뽑는다 — 첫 글자 상자로 둔다
15. **스모크 경로 인자는 슬래시로.** Git Bash에서 `"$S\\$t.ps1"`는 `$t`가 확장되지 않아 `scripts$t.ps1`로 넘어갔다 — `cygpath -m`으로 `C:/…` 꼴을 쓴다

## 스택

Electron 43 · vanilla JS + CSS(프레임워크 없음) · `node:sqlite` 단일 파일 · electron-builder(NSIS·DMG) · 미서명 GitHub Releases + electron-updater. 런타임 의존성은 `electron-updater` 하나. 형제 앱과 다른 점은 **없다**(D-01).

## 규칙

- 여섯 앱은 **코드를 공유하지 않는다**(D-14). 검증된 모듈을 복사해 시작한다 — 이 앱은 `place.mjs`·`update.mjs`(whenwork), `settings.mjs`·`platform/`·`toChoseong`(whennote), `tokens.css`(전 형제 앱), `make-icon.mjs`(whenwork)를 가져왔다. 공유하는 것은 스택·구조·토큰·파이프라인·테스트 방식, 그리고 **규약**(`when-protocol`, D-12)이다
- **OS 분기는 `main/platform/` 안에만**(PLAT-01). `test/platform.test.mjs`가 두 구현의 계약과 `process.platform` 누출을 검사한다
- **모든 결과는 같은 모양의 공급원**(`main/sources/*.mjs`: `id`·`ready`·`query`)에서 나온다. 새 기능은 대개 파일 하나를 더하는 일이다
- **순서는 오직 `rank.mjs`가 정한다**(D-10 frecency). 종류·출처·도착 순서는 순서에 개입하지 않는다(그래서 종류별 머리글 ㉣을 버렸다, D-15)
- 저장하는 것은 랭킹뿐(D-02). **`store.mjs`가 100줄을 넘으면 이 앱이 데이터를 갖기 시작했다는 신호**다
- IPC 채널은 `domain:action`, 렌더러는 항목의 `key`만 돌려준다. 디자인 토큰의 단일 원본은 형제 앱 `renderer/tokens.css`이고 이 앱이 더하는 토큰은 없다(PANEL-10)
- 단축키는 **이 앱만** OS 관례를 따른다 — macOS `⌘Space`·Windows `Alt+Space`(D-05). 형제 앱은 `Ctrl+Alt+글자`. 화면 자리는 위 28% 중앙(D-08)
- 새 결정은 `docs/03 §10`에 `D-nn`으로 남기고 **폐기안도 함께 적는다.** 실측은 §11 표에, 측정 전에는 설계를 확정하지 않는다
- 형제 앱이 **하나도 없어도 온전해야 한다**(D-03). 연동은 더해지는 것이지 전제가 아니다 — 권유·배너를 띄우지 않는다

## 실행

```
npm start          # 트레이 상주. ⌘Space로 부른다
npm run smoke      # 사람 손 없이 끝까지 — 질의 몇 개 + 패널 캡처(PNG 경로를 인자로). SMOKE_QUERY=chrome 로 캡처 질의 지정
npm test           # 순수 함수 48개 — search·rank·calc·place·platform 계약
npm run icons      # assets/icon/whencommand.png → build/{icon,tray,tray-Template}*.png
```
