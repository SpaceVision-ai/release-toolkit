const path = require("path");
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

const dartRoot = path.resolve(
  path.dirname(
    require.resolve(
      "@spacevision-ai/release-toolkit-dart/config/releaserc-base",
    ),
  ),
  "..",
);

const coreRoot = path.dirname(
  require.resolve("@spacevision-ai/release-toolkit-core/conventions"),
);

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
      "@semantic-release/exec",
      {
        prepareCmd: `node ${path.join(dartRoot, "scripts", "bump-pubspec.mjs")} \${nextRelease.version}`,
        successCmd: `node ${path.join(coreRoot, "scripts", "polish-release-notes.mjs")} \${nextRelease.gitTag}`,
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["pubspec.yaml", "CHANGELOG.md"],
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
  ],
};
