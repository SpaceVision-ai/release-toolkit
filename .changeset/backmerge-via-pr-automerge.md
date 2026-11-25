---
"@spacevision-ai/release-toolkit-core": patch
---

app-release 백머지를 develop 직접 push 대신 PR + 자동 병합으로 올린다. develop 보호 규칙(required checks)이 체크 없는 직접 push를 거부(GH006)해 백머지가 실패하던 문제를 고친다.
