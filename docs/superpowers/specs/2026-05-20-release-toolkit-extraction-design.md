> **⚠️ Superseded by [2026-05-20-release-toolkit-multi-language-redesign.md](./2026-05-20-release-toolkit-multi-language-redesign.md)**
>
> 이 spec은 toolkit을 Node·pnpm 단일 stack 전용으로 설계했다. 88개 레포가 다양한 stack을 운영한다는 사실이 brainstorming 도중 재확인되면서 multi-language monorepo 재설계로 대체되었다. 본문은 history로 보존된다.

---

# Release Toolkit 추출 설계

작성일: 2026-05-20
대상 영역: SpaceVision 자동 릴리즈 인프라
현재 적용 레포: partner-api-gateway, data-api, web-console

## 1. 문제

현재 3개 레포에 동일한 릴리즈 자동화 자산이 복붙되어 있다:

```
.releaserc.cjs
.releaserc.preview.cjs
commitlint.config.cjs
scripts/polish-release-notes.mjs
scripts/preview-release.mjs
.github/workflows/release.yml
.github/workflows/pr-preview.yml
```

prompt 한 줄을 고치거나 commitlint 규칙을 추가할 때마다 3개 레포에 동일한 PR을 만들어야 하고,
적용 범위가 16개 이상으로 늘면(전사 표준화 목표) 변경 전파 비용이 선형으로 누적된다.
실제로 polish prompt만 단기간에 3차례 수정되었고, 그때마다 3개 PR을 직접 갱신했다.

drift 위험도 누적된다 — 일부 레포는 이미 `previousTag` 로직 구버전, `placeholder` 사내 정착 정책 등으로
스타일·로직이 어긋난 적이 있다.

## 2. 목표

- 자동 릴리즈 자산의 **단일 진실의 원천**을 한 곳에 둔다.
- 자식 레포에는 **얇은 wrapper만** 남기고, 핵심 로직과 워크플로우는 외부 참조로 흡수한다.
- 새 레포 onboarding 비용을 "파일 7개 복사 + 차이 customize"에서 "wrapper 3~4파일 추가"로 줄인다.
- 레포별 의도된 차이(Lint/Test, 배포 트리거, pnpm 버전, tagFormat 등)는 input parameter로 흡수한다.
- semver 정책으로 자식 레포가 안전하게 자동 수신 + breaking은 명시적 bump로만.

## 3. 아키텍처

### 3.1 신규 레포

```
spacevision-ai/release-toolkit
├─ package.json                    # @spacevision-ai/release-toolkit npm 패키지
├─ scripts/
│  ├─ polish-release-notes.mjs     # AI 정제 (systemPrompt 포함)
│  └─ preview-release.mjs          # 결정론 미리보기
├─ config/
│  ├─ releaserc-base.cjs           # .releaserc.cjs의 공통 베이스
│  ├─ releaserc-preview-base.cjs   # .releaserc.preview.cjs의 공통 베이스
│  └─ commitlint-base.cjs          # commitlint.config.cjs의 공통 베이스
├─ .github/workflows/
│  ├─ release.yml                  # reusable workflow (workflow_call)
│  └─ pr-preview.yml               # reusable workflow (workflow_call)
└─ docs/
   └─ ONBOARDING.md                # 자식 레포 셋업 가이드
```

### 3.2 두 가지 export 채널

| 채널 | 무엇을 제공 | 자식 레포에서 사용 |
|---|---|---|
| **npm 패키지** (GitHub Packages) | scripts + config 베이스 | `pnpm add -D @spacevision-ai/release-toolkit` + `require()`로 베이스 합성 |
| **Reusable workflow** | release.yml / pr-preview.yml | `uses: spacevision-ai/release-toolkit/.github/workflows/release.yml@v1` |

두 채널은 같은 toolkit 레포의 동일 tag에서 동기 release된다. tag 하나가 곧 한 버전.

### 3.3 자식 레포 (after)

```
web-console/  (이런 식으로 단순해진다)
├─ .github/workflows/
│  ├─ release.yml          # 10~20줄 wrapper, reusable workflow 호출
│  └─ pr-preview.yml       # 10~20줄 wrapper
├─ .releaserc.cjs          # require('@spacevision-ai/release-toolkit/config/releaserc-base') 합성
├─ .releaserc.preview.cjs  # require('@spacevision-ai/release-toolkit/config/releaserc-preview-base') 합성
├─ commitlint.config.cjs   # require('@spacevision-ai/release-toolkit/config/commitlint-base') 합성
└─ package.json            # devDependency: @spacevision-ai/release-toolkit ^1.0.0
```

자식 레포가 직접 보유하던 `scripts/polish-release-notes.mjs` 등은 **삭제**한다.

## 4. 컴포넌트 상세

### 4.1 npm 패키지 (`@spacevision-ai/release-toolkit`)

#### package.json 핵심

```json
{
  "name": "@spacevision-ai/release-toolkit",
  "version": "1.0.0",
  "type": "commonjs",
  "exports": {
    "./scripts/polish-release-notes.mjs": "./scripts/polish-release-notes.mjs",
    "./scripts/preview-release.mjs": "./scripts/preview-release.mjs",
    "./config/releaserc-base": "./config/releaserc-base.cjs",
    "./config/releaserc-preview-base": "./config/releaserc-preview-base.cjs",
    "./config/commitlint-base": "./config/commitlint-base.cjs"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  }
}
```

#### scripts 호출 방식

reusable workflow가 자식 레포의 checkout 컨텍스트에서 다음을 실행한다:

```yaml
- run: node node_modules/@spacevision-ai/release-toolkit/scripts/polish-release-notes.mjs "$TAG"
```

또는 자식 레포 `package.json`에 npm script 별칭을 두는 방식도 가능:

```json
"scripts": {
  "release:polish": "node node_modules/@spacevision-ai/release-toolkit/scripts/polish-release-notes.mjs"
}
```

→ **scripts 호출은 reusable workflow가 책임진다.** 자식 레포에 별칭을 두지 않는다 (그러면 자식 레포가 또 한 줄 보유하게 됨).

#### config 베이스 합성 패턴

자식 레포의 `.releaserc.cjs`:

```js
const base = require('@spacevision-ai/release-toolkit/config/releaserc-base');

module.exports = {
  ...base,
  // 레포별 customization (예: tagFormat, git assets)
  tagFormat: '${version}',
  plugins: base.plugins.map(p => {
    if (Array.isArray(p) && p[0] === '@semantic-release/git') {
      return ['@semantic-release/git', { ...p[1], assets: ['package.json', 'pnpm-lock.yaml', 'CHANGELOG.md'] }];
    }
    return p;
  }),
};
```

base는 hotfix·fix·feat 등 release rule, presetConfig.types(이모지 섹션), changelog 설정을 모두 포함한다.
자식 레포는 **달라야 하는 부분만** override한다.

### 4.2 Reusable workflow

#### release.yml 시그니처

```yaml
on:
  workflow_call:
    inputs:
      node_version:           { type: string,  default: '22' }
      pnpm_version:           { type: string,  default: '' }      # 빈 값이면 packageManager 따름
      run_lint:               { type: boolean, default: false }
      run_test:               { type: boolean, default: false }
      lint_command:           { type: string,  default: 'pnpm lint' }
      test_command:           { type: string,  default: 'pnpm test' }
      sync_to_main:           { type: boolean, default: true }
      back_merge_to_develop:  { type: boolean, default: true }
      trigger_deploy_workflow: { type: string, default: '' }      # 'deploy-prod.yml' 같은 값. 빈 값이면 skip
      deploy_target_branch:   { type: string,  default: 'main' }
    secrets:
      OPENAI_API_KEY:
        required: true
```

#### release.yml 동작 흐름

1. Checkout (fetch-depth: 0, persist-credentials: false)
2. Setup pnpm (input에 명시된 경우만 version pin)
3. Setup Node.js (input의 node_version)
4. Install dependencies (`pnpm install --frozen-lockfile`)
5. Lint (input이 true면)
6. Test (input이 true면)
7. Strict commit check (LAST_RELEASE baseline)
8. Configure Git as github-actions[bot]
9. Run semantic-release (자식 레포의 `.releaserc.cjs` 사용 — toolkit base를 자동 합성)
10. Sync release → main (input이 true면)
11. Trigger deploy workflow (input이 빈 값 아니면)
12. Back-merge main → develop (input이 true면)

#### 자식 레포 wrapper 예시 (web-console)

```yaml
# .github/workflows/release.yml (web-console)
name: Release
on:
  push:
    branches: [release]
concurrency:
  group: release
  cancel-in-progress: false
permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write
  packages: read
jobs:
  release:
    if: ${{ !contains(github.event.head_commit.message, 'skip ci') }}
    uses: spacevision-ai/release-toolkit/.github/workflows/release.yml@v1
    with:
      pnpm_version: '10.33.0'
      run_lint: false
      run_test: false
      trigger_deploy_workflow: 'deploy-prod.yml'
    secrets: inherit
```

#### pr-preview.yml 시그니처

```yaml
on:
  workflow_call:
    inputs:
      node_version:  { type: string, default: '22' }
      pnpm_version:  { type: string, default: '' }
    secrets:
      OPENAI_API_KEY:
        required: true
```

동작은 현재 pr-preview.yml과 동일하지만, scripts/polish-release-notes.mjs와 scripts/preview-release.mjs를 자식 레포의 `node_modules`에서 읽어 실행한다.

### 4.3 인증

- **자식 레포에서 install 시**: GitHub Actions 환경에선 `${{ secrets.GITHUB_TOKEN }}`이 organization 내부 패키지를 자동으로 읽음. 자식 레포 `.npmrc`에 다음 한 줄:
  ```
  @spacevision-ai:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
  ```
  workflow에서 `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` env 설정.

- **로컬 개발자**: PAT(read:packages scope)를 발급해 `~/.npmrc`에 한 번 등록. organization 가입 멤버 누구나 가능. ONBOARDING.md에 1회성 절차 명시.

- **toolkit publish 시**: toolkit 레포 자체의 GitHub Actions에서 `secrets.GITHUB_TOKEN`이 write:packages 권한을 가짐. 별도 PAT 불필요.

## 5. 버전 정책

- **Semantic versioning** 엄격 적용:
  - **patch**: prompt 문구 수정, 버그 수정, 내부 정비
  - **minor**: 새 input parameter 추가 (backward compatible), 새 config 옵션 추가
  - **major**: input parameter 제거·시그니처 변경, config base의 release rule 의미 변경, reusable workflow 구조 변경 등 자식 레포의 wrapper 수정을 요구하는 변경
- **자식 레포의 version range**: 기본 `^1.0.0` (캐럿). patch·minor는 자동 수신.
- **major bump 시**: toolkit이 CHANGELOG와 migration note를 제공. 자식 레포는 명시적 PR로 `^2.0.0` 으로 bump.
- **reusable workflow tag**: npm 버전과 동일한 tag로 GitHub에 push (예: `v1.0.0`). 자식 레포는 `@v1` (major 트랙) 또는 `@v1.2.3` (정확한 버전) 으로 참조 가능. 권장: **major 트랙**(`@v1`). toolkit이 v1 major branch에 patch·minor를 cherry-pick하거나 GitHub의 [move-major-tag](https://github.com/marketplace/actions/move-major-tag) 패턴으로 v1 tag를 최신 v1.x로 이동.

## 6. 레포별 차이 흡수 모델

지금까지 발견한 의도된 차이:

| 차이 | 모델 |
|---|---|
| Lint/Test on/off | reusable workflow input (`run_lint`, `run_test`) |
| Lint/Test 커맨드 (`pnpm lint` vs `pnpm test:ci` 등) | reusable workflow input (`lint_command`, `test_command`) |
| pnpm version pin | reusable workflow input (`pnpm_version`) |
| Node.js version | reusable workflow input (`node_version`) |
| 배포 트리거 (push vs workflow_dispatch) | reusable workflow input (`trigger_deploy_workflow` — 빈 값이면 skip) |
| tagFormat | `.releaserc.cjs`에서 base override |
| `@semantic-release/git` assets (pnpm-lock.yaml 포함 여부 등) | `.releaserc.cjs`에서 base override |
| `commitlint` 추가 규칙 | `commitlint.config.cjs`에서 base 합성 후 rules 확장 |

→ **워크플로우 자체의 분기는 input parameter로**, **config의 미세 차이는 base override로** 흡수한다.

config base override가 너무 복잡해지는 시점이 오면(가령 plugins 순서를 바꿔야 하는 경우) 그 때 별도 input/preset을 만든다. 처음부터 모든 input을 만들지 않는다.

## 7. 자식 레포 onboarding 절차

새 레포에서 자동 릴리즈를 켤 때:

1. `package.json`에 devDependency 추가: `@spacevision-ai/release-toolkit: ^1.0.0`
2. `.npmrc` 추가 (위 4.3 참고)
3. `.releaserc.cjs`, `.releaserc.preview.cjs`, `commitlint.config.cjs` 작성 — 각 파일은 toolkit base를 require하고 override만 적는다 (각 3~10줄)
4. `.github/workflows/release.yml` 작성 — reusable workflow를 `uses:` 로 호출 (15~25줄)
5. `.github/workflows/pr-preview.yml` 작성 — 동일 (10~15줄)
6. Organization secrets 확인: `OPENAI_API_KEY`가 organization-level로 공유되어 있어야 함

toolkit 레포의 `docs/ONBOARDING.md`에 위 절차를 복붙용 스니펫과 함께 둔다.

## 8. 기존 3개 레포 migration 절차

이미 자동 릴리즈가 적용된 partner-api-gateway, data-api, web-console에 적용:

1. **toolkit 레포 셋업 (v1.0.0 publish)**:
   - 가장 최신 상태인 자산을 기준으로 toolkit에 이전 (현재 prompt, hotfix 컨벤션 모두 포함)
   - `@v1` major tag 생성
2. **자식 레포별로 1 PR씩 migration**:
   - 자식 레포의 `scripts/polish-release-notes.mjs`, `scripts/preview-release.mjs` 삭제
   - `.releaserc.cjs` 등을 base 합성 형태로 단축
   - `.github/workflows/release.yml`, `pr-preview.yml`을 wrapper 형태로 단축
   - `package.json`에 devDependency 추가
   - `.npmrc` 추가
3. **검증**: 각 자식 레포의 release 브랜치로 PR을 끊어 pr-preview 미리보기가 새 toolkit에서 정상 생성되는지 확인. 다음 실제 릴리즈가 정상 동작하는지 모니터링.

순서: partner-api-gateway → data-api → web-console (작은 영향부터). 또는 동시.

## 9. 발견된 trade-off

| trade-off | 영향 | 채택 입장 |
|---|---|---|
| 자식 레포가 GitHub Packages 인증에 의존 | 로컬 개발자는 PAT 한 번 발급 필요 | 수용. ONBOARDING.md에 1회성 절차 명시 |
| reusable workflow 호출 시 `secrets: inherit` 사용 | 자식 레포의 모든 secret이 reusable workflow에 노출 | 수용. toolkit이 사내 신뢰 자산이므로 OK |
| toolkit 변경 시 자식 레포는 patch/minor를 **자동** 수신 | 자식 레포가 자기도 모르게 동작 변경 | 수용. semver 엄격 적용으로 mitigate. 다만 toolkit CHANGELOG를 자식 레포 오너가 구독할 수단(예: GitHub release notification) 권장 |
| reusable workflow의 `@v1` major 트랙을 toolkit이 직접 maintain | toolkit 운영 부담 (v1 tag move 자동화 필요) | move-major-tag action 또는 release workflow에 v1 tag move 스텝 추가 |
| config base override 패턴이 복잡해질 수 있음 | 자식 레포 `.releaserc.cjs`가 점점 길어짐 | 처음엔 단순 override로 시작, override 패턴이 3개 레포 이상에서 반복되면 toolkit input/preset으로 흡수 |

## 10. 검증 전략

toolkit 변경이 자식 레포 16개 이상에 동시에 영향을 미치므로, 실제 자식 레포 PR에 적용되기 전 단계에서 회귀를 잡는 안전망이 필요하다.

- **toolkit 레포 자체의 CI**:
  - npm 패키지 build/lint
  - `scripts/polish-release-notes.mjs --preview` 호출 단위 테스트 (mock 입력 → 출력 형식 검증: `- ` bullet 수, 본질 문단 존재, 토큰 풀어쓰기 적용 여부)
  - `scripts/preview-release.mjs` 단위 테스트 (mock git log + .releaserc 입력 → 예상 version·notes)
- **canary 레포**:
  - `spacevision-ai/release-toolkit-canary` 같은 최소 레포를 두고, toolkit `@v1` 트랙을 항상 follow
  - toolkit `v1.x` patch/minor release가 끊기면 canary 레포에 의도적으로 PR을 끊어 reusable workflow가 정상 도는지 확인하는 nightly job
  - 운영 자식 레포에 도달하기 전 한 단계의 사람이 보는 노이즈 신호
- **prompt 회귀 검증 (선택)**:
  - fixture 입력 N개에 대한 expected output snapshot을 toolkit 레포에 두고, prompt 변경 시 snapshot diff를 PR에 첨부
  - 비용·복잡도가 있어 2차 단계로 미룸. 우선은 canary 레포로 충분

## 11. 롤백·비상 절차

toolkit `v1.x.y`에서 회귀가 발견되면:

- **즉시 대응**: 자식 레포의 wrapper에서 `@v1` 을 `@v1.x.(y-1)` 같은 정확한 이전 패치로 pin. 1줄 변경.
- **toolkit 측 패치**: toolkit 레포에서 `v1.x.(y+1)` 으로 fix-forward release. 자식 레포가 `@v1` 트랙이면 자동 수신.
- **major 회귀**: toolkit이 잘못된 major 변경을 push한 경우, 자식 레포는 `@v(N-1)` 로 명시적 down-bump. toolkit은 yanked release 안내 + 다음 major에서 정정.

npm 패키지도 동일하게 자식 레포의 `package.json` version range를 한 단계 좁혀 임시 pin 가능.

자식 레포 운영자가 이 절차를 빠르게 실행할 수 있도록 `docs/ONBOARDING.md`에 "비상 시 pin 방법" 1단락을 둔다.

## 12. Out of scope (이번 spec에서 다루지 않음)

- **monorepo 전환** (88개 레포를 하나로 합침) — 너무 큰 변경, 별도 논의
- **다른 언어 스택 지원** (Go, Python 등) — 현재 toolkit은 Node/pnpm 기반 레포 전용. 다른 스택은 별도 toolkit
- **GitHub 외 다른 CI 지원** (GitLab CI 등) — SpaceVision은 GitHub만 사용
- **자식 레포의 자동 dependency update 자동화** (Dependabot/Renovate 설정) — 별도 결정

## 13. Open questions

- toolkit 레포의 organization 위치는 `spacevision-ai/release-toolkit`로 확정해도 되는지 확인 필요
- `v1` major tag move를 toolkit release workflow에 통합할지, [release-please](https://github.com/google-github-actions/release-please-action) 같은 도구로 위임할지 — 다음 단계에서 결정
- 기존 3개 레포 migration을 일괄로 진행할지, 한 레포씩 검증하며 진행할지 — 구현 계획에서 결정
