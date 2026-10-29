// WHENCOMMAND — 트레이 상주. 단축키 → 입력줄 → 앱·파일·명령 실행.
//
// 엔트리포인트는 bootstrap() 호출 하나뿐이다(형제 앱 동일). 앱 수명·창·트레이·단축키는
// main/lifecycle.mjs, 모든 IPC 핸들러는 main/ipc.mjs, 결과는 main/sources/ — lifecycle이 만든 ctx로만 상태를 주고받는다.
import { bootstrap } from './lifecycle.mjs';

bootstrap();
