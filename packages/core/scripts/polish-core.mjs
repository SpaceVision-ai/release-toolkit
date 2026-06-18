// 릴리즈 노트 polish 코어 — 순수 로직과 OpenAI 호출을 분리해 단위 테스트 가능하게 한다.
// CLI 진입점(polish-release-notes.mjs)이 이 모듈을 가져다 쓴다.
//
// 설계 원칙(요약):
// - 완전성은 결정론(원본 changelog)이 소유한다. AI는 검증을 통과한 경우에만 게시되는 부가 레이어다.
// - Structured Outputs(strict)는 "키 존재/타입"만 강제하고 배열 길이는 강제하지 못한다.
//   따라서 그룹별 항목 수 1:1 일치는 verifyPolished 코드 검증이 보장한다.
// - 검증 실패 시 AI 출력을 버리고 결정론 원본으로 폴백한다(누락 0 보장).

const GROUP_HEADER_PATTERN = /^### /;
const ITEM_PATTERN = /^\* /;
const COUNT_ANNOTATION_PATTERN = /\s*\(\d+건\)\s*$/;
const HEADER_PREFIX_PATTERN = /^#+\s*/;

// 그룹 헤더를 비교·렌더용 정규형으로 만든다.
// "### " 마크다운 prefix와 코드가 주입한 "(N건)" 주석을 제거한다.
// 모델이 header에 prefix를 붙이든("### ✨ 신규 기능") 안 붙이든("✨ 신규 기능)") 동일하게 취급해
// prefix 유무만으로 검증이 실패하지 않도록 한다.
export const normalizeHeaderText = (header) =>
  String(header ?? "")
    .replace(HEADER_PREFIX_PATTERN, "")
    .replace(COUNT_ANNOTATION_PATTERN, "")
    .trim();

// 그룹별 항목 수를 헤더에 주입해 모델이 분포를 빠르게 파악하도록 한다.
// 예: "### ✨ 신규 기능" → "### ✨ 신규 기능 (12건)"
export const annotateGroupCounts = (notes) => {
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
    if (GROUP_HEADER_PATTERN.test(line)) {
      flush();
      lastHeaderIdx = result.length;
      result.push(line);
      count = 0;
    } else if (ITEM_PATTERN.test(line)) {
      count += 1;
      result.push(line);
    } else {
      result.push(line);
    }
  }
  flush();
  return result.join("\n");
};

// 입력 changelog를 그룹 단위로 분해한다. 검증의 ground truth.
// 반환: [{ header: "### ✨ 신규 기능", count: 22 }, ...] (등장 순서 보존)
export const parseInputGroups = (notes) => {
  const lines = notes.split("\n");
  const groups = [];
  let current = null;
  for (const line of lines) {
    if (GROUP_HEADER_PATTERN.test(line)) {
      current = { header: normalizeHeaderText(line), count: 0 };
      groups.push(current);
    } else if (ITEM_PATTERN.test(line) && current) {
      current.count += 1;
    }
  }
  return groups;
};

// 입력 총 항목 수.
export const countItems = (notes) =>
  (notes.match(/^\* /gm) ?? []).length;

// Structured Outputs(strict) 스키마.
// property 순서를 groups → summaryParagraphs로 두어, 모델이 1:1 리스트를 먼저 디코딩하고
// 본질 요약을 마지막에 생성하도록 유도한다(요약의 "압축 모드"가 리스트를 오염시키는 순서를 역전).
// strict는 배열 길이를 강제하지 못하므로 expectedCount는 모델의 자기대조용 soft 신호일 뿐,
// 실제 1:1 보장은 verifyPolished가 한다.
export const POLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["groups", "summaryParagraphs"],
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["header", "expectedCount", "bullets"],
        properties: {
          header: { type: "string" },
          expectedCount: { type: "integer" },
          bullets: { type: "array", items: { type: "string" } },
        },
      },
    },
    summaryParagraphs: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export const buildSystemPrompt = () =>
  `당신은 소프트웨어 릴리즈를 비개발자에게 전달하는 한국어 기술 작가입니다.
입력은 결정론 방식으로 생성된 릴리즈 노트(그룹별 항목 리스트)입니다.
출력은 제공된 JSON 스키마(groups, summaryParagraphs)로만 생성하며, 반드시 아래 순서대로 작업합니다.

━━ [1단계] groups — 모든 항목을 빠짐없이 1:1로 풀어쓴다 (가장 중요) ━━
요약·취사선택·중요도 판단을 일절 하지 마세요. 임팩트가 낮든 사소하든, 단 하나도 빠뜨리지 않고 전부 변환합니다.
- 입력의 모든 그룹(### 헤더)을 등장 순서대로 groups 배열에 담습니다.
- groups[].header: 입력 헤더 원문(이모지 포함). 입력에 붙은 "(N건)" 주석은 제거합니다.
- groups[].expectedCount: 해당 그룹의 입력 항목(\`* \`) 수.
- groups[].bullets: 입력 항목 1개 = 배열 원소 1개. 절대 묶거나 합치지 않습니다(묶음 = 정보 손실). 항목이 1개뿐인 그룹도 원소 1개.

각 bullet 작성 — 사용자 체감 결과 관점으로 풀어쓰기(commit 톤 금지):
- commit subject의 기술 토큰(컴포넌트명·함수명·prop명·영문 약어·내부 식별자)을 비개발자가 이해할 한국어로 바꿉니다.
  - DateRangePicker → 날짜 범위 선택기 / prop → 옵션 / alert·confirm → 알림창·확인창
- "그 변경으로 사용자가 무엇을 체감하는가" 관점의 1문장으로 다시 씁니다.
- 문말만 정중체로 바꾸는 최소 변환(~ 수정 → ~ 수정되었습니다)은 실패입니다. 표현·관점 변환은 환각이 아니며, 원본의 사실(기능·이름·숫자·이유)을 보존한 변환은 항상 허용됩니다.
- 다음만 영문 그대로 둡니다: ① 제품·외부 서비스 고유명사(NestJS, Sentry, Datadog 등) ② 사내 정착 약어(API, JWT, CSV 등).
  짧은 영문 단어(next, axios, nest, prisma, vite, turbo 등)는 라이브러리·프레임워크 이름일 가능성이 높습니다. 정체가 불확실해도 보존하고 "소프트웨어"·"라이브러리"로 추상화하지 않습니다.
- bullet 한 줄은 한국어 80자 이내.

━━ [2단계] summaryParagraphs — groups 완성 후에만 작성 ━━
1단계에서 모든 bullet을 채운 뒤에만 본질 요약 문단을 씁니다. 독자가 30초 안에 윤곽을 잡도록 합니다.
요약은 1단계 리스트의 일부를 강조하는 것일 뿐, 리스트에서 항목을 빼는 근거가 아닙니다.
- 임팩트 높음(반드시 명시, 생략 금지): 아키텍처/프레임워크 전환, 인증·보안 체계, 외부 API/파트너 연동, 보안 패치(CVE·취약점), 테넌트 격리·권한 우회 차단. 해당 항목은 개수만큼 모두 별도 문장으로 언급합니다.
- 임팩트 중간(여력 시 1~3개): 데이터 모델·알고리즘 변경, 호환성 영향, 사용자 직면 버그 수정, 운영/관측 개선.
- 본질 문단에서 제외(언급 안 함, 단 groups에는 이미 포함): 비-보안 의존성 패치, 릴리즈 자동화·CI/CD, 테스트 인프라.
- summaryParagraphs는 주제 단위 배열. 임팩트 높음 1~2개면 1원소, 3~4개면 2원소, 5개 이상이면 3원소. 한 문장 60자 이내.

[엄수]
- 환각 금지: 입력에 없는 기능·고유명사·숫자·날짜·번호·기술명·이유를 추가하지 않습니다.
- 커밋 해시, PR/이슈 번호, commit subject 원문을 그대로 인용하지 않습니다.
- 이모지를 새로 추가하지 않습니다.`;

export const buildUserPrompt = (tag, totalItems, annotatedBody) =>
  `git tag: ${tag}
총 항목 수: ${totalItems}

아래 릴리즈 노트의 모든 항목을 하나도 빠짐없이 변환하세요.
각 그룹의 bullets 수는 그 그룹의 입력 항목 수와 정확히 일치해야 합니다.

원본 릴리즈 노트:
<release_notes>
${annotatedBody}
</release_notes>`;

// polished JSON을 입력 그룹과 대조한다. 누락·묶음·순서·헤더 불일치를 모두 잡는다.
// 반환: { ok: true } | { ok: false, problems: string[] }
export const verifyPolished = (polished, inputGroups) => {
  const problems = [];

  if (!Array.isArray(polished?.groups)) {
    return { ok: false, problems: ["groups 배열 없음"] };
  }
  if (polished.groups.length !== inputGroups.length) {
    problems.push(
      `그룹 수 불일치: 입력 ${inputGroups.length} vs 출력 ${polished.groups.length}`,
    );
  }

  inputGroups.forEach((input, idx) => {
    const out = polished.groups[idx];
    if (!out) {
      problems.push(`그룹[${idx}] "${input.header}" 출력에서 누락`);
      return;
    }
    const outHeader = normalizeHeaderText(out.header);
    if (outHeader !== input.header) {
      problems.push(
        `그룹[${idx}] 헤더 불일치: 입력 "${input.header}" vs 출력 "${outHeader}"`,
      );
    }
    const bulletCount = Array.isArray(out.bullets) ? out.bullets.length : 0;
    if (bulletCount !== input.count) {
      problems.push(
        `그룹 "${input.header}" 항목 수 불일치: 입력 ${input.count} vs 출력 ${bulletCount}`,
      );
    }
    (out.bullets ?? []).forEach((bullet, bulletIdx) => {
      if (typeof bullet !== "string" || bullet.trim().length === 0) {
        problems.push(`그룹 "${input.header}" bullet[${bulletIdx}] 비어있음`);
      }
    });
  });

  return problems.length ? { ok: false, problems } : { ok: true };
};

// polished JSON을 GitHub Release 본문 마크다운으로 렌더한다.
export const renderPolished = (tag, polished) => {
  const parts = [`## ${tag} 요약`, ""];
  const summary = (polished.summaryParagraphs ?? [])
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (summary.length) {
    parts.push(summary.join("\n\n"), "");
  }
  for (const group of polished.groups) {
    // 모델이 prefix를 빠뜨려도 항상 "### "를 코드가 붙여 일관된 헤더를 보장한다.
    parts.push(`### ${normalizeHeaderText(group.header)}`);
    for (const bullet of group.bullets ?? []) {
      parts.push(`- ${bullet}`);
    }
    parts.push("");
  }
  return parts.join("\n").trim();
};

// OpenAI Responses API + Structured Outputs(strict) 1회 호출.
// fetchImpl 주입으로 테스트 가능. 성공 시 파싱된 JSON 객체 반환, 실패 시 throw.
export const callPolish = async ({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  maxOutputTokens,
  fetchImpl = fetch,
  timeoutMs = 180_000,
}) => {
  const res = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens: maxOutputTokens,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "polished_release_notes",
          strict: true,
          schema: POLISH_SCHEMA,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`API ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.status === "incomplete") {
    throw new Error(`incomplete: ${data.incomplete_details?.reason ?? "unknown"}`);
  }

  const raw =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      ?.filter((c) => c.type === "output_text")
      ?.map((c) => c.text)
      ?.join("") ??
    "";
  if (!raw) throw new Error("빈 응답");
  return JSON.parse(raw);
};

// 1차 호출 → 검증 실패 시 problems 주입 1회 재시도 → 그래도 실패면 null(폴백 신호).
export const polishWithVerification = async ({
  apiKey,
  model,
  inputGroups,
  baseUserPrompt,
  maxOutputTokens,
  maxOutputTokensCap = 12_000,
  systemPrompt = buildSystemPrompt(),
  fetchImpl = fetch,
  log = console,
}) => {
  let userPrompt = baseUserPrompt;
  let tokens = maxOutputTokens;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let polished;
    try {
      polished = await callPolish({
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxOutputTokens: tokens,
        fetchImpl,
      });
    } catch (err) {
      log.warn?.(`[polish] attempt ${attempt} 실패: ${err.message}`);
      // 토큰 부족(incomplete)일 수 있으니 재시도 시 상한을 키운다.
      tokens = Math.min(Math.ceil(tokens * 1.5), maxOutputTokensCap);
      continue;
    }

    const result = verifyPolished(polished, inputGroups);
    if (result.ok) {
      log.log?.(`[polish] 검증 통과 (attempt ${attempt}).`);
      return polished;
    }

    log.warn?.(
      `[polish] attempt ${attempt} 검증 실패:\n` +
        result.problems.map((p) => `  - ${p}`).join("\n"),
    );

    if (attempt === 2) break;

    userPrompt =
      baseUserPrompt +
      `\n\n[직전 출력이 아래 문제로 검증에 실패했습니다. 모두 교정해 다시 출력하세요. ` +
      `각 그룹의 bullets 수는 입력 항목 수와 정확히 일치해야 하며, 묶거나 빠뜨리지 마세요.]\n` +
      result.problems.map((p) => `- ${p}`).join("\n");
    tokens = Math.min(Math.ceil(tokens * 1.5), maxOutputTokensCap);
  }

  return null;
};
