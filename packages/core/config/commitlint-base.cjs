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
    "header-max-length": [0],
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
  },
};
