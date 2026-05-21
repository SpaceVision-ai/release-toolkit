import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const findPlugin = (config, name) => {
  const entry = config.plugins.find((p) => Array.isArray(p) && p[0] === name);
  if (!entry) throw new Error(`plugin ${name} not found in base config`);
  return entry[1];
};

describe("config base", () => {
  describe("releaserc-base", () => {
    const base = require("../config/releaserc-base.cjs");

    it("declares release branch", () => {
      expect(base.branches).toEqual(["release"]);
    });

    it("places hotfix between feat and fix in releaseRules with patch bump", () => {
      const rules = findPlugin(
        base,
        "@semantic-release/commit-analyzer",
      ).releaseRules;
      const types = rules.filter((r) => r.type).map((r) => r.type);
      const feat = types.indexOf("feat");
      const hotfix = types.indexOf("hotfix");
      const fix = types.indexOf("fix");
      expect(hotfix).toBeGreaterThan(feat);
      expect(hotfix).toBeLessThan(fix);
      expect(rules.find((r) => r.type === "hotfix").release).toBe("patch");
    });

    it("exposes hotfix as a 🚨 핫픽스 section in release-notes-generator", () => {
      const types = findPlugin(
        base,
        "@semantic-release/release-notes-generator",
      ).presetConfig.types;
      const hotfix = types.find((t) => t.type === "hotfix");
      expect(hotfix).toEqual({
        type: "hotfix",
        section: "🚨 핫픽스",
        hidden: false,
      });
    });

    it("configures the git plugin to commit lockfile and changelog", () => {
      const git = findPlugin(base, "@semantic-release/git");
      expect(git.assets).toEqual([
        "package.json",
        "pnpm-lock.yaml",
        "CHANGELOG.md",
      ]);
      expect(git.message).toMatch(
        /^chore\(release\): \${nextRelease\.version} \[skip ci\]/,
      );
    });

    it("points exec.successCmd at the toolkit core npm package path", () => {
      const exec = findPlugin(base, "@semantic-release/exec");
      expect(exec.successCmd).toContain(
        "node_modules/@spacevision-ai/release-toolkit-core/scripts/polish-release-notes.mjs",
      );
      expect(exec.successCmd).toContain("${nextRelease.gitTag}");
    });
  });

  describe("releaserc-preview-base", () => {
    const preview = require("../config/releaserc-preview-base.cjs");
    const base = require("../config/releaserc-base.cjs");

    it("uses only commit-analyzer and release-notes-generator", () => {
      const names = preview.plugins.map((p) => p[0]);
      expect(names).toEqual([
        "@semantic-release/commit-analyzer",
        "@semantic-release/release-notes-generator",
      ]);
    });

    it("inherits branches from base", () => {
      expect(preview.branches).toEqual(base.branches);
    });
  });

  describe("commitlint-base", () => {
    const cl = require("../config/commitlint-base.cjs");

    it("includes hotfix in type-enum between feat and fix", () => {
      const types = cl.rules["type-enum"][2];
      expect(types).toContain("hotfix");
      expect(types.indexOf("hotfix")).toBeGreaterThan(types.indexOf("feat"));
      expect(types.indexOf("hotfix")).toBeLessThan(types.indexOf("fix"));
    });

    it("type-enum is synthesised from core conventions including lint-only types", () => {
      const types = cl.rules["type-enum"][2];
      expect(types).toContain("feat");
      expect(types).toContain("hotfix");
      // lintOnlyTypes 도 type-enum 에 합쳐져야 한다 (revert 가 합성에서 빠지지 않았는지 회귀 방어).
      expect(types).toContain("revert");
    });

    it("ignores Merge and chore(release) commits without misfiring", () => {
      const matches = (subject) =>
        cl.ignores.some((predicate) => predicate(subject));
      expect(matches("Merge branch foo")).toBe(true);
      expect(matches("chore(release): 1.2.3 [skip ci]")).toBe(true);
      expect(matches("feat: hello")).toBe(false);
      expect(matches("fix: another change")).toBe(false);
    });
  });
});
