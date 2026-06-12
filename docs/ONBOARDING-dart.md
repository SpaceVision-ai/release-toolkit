# Dart/Flutter 레포 릴리즈 자동화 온보딩

> release-toolkit의 Dart adapter를 사용하여 semantic-release 기반 버전 관리 + 릴리즈 노트 자동화를 적용한다.

## 전제 조건

- 브랜치 전략: `develop` → `release` → `main`
- `release` 브랜치에 push 시 릴리즈 워크플로 트리거
- `release` 브랜치로 PR 시 프리뷰 코멘트 게시

## 자식 레포에 추가할 파일 (4개)

### 1. `.releaserc.cjs`

```javascript
const base = require("@spacevision-ai/release-toolkit-dart/config/releaserc-base");
module.exports = { ...base };
```

### 2. `commitlint.config.cjs`

```javascript
module.exports = require("@spacevision-ai/release-toolkit-core/config/commitlint-base");
```

### 3. `.github/workflows/release.yml`

```yaml
name: Release
on:
  push:
    branches: [release]
permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write
jobs:
  release:
    uses: SpaceVision-ai/release-toolkit/.github/workflows/release-dart.yml@v0
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### 4. `.github/workflows/pr-preview.yml`

```yaml
name: PR Preview
on:
  pull_request:
    branches: [release]
permissions:
  contents: read
  pull-requests: write
jobs:
  preview:
    uses: SpaceVision-ai/release-toolkit/.github/workflows/pr-preview-dart.yml@v0
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## 마이그레이션 (기존 Dart 앱에 적용)

### 1단계: Bootstrap 태그 생성

semantic-release는 기존 태그에서 마지막 버전을 인식한다. 태그가 없으면 1.0.0부터 시작하므로 버전이 역행한다.

**반드시 main HEAD (배포 기준 커밋)에 태그를 생성한다:**

```bash
# 예: 현재 pubspec.yaml version이 1.1.0+10인 경우
git tag v1.1.0 main
git push origin v1.1.0
```

### 2단계: Release 브랜치 생성

```bash
git checkout main
git checkout -b release
git push -u origin release
```

### 3단계: Build Number

`bump-pubspec.mjs`의 `max(GITHUB_RUN_NUMBER, existingBuildNumber+1)` 공식이 단조 증가를 보장한다. 별도 설정 불필요.

### 4단계: Conventional Commits

Bootstrap 태그 이후의 커밋이 conventional commits 형식이어야 한다:

```
feat: 새 기능 설명
fix: 버그 수정 설명
hotfix: 긴급 패치 설명
feat!: BREAKING CHANGE 설명
```

지원 타입: `feat`, `hotfix`, `fix`, `perf`, `refactor`, `docs`, `style`, `test`, `build`, `ci`, `chore`

## 작동 원리

1. `develop → release` 머지 시 `release.yml` 트리거
2. semantic-release가 conventional commits 분석 → 다음 버전 결정
3. `bump-pubspec.mjs`가 pubspec.yaml version + build number 교체
4. `CHANGELOG.md` 자동 생성
5. `polish-release-notes.mjs`가 AI로 GitHub Release 노트 정제
6. release → main 동기화 + main → develop 백머지

## 참고

- Flutter SDK 불필요 — semantic-release는 Node에서 실행, pubspec.yaml은 텍스트 치환
- Node 의존성은 격리된 tmpdir에 설치 — 레포 워킹트리 오염 없음
- `@v0` 태그는 release-toolkit 레포의 릴리즈 태그 — 자식 레포에서 업데이트 시 태그만 변경
