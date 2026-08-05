#!/usr/bin/env bash
# Probe OpenRouter models; on delist/404 rotate profile primary to next in chain.
# Run on linuxbox: bash scripts/linuxbox/hermes-model-failover.sh
# Cron: daily via hermes-model-health (see install-hermes-model-health-cron.sh)
set -euo pipefail

REPO="${HOME}/agent-dump"
REGISTRY="${REPO}/agents/hermes-model-registry.json"
STATE="${REPO}/agents/state/hermes-model-health.json"
REPORT_DIR="${REPO}/reports/hermes-model-health"
HERMES_ROOT="${HOME}/.hermes"
ENV_FILE="${HERMES_ROOT}/.env"

mkdir -p "$(dirname "${STATE}")" "${REPORT_DIR}"

python3 - "${REGISTRY}" "${STATE}" "${REPORT_DIR}" "${HERMES_ROOT}" "${ENV_FILE}" <<'PY'
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

registry_path, state_path, report_dir, hermes_root, env_file = map(Path, sys.argv[1:6])

def load_env():
    env = {}
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def load_yaml_primary(cfg_path):
    if not cfg_path.is_file():
        return None
    text = cfg_path.read_text(encoding="utf-8")
    m = re.search(r"^\s*default:\s*(\S+)", text, re.M)
    return m.group(1) if m else None

def patch_profile(profile, primary, fb1, fb2):
    cfg = hermes_root / "profiles" / profile / "config.yaml"
    if not cfg.is_file():
        print(f"SKIP patch {profile}: no config")
        return
    import yaml  # stdlib on py3.12? use regex minimal if no yaml
    try:
        data = yaml.safe_load(cfg.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    data.setdefault("model", {})
    data["model"]["default"] = primary
    data["model"]["provider"] = "openrouter"
    data["model"]["base_url"] = "https://openrouter.ai/api/v1"
    data["fallback_providers"] = [
        {"provider": "openrouter", "model": fb1, "base_url": "https://openrouter.ai/api/v1"},
        {"provider": "openrouter", "model": fb2, "base_url": "https://openrouter.ai/api/v1"},
    ]
    cfg.write_text(yaml.safe_dump(data, default_flow_style=False, sort_keys=False), encoding="utf-8")
    print(f"PATCHED {profile} -> {primary}")

def probe_model(api_key, model, max_tokens, timeout):
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": "Reply: ok"}],
            "max_tokens": max_tokens,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://abhinavall.net/Linuxbox/",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if 200 <= resp.status < 300:
                return True, "ok"
            return False, f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")[:400]
        return False, f"HTTP {e.code}: {err}"
    except Exception as e:
        return False, str(e)[:200]

registry = json.loads(registry_path.read_text(encoding="utf-8"))
env = load_env()
probe_cfg = registry.get("probe", {})
max_tokens = int(probe_cfg.get("max_tokens", 2))
timeout = int(probe_cfg.get("timeout_sec", 45))
delist_re = re.compile("|".join(re.escape(p) for p in registry.get("delist_patterns", [])), re.I)

state = {}
if state_path.is_file():
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        state = {}

now = datetime.now(timezone.utc).isoformat()
events = []
all_ok = True

for profile, cfg in registry.get("profiles", {}).items():
    chain = cfg.get("chain") or []
    if not chain:
        continue
    pool = cfg.get("pool", "ops")
    key_name = "OPENROUTER_API_KEY_OPS" if pool == "ops" else "OPENROUTER_API_KEY_RP"
    if pool == "free":
        key_name = "OPENROUTER_API_KEY_OPS" if env.get("OPENROUTER_API_KEY_OPS") else "OPENROUTER_API_KEY"
    api_key = env.get(key_name) or env.get("OPENROUTER_API_KEY_OPS") or env.get("OPENROUTER_API_KEY_RP") or env.get("OPENROUTER_API_KEY")
    if not api_key:
        events.append({"profile": profile, "action": "skip", "reason": f"no {key_name}"})
        all_ok = False
        continue

    cfg_path = hermes_root / "profiles" / profile / "config.yaml"
    current = load_yaml_primary(cfg_path) or chain[0]
    # Build try order: current first, then rest of chain
    try_order = [current] + [m for m in chain if m != current]

    working = None
    last_err = ""
    for model in try_order:
        ok, msg = probe_model(api_key, model, max_tokens, timeout)
        if ok:
            working = model
            break
        last_err = msg
        if not delist_re.search(msg):
            # transient — don't rotate yet
            events.append({"profile": profile, "action": "hold", "model": model, "error": msg})
            working = current
            break

    if working and working != current:
        fb1 = chain[(chain.index(working) + 1) % len(chain)] if len(chain) > 1 else working
        fb2 = chain[(chain.index(working) + 2) % len(chain)] if len(chain) > 2 else fb1
        patch_profile(profile, working, fb1, fb2)
        events.append({"profile": profile, "action": "failover", "from": current, "to": working, "error": last_err})
    elif working:
        events.append({"profile": profile, "action": "ok", "model": working})
    else:
        all_ok = False
        events.append({"profile": profile, "action": "FAILED", "tried": try_order, "error": last_err})

state["updated_at"] = now
state["all_ok"] = all_ok
state["last_events"] = events
state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")

day = now[:10]
report = report_dir / f"{day}.md"
lines = [f"# Hermes model failover — {day}", "", f"all_ok: **{all_ok}**", ""]
for ev in events:
    lines.append(f"- `{ev.get('profile')}` **{ev.get('action')}** {json.dumps({k: v for k, v in ev.items() if k != 'profile' and k != 'action'})}")
report.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"report: {report}")
print(f"state: all_ok={all_ok}")
sys.exit(0 if all_ok else 1)
PY
