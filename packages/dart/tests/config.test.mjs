import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const findPlugin = (config, name) => {
  const entry = config.plugins.find((p) =>
    Array.isArray(p) ? p[0] === name : p === name,
  );
  if (!entry) throw new Error(`plugin ${name} not found`);
  return Array.isArray(entry) ? entry[1] : {};
};

describe("dart/config/releaserc-base", () => {
  const config = require("../config/releaserc-base.cjs");

  it("targets release branch", () => {
    expect(config.branches).toEqual(["release"]);
  });

  it("plugin order: exec before git before github", () => {
    const names = config.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    const exec = names.indexOf("@semantic-release/exec");
    const git = names.indexOf("@semantic-release/git");
    const github = names.indexOf("@semantic-release/github");
    expect(exec).toBeGreaterThan(-1);
    expect(exec).toBeLessThan(git);
    expect(git).toBeLessThan(github);
  });

  it("exec has prepareCmd (bump-pubspec) and successCmd (polish)", () => {
    const exec = findPlugin(config, "@semantic-release/exec");
    expect(exec.prepareCmd).toContain("bump-pubspec.mjs");
    expect(exec.prepareCmd).toContain("${nextRelease.version}");
    expect(exec.successCmd).toContain("polish-release-notes.mjs");
    expect(exec.successCmd).toContain("${nextRelease.gitTag}");
  });

  it("git plugin tracks pubspec.yaml + CHANGELOG.md", () => {
    const git = findPlugin(config, "@semantic-release/git");
    expect(git.assets).toContain("pubspec.yaml");
    expect(git.assets).toContain("CHANGELOG.md");
    expect(git.assets).not.toContain("package.json");
  });

  it("commit-analyzer uses releaseRules from conventions", () => {
    const analyzer = findPlugin(config, "@semantic-release/commit-analyzer");
    expect(analyzer.releaseRules).toBeDefined();
    const types = analyzer.releaseRules
      .filter((r) => r.type)
      .map((r) => r.type);
    expect(types).toContain("feat");
    expect(types).toContain("fix");
    expect(types).toContain("hotfix");
  });

  it("includes breaking: true → major in releaseRules", () => {
    const analyzer = findPlugin(config, "@semantic-release/commit-analyzer");
    const breakingRule = analyzer.releaseRules.find((r) => r.breaking);
    expect(breakingRule).toEqual({ breaking: true, release: "major" });
  });
});
