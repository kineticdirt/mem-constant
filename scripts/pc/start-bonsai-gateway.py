#!/usr/bin/env python3
"""Start Prism Bonsai llama-server on 0.0.0.0:8000; health-check via 127.0.0.1 (Windows-safe)."""
from __future__ import annotations

import os
import shlex
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

OWS = Path(__file__).resolve().parents[2].parent / "ObsidianWriterStack"
if not OWS.is_dir():
    OWS = Path(r"C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\ObsidianWriterStack")

_SCRIPTS = OWS / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from phase0_stack_smoke import load_env_file, resolve_default_env_file  # noqa: E402

LISTEN_HOST = "0.0.0.0"
PROBE_HOST = "127.0.0.1"
PORT = 8000


def main() -> int:
    env_path = resolve_default_env_file()
    load_env_file(env_path)

    gguf_raw = (os.environ.get("GEMMA_GGUF_PATH") or "").strip()
    if not gguf_raw:
        print("ERROR: GEMMA_GGUF_PATH unset", file=sys.stderr)
        return 2
    gguf = Path(gguf_raw)
    if not gguf.is_absolute():
        gguf = (OWS / gguf).resolve()
    if not gguf.is_file():
        print(f"ERROR: GGUF missing: {gguf}", file=sys.stderr)
        return 2

    llama_raw = (os.environ.get("LLAMA_SERVER_BIN") or "").strip()
    llama = Path(llama_raw) if llama_raw else None
    if llama and not llama.is_absolute():
        llama = (OWS / llama).resolve()
    if not llama or not llama.is_file():
        print("ERROR: LLAMA_SERVER_BIN missing", file=sys.stderr)
        return 2

    probe_url = f"http://{PROBE_HOST}:{PORT}/v1/models"
    try:
        r = requests.get(probe_url, timeout=3)
        if r.status_code == 200:
            print(f"Already up: {probe_url}", file=sys.stderr)
            return 0
    except requests.RequestException:
        pass

    extra_s = (os.environ.get("LLAMA_SERVER_EXTRA") or "-c 262144 -ngl 99 -ctk q4_0 -ctv q4_0").strip()
    extra = shlex.split(extra_s)
    cmd = [str(llama), "-m", str(gguf), "--host", LISTEN_HOST, "--port", str(PORT)] + extra

    log_fp = tempfile.NamedTemporaryFile(prefix="bonsai-llama-", suffix=".log", delete=False, mode="w")
    log_path = log_fp.name
    log_fp.close()

    print(f"Starting: {' '.join(cmd)}", file=sys.stderr)
    print(f"Log: {log_path}", file=sys.stderr)
    with open(log_path, "a", encoding="utf-8") as log_f:
        proc = subprocess.Popen(cmd, cwd=str(OWS), stdout=log_f, stderr=subprocess.STDOUT)

    deadline = time.monotonic() + 180.0
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            print(f"ERROR: exited {proc.returncode}. See {log_path}", file=sys.stderr)
            return 1
        try:
            r = requests.get(probe_url, timeout=5)
            if r.status_code == 200:
                print(f"Ready: {probe_url} (listen {LISTEN_HOST}:{PORT})", file=sys.stderr)
                print(f"PID {proc.pid}", file=sys.stderr)
                return 0
        except requests.RequestException:
            pass
        time.sleep(2.0)

    print(f"ERROR: timeout. See {log_path}", file=sys.stderr)
    proc.terminate()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
