#!/usr/bin/env python3
"""Start Satyr-4B (Q8_0) llama-server on 0.0.0.0:8001 (Bonsai :8000 untouched).

PC-only summarizer / wiki-compress lane. Uses the stock CUDA llama.cpp build
(not Prism — Satyr is standard Q8_0, not Q1_0).
"""
from __future__ import annotations

import os
import shlex
import subprocess
import sys
import tempfile
import time
from pathlib import Path

OWS = Path(r"C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\ObsidianWriterStack")
DEFAULT_GGUF = OWS / "models-satyr-4b" / "Satyr-V0.1-4B-Q8_0.gguf"
DEFAULT_LLAMA = OWS / ".local" / "llama-cpp-b8794-win-cuda-12.4" / "llama-server.exe"

LISTEN_HOST = "0.0.0.0"
PROBE_HOST = "127.0.0.1"
PORT = int(os.environ.get("SATYR_PORT", "8001"))

# High context for scene+wiki; leave room for long summaries (n_predict set per-request).
# -ngl 99 = full GPU; thinking disabled via chat template / request later.
DEFAULT_EXTRA = "-c 32768 -ngl 99 --jinja"


def main() -> int:
    gguf = Path(os.environ.get("SATYR_GGUF_PATH", str(DEFAULT_GGUF))).expanduser()
    if not gguf.is_absolute():
        gguf = (OWS / gguf).resolve()
    if not gguf.is_file():
        print(f"ERROR: GGUF missing: {gguf}", file=sys.stderr)
        return 2

    llama = Path(os.environ.get("SATYR_LLAMA_SERVER_BIN", str(DEFAULT_LLAMA))).expanduser()
    if not llama.is_absolute():
        llama = (OWS / llama).resolve()
    if not llama.is_file():
        print(f"ERROR: llama-server missing: {llama}", file=sys.stderr)
        return 2

    probe_url = f"http://{PROBE_HOST}:{PORT}/v1/models"
    try:
        import urllib.request

        with urllib.request.urlopen(probe_url, timeout=3) as r:
            if r.status == 200:
                print(f"Already up: {probe_url}", file=sys.stderr)
                return 0
    except Exception:
        pass

    extra_s = (os.environ.get("SATYR_LLAMA_EXTRA") or DEFAULT_EXTRA).strip()
    extra = shlex.split(extra_s)
    cmd = [
        str(llama),
        "-m",
        str(gguf),
        "--host",
        LISTEN_HOST,
        "--port",
        str(PORT),
        "--alias",
        "Satyr-V0.1-4B-Q8_0",
    ] + extra

    log_fp = tempfile.NamedTemporaryFile(prefix="satyr-llama-", suffix=".log", delete=False, mode="w")
    log_path = log_fp.name
    log_fp.close()

    print(f"Starting: {' '.join(cmd)}", file=sys.stderr)
    print(f"Log: {log_path}", file=sys.stderr)
    with open(log_path, "a", encoding="utf-8") as log_f:
        proc = subprocess.Popen(cmd, cwd=str(llama.parent), stdout=log_f, stderr=subprocess.STDOUT)

    deadline = time.monotonic() + 120.0
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            print(f"ERROR: exited {proc.returncode}. See {log_path}", file=sys.stderr)
            return 1
        try:
            import urllib.request

            with urllib.request.urlopen(probe_url, timeout=5) as r:
                if r.status == 200:
                    print(f"Ready: {probe_url} (listen {LISTEN_HOST}:{PORT})", file=sys.stderr)
                    print(f"PID {proc.pid}", file=sys.stderr)
                    return 0
        except Exception:
            pass
        time.sleep(1.5)

    print(f"ERROR: timeout. See {log_path}", file=sys.stderr)
    proc.terminate()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
