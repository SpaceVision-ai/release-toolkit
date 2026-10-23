// 앱 릴리즈 태그 체계: 릴리즈 `x.y.z`, 빌드 `x.y.z.N`, `x.y.z.N-start`, `x.y.z.N-end`.
// `-legacy`·`exp.*`·`v0` 같은 다른 태그는 판별에 섞이지 않도록 버린다.
const RELEASE_TAG = /^(\d+)\.(\d+)\.(\d+)$/;
const BUILD_TAG = /^(\d+)\.(\d+)\.(\d+)\.(\d+)(-start|-end)?$/;

const parts = (v) => v.split(".").map(Number);

export function compareVersion(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export function bumpVersion(version, bump) {
  const [M, m, p] = parts(version);
  if (bump === "major") return `${M + 1}.0.0`;
  if (bump === "minor") return `${M}.${m + 1}.0`;
  if (bump === "patch") return `${M}.${m}.${p + 1}`;
  return version;
}

export function parseTags(tags) {
  const releases = [];
  const builds = [];
  for (const tag of tags) {
    if (RELEASE_TAG.test(tag)) {
      releases.push(tag);
      continue;
    }
    const m = tag.match(BUILD_TAG);
    if (!m) continue;
    builds.push({
      tag,
      version: `${m[1]}.${m[2]}.${m[3]}`,
      build: Number(m[4]),
      kind: m[5] === "-start" ? "start" : m[5] === "-end" ? "end" : "mid",
    });
  }
  return { releases, builds };
}

const KIND_ORDER = { start: 0, mid: 1, end: 2 };

// 같은 빌드 번호에 -start와 -end가 함께 붙는 경우(다시 빌드하지 않고 종료)에도 -end가 뒤에 오게 한다.
export function sortBuilds(builds) {
  return [...builds].sort(
    (a, b) => a.build - b.build || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}
