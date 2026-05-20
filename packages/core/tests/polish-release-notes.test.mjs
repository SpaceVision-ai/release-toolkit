import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, "..", "scripts", "polish-release-notes.mjs");

// 빈 ENV 베이스라인. 로컬 셸의 OPENAI_API_KEY가 spawn된 자식 프로세스로 새어 들어가
// 실제 OpenAI API 호출을 만들지 않도록 명시적으로 차단한다.
const baseEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };

const runScript = (args = [], extraEnv = {}) =>
  spawnSync("node", [scriptPath, ...args], {
    encoding: "utf-8",
    env: { ...baseEnv, ...extraEnv },
  });

describe("polish-release-notes.mjs: argument and env guards", () => {
  it("exits 0 with empty stdout when no positional tag is given", () => {
    const r = runScript(["--preview"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("[polish] No tag arg.");
  });

  it("exits 0 with empty stdout when OPENAI_API_KEY is missing", () => {
    const r = runScript(["v1.0.0", "--preview"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("[polish] OPENAI_API_KEY missing.");
  });
});
