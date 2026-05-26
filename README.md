# @spacevision-ai/release-toolkit

SpaceVision 사내 Node/pnpm 레포 공용 릴리즈 자동화 toolkit.

## 제공 자산

- **`packages/core`** — stack-agnostic: commit 컨벤션 SSOT, GitHub Release polish 스크립트
- **`packages/node`** — Node/pnpm 전용: semantic-release·commitlint base config, PR 미리보기 스크립트
- **`actions/release-node`** — composite action: 자식 레포 release workflow에서 호출
- **`actions/pr-preview-node`** — composite action: PR preview comment 생성

## 사용

자식 레포 셋업 절차는 [`docs/ONBOARDING-node.md`](docs/ONBOARDING-node.md) 참고.
