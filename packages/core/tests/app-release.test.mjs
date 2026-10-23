// packages/core/tests/app-release.test.mjs
import { describe, it, expect } from "vitest";
import { startRelease, endRelease, publishRelease, withFixes, factsBlock } from "../scripts/app-release.mjs";

// 호출을 기록하고, 정해 둔 응답을 돌려주는 가짜 실행기
const fakeRun = (responses = {}) => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    const key = Object.keys(responses).find((k) => [cmd, ...args].join(" ").startsWith(k));
    const v = key ? responses[key] : "";
    if (v instanceof Error) throw v;
    return v;
  };
  return { run, calls };
};

const ctx = (over = {}) => ({
  repo: "o/r",
  version: "1.5.0",
  fromRef: "1.4.0",
  startRef: "S",
  finalRef: "F",
  ref: "main",
  polish: (version, raw) => `## ${version} 요약\n\n${raw}`,
  writeFile: () => "/tmp/body.md",
  ...over,
});

describe("startRelease", () => {
  it("범위에 커밋이 없으면 AI에 보내지 않고 '변경 사항 없음'을 쓴다", () => {
    const { run } = fakeRun({ "git log": "", "gh release view 1.5.0": new Error("not found") });
    let polished = 0;
    let written = "";
    startRelease(ctx({ run, polish: () => { polished++; return "x"; }, writeFile: (t) => { written = t; return "/tmp/body.md"; } }));
    expect(polished).toBe(0);
    expect(written.startsWith("변경 사항 없음")).toBe(true);
  });

  it("릴리즈가 없으면 초안을 만든다", () => {
    const { run, calls } = fakeRun({
      "git log 1.4.0..S": "aaaaaaa1\tfeat: 기능\n",
      "gh release view 1.5.0": new Error("release not found"),
    });
    startRelease(ctx({ run }));
    expect(calls.at(-1)).toBe(
      "gh release create 1.5.0 -R o/r --draft --title 1.5.0 --target S --notes-file /tmp/body.md",
    );
  });

  it("이미 있으면(재테스트) 본문만 고친다", () => {
    const { run, calls } = fakeRun({
      "git log 1.4.0..S": "aaaaaaa1\tfeat: 기능\n",
      "gh release view 1.5.0": '{"isDraft":false}',
    });
    startRelease(ctx({ run }));
    expect(calls.at(-1)).toBe("gh release edit 1.5.0 -R o/r --notes-file /tmp/body.md");
  });
});

describe("withFixes", () => {
  it("이전 '테스트 중 수정' 절을 지우고 새로 붙인다", () => {
    const body = "요약\n\n## 테스트 중 수정\n\n- 옛것";
    expect(withFixes(body, "- 새것")).toBe("요약\n\n## 테스트 중 수정\n\n- 새것");
  });
  it("수정이 없으면 '없음'", () => {
    expect(withFixes("요약", "")).toBe("요약\n\n## 테스트 중 수정\n\n없음");
  });
});

describe("endRelease", () => {
  it("태그를 최종 커밋에 찍고 프리릴리즈로 바꾸고 develop에 백머지한다", () => {
    const { run, calls } = fakeRun({
      "gh release view 1.5.0": '{"body":"요약"}',
      "git log S..F": "",
      "git ls-remote": "",
    });
    endRelease(ctx({ run }));
    expect(calls).toEqual(expect.arrayContaining([
      "git tag -f 1.5.0 F",
      "git push origin refs/tags/1.5.0",
      "gh release edit 1.5.0 -R o/r --tag 1.5.0 --draft=false --prerelease --notes-file /tmp/body.md",
      "git merge --no-ff origin/main -m chore: main 백머지 (1.5.0)",
      "git push origin HEAD:develop",
    ]));
  });

  it("재테스트라 원격 태그가 이미 있으면 먼저 지운다", () => {
    const { run, calls } = fakeRun({
      "gh release view 1.5.0": '{"body":"요약"}',
      "git ls-remote": "abc\trefs/tags/1.5.0\n",
    });
    endRelease(ctx({ run }));
    expect(calls.indexOf("git push origin :refs/tags/1.5.0")).toBeLessThan(
      calls.indexOf("git push origin refs/tags/1.5.0"),
    );
  });

  it("백머지가 충돌하면 중단하고 PR을 만든다", () => {
    const { run, calls } = fakeRun({
      "gh release view 1.5.0": '{"body":"요약"}',
      "git merge --no-ff": new Error("CONFLICT"),
    });
    const result = endRelease(ctx({ run }));
    expect(calls).toContain("git merge --abort");
    expect(calls).toContain("git push origin +origin/main:refs/heads/chore/backmerge-1.5.0");
    expect(calls).toContain("gh pr create -R o/r --base develop --head chore/backmerge-1.5.0 --title chore: main 백머지 (1.5.0) --body 테스트 종료 백머지에서 충돌이 나 PR로 올립니다.");
    expect(result.backMerge).toBe("pr");
  });

  it("핫픽스는 main·develop으로 PR을 만든다", () => {
    const { run, calls } = fakeRun({ "gh release view 1.5.1": '{"body":"요약"}' });
    endRelease(ctx({ run, version: "1.5.1", ref: "hotfix/login" }));
    expect(calls.filter((c) => c.startsWith("gh pr create"))).toHaveLength(2);
  });
});

describe("publishRelease", () => {
  it("본문이 null이어도 'null' 글자가 들어가지 않는다", () => {
    const { run } = fakeRun({ "gh release view 1.5.0": '{"body":null,"isPrerelease":true}' });
    let written = "";
    publishRelease(ctx({ run, facts: { build: 48 }, writeFile: (t) => { written = t; return "/tmp/body.md"; } }));
    expect(written).not.toContain("null");
  });

  it("사이클 정보를 앞에 붙이고 공개한다", () => {
    const { run, calls } = fakeRun({ "gh release view 1.5.0": '{"body":"요약","isPrerelease":true}' });
    publishRelease(ctx({ run, facts: { build: 48, startedAt: "2026-10-24", endedAt: "2026-10-27", releasedAt: "2026-10-28", testBuilds: 3, fixes: 2 } }));
    expect(calls.at(-1)).toBe(
      "gh release edit 1.5.0 -R o/r --draft=false --prerelease=false --latest --title 1.5.0 · 빌드 48 --notes-file /tmp/body.md",
    );
  });

  it("이미 공개됐으면 아무것도 안 한다", () => {
    const { run, calls } = fakeRun({ "gh release view 1.5.0": '{"body":"요약","isPrerelease":false,"isDraft":false}' });
    publishRelease(ctx({ run, facts: { build: 48 } }));
    expect(calls.some((c) => c.startsWith("gh release edit"))).toBe(false);
  });
});

describe("factsBlock", () => {
  it("사이클 정보를 표로 만든다", () => {
    expect(factsBlock({ build: 48, startedAt: "a", endedAt: "b", releasedAt: "c", testBuilds: 3, fixes: 2 })).toContain("| 출시 빌드 | 48 |");
  });
});
