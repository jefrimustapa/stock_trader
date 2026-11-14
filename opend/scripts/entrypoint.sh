#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Starting Moomoo OpenD Linux CLI Gateway..."
echo "Network Isolation: stock_internal only"
echo "=========================================="

mkdir -p /root/.com.moomoo.OpenD

# Execute OpenD binary
exec "$@"
