#!/usr/bin/env python3
"""Real-ESRGAN via PyTorch/CUDA — seamless tiles (tile_pad), no ncnn checkerboard.

Usage:
  python ai-upscale-pytorch.py --input map.png --output out.png --scale 2

Requires: pip install basicsr realesrgan  (npm run map:install-esrgan-py)
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent / "tools" / "realesrgan-pytorch"
MODELS = {
    "realesrgan-x4plus": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        "file": "RealESRGAN_x4plus.pth",
        "arch": "rrdb",
    },
    "realesr-general-x4v3": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth",
        "file": "realesr-general-x4v3.pth",
        "arch": "srvgg",
    },
}


def ensure_model(name: str) -> tuple[Path, str]:
    spec = MODELS.get(name, MODELS["realesr-general-x4v3"])
    TOOLS.mkdir(parents=True, exist_ok=True)
    dest = TOOLS / spec["file"]
    if dest.is_file() and dest.stat().st_size > 5_000_000:
        return dest, spec["arch"]
    try:
        import urllib.request

        print(f"Downloading {spec['file']} -> {dest} ...", flush=True)
        urllib.request.urlretrieve(spec["url"], dest)
    except Exception as e:
        print(f"ERROR: model download failed: {e}", file=sys.stderr)
        sys.exit(1)
    return dest, spec["arch"]


def main() -> int:
    p = argparse.ArgumentParser(description="PyTorch Real-ESRGAN terrain upscale")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--scale", type=int, default=2, choices=[2, 3, 4])
    p.add_argument("--model", default=os.environ.get("REALESRGAN_MODEL", "realesr-general-x4v3"))
    p.add_argument("--tile", type=int, default=int(os.environ.get("REALESRGAN_TILE", "1024")))
    p.add_argument("--tile-pad", type=int, default=int(os.environ.get("REALESRGAN_TILE_PAD", "64")))
    p.add_argument("--gpu", type=int, default=0)
    args = p.parse_args()

    inp = Path(args.input).resolve()
    out = Path(args.output).resolve()
    if not inp.is_file():
        print(f"Input not found: {inp}", file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)

    try:
        # ponytail: basicsr 1.4.2 breaks on torchvision 0.26+ (functional_tensor removed)
        import sys
        import torchvision.transforms.functional as functional
        sys.modules.setdefault("torchvision.transforms.functional_tensor", functional)

        import cv2
        import torch
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer
        from realesrgan.archs.srvgg_arch import SRVGGNetCompact
    except ImportError:
        print(
            "Missing deps. Run: npm run map:install-esrgan-py",
            file=sys.stderr,
        )
        return 1

    if not torch.cuda.is_available():
        print("CUDA not available — PyTorch Real-ESRGAN needs NVIDIA GPU.", file=sys.stderr)
        return 1

    model_path, arch = ensure_model(args.model)
    if arch == "srvgg":
        model = SRVGGNetCompact(
            num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type="prelu"
        )
    else:
        model = RRDBNet(
            num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4
        )
    upsampler = RealESRGANer(
        scale=4,
        model_path=str(model_path),
        model=model,
        tile=args.tile,
        tile_pad=args.tile_pad,
        pre_pad=10,
        half=True,
        gpu_id=args.gpu,
    )

    img = cv2.imread(str(inp), cv2.IMREAD_COLOR)
    if img is None:
        print(f"cv2 could not read: {inp}", file=sys.stderr)
        return 1

    print(
        f"PyTorch Real-ESRGAN ({args.model}): {inp.name} {img.shape[1]}x{img.shape[0]} -> outscale {args.scale}x "
        f"(tile={args.tile} pad={args.tile_pad} gpu={args.gpu})",
        flush=True,
    )
    output, _ = upsampler.enhance(img, outscale=args.scale)
    ok = cv2.imwrite(str(out), output)
    if not ok:
        print(f"cv2 write failed: {out}", file=sys.stderr)
        return 1
    print(f"OK -> {out} ({output.shape[1]}x{output.shape[0]})", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
