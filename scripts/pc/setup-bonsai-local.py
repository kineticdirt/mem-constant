#!/usr/bin/env python3
"""Download Bonsai Q1_0 + Prism CUDA llama-server; patch ObsidianWriterStack deckard-local.env.

bf16 (~54 GB) does not fit 16 GB VRAM — uses Q1_0 (~3.9 GB) per prism-ml/Bonsai-27B-gguf card.
Never prints secret values.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

OWS = Path(__file__).resolve().parents[2].parent / "ObsidianWriterStack"

MODEL_DIR = OWS / "models-bonsai-27b"
GGUF_NAME = "Bonsai-27B-Q1_0.gguf"
GGUF_REPO = "prism-ml/Bonsai-27B-gguf"
PRISM_TAG = "prism-b9591-62061f9"
PRISM_LLAMA_ZIP = (
    "https://github.com/PrismML-Eng/llama.cpp/releases/download/"
    f"{PRISM_TAG}/llama-prism-b1-62061f9-bin-win-cuda-12.4-x64.zip"
)
PRISM_CUDART_ZIP = (
    "https://github.com/PrismML-Eng/llama.cpp/releases/download/"
    f"{PRISM_TAG}/cudart-llama-bin-win-cuda-12.4-x64.zip"
)
PRISM_BUNDLE = OWS / ".local" / "llama-prism-b9591-cuda-12.4"
DECKARD_ENV = OWS / "deckard-local.env"

ENV_UPSERT = {
    "GEMMA_GGUF_PATH": f"models-bonsai-27b/{GGUF_NAME}",
    "WRITER_BOT_DEFAULT_MODEL": GGUF_NAME,
    "WRITER_BOT_BACKEND": "http://127.0.0.1:8000/v1",
    "WRITER_BOT_URL": "http://127.0.0.1:8080",
    "LLAMA_SERVER_EXTRA": "-c 262144 -ngl 99 -ctk q4_0 -ctv q4_0",
    "GEMMA_FORCE_CHAT_NUM_CTX": "262144",
    "CHAT_UI_NSFW_ROUTE_LOCAL": "0",
    "CHAT_UI_RP_OPENROUTER_ONLY": "1",
    "CHAT_UI_THINKING_ROUTER_ENABLED": "0",
    "CHAT_UI_FG_OPENROUTER_MODEL": "openrouter/deepseek/deepseek-v4-flash",
    "CHAT_UI_TURN_MAX_TOKENS": "4096",
    "CHAT_UI_TURN_MAX_TOKENS_NSFW": "8192",
    "GEMMA_CHAT_COMPLETIONS_JSON_EXTRA": '{"chat_template_kwargs":{"enable_thinking":false}}',
}


def find_llama_server(root: Path) -> Path | None:
    for name in ("llama-server.exe", "llama-server"):
        for p in root.rglob(name):
            if p.is_file():
                return p
    return None


def download_zip(url: str, dest: Path, label: str) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    zpath = dest / "_dl.zip"
    print(f"Downloading {label} …", file=sys.stderr)
    urllib.request.urlretrieve(url, zpath)
    with zipfile.ZipFile(zpath, "r") as z:
        z.extractall(dest)
    zpath.unlink(missing_ok=True)


def download_gguf(dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / GGUF_NAME
    if out.is_file() and out.stat().st_size > 1_000_000_000:
        print(f"GGUF already present: {out}", file=sys.stderr)
        return out
    print(f"Downloading {GGUF_REPO} {GGUF_NAME} (~3.9 GB) …", file=sys.stderr)
    r = subprocess.run(
        [
            "huggingface-cli",
            "download",
            GGUF_REPO,
            GGUF_NAME,
            "--local-dir",
            str(dest),
        ],
        cwd=str(OWS),
    )
    if r.returncode != 0:
        raise SystemExit("huggingface-cli download failed")
    if not out.is_file():
        hits = list(dest.rglob(GGUF_NAME))
        if not hits:
            raise SystemExit(f"GGUF missing after download: {out}")
        out = hits[0]
    return out


def patch_deckard(llama_rel: str) -> None:
    if not DECKARD_ENV.is_file():
        raise SystemExit(f"Missing {DECKARD_ENV} — copy from deckard-local.env.example first")
    text = DECKARD_ENV.read_text(encoding="utf-8")
    upsert = dict(ENV_UPSERT)
    upsert["LLAMA_SERVER_BIN"] = llama_rel.replace("\\", "/")
    # Bonsai is text-only — drop VL mmproj if present
    lines = text.splitlines()
    out: list[str] = []
    seen: set[str] = set()
    key_re = re.compile(r"^([A-Z_][A-Z0-9_]*)=")
    for line in lines:
        m = key_re.match(line)
        if m and m.group(1) in upsert:
            continue
        if m and m.group(1) == "GEMMA_MMPROJ_PATH":
            continue
        out.append(line)
    if out and out[-1].strip():
        out.append("")
    out.append("# --- Bonsai 27B local lane (setup-bonsai-local.py) ---")
    for k, v in upsert.items():
        out.append(f"{k}={v}")
        seen.add(k)
    DECKARD_ENV.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Patched {DECKARD_ENV} ({len(upsert)} keys, secrets untouched)", file=sys.stderr)


def main() -> int:
    p = argparse.ArgumentParser(description="Setup PC Bonsai Q1_0 + Prism llama-server")
    p.add_argument("--skip-download", action="store_true")
    p.add_argument("--skip-env", action="store_true")
    args = p.parse_args()

    if not OWS.is_dir():
        print(f"ERROR: ObsidianWriterStack not found at {OWS}", file=sys.stderr)
        return 2

    llama = find_llama_server(PRISM_BUNDLE)
    if llama is None and not args.skip_download:
        download_zip(PRISM_CUDART_ZIP, PRISM_BUNDLE, "Prism CUDA cudart")
        download_zip(PRISM_LLAMA_ZIP, PRISM_BUNDLE, "Prism CUDA llama-server")
        llama = find_llama_server(PRISM_BUNDLE)
    if llama is None:
        print("ERROR: Prism llama-server.exe not found", file=sys.stderr)
        return 2
    print(f"llama-server: {llama}", file=sys.stderr)

    if not args.skip_download:
        gguf = download_gguf(MODEL_DIR)
        print(f"GGUF: {gguf} ({gguf.stat().st_size // (1024 * 1024)} MiB)", file=sys.stderr)

    if not args.skip_env:
        rel = str(llama.relative_to(OWS)).replace("\\", "/")
        patch_deckard(rel)

    print("OK", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
