# 자식 Node 레포 onboarding 가이드

`@spacevision-ai/release-toolkit-node` (+ 자동 함께 install되는 `release-toolkit-core`) 적용 절차.

## 1. 사전 조건

- Node.js ≥18.20, pnpm 사용 레포
- GitHub organization-level secret `OPENAI_API_KEY` 가 자식 레포에서 inherit 가능
- `release`, `main`, `develop` 브랜치 흐름 (또는 동등)

## 2. 셋업 6단계

### 2.1 npm 의존성 추가

```bash
pnpm add -D @spacevision-ai/release-toolkit-node
```

core는 node sub-package의 dependency라 자동 함께 install된다.

### 2.2 `.npmrc` 추가

레포 루트에 `.npmrc`:

```
@spacevision-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

### 2.3 `.releaserc.cjs` 작성

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
        assets: ['package.json', 'yarn.lock', 'CHANGELOG.md'], // pnpm-lock 대신 yarn.lock
      }];
    }
    return p;
  }),
};
```

### 2.4 `.releaserc.preview.cjs` 작성

```js
module.exports = require('@spacevision-ai/release-toolkit-node/config/releaserc-preview-base');
```

### 2.5 `commitlint.config.cjs` 작성

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

### 2.6 wrapper workflow 작성

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
  actions: write
jobs:
  release:
    if: ${{ !contains(github.event.head_commit.message, 'skip ci') }}
    uses: SpaceVision-ai/release-toolkit/.github/workflows/release-node.yml@v0
    with:
      run_test: true
      trigger_deploy_workflow: deploy-prod.yml
      trigger_dev_deploy_workflow: deploy-dev.yml
    secrets: inherit
```

`.github/workflows/pr-preview.yml`:

```yaml
name: Release Preview
on:
  pull_request:
    branches: [release]
    types: [opened, synchronize, reopened]
jobs:
  preview:
    uses: SpaceVision-ai/release-toolkit/.github/workflows/pr-preview-node.yml@v0
    secrets: inherit
```

**`@v0`** 은 toolkit이 0.x 동안 따라가는 major tag. toolkit이 1.0.0을 끊으면 `@v1`로 교체.

**concurrency**: reusable workflow는 호출자에 concurrency를 강제할 수 없으므로 wrapper에 반드시 직접 선언한다. 위 예시의 `concurrency.group: release`가 그 역할.

## 3. 로컬 개발자 1회 셋업

GitHub Packages에서 private 패키지를 install하려면 read 권한 PAT가 필요하다.

1. https://github.com/settings/tokens → "Generate new token (classic)" → `read:packages` 스코프만 체크 → 발급
2. `~/.npmrc` 에 추가:
   ```
   //npm.pkg.github.com/:_authToken=ghp_xxxxxxxx
   ```
3. 이후 `pnpm install` 시 자동 인증

## 4. 비상 시 toolkit 버전 pin

toolkit `vX.Y.Z`에서 회귀 발견 시:

- 자식 레포 wrapper workflow의 `@v0` 또는 `@v1`을 정확한 patch tag(예: `@v0.1.2`)로 변경
- `package.json` 의 `@spacevision-ai/release-toolkit-node` 의존성을 정확한 이전 버전으로 pin: `"@spacevision-ai/release-toolkit-node": "0.1.1"`
- toolkit 측 fix-forward release를 기다린 뒤 major 트랙으로 복귀

## 5. 토큰·권한 체크리스트

- [ ] organization secret `OPENAI_API_KEY` 가 자식 레포에서 inherit 가능
- [ ] wrapper workflow의 `permissions.packages: read` (`@spacevision-ai/release-toolkit-*` install용)
- [ ] release 브랜치 push가 가능한 branch protection 설정 (있다면 `github-actions[bot]` 예외)
