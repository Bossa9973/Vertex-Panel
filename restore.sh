#!/usr/bin/env bash
# =============================================================================
#
#  ##  ##  ####  #####  ####### ####  ##  ##
#  ##  ##  ##    ##  ##    ##   ##    ##  ##
#  ##  ##  ####  #####     ##   ####   ####
#   ####   ##    ## ##     ##   ##     ####
#    ##    ####  ##  ##    ##   #####  ## ##
#
#  Vertex Panel -- Automated Backup Restore & Migration Installer v1.0
#  GitHub: https://github.com/Bossa9973/Vertex-Panel
#
#  One-liner Restore Command:
#  curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/restore.sh | bash -s -- <BACKUP_URL_OR_FILE> [PASSWORD]
#
# =============================================================================

set -euo pipefail

# --- Constants ----------------------------------------------------------------
PANEL_VERSION="1.0"
GITHUB_REPO="Bossa9973/Vertex-Panel"
GITHUB_BRANCH="main"
INSTALL_DIR="/var/www/vertex-panel"
SERVICE_USER="www-data"
NGINX_CONF="/etc/nginx/sites-available/vertex-panel"
SUPERVISOR_CONF="/etc/supervisor/conf.d/vertex-panel.conf"

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

# --- Live Mini-Logging & Spinner -----------------------------------------------
LOG_FILE="${LOG_FILE:-/tmp/vertex_restore.log}"
export LOG_FILE

# Initialize log header
{
    printf "============================================================\n"
    printf " Vertex Panel Restore Log — Started %s\n" "$(date '+%Y-%m-%d %H:%M:%S')"
    printf "============================================================\n"
} >> "$LOG_FILE" 2>/dev/null || true

spinner_start() {
    local msg="${1:-Working...}"
    local start_time
    start_time=$(date +%s)

    # Append timestamped step header to logfile
    {
        printf "\n------------------------------------------------------------\n"
        printf "[%s] >>> %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$msg"
        printf "------------------------------------------------------------\n"
    } >> "$LOG_FILE" 2>/dev/null || true

    (
        local frames=('-' '\\' '|' '/')
        local i=0
        local last_line=""
        local max_len=55
        local elapsed=0

        while true; do
            elapsed=$(( $(date +%s) - start_time ))

            if [[ -f "$LOG_FILE" ]]; then
                last_line=$(tail -n 15 "$LOG_FILE" 2>/dev/null \
                    | grep -v '^[[:space:]]*$' \
                    | grep -v '^---' \
                    | grep -v '^===' \
                    | grep -v '^\[' \
                    | tail -n 1 \
                    | tr -d '\r\n\t' \
                    | sed -e 's/[[:cntrl:]]//g' -e 's/\x1b\[[0-9;]*[mGKB]//g' || echo "")

                if [[ ${#last_line} -gt $max_len ]]; then
                    last_line="${last_line:0:$((max_len - 3))}..."
                fi
            fi

            local time_str=""
            if [[ $elapsed -ge 3 ]]; then
                time_str=" \033[0;33m[${elapsed}s]\033[0m"
            fi

            if [[ -n "$last_line" ]]; then
                printf "\r\033[2K  \033[0;36m%s\033[0m  \033[0;37m%s\033[0m%b  \033[2m(%s)\033[0m" "${frames[$i]}" "$msg" "$time_str" "$last_line"
            else
                printf "\r\033[2K  \033[0;36m%s\033[0m  \033[0;37m%s\033[0m%b" "${frames[$i]}" "$msg" "$time_str"
            fi

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

# --- Output helpers -----------------------------------------------------------
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
    printf "   ${DIM}Panel Restore Installer  ${BOLD}v${PANEL_VERSION}${RESET}${DIM}  |  Powered by Laravel & Proxmox${RESET}\n"
    printf "   ${DIM}Live detailed log :  tail -f %s${RESET}\n" "$LOG_FILE"
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
}

step() {
    printf "\n"
    printf "   ${BLUE}${BOLD}[ STEP %s/%s ]${RESET}  ${BOLD}${WHITE}%s${RESET}\n" "$1" "$2" "$3"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
}

info()    { printf "   ${CYAN}*${RESET}  ${WHITE}%b${RESET}\n" "$1"; }
success() { printf "   ${GREEN}ok${RESET} ${GREEN}%b${RESET}\n" "$1"; }
warn()    { printf "   ${YELLOW}!!${RESET} ${YELLOW}%b${RESET}\n" "$1"; }
error_msg() { printf "   ${RED}xx${RESET} ${RED}${BOLD}%b${RESET}\n" "$1"; ERRORS+=("$1"); }

run_quietly() { "$@" > /dev/null 2>&1; }

run_or_fail() {
    local msg="$1"
    shift
    spinner_start "$msg"
    if "$@" >> "$LOG_FILE" 2>&1; then
        spinner_stop
        success "$msg"
    else
        spinner_stop
        error_msg "Failed: $msg"
        printf "   ${DIM}Details: ${LOG_FILE}${RESET}\n"
        return 1
    fi
}

ask_password() {
    local prompt="$1"
    local response=""
    printf "   ${CYAN}?${RESET}  ${WHITE}%s${RESET}: " "$prompt" >&2
    if [[ -t 0 ]]; then
        read -rs response
    else
        read -rs response < /dev/tty 2>/dev/null || read -rs response || response=""
    fi
    printf "\n" >&2
    printf "%s" "$response"
}

# --- 1. Pre-flight checks -----------------------------------------------------
preflight_checks() {
    step 1 8 "Pre-flight System Checks"

    if [[ $EUID -ne 0 ]]; then
        error_msg "Must be run as root. Try: sudo bash restore.sh <backup-url-or-file>"
        exit 1
    fi
    success "Running as root"

    if [[ -f /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        OS_NAME="$ID"
        OS_VERSION="${VERSION_ID:-unknown}"
    else
        error_msg "Cannot detect OS. Only Debian/Ubuntu supported."
        exit 1
    fi

    case "$OS_NAME" in
        ubuntu|debian)
            success "Detected OS: ${OS_NAME^} ${OS_VERSION}"
            ;;
        *)
            error_msg "Unsupported OS: $OS_NAME. Requires Debian or Ubuntu."
            exit 1
            ;;
    esac

    local ram_mb cpu_cores
    ram_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    cpu_cores=$(nproc)
    info "CPU: ${cpu_cores} cores  |  RAM: ${ram_mb} MB"

    if curl -s --connect-timeout 5 https://github.com > /dev/null 2>&1; then
        success "Internet connectivity: OK"
    else
        error_msg "No internet access. Cannot reach GitHub."
        exit 1
    fi

    printf "\n"
}

# --- 2. Acquire & Decrypt Backup Package --------------------------------------
obtain_backup() {
    step 2 8 "Backup Package Configuration"

    BACKUP_INPUT="${1:-}"
    BACKUP_PASS="${2:-}"

    if [[ -z "$BACKUP_INPUT" ]]; then
        printf "   ${CYAN}?${RESET}  ${WHITE}Enter backup Download URL or local file path${RESET}: "
        read -r BACKUP_INPUT
    fi

    if [[ -z "$BACKUP_INPUT" ]]; then
        error_msg "No backup file or URL provided."
        exit 1
    fi

    info "Backup source: ${BOLD}${BACKUP_INPUT}${RESET}"

    # Ensure unzip utility is present for extraction
    if ! command -v unzip &>/dev/null; then
        spinner_start "Installing extraction utilities (unzip, tar)..."
        apt-get update -y >> "$LOG_FILE" 2>&1 || true
        apt-get install -y unzip tar >> "$LOG_FILE" 2>&1 || true
        spinner_stop
        success "Extraction utilities ready"
    else
        success "Extraction tools ready"
    fi

    TMP_RESTORE_DIR="/tmp/vertex_restore_pkg"
    LOCAL_ARCHIVE="/tmp/vertex_backup_pkg"
    rm -rf "$TMP_RESTORE_DIR" "$LOCAL_ARCHIVE"
    mkdir -p "$TMP_RESTORE_DIR"

    if [[ "$BACKUP_INPUT" =~ ^https?:// ]]; then
        spinner_start "Downloading backup archive from cloud..."
        if curl -fsSL "$BACKUP_INPUT" -o "$LOCAL_ARCHIVE" 2>>"$LOG_FILE" || wget -q "$BACKUP_INPUT" -O "$LOCAL_ARCHIVE" 2>>"$LOG_FILE"; then
            spinner_stop
            local pkg_size
            pkg_size=$(du -h "$LOCAL_ARCHIVE" | cut -f1)
            success "Downloaded backup archive (${pkg_size})"
        else
            spinner_stop
            error_msg "Failed to download backup archive from $BACKUP_INPUT"
            printf "   ${DIM}Details logged in /tmp/vertex_restore.log${RESET}\n"
            exit 1
        fi
    elif [[ -f "$BACKUP_INPUT" ]]; then
        spinner_start "Loading local backup file..."
        cp "$BACKUP_INPUT" "$LOCAL_ARCHIVE"
        spinner_stop
        local pkg_size
        pkg_size=$(du -h "$LOCAL_ARCHIVE" | cut -f1)
        success "Loaded local backup archive (${pkg_size})"
    else
        error_msg "File or URL not found: $BACKUP_INPUT"
        exit 1
    fi

    # Extract Archive (ZIP or TAR) with password support
    EXTRACTED=false

    if unzip -t "$LOCAL_ARCHIVE" >/dev/null 2>&1 || file "$LOCAL_ARCHIVE" 2>/dev/null | grep -qi "zip" || [[ "$LOCAL_ARCHIVE" == *.zip ]]; then
        info "ZIP package format detected"
        if [[ -n "$BACKUP_PASS" ]]; then
            spinner_start "Attempting decryption with provided password..."
            if unzip -q -P "$BACKUP_PASS" "$LOCAL_ARCHIVE" -d "$TMP_RESTORE_DIR" 2>/dev/null; then
                spinner_stop
                EXTRACTED=true
                success "Archive decrypted using provided password"
            else
                spinner_stop
            fi
        fi

        if [[ "$EXTRACTED" == "false" ]]; then
            spinner_start "Testing if archive is unencrypted..."
            if unzip -q "$LOCAL_ARCHIVE" -d "$TMP_RESTORE_DIR" 2>/dev/null; then
                spinner_stop
                EXTRACTED=true
                success "Unencrypted ZIP archive extracted"
            else
                spinner_stop
            fi
        fi

        local attempts=0
        while [[ "$EXTRACTED" == "false" && $attempts -lt 5 ]]; do
            attempts=$((attempts + 1))
            if [[ $attempts -eq 1 ]]; then
                info "Backup package is password protected."
            else
                warn "Incorrect password. Please try again (Attempt ${attempts}/5)."
            fi
            BACKUP_PASS=$(ask_password "Enter backup password")
            if [[ -n "$BACKUP_PASS" ]]; then
                spinner_start "Decrypting backup package..."
                if unzip -q -P "$BACKUP_PASS" "$LOCAL_ARCHIVE" -d "$TMP_RESTORE_DIR" 2>/dev/null; then
                    spinner_stop
                    EXTRACTED=true
                    success "Password accepted & backup archive decrypted"
                    break
                else
                    spinner_stop
                fi
            fi
        done
    fi

    if [[ "$EXTRACTED" == "false" ]]; then
        spinner_start "Attempting TAR extraction fallback..."
        if tar -xzf "$LOCAL_ARCHIVE" -C "$TMP_RESTORE_DIR" 2>/dev/null; then
            spinner_stop
            EXTRACTED=true
            success "TAR.GZ archive extracted"
        else
            spinner_stop
        fi
    fi

    if [[ "$EXTRACTED" == "false" ]]; then
        error_msg "Failed to extract backup package. Incorrect password or invalid archive format."
        exit 1
    fi

    spinner_start "Validating extracted backup configs..."
    if [[ ! -f "${TMP_RESTORE_DIR}/.env" || ! -f "${TMP_RESTORE_DIR}/database.sql" ]]; then
        spinner_stop
        error_msg "Invalid backup package. Missing .env or database.sql."
        exit 1
    fi
    spinner_stop

    success "Extracted configuration (.env and database.sql verified)"
    printf "\n"
}

# --- 3. Install system dependencies -------------------------------------------
install_dependencies() {
    step 3 8 "Installing System Dependencies"

    run_or_fail "Updating package lists" apt-get update -y

    run_or_fail "Installing core utilities" \
        apt-get install -y curl wget unzip git tar gnupg2 ca-certificates lsb-release \
            apt-transport-https rsync

    run_quietly apt-get install -y software-properties-common 2>/dev/null || true

    # PHP installation
    if ! command -v php &>/dev/null; then
        spinner_start "Installing PHP & extensions"
        if apt-get install -y php-cli php-fpm php-mysql php-xml php-curl php-mbstring php-zip php-bcmath php-gmp php-redis php-intl >> "$LOG_FILE" 2>&1; then
            spinner_stop
            success "PHP & extensions installed"
        elif apt-get install -y php8.2-cli php8.2-fpm php8.2-mysql php8.2-xml php8.2-curl php8.2-mbstring php8.2-zip php8.2-bcmath php8.2-gmp php8.2-redis php8.2-intl >> "$LOG_FILE" 2>&1; then
            spinner_stop
            success "PHP 8.2 & extensions installed"
        else
            if [[ "${OS_NAME}" == "ubuntu" ]]; then
                run_quietly add-apt-repository -y ppa:ondrej/php 2>/dev/null || true
                run_quietly apt-get update -y
            elif [[ "${OS_NAME}" == "debian" ]]; then
                curl -sSLo /etc/apt/trusted.gpg.d/php.gpg https://packages.sury.org/php/apt.gpg > /dev/null 2>&1 || true
                echo "deb https://packages.sury.org/php/ $(lsb_release -sc 2>/dev/null || echo bookworm) main" > /etc/apt/sources.list.d/php.list
                run_quietly apt-get update -y
            fi

            if apt-get install -y php-cli php-fpm php-mysql php-xml php-curl php-mbstring php-zip php-bcmath php-gmp php-redis php-intl >> "$LOG_FILE" 2>&1; then
                spinner_stop
                success "PHP & extensions installed"
            else
                spinner_stop
                error_msg "Failed to install PHP. Check ${LOG_FILE}"
                return 1
            fi
        fi
    else
        success "PHP $(php -r 'echo PHP_VERSION;') already installed"
    fi

    # Composer
    if ! command -v composer &>/dev/null; then
        run_or_fail "Installing Composer" \
            bash -c "curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer"
    else
        success "Composer already installed"
    fi

    # Node.js 20 LTS
    if ! command -v node &>/dev/null; then
        spinner_start "Adding NodeSource repository (Node 20 LTS)"
        bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -" > /tmp/vertex_restore.log 2>&1
        spinner_stop
        success "NodeSource repository added"
        run_or_fail "Installing Node.js 20 LTS" apt-get install -y nodejs
    else
        success "Node.js $(node --version) already installed"
    fi

    # MySQL / MariaDB Server
    if ! command -v mysql &>/dev/null; then
        spinner_start "Installing Database Server (MySQL / MariaDB)"
        if apt-get install -y mysql-server > /tmp/vertex_restore.log 2>&1; then
            spinner_stop
            success "MySQL Server installed"
        elif apt-get install -y default-mysql-server > /tmp/vertex_restore.log 2>&1; then
            spinner_stop
            success "Default MySQL Server installed"
        elif apt-get install -y mariadb-server > /tmp/vertex_restore.log 2>&1; then
            spinner_stop
            success "MariaDB Server installed"
        else
            spinner_stop
            error_msg "Failed to install MySQL/MariaDB. Check /tmp/vertex_restore.log"
            return 1
        fi
        run_quietly systemctl start mysql 2>/dev/null || run_quietly systemctl start mariadb 2>/dev/null || true
        run_quietly systemctl enable mysql 2>/dev/null || run_quietly systemctl enable mariadb 2>/dev/null || true
    else
        success "MySQL/MariaDB already installed"
    fi

    # Redis
    if ! command -v redis-server &>/dev/null; then
        run_or_fail "Installing Redis" apt-get install -y redis-server
        run_quietly systemctl start redis-server
        run_quietly systemctl enable redis-server
    else
        success "Redis already installed"
    fi

    # Nginx
    if ! command -v nginx &>/dev/null; then
        run_or_fail "Installing Nginx" apt-get install -y nginx
        run_quietly systemctl start nginx
        run_quietly systemctl enable nginx
    else
        success "Nginx already installed"
    fi

    # Supervisor
    if ! command -v supervisorctl &>/dev/null; then
        run_or_fail "Installing Supervisor" apt-get install -y supervisor
        run_quietly systemctl start supervisor
        run_quietly systemctl enable supervisor
    else
        success "Supervisor already installed"
    fi

    printf "\n"
}

# --- 4. Download panel from GitHub & overlay backup --------------------------
download_panel() {
    step 4 8 "Downloading Vertex Panel & Restoring Files"

    local archive_url="https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip"
    local tmp_zip="/tmp/vertex-panel.zip"
    local tmp_dir="/tmp/vertex-panel-src"

    if [[ ! -f "${INSTALL_DIR}/artisan" ]]; then
        spinner_start "Downloading panel codebase from github.com/${GITHUB_REPO}"
        if curl -fsSL "$archive_url" -o "$tmp_zip" 2>>"$LOG_FILE"; then
            spinner_stop
            local size
            size=$(du -sh "$tmp_zip" | cut -f1)
            success "Downloaded codebase (${size})"
        else
            spinner_stop
            error_msg "Download failed."
            exit 1
        fi

        run_or_fail "Extracting panel archive" unzip -q -o "$tmp_zip" -d "$tmp_dir"

        local extracted_dir
        extracted_dir=$(find "$tmp_dir" -maxdepth 1 -type d -not -path "$tmp_dir" | head -1)

        run_or_fail "Creating installation directory (${INSTALL_DIR})" mkdir -p "$INSTALL_DIR"

        spinner_start "Deploying panel files to ${INSTALL_DIR}"
        rsync -a --delete "${extracted_dir}/" "${INSTALL_DIR}/" >> "$LOG_FILE" 2>&1
        spinner_stop
        success "Panel codebase deployed to ${INSTALL_DIR}"
        rm -rf "$tmp_zip" "$tmp_dir"
    else
        success "Vertex Panel codebase exists at ${INSTALL_DIR}"
    fi

    spinner_start "Overlaying restored .env environment config"
    cp "${TMP_RESTORE_DIR}/.env" "${INSTALL_DIR}/.env"
    spinner_stop
    success "Environment configuration restored"

    if [[ -d "${TMP_RESTORE_DIR}/storage" ]]; then
        spinner_start "Restoring storage directory (uploads, avatars, app state)"
        rsync -a "${TMP_RESTORE_DIR}/storage/" "${INSTALL_DIR}/storage/"
        spinner_stop
        success "Storage directory restored"
    fi

    if [[ -d "${TMP_RESTORE_DIR}/keys/root_ssh" ]]; then
        mkdir -p /root/.ssh
        cp -r "${TMP_RESTORE_DIR}/keys/root_ssh/"* /root/.ssh/ 2>/dev/null || true
        chmod 700 /root/.ssh && chmod 600 /root/.ssh/* 2>/dev/null || true
        success "Root SSH keys restored"
    fi

    if [[ -d "${TMP_RESTORE_DIR}/keys/www_ssh" ]]; then
        mkdir -p /var/www/.ssh
        cp -r "${TMP_RESTORE_DIR}/keys/www_ssh/"* /var/www/.ssh/ 2>/dev/null || true
        chown -R www-data:www-data /var/www/.ssh 2>/dev/null || true
        success "www-data SSH keys restored"
    fi

    printf "\n"
}

# --- 5. Configure Laravel, restore database & accounts -----------------------
configure_panel() {
    step 5 8 "Configuring Panel, Accounts and Database"

    cd "$INSTALL_DIR"

    get_env_var() {
        local key="$1"
        local default="${2:-}"
        local val
        val=$(grep -E "^${key}=" "${INSTALL_DIR}/.env" | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/'//" -e "s/'$//")
        echo "${val:-$default}"
    }

    DB_DATABASE=$(get_env_var "DB_DATABASE" "vertex_panel")
    DB_USERNAME=$(get_env_var "DB_USERNAME" "vertex_user")
    DB_PASSWORD=$(get_env_var "DB_PASSWORD" "vertex_password")

    spinner_start "Initializing MySQL database '${DB_DATABASE}' and user '${DB_USERNAME}'"
    local init_sql="CREATE DATABASE IF NOT EXISTS \`${DB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USERNAME}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USERNAME}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_DATABASE}\`.* TO '${DB_USERNAME}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_DATABASE}\`.* TO '${DB_USERNAME}'@'localhost';
FLUSH PRIVILEGES;"

    if ! printf "%s\n" "$init_sql" | mysql -u root > /tmp/vertex_restore.log 2>&1; then
        printf "%s\n" "$init_sql" | mysql > /tmp/vertex_restore.log 2>&1 || true
    fi
    spinner_stop
    success "MySQL database '${DB_DATABASE}' initialized"

    spinner_start "Importing SQL database dump (users, accounts, nodes, linked VPSes)"
    if MYSQL_PWD="$DB_PASSWORD" mysql -u "$DB_USERNAME" -h 127.0.0.1 "$DB_DATABASE" < "${TMP_RESTORE_DIR}/database.sql" >> "$LOG_FILE" 2>&1; then
        spinner_stop
        success "Database dump restored (accounts, nodes & linked VPSes active)"
    elif mysql -u root "$DB_DATABASE" < "${TMP_RESTORE_DIR}/database.sql" >> "$LOG_FILE" 2>&1; then
        spinner_stop
        success "Database dump restored via root"
    else
        spinner_stop
        error_msg "Failed to import database.sql. Check ${LOG_FILE}"
        return 1
    fi

    run_or_fail "Installing PHP dependencies (Composer)" \
        composer install --no-dev --optimize-autoloader --no-interaction

    run_or_fail "Linking storage directory" \
        php artisan storage:link --force --no-interaction

    run_or_fail "Running database migrations" \
        php artisan migrate --force --no-interaction

    run_or_fail "Publishing vendor assets" \
        php artisan vendor:publish --tag=laravel-assets --no-interaction --force

    spinner_start "Setting file permissions"
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" > /dev/null 2>&1
    chmod -R 755 "${INSTALL_DIR}/storage" > /dev/null 2>&1
    chmod -R 755 "${INSTALL_DIR}/bootstrap/cache" > /dev/null 2>&1
    spinner_stop
    success "File permissions configured"

    if [[ ! -d "${INSTALL_DIR}/public/build" ]]; then
        spinner_start "Installing Node.js dependencies"
        if npm install --prefix "${INSTALL_DIR}" --legacy-peer-deps --no-audit --no-fund >> "$LOG_FILE" 2>&1 || \
           npm install --prefix "${INSTALL_DIR}" --silent >> "$LOG_FILE" 2>&1; then
            spinner_stop
            success "Node.js dependencies installed"
        else
            spinner_stop
            warn "Node.js dependencies install finished with warnings (proceeding to build)"
        fi

        spinner_start "Building frontend assets (Vite)"
        export NODE_OPTIONS="--max-old-space-size=8192"
        if npm run build --prefix "${INSTALL_DIR}" >> "$LOG_FILE" 2>&1; then
            spinner_stop
            success "Frontend assets (Vite build) compiled"
        else
            spinner_stop
            warn "Vite npm run build reported warnings — trying direct fallback"
        fi

        if [[ ! -f "${INSTALL_DIR}/public/build/manifest.json" ]]; then
            spinner_start "Retrying Vite build directly..."
            (cd "${INSTALL_DIR}" && npx vite build >> "$LOG_FILE" 2>&1) || true
            spinner_stop
        fi

        if [[ -f "${INSTALL_DIR}/public/build/manifest.json" ]]; then
            success "Vite manifest verified -> public/build/manifest.json"
        else
            error_msg "Failed to build Vite assets! /var/www/vertex-panel/public/build/manifest.json is missing."
            printf "   ${DIM}Check log for details: ${LOG_FILE}${RESET}\n"
            return 1
        fi
    else
        success "Frontend assets (Vite build) ready"
    fi

    run_or_fail "Optimizing application (caching config/routes)" \
        php artisan optimize

    printf "\n"
}

# --- 6. Configure Nginx -------------------------------------------------------
configure_nginx() {
    step 6 8 "Configuring Nginx"

    mkdir -p /var/log/nginx /etc/nginx/sites-available /etc/nginx/sites-enabled

    # Ensure PHP-FPM service is started
    local fpm_svc
    fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
    if [[ -n "$fpm_svc" ]]; then
        run_quietly systemctl start "$fpm_svc" 2>/dev/null || true
    fi

    local domain php_sock
    APP_URL=$(grep -E "^APP_URL=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//' || echo "http://localhost")
    domain=$(printf "%s" "$APP_URL" | sed 's|https\?://||' | sed 's|/.*||' | sed 's|:[0-9]*||')
    domain="${domain:-_}"
    php_sock=$(ls /run/php/php*.sock 2>/dev/null | head -1 || echo "/run/php/php-fpm.sock")

    spinner_start "Writing Nginx virtual host for ${domain}"
    cat > "${NGINX_CONF}" <<NGINXEOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${domain};

    root ${INSTALL_DIR}/public;
    index index.php index.html;

    charset utf-8;
    client_max_body_size 100M;

    access_log  /var/log/nginx/vertex-panel.access.log;
    error_log   /var/log/nginx/vertex-panel.error.log;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php\$ {
        fastcgi_split_path_info ^(.+\.php)(/.+)\$;
        fastcgi_pass unix:${php_sock};
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        fastcgi_read_timeout 300;
    }

    location ~ /\.ht { deny all; }
    location ~ /\.env { deny all; }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_comp_level 6;
    gzip_min_length 256;
}
NGINXEOF
    spinner_stop
    success "Nginx config written -> ${NGINX_CONF}"

    run_or_fail "Enabling site" ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/vertex-panel
    run_quietly rm -f /etc/nginx/sites-enabled/default || true
    run_or_fail "Testing Nginx config" nginx -t
    run_or_fail "Reloading Nginx" systemctl reload nginx

    printf "\n"
}

# --- 7. Configure Supervisor queue workers ------------------------------------
configure_supervisor() {
    step 7 8 "Configuring Queue Workers (Supervisor)"

    run_quietly mkdir -p /var/log/vertex-panel
    run_quietly chown -R "${SERVICE_USER}:${SERVICE_USER}" /var/log/vertex-panel 2>/dev/null || true

    spinner_start "Writing Supervisor configuration"
    # NOTE: Only vertex-horizon is registered here.
    # Horizon manages its own worker pool (configured via config/horizon.php).
    # Adding separate queue:work daemons alongside Horizon double-spawns workers
    # and wastes RAM on a low-memory VPS.
    cat > "${SUPERVISOR_CONF}" <<SUPEOF
[program:vertex-horizon]
process_name=%(program_name)s
command=php ${INSTALL_DIR}/artisan horizon
directory=${INSTALL_DIR}
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=${SERVICE_USER}
redirect_stderr=true
stdout_logfile=/var/log/vertex-panel/horizon.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=3
stopwaitsecs=3600
SUPEOF
    spinner_stop
    success "Supervisor config written -> ${SUPERVISOR_CONF}"

    run_or_fail "Loading Supervisor configuration" \
        bash -c "supervisorctl reread && supervisorctl update"

    spinner_start "Starting vertex-horizon worker"
    if supervisorctl start vertex-horizon > /tmp/vertex_restore.log 2>&1; then
        spinner_stop
        success "Horizon worker started (manages its own queue worker pool)"
    else
        spinner_stop
        warn "vertex-horizon start returned non-zero — check: supervisorctl status"
    fi

    printf "\n"
}


# --- 8. Install vertex CLI management tool ------------------------------------
install_cli() {
    step 8 8 "Installing 'vertex' Management CLI"

    spinner_start "Writing /usr/local/bin/vertex"
    cat > /usr/local/bin/vertex <<'CLIEOF'
#!/usr/bin/env bash
# Vertex Panel - Management CLI
INSTALL_DIR="/var/www/vertex-panel"
GREEN='\033[0;32m' YELLOW='\033[0;33m' BLUE='\033[0;34m' CYAN='\033[0;36m'
BOLD='\033[1m' DIM='\033[2m' RED='\033[0;31m' RESET='\033[0m'

usage() {
    printf "\n"
    printf "  ${BOLD}${BLUE}Vertex Panel${RESET} - Management CLI\n"
    printf "\n"
    printf "  ${BOLD}Usage:${RESET} vertex <command>\n"
    printf "\n"
    printf "  ${BOLD}Commands:${RESET}\n"
    printf "    ${CYAN}backup${RESET}        Back up database, user files & upload to cloud\n"
    printf "    ${CYAN}restore <url>${RESET}  Restore panel on new VPS from backup URL or file\n"
    printf "    ${CYAN}start${RESET}         Start all services\n"
    printf "    ${CYAN}stop${RESET}          Stop queue workers\n"
    printf "    ${CYAN}restart${RESET}       Restart all services\n"
    printf "    ${CYAN}status${RESET}        Show service status\n"
    printf "    ${CYAN}logs${RESET}          Tail application logs\n"
    printf "    ${CYAN}queue-logs${RESET}    Tail queue worker logs\n"
    printf "    ${CYAN}update${RESET}        Pull latest from GitHub and update\n"
    printf "    ${CYAN}migrate${RESET}       Run database migrations\n"
    printf "    ${CYAN}optimize${RESET}      Rebuild config/route/view cache\n"
    printf "    ${CYAN}artisan <cmd>${RESET} Run Laravel Artisan command\n"
    printf "    ${CYAN}version${RESET}       Show installed version\n"
    printf "\n"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        printf "${RED}Error: Run as root (sudo vertex %s)${RESET}\n" "${1:-}"
        exit 1
    fi
}

case "${1:-}" in
    backup)
        check_root "$1"
        bash "${INSTALL_DIR}/backup.sh" "${@:2}"
        ;;
    restore)
        check_root "$1"
        bash "${INSTALL_DIR}/restore.sh" "${@:2}"
        ;;
    start)
        check_root "$1"
        printf "${GREEN}Starting Vertex Panel services...${RESET}\n"
        systemctl start nginx redis-server supervisor 2>/dev/null || true
        systemctl start mysql 2>/dev/null || systemctl start mariadb 2>/dev/null || true
        systemctl start php8.2-fpm 2>/dev/null || systemctl start php-fpm 2>/dev/null || systemctl start php*-fpm 2>/dev/null || true
        supervisorctl start all 2>/dev/null || true
        printf "${GREEN}All services started.${RESET}\n"
        ;;
    stop)
        check_root "$1"
        printf "${YELLOW}Stopping queue workers...${RESET}\n"
        supervisorctl stop all 2>/dev/null || true
        systemctl stop supervisor
        printf "${YELLOW}Queue workers stopped.${RESET}\n"
        ;;
    restart)
        check_root "$1"
        printf "${CYAN}Restarting services...${RESET}\n"
        systemctl restart nginx redis-server supervisor 2>/dev/null || true
        systemctl restart mysql 2>/dev/null || systemctl restart mariadb 2>/dev/null || true
        systemctl restart php8.2-fpm 2>/dev/null || systemctl restart php-fpm 2>/dev/null || systemctl restart php*-fpm 2>/dev/null || true
        supervisorctl restart all 2>/dev/null || true
        printf "${GREEN}All services restarted.${RESET}\n"
        ;;
    status)
        printf "\n  ${BOLD}Vertex Panel - Service Status${RESET}\n"
        printf "  ----------------------------------------\n"
        fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "php8.2-fpm")
        for svc in nginx "$fpm_svc" redis-server mysql supervisor; do
            if systemctl is-active --quiet "$svc"; then
                printf "  ${GREEN}[running]${RESET}  %s\n" "$svc"
            else
                printf "  ${RED}[stopped]${RESET}  %s\n" "$svc"
            fi
        done
        printf "\n  ${BOLD}Queue Workers:${RESET}\n"
        supervisorctl status 2>/dev/null | sed 's/^/  /' || printf "  Supervisor not running\n"
        printf "\n"
        ;;
    logs)
        tail -f "${INSTALL_DIR}/storage/logs/laravel.log"
        ;;
    queue-logs)
        tail -f /var/log/vertex-panel/queue.log
        ;;
    update)
        check_root "$1"
        tmp_zip="/tmp/vertex-panel-update.zip"
        tmp_dir="/tmp/vertex-panel-update"
        printf "${CYAN}Downloading latest release from GitHub...${RESET}\n"
        curl -fsSL "https://github.com/Bossa9973/Vertex-Panel/archive/refs/heads/main.zip" -o "$tmp_zip"
        unzip -q -o "$tmp_zip" -d "$tmp_dir"
        src_dir=$(find "$tmp_dir" -maxdepth 1 -type d -not -path "$tmp_dir" | head -1)
        printf "${CYAN}Enabling maintenance mode...${RESET}\n"
        php "${INSTALL_DIR}/artisan" down --no-interaction
        printf "${CYAN}Syncing files...${RESET}\n"
        rsync -a --delete --exclude='.env' --exclude='storage/' "${src_dir}/" "${INSTALL_DIR}/"
        chown -R www-data:www-data "${INSTALL_DIR}"
        printf "${CYAN}Installing dependencies...${RESET}\n"
        composer install --no-dev --optimize-autoloader --no-interaction -d "${INSTALL_DIR}"
        npm install --prefix "${INSTALL_DIR}" --silent
        npm run build --prefix "${INSTALL_DIR}"
        printf "${CYAN}Running migrations...${RESET}\n"
        php "${INSTALL_DIR}/artisan" migrate --force --no-interaction
        php "${INSTALL_DIR}/artisan" optimize
        supervisorctl restart all 2>/dev/null || true
        php "${INSTALL_DIR}/artisan" up --no-interaction
        rm -rf "$tmp_zip" "$tmp_dir"
        printf "${GREEN}Vertex Panel updated successfully!${RESET}\n"
        ;;
    migrate)
        check_root "$1"
        php "${INSTALL_DIR}/artisan" migrate --force --no-interaction
        ;;
    optimize)
        check_root "$1"
        php "${INSTALL_DIR}/artisan" optimize:clear
        php "${INSTALL_DIR}/artisan" optimize
        printf "${GREEN}Cache rebuilt.${RESET}\n"
        ;;
    artisan)
        shift
        php "${INSTALL_DIR}/artisan" "$@"
        ;;
    version)
        grep -oP '(?<="version": ")[^"]+' "${INSTALL_DIR}/package.json" 2>/dev/null | head -1 || printf "unknown\n"
        ;;
    *)
        usage
        ;;
esac
CLIEOF

    chmod +x /usr/local/bin/vertex
    spinner_stop
    success "'vertex' CLI installed -- available system-wide"
    printf "\n"
}

# --- Start all services and detect server address ----------------------------
start_services() {
    printf "   ${BLUE}${BOLD}[ FINAL ]${RESET}  ${BOLD}${WHITE}Starting All Services${RESET}\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"

    run_or_fail "Ensuring Nginx is running" systemctl restart nginx

    local fpm_svc
    fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
    if [[ -n "$fpm_svc" ]]; then
        run_or_fail "Ensuring PHP-FPM is running (${fpm_svc})" systemctl restart "$fpm_svc"
    else
        run_quietly systemctl restart php8.2-fpm 2>/dev/null || run_quietly systemctl restart php-fpm 2>/dev/null || true
    fi

    run_or_fail "Ensuring Redis is running" systemctl restart redis-server

    if systemctl is-active --quiet mariadb 2>/dev/null || systemctl is-enabled --quiet mariadb 2>/dev/null; then
        run_or_fail "Ensuring Database (MariaDB) is running" systemctl restart mariadb
    else
        run_or_fail "Ensuring Database (MySQL) is running" systemctl restart mysql
    fi

    run_or_fail "Ensuring Supervisor is running" systemctl restart supervisor

    sleep 2

    # Verify Supervisor programs
    local queue_status horizon_status
    queue_status=$(supervisorctl status vertex-queue:vertex-queue_00 2>/dev/null | awk '{print $2}' || echo "UNKNOWN")
    horizon_status=$(supervisorctl status vertex-horizon 2>/dev/null | awk '{print $2}' || echo "UNKNOWN")

    printf "\n"
    printf "   ${BOLD}${WHITE}Worker status:${RESET}\n"
    if [[ "$queue_status" == "RUNNING" ]]; then
        success "vertex-queue workers: RUNNING"
    else
        warn "vertex-queue status: ${queue_status}"
    fi
    if [[ "$horizon_status" == "RUNNING" ]]; then
        success "vertex-horizon worker: RUNNING"
    else
        warn "vertex-horizon status: ${horizon_status}"
    fi

    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "<your-server-ip>")
    APP_URL=$(grep -E "^APP_URL=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//' || echo "http://${SERVER_IP}")
    PANEL_PORT=80

    printf "\n"
    success "Panel is live at:  ${CYAN}${BOLD}http://${SERVER_IP}:${PANEL_PORT}${RESET}"
    info  "Restored URL:      ${CYAN}${APP_URL}${RESET}"
    printf "\n"
}

# --- Print completion summary -------------------------------------------------
print_completion() {
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
    printf "   ${GREEN}${BOLD}Restoration & Installation Complete!${RESET}\n"
    printf "\n"
    printf "   ${BOLD}Access your restored panel:${RESET}\n"
    printf "     ${CYAN}${BOLD}http://${SERVER_IP:-<server-ip>}:80${RESET}          (direct IP)\n"
    printf "     ${CYAN}${BOLD}%s${RESET}  (domain)\n" "${APP_URL:-}"
    printf "\n"
    printf "   ${BOLD}Panel Dir:${RESET}  ${DIM}%s${RESET}\n" "$INSTALL_DIR"
    printf "   ${BOLD}Log Dir:${RESET}    ${DIM}/var/log/vertex-panel/${RESET}\n"
    printf "\n"
    printf "   ${BOLD}Restored items:${RESET}\n"
    printf "     ${GREEN}ok${RESET} User accounts, admins & password hashes\n"
    printf "     ${GREEN}ok${RESET} KVM nodes, Proxmox integration & daemon secrets\n"
    printf "     ${GREEN}ok${RESET} Linked VPSes, servers & IP address pools\n"
    printf "     ${GREEN}ok${RESET} System settings, SMTP & payment gateways\n"
    printf "     ${GREEN}ok${RESET} Storage, uploads, avatars & SSH keys\n"
    printf "\n"
    printf "   ${BOLD}Management commands (run as root):${RESET}\n"
    printf "   ${DIM}vertex status           ${RESET}  Show service status\n"
    printf "   ${DIM}vertex start/stop/restart${RESET} Manage services\n"
    printf "   ${DIM}vertex backup           ${RESET}  Create new backup and upload to cloud\n"
    printf "   ${DIM}vertex logs             ${RESET}  Tail application logs\n"
    printf "   ${DIM}vertex queue-logs       ${RESET}  Tail queue/horizon logs\n"
    printf "   ${DIM}vertex artisan <cmd>    ${RESET}  Run Artisan commands\n"
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
}

# --- Main ---------------------------------------------------------------------
trap 'spinner_stop; printf "\n   ${RED}Restoration interrupted. See /tmp/vertex_restore.log${RESET}\n"; exit 1' ERR INT TERM

print_banner
preflight_checks
obtain_backup "${1:-}" "${2:-}"
install_dependencies
download_panel
configure_panel
configure_nginx
configure_supervisor
install_cli
start_services
print_completion
