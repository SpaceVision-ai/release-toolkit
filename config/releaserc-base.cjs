// SpaceVision 자동 릴리즈 공용 베이스.
// 자식 레포는 require('@spacevision-ai/release-toolkit/config/releaserc-base') 후
// branches, tagFormat, @semantic-release/git assets 등을 override한다.
module.exports = {
  branches: ["release"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { breaking: true, release: "major" },
          { type: "feat", release: "minor" },
          { type: "hotfix", release: "patch" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" },
          { type: "refactor", release: "patch" },
          { type: "docs", release: "patch" },
          { type: "style", release: "patch" },
          { type: "test", release: "patch" },
          { type: "build", release: "patch" },
          { type: "ci", release: "patch" },
          { type: "chore", release: "patch" },
          // revert는 conventional-commits preset이 자체적으로 분석해 "Reverts"
          // 섹션과 patch bump를 처리하므로 여기 명시하지 않는다.
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: [
            { type: "feat", section: "✨ 신규 기능", hidden: false },
            { type: "hotfix", section: "🚨 핫픽스", hidden: false },
            { type: "fix", section: "🐛 버그 수정", hidden: false },
            { type: "perf", section: "⚡ 성능 개선", hidden: false },
            { type: "refactor", section: "♻️ 리팩토링", hidden: false },
            { type: "docs", section: "📚 문서", hidden: false },
            { type: "style", section: "💄 스타일", hidden: false },
            { type: "test", section: "✅ 테스트", hidden: false },
            { type: "build", section: "🔨 빌드", hidden: false },
            { type: "ci", section: "🔧 CI/CD", hidden: false },
            { type: "chore", section: "🧹 잡무", hidden: false },
          ],
        },
      },
    ],
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
        changelogTitle: "# Changelog",
      },
    ],
    [
      "@semantic-release/npm",
      {
        npmPublish: false,
      },
    ],
    [
      "@semantic-release/git",
      {
        // pnpm-lock.yaml은 organization 표준 패키지 매니저 산출물이라 base에 포함한다.
        // 자식 레포가 다른 lockfile(yarn.lock 등)을 쓰면 plugins map에서 이 항목만 override.
        assets: ["package.json", "pnpm-lock.yaml", "CHANGELOG.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    [
      "@semantic-release/github",
      {
        assets: [],
      },
    ],
    [
      "@semantic-release/exec",
      {
        // pnpm/yarn 의 flat node_modules 하위에서 toolkit 패키지를 찾는 경로.
        // 자식 레포가 isolated 모드라도 pnpm은 동일 경로에 symlink를 만들어주므로 호환된다.
        // ${nextRelease.gitTag}는 semantic-release의 런타임 보간 토큰이며 JS 문자열의 일부.
        successCmd:
          "node node_modules/@spacevision-ai/release-toolkit/scripts/polish-release-notes.mjs ${nextRelease.gitTag}",
      },
    ],
  ],
};
