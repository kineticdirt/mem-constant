#!/usr/bin/env python3
"""Predictive resource planner for linuxbox agent pod scheduler (~2 GB ARM).

Reads manifest schedules + meminfo, returns admit/defer/spin decisions so the
scheduler can saturate CPU without OOM. Swap slowness is OK; swap exhaustion is not.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

DEFAULT_CONFIG = Path(__file__).resolve().parents[2] / "agents" / "resource-governor.json"


def _load_config() -> dict[str, Any]:
    if DEFAULT_CONFIG.is_file():
        return json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
    return {}


def _paused_pods(config: dict[str, Any]) -> set[str]:
    return set(config.get("paused_pods") or [])


def _read_mem_kb() -> dict[str, int]:
    info: dict[str, int] = {}
    for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
        key, rest = line.split(":", 1)
        info[key.strip()] = int(rest.split()[0])
    return info


def parse_proc_swaps(text: str) -> tuple[int, int]:
    """Sum (size_kb, used_kb) over non-zram entries in /proc/swaps text.

    The think defer gate must measure DISK swap pressure only: zram is fast
    compressed RAM, so counting it would re-trip the gate forever once zram
    fills (zram rollout 2026-08-05).
    """
    total = 0
    used = 0
    for line in text.splitlines()[1:]:  # skip header
        parts = line.split()
        if len(parts) < 4:
            continue
        if parts[0].startswith("/dev/zram"):
            continue
        try:
            total += int(parts[2])
            used += int(parts[3])
        except ValueError:
            continue
    return total, used


def disk_swap_used_pct(swaps_path: str = "/proc/swaps") -> float:
    """Used percent of DISK swap only (zram excluded); 0.0 when no disk swap."""
    try:
        text = Path(swaps_path).read_text(encoding="utf-8")
    except OSError:
        kb = _read_mem_kb()
        total = kb.get("SwapTotal", 0)
        free = kb.get("SwapFree", 0)
        return 100.0 * (1 - free / total) if total else 0.0
    total, used = parse_proc_swaps(text)
    return (100.0 * used / total) if total else 0.0


def mem_telemetry() -> dict[str, float]:
    """Return MemAvailable (MiB) and DISK-only swap used percent (zram excluded)."""
    kb = _read_mem_kb()
    avail_mb = kb.get("MemAvailable", 0) / 1024
    swap_pct = disk_swap_used_pct()
    return {"avail_mb": round(avail_mb, 1), "swap_used_pct": round(swap_pct, 1)}


def parse_interval(schedule: str) -> int | None:
    s = schedule.strip().lower()
    if s == "on-demand":
        return None
    m = re.match(r"every\s+(\d+)\s*s", s)
    if m:
        return int(m.group(1))
    m = re.match(r"every\s+(\d+)\s*m", s)
    if m:
        return int(m.group(1)) * 60
    return None


def due_pods(
    pods: list[dict[str, Any]],
    state: dict[str, Any],
    now: float,
) -> list[tuple[float, float, str, dict[str, Any]]]:
    """Return (pool_pri, -overdue, name, pod) for each due pod."""
    pool_rank = {"free": 0, "rp": 1, "ops": 2}
    last_run = state.get("last_run", {})
    offsets = state.get("offsets", {})
    think_last = float(last_run.get("think", 0))
    config = _load_config()
    think_cooldown = int(config.get("think_cooldown_sec", 480))
    paused = _paused_pods(config)

    out: list[tuple[float, float, str, dict[str, Any]]] = []
    for pod in pods:
        name = pod["name"]
        if name in paused:
            continue
        interval = parse_interval(pod.get("schedule", "on-demand"))
        if interval is None:
            continue
        offset = int(offsets.get(name, 0))
        last = float(last_run.get(name, 0))
        due_at = last + interval + offset
        if now < due_at:
            continue
        overdue = now - due_at
        pool = pod.get("pool", "ops")
        pri = pool_rank.get(pool, 2)
        if name == "think" and think_last and (now - think_last) < think_cooldown:
            pri = 3  # ponytail: let overdue RP run between think ticks
        out.append((pri, -overdue, name, pod))
    return out


def predict_next(
    pods: list[dict[str, Any]],
    state: dict[str, Any],
    now: float,
    horizon_sec: int,
) -> list[dict[str, Any]]:
    """Pods due within horizon (for spin-up/down)."""
    last_run = state.get("last_run", {})
    offsets = state.get("offsets", {})
    paused = _paused_pods(_load_config())
    upcoming: list[dict[str, Any]] = []
    for pod in pods:
        name = pod["name"]
        if name in paused:
            continue
        interval = parse_interval(pod.get("schedule", "on-demand"))
        if interval is None:
            continue
        offset = int(offsets.get(name, 0))
        last = float(last_run.get(name, 0))
        due_at = last + interval + offset
        in_sec = due_at - now
        if in_sec < -60:
            in_sec = 0  # overdue pods: treat as due now for spin-up
        if -60 <= in_sec <= horizon_sec:
            upcoming.append({"pod": name, "due_in_sec": round(in_sec)})
    upcoming.sort(key=lambda x: x["due_in_sec"])
    return upcoming


def _unit_active(unit: str) -> bool:
    proc = subprocess.run(
        ["systemctl", "--user", "is-active", unit],
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip() == "active"


def gateway_spin_actions(
    config: dict[str, Any],
    state: dict[str, Any],
    now: float,
    pods: list[dict[str, Any]],
) -> list[tuple[str, str]]:
    """Stop/start optional gateways based on upcoming pod schedule."""
    actions: list[tuple[str, str]] = []
    horizon = int(config.get("horizon_sec", 900))
    upcoming = {u["pod"]: u["due_in_sec"] for u in predict_next(pods, state, now, horizon)}
    for gw in config.get("optional_gateways", []):
        pod = gw["pod"]
        unit = gw["unit"]
        prewarm = int(gw.get("prewarm_sec", 300))
        idle_stop = int(gw.get("idle_stop_sec", 900))
        due_in = upcoming.get(pod)
        active = _unit_active(unit)
        if due_in is not None and due_in <= prewarm:
            if not active:
                actions.append(("start", unit))
        elif due_in is None:
            if active:
                last = float(state.get("last_run", {}).get(pod, 0))
                if not last or (now - last) > idle_stop:
                    actions.append(("stop", unit))
        elif due_in > idle_stop:
            if active:
                last = float(state.get("last_run", {}).get(pod, 0))
                if not last or (now - last) > idle_stop:
                    actions.append(("stop", unit))
    return actions


def apply_spin(actions: list[tuple[str, str]]) -> None:
    for verb, unit in actions:
        subprocess.run(["systemctl", "--user", verb, unit], check=False, capture_output=True)


def admit(
    name: str,
    pod: dict[str, Any],
    config: dict[str, Any],
    telem: dict[str, float],
) -> tuple[bool, str]:
    avail = telem["avail_mb"]
    swap_pct = telem["swap_used_pct"]
    min_admit = int(config.get("min_admit_mb", 180))
    worker = int(config.get("worker_peak_mb", 200))
    defer_swap = float(config.get("swap_defer_ops_pct", 92))

    if avail < min_admit:
        if name == "fast" and avail >= min_admit * 0.5:
            return True, "fast_light_pressure"
        return False, f"mem_avail={avail}<{min_admit}"

    if avail < worker + min_admit * 0.6 and pod.get("pool") == "ops" and name != "fast":
        return False, f"mem_headroom={avail}<{worker}+{min_admit}"

    if swap_pct >= defer_swap and pod.get("pool") == "ops" and name in ("think", "code", "ponytail-cleanup", "meta"):
        return False, f"swap={swap_pct}%>={defer_swap}"

    return True, "ok"


def plan_tick(
    manifest: dict[str, Any],
    state: dict[str, Any],
    now: float | None = None,
    *,
    apply_gateway_spin: bool = True,
) -> dict[str, Any]:
    """Full planner: telemetry, spin, ranked candidates, first admittable pod."""
    now = now or time.time()
    config = _load_config()

    telem = mem_telemetry()
    pods = manifest.get("pods", [])
    spin = gateway_spin_actions(config, state, now, pods)
    if apply_gateway_spin and spin:
        apply_spin(spin)

    candidates = due_pods(pods, state, now)
    non_fast = [c for c in candidates if c[2] != "fast"]
    if non_fast:
        candidates = non_fast
    candidates.sort()

    chosen: dict[str, Any] | None = None
    defer_reason = "no_candidates"
    for _, _, name, pod in candidates:
        ok, reason = admit(name, pod, config, telem)
        if ok:
            chosen = {"name": name, "pod": pod, "reason": reason}
            break
        defer_reason = f"{name}:{reason}"

    return {
        "telemetry": telem,
        "paused_pods": sorted(_paused_pods(config)),
        "upcoming": predict_next(pods, state, now, int(config.get("horizon_sec", 900))),
        "spin": [{"action": a, "unit": u} for a, u in spin],
        "chosen": chosen,
        "defer": defer_reason if not chosen else None,
        "candidate_order": [c[2] for c in candidates],
    }


def write_telemetry(repo: str | Path, plan: dict[str, Any]) -> None:
    config = _load_config()
    rel = config.get("telemetry_path", "agents/state/resource-telemetry.json")
    path = Path(repo) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "ts": time.time(),
        "telemetry": plan.get("telemetry"),
        "chosen": plan.get("chosen", {}).get("name") if plan.get("chosen") else None,
        "defer": plan.get("defer"),
        "candidate_order": plan.get("candidate_order"),
        "paused_pods": plan.get("paused_pods"),
        "upcoming": plan.get("upcoming", [])[:5],
        "spin": plan.get("spin"),
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def self_check() -> int:
    """Runnable on linuxbox; asserts planner invariants."""
    assert parse_interval("every 5m") == 300
    assert parse_interval("every 30s") == 30
    assert parse_interval("on-demand") is None
    manifest = {"pods": [{"name": "think", "pool": "ops", "schedule": "every 1m"}]}
    state = {"last_run": {"think": 0}, "offsets": {}}
    ranked = due_pods(manifest["pods"], state, time.time())
    assert ranked and ranked[0][2] == "think"
    ok, _ = admit("think", {"pool": "ops"}, {"min_admit_mb": 180, "worker_peak_mb": 200, "swap_defer_ops_pct": 92}, {"avail_mb": 500, "swap_used_pct": 50})
    assert ok
    ok2, reason = admit("think", {"pool": "ops"}, {"swap_defer_ops_pct": 92}, {"avail_mb": 500, "swap_used_pct": 99})
    assert not ok2 and "swap" in reason
    sim_lines = [
        "Filename Type Size Used Priority",
        "/var/swap2 file 2097148 800000 10",
        "/dev/zram0 partition 1048572 900000 100",
    ]
    st, su = parse_proc_swaps(chr(10).join(sim_lines))
    assert (st, su) == (2097148, 800000), (st, su)  # zram excluded despite higher use
    assert parse_proc_swaps("Filename Type Size Used Priority") == (0, 0)
    if Path("/proc/meminfo").is_file():
        t = mem_telemetry()
        assert "avail_mb" in t and "swap_used_pct" in t
    print("resource_governor self_check OK")
    return 0


def main() -> None:
    import argparse

    if "--self-check" in sys.argv:
        raise SystemExit(self_check())

    ap = argparse.ArgumentParser(description="Resource planner for agent pods")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--state", required=True)
    ap.add_argument("--dry-run", action="store_true", help="Do not systemctl spin gateways")
    args = ap.parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    state_path = Path(args.state)
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {"last_run": {}, "offsets": {}}
    print(json.dumps(plan_tick(manifest, state, apply_gateway_spin=not args.dry_run), indent=2))


if __name__ == "__main__":
    main()
