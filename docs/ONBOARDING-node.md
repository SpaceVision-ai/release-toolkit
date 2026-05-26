# 자식 Node 레포 onboarding 가이드

composite action(`SpaceVision-ai/release-toolkit/actions/release-node@v0`) 방식으로 릴리즈 자동화를 적용하는 절차. toolkit 패키지를 직접 install할 필요 없으며 로컬 개발자에게 추가 셋업이 없다.

## 1. 사전 조건

- Node.js ≥18.20, pnpm 사용 레포
- GitHub 레포 secret `OPENAI_API_KEY` 설정
- `release`, `main`, `develop` 브랜치 흐름 (또는 동등)

## 2. 셋업 5단계

### 2.1 `.releaserc.cjs` 작성

가장 단순한 형태:

```js
module.exports = require('@spacevision-ai/release-toolkit-node/config/releaserc-base');
```

레포별 override가 필요하면 spread + plugins map:

```js
const base = require('@spacevision-ai/release-toolkit-node/config/releaserc-base');

module.exports = {
  ...base,
  tagFormat: '${version}', // 기본값 v${version} 대신 사용하고 싶을 때
  plugins: base.plugins.map(p => {
    if (Array.isArray(p) && p[0] === '@semantic-release/git') {
      return ['@semantic-release/git', {
        ...p[1],
        assets: ['package.json', 'CHANGELOG.md'], // pnpm-lock.yaml 제외하는 경우
      }];
    }
    return p;
  }),
};
```

### 2.2 `.releaserc.preview.cjs` 작성

```js
module.exports = require('@spacevision-ai/release-toolkit-node/config/releaserc-preview-base');
```

### 2.3 `commitlint.config.cjs` 작성

```js
module.exports = require('@spacevision-ai/release-toolkit-node/config/commitlint-base');
```

추가 규칙이 필요하면:

```js
const base = require('@spacevision-ai/release-toolkit-node/config/commitlint-base');

module.exports = {
  ...base,
  rules: {
    ...base.rules,
    'subject-min-length': [2, 'always', 5],
  },
};
```

### 2.4 wrapper workflow 작성

`.github/workflows/release.yml`:

```yaml
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
  packages: read
jobs:
  release:
    if: ${{ !contains(github.event.head_commit.message, 'skip ci') }}
    runs-on: ubuntu-latest
    steps:
      - uses: SpaceVision-ai/release-toolkit/actions/release-node@v0
        with:
          pnpm_version: '10.33.0'   # 생략 가능 (packageManager 필드 사용)
          run_lint: 'true'           # 필요 시
          run_test: 'true'           # 필요 시
          trigger_deploy_workflow: 'deploy-prod.yml'   # 필요 시
          trigger_dev_deploy_workflow: 'deploy-dev.yml' # 필요 시
          github_token: ${{ secrets.GITHUB_TOKEN }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
```

`.github/workflows/pr-preview.yml`:

```yaml
name: Release Preview
on:
  pull_request:
    branches: [release]
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
  packages: read
jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: SpaceVision-ai/release-toolkit/actions/pr-preview-node@v0
        with:
          pnpm_version: '10.33.0'   # 생략 가능
          github_token: ${{ secrets.GITHUB_TOKEN }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
```

**`@v0`** 은 toolkit이 0.x 동안 따라가는 major tag. toolkit이 1.0.0을 끊으면 `@v1`로 교체.

**`packages: read`**: composite action이 내부에서 toolkit 패키지를 사용할 때 GITHUB_TOKEN 인증에 필요. 없으면 403 발생.

### 2.5 `.releaserc.cjs` 등이 참조하는 toolkit은 자동 제공

wrapper workflow에서 composite action이 실행되면, toolkit 레포가 runner에 다운로드되어 `node_modules/@spacevision-ai/release-toolkit-{core,node}` symlink가 자동 생성된다. 별도 npm install이나 `.npmrc` auth 설정이 필요 없다.

## 3. 비상 시 toolkit 버전 pin

toolkit `vX.Y.Z`에서 회귀 발견 시:

- 자식 레포 wrapper workflow의 `@v0` 또는 `@v1`을 정확한 patch tag(예: `@v0.1.2`)로 변경
- toolkit 측 fix-forward release를 기다린 뒤 major 트랙으로 복귀

## 4. 토큰·권한 체크리스트

- [ ] 레포 secret `OPENAI_API_KEY` 설정 (또는 organization-level)
- [ ] wrapper workflow의 `permissions.packages: read`
- [ ] release 브랜치 push가 가능한 branch protection 설정 (있다면 `github-actions[bot]` 예외)
