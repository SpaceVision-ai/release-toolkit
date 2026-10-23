// packages/core/tests/app-store-sync.test.mjs
import { describe, it, expect } from "vitest";
import { judge, cycleFacts } from "../scripts/app-store-sync.mjs";

const tags = ["1.4.0", "1.4.0.30-end", "1.5.0", "1.5.0.45-start", "1.5.0.46", "1.5.0.48", "1.5.0.48-end"];

describe("judge", () => {
  it("두 플랫폼이 같은 빌드면 그 빌드의 버전을 공개 대상으로", () => {
    expect(judge({ ios: 48, android: 48, tags })).toEqual({ action: "publish", version: "1.5.0", build: 48 });
  });
  it("빌드가 다르면 공개하지 않고 경고", () => {
    expect(judge({ ios: 48, android: 46, tags })).toMatchObject({ action: "warn" });
  });
  it("한쪽만 조회되면 대기", () => {
    expect(judge({ ios: 48, android: null, tags })).toMatchObject({ action: "wait" });
  });
  it("태그에 없는 빌드면 경고", () => {
    expect(judge({ ios: 99, android: 99, tags })).toMatchObject({ action: "warn" });
  });
  it("출시된 빌드가 -end 최종 빌드와 다르면 공개하되 경고를 단다", () => {
    expect(judge({ ios: 46, android: 46, tags })).toEqual({
      action: "publish", version: "1.5.0", build: 46, note: "출시된 빌드 46이 최종 빌드 48과 다릅니다",
    });
  });
});

describe("cycleFacts", () => {
  it("마지막 회차의 시작~종료 태그로 사이클 정보를 만든다", () => {
    const dates = { "1.5.0.45-start": "2026-10-24", "1.5.0.48-end": "2026-10-27" };
    expect(
      cycleFacts({ version: "1.5.0", build: 48, tags, tagDate: (t) => dates[t], fixes: 2, today: "2026-10-28" }),
    ).toEqual({ build: 48, startedAt: "2026-10-24", endedAt: "2026-10-27", releasedAt: "2026-10-28", testBuilds: 3, fixes: 2 });
  });
});
