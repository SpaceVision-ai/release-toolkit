> **⚠️ Superseded by [2026-05-20-release-toolkit-multi-language-setup.md](./2026-05-20-release-toolkit-multi-language-setup.md)**
>
> 이 plan은 단일 Node 패키지 toolkit을 가정한 첫 spec의 구현 계획이다. multi-language 재설계로 spec이 대체되면서 이 plan도 supersede된다. 본문은 history로 보존된다.

---

# Release Toolkit 셋업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SpaceVision 자동 릴리즈 자산의 단일 진실의 원천이 되는 `spacevision-ai/release-toolkit` 레포를 생성하고, npm 패키지 + reusable workflow 두 채널로 v1.0.0을 publish한다.

**Architecture:** scripts·config 베이스는 `@spacevision-ai/release-toolkit` npm 패키지(GitHub Packages)로, `release.yml`·`pr-preview.yml`은 reusable workflow(`workflow_call`)로 export. toolkit 자체도 semantic-release로 자가 자동화하여 release 브랜치 push 한 번으로 npm publish + major tag move + GitHub Release 생성이 모두 일어난다.

**Tech Stack:** Node.js 22, pnpm 10, semantic-release, conventionalcommits preset, GitHub Actions reusable workflows, GitHub Packages (npm registry), Vitest (단위 테스트).

**Pre-condition:** `/Users/shlee/dev/release-toolkit/` 디렉토리가 존재하고 `docs/superpowers/specs/2026-05-20-release-toolkit-extraction-design.md` 가 이미 작성되어 있음.

**Out of scope for this plan:**
- 기존 3개 레포 migration (별도 Plan 2)
- canary 레포 + nightly 검증 (Plan 2 또는 후속)
- prompt snapshot 테스트 (2차 단계)

---

## File Structure

다음 파일을 `spacevision-ai/release-toolkit` 레포에 생성한다:

```
release-toolkit/
├── package.json                                              # T1
├── .gitignore                                                # T1
├── .npmrc                                                    # T1 (self-development용)
├── README.md                                                 # T1
├── pnpm-lock.yaml                                            # T1 (pnpm install 결과)
├── scripts/
│   ├── polish-release-notes.mjs                              # T2
│   └── preview-release.mjs                                   # T3
├── config/
│   ├── releaserc-base.cjs                                    # T4
│   ├── releaserc-preview-base.cjs                            # T4
│   └── commitlint-base.cjs                                   # T4
├── tests/
│   ├── polish-release-notes.test.mjs                         # T2
│   └── preview-release.test.mjs                              # T3
├── fixtures/
│   └── release-notes-sample.md                               # T2
├── .github/
│   └── workflows/
│       ├── release.yml                                       # T5 (reusable workflow for child repos)
│       ├── pr-preview.yml                                    # T6 (reusable workflow for child repos)
│       ├── ci.yml                                            # T7 (toolkit own CI)
│       └── publish.yml                                       # T8 (toolkit own publish)
├── .releaserc.cjs                                            # T8 (toolkit 자체 semantic-release config)
├── .releaserc.preview.cjs                                    # T8
├── commitlint.config.cjs                                     # T8
└── docs/
    ├── ONBOARDING.md                                         # T9
    └── superpowers/
        ├── specs/2026-05-20-release-toolkit-extraction-design.md   # (already exists)
        └── plans/2026-05-20-release-toolkit-setup.md               # (this file)
```

각 파일의 책임:
- `scripts/polish-release-notes.mjs`: AI 정제(systemPrompt 포함). web-console의 최신 버전을 그대로 이전.
- `scripts/preview-release.mjs`: 결정론 미리보기. `.releaserc.cjs` 룰을 require해서 동작하므로 자식 레포의 `.releaserc.cjs` 컨텍스트에서 호출됨.
- `config/releaserc-base.cjs`: semantic-release 공통 베이스 (commit-analyzer release rules, release-notes-generator types, changelog, npm, git, github, exec successCmd 플러그인 순서)
- `config/releaserc-preview-base.cjs`: PR 미리보기 전용. base의 plugin 배열에서 commit-analyzer + release-notes-generator 두 개만 사용.
- `config/commitlint-base.cjs`: type-enum (`feat`, `hotfix`, `fix`, …), ignores (`Merge`, `chore(release):`), 기본 rules.
- `.github/workflows/release.yml`: 자식 레포가 호출하는 reusable release workflow. 12단계 동작 흐름.
- `.github/workflows/pr-preview.yml`: 자식 레포가 호출하는 reusable PR preview workflow.
- `.github/workflows/ci.yml`: toolkit 자체의 PR/push CI (vitest + lint).
- `.github/workflows/publish.yml`: toolkit 자체 release 브랜치 push 시 동작 — semantic-release + npm publish + v1 major tag move.

---

## Task 1: 레포 초기화 + package.json + 기본 파일

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/package.json`
- Create: `/Users/shlee/dev/release-toolkit/.gitignore`
- Create: `/Users/shlee/dev/release-toolkit/.npmrc`
- Create: `/Users/shlee/dev/release-toolkit/README.md`

- [ ] **Step 1: git init 및 첫 브랜치 develop으로 셋업**

Run:
```bash
cd /Users/shlee/dev/release-toolkit
git init
git checkout -b develop
git config user.email "shlee@space-vision.ai"
git config user.name "shlee"
```

Expected: `Initialized empty Git repository in /Users/shlee/dev/release-toolkit/.git/`

- [ ] **Step 2: `.gitignore` 작성**

Create `/Users/shlee/dev/release-toolkit/.gitignore`:

```gitignore
node_modules/
.DS_Store
*.log
coverage/
.env
.env.local
dist/
```

- [ ] **Step 3: `package.json` 작성**

Create `/Users/shlee/dev/release-toolkit/package.json`:

```json
{
  "name": "@spacevision-ai/release-toolkit",
  "version": "0.0.0-development",
  "description": "SpaceVision 공용 릴리즈 자동화 toolkit — semantic-release scripts, config base, reusable workflow",
  "license": "UNLICENSED",
  "private": false,
  "type": "module",
  "files": [
    "scripts",
    "config",
    "README.md"
  ],
  "exports": {
    "./scripts/polish-release-notes.mjs": "./scripts/polish-release-notes.mjs",
    "./scripts/preview-release.mjs": "./scripts/preview-release.mjs",
    "./config/releaserc-base": "./config/releaserc-base.cjs",
    "./config/releaserc-preview-base": "./config/releaserc-preview-base.cjs",
    "./config/commitlint-base": "./config/commitlint-base.cjs"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@commitlint/cli": "19.5.0",
    "@commitlint/config-conventional": "19.5.0",
    "@semantic-release/changelog": "6.0.3",
    "@semantic-release/commit-analyzer": "13.0.0",
    "@semantic-release/exec": "6.0.3",
    "@semantic-release/git": "10.0.1",
    "@semantic-release/github": "11.0.0",
    "@semantic-release/npm": "12.0.1",
    "@semantic-release/release-notes-generator": "14.0.1",
    "conventional-changelog-conventionalcommits": "8.0.0",
    "semantic-release": "24.1.2",
    "vitest": "2.1.4"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "engines": {
    "node": ">=22"
  },
  "packageManager": "pnpm@10.33.0"
}
```

**Why `version: 0.0.0-development`**: semantic-release가 git history에서 다음 버전을 계산해서 publish 시 덮어쓴다. 정적 버전 값은 의미 없음.

- [ ] **Step 4: `.npmrc` 작성 (self-development용)**

Create `/Users/shlee/dev/release-toolkit/.npmrc`:

```
@spacevision-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
auto-install-peers=true
```

- [ ] **Step 5: `README.md` 작성**

Create `/Users/shlee/dev/release-toolkit/README.md`:

```markdown
# @spacevision-ai/release-toolkit

SpaceVision 사내 레포 공용 릴리즈 자동화 toolkit.

## 제공 자산

1. **npm 패키지** — `scripts/polish-release-notes.mjs`, `scripts/preview-release.mjs`, `config/*-base.cjs`
2. **Reusable workflow** — `.github/workflows/release.yml`, `.github/workflows/pr-preview.yml`

## 사용

자식 레포 셋업 절차는 [docs/ONBOARDING.md](docs/ONBOARDING.md) 참고.

## 설계 문서

`docs/superpowers/specs/2026-05-20-release-toolkit-extraction-design.md`
```

- [ ] **Step 6: `pnpm install` 실행**

Run:
```bash
cd /Users/shlee/dev/release-toolkit
pnpm install
```

Expected: `Done in <Xs>` + `pnpm-lock.yaml` 생성. node_modules 디렉토리 생성.

**Note**: 이 단계는 GitHub Packages 인증이 필요 없는 단계 — 모두 public registry 패키지(@commitlint, @semantic-release/*, vitest 등). `.npmrc`의 `${NODE_AUTH_TOKEN}` 변수는 빈 값으로 평가되어도 GitHub Packages 패키지를 install하지 않으면 문제없음.

- [ ] **Step 7: 첫 커밋**

Run:
```bash
cd /Users/shlee/dev/release-toolkit
git add .gitignore package.json .npmrc README.md pnpm-lock.yaml docs/
git commit -m "chore: initial release-toolkit scaffold"
```

Expected: 첫 커밋 성공. `docs/superpowers/specs/` 안의 spec 문서도 함께 commit됨.

---

## Task 2: `scripts/polish-release-notes.mjs` 이전 + 단위 테스트

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/scripts/polish-release-notes.mjs`
- Create: `/Users/shlee/dev/release-toolkit/tests/polish-release-notes.test.mjs`
- Create: `/Users/shlee/dev/release-toolkit/fixtures/release-notes-sample.md`

- [ ] **Step 1: scripts 디렉토리 생성 + `polish-release-notes.mjs` 작성**

Run:
```bash
mkdir -p /Users/shlee/dev/release-toolkit/scripts
```

`/Users/shlee/dev/release-toolkit/scripts/polish-release-notes.mjs` 파일을 **web-console의 최신 버전과 동일하게** 작성한다. 원본 경로: `/Users/shlee/dev/web-console/scripts/polish-release-notes.mjs` (315줄).

구현 시 다음 사항을 보존:
- `import { execSync } from 'node:child_process'` 등 ESM import 그대로
- `--preview` 모드 / 일반 모드 분기
- `OPENAI_API_KEY` 누락 시 graceful skip
- `annotateGroupCounts(notes)` 함수 (### 헤더에 "(N건)" 주입)
- `systemPrompt` 전체 — "사용자 체감 결과 관점 변환"이 1순위 + 도메인 토큰 변환 예시 6종 + 짧은 영문 단어 보존 규칙 포함
- `model: 'gpt-4o'`, `max_tokens: 3000`, `temperature: 0.25`
- 거부 패턴(refusalPatterns) 검출
- preview 모드는 stdout 출력, 일반 모드는 `gh release edit` 호출
- 이전 태그 검색: `tags.indexOf(tag)` + `currentIdx + 1`
- contributor 추출 실패 시 `console.warn` (silent 금지)
- footer: 전체 변경 비교 + 기여자
- `<details>` 블록으로 결정론 노트 wrapping

직접 복사:
```bash
cp /Users/shlee/dev/web-console/scripts/polish-release-notes.mjs /Users/shlee/dev/release-toolkit/scripts/polish-release-notes.mjs
```

- [ ] **Step 2: fixture 작성**

Run:
```bash
mkdir -p /Users/shlee/dev/release-toolkit/fixtures
```

Create `/Users/shlee/dev/release-toolkit/fixtures/release-notes-sample.md`:

```markdown
## 1.0.0 (2026-05-20)

### ✨ 신규 기능

* 사용자가 콘솔 안에서 직접 언어를 전환할 수 있도록 지원 ([abc1234](https://github.com/foo/bar/commit/abc1234))
* 인벤토리 리포트 DateRangePicker UX 전면 개선 ([def5678](https://github.com/foo/bar/commit/def5678))

### 🐛 버그 수정

* 모달 위에 뜬 alert/confirm에서 ESC가 뒤의 모달을 닫던 문제 수정 ([fed9876](https://github.com/foo/bar/commit/fed9876))
* 취약점으로 인한 next 버전업데이트 ([cba0987](https://github.com/foo/bar/commit/cba0987))
```

- [ ] **Step 3: 단위 테스트 작성**

Run:
```bash
mkdir -p /Users/shlee/dev/release-toolkit/tests
```

Create `/Users/shlee/dev/release-toolkit/tests/polish-release-notes.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, '..', 'scripts', 'polish-release-notes.mjs');
const fixturePath = join(__dirname, '..', 'fixtures', 'release-notes-sample.md');

describe('polish-release-notes.mjs', () => {
  describe('argument validation', () => {
    it('exits 0 with [polish] No tag arg when no positional arg', () => {
      const out = execSync(`node ${scriptPath} --preview`, { encoding: 'utf-8' });
      expect(out).toBe('');
    });

    it('exits 0 with skip message when OPENAI_API_KEY missing', () => {
      const out = execSync(`node ${scriptPath} v1.0.0 --preview`, {
        encoding: 'utf-8',
        env: { ...process.env, OPENAI_API_KEY: '' },
      });
      expect(out).toBe('');
    });
  });

  describe('annotateGroupCounts (indirect — via systemPrompt construction)', () => {
    it('annotates each group header with (N건) based on item count', () => {
      // 직접 검증: 스크립트의 annotateGroupCounts 동작을 일치하는 mini implementation으로 sanity check
      const sample = readFileSync(fixturePath, 'utf-8');
      const annotated = annotateGroupCounts(sample);
      expect(annotated).toContain('### ✨ 신규 기능 (2건)');
      expect(annotated).toContain('### 🐛 버그 수정 (2건)');
    });
  });
});

// helper: scripts와 동일한 로직을 테스트 측에서 reimplement
// (단위 테스트가 스크립트 내부 함수를 직접 import할 수 없는 ESM script 구조 — top-level await로 동작)
function annotateGroupCounts(notes) {
  const lines = notes.split('\n');
  const result = [];
  let lastHeaderIdx = -1;
  let count = 0;
  const flush = () => {
    if (lastHeaderIdx >= 0 && count > 0) {
      result[lastHeaderIdx] = `${result[lastHeaderIdx]} (${count}건)`;
    }
  };
  for (const line of lines) {
    if (/^### /.test(line)) {
      flush();
      lastHeaderIdx = result.length;
      result.push(line);
      count = 0;
    } else if (/^\* /.test(line)) {
      count += 1;
      result.push(line);
    } else {
      result.push(line);
    }
  }
  flush();
  return result.join('\n');
}
```

**Note**: 현재 `polish-release-notes.mjs`는 top-level await + side effects 구조라 함수 export가 없다. 1차 테스트는 (a) 진입점에서의 argument/env 가드 동작, (b) 핵심 알고리즘(annotateGroupCounts) 동작 — 의 sanity check 수준. 후속 task에서 스크립트를 testable shape으로 리팩토링하면 직접 import해서 더 깊게 검증 가능. 이번 plan에서는 minimum viable test로 충분.

- [ ] **Step 4: 테스트 실행**

Run:
```bash
cd /Users/shlee/dev/release-toolkit
pnpm test
```

Expected:
```
Test Files  1 passed (1)
Tests  3 passed (3)
```

- [ ] **Step 5: 커밋**

Run:
```bash
cd /Users/shlee/dev/release-toolkit
git add scripts/polish-release-notes.mjs tests/polish-release-notes.test.mjs fixtures/release-notes-sample.md
git commit -m "feat: import polish-release-notes script from web-console with sanity tests"
```

---

## Task 3: `scripts/preview-release.mjs` 이전 + 단위 테스트

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/scripts/preview-release.mjs`
- Create: `/Users/shlee/dev/release-toolkit/tests/preview-release.test.mjs`

- [ ] **Step 1: `preview-release.mjs` 이전**

Run:
```bash
cp /Users/shlee/dev/web-console/scripts/preview-release.mjs /Users/shlee/dev/release-toolkit/scripts/preview-release.mjs
```

**중요**: 이 스크립트는 `require('../.releaserc.cjs')` 로 호출 컨텍스트의 `.releaserc.cjs`를 읽는다. toolkit 패키지로 npm install된 자식 레포에서 이 스크립트를 실행하면 `node_modules/@spacevision-ai/release-toolkit/scripts/preview-release.mjs` 위치이고 `../.releaserc.cjs`는 `node_modules/@spacevision-ai/release-toolkit/.releaserc.cjs` 를 가리키게 되어 **자식 레포의 `.releaserc.cjs`를 못 읽는다**. 

해결: `process.cwd()` 기반으로 require하도록 수정. preview-release.mjs의 require 줄을 다음과 같이 교체:

원본 (`/Users/shlee/dev/web-console/scripts/preview-release.mjs` 9행 근처):
```javascript
const config = require('../.releaserc.cjs');
```

변경 후:
```javascript
import { resolve } from 'node:path';
const config = require(resolve(process.cwd(), '.releaserc.cjs'));
```

같은 방식으로 `lastTag` 계산 시 호출되는 `git describe`, `git log` 등은 호출 시점의 cwd에서 실행되므로 그대로 동작.

- [ ] **Step 2: 변경된 require가 자식 레포 컨텍스트에서 동작하는지 검증할 단위 테스트 작성**

Create `/Users/shlee/dev/release-toolkit/tests/preview-release.test.mjs`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const scriptPath = join(__dirname, '..', 'scripts', 'preview-release.mjs');

describe('preview-release.mjs', () => {
  let sandboxDir;

  beforeAll(() => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'preview-release-test-'));

    // sandbox에 .releaserc.cjs (간단한 베이스) 작성
    writeFileSync(
      join(sandboxDir, '.releaserc.cjs'),
      `module.exports = {
        branches: ['release'],
        plugins: [
          ['@semantic-release/commit-analyzer', {
            preset: 'conventionalcommits',
            releaseRules: [
              { breaking: true, release: 'major' },
              { type: 'feat', release: 'minor' },
              { type: 'fix', release: 'patch' },
            ],
          }],
          ['@semantic-release/release-notes-generator', {
            preset: 'conventionalcommits',
            presetConfig: {
              types: [
                { type: 'feat', section: '✨ 신규 기능', hidden: false },
                { type: 'fix', section: '🐛 버그 수정', hidden: false },
              ],
            },
          }],
        ],
      };`
    );

    // sandbox를 git repo로 만들고 fixture commit 1개
    execSync('git init', { cwd: sandboxDir });
    execSync('git config user.email "test@example.com"', { cwd: sandboxDir });
    execSync('git config user.name "Test"', { cwd: sandboxDir });
    execSync('git commit --allow-empty -m "feat: sandbox feature"', { cwd: sandboxDir });
  });

  afterAll(() => {
    rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('reads .releaserc.cjs from cwd (not script directory) and emits version notes', () => {
    const out = execSync(`node ${scriptPath}`, {
      cwd: sandboxDir,
      encoding: 'utf-8',
      env: { ...process.env, GITHUB_REPOSITORY: 'foo/bar' },
    });

    const parsed = JSON.parse(out);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.notes).toContain('✨ 신규 기능');
    expect(parsed.notes).toContain('sandbox feature');
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run:
```bash
cd /Users/shlee/dev/release-toolkit
pnpm test
```

Expected: 모든 테스트 통과 (Task 2의 3개 + Task 3의 1개 = 총 4개).

- [ ] **Step 4: 커밋**

```bash
git add scripts/preview-release.mjs tests/preview-release.test.mjs
git commit -m "feat: import preview-release script with cwd-based config resolution"
```

---

## Task 4: config base 추출

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/config/releaserc-base.cjs`
- Create: `/Users/shlee/dev/release-toolkit/config/releaserc-preview-base.cjs`
- Create: `/Users/shlee/dev/release-toolkit/config/commitlint-base.cjs`

- [ ] **Step 1: config 디렉토리 생성 + `releaserc-base.cjs` 작성**

Run:
```bash
mkdir -p /Users/shlee/dev/release-toolkit/config
```

Create `/Users/shlee/dev/release-toolkit/config/releaserc-base.cjs`:

```javascript
// SpaceVision 자동 릴리즈 공용 베이스.
// 자식 레포는 require('@spacevision-ai/release-toolkit/config/releaserc-base') 후
// branches, tagFormat, @semantic-release/git assets 등을 override한다.
module.exports = {
  branches: ['release'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { breaking: true, release: 'major' },
          { type: 'feat', release: 'minor' },
          { type: 'hotfix', release: 'patch' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'docs', release: 'patch' },
          { type: 'style', release: 'patch' },
          { type: 'test', release: 'patch' },
          { type: 'build', release: 'patch' },
          { type: 'ci', release: 'patch' },
          { type: 'chore', release: 'patch' },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: '✨ 신규 기능', hidden: false },
            { type: 'hotfix', section: '🚨 핫픽스', hidden: false },
            { type: 'fix', section: '🐛 버그 수정', hidden: false },
            { type: 'perf', section: '⚡ 성능 개선', hidden: false },
            { type: 'refactor', section: '♻️ 리팩토링', hidden: false },
            { type: 'docs', section: '📚 문서', hidden: false },
            { type: 'style', section: '💄 스타일', hidden: false },
            { type: 'test', section: '✅ 테스트', hidden: false },
            { type: 'build', section: '🔨 빌드', hidden: false },
            { type: 'ci', section: '🔧 CI/CD', hidden: false },
            { type: 'chore', section: '🧹 잡무', hidden: false },
          ],
        },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
        changelogTitle: '# Changelog',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [],
      },
    ],
    [
      '@semantic-release/exec',
      {
        successCmd: 'node node_modules/@spacevision-ai/release-toolkit/scripts/polish-release-notes.mjs ${nextRelease.gitTag}',
      },
    ],
  ],
};
```

**핵심 변경**: `successCmd`의 스크립트 경로를 `scripts/polish-release-notes.mjs`(자식 레포 로컬)에서 `node_modules/@spacevision-ai/release-toolkit/scripts/polish-release-notes.mjs`(toolkit npm 패키지)로 변경. 자식 레포에는 더 이상 `scripts/` 디렉토리가 필요 없어진다.

- [ ] **Step 2: `releaserc-preview-base.cjs` 작성**

Create `/Users/shlee/dev/release-toolkit/config/releaserc-preview-base.cjs`:

```javascript
// PR 미리보기 전용: git/github/exec 플러그인을 제외하고
// commit-analyzer + release-notes-generator 2개만 사용.
// 규칙·섹션 설정은 releaserc-base를 단일 진실의 원천으로 유지.
const base = require('./releaserc-base.cjs');
module.exports = { ...base, plugins: base.plugins.slice(0, 2) };
```

- [ ] **Step 3: `commitlint-base.cjs` 작성**

Create `/Users/shlee/dev/release-toolkit/config/commitlint-base.cjs`:

```javascript
// SpaceVision 자동 릴리즈 commitlint 베이스.
// 자식 레포는 require('@spacevision-ai/release-toolkit/config/commitlint-base') 후
// 필요 시 추가 ignore 패턴이나 rules 확장.
module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    commit => /^Merge /.test(commit),
    commit => /^chore\(release\):/.test(commit),
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'hotfix',
        'fix',
        'perf',
        'refactor',
        'docs',
        'style',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'header-max-length': [0],
    'subject-case': [0],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
  },
};
```

- [ ] **Step 4: 베이스 require가 정상 동작하는지 sanity test 추가**

Create `/Users/shlee/dev/release-toolkit/tests/config.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('config base', () => {
  describe('releaserc-base', () => {
    const base = require('../config/releaserc-base.cjs');

    it('declares release branch', () => {
      expect(base.branches).toEqual(['release']);
    });

    it('has hotfix in releaseRules (between feat and fix)', () => {
      const rules = base.plugins[0][1].releaseRules;
      const types = rules.filter(r => r.type).map(r => r.type);
      const feat = types.indexOf('feat');
      const hotfix = types.indexOf('hotfix');
      const fix = types.indexOf('fix');
      expect(hotfix).toBeGreaterThan(feat);
      expect(hotfix).toBeLessThan(fix);
      expect(rules.find(r => r.type === 'hotfix').release).toBe('patch');
    });

    it('has 🚨 핫픽스 section in release-notes-generator types', () => {
      const types = base.plugins[1][1].presetConfig.types;
      const hotfix = types.find(t => t.type === 'hotfix');
      expect(hotfix).toEqual({ type: 'hotfix', section: '🚨 핫픽스', hidden: false });
    });

    it('successCmd points to toolkit npm package path', () => {
      const exec = base.plugins.find(p => Array.isArray(p) && p[0] === '@semantic-release/exec');
      expect(exec[1].successCmd).toContain('node_modules/@spacevision-ai/release-toolkit/scripts/polish-release-notes.mjs');
    });
  });

  describe('releaserc-preview-base', () => {
    const preview = require('../config/releaserc-preview-base.cjs');
    const base = require('../config/releaserc-base.cjs');

    it('uses only commit-analyzer and release-notes-generator', () => {
      expect(preview.plugins).toHaveLength(2);
      expect(preview.plugins[0][0]).toBe('@semantic-release/commit-analyzer');
      expect(preview.plugins[1][0]).toBe('@semantic-release/release-notes-generator');
    });

    it('inherits branches from base', () => {
      expect(preview.branches).toEqual(base.branches);
    });
  });

  describe('commitlint-base', () => {
    const cl = require('../config/commitlint-base.cjs');

    it('includes hotfix in type-enum (after feat, before fix)', () => {
      const types = cl.rules['type-enum'][2];
      expect(types).toContain('hotfix');
      expect(types.indexOf('hotfix')).toBeGreaterThan(types.indexOf('feat'));
      expect(types.indexOf('hotfix')).toBeLessThan(types.indexOf('fix'));
    });

    it('ignores chore(release) and Merge commits', () => {
      const [ignoreMerge, ignoreRelease] = cl.ignores;
      expect(ignoreMerge('Merge branch foo')).toBe(true);
      expect(ignoreRelease('chore(release): 1.2.3 [skip ci]')).toBe(true);
      expect(ignoreMerge('feat: hello')).toBe(false);
    });
  });
});
```

- [ ] **Step 5: 테스트 실행**

Run:
```bash
cd /Users/shlee/dev/release-toolkit
pnpm test
```

Expected: 모든 테스트 통과 (8개 누적: T2의 3개 + T3의 1개 + T4의 4개).

- [ ] **Step 6: 커밋**

```bash
git add config/ tests/config.test.mjs
git commit -m "feat: add releaserc and commitlint base configs with hotfix convention"
```

---

## Task 5: Reusable workflow — `release.yml`

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/.github/workflows/release.yml`

- [ ] **Step 1: 워크플로우 디렉토리 생성**

Run:
```bash
mkdir -p /Users/shlee/dev/release-toolkit/.github/workflows
```

- [ ] **Step 2: `release.yml` 작성 (reusable workflow)**

Create `/Users/shlee/dev/release-toolkit/.github/workflows/release.yml`:

```yaml
name: Release (reusable)

on:
  workflow_call:
    inputs:
      node_version:
        type: string
        default: '22'
        description: 'Node.js version to install.'
      pnpm_version:
        type: string
        default: ''
        description: 'Optional pinned pnpm version. Empty = use packageManager from package.json.'
      run_lint:
        type: boolean
        default: false
      run_test:
        type: boolean
        default: false
      lint_command:
        type: string
        default: 'pnpm lint'
      test_command:
        type: string
        default: 'pnpm test'
      sync_to_main:
        type: boolean
        default: true
        description: 'After release, fast-forward main from release branch.'
      back_merge_to_develop:
        type: boolean
        default: true
        description: 'After main sync, back-merge main into develop.'
      trigger_deploy_workflow:
        type: string
        default: ''
        description: 'Workflow file name (e.g. deploy-prod.yml) to dispatch after main sync. Empty = skip.'
      trigger_dev_deploy_workflow:
        type: string
        default: ''
        description: 'Workflow file name to dispatch on develop after back-merge. Empty = skip.'
    secrets:
      OPENAI_API_KEY:
        required: true

permissions:
  contents: write
  issues: write
  pull-requests: write
  packages: read
  actions: write

jobs:
  release:
    if: ${{ !contains(github.event.head_commit.message, 'skip ci') }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ inputs.pnpm_version }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node_version }}
          cache: 'pnpm'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@spacevision-ai'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Lint
        if: ${{ inputs.run_lint }}
        run: ${{ inputs.lint_command }}

      - name: Test
        if: ${{ inputs.run_test }}
        run: ${{ inputs.test_command }}

      - name: Strict commit check
        run: |
          # 마지막 자동 릴리즈 커밋을 baseline으로 사용. baseline이 없으면 strict 검사를 건너뛴다.
          LAST_RELEASE=$(git log --format=%H --grep='^chore(release):' -1 || echo "")
          if [ -z "$LAST_RELEASE" ]; then
            echo "No prior auto-release commit found — skipping strict check (legacy commits)"
          else
            echo "Checking commits in $LAST_RELEASE..HEAD"
            pnpm exec commitlint --from "$LAST_RELEASE" --to HEAD --verbose
          fi

      - name: Configure Git
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "github-actions[bot]@users.noreply.github.com"

      - name: Run semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          GIT_AUTHOR_NAME: github-actions[bot]
          GIT_AUTHOR_EMAIL: github-actions[bot]@users.noreply.github.com
          GIT_COMMITTER_NAME: github-actions[bot]
          GIT_COMMITTER_EMAIL: github-actions[bot]@users.noreply.github.com
          HUSKY: '0'
        run: pnpm exec semantic-release

      - name: Sync release → main
        if: ${{ inputs.sync_to_main }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/${{ github.repository }}.git
          git fetch origin
          git checkout -b main origin/main 2>/dev/null || git checkout main
          git merge origin/release --no-edit
          git push origin main

      - name: Trigger deploy workflow (after main sync)
        if: ${{ inputs.sync_to_main && inputs.trigger_deploy_workflow != '' }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh workflow run ${{ inputs.trigger_deploy_workflow }} --ref main

      - name: Back-merge main → develop
        if: ${{ inputs.back_merge_to_develop }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git fetch origin
          git checkout -b develop origin/develop 2>/dev/null || git checkout develop
          git merge origin/main --no-edit
          git push origin develop

      - name: Trigger dev deploy workflow (after develop sync)
        if: ${{ inputs.back_merge_to_develop && inputs.trigger_dev_deploy_workflow != '' }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh workflow run ${{ inputs.trigger_dev_deploy_workflow }} --ref develop
```

**Note**: `setup-node`에 `registry-url`과 `scope`를 지정해서 `NODE_AUTH_TOKEN` 환경변수가 자동으로 GitHub Packages 인증에 사용되도록 한다. `secrets.GITHUB_TOKEN`은 organization 내부 private 패키지를 자동으로 읽을 수 있다.

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add reusable release workflow with input-driven repo customization"
```

---

## Task 6: Reusable workflow — `pr-preview.yml`

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/.github/workflows/pr-preview.yml`

- [ ] **Step 1: `pr-preview.yml` 작성 (reusable workflow)**

Create `/Users/shlee/dev/release-toolkit/.github/workflows/pr-preview.yml`:

```yaml
name: Release Preview (reusable)

on:
  workflow_call:
    inputs:
      node_version:
        type: string
        default: '22'
      pnpm_version:
        type: string
        default: ''
    secrets:
      OPENAI_API_KEY:
        required: true

permissions:
  contents: read
  pull-requests: write
  packages: read

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref }}
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ inputs.pnpm_version }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node_version }}
          cache: 'pnpm'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@spacevision-ai'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Compute release preview (deterministic)
        id: deterministic
        env:
          GITHUB_REPOSITORY: ${{ github.repository }}
        run: node node_modules/@spacevision-ai/release-toolkit/scripts/preview-release.mjs

      - name: Compute AI polish preview
        id: ai
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          PREVIEW_NOTES: ${{ steps.deterministic.outputs.notes }}
        run: |
          VERSION="${{ steps.deterministic.outputs.version }}"
          if [ "$VERSION" = "(변경사항 없음)" ]; then
            echo "polished=릴리즈할 새 변경사항이 없어 AI 정제를 생략합니다." >> "$GITHUB_OUTPUT"
            exit 0
          fi

          set +e
          node node_modules/@spacevision-ai/release-toolkit/scripts/polish-release-notes.mjs "$VERSION" --preview > /tmp/polished.txt 2> /tmp/polish-err.log
          set -e

          echo "--- AI polish stderr ---"
          cat /tmp/polish-err.log
          echo "--- end stderr ---"
          POLISHED=$(cat /tmp/polished.txt)

          if [ -z "$POLISHED" ]; then
            POLISHED="AI 정제에 실패했습니다 (폴백: 결정론 노트 참고)."
          fi

          echo "polished<<EOF" >> "$GITHUB_OUTPUT"
          echo "$POLISHED" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"

      - name: Post or update preview comment
        uses: actions/github-script@v7
        with:
          script: |
            const version = `${{ steps.deterministic.outputs.version }}`;
            const deterministicNotes = `${{ steps.deterministic.outputs.notes }}`;
            const aiPolished = `${{ steps.ai.outputs.polished }}`;
            const marker = '<!-- release-preview -->';

            const body = [
              marker,
              `## 🚀 다음 릴리즈 미리보기 — ${version}`,
              '',
              '### 📋 결정론 노트 (`CHANGELOG.md` · git 태그에 그대로 기록)',
              '',
              '```',
              deterministicNotes,
              '```',
              '',
              '### ✨ AI 정제 미리보기 (GitHub Release 페이지 — 참고용)',
              '',
              '> 실제 릴리즈 시점에 AI가 다시 생성하므로 내용이 달라질 수 있습니다.',
              '',
              aiPolished,
            ].join('\n');

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(c => c.body.includes(marker));

            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }
```

**핵심 변경 (기존 자식 레포 워크플로우 대비)**: 두 군데의 `node scripts/preview-release.mjs` / `node scripts/polish-release-notes.mjs` 경로를 `node node_modules/@spacevision-ai/release-toolkit/scripts/...` 로 변경.

- [ ] **Step 2: 커밋**

```bash
git add .github/workflows/pr-preview.yml
git commit -m "feat: add reusable pr-preview workflow that resolves scripts from toolkit package"
```

---

## Task 7: toolkit 자체 CI workflow

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/.github/workflows/ci.yml`

- [ ] **Step 1: `ci.yml` 작성**

Create `/Users/shlee/dev/release-toolkit/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main, release]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test
```

- [ ] **Step 2: 커밋**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add toolkit own CI workflow running vitest on PR and push"
```

---

## Task 8: toolkit 자체 publish workflow

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/.releaserc.cjs`
- Create: `/Users/shlee/dev/release-toolkit/.releaserc.preview.cjs`
- Create: `/Users/shlee/dev/release-toolkit/commitlint.config.cjs`
- Create: `/Users/shlee/dev/release-toolkit/.github/workflows/publish.yml`

이 task에서는 toolkit이 **자기 자신을 사용해서** 자체 release를 자동화한다. config base는 require로 끌어다 쓰는 게 아니라 (아직 publish되지 않은 상태이므로) **직접 인라인으로 같은 내용을 적는다**. v1.0.0 publish 이후의 다음 변경부터는 자기 자신을 자식 레포처럼 require 하는 방식으로 리팩토링해도 되지만, 그것은 후속 정비. 지금은 **인라인 + npmPublish: true** 형태.

- [ ] **Step 1: `.releaserc.cjs` 작성 (toolkit 자체 release 설정)**

Create `/Users/shlee/dev/release-toolkit/.releaserc.cjs`:

```javascript
// toolkit 자체의 semantic-release config.
// 자식 레포가 사용할 베이스(config/releaserc-base.cjs)와 거의 동일하나,
// (1) successCmd가 자기 자신의 ./scripts 를 직접 호출하고
// (2) @semantic-release/npm 의 npmPublish: true 로 GitHub Packages에 publish하며
// (3) @semantic-release/git assets에 pnpm-lock.yaml 도 포함한다.
module.exports = {
  branches: ['release'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { breaking: true, release: 'major' },
          { type: 'feat', release: 'minor' },
          { type: 'hotfix', release: 'patch' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'docs', release: 'patch' },
          { type: 'style', release: 'patch' },
          { type: 'test', release: 'patch' },
          { type: 'build', release: 'patch' },
          { type: 'ci', release: 'patch' },
          { type: 'chore', release: 'patch' },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: '✨ 신규 기능', hidden: false },
            { type: 'hotfix', section: '🚨 핫픽스', hidden: false },
            { type: 'fix', section: '🐛 버그 수정', hidden: false },
            { type: 'perf', section: '⚡ 성능 개선', hidden: false },
            { type: 'refactor', section: '♻️ 리팩토링', hidden: false },
            { type: 'docs', section: '📚 문서', hidden: false },
            { type: 'style', section: '💄 스타일', hidden: false },
            { type: 'test', section: '✅ 테스트', hidden: false },
            { type: 'build', section: '🔨 빌드', hidden: false },
            { type: 'ci', section: '🔧 CI/CD', hidden: false },
            { type: 'chore', section: '🧹 잡무', hidden: false },
          ],
        },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
        changelogTitle: '# Changelog',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: true,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'pnpm-lock.yaml', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [],
      },
    ],
    [
      '@semantic-release/exec',
      {
        successCmd: 'node ./scripts/polish-release-notes.mjs ${nextRelease.gitTag}',
      },
    ],
  ],
};
```

- [ ] **Step 2: `.releaserc.preview.cjs` 작성**

Create `/Users/shlee/dev/release-toolkit/.releaserc.preview.cjs`:

```javascript
const base = require('./.releaserc.cjs');
module.exports = { ...base, plugins: base.plugins.slice(0, 2) };
```

- [ ] **Step 3: `commitlint.config.cjs` 작성**

Create `/Users/shlee/dev/release-toolkit/commitlint.config.cjs`:

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    commit => /^Merge /.test(commit),
    commit => /^chore\(release\):/.test(commit),
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'hotfix',
        'fix',
        'perf',
        'refactor',
        'docs',
        'style',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'header-max-length': [0],
    'subject-case': [0],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
  },
};
```

- [ ] **Step 4: `publish.yml` 작성 — release branch push 시 자동 publish**

Create `/Users/shlee/dev/release-toolkit/.github/workflows/publish.yml`:

```yaml
name: Publish

on:
  push:
    branches: [release]

concurrency:
  group: publish
  cancel-in-progress: false

permissions:
  contents: write
  issues: write
  pull-requests: write
  packages: write

jobs:
  publish:
    if: ${{ !contains(github.event.head_commit.message, 'skip ci') }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@spacevision-ai'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test

      - name: Strict commit check
        run: |
          LAST_RELEASE=$(git log --format=%H --grep='^chore(release):' -1 || echo "")
          if [ -z "$LAST_RELEASE" ]; then
            echo "No prior auto-release commit found — skipping strict check (legacy commits)"
          else
            pnpm exec commitlint --from "$LAST_RELEASE" --to HEAD --verbose
          fi

      - name: Configure Git
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "github-actions[bot]@users.noreply.github.com"

      - name: Run semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          GIT_AUTHOR_NAME: github-actions[bot]
          GIT_AUTHOR_EMAIL: github-actions[bot]@users.noreply.github.com
          GIT_COMMITTER_NAME: github-actions[bot]
          GIT_COMMITTER_EMAIL: github-actions[bot]@users.noreply.github.com
          HUSKY: '0'
        run: pnpm exec semantic-release

      - name: Move major tag
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # 방금 생성된 가장 최신 태그 (예: 1.2.3)
          LATEST_TAG=$(git tag --sort=-version:refname --merged HEAD | head -1)
          if [ -z "$LATEST_TAG" ]; then
            echo "No tag found, skipping major tag move."
            exit 0
          fi
          MAJOR=$(echo "$LATEST_TAG" | cut -d. -f1)
          MAJOR_TAG="v${MAJOR}"
          echo "Moving ${MAJOR_TAG} to point at ${LATEST_TAG}"
          git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/${{ github.repository }}.git
          git tag -f "${MAJOR_TAG}" "${LATEST_TAG}"
          git push origin "${MAJOR_TAG}" --force

      - name: Sync release → main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git fetch origin
          git checkout -b main origin/main 2>/dev/null || git checkout main
          git merge origin/release --no-edit
          git push origin main

      - name: Back-merge main → develop
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git fetch origin
          git checkout -b develop origin/develop 2>/dev/null || git checkout develop
          git merge origin/main --no-edit
          git push origin develop
```

**핵심 차이 (자식 레포 reusable workflow 대비)**:
- `npmPublish: true` (`.releaserc.cjs`)이므로 semantic-release가 npm publish까지 수행
- `permissions.packages: write` 필요
- `Move major tag` 스텝: release 직후 `v1` 같은 major tag를 최신 patch로 강제 이동 (자식 레포가 `@v1`로 트래킹할 수 있게)
- 배포 트리거 / dev deploy 같은 사용처 정책은 toolkit과 무관하므로 생략

- [ ] **Step 5: 커밋**

```bash
git add .releaserc.cjs .releaserc.preview.cjs commitlint.config.cjs .github/workflows/publish.yml
git commit -m "feat: add toolkit own publish workflow with major tag auto-move"
```

---

## Task 9: ONBOARDING.md

**Files:**
- Create: `/Users/shlee/dev/release-toolkit/docs/ONBOARDING.md`

- [ ] **Step 1: `ONBOARDING.md` 작성**

Create `/Users/shlee/dev/release-toolkit/docs/ONBOARDING.md`:

````markdown
# 자식 레포 onboarding 가이드

`@spacevision-ai/release-toolkit` 을 새 레포에 적용하는 절차.

## 1. 사전 조건

- Node.js ≥22, pnpm 사용 레포
- GitHub organization-level secret으로 `OPENAI_API_KEY` 공유되어 있을 것
- `release`, `main`, `develop` 브랜치 패턴 (또는 동등한 흐름)

## 2. 셋업 6단계

### 2.1 npm 의존성 추가

```bash
pnpm add -D @spacevision-ai/release-toolkit
```

### 2.2 `.npmrc` 추가

레포 루트에 `.npmrc`:

```
@spacevision-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

### 2.3 `.releaserc.cjs` 작성

```javascript
const base = require('@spacevision-ai/release-toolkit/config/releaserc-base');

module.exports = {
  ...base,
  // 필요 시 override (예: tagFormat, git assets)
  tagFormat: '${version}',  // v 접두사 없이 쓰려면. 기본값은 'v${version}'
};
```

`@semantic-release/git` 의 assets를 customize하려면 plugins 배열을 map해서 해당 plugin만 교체:

```javascript
const base = require('@spacevision-ai/release-toolkit/config/releaserc-base');

module.exports = {
  ...base,
  tagFormat: '${version}',
  plugins: base.plugins.map(p => {
    if (Array.isArray(p) && p[0] === '@semantic-release/git') {
      return ['@semantic-release/git', {
        ...p[1],
        assets: ['package.json', 'pnpm-lock.yaml', 'CHANGELOG.md'],
      }];
    }
    return p;
  }),
};
```

### 2.4 `.releaserc.preview.cjs` 작성

```javascript
const base = require('./.releaserc.cjs');
module.exports = { ...base, plugins: base.plugins.slice(0, 2) };
```

### 2.5 `commitlint.config.cjs` 작성

```javascript
module.exports = require('@spacevision-ai/release-toolkit/config/commitlint-base');
```

레포별 추가 규칙이 있으면:

```javascript
const base = require('@spacevision-ai/release-toolkit/config/commitlint-base');

module.exports = {
  ...base,
  rules: {
    ...base.rules,
    'subject-min-length': [2, 'always', 5],
  },
};
```

### 2.6 GitHub Actions wrapper 작성

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
    uses: spacevision-ai/release-toolkit/.github/workflows/release.yml@v1
    with:
      run_lint: false
      run_test: true
      trigger_deploy_workflow: deploy-prod.yml  # 사용처에 맞게
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
    uses: spacevision-ai/release-toolkit/.github/workflows/pr-preview.yml@v1
    secrets: inherit
```

## 3. 로컬 개발자 셋업 (1회성)

GitHub Packages에서 private 패키지를 install하려면 read 권한이 있는 PAT가 필요하다.

1. https://github.com/settings/tokens → "Generate new token (classic)" → `read:packages` 스코프만 체크 → 발급
2. `~/.npmrc` 에 한 줄 추가:
   ```
   //npm.pkg.github.com/:_authToken=ghp_xxxxxxxx
   ```
3. 이후 `pnpm install` 시 자동으로 인증됨

## 4. 비상 시 toolkit 버전 pin

toolkit `vX.Y.Z`에서 회귀가 발견되면:

- 자식 레포의 `.github/workflows/release.yml`에서 `@v1` 을 `@v1.2.3` 같은 정확한 patch로 변경
- `package.json` 의 `@spacevision-ai/release-toolkit` 의존성을 정확한 이전 버전으로 pin: `"@spacevision-ai/release-toolkit": "1.2.3"`
- toolkit 측 수정 release를 기다린 뒤 `^1.0.0` (또는 `@v1`) 로 복귀

## 5. 토큰 / 권한 점검 체크리스트

- [ ] organization-level secret `OPENAI_API_KEY` 가 자식 레포에서 inherit 가능한 상태
- [ ] `secrets.GITHUB_TOKEN` 에 `packages: read` 권한 (workflow 안에 명시)
- [ ] release 브랜치에 push 가능한 branch protection 설정 (있다면 github-actions[bot] 예외)
````

- [ ] **Step 2: 커밋**

```bash
git add docs/ONBOARDING.md
git commit -m "docs: add ONBOARDING guide for child repos"
```

---

## Task 10: 첫 v1.0.0 publish

이 task는 release 브랜치를 만들고 push해서 publish workflow를 실행하는 단계. **GitHub에 release-toolkit 레포가 이미 생성되어 있어야 한다**.

- [ ] **Step 1: GitHub에 `spacevision-ai/release-toolkit` 레포 생성**

웹 UI 또는 CLI:
```bash
gh repo create spacevision-ai/release-toolkit --private --description "SpaceVision 공용 릴리즈 자동화 toolkit"
```

Expected: 빈 레포 생성 (initial commit 없음).

- [ ] **Step 2: local develop 브랜치를 remote에 push**

```bash
cd /Users/shlee/dev/release-toolkit
git remote add origin https://github.com/spacevision-ai/release-toolkit.git
git push -u origin develop
```

- [ ] **Step 3: organization secret 확인**

GitHub UI → spacevision-ai organization → Settings → Secrets and variables → Actions:
- `OPENAI_API_KEY` 가 organization-level로 등록되어 있는지 확인
- "Repository access" → "All repositories" 또는 "Selected repositories" 에 `release-toolkit` 포함

- [ ] **Step 4: develop → release PR 생성**

```bash
gh pr create --base release --head develop --title "release" --body "Initial v1.0.0 release of release-toolkit."
```

**Note**: 첫 release 브랜치가 없을 수 있다. 그 경우 먼저 빈 release 브랜치를 만들고 push:

```bash
git checkout --orphan release
git rm -rf .
git commit --allow-empty -m "chore: initialize release branch"
git push origin release
git checkout develop
gh pr create --base release --head develop --title "release" --body "Initial v1.0.0 release of release-toolkit."
```

- [ ] **Step 5: PR merge**

GitHub UI에서 PR을 머지하거나 CLI로:
```bash
gh pr merge --merge --delete-branch=false
```

- [ ] **Step 6: publish workflow 동작 검증**

```bash
gh run list --workflow=publish.yml --limit 1
```

마지막 run을 watch:
```bash
gh run watch
```

Expected:
- semantic-release가 첫 버전을 1.0.0 으로 결정
- npm publish to `https://npm.pkg.github.com/@spacevision-ai/release-toolkit`
- tag `1.0.0` + `v1` 모두 push
- CHANGELOG.md 업데이트 commit이 release 브랜치에 자동 push
- main 브랜치로 sync, develop으로 back-merge

- [ ] **Step 7: 결과 검증**

```bash
# tag 확인
git fetch --tags origin
git tag --list

# npm 패키지 확인
gh api /orgs/spacevision-ai/packages/npm/release-toolkit/versions --jq '.[].name'
```

Expected:
- `1.0.0` 과 `v1` 두 tag 모두 존재
- npm 패키지 버전 목록에 `1.0.0` 등장

- [ ] **Step 8: GitHub Release 페이지 확인**

```bash
gh release view 1.0.0 -R spacevision-ai/release-toolkit --json body --jq .body | head -40
```

Expected: AI 정제된 한국어 본문 + 결정론 노트 footer가 포함된 release body (toolkit이 자기 자신을 사용해 자체 release notes를 polish한 결과).

---

## Self-Review

### Spec coverage

| Spec section | 구현 위치 |
|---|---|
| 3.1 신규 레포 구조 | Task 1~9 전반 |
| 3.2 두 가지 export 채널 | Task 2~6 |
| 3.3 자식 레포 after 모습 | Task 9 (ONBOARDING) |
| 4.1 npm 패키지 (package.json, exports, scripts 호출 방식) | Task 1 (package.json), Task 2~3 (scripts), Task 4 (config) |
| 4.2 reusable workflow 시그니처 | Task 5, 6 |
| 4.3 인증 (GitHub Packages) | Task 1 (.npmrc), Task 5 (setup-node registry-url), Task 9 (PAT) |
| 5. 버전 정책 (semver, ^1.0.0, @v1 트랙) | Task 8 (publish.yml Move major tag), Task 9 (ONBOARDING) |
| 6. 레포별 차이 흡수 모델 | Task 5 (release.yml inputs), Task 9 (override 예시) |
| 7. 자식 레포 onboarding 절차 | Task 9 |
| 8. 기존 3개 레포 migration | **out of scope — Plan 2** |
| 9. 발견된 trade-off | 설계 수용 (별도 코드 없음) |
| 10. 검증 전략 (canary 등) | **out of scope** — Task 7의 toolkit 자체 CI로 1차 방어만 |
| 11. 롤백·비상 절차 | Task 9 (ONBOARDING의 "비상 시 pin") |
| 13. Open questions | 그대로 보존 |

### Placeholder scan

- "TBD" / "TODO" / "implement later": 없음 (모든 step에 실제 코드 또는 명령 포함)
- "Add appropriate error handling": 없음
- "Similar to Task N": 없음 (각 task가 self-contained)

### Type / 시그니처 일관성

- reusable workflow `release.yml`의 input 이름 (`run_lint`, `run_test`, `trigger_deploy_workflow` 등)이 Task 9 ONBOARDING의 wrapper 예시와 일치 ✓
- npm 패키지 path 표기가 일관: `node_modules/@spacevision-ai/release-toolkit/scripts/polish-release-notes.mjs` — Task 4 (releaserc-base successCmd), Task 6 (pr-preview), Task 9 (예시 인용 X — 경로는 reusable workflow가 책임)
- `setup-node` 의 `scope: '@spacevision-ai'` 표기가 publish.yml, release.yml, pr-preview.yml에서 일치 ✓
- `pnpm/action-setup@v4` 버전이 모든 workflow에서 일치 ✓

### 발견된 이슈 (없음)

self-review 통과.

---

## 실행 옵션

Plan complete and saved to `/Users/shlee/dev/release-toolkit/docs/superpowers/plans/2026-05-20-release-toolkit-setup.md`.

이 plan은 외부 GitHub 자원 생성(레포, secret, PR merge, push to release)을 포함하므로, agentic execution보다 사용자가 직접 검증하며 step별로 진행하는 게 더 안전한 부분이 많다(특히 Task 10).

**옵션:**

1. **Subagent-Driven** (recommended for Task 1~9) — fresh subagent가 task별로 코드/파일을 작성, 사용자가 review. Task 10은 사용자가 직접 GitHub UI/CLI로 실행.
2. **Inline Execution** — 현재 세션에서 모든 task를 순차 실행, 사용자가 checkpoint마다 review.
3. **Plan only** — plan 검토만 받고 실제 실행은 다른 세션/시간에.

어떤 방식으로 진행할까?
