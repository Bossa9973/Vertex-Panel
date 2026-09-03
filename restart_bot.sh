#!/usr/bin/env bash



# Fast Bot Restarter — instant restart with zero dependency re-downloading

set -e



echo "========================================"

echo "   Restarting Vertex Discord Bot..."

echo "========================================"



BOT_DIR="/var/www/vertex-panel/bot"
if [ ! -d "$BOT_DIR" ]; then
    BOT_DIR="/opt/vertex-bot"
fi

# Self-heal: If venv is missing or broken, automatically rebuild it via start_bot.sh
if [ ! -x "${BOT_DIR}/venv/bin/python" ] || ! "${BOT_DIR}/venv/bin/python" -c "import discord" 2>/dev/null; then
    echo "⚠️ Python environment missing or broken. Auto-repairing via start_bot.sh..."
    if [ -f "/var/www/vertex-panel/start_bot.sh" ]; then
        bash /var/www/vertex-panel/start_bot.sh
        exit $?
    elif [ -f "./start_bot.sh" ]; then
        bash ./start_bot.sh
        exit $?
    fi
fi

if [ -f /etc/systemd/system/vertex-bot.service ]; then
    systemctl restart vertex-bot
    sleep 1
    if systemctl is-active --quiet vertex-bot; then
        echo "✅ Bot restarted successfully via systemd!"
        echo ""
        echo "Recent logs:"
        journalctl -u vertex-bot -n 8 --no-pager
    else
        echo "⚠️ Bot failed to start. Auto-repairing via start_bot.sh..."
        if [ -f "/var/www/vertex-panel/start_bot.sh" ]; then
            bash /var/www/vertex-panel/start_bot.sh
            exit $?
        fi
        echo "Recent error logs:"
        journalctl -u vertex-bot -n 15 --no-pager
        exit 1
    fi

else

    if [ -d "/var/www/vertex-panel/bot" ]; then

        BOT_DIR="/var/www/vertex-panel/bot"

    else

        BOT_DIR="/opt/vertex-bot"

    fi



    echo "-> Restarting standalone process in ${BOT_DIR}..."

    pkill -f "python.*main.py" 2>/dev/null || true

    sleep 0.5

    if [ -f "${BOT_DIR}/venv/bin/python" ]; then

        nohup "${BOT_DIR}/venv/bin/python" "${BOT_DIR}/main.py" > /tmp/vertex_bot.log 2>&1 &

        echo "✅ Bot restarted in background (PID: $!)."

        echo "View logs: tail -f /tmp/vertex_bot.log"

    else

        echo "❌ Python venv not found. Please run bash start_bot.sh once to initialize."

        exit 1

    fi

fi