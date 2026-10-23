import { describe, it, expect } from "vitest";
import {
  compareVersion,
  bumpVersion,
  parseTags,
} from "../scripts/app-version.mjs";

describe("compareVersion", () => {
  it("숫자로 비교한다", () => {
    expect(compareVersion("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersion("1.4.0", "1.4.0")).toBe(0);
    expect(compareVersion("1.4.0", "1.5.0")).toBeLessThan(0);
  });
});

describe("bumpVersion", () => {
  it.each([
    ["1.4.0", "major", "2.0.0"],
    ["1.4.3", "minor", "1.5.0"],
    ["1.4.3", "patch", "1.4.4"],
    ["1.4.3", "skip", "1.4.3"],
  ])("%s + %s = %s", (v, b, out) => {
    expect(bumpVersion(v, b)).toBe(out);
  });
});

describe("parseTags", () => {
  it("릴리즈 태그와 빌드 태그만 고르고 나머지는 버린다", () => {
    const { releases, builds } = parseTags([
      "1.4.0",
      "1.4.0.30-end",
      "1.5.0.45-start",
      "1.5.0.46",
      "1.7.0-legacy",
      "exp.bottom-nav",
      "v0",
    ]);
    expect(releases).toEqual(["1.4.0"]);
    expect(builds).toEqual([
      { tag: "1.4.0.30-end", version: "1.4.0", build: 30, kind: "end" },
      { tag: "1.5.0.45-start", version: "1.5.0", build: 45, kind: "start" },
      { tag: "1.5.0.46", version: "1.5.0", build: 46, kind: "mid" },
    ]);
  });
});
