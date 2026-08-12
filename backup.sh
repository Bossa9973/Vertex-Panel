#!/usr/bin/env bash
# =============================================================================
#
#  ##  ##  ####  #####  ####### ####  ##  ##
#  ##  ##  ##    ##  ##    ##   ##    ##  ##
#  ##  ##  ####  #####     ##   ####   ####
#   ####   ##    ## ##     ##   ##     ####
#    ##    ####  ##  ##    ##   #####  ## ##
#
#  Vertex Panel -- Essential Data Backup v2.0
#  GitHub: https://github.com/Bossa9973/Vertex-Panel
#
#  What IS backed up (only what is irreplaceable):
#    1. Full MySQL dump   вЂ” users, balances, credits, transactions, linked VPSes,
#                           nodes, promo_codes, discord_tracking, reseller tables,
#                           settings, admin_roles, backups, ip_addresses, etc.
#    2. .env              вЂ” APP_KEY (encrypt/decrypt), DB creds, OAuth secrets,
#                           payment gateway keys (Maxelpay / NowPayments)
#    3. storage/app/      вЂ” user-uploaded files and avatars
#
#  What is intentionally SKIPPED (all regeneratable):
#    - storage/framework/cache, views, sessions  в†’  php artisan optimize
#    - storage/logs/                             в†’  not useful to restore
#    - SSH keys / Let's Encrypt certs            в†’  infra-level, not panel data
#    - Nginx / Supervisor configs                в†’  rewritten by restore.sh
#
#  Usage:  ./backup.sh   or   vertex backup
#
# =============================================================================

set -euo pipefail

# --- Colors ------------------------------------------------------------------
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

info()      { printf "   ${CYAN}*${RESET}  ${WHITE}%b${RESET}\n" "$1"; }
success()   { printf "   ${GREEN}ok${RESET} ${GREEN}%b${RESET}\n" "$1"; }
warn()      { printf "   ${YELLOW}!!${RESET} ${YELLOW}%b${RESET}\n" "$1"; }
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
    printf "   ${DIM}Essential Data Backup  v2.0${RESET}\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
}

# --- Locate installation directory -------------------------------------------
INSTALL_DIR="/var/www/vertex-panel"
if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
    if   [[ -f "./.env"  ]]; then INSTALL_DIR="$(pwd)"
    elif [[ -f "../.env" ]]; then INSTALL_DIR="$(cd .. && pwd)"
    fi
fi

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
    error_msg "Vertex Panel .env not found. Run from the panel directory or /var/www/vertex-panel."
    exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/vertex"
TMP_DIR="/tmp/vertex_backup_${TIMESTAMP}"
mkdir -p "$BACKUP_DIR" "$TMP_DIR"
trap 'spinner_stop; rm -rf "$TMP_DIR"' EXIT

print_banner
info "Install directory : ${BOLD}${INSTALL_DIR}${RESET}"
info "Backup output     : ${BOLD}${BACKUP_DIR}${RESET}"
printf "\n"

# --- Parse .env values -------------------------------------------------------
get_env_var() {
    local key="$1" default="${2:-}" val
    val=$(grep -E "^${key}=" "${INSTALL_DIR}/.env" | cut -d '=' -f2- \
          | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)
    printf '%s' "${val:-$default}"
}

DB_HOST=$(get_env_var "DB_HOST" "127.0.0.1")
DB_PORT=$(get_env_var "DB_PORT" "3306")
DB_DATABASE=$(get_env_var "DB_DATABASE" "vertex_panel")
DB_USERNAME=$(get_env_var "DB_USERNAME" "vertex_user")
DB_PASSWORD=$(get_env_var "DB_PASSWORD" "")

# =============================================================================
# STEP 1 вЂ” Full MySQL database dump
# =============================================================================
spinner_start "Exporting database '${DB_DATABASE}' (users, credits, VPSes, nodesвЂ¦)"
DB_DUMP="${TMP_DIR}/database.sql"
DUMP_OK=false

if MYSQL_PWD="$DB_PASSWORD" mysqldump \
        --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USERNAME" \
        --single-transaction --quick --routines --triggers --add-drop-table \
        "$DB_DATABASE" > "$DB_DUMP" 2>/dev/null; then
    DUMP_OK=true
elif mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="root" \
        --single-transaction --quick --routines --triggers --add-drop-table \
        "$DB_DATABASE" > "$DB_DUMP" 2>/dev/null; then
    DUMP_OK=true
fi

spinner_stop
if [[ "$DUMP_OK" == "true" ]]; then
    success "Database exported ($(du -h "$DB_DUMP" | cut -f1)) вЂ” all accounts, credits & linked VPSes included"
else
    error_msg "Failed to dump '${DB_DATABASE}'. Is MySQL/MariaDB running?"
    exit 1
fi

# =============================================================================
# STEP 2 вЂ” .env (APP_KEY + all secrets)
# =============================================================================
spinner_start "Saving environment file (.env)вЂ¦"
cp "${INSTALL_DIR}/.env" "${TMP_DIR}/.env"
spinner_stop
success "Environment file saved вЂ” APP_KEY, OAuth & payment secrets included"

# =============================================================================
# STEP 3 вЂ” storage/app/ user uploads only
#          Deliberately excludes framework/, logs/ (all regeneratable)
# =============================================================================
if [[ -d "${INSTALL_DIR}/storage/app" ]]; then
    spinner_start "Collecting user uploads (storage/app/)вЂ¦"
    mkdir -p "${TMP_DIR}/storage/app"
    rsync -a --quiet "${INSTALL_DIR}/storage/app/" "${TMP_DIR}/storage/app/" 2>/dev/null \
        || cp -r "${INSTALL_DIR}/storage/app/." "${TMP_DIR}/storage/app/"
    spinner_stop
    APP_SIZE=$(du -sh "${TMP_DIR}/storage/app" 2>/dev/null | cut -f1 || echo "?")
    success "User uploads saved (${APP_SIZE}) вЂ” framework cache & logs excluded"
else
    warn "storage/app/ not found вЂ” skipping (no user uploads)"
fi

# =============================================================================
# STEP 4 вЂ” Manifest
# =============================================================================
{
    printf "Vertex Panel Essential Backup\n"
    printf "Timestamp   : %s\n" "$TIMESTAMP"
    printf "Panel Dir   : %s\n" "$INSTALL_DIR"
    printf "DB Name     : %s\n" "$DB_DATABASE"
    printf "\n"
    printf "Contents:\n"
    printf "  database.sql     Full MySQL dump (users, credits, VPSes, nodes, settings)\n"
    printf "  .env             APP_KEY, DB creds, OAuth & payment secrets\n"
    printf "  storage/app/     User-uploaded files and avatars\n"
    printf "\n"
    printf "Restore:\n"
    printf "  curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/restore.sh | bash -s -- <URL> <PASSWORD>\n"
} > "${TMP_DIR}/BACKUP_MANIFEST.txt"

# =============================================================================
# STEP 5 вЂ” Compress & encrypt
# =============================================================================
ZIP_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 20 \
               || printf 'VtxBak%s' "$(date +%s)")
ARCHIVE_NAME="vertex-backup-${TIMESTAMP}.zip"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

if ! command -v zip &>/dev/null; then
    spinner_start "Installing zip utilityвЂ¦"
    apt-get install -y zip >/dev/null 2>&1 || true
    spinner_stop
fi

spinner_start "Compressing & encrypting archiveвЂ¦"
(cd "$TMP_DIR" && zip -q -r -P "$ZIP_PASSWORD" "$ARCHIVE_PATH" .)
spinner_stop
ARCHIVE_SIZE=$(du -h "$ARCHIVE_PATH" | cut -f1)
success "Encrypted archive ready: ${BOLD}${ARCHIVE_PATH}${RESET} (${ARCHIVE_SIZE})"
printf "\n"

# =============================================================================
# STEP 6 вЂ” Upload (cascading provider fallback)
# =============================================================================
spinner_start "Uploading backup to cloud storageвЂ¦"
UPLOAD_URL=""
PROVIDER_NAME=""

# 1 вЂ” Litterbox (up to 1 GB, 72-hour retention)
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s --max-time 180 \
        -F "reqtype=fileupload" -F "time=72h" \
        -F "fileToUpload=@${ARCHIVE_PATH}" \
        https://litterbox.catbox.moe/resources/internals/api.php 2>/dev/null || true)
    [[ "$RESP" =~ ^https?:// ]] && { UPLOAD_URL="$RESP"; PROVIDER_NAME="Litterbox (72-hour)"; }
fi

# 2 вЂ” Catbox (permanent, up to 200 MB)
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s --max-time 120 \
        -F "reqtype=fileupload" \
        -F "fileToUpload=@${ARCHIVE_PATH}" \
        https://catbox.moe/user/api.php 2>/dev/null || true)
    [[ "$RESP" =~ ^https?:// ]] && { UPLOAD_URL="$RESP"; PROVIDER_NAME="Catbox.moe (permanent)"; }
fi

# 3 вЂ” 0x0.st (up to 512 MB)
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s --max-time 120 \
        -F "file=@${ARCHIVE_PATH}" \
        https://0x0.st 2>/dev/null || true)
    [[ "$RESP" =~ ^https?:// ]] && { UPLOAD_URL="$RESP"; PROVIDER_NAME="0x0.st"; }
fi

# 4 вЂ” transfer.sh
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s --max-time 120 \
        --upload-file "${ARCHIVE_PATH}" \
        "https://transfer.sh/${ARCHIVE_NAME}" 2>/dev/null || true)
    [[ "$RESP" =~ ^https?:// ]] && { UPLOAD_URL="$RESP"; PROVIDER_NAME="Transfer.sh"; }
fi

# 5 вЂ” File.io (single-download)
if [[ -z "$UPLOAD_URL" ]]; then
    RESP=$(curl -s --max-time 120 \
        -F "file=@${ARCHIVE_PATH}" \
        https://file.io 2>/dev/null || true)
    URL_EXTRACT=$(printf '%s' "$RESP" | grep -oP '"link":"\K[^"]+' || true)
    [[ -n "$URL_EXTRACT" ]] && { UPLOAD_URL="$URL_EXTRACT"; PROVIDER_NAME="File.io (single download)"; }
fi

spinner_stop

# =============================================================================
# Summary
# =============================================================================
printf "   ${DIM}------------------------------------------------------------${RESET}\n"
printf "   ${GREEN}${BOLD}Backup Completed!${RESET}\n"
printf "   ${DIM}------------------------------------------------------------${RESET}\n\n"

printf "   ${BOLD}Encryption Password  ${DIM}(SAVE THIS to restore!)${RESET}:\n"
printf "     ${YELLOW}${BOLD}%s${RESET}\n\n" "$ZIP_PASSWORD"

printf "   ${BOLD}Local Archive:${RESET}\n"
printf "     ${CYAN}%s${RESET}  (%s)\n\n" "$ARCHIVE_PATH" "$ARCHIVE_SIZE"

printf "   ${BOLD}Backed-up data:${RESET}\n"
printf "     ${GREEN}вњ“${RESET}  MySQL dump  (users В· credits В· linked VPSes В· nodes В· settings)\n"
printf "     ${GREEN}вњ“${RESET}  .env        (APP_KEY В· OAuth secrets В· payment keys)\n"
printf "     ${GREEN}вњ“${RESET}  storage/app (user uploads & avatars)\n\n"

if [[ -n "$UPLOAD_URL" ]]; then
    printf "   ${GREEN}${BOLD}Cloud Upload Success вЂ” ${PROVIDER_NAME}${RESET}\n"
    printf "   ${BOLD}Download URL:${RESET}\n"
    printf "     ${CYAN}${BOLD}%s${RESET}\n\n" "$UPLOAD_URL"
    printf "   ${BOLD}One-liner restore on a fresh VPS:${RESET}\n"
    printf "     ${CYAN}${BOLD}curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/restore.sh | bash -s -- %s %s${RESET}\n\n" \
        "$UPLOAD_URL" "$ZIP_PASSWORD"
else
    warn "Cloud upload unavailable. Transfer the file manually:"
    printf "     ${CYAN}scp %s root@<new-vps>:/tmp/${RESET}\n" "$ARCHIVE_PATH"
    printf "     ${CYAN}./restore.sh /tmp/%s %s${RESET}\n\n" "$ARCHIVE_NAME" "$ZIP_PASSWORD"
fi

printf "   ${DIM}------------------------------------------------------------${RESET}\n\n"

