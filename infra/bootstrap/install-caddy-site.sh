#!/usr/bin/env bash
#
# Pokero — ajout du vhost Caddy pokero.noameunier.fr
#
# Usage :
#   sudo bash infra/bootstrap/install-caddy-site.sh
#
# - sauvegarde le Caddyfile existant,
# - ajoute un bloc pokero.noameunier.fr (idempotent),
# - valide la configuration AVANT de recharger,
# - restaure la sauvegarde et échoue si la validation échoue,
# - ne modifie pas le vhost OpenCode existant.
#
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "ERREUR : ce script doit être lancé avec sudo." >&2
  exit 1
fi

CADDYFILE="/etc/caddy/Caddyfile"
DOMAIN="pokero.noameunier.fr"

if [[ ! -f "${CADDYFILE}" ]]; then
  echo "ERREUR : ${CADDYFILE} introuvable." >&2
  exit 1
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "ERREUR : binaire caddy introuvable." >&2
  exit 1
fi

if grep -qE "^[[:space:]]*${DOMAIN}[[:space:]]*\{" "${CADDYFILE}"; then
  echo "Le vhost ${DOMAIN} existe déjà dans ${CADDYFILE} — rien à faire."
  exit 0
fi

BACKUP="${CADDYFILE}.bak.$(date +%Y%m%d-%H%M%S)"
cp -a "${CADDYFILE}" "${BACKUP}"
echo "Sauvegarde : ${BACKUP}"

cat >> "${CADDYFILE}" <<'EOF'

# --- Pokero (web + API + Socket.IO) ---
pokero.noameunier.fr {
	encode zstd gzip

	@socket path /socket.io/*
	handle @socket {
		reverse_proxy 127.0.0.1:4000
	}

	@api path /api/*
	handle @api {
		reverse_proxy 127.0.0.1:4000
	}

	handle {
		reverse_proxy 127.0.0.1:8080
	}
}
EOF

echo "Validation de la configuration Caddy…"
if ! caddy validate --config "${CADDYFILE}" --adapter caddyfile; then
  echo "Configuration invalide : restauration de ${BACKUP}" >&2
  cp -a "${BACKUP}" "${CADDYFILE}"
  exit 1
fi

echo "Rechargement de Caddy…"
systemctl reload caddy

echo
echo "OK. Vhost ajouté pour https://${DOMAIN}"
echo "Rappel : tant que les services Pokero ne tournent pas (web :8080, API :4000),"
echo "la page affichera 502 Bad Gateway. Le certificat TLS est émis au premier accès."
