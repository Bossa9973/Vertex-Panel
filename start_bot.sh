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

echo "-> Updating system package lists..."
apt-get update -y > /dev/null

echo "-> Installing core python dependencies..."
apt-get install -y python3-venv python3-pip > /dev/null

if [ ! -d "venv" ]; then
    echo "-> Creating isolated virtual environment..."
    python3 -m venv venv
fi

echo "-> Activating environment..."
source venv/bin/activate

echo "-> Downloading and installing bot requirements..."
while read -r req; do
    # Skip empty lines and comments
    if [[ -n "$req" && ! "$req" =~ ^# ]]; then
        echo "   > Installing $req..."
        pip install "$req" > /dev/null
    fi
done < requirements.txt

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
