#!/usr/bin/env bash
#
# Pokero — installation des prérequis système (Debian 13 "trixie")
#
# Usage :
#   sudo bash infra/bootstrap/install-system.sh
#
# Ce script est idempotent : il peut être relancé sans risque.
# Il n'installe PAS PostgreSQL (il tournera dans Docker, en conteneur).
# Il ne touche PAS à la configuration Caddy existante.
#
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "ERREUR : ce script doit être lancé avec sudo." >&2
  exit 1
fi

TARGET_USER="${SUDO_USER:-dev}"
if ! id "${TARGET_USER}" >/dev/null 2>&1; then
  echo "ERREUR : utilisateur '${TARGET_USER}' introuvable." >&2
  exit 1
fi

if ! grep -q '^ID=debian' /etc/os-release 2>/dev/null; then
  echo "ATTENTION : ce script cible Debian. Système détecté :" >&2
  grep -E '^(ID|VERSION_ID)=' /etc/os-release >&2 || true
  echo "Continuez uniquement si vous savez ce que vous faites." >&2
fi

CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-trixie}")"
ARCH="$(dpkg --print-architecture)"

echo "==> Pokero : installation des prérequis système"
echo "    utilisateur cible : ${TARGET_USER}"
echo "    distribution      : debian/${CODENAME} (${ARCH})"
echo

export DEBIAN_FRONTEND=noninteractive

echo "==> Mise à jour des index apt"
apt-get update

echo "==> Paquets de base, client PostgreSQL, dépendances navigateurs (Playwright)"
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  gnupg \
  unzip \
  jq \
  make \
  pkg-config \
  libssl-dev \
  postgresql-client-17 \
  libasound2t64 \
  libatk-bridge2.0-0t64 \
  libatk1.0-0t64 \
  libatspi2.0-0t64 \
  libcairo2 \
  libcups2t64 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libglib2.0-0t64 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libx11-6 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  libu2f-udev \
  libvulkan1 \
  fonts-liberation \
  fonts-noto-color-emoji \
  xdg-utils

# ---------------------------------------------------------------------------
# Docker Engine + plugin compose (dépôt officiel Docker, pas le paquet Debian
# afin de disposer de `docker compose` et des mises à jour officielles).
# ---------------------------------------------------------------------------
echo "==> Dépôt officiel Docker"
install -m 0755 -d /etc/apt/keyrings
if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL "https://download.docker.com/linux/debian/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${CODENAME} stable
EOF

apt-get update
apt-get install -y --no-install-recommends \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

echo "==> Activation du service Docker"
systemctl enable --now docker

echo "==> Ajout de ${TARGET_USER} au groupe docker (effective à la prochaine session)"
usermod -aG docker "${TARGET_USER}"

echo "==> Activation du linger (services utilisateur après déconnexion)"
loginctl enable-linger "${TARGET_USER}"

echo
echo "==> Vérifications"
docker --version
docker compose version
systemctl is-active docker

echo
echo "Terminé."
echo "IMPORTANT : la session courante de ${TARGET_USER} n'a PAS encore le groupe docker."
echo "  - soit se reconnecter (nouvelle session SSH),"
echo "  - soit préfixer les commandes par : sg docker -c 'docker ps'"
echo
echo "Étape suivante (à faire une fois le DNS prêt) : vhost Caddy pokero.noameunier.fr"
