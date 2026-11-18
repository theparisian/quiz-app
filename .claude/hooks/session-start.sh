#!/bin/bash
# Claude Code cloud sessions only: start local MySQL 8 (installed by the
# cloud environment's setup script) and keep pnpm deps / Prisma client in sync.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# MySQL: start it if installed and not already running
if command -v mysqld >/dev/null 2>&1; then
  if ! mysqladmin ping >/dev/null 2>&1; then
    service mysql start >/dev/null 2>&1 || true
    for _ in $(seq 30); do
      mysqladmin ping >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  if mysqladmin ping >/dev/null 2>&1; then
    echo "MySQL is running." >&2
  else
    echo "Warning: MySQL failed to start." >&2
  fi
else
  echo "MySQL not installed (use the Shh cloud environment)." >&2
fi

# pnpm install + prisma generate, only when manifests changed
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
  pnpm --filter @quiz-app/api db:generate
  sha256sum .claude/hooks/session-start.sh package.json pnpm-lock.yaml \
    pnpm-workspace.yaml api/package.json api/prisma/schema.prisma \
    apps/*/package.json packages/*/package.json 2>/dev/null > "$hashes" || rm -f "$hashes"
fi
