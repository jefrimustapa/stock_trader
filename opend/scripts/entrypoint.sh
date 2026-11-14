#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Starting Moomoo OpenD Linux CLI Gateway..."
echo "Network Isolation: stock_internal only"
echo "=========================================="

OPEND_DATA_DIR="${OPEND_DATA_DIR:-/root/.com.moomoo.OpenD}"
mkdir -p "$OPEND_DATA_DIR"

IDLE_FLAG="$OPEND_DATA_DIR/.idle_mode"
LOGIN_CONFIG="$OPEND_DATA_DIR/opend_login.json"

EXTRA_ARGS=()

if [ -f "$IDLE_FLAG" ]; then
    echo "Notice: OpenD starting in DISCONNECTED IDLE state (.idle_mode active)."
    echo "Gateway is waiting for user login; auto-login disabled."
else
    ACCOUNT="${MOOMOO_LOGIN_ACCOUNT:-}"
    PWD_MD5="${MOOMOO_LOGIN_PWD_MD5:-}"

    if [ -f "$LOGIN_CONFIG" ]; then
        echo "Loading custom login configuration from $LOGIN_CONFIG..."
        CFG_ACC=$(grep -o '"login_account"[^:]*:[^"]*"[^"]*"' "$LOGIN_CONFIG" | cut -d'"' -f4 || true)
        CFG_PWD=$(grep -o '"login_pwd_md5"[^:]*:[^"]*"[^"]*"' "$LOGIN_CONFIG" | cut -d'"' -f4 || true)
        if [ -n "$CFG_ACC" ]; then
            ACCOUNT="$CFG_ACC"
        fi
        if [ -n "$CFG_PWD" ]; then
            PWD_MD5="$CFG_PWD"
        fi
    fi

    if [ -n "$ACCOUNT" ]; then
        EXTRA_ARGS+=("-login_account=${ACCOUNT}")
        if [ -n "$PWD_MD5" ]; then
            EXTRA_ARGS+=("-login_pwd_md5=${PWD_MD5}")
        elif [ -d "$OPEND_DATA_DIR/F3CNN" ] && [ "$(ls -A "$OPEND_DATA_DIR/F3CNN" 2>/dev/null || true)" ]; then
            echo "Session tokens detected in F3CNN. Attempting login by remember token..."
            EXTRA_ARGS+=("-login_by_remember=1")
        else
            echo "Notice: No password MD5 and no stored session tokens found for account $ACCOUNT. OpenD waiting for credentials."
        fi
    fi
fi

# Execute OpenD binary
exec "$@" "${EXTRA_ARGS[@]}"
