# Speech-to-Speech Agent

> OpenAI Realtime API와 WebRTC를 활용한 한국어 음성 루틴 코치 앱

## 프로젝트 개요

- 사용자가 모바일 앱에서 음성으로 할 일이나 루틴을 말하면 AI 코치가 실시간으로 응답하는 프로젝트입니다.
- AI 페르소나 **루코**는 짧고 자연스러운 한국어 대화로 사용자의 루틴 정리를 돕습니다.
- 저장 의도가 명확한 발화는 Realtime Function Calling을 통해 앱의 할 일 목록에 반영됩니다.
- 사용자가 대화를 마무리하면 대화 로그와 저장된 할 일을 기반으로 세션 요약을 생성합니다.

## 핵심 기능

- **실시간 음성 대화**
  - React Native 앱에서 마이크 권한 요청
  - `react-native-webrtc` 기반 WebRTC PeerConnection 생성
  - OpenAI Realtime API와 직접 SDP Offer/Answer 교환
  - 원격 오디오 스트림 수신 및 재생 상태 반영

- **Realtime Ephemeral Token 발급**
  - 모바일 앱은 OpenAI API Key를 직접 보관하지 않음
  - Spring Boot 백엔드가 `/api/realtime/token`에서 ephemeral token 발급
  - 발급된 토큰으로 모바일 앱이 Realtime WebRTC 연결 수행

- **루코 페르소나**
  - 작은 습관과 할 일을 정리해주는 루틴 코치
  - 친근하지만 약간 잔소리 있는 말투
  - 답변은 짧고 자연스럽게 유지
  - 개인정보나 전문 판단이 필요한 조언은 요청하지 않도록 제한

- **할 일 저장 Function Calling**
  - Realtime session에 `save_task` 도구 등록
  - 사용자가 "물 마시기 저장해줘"처럼 명확히 말하면 함수 호출 처리
  - 앱은 DataChannel 이벤트를 수신해 저장된 할 일 목록을 즉시 갱신
  - function call output을 다시 Realtime DataChannel로 전달

- **대화 기록 및 전사**
  - 사용자 음성 입력 전사 모델: `gpt-realtime-whisper`
  - 한국어 전사 설정 적용
  - 사용자/AI 발화 transcript를 채팅 형태로 화면에 표시

- **Barge-in 대응**
  - 서버 VAD 기반 발화 감지
  - 사용자가 AI 응답 중 말하면 `interrupt_response` 설정으로 응답 중단
  - 자연스러운 실시간 대화 흐름을 목표로 구성

- **세션 요약**
  - 사용자가 "끝", "그만", "마무리"를 말하면 종료 의도로 판단
  - 앱이 대화 로그와 저장된 할 일 목록을 백엔드로 전송
  - 백엔드는 OpenAI Chat Completions와 JSON Schema 응답 형식으로 요약 생성
  - 앱은 제목, 요약, 저장된 할 일을 요약 카드로 표시

- **모바일 UI**
  - 연결 상태 표시
  - 시작/종료 버튼
  - 라이트/다크 테마 토글
  - 채팅 메시지 영역
  - 저장된 할 일 목록
  - 세션 요약 카드
  - 오류 메시지 표시

## 기술 스택

- **Mobile**
  - React Native CLI `0.86.0`
  - React `19.2.3`
  - TypeScript
  - `react-native-webrtc`
  - `react-native-safe-area-context`

- **Backend**
  - Kotlin `2.3.21`
  - Java `21`
  - Spring Boot `4.1.0`
  - Spring Web MVC
  - Spring `RestClient`
  - Jackson Kotlin

- **AI / Realtime**
  - OpenAI Realtime API
  - OpenAI Realtime WebRTC endpoint
  - OpenAI ephemeral client secret
  - Realtime Function Calling
  - Chat Completions JSON Schema 응답

- **Communication**
  - REST API
  - WebRTC
  - DataChannel
  - SDP Offer/Answer

## 프로젝트 구조

```text
speech-to-speech-agent
├─ backend
│  ├─ src/main/kotlin/com/yunhwan/speechtospeech
│  │  ├─ realtime
│  │  │  ├─ RealtimeTokenController.kt
│  │  │  └─ RealtimeTokenService.kt
│  │  └─ sessions
│  │     ├─ SessionSummaryController.kt
│  │     ├─ SessionSummaryService.kt
│  │     └─ dto
│  └─ src/main/resources/application.yaml
├─ mobile
│  ├─ App.tsx
│  └─ src
│     ├─ api
│     │  ├─ realtimeTokenApi.ts
│     │  └─ sessionSummaryApi.ts
│     └─ realtime
│        └─ realtimeConnection.ts
└─ docs
   ├─ architecture.md
   ├─ persona-sheet.md
   └─ system-prompt-v1.md
```

## 동작 흐름

- **1. 앱 시작**
  - 사용자가 `시작` 버튼 선택
  - Android 마이크 권한 요청
  - 백엔드에 Realtime token 요청

- **2. Realtime 연결**
  - 앱이 RTCPeerConnection 생성
  - 로컬 오디오 트랙 추가
  - `oai-events` DataChannel 생성
  - SDP offer 생성
  - OpenAI Realtime WebRTC endpoint로 offer 전송
  - SDP answer를 remote description으로 설정

- **3. 대화 진행**
  - 사용자 음성 입력은 WebRTC로 OpenAI에 전달
  - AI 음성 응답은 remote audio stream으로 수신
  - 전사 이벤트는 DataChannel로 수신해 채팅 UI에 표시

- **4. 할 일 저장**
  - OpenAI가 `save_task` function call 생성
  - 앱이 function call arguments에서 `task` 추출
  - 앱 화면의 저장된 할 일 목록에 추가
  - function call output을 DataChannel로 회신

- **5. 세션 종료와 요약**
  - 사용자 발화에 "끝", "그만", "마무리"가 포함되면 종료 처리
  - 앱이 `/api/sessions/summary`로 대화 로그와 할 일 목록 전송
  - 백엔드가 JSON Schema 기반 요약 생성
  - 앱이 요약 카드를 표시하고 WebRTC 연결 정리

## API

### Realtime Token

- **Endpoint**
  - `POST /api/realtime/token`

- **역할**
  - OpenAI Realtime WebRTC 연결에 사용할 ephemeral token을 발급합니다.

- **Response**

```json
{
  "token": "ephemeral-token"
}
```

### Session Summary

- **Endpoint**
  - `POST /api/sessions/summary`

- **역할**
  - 대화 로그와 저장된 할 일을 받아 한국어 세션 요약 JSON을 생성합니다.

- **Request**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "물 마시기 저장해줘"
    },
    {
      "role": "assistant",
      "content": "좋아, 이건 저장해두자. 물 마시기 저장했어."
    }
  ],
  "tasks": ["물 마시기"]
}
```

- **Response**

```json
{
  "title": "오늘의 루틴 정리",
  "summary": "오늘은 물 마시기를 루틴으로 저장했어요. 작은 습관부터 시작하려는 흐름이 좋았습니다.",
  "tasks": ["물 마시기"]
}
```

## 실행 방법

### Backend

- JDK 21을 준비합니다.
- `backend/.env.example`을 참고해 `OPENAI_API_KEY`를 설정합니다.
- 백엔드를 실행합니다.

```bash
cd backend
./gradlew bootRun
```

- Windows PowerShell에서는 다음 명령을 사용할 수 있습니다.

```powershell
cd backend
.\gradlew.bat bootRun
```

### Mobile

- Node.js `22.11.0` 이상을 준비합니다.
- Android 기준으로 실행합니다.
- 모바일 앱은 Android 에뮬레이터에서 백엔드 주소를 `http://10.0.2.2:8080`으로 호출합니다.

```bash
cd mobile
npm install
npm run android
```

- Metro 서버가 별도로 필요하면 다음 명령을 사용합니다.

```bash
cd mobile
npm start
```

## 환경 변수

- **Backend**
  - `OPENAI_API_KEY`: OpenAI API 호출에 사용할 서버 전용 API Key
  - `openai.summary-model`: 세션 요약에 사용할 모델 설정값
  - 기본 요약 모델: `gpt-4.1-mini`

- **Mobile**
  - 현재 Android 에뮬레이터 기준 API URL이 코드에 고정되어 있습니다.
  - Realtime token API: `http://10.0.2.2:8080/api/realtime/token`
  - Session summary API: `http://10.0.2.2:8080/api/sessions/summary`

## 구현 범위

- 구현한 것
  - Android 기준 React Native 앱
  - OpenAI Realtime WebRTC 연결
  - Realtime ephemeral token 발급 API
  - `save_task` Function Calling
  - 한국어 음성 전사 이벤트 처리
  - 대화 로그 화면 표시
  - 세션 종료 의도 감지
  - 구조화된 세션 요약 생성
  - 라이트/다크 테마 UI

- 구현하지 않은 것
  - 로그인 / 회원가입
  - DB 저장
  - 멀티유저
  - iOS 검증
  - 관리자 기능
  - 결제 기능
  - 복잡한 캘린더나 알림 기능

## 문서

- [아키텍처 문서](docs/architecture.md)
- [루코 페르소나 시트](docs/persona-sheet.md)
- [시스템 프롬프트 V1](docs/system-prompt-v1.md)

## 포트폴리오 포인트

- OpenAI Realtime API를 모바일 앱에서 WebRTC로 직접 연결한 실시간 음성 UX 구현
- API Key를 앱에 노출하지 않도록 백엔드 ephemeral token 발급 구조 적용
- Realtime DataChannel 이벤트를 앱 상태와 UI로 연결
- Function Calling 결과를 모바일 로컬 상태에 반영하는 흐름 구현
- 대화 종료 후 별도 요약 API로 구조화된 결과를 생성하는 후처리 파이프라인 구성
- 로그인, DB, 멀티유저 없이 과제 범위에 맞춘 단일 사용자 인메모리 프로토타입으로 설계
