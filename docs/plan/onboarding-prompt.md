---
status: done
last_verified: 2026-11-23
---

# 첫 가입 온보딩 구현 프롬프트

> 2026-11-24 구현함. 사용자 답: 완료 판단은 서버 `Me.onboarding_completed_at`(계약 0.5.0, `PUT /users/me/onboarding`),
> 걷기는 관절을 코드로 돌려 만들기, 다른 사람 태그는 공부방에서 캐릭터를 누르면 나오는 프로필 시트에 보이기.
> 연속 기록 문구 값은 이미 코드에 있던 서버 규칙(하루 10분, 04:00)을 썼다. 1–3단계 카드는 사용자 요청으로
> 검은 그라데이션 위 흰 글자로 바꿨다. 결과는 `docs/design-parity/exceptions.md`·`docs/design-parity/onboarding/`.

아래를 그대로 작업 에이전트에게 넘긴다.

---

StudyVillage 웹(`frontend/`)에 **처음 가입한 사람용 온보딩**을 만든다. 시작 전에 `AGENTS.md`(=`CLAUDE.md`),
`docs/plan/study-village.md`, `docs/plan/study-tags.md`, `docs/design-parity/exceptions.md`를 읽고 그 규칙을
따른다. 특히 폴백·추측 금지, 쓰기는 서버 성공 뒤에만 반영, 모든 쓰기에 `Idempotency-Key`,
계약 밖 필드 사용 금지, 문구 출처 규칙을 지킨다.

## 흐름 (4단계, 순서 고정)

로그인 직후 온보딩 대상이면 공부 탭 대신 온보딩 화면을 띄운다. 1–3단계는 3D 방 **밖**에서, 4단계는 방
**안**에서 진행한다. 위에 진행 표시(`studyOnboardingProgress` "{total}장 중 {current}번째")와 뒤로 가기를
둔다. 1–3단계에서 고른 값은 화면 상태로만 들고 있다가 3단계 끝에서 한꺼번에 저장한다.

### 1. 성별(캐릭터) 고르기: 방 밖, 게임 캐릭터 선택 화면처럼

- 3D 방 밖의 작은 무대: 하늘(`StudyRoomSky`/`three/skyDome.ts`) 아래 둥근 발판 두 개 위에 남자·여자 캐릭터가
  나란히 서 있다. 캐릭터는 방과 같은 GLB·같은 부위 조합(`room3d/three/characterKit.ts`,
  `participantCharacter.ts`)과 같은 룩(`three/toonComposer.ts`)으로 그린다. 새 모델을 만들지 않는다.
- 누르면 고른 캐릭터가 한 걸음 앞으로 나오고 커지며(살짝 튀는 움직임), 다른 쪽은 흐려진다. 모바일은 좌우
  밀기와 ‹ › 단추로도 바꾼다. 키보드 ←/→·Enter도 된다.
- 문구: `studyOnboardingGenderTitle`, `studyOnboardingGenderDescription`, `studyOnboardingGenderMale`,
  `studyOnboardingGenderFemale`. 확인 단추는 섬 스타일 주 단추(`IslandButton primary expand`).
- 값은 계약 `Gender`(`male`|`female`).

### 2. 이름 정하기

- 1단계에서 고른 캐릭터가 그대로 서 있고, 머리 위에 방 안 이름표와 같은 모양의 이름표가 떠 있다. 입력하는
  대로 이름표가 바로 바뀐다.
- 처음 값은 세션의 현재 닉네임(`me.profile.nickname`, 서버가 정한 값)이다. 새 이름을 지어 내는 규칙을
  프론트에 만들지 않는다.
- 검사는 계약 `Nickname` 그대로: 앞뒤 공백 제거 뒤 1–12자(**grapheme**, `Intl.Segmenter`), UTF-8 48바이트 이하,
  제어 문자 금지. 서버 422(`error.details.field = nickname`)도 같은 자리에 보인다.
- 입력칸은 과목·태그 시트와 같은 둥근 입력칸(`subject.module.css`의 `.input`).

### 3. 목표 고르기(공부 태그)

- 태그 카탈로그에서 최대 5개(`myTagCountMax`). 기존 `tags/MyTagsSheet.tsx`의 칩·검색·자동완성·제안
  로직(`useTagSearch`, `suggestTag`)을 컴포넌트로 빼서 시트와 이 단계가 같이 쓴다. 이 단계는 시트가 아니라
  전체 화면 한 장이다. 고른 태그는 캐릭터 둘레에 작은 배지로 붙는다.
- 0개로 넘어가도 된다(건너뛰기). 넘어가면 태그 저장 요청을 보내지 않는다.
- **결정 변경: 태그는 전체 공개다.** 지금 문서·계약은 "남에게 보이지 않고 추천에만 쓴다"이므로 같은 커밋
  묶음에서 고친다:
  - `docs/plan/study-tags.md` 결정 6 → 공개. 이유와 날짜(사용자 결정) 적기.
  - `server/docs/api/openapi.yaml`: `/users/me/tags` 설명, 다른 사람에게 보이는 프로필 응답에 `tags` 추가,
    `info.version` 올리기. 그다음 `npm run api:types`.
  - `l10n/web_tags_ko.ts`의 `myTagsDescription`에서 "내 태그는 다른 사람에게 보이지 않아요" 문장을 고친다.
  - 다른 사람 태그를 **어디에 보여 줄지**(공부방 사람 프로필 시트, 랭킹 줄 등)는 정해지지 않았다. 계약까지만
    바꾸고 노출 위치는 사용자에게 묻는다.

### 저장 (3단계 → 4단계 사이)

- `PATCH /users/me/profile {gender, nickname}` → (태그가 있으면) `PUT /users/me/tags {tag_ids}` 순서로 보낸다.
  각 요청은 자기 `Idempotency-Key`를 갖고, 응답을 못 받으면 **같은 키로** 다시 보낸다(`timerStore.ts`의
  `write` 방식).
- 둘 다 성공한 뒤에만 세션의 `me`를 바꾸고(`session.replaceMe`) 4단계로 간다. 하나라도 실패하면 그 단계에
  머물고 고른 값을 그대로 두고 이유를 토스트로 알린다. optimistic 없음.

### 4. 방에 들어가며 둘러보기(코치 마크)

- 카메라가 방 문 바깥에서 시작해 내 캐릭터가 방 안으로 걸어 들어가 내 자리에 앉는 것을 따라간다. 앉으면
  평소 공부 탭 시점(`thirdPerson`)으로 부드럽게 이어진다. 카메라는 `room3d/domain/cameraRig.ts`·
  `seatCamera.ts`를 쓴다.
- **걷기 동작:** `characterKit.ts`에는 지금 애니메이션 클립이 없다. GLB(`study_characters.glb`)에 걷기·앉기
  클립이 있는지 먼저 확인한다. 없으면 대체 움직임을 지어 내지 말고 사용자에게 물어본다(Blender
  스크립트 `tool/blender/study_room/`로 클립을 굽는 안 / 미끄러져 이동 + 몸통 흔들림으로 갈음하는 안).
- 앉은 뒤 실제 공부 탭 UI 위에 코치 마크를 차례로 띄운다. 짚는 대상 주변만 밝히고 나머지는 어둡게
  가리며, 말풍선은 크림 종이 말풍선(`home/bubbles.tsx`의 `PaperBubble` 모양)을 쓴다.

  | 순서 | 짚는 곳 | 문구 |
  | --- | --- | --- |
  | 1 | 미니 타이머 | `studyOnboardingTimerTitle` / `studyOnboardingTimerDescription` |
  | 2 | 사운드(음반) 단추 | `studyOnboardingSoundsTitle` / `studyOnboardingSoundsDescription` |
  | 3 | 탭바 공부방 | `studyOnboardingRoomsTitle` / `studyOnboardingRoomsDescription` |
  | 4 | 탭바 통계 | `studyOnboardingStreakTitle` / `studyOnboardingStreakDescription` |

  - `studyOnboardingStreak*`의 `{minutes}`·`{hour}`는 서버 규칙 값이다(공부일 경계 04:00, 연속 기록 최소
    분은 원본 `study_stats.dart`). 프론트 상수로 지어 내지 말고, 값이 계약에 없으면 사용자에게 묻는다.
  - 문구 중 앱 기준 위치 설명("오른쪽 위 공부 사운드" 등)이 지금 웹 배치와 다르면 고치지 말고 차이를 보고한다.
  - 마지막 단추는 `studyOnboardingStart`("시작하기"). 언제든 건너뛰기가 된다.

## 누가 온보딩을 보나(먼저 사용자에게 확인)

- 계약상 `Profile.gender == null`이면 "공부방 첫 방문 소개"를 보인다. 하지만 이 신호만 쓰면 1단계만 저장되고
  나간 사람이나, 저장은 끝났는데 4단계 둘러보기를 안 본 사람을 구분하지 못한다.
- 브라우저 저장소에 사용자 데이터를 두지 않는 규칙이 있으므로, 서버에 `onboarding_completed_at`(nullable)
  같은 명시적 값을 두는 안을 **제안하고 사용자 답을 받은 뒤** 계약·목을 바꾼다. 답이 없으면 진행하지 않는다.

## 화면 공통

- 넓은 화면: 3D는 창 전체, 온보딩 UI(제목·입력·칩·단추)는 앱 폭 430px 컬럼 가운데(결정 5a).
- 섬 팔레트·컴포넌트(`IslandSurface`·`IslandButton`·`IslandIconButton`·`PaperSheet`)와 둥근 글꼴만 쓴다.
  그라데이션 광원·범용 아이콘 같은 "AI 티" 금지. 앱에 없는 그림이 꼭 필요하면 Codex에 발주하고 실패하면
  알린다.
- `prefers-reduced-motion`이면 걷기·튀는 움직임 대신 짧은 페이드.
- 앱 ARB에 없는 문구(이름 단계 제목·안내·오류, 목표 단계 제목, 건너뛰기 등)는 `l10n/web_ko.ts`에 ui-writing
  규칙으로 새로 쓰고 커밋 body에 적는다.
- 앱에 이런 게임형 화면이 없으므로 `docs/design-parity/exceptions.md`에 "사용자 결정(날짜)"으로 남긴다.

## 목 데이터

- `VITE_DATA_SOURCE=mock`에서 새 사용자로 시작할 수 있게 한다(예: 개발 로그인 시 `gender: null`인 새 프로필).
  목은 계약 모양만 흉내 내고 서버 의미는 계산하지 않는다. `PATCH /users/me/profile` 목 추가.

## 테스트(사용자에게 보이는 동작만)

- 저장이 실패하면 단계에 머물고 고른 성별·이름·태그가 그대로 있으며, 다시 누르면 같은 `Idempotency-Key`로 간다.
- 온보딩을 마친 사람은 다시 로그인해도 온보딩을 보지 않는다.
- 이름 길이를 grapheme으로 센다(이모지·자모 조합 12자 경계).
- three.js 내부 호출·색·여백·문구 상수를 고정하는 테스트는 만들지 않는다.

## 확인과 보고

- 개발 서버(`.claude/launch.json`)를 켜 두고 384px·1280px에서 단계마다 캡처해 `docs/design-parity/onboarding/`에
  남긴다.
- 커밋은 논리 단위로 나눈다: 계약·문서(태그 공개, 완료 표시) → 목 → 프론트 로직(저장·대상 판정) + 테스트 →
  1–3단계 UI → 4단계 진입·코치 마크 → 비교 문서. 각 커밋이 그 시점에 빌드되게 한다.
- 완료 보고: 된 것 / 안 된 것 / 검증하지 못한 것, 만든 커밋, 바뀐 계약 버전, 원본과 달랐던 점, 새 미결 결정
  (태그 노출 위치, 걷기 클립, streak 값, 완료 표시 방식).
