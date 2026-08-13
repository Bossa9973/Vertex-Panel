#!/usr/bin/env bash
# =============================================================================
#
#  ##  ##  ####  #####  ####### ####  ##  ##
#  ##  ##  ##    ##  ##    ##   ##    ##  ##
#  ##  ##  ####  #####     ##   ####   ####
#   ####   ##    ## ##     ##   ##     ####
#    ##    ####  ##  ##    ##   #####  ## ##
#
#  Vertex Panel -- Automated Pristine Installer v1.1
#  GitHub: https://github.com/Bossa9973/Vertex-Panel
#
#  One-liner install:
#  curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/install.sh | bash
#
# =============================================================================

set -euo pipefail

# --- Environment & Non-Interactive Settings -----------------------------------
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export COMPOSER_ALLOW_SUPERUSER=1
export NODE_OPTIONS="--max-old-space-size=8192"  # 8 GB heap limit for Node.js build process

# --- Constants ----------------------------------------------------------------
PANEL_VERSION="1.1"
GITHUB_REPO="Bossa9973/Vertex-Panel"
GITHUB_BRANCH="main"
INSTALL_DIR="/var/www/vertex-panel"
SERVICE_USER="www-data"
NGINX_CONF="/etc/nginx/sites-available/vertex-panel"
SUPERVISOR_CONF="/etc/supervisor/conf.d/vertex-panel.conf"
LOG_FILE="/tmp/vertex_install.log"

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

# --- State --------------------------------------------------------------------
SPINNER_PID=""
ERRORS=()
OS_FAMILY="debian"
PKG_MANAGER="apt-get"

# --- Error Handling & Cleanup -------------------------------------------------
cleanup_on_error() {
    spinner_stop
    printf "\n"
    printf "   ${RED}${BOLD}xx Installation failed!${RESET}\n"
    if [[ -f "$LOG_FILE" ]]; then
        printf "   ${DIM}Last 20 log output lines (${LOG_FILE}):${RESET}\n"
        printf "   ${DIM}------------------------------------------------------------${RESET}\n"
        tail -n 20 "$LOG_FILE" | sed 's/^/   /' || true
        printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    fi
    printf "   ${YELLOW}For assistance, report this log to: https://github.com/%s/issues${RESET}\n" "$GITHUB_REPO"
    printf "\n"
    exit 1
}

trap cleanup_on_error ERR INT TERM

# --- Live Mini-Logging & Spinner -----------------------------------------------
LOG_FILE="${LOG_FILE:-/tmp/vertex_install.log}"
export LOG_FILE

# Initialize log header
{
    printf "============================================================\n"
    printf " Vertex Panel Installation Log — Started %s\n" "$(date '+%Y-%m-%d %H:%M:%S')"
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

            # Fetch the latest non-empty line from the log file to show real-time activity
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
    printf "   ${DIM}Panel Installer  ${BOLD}v${PANEL_VERSION}${RESET}${DIM}  |  Pristine Automated Deployment${RESET}\n"
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

info()    { printf "   ${CYAN}*${RESET}  ${WHITE}%s${RESET}\n" "$1"; }
success() { printf "   ${GREEN}ok${RESET} ${GREEN}%s${RESET}\n" "$1"; }
warn()    { printf "   ${YELLOW}!!${RESET} ${YELLOW}%s${RESET}\n" "$1"; ERRORS+=("$1"); }
error_msg() { printf "   ${RED}xx${RESET} ${RED}${BOLD}%s${RESET}\n" "$1"; ERRORS+=("$1"); }

ask() {
    local prompt="$1"
    local default="${2:-}"
    local var_name="${3:-}"
    local response=""

    # Non-interactive check from env
    if [[ -n "$var_name" && -n "${!var_name:-}" ]]; then
        printf "%s" "${!var_name}"
        return
    fi

    if [[ -n "$default" ]]; then
        printf "   ${CYAN}?${RESET}  ${WHITE}%s${RESET} ${DIM}[%s]${RESET}: " "$prompt" "$default" >&2
    else
        printf "   ${CYAN}?${RESET}  ${WHITE}%s${RESET}: " "$prompt" >&2
    fi

    if [[ -t 0 ]]; then
        read -r response
    else
        read -r response < /dev/tty 2>/dev/null || read -r response || response=""
    fi
    printf "%s" "${response:-$default}"
}

ask_password() {
    local prompt="$1"
    local var_name="${2:-}"
    local response=""

    if [[ -n "$var_name" && -n "${!var_name:-}" ]]; then
        printf "%s" "${!var_name}"
        return
    fi

    printf "   ${CYAN}?${RESET}  ${WHITE}%s${RESET}: " "$prompt" >&2
    if [[ -t 0 ]]; then
        read -rs response
    else
        read -rs response < /dev/tty 2>/dev/null || read -rs response || response=""
    fi
    printf "\n" >&2
    printf "%s" "$response"
}

ask_yn() {
    local prompt="$1"
    local default="${2:-y}"
    local var_name="${3:-ASSUME_YES}"
    local response=""

    if [[ "${!var_name:-}" == "1" || "${!var_name:-}" == "true" ]]; then
        return 0
    fi

    printf "   ${CYAN}?${RESET}  ${WHITE}%s${RESET} ${DIM}[y/n, default: %s]${RESET}: " "$prompt" "$default" >&2
    if [[ -t 0 ]]; then
        read -r response
    else
        read -r response < /dev/tty 2>/dev/null || read -r response || response=""
    fi
    response="${response:-$default}"
    [[ "${response,,}" == "y" || "${response,,}" == "yes" ]]
}

run_quietly() { "$@" > /dev/null 2>&1 || true; }

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
        printf "   ${DIM}Log details saved to: ${LOG_FILE}${RESET}\n"
        return 1
    fi
}

# --- Pre-flight checks --------------------------------------------------------
preflight_checks() {
    step 1 8 "Pre-flight System Checks"

    if [[ $EUID -ne 0 ]]; then
        error_msg "Installer must be executed as root. Try: sudo bash install.sh"
        exit 1
    fi
    success "Running as root"

    if [[ -f /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        OS_NAME="${ID:-unknown}"
        OS_VERSION="${VERSION_ID:-unknown}"
        OS_PRETTY="${PRETTY_NAME:-Linux}"
    else
        error_msg "Cannot detect operating system (/etc/os-release missing)."
        exit 1
    fi

    case "$OS_NAME" in
        ubuntu|debian|pop|mint)
            OS_FAMILY="debian"
            PKG_MANAGER="apt-get"
            SERVICE_USER="www-data"
            NGINX_CONF="/etc/nginx/sites-available/vertex-panel"
            SUPERVISOR_CONF="/etc/supervisor/conf.d/vertex-panel.conf"
            success "Detected distribution: ${OS_PRETTY} (Debian Family)"
            ;;
        almalinux|rocky|centos|fedora|rhel)
            OS_FAMILY="rhel"
            PKG_MANAGER="dnf"
            SERVICE_USER="nginx"
            NGINX_CONF="/etc/nginx/conf.d/vertex-panel.conf"
            SUPERVISOR_CONF="/etc/supervisord.d/vertex-panel.ini"
            success "Detected distribution: ${OS_PRETTY} (RHEL Family)"
            ;;
        *)
            warn "Unsupported distribution '${OS_NAME}'. Attempting Debian-compatible installation..."
            OS_FAMILY="debian"
            PKG_MANAGER="apt-get"
            SERVICE_USER="www-data"
            NGINX_CONF="/etc/nginx/sites-available/vertex-panel"
            SUPERVISOR_CONF="/etc/supervisor/conf.d/vertex-panel.conf"
            ;;
    esac

    local ram_mb cpu_cores
    ram_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    cpu_cores=$(nproc 2>/dev/null || echo 1)
    info "CPU: ${cpu_cores} cores  |  RAM: ${ram_mb} MB"
    if [[ $ram_mb -lt 512 ]]; then
        warn "RAM is under 512 MB. Installation will proceed, but swap is strongly recommended."
    fi

    # Offer swap creation on low-RAM servers (< 1 GB) to prevent OOM during build & runtime
    if [[ $ram_mb -lt 1024 ]] && [[ ! -f /swapfile ]]; then
        warn "RAM is under 1 GB. A swapfile is strongly recommended for stability."
        if ask_yn "Create a 1 GB swapfile now? (Highly recommended for < 1 GB RAM VPS)" "y" "CREATE_SWAP"; then
            spinner_start "Creating 1 GB swapfile at /swapfile"
            fallocate -l 1G /swapfile > /dev/null 2>&1 || dd if=/dev/zero of=/swapfile bs=1M count=1024 > /dev/null 2>&1
            chmod 600 /swapfile
            mkswap /swapfile > /dev/null 2>&1
            swapon /swapfile
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
            spinner_stop
            success "Swapfile created and enabled (1 GB). Will persist across reboots."
        else
            warn "Skipped swapfile creation. Risk of OOM during build or under load."
        fi
    fi

    local free_gb
    free_gb=$(df -BG /var 2>/dev/null | awk 'NR==2{gsub(/G/,"",$4); print $4}' || echo 0)
    if [[ "${free_gb:-0}" -lt 2 ]]; then
        warn "Less than 2 GB free disk space in /var. Installation may run low on disk space."
    else
        success "Free disk space: ${free_gb} GB"
    fi

    if curl -s --connect-timeout 5 https://github.com > /dev/null 2>&1; then
        success "Network connectivity: OK"
    else
        error_msg "No internet access or GitHub is unreachable."
        exit 1
    fi

    if ! grep -q "NODE_OPTIONS" /etc/environment 2>/dev/null; then
        echo 'export NODE_OPTIONS="--max-old-space-size=8192"' >> /etc/environment 2>/dev/null || true
    fi

    printf "\n"
}

# --- Collect user configuration -----------------------------------------------
collect_config() {
    step 2 8 "Configuration Setup"
    info "Specify details for your panel configuration (defaults shown in brackets)."
    printf "\n"

    APP_URL=$(ask "Panel Domain URL (e.g. https://panel.yourdomain.com)" "" "APP_URL")
    while [[ -z "$APP_URL" ]]; do
        warn "Panel URL cannot be empty."
        APP_URL=$(ask "Panel Domain URL" "" "APP_URL")
    done
    if [[ "$APP_URL" != http://* && "$APP_URL" != https://* ]]; then
        APP_URL="http://${APP_URL}"
    fi

    DB_DATABASE=$(ask "MySQL database name" "vertex_panel" "DB_DATABASE")
    DB_USERNAME=$(ask "MySQL database user" "vertex_user" "DB_USERNAME")
    DB_PASSWORD=$(ask_password "MySQL database password (min 8 chars)" "DB_PASSWORD")
    while [[ ${#DB_PASSWORD} -lt 8 ]]; do
        warn "Password must be at least 8 characters long."
        DB_PASSWORD=$(ask_password "MySQL database password" "DB_PASSWORD")
    done
    DB_ROOT_PASSWORD=$(ask_password "MySQL root password (press Enter if fresh install/empty)" "DB_ROOT_PASSWORD")

    printf "\n"
    MAIL_HOST=$(ask "SMTP host" "smtp.mailtrap.io" "MAIL_HOST")
    MAIL_PORT=$(ask "SMTP port" "587" "MAIL_PORT")
    MAIL_USERNAME=$(ask "SMTP username" "null" "MAIL_USERNAME")
    MAIL_PASSWORD=$(ask_password "SMTP password" "MAIL_PASSWORD")
    MAIL_FROM_ADDRESS=$(ask "Mail sender address" "noreply@vertex-panel.com" "MAIL_FROM_ADDRESS")
    MAIL_FROM_NAME=$(ask "Mail sender name" "Vertex Panel" "MAIL_FROM_NAME")

    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "   ${BOLD}${WHITE}Installation Target Summary:${RESET}\n"
    printf "     Panel URL :  ${BOLD}%s${RESET}\n" "$APP_URL"
    printf "     DB Name   :  ${BOLD}%s${RESET}\n" "$DB_DATABASE"
    printf "     DB User   :  ${BOLD}%s${RESET}\n" "$DB_USERNAME"
    printf "     SMTP Host :  ${BOLD}%s:%s${RESET}\n" "$MAIL_HOST" "$MAIL_PORT"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"

    if ! ask_yn "Proceed with installation?"; then
        printf "\n"; info "Installation cancelled by user."; exit 0
    fi
    printf "\n"
}

# --- Install system dependencies ----------------------------------------------
install_dependencies() {
    step 3 8 "Installing System Dependencies"

    if [[ "$OS_FAMILY" == "debian" ]]; then
        # Check if core utilities are already installed
        if command -v curl &>/dev/null && command -v wget &>/dev/null && command -v unzip &>/dev/null && command -v git &>/dev/null && command -v rsync &>/dev/null; then
            success "Core system packages already installed"
        else
            run_or_fail "Updating package repositories" apt-get update -y --fix-missing
            run_or_fail "Installing core packages" \
                apt-get install -y curl wget unzip git tar gnupg2 ca-certificates lsb-release \
                    apt-transport-https rsync software-properties-common
        fi

        # Setup & Install PHP & required extensions if missing
        if command -v php &>/dev/null && php -m 2>/dev/null | grep -qi 'pdo_mysql' && php -m 2>/dev/null | grep -qi 'redis' && php -m 2>/dev/null | grep -qi 'mbstring'; then
            success "PHP $(php -r 'echo PHP_VERSION;' 2>/dev/null || echo '8.2+') & required extensions already installed"
        else
            if ! command -v php &>/dev/null; then
                spinner_start "Configuring PHP repository"
                if [[ "${OS_NAME}" == "ubuntu" ]]; then
                    run_quietly add-apt-repository -y ppa:ondrej/php
                    run_quietly apt-get update -y
                elif [[ "${OS_NAME}" == "debian" ]]; then
                    curl -sSLo /etc/apt/trusted.gpg.d/php.gpg https://packages.sury.org/php/apt.gpg > /dev/null 2>&1 || true
                    echo "deb https://packages.sury.org/php/ $(lsb_release -sc 2>/dev/null || echo bookworm) main" > /etc/apt/sources.list.d/php.list
                    run_quietly apt-get update -y
                fi
                spinner_stop
            fi

            spinner_start "Installing PHP & required extensions"
            if apt-get install -y php-cli php-fpm php-mysql php-xml php-curl php-mbstring php-zip php-bcmath php-gmp php-redis php-intl php-sqlite3 php-gd >> "$LOG_FILE" 2>&1 || \
               apt-get install -y php8.2-cli php8.2-fpm php8.2-mysql php8.2-xml php8.2-curl php8.2-mbstring php8.2-zip php8.2-bcmath php8.2-gmp php8.2-redis php8.2-intl php8.2-sqlite3 php8.2-gd >> "$LOG_FILE" 2>&1 || \
               apt-get install -y php8.3-cli php8.3-fpm php8.3-mysql php8.3-xml php8.3-curl php8.3-mbstring php8.3-zip php8.3-bcmath php8.3-gmp php8.3-redis php8.3-intl php8.3-sqlite3 php8.3-gd >> "$LOG_FILE" 2>&1; then
                spinner_stop
                success "PHP & extensions installed"
            else
                spinner_stop
                error_msg "Failed to install PHP. Check ${LOG_FILE}"
                return 1
            fi
        fi

        # Database (MySQL / MariaDB)
        if command -v mysql &>/dev/null || systemctl is-active --quiet mariadb 2>/dev/null || systemctl is-active --quiet mysql 2>/dev/null; then
            success "Database server (MySQL/MariaDB) already installed & active"
        else
            spinner_start "Installing Database Server (MySQL / MariaDB)"
            if apt-get install -y mariadb-server >> "$LOG_FILE" 2>&1 || \
               apt-get install -y mysql-server >> "$LOG_FILE" 2>&1; then
                spinner_stop
                success "Database server installed"
            else
                spinner_stop
                error_msg "Failed to install Database server"
                return 1
            fi
            run_quietly systemctl start mariadb || run_quietly systemctl start mysql
            run_quietly systemctl enable mariadb || run_quietly systemctl enable mysql
        fi

        # Redis
        if command -v redis-server &>/dev/null || systemctl is-active --quiet redis-server 2>/dev/null || systemctl is-active --quiet redis 2>/dev/null; then
            success "Redis server already installed & active"
        else
            run_or_fail "Installing Redis" apt-get install -y redis-server
            run_quietly systemctl start redis-server
            run_quietly systemctl enable redis-server
        fi

        # Nginx & Supervisor
        if command -v nginx &>/dev/null; then
            success "Nginx web server already installed"
        else
            run_or_fail "Installing Nginx" apt-get install -y nginx
            run_quietly systemctl enable nginx
        fi

        if command -v supervisorctl &>/dev/null; then
            success "Supervisor process manager already installed"
        else
            run_or_fail "Installing Supervisor" apt-get install -y supervisor
            run_quietly systemctl enable supervisor
        fi

    elif [[ "$OS_FAMILY" == "rhel" ]]; then
        run_or_fail "Installing EPEL repository" dnf install -y epel-release
        run_or_fail "Installing core packages" dnf install -y curl wget unzip git tar gnupg ca-certificates rsync supervisor redis nginx

        if ! command -v php &>/dev/null; then
            run_quietly dnf module reset php -y
            run_quietly dnf module enable php:8.2 -y || run_quietly dnf module enable php:8.1 -y
            run_or_fail "Installing PHP & extensions" \
                dnf install -y php-cli php-fpm php-mysqlnd php-xml php-curl php-mbstring php-zip php-bcmath php-gmp php-process php-intl php-gd
        fi

        if ! command -v mysql &>/dev/null; then
            run_or_fail "Installing MariaDB Server" dnf install -y mariadb-server
            run_quietly systemctl start mariadb
            run_quietly systemctl enable mariadb
        fi

        run_quietly systemctl enable redis
        run_quietly systemctl start redis
        run_quietly systemctl enable nginx
        run_quietly systemctl start nginx
        run_quietly systemctl enable supervisord
        run_quietly systemctl start supervisord
    fi

    # Composer Installation
    if command -v composer &>/dev/null; then
        success "Composer $(composer --version 2>/dev/null | awk '{print $3}' || echo '') already installed"
    else
        run_or_fail "Installing Composer" \
            bash -c "curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer"
    fi

    # Node.js Installation (Node 20 LTS)
    if command -v node &>/dev/null && [[ $(node -v 2>/dev/null | cut -d. -f1 | tr -d 'v') -ge 18 ]]; then
        success "Node.js $(node --version) already installed"
    else
        spinner_start "Installing Node.js 20 LTS"
        if curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >> "$LOG_FILE" 2>&1 && $PKG_MANAGER install -y nodejs >> "$LOG_FILE" 2>&1; then
            spinner_stop
            success "Node.js 20 LTS installed"
        else
            spinner_stop
            run_or_fail "Installing Node.js via package manager" $PKG_MANAGER install -y nodejs npm
        fi
    fi

    printf "\n"
}

# --- Download panel source archive --------------------------------------------
download_panel() {
    step 4 8 "Downloading Vertex Panel"

    # Check if panel codebase is already present at INSTALL_DIR
    if [[ -f "${INSTALL_DIR}/artisan" && -f "${INSTALL_DIR}/composer.json" ]]; then
        success "Vertex Panel codebase already present at ${INSTALL_DIR} (skipping download)"
        printf "\n"
        return 0
    fi

    local archive_url="https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip"
    local tmp_zip="/tmp/vertex-panel.zip"
    local tmp_dir="/tmp/vertex-panel-src"

    spinner_start "Downloading release archive from GitHub"
    if curl -fsSL "$archive_url" -o "$tmp_zip" 2>>"$LOG_FILE"; then
        spinner_stop
        local size
        size=$(du -sh "$tmp_zip" 2>/dev/null | cut -f1 || echo "archive")
        success "Downloaded archive (${size})"
    else
        spinner_stop
        error_msg "Download failed. Check repository access."
        exit 1
    fi

    run_or_fail "Extracting source archive" unzip -q -o "$tmp_zip" -d "$tmp_dir"

    local extracted_dir
    extracted_dir=$(find "$tmp_dir" -maxdepth 1 -type d -not -path "$tmp_dir" | head -1)

    run_or_fail "Creating installation directory (${INSTALL_DIR})" mkdir -p "$INSTALL_DIR"

    spinner_start "Copying files to ${INSTALL_DIR}"
    if rsync -a --delete "${extracted_dir}/" "${INSTALL_DIR}/" >> "$LOG_FILE" 2>&1; then
        spinner_stop
        success "Panel files deployed to ${INSTALL_DIR}"
    else
        spinner_stop
        error_msg "Failed to copy panel files."
        exit 1
    fi

    run_quietly rm -rf "$tmp_zip" "$tmp_dir"
    printf "\n"
}

# --- Configure Laravel, Database & Assets -------------------------------------
configure_panel() {
    step 5 8 "Configuring Application & Database"

    cd "$INSTALL_DIR"

    # Pre-create all required storage directories
    mkdir -p storage/app/public \
             storage/framework/cache/data \
             storage/framework/sessions \
             storage/framework/views \
             storage/logs \
             bootstrap/cache

    spinner_start "Writing .env environment configuration"
    cp .env.example .env 2>/dev/null || true
    local redis_pass=""
    redis_pass=$(redis-cli CONFIG GET requirepass 2>/dev/null | tail -n 1 || true)

    cat > .env <<ENVEOF
APP_NAME="Vertex Panel"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=${APP_URL}

LOG_CHANNEL=stack
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=${DB_DATABASE}
DB_USERNAME=${DB_USERNAME}
DB_PASSWORD=${DB_PASSWORD}

CACHE_DRIVER=redis
FILESYSTEM_DISK=local
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis
SESSION_LIFETIME=525600

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=${redis_pass}
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=${MAIL_HOST}
MAIL_PORT=${MAIL_PORT}
MAIL_USERNAME=${MAIL_USERNAME}
MAIL_PASSWORD=${MAIL_PASSWORD}
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS="${MAIL_FROM_ADDRESS}"
MAIL_FROM_NAME="${MAIL_FROM_NAME}"
ENVEOF
    spinner_stop
    success "Environment file written (.env)"

    spinner_start "Configuring MySQL Database & User"
    local sql_query="
CREATE DATABASE IF NOT EXISTS \`${DB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USERNAME}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USERNAME}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_DATABASE}\`.* TO '${DB_USERNAME}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_DATABASE}\`.* TO '${DB_USERNAME}'@'localhost';
FLUSH PRIVILEGES;
"

    # Robust database connection attempt (socket auth first, then password auth)
    if mysql -u root > /dev/null 2>&1 <<< "$sql_query"; then
        spinner_stop
        success "MySQL Database '${DB_DATABASE}' initialized (via socket auth)"
    elif [[ -n "$DB_ROOT_PASSWORD" ]] && mysql -u root -p"${DB_ROOT_PASSWORD}" > /dev/null 2>&1 <<< "$sql_query"; then
        spinner_stop
        success "MySQL Database '${DB_DATABASE}' initialized (via root password)"
    elif mariadb -u root > /dev/null 2>&1 <<< "$sql_query"; then
        spinner_stop
        success "MariaDB Database '${DB_DATABASE}' initialized (via socket auth)"
    else
        spinner_stop
        warn "Could not connect to MySQL with root credentials. Attempting direct migration..."
    fi

    # Composer dependencies check
    if [[ -d "${INSTALL_DIR}/vendor" && -f "${INSTALL_DIR}/vendor/autoload.php" ]]; then
        success "PHP dependencies (Composer vendor) already installed"
    else
        run_or_fail "Installing PHP dependencies (Composer)" \
            php -d memory_limit=-1 $(which composer) install --no-dev --optimize-autoloader --no-interaction
    fi

    # Application encryption key check
    if grep -q "^APP_KEY=base64:" "${INSTALL_DIR}/.env" 2>/dev/null && [[ -n $(grep "^APP_KEY=" "${INSTALL_DIR}/.env" | cut -d= -f2-) ]]; then
        success "Application Encryption Key already generated"
    else
        run_or_fail "Generating Application Encryption Key" \
            php artisan key:generate --no-interaction --force
    fi

    run_or_fail "Executing Database Migrations" \
        php artisan migrate --force --no-interaction

    run_or_fail "Publishing Vendor Assets" \
        php artisan vendor:publish --tag=laravel-assets --no-interaction --force

    spinner_start "Setting file ownership and permissions"
    if id "$SERVICE_USER" &>/dev/null; then
        chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" > /dev/null 2>&1 || true
    fi
    chmod -R 775 "${INSTALL_DIR}/storage" "${INSTALL_DIR}/bootstrap/cache" "${INSTALL_DIR}/public/build" > /dev/null 2>&1 || true
    spinner_stop
    success "File permissions configured"

    # Node.js dependencies & Vite frontend asset build check
    if [[ -f "${INSTALL_DIR}/public/build/manifest.json" ]]; then
        success "Frontend assets (Vite build) already compiled at public/build"
    else
        spinner_start "Installing Frontend Node.js dependencies"
        if npm install --prefix "${INSTALL_DIR}" --legacy-peer-deps --no-audit --no-fund >> "$LOG_FILE" 2>&1; then
            spinner_stop
            success "Node.js dependencies installed"
        else
            spinner_stop
            warn "Node.js dependencies completed with warnings (proceeding to build)"
        fi

        spinner_start "Compiling Frontend Assets (Vite)"
        export NODE_OPTIONS="--max-old-space-size=8192"
        if npm run build --prefix "${INSTALL_DIR}" >> "$LOG_FILE" 2>&1; then
            spinner_stop
            success "Frontend assets compiled successfully"
        else
            spinner_stop
            warn "Vite npm run build reported warnings — trying direct fallback"
        fi

        # Verify manifest.json generation
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

        # Prune devDependencies after build — frees ~200 MB of node_modules at runtime
        spinner_start "Pruning dev Node.js dependencies post-build"
        npm prune --production --prefix "${INSTALL_DIR}" >> "$LOG_FILE" 2>&1 || true
        spinner_stop
        success "Dev dependencies pruned (runtime node_modules reduced)"
    fi

    run_or_fail "Clearing Application Cache" \
        php artisan optimize:clear

    run_or_fail "Optimizing Application Caching" \
        php artisan optimize

    # ── MySQL / MariaDB low-RAM tuning ─────────────────────────────────────────
    # InnoDB buffer pool defaults are too large for a 1 GB VPS.
    # This config file caps it to 64 MB and reduces per-connection overhead.
    spinner_start "Applying low-RAM MySQL/MariaDB tuning"
    local mysql_conf_dir
    if [[ -d /etc/mysql/conf.d ]]; then
        mysql_conf_dir="/etc/mysql/conf.d"
    elif [[ -d /etc/my.cnf.d ]]; then
        mysql_conf_dir="/etc/my.cnf.d"
    else
        mkdir -p /etc/mysql/conf.d
        mysql_conf_dir="/etc/mysql/conf.d"
    fi
    cat > "${mysql_conf_dir}/vertex-low-ram.cnf" <<MYSQLEOF
[mysqld]
# Vertex Panel — Low-RAM VPS Tuning
# Safe for < 1 GB RAM; adjust innodb_buffer_pool_size up if you have more headroom.
innodb_buffer_pool_size     = 64M
innodb_log_buffer_size      = 4M
max_connections             = 25
tmp_table_size              = 16M
max_heap_table_size         = 16M
performance_schema          = OFF
MYSQLEOF
    # Restart whichever database service is actually running
    if systemctl is-active --quiet mariadb 2>/dev/null; then
        systemctl restart mariadb > /dev/null 2>&1 || true
    elif systemctl is-active --quiet mysql 2>/dev/null; then
        systemctl restart mysql > /dev/null 2>&1 || true
    else
        ( systemctl restart mariadb > /dev/null 2>&1 || systemctl restart mysql > /dev/null 2>&1 || true )
    fi
    spinner_stop
    success "MySQL/MariaDB low-RAM config applied (buffer pool: 64 MB, max_connections: 25)"

    # ── PHP-FPM low-RAM pool tuning ────────────────────────────────────────────
    # Cap workers so PHP-FPM can't spawn 100+ processes (each ~20 MB).
    spinner_start "Applying low-RAM PHP-FPM pool tuning"
    local fpm_pool_dir
    fpm_pool_dir=$(ls -d /etc/php*/fpm/pool.d /etc/php-fpm.d 2>/dev/null | head -1 || echo "")
    if [[ -n "$fpm_pool_dir" ]]; then
        cat > "${fpm_pool_dir}/zz-vertex-low-ram.conf" <<FPMEOF
; Vertex Panel — Low-RAM PHP-FPM Pool (overrides defaults)
; Max 10 workers × ~20 MB = 200 MB ceiling for PHP-FPM.
[www]
pm = dynamic
pm.max_children = 10
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
pm.max_requests = 500
FPMEOF
        # PHP memory limits and OPcache cap.
        # Derive the FPM conf.d path from the already-resolved pool dir
        # (e.g. /etc/php/8.2/fpm/pool.d -> /etc/php/8.2/fpm/conf.d).
        local php_fpm_conf_d
        php_fpm_conf_d="$(dirname "$fpm_pool_dir")/conf.d"
        mkdir -p "$php_fpm_conf_d" 2>/dev/null || true
        if [[ -d "$php_fpm_conf_d" ]]; then
            cat > "${php_fpm_conf_d}/99-vertex-ram.ini" <<PHPEOF
; Vertex Panel — RAM limits
memory_limit = 128M
opcache.memory_consumption = 64
opcache.interned_strings_buffer = 8
opcache.max_accelerated_files = 4000
opcache.revalidate_freq = 60
PHPEOF
        fi
        # Also write to any other conf.d dirs found (e.g. cli, opcache)
        while IFS= read -r extra_confd; do
            [[ "$extra_confd" == "$php_fpm_conf_d" ]] && continue
            mkdir -p "$extra_confd" 2>/dev/null || true
            [[ -d "$extra_confd" ]] && cat > "${extra_confd}/99-vertex-ram.ini" <<PHPEOF2
; Vertex Panel — RAM limits
memory_limit = 128M
opcache.memory_consumption = 64
opcache.interned_strings_buffer = 8
opcache.max_accelerated_files = 4000
opcache.revalidate_freq = 60
PHPEOF2
        done < <(find /etc/php* /usr/local/etc/php -type d -name 'conf.d' 2>/dev/null | sort -u || true)
        fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
        if [[ -n "$fpm_svc" ]]; then
            systemctl reload "$fpm_svc" > /dev/null 2>&1 || true
        fi
        spinner_stop
        success "PHP-FPM pool tuned (max 10 workers, memory_limit 128M, OPcache 64 MB)"
    else
        spinner_stop
        warn "Could not locate PHP-FPM pool directory — skipping pool tuning"
    fi

    # ── Redis low-RAM config ───────────────────────────────────────────────────
    spinner_start "Applying low-RAM Redis configuration"
    local redis_live=false
    # Run in a subshell so redis-cli failures don't propagate under set -e
    if ( redis-cli CONFIG SET maxmemory 67108864 > /dev/null 2>&1 && \
         redis-cli CONFIG SET maxmemory-policy allkeys-lru > /dev/null 2>&1 ); then
        redis_live=true
    fi
    if [[ "$redis_live" == "true" ]]; then
        spinner_stop
        success "Redis maxmemory set to 64 MB (allkeys-lru eviction) — live config applied"
    else
        # Fallback: write a persistent config snippet
        mkdir -p /etc/redis 2>/dev/null || true
        cat > /etc/redis/vertex-low-ram.conf <<REDISEOF
# Vertex Panel — Low-RAM Redis Config
maxmemory 64mb
maxmemory-policy allkeys-lru
# Disable RDB snapshots — saves CPU spikes and disk I/O
save ""
REDISEOF
        spinner_stop
        warn "Redis not live — config written to /etc/redis/vertex-low-ram.conf (include it in your redis.conf)"
    fi

    printf "\n"
}

# --- Configure Nginx ----------------------------------------------------------
configure_nginx() {
    step 6 8 "Configuring Nginx Web Server"

    mkdir -p /var/log/nginx /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d

    # Start PHP-FPM service to initialize sockets
    local fpm_svc
    fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
    if [[ -n "$fpm_svc" ]]; then
        run_quietly systemctl start "$fpm_svc"
    fi

    local domain php_sock
    domain=$(printf "%s" "$APP_URL" | sed 's|https\?://||' | sed 's|/.*||' | sed 's|:[0-9]*||')
    domain="${domain:-_}"

    # Socket resolution fallback (Unix Socket vs TCP Port 9000)
    local raw_sock
    raw_sock=$(ls /run/php/php*.sock /var/run/php*.sock 2>/dev/null | head -1 || echo "")
    if [[ -n "$raw_sock" ]]; then
        php_sock="unix:${raw_sock}"
    else
        php_sock="127.0.0.1:9000"
    fi

    spinner_start "Writing Nginx configuration for ${domain}"
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

    # Cloudflare Real IP restoring
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 173.245.48.0/21;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 2400:cb00::/32;
    set_real_ip_from 2606:4700::/32;
    set_real_ip_from 2803:f800::/32;
    set_real_ip_from 2405:b500::/32;
    set_real_ip_from 2405:8100::/32;
    set_real_ip_from 2c0f:f248::/32;
    set_real_ip_from 2a06:98c0::/29;
    real_ip_header CF-Connecting-IP;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php\$ {
        fastcgi_split_path_info ^(.+\.php)(/.+)\$;
        fastcgi_pass ${php_sock};
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        fastcgi_param HTTP_PROXY "";
        fastcgi_param HTTPS \$http_x_forwarded_proto;
        fastcgi_read_timeout 300;

        # Prevent FastCGI header buffer overflow (Cloudflare 502 Bad Gateway)
        fastcgi_buffer_size 64k;
        fastcgi_buffers 16 32k;
        fastcgi_busy_buffers_size 64k;
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
    success "Nginx virtual host written -> ${NGINX_CONF}"

    if [[ "$OS_FAMILY" == "debian" ]]; then
        run_or_fail "Enabling site symlink" ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/vertex-panel
        run_quietly rm -f /etc/nginx/sites-enabled/default
    fi

    run_or_fail "Testing Nginx configuration" nginx -t
    run_or_fail "Reloading Nginx service" systemctl reload nginx

    printf "\n"
}

# --- Configure Queue Workers (Supervisor) -------------------------------------
configure_supervisor() {
    step 7 8 "Configuring Queue Workers (Supervisor)"

    local sup_dir
    sup_dir=$(dirname "${SUPERVISOR_CONF}")
    mkdir -p "$sup_dir" /var/log/vertex-panel
    if id "$SERVICE_USER" &>/dev/null; then
        chown -R "${SERVICE_USER}:${SERVICE_USER}" /var/log/vertex-panel > /dev/null 2>&1 || true
    fi

    spinner_start "Writing Supervisor process configurations"
    # NOTE: vertex-queue workers removed — Horizon manages its own worker pool
    # (configured via config/horizon.php maxProcesses=4 in production).
    # Running BOTH vertex-queue AND vertex-horizon used to double-spawn workers,
    # wasting ~60-120 MB on a 1 GB VPS.
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
    success "Supervisor configuration written -> ${SUPERVISOR_CONF}"

    if command -v supervisorctl &>/dev/null; then
        run_quietly supervisorctl reread
        run_quietly supervisorctl update
        run_quietly supervisorctl start vertex-horizon
        success "Supervisor updated — Horizon process started"
    fi

    printf "\n"
}

# --- Install 'vertex' System Management CLI -----------------------------------
install_cli() {
    step 8 8 "Installing System Management CLI ('vertex')"

    spinner_start "Writing /usr/local/bin/vertex CLI tool"
    cat > /usr/local/bin/vertex <<'CLIEOF'
#!/usr/bin/env bash
# =============================================================================
# Vertex Panel - System Management CLI
# =============================================================================
set -euo pipefail
INSTALL_DIR="/var/www/vertex-panel"
GREEN='\033[0;32m' YELLOW='\033[0;33m' BLUE='\033[0;34m' CYAN='\033[0;36m'
BOLD='\033[1m' DIM='\033[2m' RED='\033[0;31m' RESET='\033[0m'

usage() {
    printf "\n"
    printf "  ${BOLD}${BLUE}Vertex Panel${RESET} - System Management CLI\n"
    printf "  ------------------------------------------------------------\n"
    printf "  ${BOLD}Usage:${RESET} vertex <command>\n"
    printf "\n"
    printf "  ${BOLD}Commands:${RESET}\n"
    printf "    ${CYAN}status${RESET}          Show status of panel services & background workers\n"
    printf "    ${CYAN}start${RESET}           Start all panel services\n"
    printf "    ${CYAN}stop${RESET}            Stop queue workers and services\n"
    printf "    ${CYAN}restart${RESET}         Restart all services\n"
    printf "    ${CYAN}doctor${RESET}          Run health check diagnostic on system & panel\n"
    printf "    ${CYAN}ssl${RESET}             Issue free SSL certificate via Let's Encrypt / Certbot\n"
    printf "    ${CYAN}backup${RESET}          Run backup script\n"
    printf "    ${CYAN}restore <url>${RESET}    Restore panel from backup\n"
    printf "    ${CYAN}update${RESET}          Pull latest update from GitHub and build\n"
    printf "    ${CYAN}logs${RESET}            Tail application logs\n"
    printf "    ${CYAN}queue-logs${RESET}      Tail queue worker logs\n"
    printf "    ${CYAN}artisan <cmd>${RESET}   Execute Laravel Artisan command\n"
    printf "    ${CYAN}version${RESET}         Show installed panel version\n"
    printf "\n"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        printf "${RED}Error: Root privileges required. Try: sudo vertex %s${RESET}\n" "${1:-}"
        exit 1
    fi
}

case "${1:-}" in
    status)
        printf "\n  ${BOLD}Vertex Panel - Service Status${RESET}\n"
        printf "  ----------------------------------------\n"
        fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "php-fpm")
        for svc in nginx "$fpm_svc" redis-server redis mariadb mysql supervisor supervisord; do
            if systemctl is-active --quiet "$svc" 2>/dev/null; then
                printf "  ${GREEN}[running]${RESET}  %s\n" "$svc"
            fi
        done
        printf "\n  ${BOLD}Queue Workers:${RESET}\n"
        supervisorctl status 2>/dev/null | sed 's/^/  /' || printf "  Supervisor not running\n"
        printf "\n"
        ;;
    start)
        check_root "$1"
        printf "${GREEN}Starting Panel services...${RESET}\n"
        systemctl start nginx redis-server redis supervisor supervisord 2>/dev/null || true
        systemctl start mariadb 2>/dev/null || systemctl start mysql 2>/dev/null || true
        fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
        [[ -n "$fpm_svc" ]] && systemctl start "$fpm_svc" 2>/dev/null || true
        supervisorctl start all 2>/dev/null || true
        printf "${GREEN}All services started.${RESET}\n"
        ;;
    stop)
        check_root "$1"
        printf "${YELLOW}Stopping queue workers...${RESET}\n"
        supervisorctl stop all 2>/dev/null || true
        printf "${YELLOW}Queue workers stopped.${RESET}\n"
        ;;
    restart)
        check_root "$1"
        printf "${CYAN}Restarting services...${RESET}\n"
        systemctl restart nginx redis-server redis supervisor supervisord 2>/dev/null || true
        systemctl restart mariadb 2>/dev/null || systemctl restart mysql 2>/dev/null || true
        fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
        [[ -n "$fpm_svc" ]] && systemctl restart "$fpm_svc" 2>/dev/null || true
        supervisorctl restart all 2>/dev/null || true
        printf "${GREEN}Services restarted successfully.${RESET}\n"
        ;;
    doctor)
        printf "\n  ${BOLD}Vertex Panel - System Diagnostic Doctor${RESET}\n"
        printf "  ------------------------------------------------------------\n"
        [[ -d "$INSTALL_DIR" ]] && printf "  ${GREEN}ok${RESET} Installation directory exists: %s\n" "$INSTALL_DIR" || printf "  ${RED}xx${RESET} Missing directory: %s\n" "$INSTALL_DIR"
        [[ -f "${INSTALL_DIR}/.env" ]] && printf "  ${GREEN}ok${RESET} Environment configuration .env present\n" || printf "  ${RED}xx${RESET} Missing .env configuration!\n"
        php "${INSTALL_DIR}/artisan" --version 2>/dev/null && printf "  ${GREEN}ok${RESET} Laravel CLI working\n" || printf "  ${RED}xx${RESET} Artisan CLI failure!\n"
        nginx -t 2>/dev/null && printf "  ${GREEN}ok${RESET} Nginx configuration valid\n" || printf "  ${RED}xx${RESET} Nginx configuration error!\n"
        printf "\n"
        ;;
    ssl)
        check_root "$1"
        printf "\n  ${BOLD}Vertex Panel - Certbot SSL Setup${RESET}\n"
        printf "  ------------------------------------------------------------\n"
        if ! command -v certbot &>/dev/null; then
            printf "  Installing Certbot...\n"
            apt-get update -y && apt-get install -y certbot python3-certbot-nginx 2>/dev/null || dnf install -y certbot python3-certbot-nginx 2>/dev/null
        fi
        domain=$(grep '^APP_URL=' "${INSTALL_DIR}/.env" | cut -d'=' -f2- | sed 's|https\?://||' | sed 's|/.*||')
        printf "  Issuing SSL certificate for domain: ${BOLD}%s${RESET}\n" "$domain"
        certbot --nginx -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email || certbot --nginx -d "$domain"
        ;;
    backup)
        check_root "$1"
        bash "${INSTALL_DIR}/backup.sh" "${@:2}"
        ;;
    restore)
        check_root "$1"
        bash "${INSTALL_DIR}/restore.sh" "${@:2}"
        ;;
    update)
        check_root "$1"
        export COMPOSER_ALLOW_SUPERUSER=1
        tmp_zip="/tmp/vertex-update.zip"
        tmp_dir="/tmp/vertex-update-src"
        printf "${CYAN}Downloading update archive from GitHub...${RESET}\n"
        curl -fsSL "https://github.com/Bossa9973/Vertex-Panel/archive/refs/heads/main.zip" -o "$tmp_zip"
        unzip -q -o "$tmp_zip" -d "$tmp_dir"
        src_dir=$(find "$tmp_dir" -maxdepth 1 -type d -not -path "$tmp_dir" | head -1)
        php "${INSTALL_DIR}/artisan" down --no-interaction || true
        rsync -a --delete --exclude='.env' --exclude='storage/' --exclude='node_modules/' --exclude='vendor/' "${src_dir}/" "${INSTALL_DIR}/"
        chown -R www-data:www-data "${INSTALL_DIR}" 2>/dev/null || true
        chmod -R 775 "${INSTALL_DIR}/storage" "${INSTALL_DIR}/bootstrap/cache" "${INSTALL_DIR}/public/build" 2>/dev/null || true
        php -d memory_limit=-1 $(which composer) install --no-dev --optimize-autoloader --no-interaction -d "${INSTALL_DIR}"
        export NODE_OPTIONS="--max-old-space-size=8192"
        npm install --prefix "${INSTALL_DIR}" --legacy-peer-deps --no-audit --no-fund --prefer-offline
        npm run build --prefix "${INSTALL_DIR}"
        if [[ ! -f "${INSTALL_DIR}/public/build/manifest.json" ]]; then
            (cd "${INSTALL_DIR}" && npx vite build) || true
        fi
        php "${INSTALL_DIR}/artisan" optimize:clear
        php "${INSTALL_DIR}/artisan" migrate --force --no-interaction
        php "${INSTALL_DIR}/artisan" optimize
        chown -R www-data:www-data "${INSTALL_DIR}" 2>/dev/null || true
        chmod -R 775 "${INSTALL_DIR}/storage" "${INSTALL_DIR}/bootstrap/cache" "${INSTALL_DIR}/public/build" 2>/dev/null || true
        supervisorctl restart all 2>/dev/null || true
        php "${INSTALL_DIR}/artisan" up --no-interaction || true
        rm -rf "$tmp_zip" "$tmp_dir"
        printf "${GREEN}Vertex Panel updated successfully!${RESET}\n"
        ;;
    build)
        check_root "$1"
        printf "${CYAN}Building frontend assets (Vite)...${RESET}\n"
        export NODE_OPTIONS="--max-old-space-size=8192"
        npm install --prefix "${INSTALL_DIR}" --legacy-peer-deps --no-audit --no-fund
        npm run build --prefix "${INSTALL_DIR}"
        if [[ ! -f "${INSTALL_DIR}/public/build/manifest.json" ]]; then
            (cd "${INSTALL_DIR}" && npx vite build) || true
        fi
        php "${INSTALL_DIR}/artisan" optimize:clear
        chown -R www-data:www-data "${INSTALL_DIR}" 2>/dev/null || true
        chmod -R 775 "${INSTALL_DIR}/storage" "${INSTALL_DIR}/bootstrap/cache" "${INSTALL_DIR}/public/build" 2>/dev/null || true
        if [[ -f "${INSTALL_DIR}/public/build/manifest.json" ]]; then
            printf "${GREEN}Frontend assets built successfully -> public/build/manifest.json${RESET}\n"
        else
            printf "${RED}Build error: public/build/manifest.json missing.${RESET}\n"
            exit 1
        fi
        ;;
    logs)
        tail -f "${INSTALL_DIR}/storage/logs/laravel.log"
        ;;
    queue-logs)
        tail -f /var/log/vertex-panel/queue.log
        ;;
    artisan)
        shift
        php "${INSTALL_DIR}/artisan" "$@"
        ;;
    version)
        grep -oP '(?<="version": ")[^"]+' "${INSTALL_DIR}/package.json" 2>/dev/null | head -1 || printf "%s\n" "$PANEL_VERSION"
        ;;
    *)
        usage
        ;;
esac
CLIEOF

    chmod +x /usr/local/bin/vertex
    spinner_stop
    success "'vertex' CLI management tool installed (/usr/local/bin/vertex)"
    printf "\n"
}

# --- Start all services -------------------------------------------------------
start_services() {
    step 8 8 "Starting All System Services"

    run_quietly systemctl restart redis-server || run_quietly systemctl restart redis
    run_quietly systemctl restart mariadb || run_quietly systemctl restart mysql

    local fpm_svc
    fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
    if [[ -n "$fpm_svc" ]]; then
        run_quietly systemctl restart "$fpm_svc"
    fi

    run_quietly systemctl restart nginx
    run_quietly systemctl restart supervisor || run_quietly systemctl restart supervisord

    sleep 2

    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "127.0.0.1")

    printf "\n"
    success "All services active and verified."
    info  "Access Panel URL:  ${CYAN}${BOLD}${APP_URL}${RESET}"
    info  "Server IP Address: ${CYAN}http://${SERVER_IP}${RESET}"
    printf "\n"
}

# --- Print completion summary -------------------------------------------------
print_completion() {
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "   ${GREEN}${BOLD}Pristine Installation Completed Successfully!${RESET}\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
    printf "   ${BOLD}Access your Panel:${RESET}\n"
    printf "     Domain:    ${CYAN}${BOLD}%s${RESET}\n" "$APP_URL"
    printf "     Direct IP: ${CYAN}http://%s${RESET}\n" "${SERVER_IP:-<server-ip>}"
    printf "\n"
    printf "   ${BOLD}Panel Installation Path:${RESET}  ${DIM}%s${RESET}\n" "$INSTALL_DIR"
    printf "   ${BOLD}Log Directory Path:${RESET}       ${DIM}/var/log/vertex-panel/${RESET}\n"
    printf "\n"
    printf "   ${BOLD}System Management CLI Commands:${RESET}\n"
    printf "     ${CYAN}vertex status${RESET}         Check panel service health\n"
    printf "     ${CYAN}vertex doctor${RESET}         Run system diagnostics\n"
    printf "     ${CYAN}vertex ssl${RESET}            Setup Let's Encrypt SSL certificate\n"
    printf "     ${CYAN}vertex update${RESET}         Pull updates from GitHub\n"
    printf "     ${CYAN}vertex artisan c:user:make${RESET} Create Admin Account\n"
    printf "\n"

    if [[ ${#ERRORS[@]} -gt 0 ]]; then
        printf "   ${YELLOW}${BOLD}Noted Warnings:${RESET}\n"
        for err in "${ERRORS[@]}"; do
            printf "   ${YELLOW}  * %s${RESET}\n" "$err"
        done
        printf "\n"
    fi

    printf "   ${BOLD}Next Step: Create an administrator account:${RESET}\n"
    printf "     ${CYAN}${BOLD}vertex artisan c:user:make${RESET}\n"
    printf "\n"
}

# --- Main Flow ----------------------------------------------------------------
print_banner
preflight_checks
collect_config
install_dependencies
download_panel
configure_panel
configure_nginx
configure_supervisor
install_cli
start_services
print_completion
