#!/usr/bin/env python3
"""Probe PC Bonsai OpenAI /v1 gateway. Exit 0 when healthy, 1 when down."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CFG_PATH = REPO / "agents" / "pc-bonsai-routing.json"


def load_cfg() -> dict:
    return json.loads(CFG_PATH.read_text(encoding="utf-8"))


def probe_host(host: str, port: int, path: str, timeout: float) -> tuple[bool, str]:
    url = f"http://{host}:{port}{path}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            if 200 <= resp.status < 300:
                return True, url
            return False, f"{url} HTTP {resp.status}"
    except urllib.error.URLError as e:
        return False, f"{url} {e.reason}"
    except Exception as e:
        return False, f"{url} {e}"


def main() -> int:
    cfg = load_cfg()
    port = int(cfg.get("inference_port", 8000))
    path = str(cfg.get("health_path", "/v1/models"))
    timeout = float(cfg.get("probe_timeout_sec", 4))
    hosts = [cfg.get("pc_host"), cfg.get("pc_tailscale_ip"), cfg.get("pc_lan_ip")]
    hosts = [h for h in hosts if h]
    detail = "all hosts failed"
    for host in hosts:
        ok, detail = probe_host(str(host), port, path, timeout)
        if ok:
            print(detail)
            return 0
    print("unreachable:", detail)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
