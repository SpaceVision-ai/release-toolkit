// packages/core/scripts/app-release.mjs
// 앱 릴리즈 처리: start(초안) → end(태그·프리릴리즈·백머지) → publish(배포 요약·공개).
// AI 요약은 start에서 한 번만 한다(P2). git·gh 호출은 run으로 주입받는다.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCommits, readCommitLines, renderNotes } from "./app-release-notes.mjs";

const FIXES = "## 테스트 중 수정";

const notesFor = (run, repo, from, to) =>
  renderNotes(parseCommits(readCommitLines(from, to, run)), { repo });

const viewRelease = (run, repo, version) => {
  try {
    return JSON.parse(run("gh", ["release", "view", version, "-R", repo, "--json", "body,isDraft,isPrerelease"]));
  } catch {
    return null;
  }
};

export function startRelease({ run, repo, version, fromRef, startRef, polish, writeFile }) {
  const raw = notesFor(run, repo, fromRef, startRef) || "변경 사항 없음";
  const compare = fromRef ? `\n\n**전체 변경 비교**: [\`${fromRef}...${startRef.slice(0, 7)}\`](https://github.com/${repo}/compare/${fromRef}...${startRef})` : "";
  const file = writeFile(`${polish(version, raw)}${compare}`);
  if (viewRelease(run, repo, version)) {
    run("gh", ["release", "edit", version, "-R", repo, "--notes-file", file]);
  } else {
    run("gh", ["release", "create", version, "-R", repo, "--draft", "--title", version, "--target", startRef, "--notes-file", file]);
  }
}

export function withFixes(body, fixes) {
  const idx = body.indexOf(`\n\n${FIXES}`);
  const head = idx >= 0 ? body.slice(0, idx) : body;
  return `${head}\n\n${FIXES}\n\n${fixes || "없음"}`;
}

// 다시 실행했을 때 같은 PR이 이미 있으면 그대로 둔다.
function createPr(run, args) {
  try {
    run("gh", ["pr", "create", ...args]);
  } catch (err) {
    if (!String(err.message ?? err).includes("already exists")) throw err;
  }
}

function backMerge(run, repo, version, ref) {
  const title = `chore: main 백머지 (${version})`;
  if (ref.startsWith("hotfix/")) {
    for (const base of ["main", "develop"]) {
      createPr(run, ["-R", repo, "--base", base, "--head", ref, "--title", `${ref} → ${base} (${version})`, "--body", "핫픽스 사이클 종료로 자동 생성한 PR입니다."]);
    }
    return "pr";
  }
  run("git", ["fetch", "origin", "develop", "main"]);
  run("git", ["checkout", "-B", "app-release-backmerge", "origin/develop"]);
  try {
    run("git", ["merge", "--no-ff", "origin/main", "-m", title]);
  } catch {
    run("git", ["merge", "--abort"]);
    const branch = `chore/backmerge-${version}`;
    run("git", ["push", "origin", `origin/main:refs/heads/${branch}`]);
    createPr(run, ["-R", repo, "--base", "develop", "--head", branch, "--title", title, "--body", "테스트 종료 백머지에서 충돌이 나 PR로 올립니다."]);
    return "pr";
  }
  run("git", ["push", "origin", "HEAD:develop"]);
  return "pushed";
}

export function endRelease({ run, repo, version, startRef, finalRef, ref, writeFile }) {
  const current = viewRelease(run, repo, version);
  const body = withFixes(current?.body ?? "", notesFor(run, repo, startRef, finalRef));
  const file = writeFile(body);

  // 출시 전 재테스트면 1.5.0 태그가 이전 최종 커밋에 있다. 공개 전이라 다시 만든다.
  if (run("git", ["ls-remote", "--tags", "origin", `refs/tags/${version}`]).trim()) {
    run("git", ["push", "origin", `:refs/tags/${version}`]);
  }
  run("git", ["tag", "-f", version, finalRef]);
  run("git", ["push", "origin", `refs/tags/${version}`]);
  run("gh", ["release", "edit", version, "-R", repo, "--tag", version, "--draft=false", "--prerelease", "--notes-file", file]);

  return { backMerge: backMerge(run, repo, version, ref) };
}

export function factsBlock({ build, startedAt, endedAt, releasedAt, testBuilds, fixes }) {
  return [
    "| 항목 | 값 |",
    "|------|----|",
    `| 출시 빌드 | ${build} |`,
    `| 테스트 시작 | ${startedAt} |`,
    `| 테스트 종료 | ${endedAt} |`,
    `| 출시 확인 | ${releasedAt} |`,
    `| 테스트 빌드 | ${testBuilds}회 |`,
    `| 테스트 중 수정 | ${fixes}건 |`,
  ].join("\n");
}

export function publishRelease({ run, repo, version, facts, writeFile }) {
  const current = viewRelease(run, repo, version);
  if (!current || (!current.isPrerelease && !current.isDraft)) return { published: false };
  const file = writeFile(`${factsBlock(facts)}\n\n${current.body}`);
  run("gh", ["release", "edit", version, "-R", repo, "--draft=false", "--prerelease=false", "--latest", "--title", `${version} · 빌드 ${facts.build}`, "--notes-file", file]);
  return { published: true };
}

// ---- CLI ----
const here = dirname(fileURLToPath(import.meta.url));

// polish 일반 모드는 초안을 못 읽으므로 항상 --preview로 부른다. 키가 없거나 실패하면 원문을 쓴다.
function polishPreview(version, raw) {
  const r = spawnSync("node", [join(here, "polish-release-notes.mjs"), version, "--preview"], {
    encoding: "utf-8",
    env: { ...process.env, PREVIEW_NOTES: raw },
  });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : `## ${version} 요약\n\n${raw}`;
}

function tmpWriter() {
  const dir = mkdtempSync(join(tmpdir(), "app-release-"));
  let n = 0;
  return (text) => {
    const file = join(dir, `body-${n++}.md`);
    writeFileSync(file, text);
    return file;
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const stage = process.argv[2];
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf-8" });
  const base = {
    run,
    repo: process.env.GITHUB_REPOSITORY,
    version: process.env.APP_VERSION,
    fromRef: process.env.APP_FROM_REF || null,
    startRef: process.env.APP_START_REF,
    finalRef: process.env.APP_FINAL_REF,
    ref: process.env.APP_REF,
    polish: polishPreview,
    writeFile: tmpWriter(),
  };
  if (stage === "start") startRelease(base);
  else if (stage === "end") {
    const { backMerge } = endRelease(base);
    console.log(`back_merge=${backMerge}`);
  } else if (stage === "publish") {
    const facts = JSON.parse(process.env.APP_FACTS);
    const { published } = publishRelease({ ...base, facts });
    console.log(published ? `공개: ${base.version}` : `건너뜀: ${base.version} (이미 공개 또는 없음)`);
  } else {
    console.error("usage: app-release.mjs start|end|publish");
    process.exit(2);
  }
}
