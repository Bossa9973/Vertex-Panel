#!/usr/bin/env bash
# =============================================================================
#
#  ##  ##  ####  #####  ####### ####  ##  ##
#  ##  ##  ##    ##  ##    ##   ##    ##  ##
#  ##  ##  ####  #####     ##   ####   ####
#   ####   ##    ## ##     ##   ##     ####
#    ##    ####  ##  ##    ##   #####  ## ##
#
#  Vertex Panel -- Automated Installer v1.0
#  GitHub: https://github.com/Bossa9973/Vertex-Panel
#
#  One-liner install:
#  curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/install.sh | bash
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

# --- State --------------------------------------------------------------------
SPINNER_PID=""
ERRORS=()

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
    printf "   ${DIM}Panel Installer  ${BOLD}v${PANEL_VERSION}${RESET}${DIM}  |  Powered by Laravel & Proxmox${RESET}\n"
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
warn()    { printf "   ${YELLOW}!!${RESET} ${YELLOW}%s${RESET}\n" "$1"; }
error_msg() { printf "   ${RED}xx${RESET} ${RED}${BOLD}%s${RESET}\n" "$1"; ERRORS+=("$1"); }

ask() {
    local prompt="$1"
    local default="${2:-}"
    local response=""
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

ask_yn() {
    local prompt="$1"
    local default="${2:-y}"
    local response=""
    printf "   ${CYAN}?${RESET}  ${WHITE}%s${RESET} ${DIM}[y/n, default: %s]${RESET}: " "$prompt" "$default" >&2
    if [[ -t 0 ]]; then
        read -r response
    else
        read -r response < /dev/tty 2>/dev/null || read -r response || response=""
    fi
    response="${response:-$default}"
    [[ "${response,,}" == "y" || "${response,,}" == "yes" ]]
}

run_quietly() { "$@" > /dev/null 2>&1; }

run_or_fail() {
    local msg="$1"
    shift
    spinner_start "$msg"
    if "$@" > /tmp/vertex_install.log 2>&1; then
        spinner_stop
        success "$msg"
    else
        spinner_stop
        error_msg "Failed: $msg"
        printf "   ${DIM}Details: /tmp/vertex_install.log${RESET}\n"
        return 1
    fi
}

# --- Pre-flight checks --------------------------------------------------------
preflight_checks() {
    step 1 8 "Pre-flight System Checks"

    if [[ $EUID -ne 0 ]]; then
        error_msg "Must be run as root. Try: sudo bash install.sh"
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
    [[ $ram_mb -lt 512 ]] && warn "Less than 512 MB RAM detected. Performance may be degraded."

    local free_gb
    free_gb=$(df -BG /var 2>/dev/null | awk 'NR==2{gsub(/G/,"",$4); print $4}' || echo 0)
    if [[ "${free_gb:-0}" -lt 2 ]]; then
        warn "Less than 2 GB free in /var. Installation may fail."
    else
        success "Free disk space: ${free_gb}GB"
    fi

    if curl -s --connect-timeout 5 https://github.com > /dev/null 2>&1; then
        success "Internet connectivity: OK"
    else
        error_msg "No internet access. Cannot reach GitHub."
        exit 1
    fi

    printf "\n"
}

# --- Collect user configuration -----------------------------------------------
collect_config() {
    step 2 8 "Configuration"
    info "Please provide the following details for your panel."
    printf "\n"

    APP_URL=$(ask "Panel URL (e.g. https://panel.yourdomain.com)")
    while [[ -z "$APP_URL" ]]; do
        warn "Panel URL cannot be empty."
        APP_URL=$(ask "Panel URL")
    done

    DB_DATABASE=$(ask "MySQL database name" "vertex_panel")
    DB_USERNAME=$(ask "MySQL database user" "vertex_user")
    DB_PASSWORD=$(ask_password "MySQL database password (min 8 chars)")
    while [[ ${#DB_PASSWORD} -lt 8 ]]; do
        warn "Password must be at least 8 characters."
        DB_PASSWORD=$(ask_password "MySQL database password")
    done
    DB_ROOT_PASSWORD=$(ask_password "MySQL root password (to create DB and user)")

    printf "\n"
    MAIL_HOST=$(ask "SMTP host" "smtp.mailtrap.io")
    MAIL_PORT=$(ask "SMTP port" "587")
    MAIL_USERNAME=$(ask "SMTP username" "null")
    MAIL_PASSWORD=$(ask_password "SMTP password")
    MAIL_FROM_ADDRESS=$(ask "Mail from address" "noreply@vertex-panel.com")
    MAIL_FROM_NAME=$(ask "Mail from name" "Vertex Panel")

    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "   ${BOLD}${WHITE}Configuration summary:${RESET}\n"
    printf "     Panel URL :  ${BOLD}%s${RESET}\n" "$APP_URL"
    printf "     DB Name   :  ${BOLD}%s${RESET}\n" "$DB_DATABASE"
    printf "     DB User   :  ${BOLD}%s${RESET}\n" "$DB_USERNAME"
    printf "     SMTP Host :  ${BOLD}%s:%s${RESET}\n" "$MAIL_HOST" "$MAIL_PORT"
    printf "\n"

    if ! ask_yn "Proceed with installation?"; then
        printf "\n"; info "Installation cancelled."; exit 0
    fi
    printf "\n"
}

# --- Install system dependencies ----------------------------------------------
install_dependencies() {
    step 3 8 "Installing System Dependencies"

    run_or_fail "Updating package lists" apt-get update -y

    run_or_fail "Installing core utilities" \
        apt-get install -y curl wget unzip git tar gnupg2 ca-certificates lsb-release \
            apt-transport-https rsync

    # Try installing software-properties-common quietly (available on Ubuntu, omitted on Debian)
    run_quietly apt-get install -y software-properties-common 2>/dev/null || true

    # PHP installation
    if ! command -v php &>/dev/null; then
        spinner_start "Installing PHP & extensions"
        if apt-get install -y php-cli php-fpm php-mysql php-xml php-curl php-mbstring php-zip php-bcmath php-gmp php-redis php-intl > /tmp/vertex_install.log 2>&1; then
            spinner_stop
            success "PHP & extensions installed"
        elif apt-get install -y php8.2-cli php8.2-fpm php8.2-mysql php8.2-xml php8.2-curl php8.2-mbstring php8.2-zip php8.2-bcmath php8.2-gmp php8.2-redis php8.2-intl > /tmp/vertex_install.log 2>&1; then
            spinner_stop
            success "PHP 8.2 & extensions installed"
        else
            # Fallback: add external PHP repository if system repo lacks PHP packages
            if [[ "${OS_NAME}" == "ubuntu" ]]; then
                run_quietly add-apt-repository -y ppa:ondrej/php 2>/dev/null || true
                run_quietly apt-get update -y
            elif [[ "${OS_NAME}" == "debian" ]]; then
                curl -sSLo /etc/apt/trusted.gpg.d/php.gpg https://packages.sury.org/php/apt.gpg > /dev/null 2>&1 || true
                echo "deb https://packages.sury.org/php/ $(lsb_release -sc 2>/dev/null || echo bookworm) main" > /etc/apt/sources.list.d/php.list
                run_quietly apt-get update -y
            fi

            if apt-get install -y php-cli php-fpm php-mysql php-xml php-curl php-mbstring php-zip php-bcmath php-gmp php-redis php-intl > /tmp/vertex_install.log 2>&1; then
                spinner_stop
                success "PHP & extensions installed"
            elif apt-get install -y php8.2-cli php8.2-fpm php8.2-mysql php8.2-xml php8.2-curl php8.2-mbstring php8.2-zip php8.2-bcmath php8.2-gmp php8.2-redis php8.2-intl > /tmp/vertex_install.log 2>&1; then
                spinner_stop
                success "PHP 8.2 & extensions installed"
            else
                spinner_stop
                error_msg "Failed to install PHP. Check /tmp/vertex_install.log"
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
        bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -" > /tmp/vertex_install.log 2>&1
        spinner_stop
        success "NodeSource repository added"
        run_or_fail "Installing Node.js 20 LTS" apt-get install -y nodejs
    else
        success "Node.js $(node --version) already installed"
    fi

    # MySQL / MariaDB Server
    if ! command -v mysql &>/dev/null; then
        spinner_start "Installing Database Server (MySQL / MariaDB)"
        if apt-get install -y mysql-server > /tmp/vertex_install.log 2>&1; then
            spinner_stop
            success "MySQL Server installed"
        elif apt-get install -y default-mysql-server > /tmp/vertex_install.log 2>&1; then
            spinner_stop
            success "Default MySQL Server installed"
        elif apt-get install -y mariadb-server > /tmp/vertex_install.log 2>&1; then
            spinner_stop
            success "MariaDB Server installed"
        else
            spinner_stop
            error_msg "Failed to install MySQL/MariaDB. Check /tmp/vertex_install.log"
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

# --- Download panel from GitHub -----------------------------------------------
download_panel() {
    step 4 8 "Downloading Vertex Panel"

    local archive_url="https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip"
    local tmp_zip="/tmp/vertex-panel.zip"
    local tmp_dir="/tmp/vertex-panel-src"

    spinner_start "Downloading from github.com/${GITHUB_REPO} @ ${GITHUB_BRANCH}"
    if curl -fsSL "$archive_url" -o "$tmp_zip" 2>/tmp/vertex_install.log; then
        spinner_stop
        local size
        size=$(du -sh "$tmp_zip" | cut -f1)
        success "Downloaded archive (${size})"
    else
        spinner_stop
        error_msg "Download failed. Check internet or repository access."
        exit 1
    fi

    run_or_fail "Extracting archive" unzip -q -o "$tmp_zip" -d "$tmp_dir"

    local extracted_dir
    extracted_dir=$(find "$tmp_dir" -maxdepth 1 -type d -not -path "$tmp_dir" | head -1)

    run_or_fail "Creating installation directory (${INSTALL_DIR})" mkdir -p "$INSTALL_DIR"

    spinner_start "Copying panel files to ${INSTALL_DIR}"
    if rsync -a --delete "${extracted_dir}/" "${INSTALL_DIR}/" > /tmp/vertex_install.log 2>&1; then
        spinner_stop
        success "Panel files installed to ${INSTALL_DIR}"
    else
        spinner_stop
        error_msg "Failed to copy panel files."
        exit 1
    fi

    run_quietly rm -rf "$tmp_zip" "$tmp_dir"
    printf "\n"
}

# --- Configure Laravel and database -------------------------------------------
configure_panel() {
    step 5 8 "Configuring Panel and Database"

    cd "$INSTALL_DIR"

    spinner_start "Writing .env configuration"
    cp .env.example .env
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
    success "Environment configuration written"

    spinner_start "Creating MySQL database and user"
    mysql -u root -p"${DB_ROOT_PASSWORD}" > /tmp/vertex_install.log 2>&1 <<SQLEOF
CREATE DATABASE IF NOT EXISTS \`${DB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USERNAME}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_DATABASE}\`.* TO '${DB_USERNAME}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQLEOF
    spinner_stop
    success "MySQL database '${DB_DATABASE}' and user '${DB_USERNAME}' created"

    run_or_fail "Installing PHP dependencies (Composer)" \
        composer install --no-dev --optimize-autoloader --no-interaction

    run_or_fail "Generating application key" \
        php artisan key:generate --no-interaction

    run_or_fail "Running database migrations" \
        php artisan migrate --force --no-interaction

    run_or_fail "Publishing vendor assets" \
        php artisan vendor:publish --tag=laravel-assets --no-interaction --force

    spinner_start "Setting file permissions"
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" > /dev/null 2>&1
    chmod -R 755 "${INSTALL_DIR}/storage" > /dev/null 2>&1
    chmod -R 755 "${INSTALL_DIR}/bootstrap/cache" > /dev/null 2>&1
    spinner_stop
    success "File permissions set"

    run_or_fail "Installing Node.js dependencies" \
        npm install --prefix "${INSTALL_DIR}" --silent

    run_or_fail "Building frontend assets (Vite)" \
        npm run build --prefix "${INSTALL_DIR}"

    run_or_fail "Optimizing application (caching config/routes)" \
        php artisan optimize

    printf "\n"
}

# --- Configure Nginx ----------------------------------------------------------
configure_nginx() {
    step 6 8 "Configuring Nginx"

    # Ensure log & config directories exist
    mkdir -p /var/log/nginx /etc/nginx/sites-available /etc/nginx/sites-enabled

    # Ensure PHP-FPM service is started so the Unix socket is present
    local fpm_svc
    fpm_svc=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
    if [[ -n "$fpm_svc" ]]; then
        run_quietly systemctl start "$fpm_svc" 2>/dev/null || true
    fi

    local domain php_sock
    domain=$(printf "%s" "$APP_URL" | sed 's|https\?://||' | sed 's|/.*||' | sed 's|:[0-9]*||')
    domain="${domain:-_}"
    php_sock=$(ls /run/php/php*.sock 2>/dev/null | head -1 || echo "/run/php/php-fpm.sock")

    spinner_start "Writing Nginx virtual host for ${domain}"
    cat > "${NGINX_CONF}" <<NGINXEOF
server {
    listen 80;
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

# --- Configure Supervisor queue workers ---------------------------------------
configure_supervisor() {
    step 7 8 "Configuring Queue Workers (Supervisor)"

    run_quietly mkdir -p /var/log/vertex-panel
    run_quietly chown -R "${SERVICE_USER}:${SERVICE_USER}" /var/log/vertex-panel

    spinner_start "Writing Supervisor configuration"
    cat > "${SUPERVISOR_CONF}" <<SUPEOF
[program:vertex-queue]
process_name=%(program_name)s_%(process_num)02d
command=php ${INSTALL_DIR}/artisan queue:work redis --sleep=3 --tries=3 --max-time=3600
directory=${INSTALL_DIR}
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=${SERVICE_USER}
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/vertex-panel/queue.log
stopwaitsecs=3600

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
stopwaitsecs=3600
SUPEOF
    spinner_stop
    success "Supervisor config written -> ${SUPERVISOR_CONF}"

    # Reload supervisor config so it picks up the new programs
    run_or_fail "Loading Supervisor configuration" \
        bash -c "supervisorctl reread && supervisorctl update"

    # Start each program explicitly and verify
    spinner_start "Starting vertex-queue workers"
    if supervisorctl start vertex-queue:* > /tmp/vertex_install.log 2>&1; then
        spinner_stop
        success "Queue workers (vertex-queue) started"
    else
        spinner_stop
        warn "vertex-queue may already be running or failed — check: supervisorctl status vertex-queue:*"
    fi

    spinner_start "Starting vertex-horizon worker"
    if supervisorctl start vertex-horizon > /tmp/vertex_install.log 2>&1; then
        spinner_stop
        success "Horizon worker (vertex-horizon) started"
    else
        spinner_stop
        warn "vertex-horizon may already be running or failed — check: supervisorctl status vertex-horizon"
    fi

    printf "\n"
}


# --- Install vertex CLI management tool ---------------------------------------
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
        for svc in nginx php8.2-fpm redis-server mysql supervisor; do
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
        local tmp_zip="/tmp/vertex-panel-update.zip"
        local tmp_dir="/tmp/vertex-panel-update"
        printf "${CYAN}Downloading latest release from GitHub...${RESET}\n"
        curl -fsSL "https://github.com/Bossa9973/Vertex-Panel/archive/refs/heads/main.zip" -o "$tmp_zip"
        unzip -q -o "$tmp_zip" -d "$tmp_dir"
        local src_dir
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

    # Wait briefly for supervisor programs to spin up
    sleep 2

    # Verify both Supervisor programs are running
    local queue_status horizon_status
    queue_status=$(supervisorctl status vertex-queue:vertex-queue_00 2>/dev/null | awk '{print $2}' || echo "UNKNOWN")
    horizon_status=$(supervisorctl status vertex-horizon 2>/dev/null | awk '{print $2}' || echo "UNKNOWN")

    printf "\n"
    printf "   ${BOLD}${WHITE}Worker status:${RESET}\n"
    if [[ "$queue_status" == "RUNNING" ]]; then
        success "vertex-queue workers: RUNNING"
    else
        warn "vertex-queue status: ${queue_status} (run: supervisorctl start vertex-queue:*)"
    fi
    if [[ "$horizon_status" == "RUNNING" ]]; then
        success "vertex-horizon worker: RUNNING"
    else
        warn "vertex-horizon status: ${horizon_status} (run: supervisorctl start vertex-horizon)"
    fi

    # Detect server IP
    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "<your-server-ip>")
    PANEL_PORT=80

    printf "\n"
    success "Panel is live at:  ${CYAN}${BOLD}http://${SERVER_IP}:${PANEL_PORT}${RESET}"
    info  "Configured URL:    ${CYAN}${APP_URL}${RESET}"
    printf "\n"
}

# --- Print completion summary -------------------------------------------------

print_completion() {
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
    printf "   ${GREEN}${BOLD}Installation Complete!${RESET}\n"
    printf "\n"
    printf "   ${BOLD}Access your panel:${RESET}\n"
    printf "     ${CYAN}${BOLD}http://${SERVER_IP:-<server-ip>}:80${RESET}          (direct IP)\n"
    printf "     ${CYAN}${BOLD}%s${RESET}  (domain)\n" "$APP_URL"
    printf "\n"
    printf "   ${BOLD}Panel Dir:${RESET}  ${DIM}%s${RESET}\n" "$INSTALL_DIR"
    printf "   ${BOLD}Log Dir:${RESET}    ${DIM}/var/log/vertex-panel/${RESET}\n"
    printf "\n"
    printf "   ${BOLD}Worker processes:${RESET}\n"
    printf "   ${DIM}vertex-queue:*      ${RESET} 2 queue worker processes\n"
    printf "   ${DIM}vertex-horizon      ${RESET} Horizon dashboard worker\n"
    printf "\n"
    printf "   ${BOLD}Management commands (run as root):${RESET}\n"
    printf "   ${DIM}vertex status           ${RESET}  Show service status\n"
    printf "   ${DIM}vertex start/stop/restart${RESET} Manage services\n"
    printf "   ${DIM}vertex logs             ${RESET}  Tail application logs\n"
    printf "   ${DIM}vertex queue-logs       ${RESET}  Tail queue/horizon logs\n"
    printf "   ${DIM}vertex update           ${RESET}  Pull latest from GitHub\n"
    printf "   ${DIM}vertex artisan <cmd>    ${RESET}  Run Artisan commands\n"
    printf "\n"

    if [[ ${#ERRORS[@]} -gt 0 ]]; then
        printf "   ${YELLOW}${BOLD}Non-fatal warnings:${RESET}\n"
        for err in "${ERRORS[@]}"; do
            printf "   ${YELLOW}  * %s${RESET}\n" "$err"
        done
        printf "\n"
    fi

    local domain
    domain=$(printf "%s" "$APP_URL" | sed 's|https\?://||' | sed 's|/.*||')
    printf "   ${DIM}Next: Point DNS A record for %s -> %s${RESET}\n" "$domain" "${SERVER_IP:-<server-ip>}"
    printf "   ${DIM}Then visit your URL to complete admin account setup.${RESET}\n"
    printf "\n"
    printf "   ${DIM}------------------------------------------------------------${RESET}\n"
    printf "\n"
}

# --- Main ---------------------------------------------------------------------
trap 'spinner_stop; printf "\n   ${RED}Installation interrupted. See /tmp/vertex_install.log${RESET}\n"; exit 1' ERR INT TERM

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
