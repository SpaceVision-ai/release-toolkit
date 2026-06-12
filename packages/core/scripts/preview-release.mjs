#!/usr/bin/env node
// PR 미리보기 전용: .releaserc.cjs 규칙을 직접 읽어 git log를 분석하고
// 다음 버전과 릴리즈 노트를 stdout JSON으로 출력. CI 환경·권한 무관.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
// 자식 레포의 node_modules/@spacevision-ai/release-toolkit-node/scripts/ 에서 실행될 때
// 호출 시점 cwd(=자식 레포 루트)의 .releaserc.cjs를 읽어야 한다.
// 단순 '../.releaserc.cjs'는 toolkit 패키지 내부 경로로 해석되어 잘못된 파일을 가리킨다.
const config = require(resolve(process.cwd(), ".releaserc.cjs"));

const releaseRules = config.plugins[0][1].releaseRules;
const sectionDefs = config.plugins[1][1].presetConfig.types;

const typeToRelease = Object.fromEntries(
  releaseRules.filter((r) => r.type).map((r) => [r.type, r.release]),
);
const typeToSection = Object.fromEntries(
  sectionDefs.map((t) => [t.type, t.section]),
);
const sectionOrder = sectionDefs.map((t) => t.section);

let lastTag = "";
try {
  lastTag = execSync("git describe --tags --abbrev=0 2>/dev/null", {
    encoding: "utf-8",
  }).trim();
} catch {}

const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
let lines = [];
try {
  lines = execSync(`git log ${range} --no-merges --format="%H %s"`, {
    encoding: "utf-8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
} catch {}

if (!lines.length) {
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      "version=(변경사항 없음)\nnotes<<EOF\n릴리즈할 새 변경사항을 찾지 못했습니다.\nEOF\n",
    );
  } else {
    process.stdout.write(JSON.stringify({ version: null, notes: null }));
  }
  process.exit(0);
}

let bump = null;
const grouped = {};

for (const line of lines) {
  const spaceIdx = line.indexOf(" ");
  const hash = line.slice(0, spaceIdx);
  const subject = line.slice(spaceIdx + 1);
  const match = subject.match(/^(\w+)(\([^)]*\))?(!?):\s*(.+)$/);
  if (!match) continue;
  const [, type, scopeRaw, bang, description] = match;
  const scope = scopeRaw?.replace(/[()]/g, "");
  const isBreaking = bang === "!";

  const bumpType = isBreaking ? "major" : typeToRelease[type];
  if (!bumpType) continue;
  if (
    !bump ||
    bumpType === "major" ||
    (bumpType === "minor" && bump === "patch")
  ) {
    bump = bumpType;
  }

  const section = typeToSection[type];
  if (!section) continue;
  if (!grouped[section]) grouped[section] = [];
  grouped[section].push({ scope, description, shortHash: hash.slice(0, 7) });
}

if (!bump) {
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      "version=(변경사항 없음)\nnotes<<EOF\n릴리즈할 새 변경사항을 찾지 못했습니다.\nEOF\n",
    );
  } else {
    process.stdout.write(JSON.stringify({ version: null, notes: null }));
  }
  process.exit(0);
}

// 태그가 없으면 첫 릴리즈 = 1.0.0 (semantic-release 기본 동작)
const nextVersion = !lastTag
  ? "1.0.0"
  : (() => {
      const [maj, min, pat] = lastTag.replace(/^v/, "").split(".").map(Number);
      return bump === "major"
        ? `${maj + 1}.0.0`
        : bump === "minor"
          ? `${maj}.${min + 1}.0`
          : `${maj}.${min}.${pat + 1}`;
    })();

const repo = process.env.GITHUB_REPOSITORY ?? "";
const date = new Date().toISOString().split("T")[0];
let notes = `## ${nextVersion} (${date})\n`;

for (const section of sectionOrder) {
  const commits = grouped[section];
  if (!commits?.length) continue;
  notes += `\n### ${section}\n\n`;
  for (const { scope, description, shortHash } of commits) {
    const link = repo
      ? ` ([${shortHash}](https://github.com/${repo}/commit/${shortHash}))`
      : "";
    notes += scope
      ? `* **${scope}:** ${description}${link}\n`
      : `* ${description}${link}\n`;
  }
}

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(githubOutput, `version=${nextVersion}\n`);
  appendFileSync(githubOutput, `notes<<EOF\n${notes}\nEOF\n`);
} else {
  process.stdout.write(JSON.stringify({ version: nextVersion, notes }));
}
