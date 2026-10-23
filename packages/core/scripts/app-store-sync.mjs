// packages/core/scripts/app-store-sync.mjs
// 스토어에 출시된 빌드를 확인해 GitHub 프리릴리즈를 공개할지 정한다.
// 출시 확인 = iOS·Android가 같은 빌드를 출시함 (설계 D9).
import { execFileSync } from "node:child_process";
import { sign } from "node:crypto";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { publishRelease } from "./app-release.mjs";
import { parseCommits, readCommitLines } from "./app-release-notes.mjs";
import { parseTags, sortBuilds } from "./app-version.mjs";

// ios·android는 스토어가 준 원래 값(문자열 또는 숫자). 숫자로 못 읽으면 원문을 그대로 알린다.
export function judge({ ios, android, tags }) {
  if (ios == null || android == null) return { action: "wait", reason: `한쪽만 조회됨 (iOS ${ios ?? "-"}, Android ${android ?? "-"})` };
  const [iosBuild, androidBuild] = [Number(ios), Number(android)];
  if (Number.isNaN(iosBuild) || Number.isNaN(androidBuild))
    return { action: "warn", reason: `스토어 빌드 번호를 숫자로 읽지 못했습니다 (iOS ${ios}, Android ${android})` };
  if (iosBuild !== androidBuild) return { action: "warn", reason: `플랫폼별 출시 빌드가 다릅니다 (iOS ${ios}, Android ${android})` };
  const { builds } = parseTags(tags);
  const hit = builds.find((b) => b.build === iosBuild);
  if (!hit) return { action: "warn", reason: `빌드 ${iosBuild}에 해당하는 빌드 태그가 없습니다` };
  const last = sortBuilds(builds.filter((b) => b.version === hit.version)).at(-1);
  const result = { action: "publish", version: hit.version, build: iosBuild };
  if (last?.kind === "end" && last.build !== iosBuild) result.note = `출시된 빌드 ${iosBuild}이 최종 빌드 ${last.build}과 다릅니다`;
  return result;
}

// 마지막 회차 = 가장 최근 -start부터 그 뒤 -end까지 (출시 전 재테스트가 있었으면 마지막 회차만 센다).
export function cycleFacts({ version, build, tags, tagDate, fixes, today }) {
  const line = sortBuilds(parseTags(tags).builds.filter((b) => b.version === version));
  const startIdx = line.map((b) => b.kind).lastIndexOf("start");
  // -start가 없는 줄(예: 새 체계 이전 기준점 1.4.0.30-end)은 줄 전체를 한 회차로 본다.
  const round = startIdx < 0 ? line : line.slice(startIdx);
  const end = round.find((b) => b.kind === "end");
  return {
    build,
    startedAt: tagDate(round[0].tag),
    endedAt: end ? tagDate(end.tag) : "-",
    releasedAt: today,
    testBuilds: new Set(round.map((b) => b.build)).size,
    fixes,
  };
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

export function signJwt(header, payload, privateKeyPem) {
  const input = `${b64({ ...header, typ: "JWT" })}.${b64(payload)}`;
  const sig =
    header.alg === "ES256"
      ? sign("sha256", Buffer.from(input), { key: privateKeyPem, dsaEncoding: "ieee-p1363" })
      : sign("sha256", Buffer.from(input), privateKeyPem);
  return `${input}.${sig.toString("base64url")}`;
}

const now = () => Math.floor(Date.now() / 1000);

async function getJson(url, init, fetchImpl = fetch) {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    const err = new Error(`${init?.method ?? "GET"} ${url} → ${res.status} ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// App Store: 판매 중 버전에 연결된 빌드 번호(원래 값). 없으면 null.
// appStoreState 필터가 400이면(API 버전 차이) appVersionState로 한 번 다시 묻는다.
export async function iosReleasedBuild({ keyId, issuerId, privateKey, bundleId, fetchImpl = fetch }) {
  const token = signJwt(
    { alg: "ES256", kid: keyId },
    { iss: issuerId, iat: now(), exp: now() + 1200, aud: "appstoreconnect-v1" },
    privateKey,
  );
  const headers = { Authorization: `Bearer ${token}` };
  const base = "https://api.appstoreconnect.apple.com/v1";
  const apps = await getJson(`${base}/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`, { headers }, fetchImpl);
  const appId = apps.data[0]?.id;
  if (!appId) throw new Error(`App Store에 번들 ${bundleId} 앱이 없습니다`);
  const versionsUrl = (filter) => `${base}/apps/${appId}/appStoreVersions?${filter}&include=build&limit=1`;
  let versions;
  try {
    versions = await getJson(versionsUrl("filter[appStoreState]=READY_FOR_SALE"), { headers }, fetchImpl);
  } catch (err) {
    if (err.status !== 400) throw err;
    versions = await getJson(versionsUrl("filter[appVersionState]=READY_FOR_DISTRIBUTION"), { headers }, fetchImpl);
  }
  const build = versions.included?.find((i) => i.type === "builds");
  return build ? build.attributes.version : null;
}

// Play: 프로덕션 트랙에서 완료(completed, 전체 배포)된 출시의 가장 큰 versionCode. 없으면 null.
// 단계적 출시(inProgress)는 출시로 보지 않는다 (2026-10-23 결정).
export async function androidReleasedBuild({ serviceAccountJson, packageName }) {
  const sa = JSON.parse(serviceAccountJson);
  const assertion = signJwt(
    { alg: "RS256" },
    {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now(),
      exp: now() + 1200,
    },
    sa.private_key,
  );
  const { access_token } = await getJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const headers = { Authorization: `Bearer ${access_token}` };
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}`;
  const edit = await getJson(`${base}/edits`, { method: "POST", headers });
  try {
    const track = await getJson(`${base}/edits/${edit.id}/tracks/production`, { headers });
    const codes = (track.releases ?? [])
      .filter((r) => r.status === "completed")
      .flatMap((r) => r.versionCodes ?? [])
      .map(Number);
    return codes.length ? Math.max(...codes) : null;
  } finally {
    await getJson(`${base}/edits/${edit.id}`, { method: "DELETE", headers }).catch(() => {});
  }
}

// ---- CLI ----
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const sh = (cmd, args, opts) => execFileSync(cmd, args, { encoding: "utf-8", ...opts });
  const env = process.env;
  const summary = (line) => env.GITHUB_STEP_SUMMARY && appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);

  const [ios, android] = await Promise.all([
    iosReleasedBuild({ keyId: env.ASC_KEY_ID, issuerId: env.ASC_ISSUER_ID, privateKey: env.ASC_PRIVATE_KEY, bundleId: env.IOS_BUNDLE_ID }),
    androidReleasedBuild({ serviceAccountJson: env.PLAY_SERVICE_ACCOUNT_JSON, packageName: env.ANDROID_PACKAGE }),
  ]);
  const tags = sh("git", ["tag"]).split("\n").filter(Boolean);
  const result = judge({ ios, android, tags });
  summary(`- 출시 빌드: iOS ${ios ?? "-"}, Android ${android ?? "-"}`);

  if (result.action !== "publish") {
    if (result.action === "warn") console.log(`::warning::${result.reason}`);
    summary(`- ${result.reason}`);
    process.exit(0);
  }
  if (result.note) {
    console.log(`::warning::${result.note}`);
    summary(`- ${result.note}`);
  }

  // creatordate는 annotated 태그면 태그 생성 시각, lightweight 태그면 커밋 시각을 준다.
  const tagDate = (t) => sh("git", ["for-each-ref", `refs/tags/${t}`, "--format=%(creatordate:short)"]).trim() || "-";
  const startTag = parseTags(tags).builds
    .filter((b) => b.version === result.version && b.kind === "start")
    .sort((a, b) => a.build - b.build)
    .at(-1);
  const fixes = startTag ? parseCommits(readCommitLines(startTag.tag, result.version, sh)).length : 0;
  const facts = cycleFacts({
    version: result.version,
    build: result.build,
    tags,
    tagDate,
    fixes,
    today: new Date().toISOString().slice(0, 10),
  });

  const dir = mkdtempSync(join(tmpdir(), "store-sync-"));
  const { published } = publishRelease({
    run: sh,
    repo: env.GITHUB_REPOSITORY,
    version: result.version,
    facts,
    writeFile: (text) => {
      const f = join(dir, "body.md");
      writeFileSync(f, text);
      return f;
    },
  });
  summary(published ? `- **${result.version} 공개** (빌드 ${result.build})` : `- ${result.version}은 이미 공개됨`);
}
