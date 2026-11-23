---
status: current
last_verified: 2026-11-23
source_of_truth: scripts/verify-commit-message.sh
copied_from: PocketTime docs/operations/commit-conventions.md @ f574f242
---

# 커밋 메시지 규칙

StudyVillage의 커밋과 Squash merge 제목은 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)을
기반으로 한다. 이 문서와 scripts/verify-commit-message.sh가 커밋 제목의
권위 있는 계약이다. CI는 아직 없다. 로컬에서 아래 스크립트로 검사한다.

## 헤더 문법

모든 사람이 작성하는 커밋과 PR 제목은 다음 형식을 사용한다.

    <type>(<optional scope>)<optional !>: <description>

- type은 다음 allow-list 중 하나다: feat, fix, docs, refactor, perf, test,
  build, ci, chore, revert.
- scope는 선택 사항이며 변경된 기능·경계를 짧게 나타낸다. 영문 소문자와
  숫자로 시작하고 [a-z0-9._/-]만 사용하며 최대 30자다. 예를 들어
  timetable, ios/widget, api, deps를 사용한다. 공백·대문자·임의의
  자연어 문장은 scope로 쓰지 않는다.
- !는 호환성이 깨지는 변경을 뜻한다. !를 썼다면 아래의
  BREAKING CHANGE: <impact> footer를 반드시 함께 작성한다.
- description은 비어 있지 않아야 하며 헤더 전체는 72자 이하, description은
  60자 이하다. 헤더와 description 앞뒤의 공백은 금지한다.
- 영어 description은 소문자로 시작한다. 한국어·일본어·중국어·숫자는 ASCII
  대소문자 구분이 없으므로 자연스러운 표기를 허용한다. 영어 문장을 전부
  대문자로 쓰지 않는다.
- description 끝에는 마침표나 종결 부호(., !, ?, 。)를 붙이지 않는다.

## 타입 선택

| 타입 | 사용 시점 | 예 |
| --- | --- | --- |
| feat | 사용자에게 새 기능·능력을 추가 | feat(dday): add image replacement |
| fix | 사용자에게 보이는 버그를 수정 | fix(timetable): preserve selected week |
| docs | 문서·에이전트 계약만 변경 | docs: clarify release checklist |
| refactor | 동작을 유지하는 구조 개선 | refactor(network): separate API client ports |
| perf | 동작을 유지하는 성능 개선 | perf(timetable): reuse viewport measurements |
| test | 테스트 추가·수정 | test(api): cover empty response decoding |
| build | 빌드·의존성·배포 산출물 설정 | build(android): update gradle plugin |
| ci | CI workflow·자동화만 변경 | ci: lint pull request commits |
| chore | 위 범주에 속하지 않는 유지보수 | chore: refresh local tooling |
| revert | 사람이 의도적으로 이전 변경을 되돌림 | revert: remove experimental widget sync |

변경의 주된 사용자·운영 의미가 타입을 결정한다. 예를 들어 앱 코드의 회귀
수정은 chore가 아니라 fix, 테스트만 추가한 변경은 test로 쓴다.

## Body와 Footer

Body와 footer는 선택 사항이다. 헤더 다음에 한 줄을 비우고 작성한다.

    fix(timetable): avoid duplicate local actions

    The editor could publish the same action after a reconnect.
    Keep the local transaction id until the server acknowledgement is durable.

    Refs: PTM-123

- Body는 무엇이 문제였고 왜 이렇게 바꾸었는지 설명한다. 구현 목록이나
  변경 파일을 반복하지 말고, 줄은 100자 이내로 감싼다.
- Footer는 body와 한 줄을 비운 뒤 둔다. Conventional Commit footer 형식인
  Token: value를 사용한다. 토큰은 영문자로 시작하고 영문자·하이픈으로
  구성한다. 이슈 연결에는 Refs: PTM-123, Closes #123, Fixes #123,
  Resolves #123을 사용하며, 여러 이슈는 각각의 footer 줄로 쓴다.
- Breaking change는 다음 중 하나를 footer에 넣는다. 값은 사용자·클라이언트가
  해야 할 일을 구체적으로 적는다.

      BREAKING CHANGE: clients must migrate timetable recurrence fields

  BREAKING-CHANGE: 표기도 허용한다. ! 표기와 함께 쓸 때는 footer가
  필수이며, footer만 사용해 breaking change를 표시하는 것도 가능하다.
- Footer 값이 여러 줄이면 이어지는 줄을 공백 또는 탭으로 들여쓴다.
- 본문·footer가 없다면 헤더만 남긴다. 헤더와 본문 사이의 빈 줄을 생략하지
  않는다.

## 자동 생성 커밋과 예외

CI의 --range 검사에서는 사람이 제목을 선택할 수 없는 다음 커밋을
보고하고 건너뛴다.

- 부모가 없는 초기 root commit
- 부모가 2개 이상인 merge commit. GitHub의 자동 merge commit도 여기에
  해당한다.
- 제목이 Revert "..."인 GitHub/Git 자동 생성 Revert commit

자동 생성 예외는 사람이 작성한 일반 커밋의 우회 수단이 아니다. 의도적으로
되돌리는 새 커밋은 revert: <description>을 사용하고, 필요한 이유와
영향을 body에 적는다. CI는 PR 제목에는 예외를 적용하지 않으므로 Squash
merge 제목은 항상 Conventional Commit 형식이어야 한다.

## 좋은 예와 나쁜 예

    # good
    feat(timetable): allow overlapping sessions
    fix: 시간표 복원 순서 보장
    docs(agent): explain commit lint workflow
    refactor(ios/widget): isolate shared timeline mapping
    feat(api)!: replace timetable recurrence envelope

    BREAKING CHANGE: clients must send recurrence rules in the new envelope

    # bad
    Add tests for timetable                 # type 없음
    Feat: add a feature                     # type/description 대소문자 규칙 위반
    feat(Timetable): add a feature          # scope에 대문자
    fix: preserve scroll position.          # description 끝 마침표
    feat!: replace API envelope             # !인데 BREAKING CHANGE footer 없음
    fix(timetable): issue
    details without a blank line            # 헤더와 body 사이 빈 줄 없음

## 로컬 사용법

커밋을 만들기 전에 메시지를 검사한다.

    ./scripts/verify-commit-message.sh --title "feat(server/auth): add session cookies"
    ./scripts/verify-commit-message.sh --message-file .git/COMMIT_EDITMSG

StudyVillage의 scope 예: server, server/auth, server/rooms, web, web/room3d, api, contracts, assets, deps.
