// SpaceVision 자동 릴리즈 commitlint 베이스.
// 자식 레포는 require('@spacevision-ai/release-toolkit/config/commitlint-base') 후
// 필요 시 추가 ignore 패턴이나 rules 확장.
module.exports = {
  extends: ["@commitlint/config-conventional"],
  ignores: [
    (commit) => /^Merge /.test(commit),
    (commit) => /^chore\(release\):/.test(commit),
  ],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "hotfix",
        "fix",
        "perf",
        "refactor",
        "docs",
        "style",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    // 한국어 commit subject는 영어 대비 자수가 더 길어 기본 100자 제한에 자주 걸린다.
    // 사내 합의대로 한도 검사를 비활성화하고 가독성은 본문 분할로 관리한다.
    "header-max-length": [0],
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
  },
};
