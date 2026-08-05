#!/usr/bin/env python3
"""Compiled-intent verifier for linuxbox agent loops.

Reads agents/intent/agent-loops.json and checks changed files / deletions against
pod boundaries and global secret patterns. Stdlib only (Python 3.9+).

Usage:
  verify_agent_intent.py --static [--repo PATH]
  verify_agent_intent.py --pod NAME --changed-json FILE [--before-json FILE] [--repo PATH]

Exit 0 = pass. Exit 1 = hard violation.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_SPEC = "agents/intent/agent-loops.json"
VIOLATIONS_LOG = "agents/state/intent-violations.jsonl"

SKIP_DIR_NAMES = {
    "node_modules",
    ".git",
    "__pycache__",
    ".deepsec",
    ".venv",
    "venv",
}


def norm_path(path: str) -> str:
    # ponytail: do NOT use str.lstrip("./") — that strips any leading '.' so
    # ".git/HEAD" becomes "git/HEAD" and snapshots walk the whole object store.
    p = path.replace("\\", "/")
    while p.startswith("./"):
        p = p[2:]
    return p.lstrip("/")


def load_spec(repo: Path) -> dict[str, Any]:
    spec_path = repo / DEFAULT_SPEC
    if not spec_path.is_file():
        sys.exit(f"error: missing spec {spec_path}")
    return json.loads(spec_path.read_text(encoding="utf-8"))


def is_ignored(rel: str, spec: dict[str, Any]) -> bool:
    for prefix in spec.get("ignore_path_prefixes", []):
        if rel.startswith(norm_path(prefix)):
            return True
    return False


def matches_prefix(rel: str, prefix: str) -> bool:
    p = norm_path(prefix)
    return rel == p or rel.startswith(p)


def secret_regexes(spec: dict[str, Any]) -> list[re.Pattern[str]]:
    raw = spec.get("secret_regexes") or []
    # ponytail: legacy substring patterns ignored — use secret_regexes only
    return [re.compile(p) for p in raw]


def check_secrets(repo: Path, rel_paths: list[str], spec: dict[str, Any]) -> list[str]:
    fails: list[str] = []
    patterns = secret_regexes(spec)
    exclude_suffixes = set(spec.get("static_scan_exclude_suffixes", []))
    spec_rel = norm_path(DEFAULT_SPEC)
    for rel in rel_paths:
        if rel == spec_rel:
            continue
        if any(rel.endswith(suf) for suf in exclude_suffixes):
            continue
        fp = repo / rel
        if not fp.is_file():
            continue
        try:
            text = fp.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            fails.append(f"G-SECRETS: cannot read {rel}: {e}")
            continue
        for rx in patterns:
            if rx.search(text):
                fails.append(f"G-SECRETS: pattern {rx.pattern!r} in {rel}")
    return fails


def check_pod_boundaries(
    pod: str,
    changed: list[str],
    deleted: list[str],
    spec: dict[str, Any],
) -> list[str]:
    fails: list[str] = []
    pods = spec.get("pods", {})
    rules = pods.get(pod)
    if not rules:
        return fails

    allowed = [norm_path(p) for p in rules.get("allowed_path_prefixes", [])]
    forbidden = [norm_path(p) for p in rules.get("forbidden_path_prefixes", [])]
    forbidden_actions = set(rules.get("forbidden_actions", []))

    def relevant(rel: str) -> str:
        return norm_path(rel)

    for rel in changed + deleted:
        r = relevant(rel)
        if is_ignored(r, spec):
            continue
        for fb in forbidden:
            if matches_prefix(r, fb):
                fails.append(f"{pod}: forbidden path {r} (prefix {fb})")
        if allowed and rules.get("boundary_mode") != "forbidden_only":
            if not any(matches_prefix(r, a) for a in allowed):
                fails.append(f"{pod}: path {r} outside allowed prefixes")

    if "delete" in forbidden_actions and deleted:
        for rel in deleted:
            r = relevant(rel)
            if is_ignored(r, spec):
                continue
            if allowed and not any(matches_prefix(r, a) for a in allowed):
                continue
            fails.append(f"{pod}: forbidden delete {r}")

    return fails


def snapshot(repo: Path) -> dict[str, float]:
    """Map repo-relative path -> mtime for watch tree."""
    out: dict[str, float] = {}
    spec = load_spec(repo)
    # Walk with dir pruning so .git / node_modules never enter the walk.
    for root, dirnames, filenames in os.walk(repo, followlinks=False):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
        root_path = Path(root)
        for name in filenames:
            fp = root_path / name
            if not fp.is_file():
                continue
            rel = norm_path(str(fp.relative_to(repo)))
            if is_ignored(rel, spec):
                continue
            try:
                out[rel] = fp.stat().st_mtime
            except OSError:
                continue
    return out


def diff_snapshots(before: dict[str, float], after: dict[str, float]) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    deleted: list[str] = []
    for path, mt in after.items():
        if path not in before or before[path] != mt:
            changed.append(path)
    for path in before:
        if path not in after:
            deleted.append(path)
    return changed, deleted


SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".gz", ".tgz", ".mp4", ".woff", ".woff2"}
MAX_SCAN_BYTES = 512_000


def should_scan_file(fp: Path) -> bool:
    if fp.suffix.lower() in SKIP_SUFFIXES:
        return False
    try:
        return fp.stat().st_size <= MAX_SCAN_BYTES
    except OSError:
        return False


def static_scan(repo: Path, spec: dict[str, Any]) -> list[str]:
    """Scan agent-facing tree for secret patterns (no pod context)."""
    watch_prefixes = ["agents/", "scripts/linuxbox/"]
    paths: list[str] = []
    for prefix in watch_prefixes:
        base = repo / prefix
        if not base.is_dir():
            continue
        for fp in base.rglob("*"):
            if fp.is_file() and should_scan_file(fp):
                rel = norm_path(str(fp.relative_to(repo)))
                if not is_ignored(rel, spec):
                    paths.append(rel)
    return check_secrets(repo, paths, spec)


def append_violation(repo: Path, pod: str | None, failures: list[str]) -> None:
    log_path = repo / VIOLATIONS_LOG
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "pod": pod,
        "failures": failures,
    }
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".", help="agent-dump root")
    ap.add_argument("--static", action="store_true", help="global secret scan only")
    ap.add_argument("--pod", help="pod name from agent-pods.manifest.json")
    ap.add_argument("--changed-json", help="JSON file: list of changed paths")
    ap.add_argument("--deleted-json", help="JSON file: list of deleted paths")
    ap.add_argument("--before-json", help="snapshot JSON from before pod run")
    ap.add_argument("--after-json", help="snapshot JSON from after pod run")
    ap.add_argument("--log-violation", action="store_true", default=True)
    ap.add_argument("--no-log-violation", action="store_false", dest="log_violation")
    ap.add_argument("--snapshot-out", help="write repo file snapshot JSON to path")
    ns = ap.parse_args()

    repo = Path(ns.repo).resolve()
    spec = load_spec(repo)

    if ns.snapshot_out:
        out = snapshot(repo)
        Path(ns.snapshot_out).write_text(json.dumps(out), encoding="utf-8")
        print(f"OK: snapshot {len(out)} files -> {ns.snapshot_out}")
        return 0

    failures: list[str] = []

    if ns.static:
        failures.extend(static_scan(repo, spec))
    else:
        if not ns.pod:
            ap.error("--pod required unless --static")
        changed: list[str] = []
        deleted: list[str] = []
        if ns.before_json and ns.after_json:
            before = json.loads(Path(ns.before_json).read_text(encoding="utf-8"))
            after = json.loads(Path(ns.after_json).read_text(encoding="utf-8"))
            changed, deleted = diff_snapshots(before, after)
        if ns.changed_json:
            changed = json.loads(Path(ns.changed_json).read_text(encoding="utf-8"))
        if ns.deleted_json:
            deleted = json.loads(Path(ns.deleted_json).read_text(encoding="utf-8"))

        failures.extend(check_secrets(repo, changed, spec))
        failures.extend(check_pod_boundaries(ns.pod, changed, deleted, spec))

    if failures:
        if ns.log_violation:
            append_violation(repo, ns.pod if not ns.static else None, failures)
        for f in failures:
            print(f"FAIL: {f}", file=sys.stderr)
        return 1

    print("OK: compiled intent verified")
    return 0


def _self_check() -> None:
    repo = Path(__file__).resolve().parents[2]
    spec = load_spec(repo)
    assert "pods" in spec and "fast" in spec["pods"]
    fails = check_pod_boundaries("fast", ["campaigns/x.md"], [], spec)
    assert any("forbidden" in f for f in fails)
    fails2 = check_pod_boundaries("fast", ["AI_GROUPCHAT.md"], [], spec)
    assert not fails2


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
        print("self-check OK")
        sys.exit(0)
    sys.exit(main())
