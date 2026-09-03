#!/usr/bin/env bash
# ============================================================
#  ArxAI — serverga chiqarish.
#
#  MUHIM: rsync manbasi loyiha ILDIZI ("./") bo'lishi shart.
#  Agar manba sifatida "./server" berilsa, --exclude naqshlari
#  "server/..." bilan boshlangani uchun MOS KELMAYDI va serverdagi
#  ma'lumotlar bazasi lokal nusxa bilan almashib ketadi.
#  Shu sababli bu yerda naqshlar manbaga bog'liq bo'lmagan
#  ko'rinishda (/server/data/db.json — ildizdan boshlab) yozilgan.
# ============================================================
set -euo pipefail

HOST="${ARXAI_HOST:-ubuntu@82.115.50.104}"
DIR="${ARXAI_DIR:-/opt/arxai}"

echo "→ Build"
npm run build

echo "→ Testlar"
npm test

echo "→ Serverdagi bazani zaxiralash"
ssh "$HOST" "cd $DIR && mkdir -p server/data/backups && \
  [ -f server/data/db.json ] && cp server/data/db.json server/data/backups/db-predeploy-\$(date +%Y%m%d-%H%M%S).json || true"

echo "→ Fayllarni ko'chirish"
rsync -az --delete \
  --exclude '/node_modules' \
  --exclude '/.git' \
  --exclude '/.env' \
  --exclude '/server/data/db.json' \
  --exclude '/server/data/uploads' \
  --exclude '/server/data/backups' \
  ./ "$HOST:$DIR/"

echo "→ Bog'liqliklar va qayta ishga tushirish"
ssh "$HOST" "cd $DIR && npm install --omit=dev --no-audit --no-fund >/dev/null && \
  node --test test/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)' && \
  sudo systemctl restart arxai && sleep 2 && systemctl is-active arxai"

echo "✓ Tayyor"
