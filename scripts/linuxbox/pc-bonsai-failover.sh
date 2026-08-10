#!/usr/bin/env bash
# Probe desktop Bonsai /v1. Bonsai is OPTIONAL — think always keeps OpenRouter + ZenMux
# in the fallback chain (never empty). When Bonsai healthy and prefer_bonsai_when_healthy:
# primary=custom Bonsai, cloud models as fallbacks. Else primary=OpenRouter Hermes + same chain.
# Run ON linuxbox only — never downloads or loads GGUF on potato.
# Usage: bash scripts/linuxbox/pc-bonsai-failover.sh [--dry-run]
set -euo pipefail

REPO="${HOME}/agent-dump"
CFG="${REPO}/agents/pc-bonsai-routing.json"
STATE="${REPO}/agents/state/pc-bonsai-routing.json"
HERMES_ROOT="${HOME}/.hermes"
DRY=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY=1
fi

python3 - "${CFG}" "${STATE}" "${HERMES_ROOT}" "${DRY}" <<'PY'
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

cfg_path, state_path, hermes_root, dry = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4])
cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
port = int(cfg.get("inference_port", 8000))
path = str(cfg.get("health_path", "/v1/models"))
timeout = float(cfg.get("probe_timeout_sec", 4))
model_id = str(cfg.get("model_id", "Bonsai-27B-Q1_0.gguf"))
hosts = [cfg.get("pc_host"), cfg.get("pc_tailscale_ip"), cfg.get("pc_lan_ip")]
hosts = [h for h in hosts if h]
prefer_local = bool(cfg.get("prefer_bonsai_when_healthy", True))

healthy = False
hit_url = ""
for host in hosts:
    url = f"http://{host}:{port}{path}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            if 200 <= resp.status < 300:
                healthy = True
                hit_url = f"http://{host}:{port}/v1"
                break
    except (urllib.error.URLError, OSError):
        continue

state = {}
if state_path.is_file():
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        state = {}

now = datetime.now(timezone.utc).isoformat()
prev = state.get("mode", "openrouter")
use_local = bool(healthy and prefer_local)
mode = "local" if use_local else "openrouter"
state.update({
    "updated_at": now,
    "mode": mode,
    "healthy": healthy,
    "hit_url": hit_url,
    "prev_mode": prev,
    "prefer_bonsai_when_healthy": prefer_local,
})

cloud = cfg.get("cloud_chain") or {}
# legacy: openrouter_restore with string fallbacks
legacy = cfg.get("openrouter_restore") or {}
profiles = cfg.get("profiles_when_local", ["think"])
zenmux_block = cfg.get("zenmux_provider") or {
    "name": "ZenMux",
    "base_url": "https://zenmux.ai/api/v1",
    "key_env": "ZENMUX_API_KEY",
    "api_mode": "chat_completions",
    "discover_models": True,
}


def normalize_fallbacks(raw) -> list:
    """Accept list of dicts or bare OpenRouter model id strings."""
    out = []
    for fb in raw or []:
        if isinstance(fb, dict) and fb.get("provider") and fb.get("model"):
            entry = {
                "provider": str(fb["provider"]),
                "model": str(fb["model"]),
            }
            if fb.get("base_url"):
                entry["base_url"] = str(fb["base_url"])
            out.append(entry)
        elif isinstance(fb, str) and fb.strip():
            out.append({
                "provider": "openrouter",
                "model": fb.strip(),
                "base_url": "https://openrouter.ai/api/v1",
            })
    return out


def cloud_spec(profile: str) -> dict:
    if profile in cloud and isinstance(cloud[profile], dict):
        spec = dict(cloud[profile])
        spec["fallbacks"] = normalize_fallbacks(spec.get("fallbacks"))
        return spec
    leg = legacy.get(profile) if isinstance(legacy.get(profile), dict) else {}
    return {
        "provider": leg.get("provider", "openrouter"),
        "base_url": leg.get("base_url", "https://openrouter.ai/api/v1"),
        "default": leg.get("default", "nousresearch/hermes-4-70b"),
        "fallbacks": normalize_fallbacks(leg.get("fallbacks")),
    }


def patch_yaml(profile: str, primary: str, base_url: str, provider: str, fallbacks: list) -> None:
    import yaml  # type: ignore

    cfg_file = hermes_root / "profiles" / profile / "config.yaml"
    if not cfg_file.is_file():
        print(f"SKIP {profile}: no config")
        return
    data = yaml.safe_load(cfg_file.read_text(encoding="utf-8")) or {}
    data.setdefault("model", {})
    data["model"]["default"] = primary
    data["model"]["provider"] = provider
    data["model"]["base_url"] = base_url
    data["model"]["api_mode"] = "chat_completions"
    data["model"].pop("api_key", None)

    # Always keep ZenMux registered (keys via ZENMUX_API_KEY in ~/.hermes/.env).
    data.setdefault("providers", {})
    data["providers"]["zenmux"] = dict(zenmux_block)

    fps = normalize_fallbacks(fallbacks)
    if not fps:
        # Hard floor: never leave think without a cloud escape hatch.
        # think is FREE-ONLY (2026-07-24) — no paid escape hatch; fail/IDLE rather than spend.
        fps = [
            {
                "provider": "openrouter",
                "model": "poolside/laguna-xs-2.1:free",
                "base_url": "https://openrouter.ai/api/v1",
            },
            {
                "provider": "openrouter",
                "model": "nvidia/nemotron-3-super-120b-a12b:free",
                "base_url": "https://openrouter.ai/api/v1",
            },
            {
                "provider": "openrouter",
                "model": "cohere/north-mini-code:free",
                "base_url": "https://openrouter.ai/api/v1",
            },
        ]
    data["fallback_providers"] = fps

    if dry:
        fb_sum = ", ".join(f"{x['provider']}:{x['model']}" for x in fps)
        print(f"DRY {profile} -> {provider}/{primary} @ {base_url} | fallbacks=[{fb_sum}]")
        return
    cfg_file.write_text(yaml.safe_dump(data, default_flow_style=False, sort_keys=False), encoding="utf-8")
    fb_sum = ", ".join(f"{x['provider']}:{x['model']}" for x in fps)
    print(f"PATCHED {profile} -> {provider}/{primary} @ {base_url} | fallbacks=[{fb_sum}]")


for prof in profiles:
    spec = cloud_spec(prof)
    cloud_fbs = list(spec.get("fallbacks") or [])
    if use_local:
        # Bonsai first; cloud Hermes + Step + DeepSeek + ZenMux always behind it.
        hermes_fb = {
            "provider": spec.get("provider", "openrouter"),
            "model": spec["default"],
            "base_url": spec.get("base_url", "https://openrouter.ai/api/v1"),
        }
        chain = [hermes_fb] + [fb for fb in cloud_fbs if fb.get("model") != hermes_fb["model"]]
        patch_yaml(prof, model_id, hit_url, "custom", chain)
    else:
        patch_yaml(
            prof,
            spec["default"],
            spec.get("base_url", "https://openrouter.ai/api/v1"),
            spec.get("provider", "openrouter"),
            cloud_fbs,
        )

state_path.parent.mkdir(parents=True, exist_ok=True)
if not dry:
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
print(f"mode={mode} healthy={healthy} prefer_local={prefer_local}")
sys.exit(0)
PY
