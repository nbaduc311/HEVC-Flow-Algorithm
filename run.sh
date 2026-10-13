#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "HEVC Intra / Inter Lab: http://127.0.0.1:5174/"
exec python3 server.py
