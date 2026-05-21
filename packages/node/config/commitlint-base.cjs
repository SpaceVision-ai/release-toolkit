// SpaceVision Node·pnpm 레포 commitlint 베이스.
// 자식 레포는 require('@spacevision-ai/release-toolkit-node/config/commitlint-base') 후
// 필요 시 추가 ignore 패턴이나 rules 확장.
//
// type-enum과 ignores는 core/conventions에서 합성되므로 새 commit type을 추가하려면
// packages/core/conventions.cjs 한 곳만 수정하면 commitlint도 자동으로 따라온다.
const {
  types,
  lintOnlyTypes,
  ignores,
} = require("@spacevision-ai/release-toolkit-core/conventions");

const typeEnum = [...types.map((t) => t.type), ...lintOnlyTypes];

module.exports = {
  extends: ["@commitlint/config-conventional"],
  ignores: ignores.map((re) => (commit) => re.test(commit)),
  rules: {
    "type-enum": [2, "always", typeEnum],
    // 한국어 commit subject는 영어 대비 자수가 더 길어 기본 100자 제한에 자주 걸린다.
    // 사내 합의대로 한도 검사를 비활성화하고 가독성은 본문 분할로 관리한다.
    "header-max-length": [0],
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
  },
};
