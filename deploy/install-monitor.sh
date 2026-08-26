#!/usr/bin/env bash
set -euo pipefail

HUB_URL=""
TOKEN=""
NODE_ID="$(hostname)"

while [[ $# -gt 0 ]]; do
  case $1 in
    --hub)
      HUB_URL="$2"
      shift 2
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --node-id)
      NODE_ID="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -z "$HUB_URL" ]]; then
  echo "Error: --hub is required"
  exit 1
fi

echo "==> Downloading Ophanim-Monitor static binary..."
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) GOARCH="amd64" ;;
  aarch64|arm64) GOARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

DOWNLOAD_URL="${HUB_URL}/download/ophanim-monitor-linux-${GOARCH}"
curl -sSL -f "$DOWNLOAD_URL" -o /usr/local/bin/ophanim-monitor || true
chmod +x /usr/local/bin/ophanim-monitor || true

echo "==> Installing Ophanim-Monitor systemd service..."
printf '[Unit]\nDescription=Ophanim Edge Monitoring Agent\nAfter=network.target docker.service\n\n[Service]\nType=simple\nExecStart=/usr/local/bin/ophanim-monitor --hub %s --token %s --node-id %s\nRestart=always\nRestartSec=5s\n\n[Install]\nWantedBy=multi-user.target\n' "$HUB_URL" "$TOKEN" "$NODE_ID" > /etc/systemd/system/ophanim-monitor.service || true

echo "==> Ophanim-Monitor script ready for node ${NODE_ID}!"
