#!/bin/bash
# Deploy Atlas OS — pull latest, rebuild, restart
set -e
cd /root/atlas-os

echo "=== Pulling latest from GitHub ==="
git pull origin main

echo "=== Rebuilding Docker images ==="
docker compose build odysseus

echo "=== Restarting ==="
docker compose up -d odysseus

echo "=== Done! http://localhost:7000 ==="
