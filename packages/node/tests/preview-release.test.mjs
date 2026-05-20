import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const scriptPath = join(__dirname, "..", "scripts", "preview-release.mjs");

// 로컬 셸에 설정된 GITHUB_OUTPUT / GIT_* / HUSKY 등이 spawn된 자식 프로세스로 새어 들어가면
// 스크립트가 stdout 대신 파일로 결과를 쓰거나 git 동작이 호스트 레포로 옮겨붙는 사고가 생긴다.
// PATH·HOME과 테스트에 명시적으로 필요한 GITHUB_REPOSITORY만 전달한다.
const sandboxEnv = (extra = {}) => ({
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  ...extra,
});

describe("preview-release.mjs", () => {
  let sandbox;

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), "preview-release-test-"));

    writeFileSync(
      join(sandbox, ".releaserc.cjs"),
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
      };`,
    );

    execSync("git init -b main", { cwd: sandbox });
    execSync('git config user.email "test@example.com"', { cwd: sandbox });
    execSync('git config user.name "Test"', { cwd: sandbox });
    execSync('git commit --allow-empty -m "feat: sandbox feature"', {
      cwd: sandbox,
    });
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("resolves .releaserc.cjs from cwd and emits next version + grouped notes", () => {
    const r = spawnSync("node", [scriptPath], {
      cwd: sandbox,
      encoding: "utf-8",
      env: sandboxEnv({ GITHUB_REPOSITORY: "foo/bar" }),
    });

    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.notes).toContain("✨ 신규 기능");
    expect(parsed.notes).toContain("sandbox feature");
  });
});
