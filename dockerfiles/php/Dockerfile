FROM php:8.2-fpm-alpine

ARG PHP_XDEBUG
ARG PHP_XDEBUG_MODE='debug'
ARG APP_ENV
ENV PHP_IDE_CONFIG="serverName=convoy"

ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/
RUN chmod +x /usr/local/bin/install-php-extensions && \
    install-php-extensions pdo_mysql pcntl redis opcache gmp

RUN if [ $APP_ENV = "local" ]; then \
            echo "opcache.validate_timestamps=1" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache-cli.ini; \
    fi;

RUN if [ $PHP_XDEBUG = "true" ]; then \
        install-php-extensions xdebug; \
        echo "xdebug.client_host=host.docker.internal" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini; \
        echo "xdebug.mode=$PHP_XDEBUG_MODE" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini; \
        echo "xdebug.idekey=convoy" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini; \
        echo "xdebug.start_with_request=yes" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini; \
    fi;

# ── Low-RAM PHP-FPM pool configuration ────────────────────────────────────────
# Dynamic pool: max 10 workers (~20 MB each = 200 MB ceiling).
# Previously ENV PHP_MAX_CHILDREN=100 could spike to 2 GB on a 1 GB VPS.
RUN { \
    echo "[www]"; \
    echo "pm = dynamic"; \
    echo "pm.max_children = 10"; \
    echo "pm.start_servers = 2"; \
    echo "pm.min_spare_servers = 1"; \
    echo "pm.max_spare_servers = 3"; \
    echo "pm.max_requests = 500"; \
} >> /usr/local/etc/php-fpm.d/zz-docker.conf

# ── PHP memory limits ──────────────────────────────────────────────────────────
# Cap per-request memory and tune OPcache to fit within available RAM budget.
RUN { \
    echo "memory_limit = 128M"; \
    echo "opcache.memory_consumption = 64"; \
    echo "opcache.interned_strings_buffer = 8"; \
    echo "opcache.max_accelerated_files = 4000"; \
    echo "opcache.revalidate_freq = 60"; \
} > /usr/local/etc/php/conf.d/zz-vertex-ram.ini

WORKDIR /var/www

CMD ["php-fpm"]