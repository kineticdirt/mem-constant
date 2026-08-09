#!/usr/bin/env python3
"""Patch Hermes approvals for unattended linuxbox agent ticks (ops-safe).

Root cause of Inbox spam ("Think lane tick terminal blocked — approve one
terminal run?"):

  - Think/meta cron sessions set HERMES_CRON_SESSION=1.
  - With approvals.cron_mode=deny, any command Hermes flags as "dangerous"
    is hard-blocked (no human present to /approve).
  - Agents often wrap work as ``bash -lc '…'``, which matches the pattern
    "shell command via -c/-lc flag" — so even ``git status -sb`` looks
    "terminal blocked".
  - ``systemctl … restart`` is also flagged ("stop/restart system service").
  - Inbox YES / "approve one tick" is ephemeral: next tick re-asks.

This script (idempotent; called from install-hermes-profiles.sh):

  - sets approvals.cron_mode=approve for ops profiles so normal think/meta
    shell works unattended (git, scripts, smoke, systemctl restart
    linuxbox-status)
  - keeps the hardline blocklist (rm -rf /, mkfs, shutdown, …) — Hermes
    hardline still applies under cron approve
  - keeps command_allowlist prefixes for safe git (documentation +
    interactive "always" path)
  - still records force-push / hard-reset deny globs when Hermes honors them
  - sets terminal.cwd to ~/agent-dump

Run ON linuxbox.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("error: PyYAML required", file=sys.stderr)
    sys.exit(1)

HERMES_ROOT = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
REPO = Path(os.environ.get("LINUXBOX_AGENT_DUMP", Path.home() / "agent-dump"))

# Profiles that run unattended ticks needing real shell (dashboard meta, code).
OPS_CRON_APPROVE_PROFILES = frozenset(
    {"", "default", "think", "code", "meta", "hunter-reckoning"}
)

SAFE_GIT_ALLOW = [
    "git status",
    "git pull",
    "git pull --ff-only",
    "git fetch",
    "git log",
    "git diff",
    "git rev-parse",
]

# Pattern keys Hermes stores when user picks "always" — useful for interactive
# / gateway sessions. Cron path under cron_mode=deny ignores these; we use
# cron_mode=approve for ops instead (see OPS_CRON_APPROVE_PROFILES).
SAFE_PATTERN_KEYS = [
    "shell command via -c/-lc flag",
    "stop/restart system service",
]

# Read-only Discord / gateway diagnostics (dangerous-cmd pattern keys).
# Note: Tirith findings use tirith:<rule_id> and cannot be permanently
# allowlisted by Hermes — on potato Bullseye (glibc 2.31) stock tirith
# binaries are broken (exit 1 → false "security issue detected"); disable
# security.tirith_enabled on hunter instead (see fix-hermes-tirith-glibc.sh).
SAFE_DIAG_ALLOW = [
    "hermes gateway status",
    "hermes gateway",
    "ls",
    "ls -la",
    "tail",
    "head",
    "cat",
    "systemctl --user is-active",
    "systemctl --user status",
    "journalctl --user",
]

DENY_GLOBS = [
    "git push --force*",
    "git push *-f *",
    "git push * -f",
    "git reset --hard*",
    "git clean -*f*",
]


def _profile_name(path: Path) -> str:
    # .../config.yaml → ""
    # .../profiles/think/config.yaml → "think"
    parts = path.parts
    if "profiles" in parts:
        i = parts.index("profiles")
        if i + 1 < len(parts):
            return parts[i + 1]
    return ""


def patch_config(path: Path) -> bool:
    if not path.is_file():
        return False
    with path.open(encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}

    approvals = cfg.setdefault("approvals", {})
    approvals.setdefault("mode", "manual")

    profile = _profile_name(path)
    # Ops ticks: approve non-hardline commands (no Inbox one-tick loop).
    # Fast lane stays deny — high-frequency, should stay IDLE / read-mostly.
    if profile in OPS_CRON_APPROVE_PROFILES or path == HERMES_ROOT / "config.yaml":
        approvals["cron_mode"] = "approve"
    else:
        approvals.setdefault("cron_mode", "deny")
        if profile == "fast":
            approvals["cron_mode"] = "deny"

    deny = list(approvals.get("deny") or [])
    for g in DENY_GLOBS:
        if g not in deny:
            deny.append(g)
    approvals["deny"] = deny

    allow = list(cfg.get("command_allowlist") or [])
    for a in SAFE_GIT_ALLOW + SAFE_PATTERN_KEYS + SAFE_DIAG_ALLOW:
        if a not in allow:
            allow.append(a)
    cfg["command_allowlist"] = allow

    terminal = cfg.setdefault("terminal", {})
    if not terminal.get("cwd") or terminal.get("cwd") in (".", ""):
        terminal["cwd"] = str(REPO)

    # Preserve hunter Tirith-off after fix-hermes-tirith-glibc.sh (Bullseye).
    if profile == "hunter-reckoning":
        sec = cfg.setdefault("security", {})
        if sec.get("tirith_enabled") is False:
            sec["tirith_fail_open"] = True

    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
    print(f"patched {path} cron_mode={approvals.get('cron_mode')} profile={profile or 'root'}")
    return True


def main() -> int:
    targets = [HERMES_ROOT / "config.yaml"]
    profiles = HERMES_ROOT / "profiles"
    if profiles.is_dir():
        for name in ("fast", "think", "code", "meta", "default", "hunter-reckoning"):
            targets.append(profiles / name / "config.yaml")

    n = 0
    for t in targets:
        if patch_config(t):
            n += 1
    if n == 0:
        print("error: no Hermes config.yaml found under", HERMES_ROOT, file=sys.stderr)
        return 1
    print(
        f"OK: patched {n} config(s); ops cron_mode=approve "
        f"(profiles {sorted(OPS_CRON_APPROVE_PROFILES - {''})}); "
        f"fast stays deny; hardline still blocks catastrophic cmds"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
