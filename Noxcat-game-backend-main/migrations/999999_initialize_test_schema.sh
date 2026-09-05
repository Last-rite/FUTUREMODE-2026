#!/bin/sh
set -eu

for migration in /docker-entrypoint-initdb.d/*.up.sql; do
    case "$(basename "$migration")" in
        000001_*) continue ;;
    esac

    psql \
        --set ON_ERROR_STOP=1 \
        --username "$POSTGRES_USER" \
        --dbname noxcat_test \
        --file "$migration"
done
