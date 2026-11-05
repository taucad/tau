"""Validate same-camera unlit raster parity, keeping headless presentation separate."""

import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("directory", nargs="?", default="out/research/native-renderer")
args = parser.parse_args()
root = Path(args.directory)
reference = np.array(Image.open(root / "native-batched.png"))[:, :, :3].astype(float)
mask = reference.max(2) - reference.min(2) > 20
reports = []
for backend in ["webgl", "webgpu"]:
    source = root / (backend + ".rgba")
    if not source.exists():
        continue
    pixels = np.frombuffer(source.read_bytes(), np.uint8).reshape(480, 640, 4)
    if backend == "webgl":
        pixels = np.flipud(pixels)
    Image.fromarray(pixels).save(root / (backend + "-readback.png"))
    rgb = pixels[:, :, :3].astype(float)
    candidate = rgb.max(2) - rgb.min(2) > 20
    iou = float((candidate & mask).sum() / (candidate | mask).sum())
    error = float(np.abs(rgb - reference).mean())
    presented = np.array(Image.open(root / (backend + ".png")))[:, :, :3].astype(float)
    presented_mask = presented.max(2) - presented.min(2) > 20
    presented_iou = float((presented_mask & mask).sum() / (presented_mask | mask).sum())
    reports.append(
        {
            "backend": backend,
            "maskIou": iou,
            "meanAbsoluteRgbError": error,
            "readbackPass": iou > 0.98 and error < 2,
            "presentedMaskIou": presented_iou,
            "presentationQualified": presented_iou > 0.98,
        }
    )
(root / "parity.json").write_text(json.dumps(reports, indent=2) + "\n")
print(json.dumps(reports, indent=2))
if not reports or not all(r["readbackPass"] for r in reports):
    raise SystemExit(1)
