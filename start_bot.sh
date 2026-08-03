#!/usr/bin/env bash

# Exit on error
set -e

echo "========================================"
echo "   Vertex Panel - Discord Bot Setup"
echo "========================================"

# ─── Config ───────────────────────────────────────────────────────────────────
REPO="https://github.com/Bossa9973/Vertex-Panel.git"
BOT_DIR="/opt/vertex-bot"

# ─── Detect: standalone server OR same server as panel ────────────────────────
if [ -d "/var/www/vertex-panel/bot" ]; then
    echo "-> Detected full panel installation, using existing bot directory..."
    BOT_DIR="/var/www/vertex-panel/bot"
else
    echo "-> Standalone bot mode: installing to ${BOT_DIR}..."
    echo "-> Updating system package lists..."
    apt-get update -y > /dev/null

    echo "-> Installing git..."
    apt-get install -y git > /dev/null

    if [ -d "$BOT_DIR/.git" ]; then
        echo "-> Updating existing bot files from GitHub..."
        git -C "$BOT_DIR" pull > /dev/null
    else
        echo "-> Cloning only the bot/ directory from GitHub..."
        mkdir -p "$BOT_DIR"
        git clone --no-checkout --depth=1 "$REPO" /tmp/vertex-repo > /dev/null 2>&1
        git -C /tmp/vertex-repo sparse-checkout init --cone > /dev/null
        git -C /tmp/vertex-repo sparse-checkout set bot > /dev/null
        git -C /tmp/vertex-repo checkout > /dev/null
        cp -r /tmp/vertex-repo/bot/. "$BOT_DIR/"
        rm -rf /tmp/vertex-repo
    fi
fi

cd "$BOT_DIR"

# ─── Python environment ───────────────────────────────────────────────────────
echo "-> Installing Python dependencies..."
apt-get install -y python3-venv python3-pip > /dev/null

if [ ! -d "venv" ]; then
    echo "-> Creating isolated virtual environment..."
    python3 -m venv venv
fi

echo "-> Activating environment..."
source venv/bin/activate

echo "-> Installing bot requirements..."
while read -r req; do
    if [[ -n "$req" && ! "$req" =~ ^# ]]; then
        echo "   > Installing $req..."
        pip install "$req" > /dev/null
    fi
done < requirements.txt

# ─── .env setup ───────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "-> Creating .env from template..."
        cp .env.example .env
    fi
    echo ""
    echo "  ⚠️  IMPORTANT: Edit ${BOT_DIR}/.env and fill in:"
    echo "     DISCORD_TOKEN  = your bot token"
    echo "     PANEL_URL      = https://your-panel-domain.com  (must be publicly accessible!)"
    echo "     BOT_API_SECRET = must match BOT_API_SECRET in panel's .env"
    echo ""
    echo "  Then run: systemctl restart vertex-bot"
    echo ""
fi

# ─── Systemd service ──────────────────────────────────────────────────────────
echo "-> Creating systemd service..."

cat > /etc/systemd/system/vertex-bot.service <<EOF
[Unit]
Description=Vertex Discord Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${BOT_DIR}
Environment=PYTHONUNBUFFERED=1
ExecStart=${BOT_DIR}/venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "-> Enabling and starting service..."
systemctl daemon-reload
systemctl enable vertex-bot
systemctl restart vertex-bot

echo ""
echo "========================================"
echo "✅ Bot setup complete!"
echo "========================================"
echo ""
echo "View live logs:  journalctl -u vertex-bot -f"
echo "Restart bot:     systemctl restart vertex-bot"
echo "Bot config:      nano ${BOT_DIR}/.env"
