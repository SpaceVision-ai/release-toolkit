// 커밋 범위 → 종류별 릴리즈 노트. 분류 기준은 conventions.cjs 하나만 따른다.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { types, ignores } = require("../conventions.cjs");

const SECTION = Object.fromEntries(types.map((t) => [t.type, t.section]));
const RELEASE = Object.fromEntries(types.map((t) => [t.type, t.release]));
const SUBJECT = /^(\w+)(\(([^)]*)\))?(!?):\s*(.+)$/;

export function parseCommits(lines) {
  const commits = [];
  for (const line of lines) {
    const tab = line.indexOf("\t");
    const hash = line.slice(0, tab);
    const subject = line.slice(tab + 1);
    if (ignores.some((re) => re.test(subject))) continue;
    const m = subject.match(SUBJECT);
    if (!m || !SECTION[m[1]]) continue;
    commits.push({
      hash,
      type: m[1],
      scope: m[3] ?? null,
      description: m[5],
      breaking: m[4] === "!",
    });
  }
  return commits;
}

export function recommendBump(commits) {
  if (commits.some((c) => c.breaking)) return "major";
  if (commits.some((c) => RELEASE[c.type] === "minor")) return "minor";
  return commits.length ? "patch" : "skip";
}

export function renderNotes(commits, { repo }) {
  const blocks = [];
  for (const { type, section } of types) {
    const items = commits.filter((c) => c.type === type);
    if (!items.length) continue;
    const lines = items.map((c) => {
      const short = c.hash.slice(0, 7);
      const text = c.scope ? `**${c.scope}:** ${c.description}` : c.description;
      return `- ${text} ([${short}](https://github.com/${repo}/commit/${c.hash}))`;
    });
    blocks.push([`### ${section}`, "", ...lines].join("\n"));
  }
  return blocks.join("\n\n");
}

// from이 없으면 첫 릴리즈 — to까지 전부 본다.
export function readCommitLines(from, to, run = execFileSync) {
  const range = from ? `${from}..${to}` : to;
  const out = run("git", ["log", range, "--no-merges", "--format=%H%x09%s"], {
    encoding: "utf-8",
  });
  return out.split("\n").filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [from, to] = process.argv.slice(2);
  const commits = parseCommits(readCommitLines(from || null, to || "HEAD"));
  process.stdout.write(
    renderNotes(commits, { repo: process.env.GITHUB_REPOSITORY ?? "" }),
  );
}
