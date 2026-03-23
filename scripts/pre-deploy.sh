#!/bin/bash
#
# Pre-Deploy Checklist
#
# Run this BEFORE every deploy. It catches what code review cannot:
# 1. TypeScript compilation errors
# 2. Build errors (Vite)
# 3. Schema drift (DB vs code mismatch)
# 4. Structural test failures
#
# After deploy, run: npm run verify-deploy
#
# Usage: ./scripts/pre-deploy.sh
# Or:    npm run pre-deploy

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "============================================"
echo "  Pre-Deploy Checklist"
echo "============================================"
echo ""

FAILED=0

# Step 1: TypeScript check
echo "Step 1: TypeScript compilation..."
if npx tsc --noEmit 2>/dev/null; then
  echo -e "  ${GREEN}[PASS]${NC} TypeScript compilation"
else
  echo -e "  ${RED}[FAIL]${NC} TypeScript compilation errors"
  FAILED=1
fi

# Step 2: Build
echo ""
echo "Step 2: Vite build..."
if npm run build 2>/dev/null 1>/dev/null; then
  echo -e "  ${GREEN}[PASS]${NC} Vite build succeeded"
else
  echo -e "  ${RED}[FAIL]${NC} Vite build failed"
  FAILED=1
fi

# Step 3: Structural tests (existing tests that don't need a server)
echo ""
echo "Step 3: Structural tests..."
if npx vitest run --reporter=verbose tests/api-shapes.test.ts tests/schema-storage.test.ts tests/levels.test.ts tests/scoring.test.ts 2>/dev/null; then
  echo -e "  ${GREEN}[PASS]${NC} Structural tests"
else
  echo -e "  ${RED}[FAIL]${NC} Structural test failures"
  FAILED=1
fi

# Step 4: Schema drift check (only if DATABASE_URL is set)
echo ""
echo "Step 4: Schema drift check..."
if [ -z "$DATABASE_URL" ]; then
  echo -e "  ${YELLOW}[SKIP]${NC} DATABASE_URL not set — cannot check schema drift"
  echo "  Set DATABASE_URL to enable this check"
else
  if npx tsx scripts/check-schema-drift.ts 2>/dev/null; then
    echo -e "  ${GREEN}[PASS]${NC} Schema matches database"
  else
    echo -e "  ${RED}[FAIL]${NC} Schema drift detected — database does not match code"
    FAILED=1
  fi
fi

# Summary
echo ""
echo "============================================"
if [ $FAILED -eq 0 ]; then
  echo -e "  ${GREEN}All pre-deploy checks passed.${NC}"
  echo "  Safe to push to main."
  echo ""
  echo "  After deploy, run:"
  echo "    npm run verify-deploy"
  echo "============================================"
  exit 0
else
  echo -e "  ${RED}Pre-deploy checks FAILED.${NC}"
  echo "  Fix issues before pushing."
  echo "============================================"
  exit 1
fi
