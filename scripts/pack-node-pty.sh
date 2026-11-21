#!/usr/bin/env bash
# Builds the per-platform node-pty archives that ecu-terminal downloads on first use.
# Sources: the official node-pty npm package (macOS and Windows prebuilds) and
# @lydell/node-pty-linux-* (Linux prebuilds of the same node-pty release).
set -euo pipefail

VERSION="1.1.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
OUT="$ROOT/dist"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

cd "$WORK"
npm pack "node-pty@$VERSION" --silent >/dev/null
npm pack "@lydell/node-pty-linux-x64@$VERSION" --silent >/dev/null
npm pack "@lydell/node-pty-linux-arm64@$VERSION" --silent >/dev/null
mkdir np lx64 la64
tar -xzf "node-pty-$VERSION.tgz" -C np
tar -xzf "lydell-node-pty-linux-x64-$VERSION.tgz" -C lx64
tar -xzf "lydell-node-pty-linux-arm64-$VERSION.tgz" -C la64

pack() {
  local key="$1" src="$2"
  local stage="$WORK/stage-$key/node-pty"
  mkdir -p "$stage/lib" "$stage/prebuilds/$key"
  cp np/package/package.json np/package/LICENSE "$stage/"
  (cd np/package/lib && find . -name '*.js' ! -name '*.test.js' ! -name 'testUtils*' -exec sh -c 'mkdir -p "$1/$(dirname "$2")" && cp "$2" "$1/$2"' _ "$stage/lib" {} \;)
  cp -R "$src"/. "$stage/prebuilds/$key/"
  [ -f "$stage/prebuilds/$key/spawn-helper" ] && chmod 755 "$stage/prebuilds/$key/spawn-helper"
  find "$stage" -name '*.pdb' -delete
  rm -rf "$stage/prebuilds/$key/conpty"
  (cd "$WORK/stage-$key" && COPYFILE_DISABLE=1 tar --format ustar --uid 0 --gid 0 -czf "$OUT/node-pty-$key.tar.gz" node-pty)
}

for key in darwin-arm64 darwin-x64 win32-x64 win32-arm64; do
  pack "$key" "np/package/prebuilds/$key"
done
mkdir -p lx64/bin la64/bin
cp lx64/package/pty.node lx64/bin/ && pack linux-x64 lx64/bin
cp la64/package/pty.node la64/bin/ && pack linux-arm64 la64/bin

cd "$OUT"
shasum -a 256 node-pty-*.tar.gz | tee SHA256SUMS
ls -la
