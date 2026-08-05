#!/usr/bin/env python3
"""Normalize agents/state/human-inbox.json to canonical {open, answered} shape.

Hermes/agents sometimes overwrite the file as a bare array or legacy schema,
which makes mergeInboxSeeds treat all answers as missing and re-seed open questions.
Run before agent ticks and after deploy; safe to run repeatedly (idempotent).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def normalize_shape(parsed: object) -> dict:
    if not parsed:
        return {"open": [], "answered": []}
    if isinstance(parsed, list):
        open_items: list = []
        answered: list = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            ans = item.get("answer") or item.get("decision")
            if item.get("status") == "answered" and not ans and item.get("reason"):
                ans = item.get("reason")
            if item.get("answered_at") or item.get("status") == "answered" or ans:
                answered.append({**item, "answer": str(ans or item.get("answer") or "(answered)")})
            else:
                open_items.append(item)
        return {"open": open_items, "answered": answered}
    if isinstance(parsed, dict):
        if isinstance(parsed.get("open"), list) or isinstance(parsed.get("answered"), list):
            return {
                "open": list(parsed.get("open") or []),
                "answered": list(parsed.get("answered") or []),
            }
        if isinstance(parsed.get("questions"), list):
            open_items = []
            answered = []
            for q in parsed["questions"]:
                if not isinstance(q, dict):
                    continue
                if q.get("status") == "answered" or q.get("answer") or q.get("answered_at"):
                    answered.append(q)
                else:
                    open_items.append(q)
            return {"open": open_items, "answered": answered}
    return {"open": [], "answered": []}


def merge_canon(a: dict, b: dict) -> dict:
    answered = {q["id"]: q for q in (a.get("answered") or []) + (b.get("answered") or []) if q.get("id")}
    open_ids = set()
    open_items = []
    for q in (a.get("open") or []) + (b.get("open") or []):
        qid = q.get("id")
        if not qid or qid in answered or qid in open_ids:
            continue
        open_ids.add(qid)
        open_items.append(q)
    return {"open": open_items, "answered": list(answered.values())}


def _norm_question(q: object) -> str:
    return " ".join(str(q or "").lower().split())


def apply_consumed_and_dedupe(repo: Path, data: dict) -> dict:
    """Keep seeds closed: honor inbox-consumed.json; text-dedupe only against seed questions."""
    consumed_path = repo / "agents" / "state" / "inbox-consumed.json"
    consumed_ids: set[str] = set()
    consumed_meta: dict = {}
    raw_c = load_json(consumed_path)
    if isinstance(raw_c, dict) and isinstance(raw_c.get("consumed"), dict):
        consumed_meta = raw_c["consumed"]
        consumed_ids = {k for k in consumed_meta if k}

    seeds_path = repo / "agents" / "inbox-seeds.json"
    seeds_raw = load_json(seeds_path)
    seed_items = []
    if isinstance(seeds_raw, dict) and isinstance(seeds_raw.get("items"), list):
        seed_items = seeds_raw["items"]
    seed_ids = {s.get("id") for s in seed_items if isinstance(s, dict) and s.get("id")}
    seed_questions = {
        _norm_question(s.get("question"))
        for s in seed_items
        if isinstance(s, dict) and _norm_question(s.get("question"))
    }

    answered = {q["id"]: q for q in (data.get("answered") or []) if isinstance(q, dict) and q.get("id")}
    for qid in consumed_ids:
        if qid in answered:
            continue
        meta = consumed_meta.get(qid) or {}
        answered[qid] = {
            "id": qid,
            "answer": str(meta.get("answer") or "(consumed)"),
            "answered_at": meta.get("at") or "",
            "from": "inbox-consumed",
            "question": "",
        }

    # Fill question text from seeds when restoring consumed stubs (Hub text-dedupe).
    for seed in seed_items:
        if not isinstance(seed, dict):
            continue
        sid = seed.get("id")
        if sid and sid in answered and not answered[sid].get("question"):
            answered[sid] = {
                **answered[sid],
                "question": seed.get("question") or "",
                "context": seed.get("context") or answered[sid].get("context"),
                "type": seed.get("type") or answered[sid].get("type"),
                "campaign": seed.get("campaign") or answered[sid].get("campaign"),
                "from": answered[sid].get("from") or seed.get("from") or "seed",
            }

    # Only seed question texts count for text-dedupe (ad-hoc runtime-verify shares templates).
    answered_seed_questions = {
        _norm_question(q.get("question"))
        for qid, q in answered.items()
        if (qid in seed_ids or qid in consumed_ids)
        and _norm_question(q.get("question")) in seed_questions
    }
    # Also treat any answered row whose question matches a seed as closed seed text.
    for q in answered.values():
        nq = _norm_question(q.get("question"))
        if nq and nq in seed_questions:
            answered_seed_questions.add(nq)

    open_items = []
    open_ids: set[str] = set()
    for q in data.get("open") or []:
        if not isinstance(q, dict):
            continue
        qid = q.get("id")
        if qid and (qid in answered or qid in open_ids):
            continue
        nq = _norm_question(q.get("question"))
        # Text-dedupe: seed re-asks / id-less dupes only — not distinct incident ids.
        if nq and nq in answered_seed_questions:
            if not qid or qid in seed_ids:
                continue
        if qid:
            open_ids.add(qid)
        open_items.append(q)
    return {"open": open_items, "answered": list(answered.values())}


def load_json(path: Path) -> object | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_inbox(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def ensure_symlink(agents_dir: Path) -> None:
    legacy = agents_dir / "human-inbox.json"
    canon = agents_dir / "state" / "human-inbox.json"
    if legacy.is_symlink():
        return
    if legacy.is_file():
        leg = normalize_shape(load_json(legacy))
        can = normalize_shape(load_json(canon))
        write_inbox(canon, merge_canon(can, leg))
        bak = legacy.with_name(f"human-inbox.json.bak-{int(os.times().elapsed * 1000)}")
        legacy.rename(bak)
    if not legacy.exists():
        legacy.symlink_to("state/human-inbox.json")


def normalize_repo(repo: Path, quiet: bool = False) -> bool:
    agents = repo / "agents"
    canon = agents / "state" / "human-inbox.json"
    raw = load_json(canon)
    if raw is None and not canon.is_file():
        ensure_symlink(agents)
        return False
    normalized = normalize_shape(raw)
    before = json.dumps(normalized, sort_keys=True)
    normalized = apply_consumed_and_dedupe(repo, normalized)
    needs = (
        isinstance(raw, list)
        or not isinstance(raw, dict)
        or not isinstance(raw.get("open"), list)
        or not isinstance(raw.get("answered"), list)
        or json.dumps(normalized, sort_keys=True) != before
    )
    ensure_symlink(agents)
    legacy = agents / "human-inbox.json"
    if legacy.is_file() and not legacy.is_symlink():
        leg = normalize_shape(load_json(legacy))
        normalized = merge_canon(normalized, leg)
        normalized = apply_consumed_and_dedupe(repo, normalized)
        needs = True
    if needs:
        write_inbox(canon, normalized)
        if not quiet:
            print(f"human-inbox-normalize: repaired {canon}")
    return needs


def main() -> int:
    repo = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.home() / "agent-dump"
    quiet = "--quiet" in sys.argv
    normalize_repo(repo, quiet=quiet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
