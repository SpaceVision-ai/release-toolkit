// packages/core/scripts/app-store-sync.mjs
// 스토어에 출시된 빌드를 확인해 GitHub 프리릴리즈를 공개할지 정한다.
// 출시 확인 = iOS·Android가 같은 빌드를 출시함 (설계 D9).
import { sign } from "node:crypto";
import { parseTags, sortBuilds } from "./app-version.mjs";

export function judge({ ios, android, tags }) {
  if (ios == null || android == null) return { action: "wait", reason: `한쪽만 조회됨 (iOS ${ios ?? "-"}, Android ${android ?? "-"})` };
  if (ios !== android) return { action: "warn", reason: `플랫폼별 출시 빌드가 다릅니다 (iOS ${ios}, Android ${android})` };
  const { builds } = parseTags(tags);
  const hit = builds.find((b) => b.build === ios);
  if (!hit) return { action: "warn", reason: `빌드 ${ios}에 해당하는 빌드 태그가 없습니다` };
  const last = sortBuilds(builds.filter((b) => b.version === hit.version)).at(-1);
  const result = { action: "publish", version: hit.version, build: ios };
  if (last?.kind === "end" && last.build !== ios) result.note = `출시된 빌드 ${ios}이 최종 빌드 ${last.build}과 다릅니다`;
  return result;
}

// 마지막 회차 = 가장 최근 -start부터 그 뒤 -end까지 (출시 전 재테스트가 있었으면 마지막 회차만 센다).
export function cycleFacts({ version, build, tags, tagDate, fixes, today }) {
  const line = sortBuilds(parseTags(tags).builds.filter((b) => b.version === version));
  const startIdx = line.map((b) => b.kind).lastIndexOf("start");
  const round = line.slice(startIdx);
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

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// App Store: 판매 중 버전에 연결된 빌드 번호. 없으면 null.
export async function iosReleasedBuild({ keyId, issuerId, privateKey, bundleId }) {
  const token = signJwt(
    { alg: "ES256", kid: keyId },
    { iss: issuerId, iat: now(), exp: now() + 1200, aud: "appstoreconnect-v1" },
    privateKey,
  );
  const headers = { Authorization: `Bearer ${token}` };
  const base = "https://api.appstoreconnect.apple.com/v1";
  const apps = await getJson(`${base}/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`, { headers });
  const appId = apps.data[0]?.id;
  if (!appId) throw new Error(`App Store에 번들 ${bundleId} 앱이 없습니다`);
  const versions = await getJson(
    `${base}/apps/${appId}/appStoreVersions?filter[appStoreState]=READY_FOR_SALE&include=build&limit=1`,
    { headers },
  );
  const build = versions.included?.find((i) => i.type === "builds");
  return build ? Number(build.attributes.version) : null;
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
