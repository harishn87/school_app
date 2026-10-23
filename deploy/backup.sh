#!/usr/bin/env bash
# Nightly MongoDB backup: one compressed archive with the platform DB and every school's DB.
# Cron example (2:30 AM daily):
#   30 2 * * * cd /opt/scholaris && ./deploy/backup.sh >> /var/log/scholaris-backup.log 2>&1
#
# Restore everything:
#   docker compose -f docker-compose.prod.yml exec -T mongo sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < backups/FILE.archive.gz
# Restore ONE school (e.g. code greenwood-high -> database school_greenwood_high):
#   ... same command plus:  --nsInclude 'school_greenwood_high.*'
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/scholaris-${STAMP}.archive.gz"

docker compose -f docker-compose.prod.yml exec -T mongo sh -c \
  'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' \
  > "$OUT"

echo "$(date -Is) backup written: $OUT ($(du -h "$OUT" | cut -f1))"
find backups -name 'scholaris-*.archive.gz' -mtime +"$KEEP_DAYS" -delete
# Copy off the server too, e.g.:  aws s3 cp "$OUT" s3://your-bucket/scholaris/
