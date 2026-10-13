#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v cmake >/dev/null 2>&1; then
  echo "Thiếu CMake. Ubuntu/WSL: sudo apt install build-essential cmake" >&2
  exit 1
fi

jobs="${JOBS:-4}"
cmake -S hm -B build/hm -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.10 -DENABLE_SEARCH_OPENSSL=OFF
cmake --build build/hm --target TAppEncoder --config Release --parallel "$jobs"
encoder="$(cat build/hm/encoder-path-Release.txt)"
cp "$encoder" build/TAppEncoder
chmod +x build/TAppEncoder
echo "Đã build encoder: build/TAppEncoder. Chạy ./run.sh để mở Lab."
