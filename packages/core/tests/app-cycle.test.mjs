import { describe, it, expect } from "vitest";
import { decide, gate, mainState } from "../scripts/app-cycle.mjs";

// 태그 → 커밋. head는 기본 "H".
const base = (over = {}) => ({
  ref: "main",
  bump: "skip",
  complete: false,
  head: "H",
  buildNumber: 50,
  tags: ["1.4.0", "1.4.0.30-end"],
  releaseStates: { "1.4.0": "published" },
  commitOf: (t) => ({ "1.4.0": "R", "1.4.0.30-end": "R" })[t],
  ...over,
});

describe("decide — 사이클 닫힘", () => {
  it("출시 완료 뒤 버전을 올리면 테스트 시작", () => {
    expect(decide(base({ bump: "minor" }))).toEqual({
      stage: "start",
      version: "1.5.0",
      buildTag: "1.5.0.50-start",
      build: true,
      startRef: "H",
      finalRef: "H",
      fromRef: "1.4.0",
    });
  });

  it("출시 완료 뒤 skip이면 실패 — 출시된 버전은 다시 못 씀", () => {
    expect(decide(base()).stage).toBe("fail");
  });

  it("완료 체크로 시작하면 실패", () => {
    expect(decide(base({ bump: "minor", complete: true })).stage).toBe("fail");
  });

  it("출시 대기(프리릴리즈)면 skip으로 같은 버전 재테스트", () => {
    const r = decide(
      base({
        tags: ["1.4.0", "1.5.0", "1.5.0.45-start", "1.5.0.45-end"],
        releaseStates: { "1.4.0": "published", "1.5.0": "prerelease" },
        commitOf: () => "R",
      }),
    );
    expect(r).toMatchObject({ stage: "start", version: "1.5.0", buildTag: "1.5.0.50-start", fromRef: "1.4.0" });
  });

  it("출시 대기 중 버전을 올리면 실패", () => {
    const r = decide(
      base({
        bump: "minor",
        tags: ["1.4.0", "1.5.0", "1.5.0.45-start", "1.5.0.45-end"],
        releaseStates: { "1.4.0": "published", "1.5.0": "prerelease" },
        commitOf: () => "R",
      }),
    );
    expect(r.stage).toBe("fail");
  });

  it("올린 버전이 이미 공개된 릴리즈면 실패 (머지 전 공개된 핫픽스와 겹침)", () => {
    const r = decide(base({ bump: "patch", releaseStates: { "1.4.0": "published", "1.4.1": "published" } }));
    expect(r.stage).toBe("fail");
  });

  it("main·hotfix/* 이외 ref는 실패", () => {
    expect(decide(base({ ref: "develop", bump: "minor" })).stage).toBe("fail");
  });
});

describe("decide — 사이클 열림", () => {
  const open = (over) =>
    base({
      tags: ["1.4.0", "1.4.0.30-end", "1.5.0.45-start", "1.5.0.46"],
      commitOf: (t) => ({ "1.4.0": "R", "1.4.0.30-end": "R", "1.5.0.45-start": "S", "1.5.0.46": "M" })[t],
      ...over,
    });

  it("바뀐 게 있고 체크 없으면 중간 빌드", () => {
    expect(decide(open())).toEqual({
      stage: "mid", version: "1.5.0", buildTag: "1.5.0.50", build: true,
      startRef: "S", finalRef: "H", fromRef: "1.4.0",
    });
  });

  it("바뀐 게 없고 체크 없으면 실패", () => {
    expect(decide(open({ head: "M" })).stage).toBe("fail");
  });

  it("바뀐 게 있고 체크하면 빌드하며 종료", () => {
    expect(decide(open({ complete: true }))).toMatchObject({
      stage: "end", buildTag: "1.5.0.50-end", build: true, finalRef: "H",
    });
  });

  it("바뀐 게 없고 체크하면 빌드 없이 마지막 빌드 번호로 종료", () => {
    expect(decide(open({ complete: true, head: "M" }))).toMatchObject({
      stage: "end", buildTag: "1.5.0.46-end", build: false, finalRef: "M",
    });
  });

  it("사이클 중 버전 올림을 고르면 실패", () => {
    expect(decide(open({ bump: "patch" })).stage).toBe("fail");
  });

  it("핫픽스 태그가 main에 섞여도 가장 높은 버전 줄기로 판별한다", () => {
    const r = decide(
      open({
        tags: ["1.4.0", "1.5.0", "1.5.1", "1.5.1.60-end", "1.6.0.55-start"],
        releaseStates: { "1.4.0": "published", "1.5.0": "published", "1.5.1": "published" },
        commitOf: (t) => ({ "1.6.0.55-start": "S", "1.5.1.60-end": "F" })[t] ?? "R",
      }),
    );
    expect(r).toMatchObject({ stage: "mid", version: "1.6.0", fromRef: "1.5.1" });
  });
});

describe("decide — 핫픽스", () => {
  it("출시된 최신 릴리즈 + patch로 시작, 버전 올림 입력은 skip이어야 함", () => {
    const r = decide(
      base({
        ref: "hotfix/login",
        tags: ["1.4.0", "1.5.0", "1.5.0.48-end"],
        releaseStates: { "1.4.0": "published", "1.5.0": "published" },
        commitOf: () => "R",
      }),
    );
    expect(r).toMatchObject({ stage: "start", version: "1.5.1", buildTag: "1.5.1.50-start", fromRef: "1.5.0" });
  });

  it("핫픽스에서 버전 올림을 고르면 실패", () => {
    const r = decide(base({ ref: "hotfix/x", bump: "minor" }));
    expect(r.stage).toBe("fail");
  });
});

describe("mainState", () => {
  const rs = { "1.4.0": "published", "1.5.0": "prerelease" };
  it("열린 사이클이면 testing", () => {
    expect(mainState(["1.4.0", "1.5.0.45-start"], rs)).toBe("testing");
  });
  it("종료됐고 프리릴리즈면 waiting", () => {
    expect(mainState(["1.4.0", "1.5.0", "1.5.0.45-start", "1.5.0.45-end"], rs)).toBe("waiting");
  });
  it("공개됐으면 released", () => {
    expect(mainState(["1.4.0", "1.4.0.30-end"], rs)).toBe("released");
  });
});

describe("gate", () => {
  const g = (state, head, extra = {}) =>
    gate({ state, headRef: head, hasDevelopOnlyCommits: false, hotfixEnded: false, ...extra });

  it("released에서만 develop 허용", () => {
    expect(g("released", "develop").allow).toBe(true);
    expect(g("testing", "develop").allow).toBe(false);
    expect(g("waiting", "develop").allow).toBe(false);
  });
  it("fix/는 testing·waiting에서 main 분기일 때만", () => {
    expect(g("testing", "fix/a").allow).toBe(true);
    expect(g("waiting", "fix/a").allow).toBe(true);
    expect(g("released", "fix/a").allow).toBe(false);
    expect(g("testing", "fix/a", { hasDevelopOnlyCommits: true }).allow).toBe(false);
  });
  it("hotfix/는 그 가지의 -end가 있을 때만, 상태 무관", () => {
    expect(g("testing", "hotfix/a", { hotfixEnded: true }).allow).toBe(true);
    expect(g("released", "hotfix/a").allow).toBe(false);
  });
  it("그 밖의 브랜치는 거부", () => {
    expect(g("released", "feat/x").allow).toBe(false);
  });
});
