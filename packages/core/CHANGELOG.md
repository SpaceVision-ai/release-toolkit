# @spacevision-ai/release-toolkit-core

## 0.0.2

### Patch Changes

- [#12](https://github.com/SpaceVision-ai/release-toolkit/pull/12) [`65e79a2`](https://github.com/SpaceVision-ai/release-toolkit/commit/65e79a24f0e06e1b8557f3d0b94aaa26f81e27f2) Thanks [@YoungJinJeong](https://github.com/YoungJinJeong)! - app-release 백머지를 develop 직접 push 대신 PR + 자동 병합으로 올린다. develop 보호 규칙(required checks)이 체크 없는 직접 push를 거부(GH006)해 백머지가 실패하던 문제를 고친다.

## 0.0.1

### Patch Changes

- [#2](https://github.com/SpaceVision-ai/release-toolkit/pull/2) [`ab6c994`](https://github.com/SpaceVision-ai/release-toolkit/commit/ab6c9940f69e0b9bdbfcd7999eff9bef9685cd8c) Thanks [@YoungJinJeong](https://github.com/YoungJinJeong)! - Dart/Flutter 릴리즈 자동화 sub-package 추가. core에 commitlint-base, preview-release 승격.

## 0.0.0

### Minor Changes

- [`2a51544`](https://github.com/SpaceVision-ai/release-toolkit/commit/2a515449ac52d976f7c9643ca7739ace155af577) Thanks [@kubrickcode](https://github.com/kubrickcode)! - monorepo 초기 0.1.0 release: stack-agnostic core(commit conventions + polish 스크립트)와 Node sub-package(semantic-release·commitlint base + preview 스크립트)가 첫 publish됨.
