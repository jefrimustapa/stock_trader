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

# Configure API protocol encryption with 1024-bit PKCS#1 RSA private key
RSA_KEY_FILE="${OPEND_RSA_KEY_FILE:-$OPEND_DATA_DIR/rsa_key.pem}"
if [ ! -f "$RSA_KEY_FILE" ]; then
    echo "Notice: Generating new 1024-bit RSA private key for protocol encryption..."
    openssl genrsa -out "$RSA_KEY_FILE" 1024
    chmod 0600 "$RSA_KEY_FILE"
fi

if [ -f "$RSA_KEY_FILE" ]; then
    chmod 0600 "$RSA_KEY_FILE"
    EXTRA_ARGS+=("-rsa_private_key=${RSA_KEY_FILE}")
    echo "API protocol encryption enabled with RSA key."
    if [ -f "/opt/opend/OpenD.xml" ]; then
        sed -i "s|.*<rsa_private_key>.*|<rsa_private_key>${RSA_KEY_FILE}</rsa_private_key>|" /opt/opend/OpenD.xml 2>/dev/null || true
    fi
fi

if [ -f "$IDLE_FLAG" ]; then
    echo "Notice: OpenD starting in DISCONNECTED IDLE state (.idle_mode active)."
    echo "Gateway is waiting for user login; auto-login disabled."
else
    ACCOUNT="${MOOMOO_LOGIN_ACCOUNT:-}"

    if [ -f "$LOGIN_CONFIG" ]; then
        echo "Loading custom login configuration from $LOGIN_CONFIG..."
        CFG_ACC=$(grep -o '"login_account"[^:]*:[^"]*"[^"]*"' "$LOGIN_CONFIG" | cut -d'"' -f4 || true)
        if [ -n "$CFG_ACC" ]; then
            ACCOUNT="$CFG_ACC"
        fi
    fi

    if [ -n "$ACCOUNT" ]; then
        EXTRA_ARGS+=("-login_account=${ACCOUNT}")
        if [ -d "$OPEND_DATA_DIR/F3CNN" ] && [ "$(ls -A "$OPEND_DATA_DIR/F3CNN" 2>/dev/null || true)" ]; then
            echo "Session tokens detected in F3CNN. Attempting login by remember token..."
            EXTRA_ARGS+=("-login_by_remember=1")
        else
            echo "Notice: OpenD waiting for credentials via telnet interactive prompt."
        fi
    fi
fi

# Execute OpenD binary without exposing credentials in process table
exec "$@" "${EXTRA_ARGS[@]}"
