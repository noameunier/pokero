#!/usr/bin/env bash
# Sauvegarde PostgreSQL de Pokero.
#
# Usage (sur le VPS, depuis la racine du dépôt) :
#   ./infra/docker/backup.sh
#   BACKUP_DIR=/var/backups/pokero RETENTION_DAYS=30 ./infra/docker/backup.sh
#
# Le script utilise le service `db` de docker-compose.prod.yml et n'expose
# jamais la base sur le réseau public.
set -euo pipefail

cd "$(dirname "$0")/../.."

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
BACKUP_DIR=${BACKUP_DIR:-./backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}

if [ ! -f .env ]; then
  echo "Erreur : .env introuvable à la racine du dépôt." >&2
  exit 1
fi

# Charge POSTGRES_USER / POSTGRES_DB sans les exporter ailleurs.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

POSTGRES_USER=${POSTGRES_USER:-pokero}
POSTGRES_DB=${POSTGRES_DB:-pokero}
STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
TARGET="${BACKUP_DIR}/pokero-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Sur certains hôtes, l'utilisateur n'accède au socket Docker que via `sg docker`.
compose() {
  if docker info >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
  elif command -v sg >/dev/null 2>&1 && sg docker -c 'docker info' >/dev/null 2>&1; then
    # shellcheck disable=SC2046
    sg docker -c "docker compose -f '$COMPOSE_FILE' $(printf '%q ' "$@")"
  else
    echo "Erreur : accès au démon Docker refusé (essayez via le groupe docker)." >&2
    exit 1
  fi
}

echo "Sauvegarde de ${POSTGRES_DB} vers ${TARGET}…"

# pipefail garantit l'échec si pg_dump échoue, même avec gzip.
if ! compose exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gzip -9 > "$TARGET"; then
  rm -f "$TARGET"
  echo "Erreur : la sauvegarde a échoué." >&2
  exit 1
fi

if [ ! -s "$TARGET" ] || ! gzip -t "$TARGET"; then
  rm -f "$TARGET"
  echo "Erreur : sauvegarde vide ou corrompue." >&2
  exit 1
fi

SIZE=$(du -h "$TARGET" | cut -f1)
echo "Sauvegarde OK : ${TARGET} (${SIZE})"

# Rétention : supprime les archives plus anciennes que RETENTION_DAYS jours.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pokero-*.sql.gz' \
  -mtime "+${RETENTION_DAYS}" -print -delete

cat <<EOF

Restauration (⚠️ remplace les données actuelles) :
  gunzip -c ${TARGET} | docker compose -f ${COMPOSE_FILE} exec -T db \\
    psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}
  # Si nécessaire, préfixez la commande par : sg docker -c '...'
EOF
