import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conventions = require("../conventions.cjs");

describe("conventions.cjs (stack-agnostic SSOT)", () => {
  it("declares hotfix between feat and fix with patch bump and 🚨 핫픽스 section", () => {
    const order = conventions.types.map((t) => t.type);
    expect(order.indexOf("hotfix")).toBeGreaterThan(order.indexOf("feat"));
    expect(order.indexOf("hotfix")).toBeLessThan(order.indexOf("fix"));
    const hotfix = conventions.types.find((t) => t.type === "hotfix");
    expect(hotfix).toEqual({
      type: "hotfix",
      release: "patch",
      section: "🚨 핫픽스",
    });
  });

  it("lists every type with both release bump and section label", () => {
    for (const entry of conventions.types) {
      expect(entry).toHaveProperty("type");
      expect(entry).toHaveProperty("release");
      expect(entry).toHaveProperty("section");
    }
  });

  it("keeps revert in lintOnlyTypes (lintable but not release-bumped here)", () => {
    expect(conventions.lintOnlyTypes).toContain("revert");
    const releaseRuleTypes = conventions.types.map((t) => t.type);
    expect(releaseRuleTypes).not.toContain("revert");
  });

  it("exposes ignore patterns as RegExp that match expected subjects", () => {
    expect(conventions.ignores).toHaveLength(2);
    for (const re of conventions.ignores) {
      expect(re).toBeInstanceOf(RegExp);
    }
    expect(conventions.ignores[0].test("Merge branch foo")).toBe(true);
    expect(conventions.ignores[1].test("chore(release): 1.2.3 [skip ci]")).toBe(
      true,
    );
    expect(conventions.ignores[0].test("feat: hello")).toBe(false);
    expect(conventions.ignores[1].test("feat: hello")).toBe(false);
  });
});
