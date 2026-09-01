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

    echo "-> Updating system package lists..."

    apt-get update -y > /dev/null 2>&1 || true



    echo "-> Installing git..."

    apt-get install -y git > /dev/null 2>&1 || true



    if [ -d "$BOT_DIR/.git" ]; then

        echo "-> Updating existing bot files from GitHub..."

        git -C "$BOT_DIR" pull > /dev/null 2>&1 || true

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



# Python environment

echo "-> Installing Python packages..."

apt-get update -y > /dev/null 2>&1 || true

apt-get install -y python3 python3-pip python3-venv python3-full python3-virtualenv virtualenv > /dev/null 2>&1 || true



if [ ! -f "venv/bin/activate" ]; then

    echo "-> Creating isolated virtual environment..."

    rm -rf venv

    python3 -m venv venv 2>/dev/null || virtualenv -p python3 venv 2>/dev/null || python3 -m virtualenv venv 2>/dev/null || true

fi



if [ ! -f "venv/bin/activate" ]; then

    echo "❌ Error: Failed to create Python virtual environment."

    echo "   Please run: apt-get install -y python3-venv python3-full"

    exit 1

fi



echo "-> Activating environment..."

source venv/bin/activate



echo "-> Installing bot requirements..."

pip install --upgrade pip > /dev/null 2>&1 || true

pip install -r requirements.txt > /dev/null 2>&1 || pip install -r requirements.txt



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

CURRENT_TOKEN=$(grep '^DISCORD_TOKEN=' .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")

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