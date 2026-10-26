import { describe, it, expect } from "vitest";
import { classifyDevelopSinceEnd, decide, gate, hotfixEndedAt, mainState } from "../scripts/app-cycle.mjs";

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
  allTags: undefined,
  developSinceEnd: () => false,
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

  const pending = {
    tags: ["1.4.0", "1.4.0.30-end", "1.5.0.40-start", "1.5.0.41-end"],
    releaseStates: { "1.4.0": "published", "1.5.0": "prerelease" },
    commitOf: (t) => ({ "1.4.0": "R", "1.4.0.30-end": "R", "1.5.0.40-start": "S", "1.5.0.41-end": "E" })[t],
  };
  it("공개 전 버전이 -end됐으면 버전을 올려 다음 테스트를 바로 시작한다", () => {
    const r = decide(base({ ...pending, bump: "minor" }));
    expect(r).toMatchObject({ stage: "start", version: "1.6.0", buildTag: "1.6.0.50-start", fromRef: "1.4.0" });
  });
  it("공개 전 버전은 -end 뒤 develop이 없으면 skip으로 같은 버전 재테스트", () => {
    const r = decide(base({ ...pending }));
    expect(r).toMatchObject({ stage: "start", version: "1.5.0", buildTag: "1.5.0.50-start" });
  });
  it("-end 뒤 develop이 들어왔으면 skip은 실패 — 버전을 올려야 한다", () => {
    const r = decide(base({ ...pending, developSinceEnd: () => true }));
    expect(r.stage).toBe("fail");
    expect(r.message).toContain("1.5.0");
  });
  it("skip 판정은 마지막 -end 커밋을 기준으로 develop 여부를 본다", () => {
    let seen = null;
    decide(base({ ...pending, developSinceEnd: (c) => { seen = c; return false; } }));
    expect(seen).toBe("E");
  });
  it("skip 판정 때만 develop 여부를 본다 (버전 올림은 보지 않는다)", () => {
    let called = false;
    decide(base({ ...pending, bump: "minor", developSinceEnd: () => { called = true; return true; } }));
    expect(called).toBe(false);
  });
  it("올린 버전에 어디든 빌드 태그가 있으면 실패 — 머지 전 핫픽스와 겹침", () => {
    const r = decide(base({ bump: "patch", allTags: ["1.4.0", "1.4.0.30-end", "1.4.1.45-start"] }));
    expect(r.stage).toBe("fail");
    expect(r.message).toContain("1.4.1");
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

  it("열린 줄기에 -start가 없으면 멈추지 않고 실패로 알린다", () => {
    const r = decide(open({ tags: ["1.4.0", "1.4.0.30-end", "1.5.0.46"], commitOf: () => "M" }));
    expect(r).toEqual({ stage: "fail", message: "진행 중인 사이클에 -start 태그가 없습니다" });
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

  it("공개 전 main 버전(1.4.1)과 겹치지 않게 1.4.2로 시작한다", () => {
    const r = decide(base({
      ref: "hotfix/a",
      tags: ["1.4.0", "1.4.0.30-end"],
      allTags: ["1.4.0", "1.4.0.30-end", "1.4.1.40-start", "1.4.1.41-end"],
      releaseStates: { "1.4.0": "published", "1.4.1": "prerelease" },
    }));
    expect(r).toMatchObject({ stage: "start", version: "1.4.2", buildTag: "1.4.2.50-start" });
  });

  it("자기 가지의 태그 때문에 버전이 밀리지 않는다", () => {
    const own = ["1.4.0", "1.4.0.30-end", "1.4.2.50-start"];
    const r = decide(base({
      ref: "hotfix/a",
      head: "H2",
      tags: own,
      allTags: [...own, "1.4.1.40-start", "1.4.1.41-end"],
      releaseStates: { "1.4.0": "published", "1.4.1": "prerelease" },
      commitOf: (t) => ({ "1.4.2.50-start": "H" })[t] ?? "R",
    }));
    expect(r).toMatchObject({ stage: "mid", version: "1.4.2" });
  });

  it("핫픽스에서 버전 올림을 고르면 실패", () => {
    const r = decide(base({ ref: "hotfix/x", bump: "minor" }));
    expect(r.stage).toBe("fail");
  });
});

describe("mainState", () => {
  const states = { "1.4.0": "published", "1.5.0": "prerelease" };
  it("열린 사이클이면 testing", () => {
    expect(mainState(["1.4.0", "1.4.0.30-end", "1.5.0.40-start"], states)).toBe("testing");
  });
  it("종료됐으면 공개 전이어도 closed (출시 대기 상태는 없다)", () => {
    expect(mainState(["1.4.0", "1.5.0.40-start", "1.5.0.41-end"], states)).toBe("closed");
  });
  it("공개됐으면 closed", () => {
    expect(mainState(["1.4.0", "1.4.0.30-end"], states)).toBe("closed");
  });
});

describe("gate", () => {
  const g = (over) => gate({
    state: "closed", headRef: "develop", hasDevelopOnlyCommits: false, hotfixEnded: false,
    lineUnpublished: false, developSinceEnd: () => false, ...over,
  });
  it("develop은 테스트 중에만 거부, 공개 전이어도 닫혀 있으면 허용", () => {
    expect(g({ state: "testing" }).allow).toBe(false);
    expect(g({ state: "closed", lineUnpublished: true }).allow).toBe(true);
    expect(g({ state: "closed" }).allow).toBe(true);
  });
  it("fix/는 테스트 중이면 허용", () => {
    expect(g({ state: "testing", headRef: "fix/a" }).allow).toBe(true);
  });
  it("fix/는 닫혔어도 줄기 버전이 공개 전이고 -end 뒤 develop이 없으면 허용(재테스트용)", () => {
    expect(g({ headRef: "fix/a", lineUnpublished: true }).allow).toBe(true);
  });
  it("fix/는 -end 뒤 develop이 들어왔으면 거부", () => {
    expect(g({ headRef: "fix/a", lineUnpublished: true, developSinceEnd: () => true }).allow).toBe(false);
  });
  it("fix/는 줄기 버전이 공개됐으면 거부", () => {
    expect(g({ headRef: "fix/a", lineUnpublished: false }).allow).toBe(false);
  });
  it("fix/에 develop에만 있는 커밋이 있으면 거부", () => {
    expect(g({ state: "testing", headRef: "fix/a", hasDevelopOnlyCommits: true }).allow).toBe(false);
  });
  it("hotfix/는 그 가지의 -end가 있을 때만, 상태 무관", () => {
    expect(g({ headRef: "hotfix/a", hotfixEnded: true }).allow).toBe(true);
    expect(g({ state: "testing", headRef: "hotfix/a" }).allow).toBe(false);
  });
  it("그 밖의 브랜치는 거부", () => {
    expect(g({ headRef: "feat/a" }).allow).toBe(false);
  });
});

describe("hotfixEndedAt", () => {
  const commitOf = (t) => ({ "1.5.1.53-start": "A", "1.5.1.54-end": "B" })[t];
  it("-end 태그가 PR head 커밋에 있으면 true", () => {
    expect(hotfixEndedAt(["1.5.1.53-start", "1.5.1.54-end"], "B", commitOf)).toBe(true);
  });
  it("-end 뒤에 커밋이 더 있으면 false", () => {
    expect(hotfixEndedAt(["1.5.1.53-start", "1.5.1.54-end"], "C", commitOf)).toBe(false);
  });
  it("-end가 없으면 false", () => {
    expect(hotfixEndedAt(["1.5.1.53-start"], "A", commitOf)).toBe(false);
  });
});

describe("classifyDevelopSinceEnd", () => {
  it("모든 커밋이 main 대상 fix/ PR에서 왔으면 false", () => {
    expect(classifyDevelopSinceEnd(["a", "b"], () => ["fix/x"])).toBe(false);
  });
  it("develop PR 커밋이 하나라도 있으면 true", () => {
    expect(classifyDevelopSinceEnd(["a", "b"], (c) => (c === "b" ? ["develop"] : ["fix/x"]))).toBe(true);
  });
  it("PR이 연결되지 않은 커밋(직접 push)은 develop으로 본다", () => {
    expect(classifyDevelopSinceEnd(["a"], () => [])).toBe(true);
  });
  it("커밋이 없으면 false", () => {
    expect(classifyDevelopSinceEnd([], () => ["develop"])).toBe(false);
  });
});
