#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  annotateGroupCounts,
  buildUserPrompt,
  countItems,
  parseInputGroups,
  polishWithVerification,
  renderPolished,
} from "./polish-core.mjs";

// 모델·출력 토큰 상한은 환경변수로 조정 가능.
// 이 toolkit은 릴리즈 시점에만 실행되는 저빈도 작업이라 비용보다 품질을 우선해 full 모델을 기본값으로 둔다.
const MODEL = process.env.POLISH_MODEL ?? "gpt-5.4";
const MAX_OUTPUT_TOKENS = Number(process.env.POLISH_MAX_OUTPUT_TOKENS ?? 8000);

// --preview: PREVIEW_NOTES env에서 노트를 읽고 stdout으로 출력 (PR 미리보기용)
// 일반 모드: gh release view로 노트를 읽고 gh release edit으로 갱신 (실제 릴리즈용)
const positionalArgs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const isPreviewMode = process.argv.includes("--preview");
const tag = positionalArgs[0];

if (!tag) {
  console.warn("[polish] No tag arg. Skipping.");
  process.exit(0);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn("[polish] OPENAI_API_KEY missing. Skipping.");
  process.exit(0);
}
if (!isPreviewMode && !process.env.GITHUB_REPOSITORY) {
  console.warn("[polish] GITHUB_REPOSITORY missing. Skipping.");
  process.exit(0);
}

let releaseBody;
if (isPreviewMode) {
  releaseBody = (process.env.PREVIEW_NOTES ?? "").trim();
  if (!releaseBody) {
    console.warn("[polish] PREVIEW_NOTES empty. Skipping.");
    process.exit(0);
  }
} else {
  try {
    releaseBody = execSync(`gh release view ${tag} --json body --jq .body`, {
      encoding: "utf-8",
    }).trim();
  } catch (err) {
    console.warn("[polish] Failed to read release body:", err.message);
    process.exit(0);
  }
  if (!releaseBody) {
    console.warn("[polish] Release body empty. Skipping.");
    process.exit(0);
  }
}

const annotatedBody = annotateGroupCounts(releaseBody);
const totalItems = countItems(releaseBody);
const inputGroups = parseInputGroups(releaseBody);

// 검증 통과한 AI 출력만 게시하고, 2회 실패 시 polishedJson은 null → 결정론 원본으로 폴백한다.
let polished;
try {
  const polishedJson = await polishWithVerification({
    apiKey,
    model: MODEL,
    inputGroups,
    baseUserPrompt: buildUserPrompt(tag, totalItems, annotatedBody),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  polished = polishedJson
    ? renderPolished(tag, polishedJson)
    : null;
} catch (err) {
  console.warn("[polish] 처리 실패:", err.message);
  polished = null;
}

if (!polished) {
  // 누락 0 보장: AI 요약을 못 얻으면 결정론 원본을 그대로 본문으로 쓴다(손실된 요약보다 안전).
  console.warn("[polish] 결정론 원본으로 폴백(AI 요약 미적용).");
  polished = `## ${tag} 요약\n\n${releaseBody}`;
}

if (isPreviewMode) {
  process.stdout.write(polished);
  process.exit(0);
}

// 이전 태그 추출: 정렬된 목록에서 현재 태그(인자) 위치를 찾고 그 다음을 선택.
// 단순 tags[1]은 prefix가 섞여 있을 때(예: legacy `v0.5.0`과 신규 `1.2.3`) version:refname
// 정렬이 ASCII 비교로 떨어져 현재 태그가 첫 위치에 오지 않을 수 있다.
let previousTag = "";
try {
  const tags = execSync("git tag --sort=-version:refname --merged HEAD", {
    encoding: "utf-8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const currentIdx = tags.indexOf(tag);
  previousTag =
    currentIdx >= 0 ? (tags[currentIdx + 1] ?? "") : (tags[0] ?? "");
} catch {}

// 기여자 목록: commit SHA → GitHub API → author.login 방식으로 resolve.
// git author name(%aN)은 display name이 되어 이름과 username이 불일치할 수 있으므로
// GitHub API로 실제 username을 가져온다. API 실패 시 %aN으로 fallback.
const contributorRange = previousTag ? `${previousTag}..HEAD` : "HEAD";
let contributors = [];
const githubToken = process.env.GITHUB_TOKEN;
const [owner, repoName] = (process.env.GITHUB_REPOSITORY ?? "/").split("/");

if (githubToken && owner && repoName) {
  // commit SHA 목록 추출
  let shas = [];
  try {
    shas = execSync(`git log ${contributorRange} --format="%H" --no-merges`, {
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch (err) {
    console.warn(`[polish] Failed to get commit SHAs: ${err.message}`);
  }

  // 각 SHA에 대해 GitHub API로 author.login 조회
  const logins = new Set();
  for (const sha of shas) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/commits/${sha}`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "release-toolkit-polish",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const login = data?.author?.login;
        // bot 계정(github-actions[bot] 등) 제외
        if (login && !login.endsWith("[bot]")) logins.add(login);
      }
    } catch {}
  }

  contributors = [...logins];
  if (!contributors.length) {
    console.warn(
      `[polish] No contributors found via GitHub API for range ${contributorRange}.`,
    );
  }
} else {
  // GITHUB_TOKEN 없을 때 fallback: git author name
  try {
    const names = execSync(
      `git log ${contributorRange} --format='%aN' --no-merges`,
      { encoding: "utf-8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    contributors = [...new Set(names)];
    if (!contributors.length) {
      console.warn(
        `[polish] No contributors found in range ${contributorRange}.`,
      );
    }
  } catch (err) {
    console.warn(`[polish] Failed to read contributors: ${err.message}`);
  }
}

const formatContributor = (login) => `@${login}`;

const footerLines = [];
if (previousTag && owner && repoName) {
  footerLines.push(
    `**전체 변경 비교**: [\`${previousTag}...${tag}\`](https://github.com/${owner}/${repoName}/compare/${previousTag}...${tag})`,
  );
}
if (contributors.length) {
  footerLines.push(
    `**기여자**: ${contributors.map(formatContributor).join(", ")}`,
  );
}

const combinedParts = [polished, ""];
if (footerLines.length) {
  combinedParts.push("---", "", ...footerLines, "");
}
combinedParts.push(
  "<details>",
  "<summary>📋 전체 변경 항목 보기</summary>",
  "",
  releaseBody,
  "",
  "</details>",
);
const finalBody = combinedParts.join("\n");

const tmpFile = join(tmpdir(), `polished-${tag}.md`);
writeFileSync(tmpFile, finalBody);

try {
  execSync(`gh release edit ${tag} --notes-file ${tmpFile}`, {
    stdio: "inherit",
  });
  console.log(`[polish] Updated ${tag} release notes.`);
} catch (err) {
  console.warn("[polish] gh release edit failed:", err.message);
  process.exit(0);
}
