#!/usr/bin/env bash
# Bring the stack up without waiting on the Rust compile.
#
# `docker compose up --build` builds every image before it starts any container,
# so a cold renderer build would hold the app and database hostage for as long as
# typst takes to compile. This starts the renderer's build in the background,
# brings up MongoDB and the app as soon as their images are ready, and starts
# the renderer whenever its build finishes. Until then PDF export answers 503
# and everything else works.
set -euo pipefail
cd "$(dirname "$0")/.."

(
  set -o pipefail
  docker compose --progress plain build pdf 2>&1 | sed -u 's/^/[pdf build] /'
) &
pdf_build=$!

docker compose up -d --build mongodb app
echo "mongodb and app are up; the PDF renderer is still compiling..."

if wait "$pdf_build"; then
  docker compose up -d pdf
  echo "PDF renderer is up."
else
  echo "PDF renderer build failed; the app keeps running without PDF export." >&2
  exit 1
fi
