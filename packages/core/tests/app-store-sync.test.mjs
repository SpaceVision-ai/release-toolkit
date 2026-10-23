// packages/core/tests/app-store-sync.test.mjs
import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { judge, cycleFacts, signJwt, iosReleasedBuild } from "../scripts/app-store-sync.mjs";

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

describe("signJwt", () => {
  it("ES256 서명은 64바이트(ieee-p1363)이고 헤더·페이로드가 그대로 들어간다", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const jwt = signJwt({ alg: "ES256", kid: "K" }, { iss: "I" }, pem);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url"))).toEqual({ alg: "ES256", kid: "K", typ: "JWT" });
    expect(JSON.parse(Buffer.from(p, "base64url"))).toEqual({ iss: "I" });
    expect(Buffer.from(s, "base64url")).toHaveLength(64);
  });

  it("RS256 서명은 공개키로 검증된다", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const jwt = signJwt({ alg: "RS256" }, { a: 1 }, pem);
    const [h, p, s] = jwt.split(".");
    const v = createVerify("RSA-SHA256").update(`${h}.${p}`);
    expect(v.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
});

describe("review fixes", () => {
  it("judge: 빌드 번호를 숫자로 못 읽으면 원문을 담아 경고", () => {
    const r = judge({ ios: "48a", android: 48, tags });
    expect(r).toEqual({ action: "warn", reason: "스토어 빌드 번호를 숫자로 읽지 못했습니다 (iOS 48a, Android 48)" });
  });

  it("judge: 문자열 빌드 번호도 숫자로 읽는다", () => {
    expect(judge({ ios: "48", android: 48, tags })).toEqual({ action: "publish", version: "1.5.0", build: 48 });
  });

  it("cycleFacts: -start가 없으면 그 버전 줄 전체를 쓴다", () => {
    const dates = { "1.4.0.29": "2026-09-20", "1.4.0.30-end": "2026-09-23" };
    const facts = cycleFacts({
      version: "1.4.0", build: 30, tags: [...tags, "1.4.0.29"], tagDate: (t) => dates[t], fixes: 0, today: "2026-10-28",
    });
    expect(facts).toEqual({ build: 30, startedAt: "2026-09-20", endedAt: "2026-09-23", releasedAt: "2026-10-28", testBuilds: 2, fixes: 0 });
  });

  it("iosReleasedBuild: appStoreState가 400이면 appVersionState로 한 번 다시 묻는다", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const urls = [];
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => "bad filter" });
    const fetchImpl = async (url) => {
      urls.push(url);
      if (url.includes("/apps?")) return json(200, { data: [{ id: "A1" }] });
      if (url.includes("appStoreState")) return json(400, {});
      return json(200, { included: [{ type: "builds", attributes: { version: "47" } }] });
    };
    const build = await iosReleasedBuild({ keyId: "K", issuerId: "I", privateKey: pem, bundleId: "b", fetchImpl });
    expect(build).toBe("47");
    expect(urls.filter((u) => u.includes("appStoreVersions"))).toEqual([
      expect.stringContaining("filter[appStoreState]=READY_FOR_SALE"),
      expect.stringContaining("filter[appVersionState]=READY_FOR_DISTRIBUTION"),
    ]);
  });
});
