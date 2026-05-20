# @spacevision-ai/release-toolkit-core

SpaceVision 자동 릴리즈 stack-agnostic 코어.

## 제공

- **`conventions.cjs`** — commit type·section·ignore 정의의 단일 진실의 원천. stack별 sub-package(node/go/python 등)가 require해서 자기 도구의 config 형식으로 변환한다.
- **`scripts/polish-release-notes.mjs`** — GitHub Release body를 AI로 정제하는 스크립트. 어떤 stack의 workflow에서도 호출 가능 (Node를 한 step 설치하면 됨).

## 사용

```js
const conventions = require('@spacevision-ai/release-toolkit-core/conventions');
// conventions.types, conventions.lintOnlyTypes, conventions.ignores
```

자식 레포 onboarding 절차는 toolkit 루트의 `docs/ONBOARDING-<stack>.md` 참고.
