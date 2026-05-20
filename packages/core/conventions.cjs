// SpaceVision 자동 릴리즈 공용 commit 컨벤션 — stack-agnostic SSOT.
// stack별 sub-package(node/go/python)가 이 객체를 require해서
// 자기 도구의 config 형식(semantic-release / GoReleaser / python-semantic-release …)으로 변환한다.
//
// types: commit type 정의. release(bump 등급) · section(릴리즈 노트 섹션 헤더).
//   - revert는 conventional-commits preset이 자체 분석해 별도 섹션을 만들고 patch bump하므로 여기 명시하지 않는다.
// lintOnlyTypes: commitlint에는 노출되지만 release rule에는 노출하지 않는 type.
//   현재 'revert'만 해당 — preset이 자체 처리하므로 release bump 로직과 분리.
// ignores: commit lint·analyze에서 무시할 subject 패턴. RegExp로 표현해
//   각 stack 도구가 자기 표현(JS predicate · regex 문자열)으로 변환한다.
module.exports = {
  types: [
    { type: "feat", release: "minor", section: "✨ 신규 기능" },
    { type: "hotfix", release: "patch", section: "🚨 핫픽스" },
    { type: "fix", release: "patch", section: "🐛 버그 수정" },
    { type: "perf", release: "patch", section: "⚡ 성능 개선" },
    { type: "refactor", release: "patch", section: "♻️ 리팩토링" },
    { type: "docs", release: "patch", section: "📚 문서" },
    { type: "style", release: "patch", section: "💄 스타일" },
    { type: "test", release: "patch", section: "✅ 테스트" },
    { type: "build", release: "patch", section: "🔨 빌드" },
    { type: "ci", release: "patch", section: "🔧 CI/CD" },
    { type: "chore", release: "patch", section: "🧹 잡무" },
  ],
  lintOnlyTypes: ["revert"],
  ignores: [/^Merge /, /^chore\(release\):/],
};
