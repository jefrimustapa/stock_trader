#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Starting Moomoo OpenD Linux CLI Gateway..."
echo "Network Isolation: stock_internal only"
echo "=========================================="

mkdir -p /root/.com.moomoo.OpenD

EXTRA_ARGS=()
if [ -n "${MOOMOO_LOGIN_ACCOUNT:-}" ]; then
    EXTRA_ARGS+=("-login_account=${MOOMOO_LOGIN_ACCOUNT}")
    if [ -n "${MOOMOO_LOGIN_PWD_MD5:-}" ]; then
        EXTRA_ARGS+=("-login_pwd_md5=${MOOMOO_LOGIN_PWD_MD5}")
    else
        EXTRA_ARGS+=("-login_by_remember=1")
    fi
fi

# Execute OpenD binary
exec "$@" "${EXTRA_ARGS[@]}"
