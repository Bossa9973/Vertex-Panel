#!/usr/bin/env bash

# =============================================================================
#  Vertex Panel — Fast File Sync & Bot Restarter
#  Downloads latest code directly from GitHub and syncs files safely.
#  Does NOT touch .env, database, storage, vendor, or node_modules.
#
#  One-liner usage:
#  curl -fsSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/sync.sh | bash
# =============================================================================

set -euo pipefail

# --- ANSI Colors --------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# --- Configuration ------------------------------------------------------------
GITHUB_REPO="Bossa9973/Vertex-Panel"
GITHUB_BRANCH="main"
DEFAULT_INSTALL_DIR="/var/www/vertex-panel"

# --- Output Helpers -----------------------------------------------------------
info()    { printf "  ${CYAN}*${RESET}  %b\n" "$1"; }
success() { printf "  ${GREEN}✔${RESET}  ${GREEN}%b${RESET}\n" "$1"; }
warn()    { printf "  ${YELLOW}⚠${RESET}  ${YELLOW}%b${RESET}\n" "$1"; }
error()   { printf "  ${RED}✖${RESET}  ${RED}${BOLD}%b${RESET}\n" "$1"; }

printf "\n${BLUE}${BOLD}"
printf "  =======================================================\n"
printf "     Vertex Panel — Fast File Sync & Bot Restarter\n"
printf "  =======================================================\n${RESET}\n"

# 1. Root check
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Try: sudo bash sync.sh"
    exit 1
fi

# 2. Locate Panel directory
INSTALL_DIR=""
if [[ -f "./artisan" && -d "./bot" ]]; then
    INSTALL_DIR="$(pwd)"
elif [[ -d "$DEFAULT_INSTALL_DIR" ]]; then
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
else
    error "Vertex Panel directory not found. Expected: ${DEFAULT_INSTALL_DIR}"
    exit 1
fi

info "Target directory: ${BOLD}${INSTALL_DIR}${RESET}"

# 3. Ensure required tools exist (curl, unzip, rsync)
MISSING_TOOLS=()
for tool in curl unzip rsync; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        MISSING_TOOLS+=("$tool")
    fi
done

if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
    info "Installing missing dependencies: ${MISSING_TOOLS[*]}..."
    apt-get update -y >/dev/null 2>&1 || true
    apt-get install -y "${MISSING_TOOLS[@]}" >/dev/null 2>&1 || true
fi

# 4. Download latest archive from GitHub
TMP_ZIP="/tmp/vertex-sync-$$.zip"
TMP_DIR="/tmp/vertex-sync-src-$$"

cleanup() {
    rm -f "$TMP_ZIP" 2>/dev/null || true
    rm -rf "$TMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

info "Downloading latest archive from GitHub (${GITHUB_REPO}@${GITHUB_BRANCH})..."
if ! curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TMP_ZIP"; then
    error "Failed to download code archive from GitHub. Check your internet connection."
    exit 1
fi

# 5. Extract archive
info "Extracting archive..."
mkdir -p "$TMP_DIR"
unzip -q -o "$TMP_ZIP" -d "$TMP_DIR"

SRC_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d -not -path "$TMP_DIR" | head -1)
if [[ -z "$SRC_DIR" || ! -d "$SRC_DIR" ]]; then
    error "Failed to locate extracted source directory."
    exit 1
fi

# 6. Safely sync files into panel directory (preserving user configs & persistent dirs)
info "Syncing updated files into ${INSTALL_DIR}..."
rsync -a \
    --exclude='.env' \
    --exclude='bot/.env' \
    --exclude='bot/venv/' \
    --exclude='bot/__pycache__/' \
    --exclude='storage/' \
    --exclude='public/storage' \
    --exclude='node_modules/' \
    --exclude='vendor/' \
    --exclude='.git/' \
    --exclude='sync.sh' \
    "${SRC_DIR}/" "${INSTALL_DIR}/"

success "Files updated successfully!"

# 7. Clear Laravel caches so new routes & controllers take effect immediately
if command -v php >/dev/null 2>&1 && [[ -f "${INSTALL_DIR}/artisan" ]]; then
    info "Refreshing Laravel route and config caches..."
    (cd "$INSTALL_DIR" && php artisan route:clear >/dev/null 2>&1 || true)
    (cd "$INSTALL_DIR" && php artisan config:clear >/dev/null 2>&1 || true)
    success "Laravel cache cleared."
fi

# 8. Restart Discord Bot if running or script is present
info "Restarting Discord Bot..."
if systemctl is-active --quiet vertex-bot 2>/dev/null; then
    systemctl restart vertex-bot
    sleep 1
    if systemctl is-active --quiet vertex-bot; then
        success "Bot restarted via systemd (vertex-bot)!"
    else
        warn "Bot restarted, check status: systemctl status vertex-bot"
    fi
elif [[ -f "${INSTALL_DIR}/restart_bot.sh" ]]; then
    (cd "$INSTALL_DIR" && bash restart_bot.sh >/dev/null 2>&1 || true)
    success "Bot restarted via restart_bot.sh!"
else
    info "Bot service not running."
fi

printf "\n${GREEN}${BOLD}=======================================================\n"
printf "  ✔  File Sync Complete! Everything is up to date.\n"
printf "=======================================================${RESET}\n\n"
