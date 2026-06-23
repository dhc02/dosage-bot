#!/usr/bin/env bash
set -euo pipefail

# Deploy dosage-bot to Unraid via Docker Compose
# Usage: ./deploy.sh [--build-only]

UNRAID_HOST="root@192.168.200.112"
UNRAID_PROJECT_DIR="/boot/config/plugins/compose.manager/projects/dosage-bot"
UNRAID_APPDATA_DIR="/mnt/user/appdata/dosage-bot"
REPO_URL="https://github.com/dhc02/dosage-bot.git"
UNRAID_SRC_DIR="/mnt/user/appdata/dosage-bot/src"

echo "==> Deploying dosage-bot to Unraid..."

# 1. Ensure directories exist on Unraid
echo "==> Setting up directories..."
ssh "$UNRAID_HOST" "mkdir -p $UNRAID_PROJECT_DIR $UNRAID_APPDATA_DIR/data"

# 2. Clone or pull the repo on Unraid
echo "==> Syncing source code..."
ssh "$UNRAID_HOST" bash -s <<'REMOTE'
set -euo pipefail
SRC_DIR="/mnt/user/appdata/dosage-bot/src"
REPO_URL="https://github.com/dhc02/dosage-bot.git"

if [ -d "$SRC_DIR/.git" ]; then
  cd "$SRC_DIR"
  git fetch --all
  git reset --hard origin/main
else
  rm -rf "$SRC_DIR"
  git clone "$REPO_URL" "$SRC_DIR"
fi
REMOTE

# 3. Generate docker-compose.yml in Compose Manager project dir
#    (points build context to the cloned source)
echo "==> Installing compose file..."
ssh "$UNRAID_HOST" bash -s <<'REMOTE'
# Image-only compose (NO build:) so the Compose Manager boot-time autostart
# event can `up -d` without attempting a build at array start (which fails
# silently — build context / array may not be ready that early in boot).
cat > /boot/config/plugins/compose.manager/projects/dosage-bot/docker-compose.yml <<'COMPOSE'
services:
  dosage-bot:
    image: dosage-bot:latest
    container_name: dosage-bot
    restart: unless-stopped
    ports:
      - "5180:3001"
    volumes:
      - /mnt/user/appdata/dosage-bot/data:/app/data
    environment:
      - TZ=America/Chicago
    labels:
      net.unraid.docker.managed: composeman
      net.unraid.docker.icon: ''
      net.unraid.docker.webui: 'http://[IP]:[PORT:5180]'
      net.unraid.docker.shell: ''
COMPOSE
# Enable boot-time autostart. The compose project name MUST equal the sanitized
# `name` file (hyphens -> underscores) = dosage_bot, or autostart creates a
# conflicting container.
printf 'true' > /boot/config/plugins/compose.manager/projects/dosage-bot/autostart
printf 'dosage_bot' > /boot/config/plugins/compose.manager/projects/dosage-bot/name
REMOTE

if [[ "${1:-}" == "--build-only" ]]; then
  echo "==> Building image (not starting)..."
  ssh "$UNRAID_HOST" "docker build -t dosage-bot:latest $UNRAID_SRC_DIR"
  echo "==> Build complete."
  exit 0
fi

# 4. Build the image explicitly (tagged), then start WITHOUT --build so the
#    running container is identical to what the boot-time autostart event starts.
echo "==> Building image..."
ssh "$UNRAID_HOST" "docker build -t dosage-bot:latest $UNRAID_SRC_DIR"
echo "==> Starting container (project: dosage_bot)..."
ssh "$UNRAID_HOST" "cd $UNRAID_PROJECT_DIR && docker compose -p dosage-bot down 2>/dev/null; docker compose -p dosage_bot up -d"

echo ""
echo "==> Deployed! Access at http://192.168.200.112:5180"
