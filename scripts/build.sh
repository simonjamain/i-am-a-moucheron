#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist_root="$project_root/dist"

rm -rf "$dist_root"
mkdir -p "$dist_root/worker"
cp -R "$project_root/server" "$project_root/src" "$dist_root/"
cp "$project_root/worker/assets.js" "$dist_root/worker/assets.js"
cp "$project_root/package.json" "$project_root/package-lock.json" \
  "$project_root/VERSION" "$dist_root/"
# The package is already assembled: no development tool or source checkout required.
node --input-type=module - "$dist_root/package.json" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
const pkg = JSON.parse(readFileSync(file, 'utf8'));
pkg.scripts = { start: 'node server/index.js' };
delete pkg.devDependencies;
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
JS
printf 'Built Node runtime in %s (npm ci --omit=dev && npm start)\n' "$dist_root"
