// PR 미리보기 전용: git/github/exec 플러그인을 제외하고
// commit-analyzer + release-notes-generator 2개만 사용.
// 규칙·섹션 설정은 releaserc-base를 단일 진실의 원천으로 유지.
const base = require("./releaserc-base.cjs");

// 이름 기반 필터로 추출하여 base의 plugin 순서가 바뀌어도 미리보기가 깨지지 않게 함.
const previewPlugins = [
  "@semantic-release/commit-analyzer",
  "@semantic-release/release-notes-generator",
];

module.exports = {
  ...base,
  plugins: base.plugins.filter((p) => previewPlugins.includes(p[0])),
};
