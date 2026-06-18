import { describe, it, expect, vi } from "vitest";
import {
  annotateGroupCounts,
  callPolish,
  countItems,
  normalizeHeaderText,
  parseInputGroups,
  polishWithVerification,
  renderPolished,
  verifyPolished,
} from "../scripts/polish-core.mjs";

// 신규 2 + 버그수정 3 그룹의 결정론 changelog 픽스처.
const SAMPLE_NOTES = `## [1.10.0]

### ✨ 신규 기능

* DateRangePicker 재작성 ([aaa](url))
* useHolidays 훅 추가 ([bbb](url))

### 🐛 버그 수정

* totalCount null 에러 수정 ([ccc](url))
* 404 처리 누락 수정 ([ddd](url))
* 권한 가드 깜빡임 수정 ([eee](url))`;

const validPolished = () => ({
  groups: [
    {
      header: "### ✨ 신규 기능",
      expectedCount: 2,
      bullets: ["날짜 범위 선택기를 새로 만들었습니다", "공휴일 조회 기능을 추가했습니다"],
    },
    {
      header: "### 🐛 버그 수정",
      expectedCount: 3,
      bullets: ["총 개수 오류 수정", "없는 페이지 404 처리", "권한 화면 깜빡임 수정"],
    },
  ],
  summaryParagraphs: ["이번 릴리즈는 날짜 선택기 개선이 중심입니다."],
});

describe("parseInputGroups", () => {
  it("그룹별 실제 항목 수를 등장 순서대로 세고 헤더는 정규형으로 저장한다", () => {
    const groups = parseInputGroups(SAMPLE_NOTES);
    expect(groups).toEqual([
      { header: "✨ 신규 기능", count: 2 },
      { header: "🐛 버그 수정", count: 3 },
    ]);
  });

  it("주입된 (N건) 주석과 무관하게 실제 * 항목 수를 센다", () => {
    const annotated = annotateGroupCounts(SAMPLE_NOTES);
    const groups = parseInputGroups(annotated);
    expect(groups.map((g) => g.count)).toEqual([2, 3]);
    expect(groups[0].header).toBe("✨ 신규 기능");
  });
});

describe("countItems", () => {
  it("전체 * 항목 수를 센다", () => {
    expect(countItems(SAMPLE_NOTES)).toBe(5);
  });
});

describe("normalizeHeaderText", () => {
  it('"### " prefix와 "(N건)" 주석을 모두 제거한다', () => {
    expect(normalizeHeaderText("### ✨ 신규 기능 (12건)")).toBe("✨ 신규 기능");
  });

  it("prefix 유무와 무관하게 동일한 정규형을 만든다", () => {
    expect(normalizeHeaderText("### 🐛 버그 수정")).toBe(normalizeHeaderText("🐛 버그 수정"));
  });
});

describe("verifyPolished", () => {
  it("모든 그룹 항목 수가 일치하면 통과한다", () => {
    expect(verifyPolished(validPolished(), parseInputGroups(SAMPLE_NOTES))).toEqual({
      ok: true,
    });
  });

  // 회귀: 74→15 압축 같은 항목 수 붕괴를 잡는다(이번 버그의 핵심 가드).
  it("그룹 항목 수가 압축되면 실패하고 입력/출력 수를 보고한다", () => {
    const lossy = validPolished();
    lossy.groups[1].bullets = ["총 개수 오류 수정"]; // 3 → 1로 붕괴
    const result = verifyPolished(lossy, parseInputGroups(SAMPLE_NOTES));
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("입력 3 vs 출력 1"))).toBe(true);
  });

  it("그룹 자체가 누락되면 실패한다", () => {
    const dropped = validPolished();
    dropped.groups = [dropped.groups[0]]; // 버그 수정 그룹 통째로 누락
    const result = verifyPolished(dropped, parseInputGroups(SAMPLE_NOTES));
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("그룹 수 불일치"))).toBe(true);
  });

  // 회귀: 모델이 header에 "### " prefix를 빠뜨려도(실측된 케이스) 헤더 불일치로 실패하지 않는다.
  it("헤더 prefix 유무는 검증에 영향을 주지 않는다", () => {
    const noPrefix = validPolished();
    noPrefix.groups[0].header = "✨ 신규 기능";
    noPrefix.groups[1].header = "🐛 버그 수정";
    expect(verifyPolished(noPrefix, parseInputGroups(SAMPLE_NOTES)).ok).toBe(true);
  });

  it("그룹 헤더가 어긋나면 실패한다", () => {
    const wrong = validPolished();
    wrong.groups[0].header = "### 🚀 엉뚱한 헤더";
    const result = verifyPolished(wrong, parseInputGroups(SAMPLE_NOTES));
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("헤더 불일치"))).toBe(true);
  });

  it("빈 bullet이 있으면 실패한다", () => {
    const empty = validPolished();
    empty.groups[0].bullets = ["날짜 범위 선택기를 새로 만들었습니다", "  "];
    const result = verifyPolished(empty, parseInputGroups(SAMPLE_NOTES));
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("비어있음"))).toBe(true);
  });

  it("groups가 배열이 아니면 실패한다", () => {
    expect(verifyPolished({}, parseInputGroups(SAMPLE_NOTES)).ok).toBe(false);
  });
});

describe("renderPolished", () => {
  it("JSON을 헤더 + - bullet 마크다운으로 렌더한다", () => {
    const md = renderPolished("1.10.0", validPolished());
    expect(md).toContain("## 1.10.0 요약");
    expect(md).toContain("이번 릴리즈는 날짜 선택기 개선이 중심입니다.");
    expect(md).toContain("### ✨ 신규 기능");
    expect(md).toContain("- 날짜 범위 선택기를 새로 만들었습니다");
    // 입력 항목 수(5)만큼 - bullet이 렌더되어야 한다.
    expect((md.match(/^- /gm) ?? []).length).toBe(5);
  });

  it("헤더의 (N건) 주석을 제거해 렌더한다", () => {
    const withCount = validPolished();
    withCount.groups[0].header = "### ✨ 신규 기능 (2건)";
    expect(renderPolished("1.10.0", withCount)).toContain("### ✨ 신규 기능\n");
  });
});

describe("polishWithVerification", () => {
  const inputGroups = parseInputGroups(SAMPLE_NOTES);
  const okResponse = (json) => ({
    ok: true,
    json: async () => ({ output_text: JSON.stringify(json) }),
  });

  it("1차 응답이 검증을 통과하면 그대로 반환한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(validPolished()));
    const result = await polishWithVerification({
      apiKey: "k",
      model: "gpt-5.4",
      inputGroups,
      baseUserPrompt: "u",
      maxOutputTokens: 8000,
      fetchImpl,
      log: { warn: () => {}, log: () => {} },
    });
    expect(result).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("1차 손실 → 피드백 재시도가 통과하면 반환한다", async () => {
    const lossy = validPolished();
    lossy.groups[1].bullets = ["총 개수 오류 수정"]; // 검증 실패 유도
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okResponse(lossy))
      .mockResolvedValueOnce(okResponse(validPolished()));
    const result = await polishWithVerification({
      apiKey: "k",
      model: "gpt-5.4",
      inputGroups,
      baseUserPrompt: "u",
      maxOutputTokens: 8000,
      fetchImpl,
      log: { warn: () => {}, log: () => {} },
    });
    expect(result).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("2회 모두 검증 실패하면 null(폴백 신호)을 반환한다", async () => {
    const lossy = validPolished();
    lossy.groups[1].bullets = ["총 개수 오류 수정"];
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(lossy));
    const result = await polishWithVerification({
      apiKey: "k",
      model: "gpt-5.4",
      inputGroups,
      baseUserPrompt: "u",
      maxOutputTokens: 8000,
      fetchImpl,
      log: { warn: () => {}, log: () => {} },
    });
    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("callPolish", () => {
  it("Responses API 형식으로 요청하고 파싱된 JSON을 반환한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: '{"groups":[],"summaryParagraphs":[]}' }),
    });
    const result = await callPolish({
      apiKey: "k",
      model: "gpt-5.4",
      systemPrompt: "s",
      userPrompt: "u",
      maxOutputTokens: 8000,
      fetchImpl,
    });
    expect(result).toEqual({ groups: [], summaryParagraphs: [] });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("gpt-5.4");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
  });

  it("응답이 incomplete면 throw 한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
    });
    await expect(
      callPolish({ apiKey: "k", model: "m", systemPrompt: "s", userPrompt: "u", maxOutputTokens: 100, fetchImpl }),
    ).rejects.toThrow(/incomplete/);
  });
});
