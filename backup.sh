#!/usr/bin/env bash
# =============================================================================
#
#  ##  ##  ####  #####  ####### ####  ##  ##
#  ##  ##  ##    ##  ##    ##   ##    ##  ##
#  ##  ##  ####  #####     ##   ####   ####
#   ####   ##    ## ##     ##   ##     ####
#    ##    ####  ##  ##    ##   #####  ## ##
#
#  Vertex Panel -- Automated Backup & Exporter v1.0
#  GitHub: https://github.com/Bossa9973/Vertex-Panel
#
#  Usage:
#  ./backup.sh
#  or
#  vertex backup
#
# =============================================================================

set -euo pipefail

# --- ANSI Colors & Banner ----------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

SPINNER_PID=""

spinner_start() {
    local msg="${1:-Working...}"
    (
        local frames=('-' '\\' '|' '/')
        local i=0
        while true; do
            printf "\r  \033[0;36m${frames[$i]}\033[0m  \033[0;37m%s\033[0m   " "$msg"
            i=$(( (i + 1) % 4 ))
            sleep 0.12
        done
    ) &
    SPINNER_PID=$!
    disown "$SPINNER_PID" 2>/dev/null || true
}

spinner_stop() {
    if [[ -n "$SPINNER_PID" ]]; then
        kill "$SPINNER_PID" 2>/dev/null || true
        wait "$SPINNER_PID" 2>/dev/null || true
        SPINNER_PID=""
        printf "\r\033[2K"
    fi
}

info()    { printf "   ${CYAN}*${RESET}  ${WHITE}%b${RESET}\n" "$1"; }
success() { printf "   ${GREEN}ok${RESET} ${GREEN}%b${RESET}\n" "$1"; }
warn()    { printf "   ${YELLOW}!!${RESET} ${YELLOW}%b${RESET}\n" "$1"; }
error_msg() { printf "   ${RED}xx${RESET} ${RED}${BOLD}%b${RESET}\n" "$1"; }

print_banner() {
    clear
    printf "\n"
    printf "${BLUE}${BOLD}"
    printf "   ##  ##  ####  #####   #######  ####  ##  ##\n"
    printf "   ##  ##  ##    ##  ##     ##    ##    ##  ##\n"
    printf "   ##  ##  ####  #####      ##    ####   ####\n"
    printf "    ####   ##    ## ##      ##    ##     ####\n"
    printf "     ##    ####  ##  ##     ##    #####  ## ##\n"
    printf "${RESET}\n"
    printf "   ${DIM}Automated Backup & Cloud Exporter${RESET}\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
}

# --- Determine Install Directory ----------------------------------------------
INSTALL_DIR="/var/www/vertex-panel"
if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
    if [[ -f "./.env" ]]; then
        INSTALL_DIR="$(pwd)"
    elif [[ -f "../.env" ]]; then
        INSTALL_DIR="$(cd .. && pwd)"
    fi
fi

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
    error_msg "Vertex Panel .env file not found at ${INSTALL_DIR}/.env"
    exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/vertex"
TMP_DIR="/tmp/vertex_backup_${TIMESTAMP}"
ARCHIVE_NAME="vertex-backup-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

mkdir -p "$BACKUP_DIR" "$TMP_DIR"
trap 'spinner_stop; rm -rf "$TMP_DIR"' EXIT

print_banner

info "Installation directory: ${BOLD}${INSTALL_DIR}${RESET}"
info "Backup output path:     ${BOLD}${ARCHIVE_PATH}${RESET}"
printf "\n"

# --- Parse .env values --------------------------------------------------------
get_env_var() {
    local key="$1"
    local default="${2:-}"
    local val
    val=$(grep -E "^${key}=" "${INSTALL_DIR}/.env" | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    echo "${val:-$default}"
}

DB_CONNECTION=$(get_env_var "DB_CONNECTION" "mysql")
DB_HOST=$(get_env_var "DB_HOST" "127.0.0.1")
DB_PORT=$(get_env_var "DB_PORT" "3306")
DB_DATABASE=$(get_env_var "DB_DATABASE" "vertex_panel")
DB_USERNAME=$(get_env_var "DB_USERNAME" "vertex_user")
DB_PASSWORD=$(get_env_var "DB_PASSWORD" "")

# --- 1. Export MySQL Database -------------------------------------------------
spinner_start "Exporting database '${DB_DATABASE}' (users, linked VPSes, settings)..."
DB_DUMP_FILE="${TMP_DIR}/database.sql"

MYSQL_PWD="$DB_PASSWORD" mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USERNAME" \
    --routines --triggers --single-transaction --quick "$DB_DATABASE" > "$DB_DUMP_FILE" 2>/dev/null || {
    # Try with root if user dump fails
    mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="root" \
        --routines --triggers --single-transaction --quick "$DB_DATABASE" > "$DB_DUMP_FILE" 2>/dev/null || {
        spinner_stop
        error_msg "Failed to dump database '${DB_DATABASE}'"
        exit 1
    }
}
spinner_stop
success "Database exported successfully ($(du -h "$DB_DUMP_FILE" | cut -f1))"

# --- 2. Collect Configuration & User Files ------------------------------------
spinner_start "Collecting user data, storage, and configuration files..."

# Copy .env
cp "${INSTALL_DIR}/.env" "${TMP_DIR}/.env"

# Copy storage directory (user uploads, keys, avatars, server data)
if [[ -d "${INSTALL_DIR}/storage" ]]; then
    mkdir -p "${TMP_DIR}/storage"
    rsync -a --exclude='storage/logs/*.log' --exclude='storage/framework/cache/data/*' "${INSTALL_DIR}/storage/" "${TMP_DIR}/storage/" 2>/dev/null || cp -r "${INSTALL_DIR}/storage" "${TMP_DIR}/"
fi

# Copy Supervisor config if present
if [[ -f "/etc/supervisor/conf.d/vertex-panel.conf" ]]; then
    mkdir -p "${TMP_DIR}/configs"
    cp "/etc/supervisor/conf.d/vertex-panel.conf" "${TMP_DIR}/configs/supervisor-vertex.conf" 2>/dev/null || true
fi

# Copy SSH keys or VPS keys if present in /root/.ssh or /var/www/.ssh
if [[ -d "/root/.ssh" ]]; then
    mkdir -p "${TMP_DIR}/keys/root_ssh"
    cp -r /root/.ssh/* "${TMP_DIR}/keys/root_ssh/" 2>/dev/null || true
fi
if [[ -d "/var/www/.ssh" ]]; then
    mkdir -p "${TMP_DIR}/keys/www_ssh"
    cp -r /var/www/.ssh/* "${TMP_DIR}/keys/www_ssh/" 2>/dev/null || true
fi

# Copy Let's Encrypt SSL configs & options if present
if [[ -d "/etc/letsencrypt" ]]; then
    mkdir -p "${TMP_DIR}/configs/letsencrypt"
    cp -r /etc/letsencrypt/* "${TMP_DIR}/configs/letsencrypt/" 2>/dev/null || true
fi

spinner_stop
success "Files collected (storage, .env, server configs, SSH keys)"

# --- 3. Generate Encryption Password & Create ZIP Archive -------------------
ZIP_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 16 || echo "VtxPass$(date +%s)")
ARCHIVE_NAME="vertex-backup-${TIMESTAMP}.zip"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

spinner_start "Ensuring zip utility is installed..."
if ! command -v zip &>/dev/null; then
    apt-get update -y >/dev/null 2>&1 && apt-get install -y zip >/dev/null 2>&1 || true
fi
spinner_stop

spinner_start "Compressing and encrypting backup archive (${ARCHIVE_NAME})..."
(cd "$TMP_DIR" && zip -q -r -P "$ZIP_PASSWORD" "$ARCHIVE_PATH" .)
spinner_stop

ARCHIVE_SIZE=$(du -h "$ARCHIVE_PATH" | cut -f1)
success "Encrypted backup package created: ${BOLD}${ARCHIVE_PATH}${RESET} (${ARCHIVE_SIZE})"
printf "\n"

# --- 4. Auto Upload to Free File Hosting Provider ------------------------------
spinner_start "Uploading backup to free cloud hosting..."

UPLOAD_URL=""
PROVIDER_NAME=""

# Provider 1: Litterbox (Catbox temporary host - supports up to 1GB, 72h retention)
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s -F "reqtype=fileupload" -F "time=72h" -F "fileToUpload=@${ARCHIVE_PATH}" https://litterbox.catbox.moe/resources/internals/api.php 2>/dev/null || true)
    if [[ "$RESP" =~ ^https?:// ]]; then
        UPLOAD_URL="$RESP"
        PROVIDER_NAME="Litterbox (72-hour storage)"
    fi
fi

# Provider 2: Catbox.moe (supports up to 200MB, permanent)
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s -F "reqtype=fileupload" -F "fileToUpload=@${ARCHIVE_PATH}" https://catbox.moe/user/api.php 2>/dev/null || true)
    if [[ "$RESP" =~ ^https?:// ]]; then
        UPLOAD_URL="$RESP"
        PROVIDER_NAME="Catbox.moe (Permanent)"
    fi
fi

# Provider 3: 0x0.st (supports up to 512MB)
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s -F "file=@${ARCHIVE_PATH}" https://0x0.st 2>/dev/null || true)
    if [[ "$RESP" =~ ^https?:// ]]; then
        UPLOAD_URL="$RESP"
        PROVIDER_NAME="0x0.st"
    fi
fi

# Provider 4: BashUpload.com
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s https://bashupload.com/ -T "${ARCHIVE_PATH}" 2>/dev/null || true)
    URL_EXTRACT=$(echo "$RESP" | grep -oE 'https://bashupload\.com/[a-zA-Z0-9._-]+' | head -n1 || true)
    if [[ -n "$URL_EXTRACT" ]]; then
        UPLOAD_URL="$URL_EXTRACT"
        PROVIDER_NAME="BashUpload.com"
    fi
fi

# Provider 5: File.io
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s -F "file=@${ARCHIVE_PATH}" https://file.io 2>/dev/null || true)
    URL_EXTRACT=$(echo "$RESP" | grep -oP '"link":"\K[^"]+' || true)
    if [[ -n "$URL_EXTRACT" ]]; then
        UPLOAD_URL="$URL_EXTRACT"
        PROVIDER_NAME="File.io (Single download)"
    fi
fi

# Provider 6: Transfer.sh
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s --upload-file "${ARCHIVE_PATH}" "https://transfer.sh/${ARCHIVE_NAME}" 2>/dev/null || true)
    if [[ "$RESP" =~ ^https?:// ]]; then
        UPLOAD_URL="$RESP"
        PROVIDER_NAME="Transfer.sh"
    fi
fi

spinner_stop

# --- Output Final Summary ----------------------------------------------------
printf "   ${DIM}------------------------------------------------------------${RESET}\n"
printf "   ${GREEN}${BOLD}Backup Successfully Completed!${RESET}\n"
printf "   ${DIM}------------------------------------------------------------${RESET}\n\n"

printf "   ${BOLD}Backup Encryption Password:${RESET}\n"
printf "     ${YELLOW}${BOLD}%s${RESET}  ${DIM}(SAVE THIS PASSWORD FOR RESTORING!)${RESET}\n\n" "$ZIP_PASSWORD"

printf "   ${BOLD}Local Archive Location:${RESET}\n"
printf "     ${CYAN}${BOLD}%s${RESET} (${ARCHIVE_SIZE})\n\n" "$ARCHIVE_PATH"

if [[ -n "$UPLOAD_URL" ]]; then
    printf "   ${GREEN}${BOLD}Cloud Upload Success! (${PROVIDER_NAME})${RESET}\n"
    printf "   ${BOLD}Download Link:${RESET}\n"
    printf "     ${CYAN}${BOLD}%s${RESET}\n\n" "$UPLOAD_URL"
    printf "   ${BOLD}To install this backup on a new VPS with ZERO setup, run:${RESET}\n"
    printf "     ${CYAN}${BOLD}curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/restore.sh | bash -s -- %s %s${RESET}\n" "$UPLOAD_URL" "$ZIP_PASSWORD"
    printf "     ${DIM}or${RESET}\n"
    printf "     ${CYAN}${BOLD}./restore.sh %s${RESET}\n\n" "$UPLOAD_URL"
else
    warn "Automated cloud upload was unavailable or offline."
    printf "   ${BOLD}You can manually transfer your backup file to a new VPS:${RESET}\n"
    printf "     ${CYAN}${BOLD}scp %s root@<new-vps-ip>:/tmp/${RESET}\n" "$ARCHIVE_PATH"
    printf "   ${BOLD}Then on the new VPS, run:${RESET}\n"
    printf "     ${CYAN}${BOLD}./restore.sh /tmp/%s${RESET}\n\n" "$ARCHIVE_NAME"
fi

printf "   ${DIM}------------------------------------------------------------${RESET}\n\n"
