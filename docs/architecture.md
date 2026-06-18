# Architecture - Speech-to-Speech Agent

## 1. 개요

이 프로젝트는 React Native 앱과 Spring Boot Kotlin 백엔드, OpenAI Realtime API를 사용해 실시간 음성 AI 에이전트를 구현하는 토이 프로젝트다.

사용자는 모바일 앱에서 음성으로 루틴이나 할 일을 말하고, AI 페르소나 "루코"는 짧은 대화로 반응한다. 사용자의 저장 의도가 명확하면 `save_task` 도구를 호출하고, 앱 화면에 할 일이 추가된다. 사용자가 "끝", "그만", "마무리"라고 말하면 대화 내용을 백엔드로 보내 세션 요약을 JSON 형식으로 생성한다.

---

## 2. 기술 스택

| 영역            | 기술                                    |
| ------------- | ------------------------------------- |
| Mobile        | React Native CLI                      |
| Backend       | Spring Boot + Kotlin + Spring Web MVC |
| Realtime AI   | OpenAI Realtime API                   |
| Communication | WebRTC, DataChannel, REST API         |
| Storage       | In-memory state                       |

---

## 3. 전체 구조

```text
React Native App
  ├─ 마이크 권한 요청
  ├─ WebRTC 연결 생성
  ├─ OpenAI Realtime과 음성 송수신
  ├─ DataChannel 이벤트 수신
  ├─ save_task 호출 결과를 화면에 반영
  └─ 세션 종료 시 요약 요청

        │ REST
        ▼

Spring Boot Kotlin Backend
  ├─ Realtime ephemeral token 발급
  └─ 세션 요약 생성 요청 처리

        │ OpenAI API
        ▼

OpenAI
  ├─ Realtime 음성 대화
  ├─ Function Calling
  └─ Structured Output 기반 요약 생성
```

---

## 4. 주요 흐름

### 4.1 Realtime 연결 흐름

```text
1. React Native 앱이 백엔드에 Realtime 토큰을 요청한다.
2. 백엔드는 OpenAI API Key를 사용해 ephemeral token을 발급받는다.
3. 백엔드는 앱에 ephemeral token을 반환한다.
4. 앱은 RTCPeerConnection을 생성한다.
5. 앱은 마이크 오디오 트랙을 PeerConnection에 추가한다.
6. 앱은 DataChannel을 생성한다.
7. 앱은 SDP offer를 생성한다.
8. 앱은 SDP offer와 ephemeral token을 사용해 OpenAI Realtime API에 연결한다.
9. OpenAI는 SDP answer를 반환한다.
10. 앱은 SDP answer를 remote description으로 설정한다.
11. WebRTC 연결이 완료되면 실시간 음성 대화가 가능해진다.
```

---

### 4.2 음성 대화 흐름

```text
사용자 음성 입력
  ↓
React Native Audio Track
  ↓
WebRTC
  ↓
OpenAI Realtime
  ↓
AI 응답 생성
  ↓
WebRTC Audio Track
  ↓
React Native 앱에서 음성 출력
```

---

### 4.3 DataChannel 이벤트 흐름

```text
OpenAI Realtime Event
  ↓
DataChannel
  ↓
React Native Event Handler
  ↓
앱 상태 변경
```

주요 이벤트 예시:

```text
- 사용자 발화 시작
- 사용자 발화 종료
- AI 응답 생성 시작
- AI 응답 완료
- function call 발생
- transcript 생성
- 응답 취소
```

---

### 4.4 Function Calling 흐름

이 프로젝트의 도구는 `save_task` 하나만 사용한다.

```text
사용자:
"물 마시기 저장해줘"

  ↓

OpenAI Realtime:
save_task 호출 필요 판단

  ↓

DataChannel Event:
save_task({ task: "물 마시기" })

  ↓

React Native:
이벤트 수신 후 task 목록에 추가

  ↓

화면:
- 물 마시기
```

도구 정의:

```text
save_task(task: string)
```

역할:

```text
사용자가 저장하고 싶은 할 일이나 루틴을 앱 화면의 할 일 목록에 추가한다.
```

---

### 4.5 Barge-in 흐름

Barge-in은 AI가 말하는 중 사용자가 끼어들면 AI 응답을 중단하는 기능이다.

```text
AI 음성 응답 중
  ↓
사용자 발화 시작
  ↓
VAD가 사용자 음성 감지
  ↓
speech_started 이벤트 발생
  ↓
현재 AI 응답 취소
  ↓
새 사용자 발화를 기준으로 다음 응답 생성
```

이 기능은 실시간 음성 대화의 자연스러움을 위해 필요하다.

---

### 4.6 Session Summary 흐름

사용자가 "끝", "그만", "마무리"라고 말하면 세션을 종료하고 요약을 생성한다.

```text
사용자:
"끝"

  ↓

React Native:
대화 로그와 저장된 task 목록 수집

  ↓

Spring Boot:
POST /api/sessions/summary 요청 수신

  ↓

OpenAI:
대화 내용을 요약하고 JSON으로 반환

  ↓

Spring Boot:
요약 결과 반환

  ↓

React Native:
요약 카드 표시
```

요약 응답 예시:

```json
{
  "title": "오늘의 루틴 정리",
  "summary": "오늘은 물 마시기와 운동하기를 루틴으로 저장했어요. 작은 습관부터 시작하려는 흐름이 좋았습니다.",
  "tasks": ["물 마시기", "운동하기"]
}
```

---

## 5. 백엔드 API

### 5.1 Realtime Token API

```http
POST /api/realtime/token
```

역할:

```text
OpenAI Realtime 연결에 사용할 ephemeral token을 발급한다.
```

응답 예시:

```json
{
  "token": "ephemeral-token"
}
```

---

### 5.2 Session Summary API

```http
POST /api/sessions/summary
```

역할:

```text
세션 종료 시 대화 로그와 저장된 task 목록을 받아 구조화된 요약 JSON을 생성한다.
```

요청 예시:

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

응답 예시:

```json
{
  "title": "오늘의 루틴 정리",
  "summary": "오늘은 물 마시기를 루틴으로 저장했어요. 작은 습관부터 시작하려는 흐름이 좋았습니다.",
  "tasks": ["물 마시기"]
}
```

---

## 6. 프론트엔드 역할

React Native 앱은 다음 역할을 담당한다.

```text
- 마이크 권한 요청
- Realtime token 요청
- WebRTC PeerConnection 생성
- Audio Track 송수신
- DataChannel 이벤트 처리
- save_task function call 처리
- task 목록 화면 반영
- 대화 로그 관리
- 세션 요약 요청
- 요약 카드 표시
```

---

## 7. 백엔드 역할

Spring Boot Kotlin 백엔드는 다음 역할을 담당한다.

```text
- OpenAI API Key 보관
- Realtime ephemeral token 발급
- 세션 요약 요청 처리
- structured output JSON 반환
```

백엔드는 실시간 음성 데이터를 직접 중계하지 않는다. 실시간 음성 통신은 React Native 앱과 OpenAI Realtime API가 WebRTC로 직접 수행한다.

---

## 8. 범위 밖

이번 과제에서는 다음 기능을 구현하지 않는다.

```text
- 로그인
- 회원 관리
- DB 저장
- 멀티유저
- 결제
- 다국어
- 복잡한 디자인
- 관리자 기능
```

---

## 9. 최종 완료 기준

```text
- 실기기 또는 에뮬레이터에서 음성 왕복 대화가 동작한다.
- AI 발화 중 사용자가 말하면 응답이 중단된다.
- save_task function call이 발생하고 화면에 할 일이 추가된다.
- 사용자가 "끝"이라고 말하면 세션 요약이 JSON으로 생성된다.
- 페르소나 시트와 시스템 프롬프트가 docs에 정리되어 있다.
- 주요 용어를 terminology-note.md에 정리한다.
```
