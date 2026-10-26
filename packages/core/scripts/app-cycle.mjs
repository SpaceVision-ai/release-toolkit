// 앱 릴리즈 사이클 판별. 단계를 사람이 고르지 않고 태그·릴리즈 상태·입력으로 정한다.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseCommits, readCommitLines, recommendBump } from "./app-release-notes.mjs";
import { bumpVersion, compareVersion, parseTags, sortBuilds } from "./app-version.mjs";

const fail = (message) => ({ stage: "fail", message });
const hasBuildTags = (tags, version) => parseTags(tags).builds.some((b) => b.version === version);

function latestPublishedBelow(releases, releaseStates, version) {
  return (
    releases
      .filter((r) => releaseStates[r] === "published" && compareVersion(r, version) < 0)
      .sort(compareVersion)
      .at(-1) ?? null
  );
}

// 줄기 버전: main은 도달 가능한 빌드 태그 중 가장 높은 버전(없으면 최신 공개 릴리즈),
// hotfix/*는 최신 공개 릴리즈 + patch. 핫픽스가 main에 머지돼도 열린 상위 버전 사이클을 놓치지 않는다.
function lineVersion({ isHotfix, releases, builds, releaseStates }) {
  const published = releases.filter((r) => releaseStates[r] === "published").sort(compareVersion);
  if (isHotfix) return published.length ? bumpVersion(published.at(-1), "patch") : null;
  const versions = [...new Set(builds.map((b) => b.version))].sort(compareVersion);
  return versions.at(-1) ?? published.at(-1) ?? null;
}

export function decide({ ref, bump, complete, head, buildNumber, tags, allTags = tags, releaseStates, commitOf, developSinceEnd = () => false }) {
  const isHotfix = ref.startsWith("hotfix/");
  if (!isHotfix && ref !== "main") return fail(`main 또는 hotfix/* 에서만 빌드할 수 있습니다: ${ref}`);

  const { releases, builds } = parseTags(tags);
  const version = lineVersion({ isHotfix, releases, builds, releaseStates });
  if (isHotfix && !version) return fail("핫픽스 기준이 될 출시 릴리즈가 없습니다");
  if (isHotfix && releaseStates[version] === "published")
    return fail(`${version}은 이미 출시됐습니다. 최신 출시 태그에서 새로 분기하세요`);

  const line = sortBuilds(builds.filter((b) => b.version === version));
  const last = line.at(-1);
  const open = !!last && last.kind !== "end";

  if (!open) {
    if (complete) return fail("테스트 시작 전에는 종료할 수 없습니다. 완료 체크 없이 빌드해 테스트를 시작하세요");
    let next;
    if (isHotfix) {
      if (bump !== "skip") return fail("핫픽스는 버전을 자동으로 정합니다. 버전 올림은 skip으로 두세요");
      next = version;
    } else if (bump === "skip") {
      // 같은 버전 재테스트: 공개 전이고, 그 버전 -end 뒤 main에 develop이 들어오지 않았을 때만.
      // 다음 버전 코드가 섞인 main으로 지난 번호를 다시 빌드하지 않게 한다
      if (!version || !line.length || releaseStates[version] === "published") {
        return fail(`${version ?? "직전 버전"}은 이미 출시됐습니다. 버전 올림을 고르세요`);
      }
      if (developSinceEnd(commitOf(last.tag))) {
        return fail(`${version} 이후 develop이 머지돼 같은 버전으로 다시 테스트할 수 없습니다. 버전을 올리세요`);
      }
      next = version;
    } else {
      // -end 뒤에는 공개 전이어도 버전을 올려 다음 테스트를 연다 (공개 여부는 출시 콘솔이 다룬다)
      next = bumpVersion(version ?? "0.0.0", bump);
      // 아직 main에 머지되지 않은 핫픽스가 이미 그 번호로 빌드했을 수 있다
      if (hasBuildTags(allTags, next)) return fail(`${next}은 이미 빌드된 버전입니다(핫픽스 등). 더 높게 올리세요`);
    }
    // 핫픽스가 main에 머지되기 전에 공개되면, main에서 올린 버전이 그 핫픽스 버전과 같아질 수 있다.
    if (releaseStates[next] === "published") return fail(`${next}은 이미 출시된 버전입니다. 더 높게 올리세요`);
    return {
      stage: "start",
      version: next,
      buildTag: `${next}.${buildNumber}-start`,
      build: true,
      startRef: head,
      finalRef: head,
      fromRef: latestPublishedBelow(releases, releaseStates, next),
    };
  }

  if (bump !== "skip") return fail(`${version} 테스트가 진행 중입니다. 버전 올림은 skip으로 두세요`);
  const lastCommit = commitOf(last.tag);
  const changed = lastCommit !== head;
  const start = [...line].reverse().find((b) => b.kind === "start");
  if (!start) return fail("진행 중인 사이클에 -start 태그가 없습니다");
  const common = {
    version,
    startRef: commitOf(start.tag),
    fromRef: latestPublishedBelow(releases, releaseStates, version),
  };

  if (!complete) {
    if (!changed) return fail(`마지막 빌드(${last.tag}) 이후 바뀐 것이 없습니다. 테스트를 끝내려면 완료 체크를 하세요`);
    return { stage: "mid", ...common, buildTag: `${version}.${buildNumber}`, build: true, finalRef: head };
  }
  if (changed) return { stage: "end", ...common, buildTag: `${version}.${buildNumber}-end`, build: true, finalRef: head };
  return { stage: "end", ...common, buildTag: `${version}.${last.build}-end`, build: false, finalRef: lastCommit };
}

// main의 상태: testing(사이클 열림) / closed(그 밖). 공개 여부는 출시 콘솔이 다룬다 —
// -end가 찍히면 공개 전이어도 다음 사이클을 열 수 있다
export function mainState(tags, releaseStates) {
  const { releases, builds } = parseTags(tags);
  const version = lineVersion({ isHotfix: false, releases, builds, releaseStates });
  if (!version) return "closed";
  const last = sortBuilds(builds.filter((b) => b.version === version)).at(-1);
  return last && last.kind !== "end" ? "testing" : "closed";
}

// 핫픽스 가지의 -end 태그가 PR head 커밋을 그대로 가리킬 때만 종료로 본다.
// -end 뒤에 커밋이 더 붙었으면 그 커밋은 테스트되지 않았으므로 머지를 막는다.
export function hotfixEndedAt(branchOnlyTags, headSha, commitOf) {
  return parseTags(branchOnlyTags).builds.some((b) => b.kind === "end" && commitOf(b.tag) === headSha);
}

// developSinceEnd: 줄기 버전의 마지막 -end 이후 main에 fix/가 아닌 PR의 커밋이 들어왔는가 (지연 평가)
export function gate({ state, headRef, hasDevelopOnlyCommits, hotfixEnded, lineUnpublished, developSinceEnd }) {
  const deny = (reason) => ({ allow: false, reason });
  if (headRef === "develop") {
    return state === "testing" ? deny("테스트 중에는 develop을 main에 머지할 수 없습니다") : { allow: true };
  }
  if (headRef.startsWith("fix/")) {
    if (hasDevelopOnlyCommits) return deny("fix/는 main에서 분기해야 합니다 (develop에만 있는 커밋이 들어 있음)");
    if (state === "testing") return { allow: true };
    if (lineUnpublished && !developSinceEnd()) return { allow: true };
    return deny("테스트가 닫혔습니다. 수정은 develop으로 보내고, 출시본 수정은 hotfix/로 하세요");
  }
  if (headRef.startsWith("hotfix/")) {
    return hotfixEnded ? { allow: true } : deny("핫픽스 사이클을 종료(-end)한 뒤에 머지하세요");
  }
  return deny(`main에는 develop, fix/, hotfix/만 머지할 수 있습니다: ${headRef}`);
}

// ---- CLI ----
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf-8" }).trim();

// 초안까지 포함해야 하므로 releases API 목록을 쓴다 (tags/{tag} 엔드포인트는 초안을 돌려주지 않는다).
function readReleaseStates(repo) {
  const out = sh("gh", [
    "api", `repos/${repo}/releases`, "--paginate",
    "--jq", '.[] | [.tag_name, (if .draft then "draft" elif .prerelease then "prerelease" else "published" end)] | @tsv',
  ]);
  return Object.fromEntries(out.split("\n").filter(Boolean).map((l) => l.split("\t")));
}

function writeOutputs(obj) {
  const file = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(obj).map(([k, v]) => `${k}=${v ?? ""}`).join("\n");
  if (file) appendFileSync(file, `${lines}\n`);
  else process.stdout.write(`${lines}\n`);
}

const die = (message) => {
  console.log(`::error::${message}`);
  process.exit(1);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) die("GITHUB_REPOSITORY가 비어 있습니다");
  if (mode === "decide") {
    if (!process.env.APP_REF) die("APP_REF(빌드할 ref)가 비어 있습니다");
    if (!/^[1-9]\d*$/.test(process.env.APP_BUILD_NUMBER ?? "")) die(`APP_BUILD_NUMBER가 양의 정수가 아닙니다: ${process.env.APP_BUILD_NUMBER ?? ""}`);
  }
  const tags = sh("git", ["tag", "--merged", "HEAD"]).split("\n").filter(Boolean);
  const releaseStates = readReleaseStates(repo);

  if (mode === "decide") {
    const result = decide({
      ref: process.env.APP_REF,
      bump: process.env.APP_BUMP ?? "skip",
      complete: process.env.APP_COMPLETE === "true",
      head: sh("git", ["rev-parse", "HEAD"]),
      buildNumber: Number(process.env.APP_BUILD_NUMBER),
      tags,
      releaseStates,
      commitOf: (t) => sh("git", ["rev-list", "-n1", t]),
    });
    if (result.stage === "fail") {
      console.log(`::error::${result.message}`);
      process.exit(1);
    }
    const recommended = recommendBump(parseCommits(readCommitLines(result.fromRef, result.finalRef)));
    writeOutputs({
      stage: result.stage, version: result.version, build_tag: result.buildTag,
      build: String(result.build), start_ref: result.startRef, final_ref: result.finalRef,
      from_ref: result.fromRef, recommended_bump: recommended,
    });
  } else if (mode === "gate") {
    const headRef = process.env.APP_HEAD_REF;
    const developOnly = sh("git", ["rev-list", "origin/main..origin/develop"]).split("\n").filter(Boolean);
    const prCommits = sh("git", ["rev-list", "origin/main..HEAD"]).split("\n").filter(Boolean);
    const mainTags = sh("git", ["tag", "--merged", "origin/main"]).split("\n").filter(Boolean);
    // 핫픽스 가지에서만 찍힌 -end가 있으면 종료된 것. 버전을 "최신 공개 + patch"로 다시 계산하면
    // 핫픽스 PR 머지 전에 그 버전이 먼저 공개됐을 때 다음 버전을 찾아 영원히 거부하게 된다.
    const branchOnly = tags.filter((t) => !mainTags.includes(t));
    // pull_request 체크아웃의 HEAD는 머지 커밋이라, PR head SHA는 APP_HEAD_SHA로 받는다.
    const headSha = process.env.APP_HEAD_SHA || sh("git", ["rev-parse", "HEAD"]);
    const hotfixEnded = hotfixEndedAt(branchOnly, headSha, (t) => sh("git", ["rev-list", "-n1", t]));
    const result = gate({
      state: mainState(mainTags, releaseStates),
      headRef,
      hasDevelopOnlyCommits: prCommits.some((c) => developOnly.includes(c)),
      hotfixEnded,
    });
    if (!result.allow) {
      console.log(`::error::${result.reason}`);
      process.exit(1);
    }
    console.log(`허용: ${headRef}`);
  } else {
    console.error("usage: app-cycle.mjs decide|gate");
    process.exit(2);
  }
}
