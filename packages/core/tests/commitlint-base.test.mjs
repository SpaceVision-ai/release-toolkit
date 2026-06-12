import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conventions = require("../conventions.cjs");

describe("core/config/commitlint-base", () => {
  const cl = require("../config/commitlint-base.cjs");

  it("extends @commitlint/config-conventional", () => {
    expect(cl.extends).toContain("@commitlint/config-conventional");
  });

  it("type-enum includes all convention types + lintOnlyTypes", () => {
    const typeEnum = cl.rules["type-enum"][2];
    for (const t of conventions.types) {
      expect(typeEnum).toContain(t.type);
    }
    for (const t of conventions.lintOnlyTypes) {
      expect(typeEnum).toContain(t);
    }
  });

  it("disables header-max-length for Korean commits", () => {
    expect(cl.rules["header-max-length"][0]).toBe(0);
  });

  it("ignores patterns match merge and release commits", () => {
    const matches = (s) => cl.ignores.some((p) => p(s));
    expect(matches("Merge branch foo")).toBe(true);
    expect(matches("chore(release): 1.2.3 [skip ci]")).toBe(true);
    expect(matches("feat: hello")).toBe(false);
  });
});
