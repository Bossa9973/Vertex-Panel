FROM php:8.2-fpm-alpine

ARG APP_ENV

COPY --from=mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions pdo_mysql pcntl redis opcache

# ── OPcache for CLI (Horizon workers & scheduler) ─────────────────────────────
# enable_cli=1 ensures Horizon workers get the cache benefit.
# Memory caps prevent OPcache from ballooning on long-running processes.
RUN { \
    echo "opcache.enable_cli=1"; \
    echo "opcache.memory_consumption=64"; \
    echo "opcache.interned_strings_buffer=8"; \
    echo "opcache.max_accelerated_files=4000"; \
    echo "opcache.revalidate_freq=60"; \
} >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini

RUN if [ $APP_ENV = "local" ]; then \
                echo "opcache.validate_timestamps=1" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache-cli.ini; \
        fi;

RUN apk add --no-cache bash logrotate supervisor

COPY supervisord.conf /etc/supervisord.conf
COPY laravel-logrotate /etc/logrotate.d/laravel

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]