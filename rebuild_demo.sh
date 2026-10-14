#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Thiếu FFmpeg. Ubuntu/WSL: sudo apt install ffmpeg" >&2
  exit 1
fi
if [[ ! -x build/TAppEncoder && -z "${HEVC_ENCODER_BIN:-}" ]]; then
  ./build.sh
fi

# The bundled five-frame input makes the lab independent of the original video.
python3 experiments.py --presets
cp data/runs/baseline-ctu4-1/trace.jsonl data/trace.jsonl
cp data/runs/baseline-ctu4-1/stream.265 data/sample.265
for name in orig recon; do
  if [[ "$name" == orig ]]; then
    raw=data/sample_576x324_10bit.yuv
  else
    raw=data/runs/baseline-ctu4-1/recon.yuv
  fi
  ffmpeg -hide_banner -loglevel error -y -f rawvideo -pixel_format yuv420p10le \
    -video_size 576x324 -framerate 8 -i "$raw" -frames:v 5 \
    -c:v libwebp -quality 92 "web/${name}_%02d.webp"
done
python3 build_data.py
python3 test_experiments.py
echo "Đã tạo lại 8 preset và dữ liệu demo. Chạy ./run.sh để mở Lab."
