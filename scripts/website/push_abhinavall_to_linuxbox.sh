#!/usr/bin/env bash
# Push sites/abhinavall.net static bundle to linuxbox personal_portfolio (:3000).
# Preserves api/, node_modules/, package.json on the Pi.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SITE="${REPO}/sites/abhinavall.net"
HOST="${LINUXBOX_HOST:-abhinav@100.122.108.94}"
KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"
REMOTE_DIR="${LINUXBOX_PORTFOLIO_DIR:-/home/abhinav/personal_portfolio}"
TARBALL="/tmp/abhinavall-v8-deploy.tgz"
BACKUP_SUFFIX="${BACKUP_SUFFIX:-pre-v8-$(date +%Y%m%d%H%M)}"

bash "${REPO}/scripts/website/deploy_abhinavall_site.sh"

tar -czf "${TARBALL}" -C "${SITE}" .
scp -o BatchMode=yes -i "${KEY}" "${TARBALL}" "${HOST}:/tmp/abhinavall-v8-deploy.tgz"

ssh -o BatchMode=yes -i "${KEY}" "${HOST}" bash -s <<EOF
set -euo pipefail
BK="\${HOME}/personal_portfolio-backup-${BACKUP_SUFFIX}"
if [ ! -d "\${BK}" ]; then
  cp -a "${REMOTE_DIR}" "\${BK}"
  echo "backup: \${BK}"
fi
cd "${REMOTE_DIR}"
find . -mindepth 1 -maxdepth 1 \\
  ! -name api ! -name node_modules ! -name package.json ! -name package-lock.json \\
  ! -name .env ! -name .env.example \\
  -exec rm -rf {} +
tar xzf /tmp/abhinavall-v8-deploy.tgz -C "${REMOTE_DIR}"
sudo systemctl restart abhinav-portfolio
sleep 2
systemctl is-active abhinav-portfolio
curl -s -o /dev/null -w "origin3000:%{http_code}\\n" http://127.0.0.1:3000/
curl -s -o /dev/null -w "tunnel8780:%{http_code}\\n" http://127.0.0.1:8780/
curl -s -o /dev/null -w "live:%{http_code}\\n" https://abhinavall.net/
EOF

echo "OK — v8 bundle live on https://abhinavall.net/ (linuxbox ${REMOTE_DIR})"
