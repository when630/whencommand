<div align="center">
  <h1>WHENCOMMAND</h1>
  <p><b>하려는 일을 적으면 된다. 그 일이 어느 앱에 있는지 기억하지 않는다.</b></p>
  <p>macOS · Windows · 한국어 · Electron</p>
</div>

---

단축키 한 번으로 화면 위에 입력줄이 뜨고, 몇 글자를 치면 **앱이 열리거나, 파일이 열리거나, 명령이 실행됩니다.** 형제 앱(WHENNOTE·WHENWORK·WHENCALENDAR·WHENMUSIC·WHENMAIL)이 설치돼 있으면 그 앱들의 명령까지 같은 줄에서 실행됩니다 — 설치돼 있지 않으면 그 항목이 없을 뿐, 앱은 그대로 동작합니다.

- **기억 비용 0** — 형제 앱이 늘수록 외울 단축키가 늘었습니다. 이 앱은 그 문제를 시리즈 안에서 풉니다: 단축키는 하나면 됩니다
- **초성 · 퍼지 · 자판 교정** — `ㅋㄹ`로 크롬, `vsc`로 Visual Studio Code, `초개ㅡㄷ`(chrome을 한글 자판으로 친 것)도 Chrome
- **자주 고른 것이 위로** — 같은 두 글자를 세 번 쳤으면 그 다음부터 원하는 것이 첫 줄입니다
- **계산과 변환** — `1920*0.28`, `3.5kg to lb`를 치면 첫 줄에 답. `Enter`로 복사
- **저장하는 것은 랭킹뿐** — 이 앱은 자기 데이터를 갖지 않습니다. 내보낼 것도, 잃을 것도 없습니다

단축키 — macOS `⌘Space` · Windows `Alt+Space`. 설정에서 바꿀 수 있습니다.

## 설치

[Releases](../../releases)에서 받으세요. 설치 파일 하나를 받아 실행하면 끝입니다. 계정도, 다른 프로그램도 필요 없습니다.

| OS | 파일 |
|---|---|
| Windows 10/11 | `WHENCOMMAND-<버전>-win-x64.exe` |
| macOS (Apple Silicon) | `WHENCOMMAND-<버전>-mac-arm64.dmg` |
| macOS (Intel) | `WHENCOMMAND-<버전>-mac-x64.dmg` |

실행하면 트레이(macOS는 메뉴바)에 ⌘ 아이콘이 뜹니다. Dock·작업 표시줄에는 뜨지 않습니다. Windows 11은 새 트레이 아이콘을 `^` 뒤에 숨기니, 끌어다 고정하면 계속 보입니다.

### 처음 실행할 때 경고가 뜹니다

코드 서명 인증서를 쓰지 않아서 두 OS 모두 경고를 냅니다. 서명에는 연 수십만 원이 들고, 이 앱은 그 비용을 쓰지 않습니다. 대신 무엇을 하는 앱인지는 이 저장소의 코드가 전부입니다.

**Windows** — "Windows의 PC 보호" 파란 창이 뜨면 **추가 정보** → **실행**을 누릅니다.

**macOS** — "확인되지 않은 개발자" 경고가 뜨면:

1. `WHENCOMMAND.app`을 응용 프로그램으로 옮깁니다
2. 앱을 **우클릭 → 열기** (더블클릭이 아니라 우클릭입니다)
3. 다시 뜨는 창에서 **열기**

그래도 막히면 터미널에서 격리 속성을 지웁니다:

```bash
xattr -dr com.apple.quarantine /Applications/WHENCOMMAND.app
```

### 단축키가 안 뜰 때 — OS마다 다릅니다

- **macOS `⌘Space`** — Spotlight가 쓰고 있습니다. 켜져 있으면 **둘이 함께 뜹니다**(앱이 막을 수 없습니다). 시스템 설정 › 키보드 › 키보드 단축키 › Spotlight 에서 "Spotlight 검색 보기"를 끄면 이 앱이 받습니다. 첫 실행 때 안내합니다. Raycast·Alfred가 `⌘Space`를 쥐고 있으면 **나중에 시작한 앱이 이깁니다** — 다른 조합으로 바꾸는 편이 확실합니다.
- **Windows `Alt+Space`** — 창 시스템 메뉴 기본값이지만 이 앱이 먼저 받습니다. 단, **PowerToys Run·Raycast for Windows**가 먼저 떠 있으면 등록에 실패하고 입력줄이 그 사실을 보입니다(“등록하지 못했습니다 — 트레이에서 부르세요”). 그쪽 단축키를 바꾸거나, 이 앱 설정에서 다른 조합으로 바꾸세요.

바꾸기: 트레이 › **설정…** › 단축키 칸을 누르고 원하는 조합을 누릅니다. 새 조합이 등록되지 않으면 이전 조합을 그대로 유지하고 이유를 보여 줍니다.

### 업데이트

새 버전이 올라오면 앱이 알아서 알립니다 — 켜고 1분 뒤 한 번, 이후 하루 한 번 확인합니다. **Windows**는 새 버전을 내려받아 앱을 종료할 때 설치합니다. **macOS**는 서명되지 않은 앱의 자동 설치가 막혀 있어 알림만 하고 받는 곳을 열어 줍니다. 설정 창에서 언제든 직접 확인할 수 있습니다.

### 내 데이터

이 앱이 저장하는 것은 **무엇을 얼마나 자주 골랐는지**(랭킹)뿐입니다 — `%APPDATA%\whencommand\whencommand.db`(macOS `~/Library/Application Support/whencommand/`). 설정(단축키·자동 실행·입력줄 위치)은 옆의 `settings.json`이고 설정 창에서 JSON으로 내보내고 가져옵니다. 스크립트는 `~/.whencommand/scripts/`, 형제 앱 매니페스트는 `~/.when/apps/` — 둘 다 앱 밖의 평범한 폴더입니다.

## 스크립트 명령

`~/.whencommand/scripts/`에 스크립트를 넣으면 명령이 됩니다(Windows `.ps1`·`.cmd`, macOS `.sh`·실행 파일). 첫 실행 때 예제 "내 IP"가 함께 생깁니다. 상단 주석으로 자기를 소개합니다:

```powershell
# name: 내 IP
# description: 이 PC의 로컬 IP — 한 줄이라 자동으로 복사됩니다
# icon: @
(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4Address.IPAddress
```

출력이 3줄 이하면 우상단 토스트로(한 줄이면 클립보드에 복사), 그보다 길면 입력줄이 아래로 자라 보여 줍니다. 실패하면 stderr와 `경로:줄`을 그대로 보이고 `Ctrl+Enter`(macOS `⌘Enter`)로 그 파일을 엽니다.

## 형제 앱 명령

형제 앱이 실행되면 `~/.when/apps/<앱>.json`에 자기 명령을 남기고, 이 앱은 그 폴더를 읽어 명령을 입력줄에 합칩니다 — `메모 검색 회의록` `Enter`로 WHENNOTE가 그 검색어로 열립니다. 규약은 [when-protocol](https://github.com/when630/when-protocol)에 있고, 지금은 WHENNOTE가 붙어 있습니다. 어느 형제 앱이 왜 안 보이는지는 설정 창의 "형제 앱" 섹션이 이유와 함께 보여 줍니다.

## 개발 실행

```
git clone https://github.com/when630/whencommand && cd whencommand
npm install
npm start
```

## 개발

```
npm start          # 트레이 상주
npm run smoke      # 사람 손 없이 끝까지 — 질의 몇 개 + 패널 캡처(PNG 경로를 인자로)
npm test           # 순수 함수 테스트 — search · rank · calc · place · platform 계약
npm run icons      # assets/icon/whencommand.png → build/
```

문서가 단일 원본입니다 — [`docs/01_프로젝트.md`](docs/01_프로젝트.md)(정의·스코프) · [`docs/02_요구사항.md`](docs/02_요구사항.md)(요구사항 ID) · [`docs/03_기술_스펙.md`](docs/03_기술_스펙.md)(결정 기록·실측 로그). 시안은 [`design/mockups/panel-options.html`](design/mockups/panel-options.html), 작업 규칙은 [`CLAUDE.md`](CLAUDE.md).

## 형제 앱

| 앱 | 답하는 질문 |
|---|---|
| [WHENWORK](https://github.com/when630/whenwork) | 뭘 해야 하지 · 뭐가 밀렸지 |
| [WHENNOTE](https://github.com/when630/whennote) | 그때 뭐라고 적었더라 |
| [WHENCALENDAR](https://github.com/when630/whencalendar) | 다음 하나까지 몇 분 남았지 |
| [WHENMAIL](https://github.com/when630/whenmail) | 이 사람한테 마지막으로 언제 연락했지 |
| [WHENMUSIC](https://github.com/when630/whenmusic) | 지금 뭐가 흐르지 · 방금 그거 좋았는데 |
| **WHENCOMMAND** | **이거 어떻게 하더라** — 나머지 다섯의 동사에 닿는 길 |

여섯 앱은 코드를 공유하지 않습니다. 같은 스택·구조·디자인 토큰·배포 방식을 쓰고, 역할만 나눕니다.
