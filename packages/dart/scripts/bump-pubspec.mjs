import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function bumpPubspec(pubspecPath, nextVersion, runNumber) {
  const content = readFileSync(pubspecPath, "utf8");
  const match = content.match(/^version:\s*(\S+)/m);
  if (!match) {
    throw new Error(`No version line found in ${pubspecPath}`);
  }

  const currentVersion = match[1];
  const buildMatch = currentVersion.match(/\+(\d+)$/);
  const existingBuildNumber = buildMatch ? parseInt(buildMatch[1], 10) : 0;
  const newBuildNumber = Math.max(runNumber, existingBuildNumber + 1);

  const newContent = content.replace(
    /^version:\s*\S+/m,
    `version: ${nextVersion}+${newBuildNumber}`,
  );
  writeFileSync(pubspecPath, newContent);

  return {
    version: `${nextVersion}+${newBuildNumber}`,
    buildNumber: newBuildNumber,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1])?.href) {
  const nextVersion = process.argv[2];
  if (!nextVersion) {
    console.error("Usage: bump-pubspec.mjs <nextVersion>");
    process.exit(1);
  }

  const runNumber = parseInt(process.env.GITHUB_RUN_NUMBER, 10);
  if (!runNumber) {
    console.error("GITHUB_RUN_NUMBER is required (CI-only script)");
    process.exit(1);
  }

  const result = bumpPubspec(resolve("pubspec.yaml"), nextVersion, runNumber);
  console.log(`bumped to ${result.version}`);
}
