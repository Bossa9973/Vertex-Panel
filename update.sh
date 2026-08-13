#!/usr/bin/env bash
# =============================================================================
#
#  ##  ##  ####  #####  ####### ####  ##  ##
#  ##  ##  ##    ##  ##    ##   ##    ##  ##
#  ##  ##  ####  #####     ##   ####   ####
#   ####   ##    ## ##     ##   ##     ####
#    ##    ####  ##  ##    ##   #####  ## ##
#
#  Vertex Panel -- Automated Updater v1.0
#  GitHub: https://github.com/Bossa9973/Vertex-Panel
#
#  One-liner update command:
#  curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/update.sh | bash
#
# =============================================================================

set -euo pipefail

# --- Constants ----------------------------------------------------------------
GITHUB_REPO="Bossa9973/Vertex-Panel"
GITHUB_BRANCH="main"
DEFAULT_INSTALL_DIR="/var/www/vertex-panel"
SERVICE_USER="www-data"

# --- ANSI Colors --------------------------------------------------------------
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

# --- Spinner ------------------------------------------------------------------
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

# --- Output Helpers -----------------------------------------------------------
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
    printf "   ${DIM}Panel Updater  |  Powered by Laravel & Proxmox${RESET}\n"
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
}

run_quietly() { "$@" > /dev/null 2>&1 || true; }

info()    { printf "   ${CYAN}*${RESET}  ${WHITE}%b${RESET}\n" "$1"; }
success() { printf "   ${GREEN}ok${RESET} ${GREEN}%b${RESET}\n" "$1"; }
warn()    { printf "   ${YELLOW}!!${RESET} ${YELLOW}%b${RESET}\n" "$1"; }
error_msg() { printf "   ${RED}xx${RESET} ${RED}${BOLD}%b${RESET}\n" "$1"; }

run_or_fail() {
    local msg="$1"
    shift
    spinner_start "$msg"
    if "$@" > /tmp/vertex_update.log 2>&1; then
        spinner_stop
        success "$msg"
    else
        spinner_stop
        error_msg "Failed: $msg"
        printf "   ${DIM}Details: /tmp/vertex_update.log${RESET}\n"
        return 1
    fi
}

# --- Pre-flight Checks --------------------------------------------------------
preflight_checks() {
    if [[ $EUID -ne 0 ]]; then
        error_msg "Must be run as root. Try: sudo bash update.sh"
        exit 1
    fi

    # Determine panel directory
    if [[ -f "./artisan" && -f "./package.json" ]]; then
        INSTALL_DIR="$(pwd)"
    elif [[ -d "$DEFAULT_INSTALL_DIR" ]]; then
        INSTALL_DIR="$DEFAULT_INSTALL_DIR"
    else
        error_msg "Vertex Panel directory not found. Expected: ${DEFAULT_INSTALL_DIR}"
        exit 1
    fi

    info "Panel directory: ${BOLD}${INSTALL_DIR}${RESET}"

    if ! curl -s --connect-timeout 5 https://github.com > /dev/null 2>&1; then
        error_msg "No internet access. Cannot reach GitHub."
        exit 1
    fi
}

# --- Perform Update -----------------------------------------------------------
perform_update() {
    cd "$INSTALL_DIR"

    # Get current version before update
    OLD_VER=$(grep -oP '(?<="version": ")[^"]+' package.json 2>/dev/null | head -1 || echo "1.0.0")

    # Maintenance mode
    spinner_start "Enabling maintenance mode"
    php artisan down --no-interaction > /dev/null 2>&1 || true
    spinner_stop
    success "Panel put into maintenance mode"

    # Track launching script path if executed from a local file
    local launch_script=""
    if [[ -n "${0:-}" && -f "$0" ]]; then
        launch_script="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
    fi

    # Process-isolated temp paths to prevent workspace/execution path collision
    local tmp_zip="/tmp/vertex-panel-update-$$.zip"
    local tmp_dir="/tmp/vertex-panel-update-src-$$"

    spinner_start "Downloading latest release from GitHub (${GITHUB_REPO})"
    if curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$tmp_zip" 2>/tmp/vertex_update.log; then
        spinner_stop
        local size
        size=$(du -sh "$tmp_zip" | cut -f1)
        success "Downloaded update archive (${size})"
    else
        spinner_stop
        error_msg "Download failed. Check internet connection."
        php artisan up --no-interaction 2>/dev/null || true
        exit 1
    fi

    # Extract update
    run_or_fail "Extracting update archive" unzip -q -o "$tmp_zip" -d "$tmp_dir"

    local src_dir
    src_dir=$(find "$tmp_dir" -maxdepth 1 -type d -not -path "$tmp_dir" | head -1)

    # Set global & process Node memory limit to 8192 MB
    export NODE_OPTIONS="--max-old-space-size=8192"
    if ! grep -q "NODE_OPTIONS" /etc/environment 2>/dev/null; then
        echo 'export NODE_OPTIONS="--max-old-space-size=8192"' >> /etc/environment 2>/dev/null || true
    fi

    # Detect changes BEFORE rsync overwrites INSTALL_DIR
    FRONTEND_CHANGED=false
    if [[ ! -f "${INSTALL_DIR}/public/build/manifest.json" ]]; then
        FRONTEND_CHANGED=true
    else
        for f in \
            "${src_dir}/package.json" \
            "${src_dir}/vite.config.ts" \
            "${src_dir}/tailwind.config.js" \
            "${src_dir}/postcss.config.js"; do
            if [[ -f "$f" ]]; then
                local_f="${INSTALL_DIR}/$(basename "$f")"
                if [[ ! -f "$local_f" ]] || ! diff -q "$f" "$local_f" > /dev/null 2>&1; then
                    FRONTEND_CHANGED=true
                    break
                fi
            fi
        done
        if [[ "$FRONTEND_CHANGED" == false ]]; then
            if ! diff -rq --exclude='*.map' "${src_dir}/resources/" "${INSTALL_DIR}/resources/" > /dev/null 2>&1; then
                FRONTEND_CHANGED=true
            fi
        fi
    fi

    # Sync files safely (preserving .env, storage, node_modules, vendor, update.sh, and user files)
    spinner_start "Syncing panel files"
    if rsync -a --delete \
        --exclude='.env' \
        --exclude='storage/' \
        --exclude='public/storage' \
        --exclude='node_modules/' \
        --exclude='vendor/' \
        --exclude='.git/' \
        --exclude='update.sh' \
        --exclude='install.sh' \
        "${src_dir}/" "${INSTALL_DIR}/" > /tmp/vertex_update.log 2>&1; then
        spinner_stop
        success "Panel files updated"
    else
        spinner_stop
        error_msg "Failed to sync files."
        php artisan up --no-interaction 2>/dev/null || true
        exit 1
    fi

    # Ensure update.sh is preserved in panel directory, global PATH, and original launch location (never deleted)
    if [[ -f "${src_dir}/update.sh" ]]; then
        cp -f "${src_dir}/update.sh" "${INSTALL_DIR}/update.sh" 2>/dev/null || true
        chmod +x "${INSTALL_DIR}/update.sh" 2>/dev/null || true

        cp -f "${src_dir}/update.sh" "/usr/local/bin/update.sh" 2>/dev/null || true
        chmod +x "/usr/local/bin/update.sh" 2>/dev/null || true

        cp -f "${src_dir}/update.sh" "/usr/local/bin/vertex-update" 2>/dev/null || true
        chmod +x "/usr/local/bin/vertex-update" 2>/dev/null || true

        if [[ -n "$launch_script" && -f "$launch_script" ]]; then
            cp -f "${src_dir}/update.sh" "$launch_script" 2>/dev/null || true
            chmod +x "$launch_script" 2>/dev/null || true
        fi
    fi

    # Clean up downloaded zip
    run_quietly rm -rf "$tmp_zip" "$tmp_dir"

    # Always update Composer autoloader (takes 1.5s) to guarantee new PHP classes are autoloaded
    run_or_fail "Updating PHP dependencies & autoloader" \
        composer install --no-dev --optimize-autoloader --no-interaction -d "${INSTALL_DIR}"

    if [[ "$FRONTEND_CHANGED" == true ]]; then
        if [[ -d "${INSTALL_DIR}/node_modules" ]]; then
            run_or_fail "Installing Node.js dependencies (offline cache)" \
                npm install --prefix "${INSTALL_DIR}" --legacy-peer-deps --no-audit --no-fund --prefer-offline
        else
            run_or_fail "Installing Node.js dependencies (full download)" \
                npm install --prefix "${INSTALL_DIR}" --legacy-peer-deps --no-audit --no-fund
        fi

        spinner_start "Building frontend assets (Vite)"
        if npm run build --prefix "${INSTALL_DIR}" > /tmp/vertex_update.log 2>&1; then
            spinner_stop
            success "Building frontend assets (Vite)"
        else
            spinner_stop
            warn "Vite build encountered stale/corrupted node_modules. Performing automatic repair..."
            rm -rf "${INSTALL_DIR}/node_modules"
            run_or_fail "Reinstalling clean Node.js dependencies" \
                npm install --prefix "${INSTALL_DIR}" --legacy-peer-deps --no-audit --no-fund
            run_or_fail "Building frontend assets (Vite)" \
                npm run build --prefix "${INSTALL_DIR}"
        fi
    else
        info "No frontend changes detected — using precompiled Vite assets"
    fi

    # Laravel cache — clear stale, then re-cache
    run_or_fail "Clearing & re-caching application" \
        bash -c "cd '${INSTALL_DIR}' && php artisan optimize:clear && php artisan optimize"

    # Database migrations
    run_or_fail "Running database migrations" \
        php artisan migrate --force --no-interaction

    run_quietly php artisan view:clear 2>/dev/null || true

    # File permissions
    spinner_start "Updating file permissions"
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" > /dev/null 2>&1 || true
    chmod -R 775 "${INSTALL_DIR}/storage" "${INSTALL_DIR}/bootstrap/cache" "${INSTALL_DIR}/public/build" > /dev/null 2>&1 || true
    spinner_stop
    success "File permissions updated"

    # Restart background services
    spinner_start "Restarting background services & workers"
    local fpm_svc
    fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
    if [[ -n "$fpm_svc" ]]; then
        run_quietly systemctl restart "$fpm_svc" 2>/dev/null || true
    fi
    run_quietly systemctl restart nginx 2>/dev/null || true
    run_quietly systemctl restart supervisor 2>/dev/null || true
    run_quietly supervisorctl restart all 2>/dev/null || true
    spinner_stop
    success "Services and queue/horizon workers restarted"

    # Disable maintenance mode
    spinner_start "Bringing panel back online"
    php artisan up --no-interaction > /dev/null 2>&1 || true
    spinner_stop
    success "Panel is back online"

    NEW_VER=$(grep -oP '(?<="version": ")[^"]+' package.json 2>/dev/null | head -1 || echo "1.0.0")
}

# --- Completion Summary -------------------------------------------------------
print_summary() {
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
    printf "   ${GREEN}${BOLD}Update Complete!${RESET}\n"
    printf "\n"
    printf "   ${BOLD}Previous Version:${RESET} ${DIM}%s${RESET}\n" "${OLD_VER:-1.0.0}"
    printf "   ${BOLD}Current Version:${RESET}  ${GREEN}${BOLD}%s${RESET}\n" "${NEW_VER:-1.0.0}"
    printf "   ${BOLD}Panel Dir:${RESET}        ${DIM}%s${RESET}\n" "$INSTALL_DIR"
    printf "   ${BOLD}Updater Script:${RESET}   ${GREEN}%s/update.sh${RESET} (and ${GREEN}vertex-update${RESET} in PATH)\n" "$INSTALL_DIR"
    printf "\n"
    printf "   ${BOLD}Worker Status:${RESET}\n"
    supervisorctl status 2>/dev/null | sed 's/^/   /' || printf "   Supervisor workers restarted\n"
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
}

cleanup() {
    spinner_stop
    if [[ -n "${INSTALL_DIR:-}" && -f "${INSTALL_DIR}/artisan" ]]; then
        (cd "$INSTALL_DIR" && php artisan up --no-interaction > /dev/null 2>&1 || true)
    fi
}
trap 'cleanup; printf "\n   ${RED}Update interrupted or failed. See /tmp/vertex_update.log${RESET}\n"; exit 1' ERR INT TERM

print_banner
preflight_checks
perform_update
print_summary
