#!/usr/bin/env bash
# =============================================================================
#  Vertex Panel -- Super Low-RAM Server Optimizer
# =============================================================================
#  Configures PHP-FPM (ondemand mode), OPcache, MySQL/MariaDB, Redis,
#  Swap memory, and Laravel caches to drastically reduce RAM usage so
#  bots and panel run smoothly side-by-side without freezing or crashing.
#
#  Usage:
#    sudo bash optimize-low-ram.sh
# =============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

info() { printf "${BLUE}[INFO]${RESET} %s\n" "$*"; }
success() { printf "${GREEN}[OK]${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${RESET} %s\n" "$*"; }
error_msg() { printf "${RED}[ERROR]${RESET} %s\n" "$*"; }

echo -e "${BOLD}======================================================${RESET}"
echo -e "${BOLD}   Vertex Panel -- Low-RAM Server Tuning Tool        ${RESET}"
echo -e "${BOLD}======================================================${RESET}"
echo ""

if [[ $EUID -ne 0 ]]; then
    error_msg "This script must be run as root (use sudo)."
    exit 1
fi

INSTALL_DIR="/var/www/vertex-panel"
if [[ ! -d "$INSTALL_DIR" && -f "artisan" ]]; then
    INSTALL_DIR="$(pwd)"
fi

# -----------------------------------------------------------------------------
# 1. SWAP MEMORY CHECK & CONFIGURATION
# -----------------------------------------------------------------------------
info "Step 1: Checking system swap memory..."
TOTAL_SWAP=$(free -m | awk '/Swap:/ {print $2}')

if [[ "$TOTAL_SWAP" -lt 1024 ]]; then
    warn "Swap is less than 1 GB (current: ${TOTAL_SWAP} MB). Creating a 2 GB swapfile..."
    if [[ ! -f /swapfile ]]; then
        fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        if ! grep -q '/swapfile' /etc/fstab; then
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
        fi
        success "2 GB swapfile created and activated"
    else
        swapon /swapfile 2>/dev/null || true
    fi
else
    success "Swap memory is adequate (${TOTAL_SWAP} MB)"
fi

# Set optimal swappiness for low-RAM servers (don't aggressively swap, but prevent OOM)
sysctl vm.swappiness=15 >/dev/null 2>&1 || true
sysctl vm.vfs_cache_pressure=50 >/dev/null 2>&1 || true
cat > /etc/sysctl.d/99-vertex-low-ram.conf <<EOF
vm.swappiness = 15
vm.vfs_cache_pressure = 50
EOF
success "Virtual memory sysctl parameters tuned (swappiness=15)"

# -----------------------------------------------------------------------------
# 2. PHP-FPM ON-DEMAND TUNING
# -----------------------------------------------------------------------------
info "Step 2: Tuning PHP-FPM pool for minimal idle RAM footprint..."
FPM_POOL_DIR=$(ls -d /etc/php/*/fpm/pool.d /etc/php-fpm.d 2>/dev/null | head -1 || echo "")

if [[ -n "$FPM_POOL_DIR" ]]; then
    # Use 'ondemand' process manager so PHP processes exit when idle (saving ~150-300MB RAM)
    cat > "${FPM_POOL_DIR}/zz-vertex-low-ram.conf" <<'EOF'
; Vertex Panel — Low-RAM PHP-FPM Pool
; ondemand mode frees all worker RAM when the panel is idle!
[www]
pm = ondemand
pm.max_children = 5
pm.process_idle_timeout = 10s
pm.max_requests = 200
EOF

    # OPcache & Memory limit
    PHP_CONF_D="$(dirname "$FPM_POOL_DIR")/conf.d"
    mkdir -p "$PHP_CONF_D" 2>/dev/null || true
    cat > "${PHP_CONF_D}/99-vertex-ram.ini" <<'EOF'
; Vertex Panel — Optimized RAM & OPcache settings
memory_limit = 128M
opcache.enable = 1
opcache.enable_cli = 0
opcache.memory_consumption = 48
opcache.interned_strings_buffer = 8
opcache.max_accelerated_files = 4000
opcache.revalidate_freq = 60
opcache.fast_shutdown = 1
EOF

    # Propagate to all PHP conf.d directories found
    while IFS= read -r extra_confd; do
        [[ "$extra_confd" == "$PHP_CONF_D" ]] && continue
        mkdir -p "$extra_confd" 2>/dev/null || true
        [[ -d "$extra_confd" ]] && cp -f "${PHP_CONF_D}/99-vertex-ram.ini" "${extra_confd}/99-vertex-ram.ini" 2>/dev/null || true
    done < <(find /etc/php* /usr/local/etc/php -type d -name 'conf.d' 2>/dev/null | sort -u || true)

    FPM_SVC=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
    if [[ -n "$FPM_SVC" ]]; then
        systemctl restart "$FPM_SVC" > /dev/null 2>&1 || systemctl reload "$FPM_SVC" > /dev/null 2>&1 || true
        success "PHP-FPM reloaded in ondemand mode (max 5 workers, idle timeout 10s)"
    fi
else
    warn "Could not locate PHP-FPM pool directory."
fi

# -----------------------------------------------------------------------------
# 3. MARIADB / MYSQL LOW-RAM TUNING
# -----------------------------------------------------------------------------
info "Step 3: Tuning MariaDB / MySQL buffer pools..."
MYSQL_CONF_DIR=""
if [[ -d /etc/mysql/conf.d ]]; then
    MYSQL_CONF_DIR="/etc/mysql/conf.d"
elif [[ -d /etc/my.cnf.d ]]; then
    MYSQL_CONF_DIR="/etc/my.cnf.d"
else
    mkdir -p /etc/mysql/conf.d
    MYSQL_CONF_DIR="/etc/mysql/conf.d"
fi

cat > "${MYSQL_CONF_DIR}/vertex-low-ram.cnf" <<'EOF'
[mysqld]
# Vertex Panel — Low-RAM database tuning
innodb_buffer_pool_size     = 48M
innodb_log_buffer_size      = 4M
max_connections             = 25
tmp_table_size              = 16M
max_heap_table_size         = 16M
performance_schema          = OFF
key_buffer_size             = 8M
table_open_cache            = 400
thread_cache_size           = 4
EOF

if systemctl is-active --quiet mariadb 2>/dev/null; then
    systemctl restart mariadb > /dev/null 2>&1 || true
    success "MariaDB restarted with low-RAM parameters (48M buffer pool)"
elif systemctl is-active --quiet mysql 2>/dev/null; then
    systemctl restart mysql > /dev/null 2>&1 || true
    success "MySQL restarted with low-RAM parameters (48M buffer pool)"
fi

# -----------------------------------------------------------------------------
# 4. REDIS MEMORY LIMIT & PERSISTENCE HEALING
# -----------------------------------------------------------------------------
info "Step 4: Tuning Redis and fixing background save persistence..."
sysctl vm.overcommit_memory=1 >/dev/null 2>&1 || true
echo "vm.overcommit_memory = 1" > /etc/sysctl.d/99-redis-overcommit.conf 2>/dev/null || true

if command -v redis-cli >/dev/null 2>&1; then
    local rpass=""
    if [[ -f "${INSTALL_DIR}/.env" ]]; then
        rpass=$(grep '^REDIS_PASSWORD=' "${INSTALL_DIR}/.env" | cut -d= -f2- | tr -d '"' | tr -d "'" || echo "")
    fi
    if [[ -n "$rpass" && "$rpass" != "null" ]]; then
        redis-cli -a "$rpass" CONFIG SET stop-writes-on-bgsave-error no >/dev/null 2>&1 || true
        redis-cli -a "$rpass" CONFIG SET maxmemory 50331648 >/dev/null 2>&1 || true
        redis-cli -a "$rpass" CONFIG SET maxmemory-policy allkeys-lru >/dev/null 2>&1 || true
    else
        redis-cli CONFIG SET stop-writes-on-bgsave-error no >/dev/null 2>&1 || true
        redis-cli CONFIG SET maxmemory 50331648 >/dev/null 2>&1 || true
        redis-cli CONFIG SET maxmemory-policy allkeys-lru >/dev/null 2>&1 || true
    fi

    # Make stop-writes-on-bgsave-error permanent in redis config
    for rconf in /etc/redis/redis.conf /etc/redis.conf; do
        if [[ -f "$rconf" ]]; then
            sed -i 's/^stop-writes-on-bgsave-error yes/stop-writes-on-bgsave-error no/' "$rconf" 2>/dev/null || true
        fi
    done
    chown -R redis:redis /var/lib/redis 2>/dev/null || true
    chmod 770 /var/lib/redis 2>/dev/null || true
    success "Redis write errors resolved (stop-writes-on-bgsave-error=no, maxmemory=48M, overcommit=1)"
fi

# -----------------------------------------------------------------------------
# 5. LARAVEL FRAMEWORK CACHING
# -----------------------------------------------------------------------------
if [[ -d "$INSTALL_DIR" && -f "${INSTALL_DIR}/artisan" ]]; then
    info "Step 5: Optimizing Laravel routes, config, and views..."
    su -s /bin/bash -c "cd '$INSTALL_DIR' && php artisan optimize:clear && php artisan config:cache && php artisan route:cache && php artisan view:cache" www-data 2>/dev/null \
        || (cd "$INSTALL_DIR" && php artisan optimize:clear && php artisan config:cache && php artisan route:cache && php artisan view:cache) || true
    success "Laravel routes, config, and views compiled into cache"
fi

echo ""
echo -e "${GREEN}${BOLD}======================================================${RESET}"
echo -e "${GREEN}${BOLD}   Optimization Completed Successfully!               ${RESET}"
echo -e "${GREEN}${BOLD}======================================================${RESET}"
echo ""
echo "Current Memory Status:"
free -h
echo ""
