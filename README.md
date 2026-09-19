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

단축키 — macOS `⌘Space` · Windows `Alt+Space`

> macOS에서 `⌘Space`는 Spotlight가 쓰고 있습니다. 켜져 있으면 둘이 함께 뜹니다 — 시스템 설정 › 키보드 › 키보드 단축키 › Spotlight 에서 "Spotlight 검색 보기"를 끄면 이 앱이 받습니다. 첫 실행 때 안내합니다.

## 설치

[Releases](../../releases) — 아직 첫 릴리스 전입니다. 지금은 개발 실행으로:

```
git clone https://github.com/when630/whencommand && cd whencommand
npm install
npm start
```

트레이(macOS는 메뉴바)에 ⌘ 아이콘이 뜹니다. Dock에는 뜨지 않습니다.

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
