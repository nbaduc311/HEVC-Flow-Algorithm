"""Turn the instrumented HM trace into the small browser data bundle."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "data" / "trace.jsonl"
OUTPUT = ROOT / "web" / "lab-data.js"

frames = {poc: {"poc": poc, "sliceType": "?", "ctus": []} for poc in range(5)}
for line in TRACE.read_text(encoding='utf-8').splitlines():
    event = json.loads(line)
    if event.get("event") != "CTU_PARTITION":
        continue
    poc = event["poc"]
    if poc not in frames:
        continue
    frames[poc]["sliceType"] = event["slice_type"]
    frames[poc]["ctus"].append(
        {"x": event["ctu_x"] * 64, "y": event["ctu_y"] * 64, "nodes": event["nodes"]}
    )

for frame in frames.values():
    frame["ctus"].sort(key=lambda ctu: (ctu["y"], ctu["x"]))
    if len(frame["ctus"]) != 54:
        raise RuntimeError(f"POC {frame['poc']}: expected 54 CTUs, got {len(frame['ctus'])}")

bundle = {
    "width": 576,
    "height": 324,
    "fps": 8,
    "sourceVideo": "pixabay_gop18_960x540.mp4",
    "originalVideo": "pixabay_isometric_plain_design_14035.mp4",
    "sourcePTS": [1.802, 1.902, 2.002, 2.102, 2.236],
    "sourceType": ["I", "B", "B", "P", "P"],
    "sourceOffsets": [0, 3, 6, 9, 13],
    "config": "encoder_lowdelay_P_main10.cfg",
    "frames": [frames[poc] for poc in range(5)],
}
OUTPUT.write_text("window.INTER_LAB_DATA = " + json.dumps(bundle, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
