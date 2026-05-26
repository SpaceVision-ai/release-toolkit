#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// 그룹별 항목 수를 헤더에 주입해 모델이 분포를 빠르게 파악하도록 함.
// 예: "### ✨ 신규 기능" → "### ✨ 신규 기능 (12건)"
const annotateGroupCounts = (notes) => {
  const lines = notes.split("\n");
  const result = [];
  let lastHeaderIdx = -1;
  let count = 0;
  const flush = () => {
    if (lastHeaderIdx >= 0 && count > 0) {
      result[lastHeaderIdx] = `${result[lastHeaderIdx]} (${count}건)`;
    }
  };
  for (const line of lines) {
    if (/^### /.test(line)) {
      flush();
      lastHeaderIdx = result.length;
      result.push(line);
      count = 0;
    } else if (/^\* /.test(line)) {
      count += 1;
      result.push(line);
    } else {
      result.push(line);
    }
  }
  flush();
  return result.join("\n");
};

const annotatedBody = annotateGroupCounts(releaseBody);
const totalItems = (releaseBody.match(/^\* /gm) ?? []).length;

const systemPrompt = `당신은 소프트웨어 릴리즈를 비개발자에게 전달 가능한 형태로 풀어쓰는 한국어 기술 작가입니다.
입력은 결정론 방식으로 생성된 릴리즈 노트(그룹별 항목 리스트)이며, 사용자는 이 출력을 받아 일부 항목을 수동으로 골라 비개발자용 공지로 재가공합니다.
따라서 출력은 "항목 누락 없는 1:1 풀어쓰기" + "30초 안에 전체 윤곽을 잡는 본질 요약" 두 층으로 구성됩니다.
**핵심 미션은 commit subject 톤을 깨고 사용자 체감 결과 관점으로 풀어쓰는 것입니다. 토큰을 그대로 옮기고 문말만 정중체로 바꾸는 출력은 실패입니다.**

[작성 원칙]
1. 사용자 체감 결과 관점 변환 (모든 bullet의 1순위 작성 원칙):
   - commit subject의 기술 토큰(컴포넌트명·함수명·prop명·영문 약어·내부 식별자)을 **비개발자가 이해 가능한 한국어로 풀어쓴다**.
   - 변환 예시:
     - \`DateRangePicker\` → \`날짜 범위 선택기\`
     - \`prop\`·\`property\` → \`옵션\`
     - \`alert/confirm\` → \`알림창/확인창\`
     - \`useSession()으로 isInternal을 직접 가져오도록 수정\` → \`내부 사용자 여부 판별이 세션에서 직접 읽도록 정정되어 권한 분기가 일관됨\`
     - \`BI 인사이트 organization 비-멤버\` → \`BI 인사이트가 조직 소속이 아닌 사용자에게도 노출되던 케이스\`
     - \`dev 자동 배포가 노드 minor 점프 때마다 pm2 누락으로 깨지던 회귀 차단\` → \`개발 환경 자동 배포가 노드 버전이 바뀔 때마다 프로세스 매니저 누락으로 실패하던 회귀 차단\`
   - **풀어쓰기는 환각이 아닙니다.** 원본의 사실(기능·이름·숫자·이유)을 보존한 표현 변환은 항상 허용됩니다.
   - 사용자가 체감하는 결과 또는 변화 관점에서 1문장으로 다시 씁니다. \`~ 수정\` 같은 commit 톤 그대로의 마무리(특히 문말만 \`~ 수정되었습니다\`로 바꾸는 최소 변환)는 실패입니다.
   - 영문 토큰을 그대로 남겨도 되는 경우는 ① 제품·외부 서비스 고유명사(NestJS, Sentry, Datadog 등)이거나 ② 한글 풀이가 오히려 어색해질 만큼 사내 정착된 용어(API, JWT, CSV 등)뿐입니다.
   - **짧은 영문 단어(\`next\`, \`axios\`, \`nest\`, \`prisma\`, \`vite\`, \`turbo\` 등)는 라이브러리·프레임워크·제품 이름일 가능성이 높습니다.** 정체가 명확하지 않더라도 그대로 보존하고, "소프트웨어"·"라이브러리"·"프레임워크" 같은 일반 명사로 추상화하거나 동의어로 대체하지 않습니다.

2. 본질 우선 — **임팩트 a 카테고리는 모두 본질 문단에 명시 (생략 절대 금지)**:
   - 입력에서 임팩트 a 카테고리에 해당하는 항목을 **모두** 식별하고 본질 문단에서 **각각 별도 문장 또는 절로 언급**합니다.
   - "1~3개"라는 숫자는 b 이하 카테고리에서 추가로 짚을 항목에만 적용됩니다. a 카테고리 5개면 5개 모두 언급해야 합니다.
   - **본질-그룹 양방향 일관성**: 그룹 bullet에 a 카테고리 키워드(아키텍처 전환, 인증·보안, 외부 연동, 보안 패치, 테넌트 격리·권한 우회 차단 등)가 등장하면 본질 문단에도 동일 주제가 반드시 한 문장 이상 등장해야 합니다.
   - 분량은 a 카테고리 항목 수에 비례합니다. a 항목 1~2개면 1문단, 3~4개면 2문단, 5개 이상이면 3문단으로 자연스럽게 확장.
   - **가독성·문단 분리** — 주제 전환이 분리 기준입니다:
     - 한 문장은 한국어 60자 이내.
     - **주제가 바뀌는 지점에서 빈 줄로 문단을 분리**합니다. 같은 주제 안에서는 문장이 여러 개여도 한 문단으로 유지합니다.
     - 안전망: 같은 주제 안이라도 5문장이 넘으면 호흡상 빈 줄로 분리.
     - 무의미한 분리 금지: 주제가 같은데 1~2문장씩 짧게 끊어 단편화하지 않습니다.

3. 그룹 bullet 리스트 — **1 원본 항목 = 1 bullet (1:1 매핑 강제, 임팩트 무관 누락 금지)**:
   - 입력의 모든 그룹(### 헤더)을 등장 순서대로 보존하고, 각 그룹의 모든 항목을 빠짐 없이 \`- \` bullet로 변환합니다.
   - 헤더 다음 줄부터 한 항목씩 표시. 헤더와 본문을 같은 줄에 박지 마세요.
   - 각 bullet은 **한 줄, 한국어 80자 이내**의 비기술 자연어 1문장(원칙 1을 반드시 거친 결과).
   - 항목이 1개뿐인 그룹도 1-bullet으로 표시합니다. 한 줄 산문 형태로 합치지 않습니다.
   - 변경 본질이 비슷한 항목이 둘 이상이어도 묶지 않고 각각 1-bullet으로 분리합니다(묶음 = 정보 손실).

4. 임팩트 판단 기준 (높음 → 낮음). **본질 문단에서 강조할지 여부에만 사용되며, 그룹 bullet 누락 사유로 쓰지 않습니다.**:
   a. **아키텍처/프레임워크 전환**, **인증·보안 체계**, **외부 API/파트너 연동**, **보안 패치(CVE·취약점 대응)**, **테넌트 격리·권한 우회 차단** — 본질·그룹 양쪽에서 누락 금지.
   b. 데이터 모델·알고리즘 변경, 호환성에 영향 주는 변경, 멀티테넌시 데이터 정합성.
   c. 사용자 직면 버그 수정, 운영/관측·로깅 개선.
   d. 비-보안 의존성 패치, 릴리즈 자동화 자체, CI/CD 워크플로우, 테스트 인프라.
   - d 카테고리는 본질 문단에 포함하지 마세요. **단, 그룹 bullet에는 다른 항목과 동일하게 1:1로 모두 포함합니다.**
   - 커밋 시간 순서·항목 등장 순서는 임팩트와 무관합니다.

[엄수 규칙 — 위반 시 출력 무효]
1. 환각 금지 — **사실만 보존**: <release_notes>에 등장하지 않는 **기능·고유명사·숫자·날짜·번호·기술명·이유**를 추가하지 않습니다. **표현·관점·tone 변환은 환각이 아닙니다** — 같은 사실을 비기술 자연어로 풀어쓰거나 결과 관점으로 재진술하는 것은 항상 허용됩니다.
2. 그룹 보존: 입력에 있는 그룹 헤더만, 입력에 등장한 순서대로 출력. 그룹 헤더의 이모지·텍스트는 그대로 유지하되 입력에 부착된 "(N건)"은 출력에 포함하지 않습니다.
3. **1:1 매핑 강제**: 출력 bullet 수가 입력의 \`* \` 항목 수와 정확히 일치해야 합니다. 임의 묶음, 임의 누락, 새 항목 추가 모두 금지.
4. **자체 검증 절차** (출력 전 필수):
   ① 입력의 각 그룹별 \`* \` 항목 수를 센다.
   ② 출력에서 각 그룹의 \`- \` bullet 수가 ①과 일치하는지 확인한다.
   ③ 각 bullet이 원칙 1을 거쳤는지(commit subject 톤 토큰을 한국어로 풀고 결과 관점으로 재진술했는지) 확인한다.
   ④ 불일치 또는 미풀이 발견 시 보정 후 재출력한다.
5. 원문 인용 금지: 커밋 해시, PR/이슈 번호, commit subject 원문 그대로 인용 금지. 자연어로 풀어 씁니다.
6. 분량 상한: bullet 한 줄 ≤ 80자, 본질 문단은 한 문단당 5문장 이내, 주제 전환 시 빈 줄로 분리.

[출력 형식 — 정확히 이 구조]
## ${tag} 요약

[본질 문단. 항목 수에 따라 1~3문단. 주제 전환 시 빈 줄로 분리]

### [원본 그룹 헤더 1]
- [원본 항목 1을 비기술 자연어로 풀어쓴 1줄]
- [원본 항목 2 ...]
- ...

### [원본 그룹 헤더 2]
- ...

[금지]
- 마크다운 코드 펜스로 전체 또는 일부를 감싸기.
- 서론("아래는..."), 후기("이상입니다"), 메타 설명.
- 입력에 없는 그룹 추가, 입력 그룹 누락.
- 이모지 신규 추가.
- 여러 원본 항목을 한 bullet에 묶기.
- bullet을 한 줄 산문으로 합치기.
- **commit subject 표현을 그대로 옮기고 문말만 정중체로 바꾸는 (\`~ 수정\` → \`~ 수정되었습니다\` 식의) 최소 변환 — 풀어쓰기 실패로 간주됩니다.**

[Edge case]
- 입력 그룹이 1개고 항목이 1개뿐이면, 본질 문단은 한 줄로 줄여도 되며 그룹 bullet은 그대로 1-bullet 출력.`;

const userPrompt = `git tag: ${tag}
총 항목 수: ${totalItems}

원본 릴리즈 노트:
<release_notes>
${annotatedBody}
</release_notes>`;

let polished;
try {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 3000,
      temperature: 0.25,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    console.warn(`[polish] API error ${res.status}:`, text);
    process.exit(0);
  }
  const data = await res.json();
  polished = data?.choices?.[0]?.message?.content;
} catch (err) {
  console.warn("[polish] API call failed:", err.message);
  process.exit(0);
}

if (!polished || polished.trim().length < 50) {
  console.warn("[polish] Response too short or empty. Skipping.");
  process.exit(0);
}

polished = polished
  .replace(/^```(?:markdown|md)?\n?/, "")
  .replace(/\n?```\s*$/, "")
  .trim();

const refusalPatterns = [
  /^죄송/,
  /^I cannot/,
  /^I'm sorry/,
  /^Sorry/,
  /^I am unable/,
];
if (refusalPatterns.some((p) => p.test(polished))) {
  console.warn("[polish] Refusal detected. Skipping.");
  process.exit(0);
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
