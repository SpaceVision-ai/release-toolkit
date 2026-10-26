# 앱 릴리즈 경로 (app-cycle · app-release)

스토어에 나가는 앱(Flutter 등)을 위한 릴리즈 경로. 출시 버전을 사람이 고르고, 사내 테스트 사이클(시작·중간·종료)을 빌드 태그로 남기며, 릴리즈 노트는 출시가 확인된 뒤에 공개한다.

> **기존 `release-dart`·`release-node`와 함께 쓰지 않는다.** semantic-release가 커밋 규칙으로 계산한 `x.y.z` 태그와 이 경로의 출시 버전 태그가 겹친다. 한 레포는 둘 중 하나만 쓴다.

## 태그 체계

| 태그 | 의미 | 찍는 시점 |
|------|------|-----------|
| `1.5.0.45-start` | 1.5.0 테스트 시작 빌드 (빌드 45) | 테스트 시작 빌드 업로드 성공 |
| `1.5.0.46` | 테스트 중간 빌드 | 중간 빌드 업로드 성공 |
| `1.5.0.49-end` | 테스트 종료, 최종 빌드 | 테스트 종료 |
| `1.5.0` | 릴리즈 (최종 빌드 커밋, GitHub Release와 짝) | 테스트 종료 (프리릴리즈로 생성) |

- 판별은 `x.y.z`, `x.y.z.N`, `x.y.z.N-start`, `x.y.z.N-end` 형식만 본다. `x.y.z-legacy`, `exp.*`, `v0` 같은 태그는 무시한다.
- 빌드 태그는 메시지가 있는 태그(annotated)로 찍는다. 배포 요약의 시작·종료일을 태그 생성 시각에서 읽는다.
- GitHub Release 상태: 테스트 시작 = 초안, 테스트 종료 = 프리릴리즈, 출시 확인 = 공개.

## actions/app-cycle

빌드 단계 판별(`decide`) 또는 main 대상 PR 검사(`gate`). 호출 전에 `actions/checkout`을 `fetch-depth: 0`으로 한다.

| 입력 | 모드 | 설명 |
|------|------|------|
| `mode` | 공통 | `decide` 또는 `gate` (필수) |
| `ref` | decide | 빌드할 ref (`main` 또는 `hotfix/*`) |
| `bump` | decide | `major` / `minor` / `patch` / `skip` (기본 `skip`). main 테스트 시작에만 적용 |
| `complete` | decide | 테스트 완료 체크 (`true`면 종료) |
| `build_number` | decide | 이번 빌드 번호 (양의 정수) |
| `head_ref` | gate | PR head 브랜치 이름 |
| `head_sha` | gate | PR head 커밋. pull_request 체크아웃의 HEAD는 머지 커밋이라 따로 받는다. 핫픽스는 이 커밋에 `-end`가 있어야 통과 |

| 출력 (decide) | 설명 |
|---------------|------|
| `stage` | `start` / `mid` / `end` (판별 실패는 step 실패) |
| `version` | 출시 버전 |
| `build_tag` | 이번 빌드 태그 |
| `build` | 빌드 필요 여부 (`false`면 다시 빌드하지 않고 종료) |
| `start_ref` | 사이클 시작 커밋 |
| `final_ref` | 이번 빌드(또는 최종) 커밋 |
| `from_ref` | 직전 출시(공개) 릴리즈 태그 |
| `recommended_bump` | 커밋 규칙상 권장 올림 폭 (참고) |

gate는 통과하면 성공, 막히면 `::error::` 메시지와 함께 실패한다.

| main 상태 | develop | main에서 분기한 fix/ | hotfix/ |
|-----------|---------|----------------------|---------|
| 테스트 중 | 차단 | 허용 | `-end` 커밋 그대로면 허용 |
| 닫힘 (`-end` 뒤, 공개 여부 무관) | 허용 | 줄기 버전이 공개 전이고 `-end` 뒤 develop이 안 들어왔으면 허용(재테스트용), 그 밖에는 차단 | `-end` 커밋 그대로면 허용 |

- `-end`가 찍히면 공개(스토어 출시) 전이어도 develop을 머지하고 버전을 올려 다음 테스트를 시작할 수 있다. 공개 여부는 출시 콘솔이 다룬다.
- 같은 버전 재테스트(`bump: skip`)는 공개 전이고 `-end` 뒤 main에 develop이 들어오지 않았을 때만 된다. develop 유입은 `-end` 이후 main 커밋마다 연결된 main 대상 PR의 head 브랜치로 판정한다(`fix/`가 아니거나 PR이 없으면 develop으로 본다).
- 올린 버전에 이미 빌드 태그가 있으면(머지 전 핫픽스 등) 거부한다. 핫픽스 버전은 최신 공개 + patch부터, 다른 가지가 이미 빌드한 번호를 건너뛴다.
- patch로 올린 번호가 머지 전 핫픽스 버전과 겹쳐 거부되면 minor로 올린다 (patch를 두 번 올리는 선택지는 없다).
- main-gate는 PR 이벤트에서만 돈다. `-end` 뒤 develop이 먼저 머지됐다면, 그 전에 통과한 `fix/` PR은 main-gate를 다시 실행해야 한다.

## actions/app-release

릴리즈 노트·태그 처리.

| 입력 | 설명 |
|------|------|
| `stage` | `start`(초안) / `end`(태그·프리릴리즈·백머지) / `publish`(배포 요약·공개) (필수) |
| `version` | 출시 버전 (필수) |
| `ref` | 빌드한 ref (기본 `main`). `hotfix/*`면 종료 때 main·develop으로 PR을 만든다 |
| `from_ref` | 직전 출시 릴리즈 태그 |
| `start_ref` | 사이클 시작 커밋 |
| `final_ref` | 최종 빌드 커밋 |
| `facts` | publish: 사이클 정보 JSON (`build`, `startedAt`, `endedAt`, `releasedAt`, `testBuilds`, `fixes`) |
| `openai_api_key` | start 요약용. 없으면 원문 노트를 쓴다 |
| `token` | gh(릴리즈·PR) 토큰. 기본 `GITHUB_TOKEN`으로 만든 PR은 다른 워크플로(main-gate·test)를 실행하지 않으므로 PAT/App 토큰을 넘긴다 |

- AI 요약은 `start`에서 한 번만 한다. `end`는 "테스트 중 수정" 목록을 결정론으로 붙이고, `publish`는 사이클 정보 표를 앞에 붙인다.
- `end`의 백머지는 `-X theirs` 없이 main → develop을 머지해 push한다. 충돌하면 `chore/backmerge-<버전>` 브랜치로 PR을 만든다.
- CI는 main에 커밋하지 않는다. 남기는 것은 태그와 GitHub Release뿐이다.

## 사용 예 (build.yml)

```yaml
jobs:
  decide:
    runs-on: ubuntu-latest
    outputs:
      stage: ${{ steps.cycle.outputs.stage }}
      version: ${{ steps.cycle.outputs.version }}
      build_tag: ${{ steps.cycle.outputs.build_tag }}
      build: ${{ steps.cycle.outputs.build }}
      start_ref: ${{ steps.cycle.outputs.start_ref }}
      final_ref: ${{ steps.cycle.outputs.final_ref }}
      from_ref: ${{ steps.cycle.outputs.from_ref }}
      number: ${{ steps.number.outputs.number }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref }}
          fetch-depth: 0
      - id: number
        run: echo "number=$((BUILD_NUMBER_OFFSET + ${{ github.run_number }}))" >> "$GITHUB_OUTPUT"
      - id: cycle
        uses: SpaceVision-ai/release-toolkit/actions/app-cycle@v0
        with:
          mode: decide
          ref: ${{ inputs.ref }}
          bump: ${{ inputs.version_bump }}
          complete: ${{ inputs.test_complete }}
          build_number: ${{ steps.number.outputs.number }}

  # ios / android: needs.decide.outputs.build == 'true' 일 때 final_ref를 체크아웃해 빌드·업로드

  finalize:
    needs: [decide, ios, android]
    if: >-
      always()
      && needs.decide.result == 'success'
      && needs.ios.result != 'failure' && needs.ios.result != 'cancelled'
      && needs.android.result != 'failure' && needs.android.result != 'cancelled'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref }}
          fetch-depth: 0
      # 빌드 태그(annotated) push — 같은 커밋에 이미 있으면 건너뜀
      - if: needs.decide.outputs.stage == 'start'
        uses: SpaceVision-ai/release-toolkit/actions/app-release@v0
        with:
          stage: start
          version: ${{ needs.decide.outputs.version }}
          ref: ${{ inputs.ref }}
          from_ref: ${{ needs.decide.outputs.from_ref }}
          start_ref: ${{ needs.decide.outputs.start_ref }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          token: ${{ secrets.RELEASE_PR_TOKEN }}
      - if: needs.decide.outputs.stage == 'end'
        uses: SpaceVision-ai/release-toolkit/actions/app-release@v0
        with:
          stage: end
          version: ${{ needs.decide.outputs.version }}
          ref: ${{ inputs.ref }}
          from_ref: ${{ needs.decide.outputs.from_ref }}
          start_ref: ${{ needs.decide.outputs.start_ref }}
          final_ref: ${{ needs.decide.outputs.final_ref }}
          token: ${{ secrets.RELEASE_PR_TOKEN }}
```

main 대상 PR 검사 (main-gate.yml):

```yaml
on:
  pull_request:
    branches: [main]
jobs:
  main-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: git fetch origin main develop --tags
      - uses: SpaceVision-ai/release-toolkit/actions/app-cycle@v0
        with:
          mode: gate
          head_ref: ${{ github.head_ref }}
          head_sha: ${{ github.event.pull_request.head.sha }}
```

전체 흐름과 결정 배경은 svai-connect 설계 문서(`spacevision/docs/superpowers/plan-try-branch-workflow.md`)를 따른다.
