# @spacevision-ai/release-toolkit

SpaceVision 사내 레포 공용 릴리즈 자동화 toolkit.

## 제공 자산

| 패키지 / 액션 | 설명 |
|---------------|------|
| **`packages/core`** | stack-agnostic: commit 컨벤션 SSOT, commitlint base, PR 미리보기, GitHub Release polish |
| **`packages/node`** | Node/pnpm 전용: semantic-release·commitlint base config (core 위임) |
| **`packages/dart`** | Dart/Flutter 전용: `@semantic-release/exec` 기반 pubspec.yaml 범프 + build number |
| **`actions/release-node`** | composite action: Node 자식 레포 release workflow |
| **`actions/pr-preview-node`** | composite action: Node 자식 레포 PR preview comment |
| **`actions/release-dart`** | composite action: Dart 자식 레포 release workflow |
| **`actions/pr-preview-dart`** | composite action: Dart 자식 레포 PR preview comment |

향후 `packages/go`, `packages/python` 등 다른 stack sub-package가 같은 패턴으로 추가될 수 있다.

## 사용

- **Node/pnpm 레포:** [`docs/ONBOARDING-node.md`](docs/ONBOARDING-node.md)
- **Dart/Flutter 레포:** [`docs/ONBOARDING-dart.md`](docs/ONBOARDING-dart.md)
