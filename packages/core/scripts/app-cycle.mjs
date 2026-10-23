// 앱 릴리즈 사이클 판별. 단계를 사람이 고르지 않고 태그·릴리즈 상태·입력으로 정한다.
import { bumpVersion, compareVersion, parseTags, sortBuilds } from "./app-version.mjs";

const fail = (message) => ({ stage: "fail", message });

function latestPublishedBelow(releases, releaseStates, version) {
  return (
    releases
      .filter((r) => releaseStates[r] === "published" && compareVersion(r, version) < 0)
      .sort(compareVersion)
      .at(-1) ?? null
  );
}

// 줄기 버전: main은 도달 가능한 빌드 태그 중 가장 높은 버전(없으면 최신 공개 릴리즈),
// hotfix/*는 최신 공개 릴리즈 + patch. 핫픽스가 main에 머지돼도 열린 상위 버전 사이클을 놓치지 않는다.
function lineVersion({ isHotfix, releases, builds, releaseStates }) {
  const published = releases.filter((r) => releaseStates[r] === "published").sort(compareVersion);
  if (isHotfix) return published.length ? bumpVersion(published.at(-1), "patch") : null;
  const versions = [...new Set(builds.map((b) => b.version))].sort(compareVersion);
  return versions.at(-1) ?? published.at(-1) ?? null;
}

export function decide({ ref, bump, complete, head, buildNumber, tags, releaseStates, commitOf }) {
  const isHotfix = ref.startsWith("hotfix/");
  if (!isHotfix && ref !== "main") return fail(`main 또는 hotfix/* 에서만 빌드할 수 있습니다: ${ref}`);

  const { releases, builds } = parseTags(tags);
  const version = lineVersion({ isHotfix, releases, builds, releaseStates });
  if (isHotfix && !version) return fail("핫픽스 기준이 될 출시 릴리즈가 없습니다");
  if (isHotfix && releaseStates[version] === "published")
    return fail(`${version}은 이미 출시됐습니다. 최신 출시 태그에서 새로 분기하세요`);

  const line = sortBuilds(builds.filter((b) => b.version === version));
  const last = line.at(-1);
  const open = !!last && last.kind !== "end";

  if (!open) {
    if (complete) return fail("테스트 시작 전에는 종료할 수 없습니다. 완료 체크 없이 빌드해 테스트를 시작하세요");
    let next;
    if (isHotfix) {
      if (bump !== "skip") return fail("핫픽스는 버전을 자동으로 정합니다. 버전 올림은 skip으로 두세요");
      next = version;
    } else if (version && line.length && releaseStates[version] !== "published") {
      if (bump !== "skip") return fail(`${version}이 출시 대기 중입니다. 같은 버전으로 재테스트하려면 skip을 고르세요`);
      next = version;
    } else {
      if (bump === "skip") return fail(`${version ?? "직전 버전"}은 이미 출시됐습니다. 버전 올림을 고르세요`);
      next = bumpVersion(version ?? "0.0.0", bump);
    }
    // 핫픽스가 main에 머지되기 전에 공개되면, main에서 올린 버전이 그 핫픽스 버전과 같아질 수 있다.
    if (releaseStates[next] === "published") return fail(`${next}은 이미 출시된 버전입니다. 더 높게 올리세요`);
    return {
      stage: "start",
      version: next,
      buildTag: `${next}.${buildNumber}-start`,
      build: true,
      startRef: head,
      finalRef: head,
      fromRef: latestPublishedBelow(releases, releaseStates, next),
    };
  }

  if (bump !== "skip") return fail(`${version} 테스트가 진행 중입니다. 버전 올림은 skip으로 두세요`);
  const lastCommit = commitOf(last.tag);
  const changed = lastCommit !== head;
  const start = [...line].reverse().find((b) => b.kind === "start");
  const common = {
    version,
    startRef: commitOf(start.tag),
    fromRef: latestPublishedBelow(releases, releaseStates, version),
  };

  if (!complete) {
    if (!changed) return fail(`마지막 빌드(${last.tag}) 이후 바뀐 것이 없습니다. 테스트를 끝내려면 완료 체크를 하세요`);
    return { stage: "mid", ...common, buildTag: `${version}.${buildNumber}`, build: true, finalRef: head };
  }
  if (changed) return { stage: "end", ...common, buildTag: `${version}.${buildNumber}-end`, build: true, finalRef: head };
  return { stage: "end", ...common, buildTag: `${version}.${last.build}-end`, build: false, finalRef: lastCommit };
}

// main의 상태: testing(사이클 열림) / waiting(종료, 프리릴리즈) / released(공개 또는 태그 없음)
export function mainState(tags, releaseStates) {
  const { releases, builds } = parseTags(tags);
  const version = lineVersion({ isHotfix: false, releases, builds, releaseStates });
  if (!version) return "released";
  const last = sortBuilds(builds.filter((b) => b.version === version)).at(-1);
  if (last && last.kind !== "end") return "testing";
  return releaseStates[version] === "published" || !last ? "released" : "waiting";
}

export function gate({ state, headRef, hasDevelopOnlyCommits, hotfixEnded }) {
  const deny = (reason) => ({ allow: false, reason });
  if (headRef === "develop") {
    return state === "released"
      ? { allow: true }
      : deny(state === "testing" ? "테스트 중에는 develop을 main에 머지할 수 없습니다" : "출시 확인 전에는 develop을 main에 머지할 수 없습니다");
  }
  if (headRef.startsWith("fix/")) {
    if (state === "released") return deny("출시 완료 상태입니다. 수정은 develop으로 보내고, 출시본 수정은 hotfix/로 하세요");
    if (hasDevelopOnlyCommits) return deny("fix/는 main에서 분기해야 합니다 (develop에만 있는 커밋이 들어 있음)");
    return { allow: true };
  }
  if (headRef.startsWith("hotfix/")) {
    return hotfixEnded ? { allow: true } : deny("핫픽스 사이클을 종료(-end)한 뒤에 머지하세요");
  }
  return deny(`main에는 develop, fix/, hotfix/만 머지할 수 있습니다: ${headRef}`);
}
