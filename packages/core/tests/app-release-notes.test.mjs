import { describe, it, expect } from "vitest";
import {
  parseCommits,
  recommendBump,
  renderNotes,
} from "../scripts/app-release-notes.mjs";

const lines = [
  "aaaaaaa1\tfeat: 글씨 크기 설정을 추가한다",
  "bbbbbbb2\tfix: 등록 스텝이 넘치지 않게 한다",
  "ccccccc3\tMerge pull request #1 from x",
  "ddddddd4\t그냥 메시지",
  "eeeeeee5\tchore(release): 1.4.0 [skip ci]",
];

describe("parseCommits", () => {
  it("규칙에 맞는 커밋만 고르고 머지·릴리즈 커밋은 버린다", () => {
    expect(parseCommits(lines)).toEqual([
      { hash: "aaaaaaa1", type: "feat", scope: null, description: "글씨 크기 설정을 추가한다", breaking: false },
      { hash: "bbbbbbb2", type: "fix", scope: null, description: "등록 스텝이 넘치지 않게 한다", breaking: false },
    ]);
  });
});

describe("recommendBump", () => {
  it("feat가 있으면 minor", () => {
    expect(recommendBump(parseCommits(lines))).toBe("minor");
  });
  it("breaking이 있으면 major", () => {
    expect(recommendBump(parseCommits(["a\tfeat!: 큰 변경"]))).toBe("major");
  });
  it("커밋이 없으면 skip", () => {
    expect(recommendBump([])).toBe("skip");
  });
});

describe("renderNotes", () => {
  it("conventions 섹션 순서로 묶고 커밋 링크를 단다", () => {
    const md = renderNotes(parseCommits(lines), { repo: "o/r" });
    expect(md).toBe(
      [
        "### ✨ 신규 기능",
        "",
        "- 글씨 크기 설정을 추가한다 ([aaaaaaa](https://github.com/o/r/commit/aaaaaaa1))",
        "",
        "### 🐛 버그 수정",
        "",
        "- 등록 스텝이 넘치지 않게 한다 ([bbbbbbb](https://github.com/o/r/commit/bbbbbbb2))",
      ].join("\n"),
    );
  });
  it("커밋이 없으면 빈 문자열", () => {
    expect(renderNotes([], { repo: "o/r" })).toBe("");
  });
});
