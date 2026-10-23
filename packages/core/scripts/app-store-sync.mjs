// packages/core/scripts/app-store-sync.mjs
// 스토어에 출시된 빌드를 확인해 GitHub 프리릴리즈를 공개할지 정한다.
// 출시 확인 = iOS·Android가 같은 빌드를 출시함 (설계 D9).
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
