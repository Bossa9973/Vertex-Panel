#!/usr/bin/env bash

# Exit on error
set -e

echo "========================================"
echo "   Vertex Panel - Discord Bot Setup"
echo "========================================"

# Config
REPO="https://github.com/Bossa9973/Vertex-Panel.git"
BOT_DIR="/opt/vertex-bot"

# Detect: standalone server OR same server as panel
if [ -d "/var/www/vertex-panel/bot" ]; then
    echo "-> Detected full panel installation, using existing bot directory..."
    BOT_DIR="/var/www/vertex-panel/bot"
else
    echo "-> Standalone bot mode: installing to ${BOT_DIR}..."

    # Only install git if missing
    if ! command -v git >/dev/null 2>&1; then
        echo "-> Installing git..."
        apt-get update -y > /dev/null 2>&1 || true
        apt-get install -y git > /dev/null 2>&1 || true
    fi

    if [ -d "$BOT_DIR/.git" ]; then
        echo "-> Updating existing bot files from GitHub..."
        git -C "$BOT_DIR" pull > /dev/null 2>&1 || true
    elif [ ! -f "$BOT_DIR/main.py" ]; then
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

# Python environment setup (only if venv is missing or broken)
if [ ! -f "venv/bin/activate" ] || [ ! -x "venv/bin/python" ]; then
    echo "-> Setting up Python virtual environment..."

    if ! command -v python3 >/dev/null 2>&1 || ! python3 -m venv --help >/dev/null 2>&1; then
        echo "-> Installing system Python packages..."
        apt-get update -y > /dev/null 2>&1 || true
        apt-get install -y python3 python3-pip python3-venv python3-full python3-virtualenv virtualenv > /dev/null 2>&1 || true
    fi

    rm -rf venv
    python3 -m venv venv 2>/dev/null || virtualenv -p python3 venv 2>/dev/null || python3 -m virtualenv venv 2>/dev/null || true
fi

if [ ! -f "venv/bin/activate" ] || [ ! -x "venv/bin/python" ]; then
    echo "❌ Error: Failed to create Python virtual environment."
    echo "   Please run: apt-get install -y python3-venv python3-full"
    exit 1
fi

# Requirements check & cache
REQ_FILE="${BOT_DIR}/requirements.txt"
HASH_FILE="${BOT_DIR}/venv/.requirements.hash"

CURRENT_HASH=""
if [ -f "$REQ_FILE" ]; then
    CURRENT_HASH=$(md5sum "$REQ_FILE" 2>/dev/null | cut -d' ' -f1 || sha256sum "$REQ_FILE" 2>/dev/null | cut -d' ' -f1 || echo "hash")
fi
CACHED_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

# Only install requirements if packages cannot be imported or requirements.txt changed
if [ "$CURRENT_HASH" != "$CACHED_HASH" ] || ! "${BOT_DIR}/venv/bin/python" -c "import discord, httpx, dotenv" 2>/dev/null; then
    echo "-> Installing Python dependencies in virtual environment..."
    "${BOT_DIR}/venv/bin/pip" install --upgrade pip > /dev/null 2>&1 || true
    if [ -f "$REQ_FILE" ]; then
        "${BOT_DIR}/venv/bin/pip" install -r "$REQ_FILE" --quiet > /dev/null 2>&1 || "${BOT_DIR}/venv/bin/pip" install -r "$REQ_FILE"
    fi
    echo "$CURRENT_HASH" > "$HASH_FILE" 2>/dev/null || true
    echo "-> Python dependencies installed."
else
    echo "-> Python dependencies already installed (cached)."
fi

# .env setup
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "-> Creating .env from template..."
        cp .env.example .env
    fi
fi

# Auto-sync BOT_API_SECRET from main panel .env if present
if [ -f "/var/www/vertex-panel/.env" ]; then
    PANEL_SECRET=$(grep '^BOT_API_SECRET=' /var/www/vertex-panel/.env | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    if [ -n "$PANEL_SECRET" ]; then
        if grep -q '^BOT_API_SECRET=' .env; then
            sed -i "s|^BOT_API_SECRET=.*|BOT_API_SECRET=${PANEL_SECRET}|" .env
        else
            echo "BOT_API_SECRET=${PANEL_SECRET}" >> .env
        fi
        echo "-> Auto-synced BOT_API_SECRET from panel .env"
    fi
fi

# Prompt for DISCORD_TOKEN if interactive and token is missing
CURRENT_TOKEN=$(grep '^DISCORD_TOKEN=' .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
if [[ -z "$CURRENT_TOKEN" || "$CURRENT_TOKEN" == "your_bot_token"* ]]; then
    if [ -t 0 ]; then
        echo ""
        read -r -p "   ? Enter your Discord Bot Token: " INPUT_TOKEN
        if [ -n "$INPUT_TOKEN" ]; then
            sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=${INPUT_TOKEN}|" .env
            echo "-> Saved DISCORD_TOKEN to .env"
        fi
    else
        echo ""
        echo "  ⚠️ IMPORTANT: Edit ${BOT_DIR}/.env and set DISCORD_TOKEN="
        echo "     Get your token from: https://discord.com/developers/applications"
        echo ""
    fi
fi

# Systemd service
echo "-> Configuring systemd service..."

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

# Install global shortcut for fast restart
if [ -f "/var/www/vertex-panel/restart_bot.sh" ]; then
    cp -f "/var/www/vertex-panel/restart_bot.sh" /usr/local/bin/vertex-bot-restart 2>/dev/null || true
    chmod +x /usr/local/bin/vertex-bot-restart 2>/dev/null || true
    cp -f "/var/www/vertex-panel/restart_bot.sh" /usr/local/bin/bot-restart 2>/dev/null || true
    chmod +x /usr/local/bin/bot-restart 2>/dev/null || true
fi

echo "-> Starting service..."
systemctl daemon-reload
systemctl enable vertex-bot > /dev/null 2>&1 || true
systemctl restart vertex-bot

echo ""
echo "========================================"
echo "✅ Bot setup complete & running!"
echo "========================================"
echo ""
echo "Quick restart:   bot-restart  (or: bash restart_bot.sh)"
echo "View live logs:  journalctl -u vertex-bot -f"
echo "Bot config:      nano ${BOT_DIR}/.env"