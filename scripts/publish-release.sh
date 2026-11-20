#!/usr/bin/env bash
set -euo pipefail

# publish-kit discovers workspace members. Stage only the packed public CLI.
archive=${1:?Expected the verified Janotate tarball}
channel=${2:?Expected beta or latest}
case "$channel" in beta|latest) ;; *) exit 2 ;; esac
case "${3:---dry-run}" in
  --dry-run) flags=(--dry-run) ;;
  --publish) flags=() ;;
  *) exit 2 ;;
esac
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
tar -xzf "$archive" -C "$stage"
node -e "const p=require(process.argv[1]); if(p.name!=='janotate'||p.version!==require('./package.json').version) process.exit(1)" "$stage/package/package.json"
printf '%s\n' '{"private":true,"workspaces":["package"]}' > "$stage/package.json"
cp scripts/publish.config.mjs "$stage/publish.config.mjs"
npm_config_ignore_scripts=true ./node_modules/.bin/publish-kit publish janotate \
  --cwd "$stage" --skip-build --tag "$channel" "${flags[@]}"
