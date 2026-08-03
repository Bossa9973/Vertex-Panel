#!/usr/bin/env bash

# Exit on error
set -e

echo "========================================"
echo "   Vertex Panel - Discord Bot Setup"
echo "========================================"

BOT_DIR="/var/www/vertex-panel/bot"

if [ ! -d "$BOT_DIR" ]; then
    echo "Error: Bot directory not found at $BOT_DIR"
    echo "Please ensure the panel is installed first."
    exit 1
fi

cd "$BOT_DIR"

echo "-> Installing Python venv and dependencies..."
apt-get update -y > /dev/null
apt-get install -y python3-venv python3-pip > /dev/null

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate venv and install requirements
source venv/bin/activate
pip install -r requirements.txt > /dev/null

echo "-> Creating systemd service..."

cat > /etc/systemd/system/vertex-bot.service <<EOF
[Unit]
Description=Vertex Discord Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/vertex-panel/bot
ExecStart=/var/www/vertex-panel/bot/venv/bin/python main.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "-> Starting the bot as a background service..."
systemctl daemon-reload
systemctl enable vertex-bot
systemctl restart vertex-bot

echo "========================================"
echo "✅ Bot setup complete and running!"
echo "========================================"
echo "To view bot logs in real-time, run:"
echo "journalctl -u vertex-bot -f"
