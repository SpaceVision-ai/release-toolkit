// SpaceVision Node·pnpm 레포 자동 릴리즈 베이스.
// 자식 레포는 require('@spacevision-ai/release-toolkit-node/config/releaserc-base') 후
// branches, tagFormat, @semantic-release/git assets 등을 override한다.
//
// types·sections는 core/conventions에서 변환되어 들어오므로 새 commit type을 추가하려면
// packages/core/conventions.cjs 한 곳만 수정하면 node가 자동으로 따라온다.
const { types } = require("@spacevision-ai/release-toolkit-core/conventions");

const releaseRules = [
  { breaking: true, release: "major" },
  ...types.map((t) => ({ type: t.type, release: t.release })),
];

const presetConfigTypes = types.map((t) => ({
  type: t.type,
  section: t.section,
  hidden: false,
}));

module.exports = {
  branches: ["release"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      { preset: "conventionalcommits", releaseRules },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: { types: presetConfigTypes },
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
        // pnpm/yarn 의 flat node_modules 하위에서 core 패키지를 찾는 경로.
        // 자식 레포가 isolated 모드라도 pnpm은 동일 경로에 symlink를 만들어주므로 호환된다.
        // ${nextRelease.gitTag}는 semantic-release의 런타임 보간 토큰이며 JS 문자열의 일부.
        successCmd:
          "node node_modules/@spacevision-ai/release-toolkit-core/scripts/polish-release-notes.mjs ${nextRelease.gitTag}",
      },
    ],
  ],
};
