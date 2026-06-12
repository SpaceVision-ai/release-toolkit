import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bumpPubspec } from "../scripts/bump-pubspec.mjs";

describe("bumpPubspec", () => {
  let dir;
  let pubspecPath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bump-test-"));
    pubspecPath = join(dir, "pubspec.yaml");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses existing+1 when higher than run number", () => {
    writeFileSync(pubspecPath, "name: test_app\nversion: 1.0.0+5\n");
    const result = bumpPubspec(pubspecPath, "1.1.0", 3);
    expect(result.buildNumber).toBe(6);
    expect(readFileSync(pubspecPath, "utf8")).toContain("version: 1.1.0+6");
  });

  it("uses run number when higher than existing+1", () => {
    writeFileSync(pubspecPath, "name: test_app\nversion: 1.0.0+5\n");
    const result = bumpPubspec(pubspecPath, "1.1.0", 10);
    expect(result.buildNumber).toBe(10);
    expect(readFileSync(pubspecPath, "utf8")).toContain("version: 1.1.0+10");
  });

  it("handles missing build number (defaults to 0)", () => {
    writeFileSync(pubspecPath, "name: test_app\nversion: 1.0.0\n");
    const result = bumpPubspec(pubspecPath, "1.1.0", 1);
    expect(result.buildNumber).toBe(1);
    expect(readFileSync(pubspecPath, "utf8")).toContain("version: 1.1.0+1");
  });

  it("preserves other pubspec content", () => {
    const content =
      "name: test_app\nversion: 1.0.0+5\ndescription: A test app\n";
    writeFileSync(pubspecPath, content);
    bumpPubspec(pubspecPath, "2.0.0", 1);
    const updated = readFileSync(pubspecPath, "utf8");
    expect(updated).toContain("name: test_app");
    expect(updated).toContain("description: A test app");
    expect(updated).toContain("version: 2.0.0+6");
  });

  it("throws on missing version line", () => {
    writeFileSync(pubspecPath, "name: test_app\n");
    expect(() => bumpPubspec(pubspecPath, "1.0.0", 1)).toThrow("version");
  });

  it("throws on missing file", () => {
    expect(() => bumpPubspec(join(dir, "nope.yaml"), "1.0.0", 1)).toThrow();
  });
});
