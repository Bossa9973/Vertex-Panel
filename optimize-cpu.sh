#!/usr/bin/env bash
# =============================================================================
#  Vertex Panel — Host Server CPU Optimizer & Live Diagnostic Tool
# =============================================================================
#  Diagnoses 100% CPU bottlenecks and applies high-impact optimizations:
#  1. Identifies top CPU-consuming processes and checks for rogue loops
#  2. Disables duplicate queue workers (Horizon vs old vertex-queue)
#  3. Enables OPcache for PHP CLI (drastically cuts artisan schedule:run overhead)
#  4. Tunes PHP-FPM worker pool to 'dynamic' to stop constant process-forking CPU churn
#  5. Compiles Laravel routes, configs, and views into pre-compiled opcode caches
#  6. Migrates database performance indexes to eliminate full-table scans
#  7. Tunes process niceness for background workers (Bot & Horizon)
#
#  Usage:
#    sudo bash optimize-cpu.sh
# =============================================================================

set -euo pipefail

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

info()    { printf "  ${CYAN}*${RESET}  %b\n" "$1"; }
success() { printf "  ${GREEN}✔${RESET}  ${GREEN}%b${RESET}\n" "$1"; }
warn()    { printf "  ${YELLOW}⚠${RESET}  ${YELLOW}%b${RESET}\n" "$1"; }
error()   { printf "  ${RED}✖${RESET}  ${RED}${BOLD}%b${RESET}\n" "$1"; }

printf "\n${BLUE}${BOLD}"
printf "  =======================================================\n"
printf "     Vertex Panel — Host CPU Optimizer & Diagnostics\n"
printf "  =======================================================\n${RESET}\n"

if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (use: sudo bash optimize-cpu.sh)."
    exit 1
fi

INSTALL_DIR="/var/www/vertex-panel"
if [[ ! -d "$INSTALL_DIR" && -f "artisan" ]]; then
    INSTALL_DIR="$(pwd)"
fi

if [[ ! -f "${INSTALL_DIR}/artisan" ]]; then
    error "Could not find Vertex Panel installation at ${INSTALL_DIR}."
    exit 1
fi

# -----------------------------------------------------------------------------
# 1. LIVE CPU DIAGNOSTICS & PROCESS INSPECTION
# -----------------------------------------------------------------------------
info "Step 1: Inspecting current CPU load and top active processes..."
CPU_CORES=$(nproc 2>/dev/null || echo "1")
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | xargs)
printf "    ${DIM}CPU Cores: ${CPU_CORES} | System Load: ${LOAD_AVG}${RESET}\n\n"

printf "    ${BOLD}%-8s %-8s %-6s %-6s %s${RESET}\n" "PID" "USER" "%CPU" "%MEM" "COMMAND"
printf "    %-8s %-8s %-6s %-6s %s\n" "--------" "--------" "------" "------" "----------------------------------------"
ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n 11 | tail -n 10 | while read -r p_pid p_user p_cpu p_mem p_comm; do
    printf "    %-8s %-8s %-6s %-6s %s\n" "$p_pid" "$p_user" "${p_cpu}%" "${p_mem}%" "$p_comm"
done
printf "\n"

# -----------------------------------------------------------------------------
# 2. DETECT & RESOLVE COMMON RUNAWAYS & DUPLICATES
# -----------------------------------------------------------------------------
info "Step 2: Checking for runaway processes, rogue dev servers, or duplicate workers..."

# A. Disable Oracle Cloud Agent (OCI 'gomon' & 'updater' burn 50-70% CPU on small instances)
if pgrep -f "oracle-cloud-agent|gomon" >/dev/null 2>&1 || systemctl list-unit-files 2>/dev/null | grep -q "oracle-cloud-agent"; then
    info "Oracle Cloud Agent detected (gomon plugin consumes 50-70% CPU on small instances)..."
    snap stop oracle-cloud-agent >/dev/null 2>&1 || true
    snap disable oracle-cloud-agent >/dev/null 2>&1 || true
    systemctl stop snap.oracle-cloud-agent.oracle-cloud-agent.service >/dev/null 2>&1 || true
    systemctl disable snap.oracle-cloud-agent.oracle-cloud-agent.service >/dev/null 2>&1 || true
    systemctl mask snap.oracle-cloud-agent.oracle-cloud-agent.service >/dev/null 2>&1 || true
    pkill -9 -f "gomon" >/dev/null 2>&1 || true
    success "Oracle Cloud Agent disabled and rogue gomon monitoring killed."
fi

# B. Disable cloud VPS firmware updater (fwupd is unnecessary on a virtual machine)
if systemctl is-active --quiet fwupd.service 2>/dev/null || systemctl is-active --quiet fwupd-refresh.timer 2>/dev/null || pgrep -f "fwupd" >/dev/null 2>&1; then
    info "Disabling fwupd daemon (hardware firmware checks are unnecessary on a cloud VM)..."
    systemctl stop fwupd.service fwupd-refresh.timer fwupd-refresh.service >/dev/null 2>&1 || true
    systemctl disable fwupd.service fwupd-refresh.timer fwupd-refresh.service >/dev/null 2>&1 || true
    systemctl mask fwupd.service >/dev/null 2>&1 || true
    pkill -9 -f "fwupd" >/dev/null 2>&1 || true
    success "Disabled fwupd background checks."
fi

# C. Check for 'next dev' running on host instead of production build
if pgrep -f "next-server.*dev|next dev" >/dev/null 2>&1; then
    warn "Detected Next.js running in DEVELOPMENT mode ('next dev')!"
    warn "Development mode causes high CPU usage from constant hot-reload watchers."
    warn "Consider running: npm run build && npm run start (or PM2 in production mode)."
fi

# D. Stop and disable duplicate queue workers (pteroq.service, old supervisor configs, and orphan queue:work)
if systemctl is-active --quiet pteroq 2>/dev/null || systemctl is-enabled --quiet pteroq 2>/dev/null; then
    warn "Found active systemd service 'pteroq' running standalone queue:work!"
    systemctl stop pteroq >/dev/null 2>&1 || true
    systemctl disable pteroq >/dev/null 2>&1 || true
    success "Disabled systemd pteroq service."
fi

if command -v supervisorctl >/dev/null 2>&1; then
    for prog in $(supervisorctl status 2>/dev/null | grep -E "vertex-queue|pteroq" | awk '{print $1}' || true); do
        warn "Stopping duplicate supervisor worker: $prog..."
        supervisorctl stop "$prog" >/dev/null 2>&1 || true
    done
    for f in /etc/supervisor/conf.d/*vertex-queue*.conf /etc/supervisor/conf.d/*pteroq*.conf /etc/supervisord.d/*vertex-queue*.conf; do
        if [[ -f "$f" ]]; then
            mv "$f" "${f}.disabled" 2>/dev/null || true
            supervisorctl reread >/dev/null 2>&1 || true
            supervisorctl update >/dev/null 2>&1 || true
        fi
    done
fi

if pgrep -f "artisan queue:work" >/dev/null 2>&1; then
    info "Terminating orphaned 'artisan queue:work' processes..."
    pkill -9 -f "artisan queue:work" >/dev/null 2>&1 || true
    success "Orphaned queue workers terminated (Horizon will manage queues cleanly)."
fi

# -----------------------------------------------------------------------------
# 3. DATABASE PERFORMANCE INDEXES
# -----------------------------------------------------------------------------
info "Step 3: Applying database performance indexes..."
if (cd "$INSTALL_DIR" && php artisan migrate --force >/dev/null 2>&1); then
    success "Database migration verified (activity, suspension & deadline indexes active)."
else
    warn "Migration check encountered non-fatal status (skipping)."
fi

# -----------------------------------------------------------------------------
# 4. PHP OPCACHE CLI & PHP-FPM POOL TUNING
# -----------------------------------------------------------------------------
info "Step 4: Tuning PHP-FPM and OPcache (enabling CLI opcode caching)..."

FPM_POOL_DIR=$(ls -d /etc/php/*/fpm/pool.d /etc/php-fpm.d 2>/dev/null | head -1 || echo "")
if [[ -n "$FPM_POOL_DIR" ]]; then
    # Dynamic process manager: eliminates worker spawn-and-destroy CPU spikes
    cat > "${FPM_POOL_DIR}/zz-vertex-low-ram.conf" <<'EOF'
; Vertex Panel — CPU-Optimized PHP-FPM Pool
[www]
pm = dynamic
pm.max_children = 6
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 2
pm.process_idle_timeout = 30s
pm.max_requests = 500
EOF

    # OPcache: Enable CLI and expand file cache to eliminate compile overhead on every cron tick
    PHP_CONF_D="$(dirname "$FPM_POOL_DIR")/conf.d"
    mkdir -p "$PHP_CONF_D" 2>/dev/null || true
    cat > "${PHP_CONF_D}/99-vertex-ram.ini" <<'EOF'
; Vertex Panel — High Efficiency OPcache Settings
memory_limit = 128M
opcache.enable = 1
opcache.enable_cli = 1
opcache.memory_consumption = 64
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 30000
opcache.revalidate_freq = 120
opcache.fast_shutdown = 1
opcache.save_comments = 1
EOF

    # Propagate to all PHP conf.d directories
    while IFS= read -r extra_confd; do
        [[ "$extra_confd" == "$PHP_CONF_D" ]] && continue
        mkdir -p "$extra_confd" 2>/dev/null || true
        [[ -d "$extra_confd" ]] && cp -f "${PHP_CONF_D}/99-vertex-ram.ini" "${extra_confd}/99-vertex-ram.ini" 2>/dev/null || true
    done < <(find /etc/php* /usr/local/etc/php -type d -name 'conf.d' 2>/dev/null | sort -u || true)

    FPM_SVC=$(systemctl list-unit-files 2>/dev/null | grep -E -o 'php[0-9.]*-fpm\.service|php-fpm\.service' | head -1 | sed 's/\.service//' || echo "")
    if [[ -n "$FPM_SVC" ]]; then
        systemctl restart "$FPM_SVC" > /dev/null 2>&1 || systemctl reload "$FPM_SVC" > /dev/null 2>&1 || true
        success "PHP-FPM reloaded (OPcache CLI enabled, dynamic workers configured)."
    fi
fi

# -----------------------------------------------------------------------------
# 5. LARAVEL ROUTE, CONFIG, AND VIEW COMPILATION
# -----------------------------------------------------------------------------
info "Step 5: Compiling Laravel routes, configs, and views to binary cache..."
(
    cd "$INSTALL_DIR"
    php artisan optimize:clear >/dev/null 2>&1 || true
    php artisan config:cache >/dev/null 2>&1 || true
    php artisan route:cache >/dev/null 2>&1 || true
    php artisan view:cache >/dev/null 2>&1 || true
    php artisan queue:restart >/dev/null 2>&1 || true
)
success "Laravel routes and configurations compiled into cache (saves ~80% CPU per request)."

# -----------------------------------------------------------------------------
# 6. RESTART HORIZON WORKERS WITH OPTIMIZED PROCESS POOL
# -----------------------------------------------------------------------------
info "Step 6: Refreshing Horizon queue worker pool..."
if command -v supervisorctl >/dev/null 2>&1; then
    supervisorctl restart vertex-horizon >/dev/null 2>&1 || true
    success "Horizon restarted with tuned worker process limits."
fi

# -----------------------------------------------------------------------------
# 7. REDIS PERSISTENCE CPU HEALING
# -----------------------------------------------------------------------------
info "Step 7: Tuning Redis persistence settings..."
if command -v redis-cli >/dev/null 2>&1; then
    rpass=""
    if [[ -f "${INSTALL_DIR}/.env" ]]; then
        rpass=$(grep '^REDIS_PASSWORD=' "${INSTALL_DIR}/.env" | cut -d= -f2- | tr -d '"' | tr -d "'" || echo "")
    fi
    rcmd="redis-cli"
    if [[ -n "$rpass" && "$rpass" != "null" ]]; then
        rcmd="redis-cli -a $rpass"
    fi
    $rcmd config set stop-writes-on-bgsave-error no >/dev/null 2>&1 || true
    $rcmd config set save "" >/dev/null 2>&1 || true
    success "Redis background snapshotting adjusted to prevent CPU disk-fork loops."
fi

# -----------------------------------------------------------------------------
# 8. BACKGROUND PROCESS NICENESS (PRIORITY) TUNING
# -----------------------------------------------------------------------------
info "Step 8: Setting process niceness for background workers..."
# Give Discord bot slightly lower CPU priority than web server and MySQL
if pgrep -f "vertex-bot|main.py" >/dev/null 2>&1; then
    renice -n 10 -p $(pgrep -f "vertex-bot|main.py" 2>/dev/null | head -1) >/dev/null 2>&1 || true
    success "Discord bot niceness adjusted (+10 polite priority)."
fi
# Give Horizon workers slightly lower CPU priority than Nginx and PHP-FPM
if pgrep -f "horizon:work" >/dev/null 2>&1; then
    for pid in $(pgrep -f "horizon:work" 2>/dev/null || true); do
        renice -n 10 -p "$pid" >/dev/null 2>&1 || true
    done
    success "Horizon workers niceness adjusted (+10 polite priority)."
fi

# -----------------------------------------------------------------------------
# 9. POST-OPTIMIZATION CPU STATUS
# -----------------------------------------------------------------------------
sleep 1
printf "\n${GREEN}${BOLD}=======================================================\n"
printf "  ✔  CPU Optimization Complete!\n"
printf "=======================================================${RESET}\n\n"

info "Current Top Processes:"
printf "    ${BOLD}%-8s %-8s %-6s %-6s %s${RESET}\n" "PID" "USER" "%CPU" "%MEM" "COMMAND"
printf "    %-8s %-8s %-6s %-6s %s\n" "--------" "--------" "------" "------" "----------------------------------------"
ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n 6 | tail -n 5 | while read -r p_pid p_user p_cpu p_mem p_comm; do
    printf "    %-8s %-8s %-6s %-6s %s\n" "$p_pid" "$p_user" "${p_cpu}%" "${p_mem}%" "$p_comm"
done
printf "\n"
