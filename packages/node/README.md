# @spacevision-ai/release-toolkit-node

Node + pnpm + semantic-release + commitlint 스택용 SpaceVision 릴리즈 자동화 sub-package.

## 제공

- **`config/releaserc-base.cjs`** — semantic-release base config. core/conventions에서 release rules·section types를 자동 파생.
- **`config/releaserc-preview-base.cjs`** — PR 미리보기 전용 슬림 config.
- **`config/commitlint-base.cjs`** — commitlint base. core/conventions의 types를 type-enum으로 자동 합성.
- **`scripts/preview-release.mjs`** — 자식 레포의 `.releaserc.cjs`를 cwd 기준으로 require해 다음 버전·릴리즈 노트를 stdout JSON으로 출력.

## 사용

자식 Node 레포 onboarding 절차는 toolkit 루트의 `docs/ONBOARDING-node.md` 참고. 가장 단순한 적용:

```js
// .releaserc.cjs
module.exports = require('@spacevision-ai/release-toolkit-node/config/releaserc-base');

// commitlint.config.cjs
module.exports = require('@spacevision-ai/release-toolkit-node/config/commitlint-base');
```

GitHub Actions wrapper는 `uses: SpaceVision-ai/release-toolkit/.github/workflows/release-node.yml@v0` 로 호출.
