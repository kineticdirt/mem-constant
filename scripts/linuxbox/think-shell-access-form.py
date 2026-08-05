#!/usr/bin/env python3
"""Think-tick shell access form + archive report + status enforce.

Why: `hermes chat` always sets HERMES_INTERACTIVE=1, so approvals.mode=manual
waits 60s and Timeout-denies flagged shell (systemctl, pipes). Unattended
ticks need --yolo for real shell, but we still want an audit trail.

- open:  write agents/state/shell-access-forms/<id>.json before Hermes
- close: append exit + write markdown under /mnt/archive/logs/think-reports/
         (fallback: reports/think-ticks/)
- enforce-status: if log ends with BLOCKED:/DONE: but task still open, patch
  status (C4 safety net — stops open-task re-pick thrash)

Guardrails = ordered checks in agents/THINK_SECURITY_CHECKS.md (C0 hard deny;
C1–C5 passable). Hermes hardline still blocks catastrophic cmds under --yolo.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(os.environ.get("LINUXBOX_AGENT_DUMP", Path.home() / "agent-dump"))
FORMS = REPO / "agents" / "state" / "shell-access-forms"
ARCHIVE = Path("/mnt/archive/logs/think-reports")
FALLBACK = REPO / "reports" / "think-ticks"
USER_TASKS = REPO / "agents" / "user-tasks.json"

# Protections recorded on the access form (documentation + Hub trail).
FORM_PROTECTIONS = [
    "hermes_hardline_blocklist",  # C0
    "deny_force_push_hard_reset",  # C0 (approvals.deny)
    "think_security_checks_md",  # C0–C5 teaching doc
    "logged_shell_form",  # C1
    "no_hermes_browser_toolset",  # C3 — Hermes browser_* not enabled
    "firecrawl_cloud_ok_curl_preferred",  # C3 soft
    "playwright_chat_ui_smoke_c6",  # C6 — run-chat-ui-smoke.sh
    "sudo_means_blocked_inbox",  # C1 soft
    "enforce_task_status_c4",  # C4 safety net
    "think_timeout_adaptive",
]


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _safe(s: str, n: int = 80) -> str:
    s = re.sub(r"[^\w.\-]+", "-", (s or "").strip())[:n]
    return s.strip("-") or "na"


def cmd_open(args: argparse.Namespace) -> int:
    FORMS.mkdir(parents=True, exist_ok=True)
    fid = f"form-{_stamp()}-{_safe(args.task_id, 12)}"
    form = {
        "id": fid,
        "task_id": (args.task_id or "")[:80],
        "blurb": (args.blurb or "")[:400],
        "access": "hermes_chat_yolo",
        "checks": "agents/THINK_SECURITY_CHECKS.md",
        "protections": list(FORM_PROTECTIONS),
        "started_at": _now(),
        "ended_at": None,
        "exit_code": None,
        "log_path": args.log or str(REPO / "agents" / "runs" / "think-last.log"),
        "report_path": None,
        "note": (
            "Shell allowed this tick (C1). Pass C0–C5 in THINK_SECURITY_CHECKS.md; "
            "C0 hard deny only. Reverse via report + git."
        ),
    }
    path = FORMS / f"{fid}.json"
    path.write_text(json.dumps(form, indent=2) + "\n", encoding="utf-8")
    # pointer for close
    (FORMS / "current.json").write_text(
        json.dumps({"id": fid, "path": str(path)}, indent=2) + "\n", encoding="utf-8"
    )
    print(str(path))
    return 0


def _report_dir() -> Path:
    if ARCHIVE.parent.is_dir() and os.access(ARCHIVE.parent, os.W_OK):
        d = ARCHIVE / datetime.now(timezone.utc).strftime("%Y/%m")
    else:
        d = FALLBACK
    d.mkdir(parents=True, exist_ok=True)
    return d


def cmd_close(args: argparse.Namespace) -> int:
    cur = FORMS / "current.json"
    if not cur.exists():
        print("no current form", flush=True)
        return 0
    try:
        meta = json.loads(cur.read_text(encoding="utf-8"))
        path = Path(meta["path"])
        form = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"form read failed: {e}", flush=True)
        return 0

    form["ended_at"] = _now()
    form["exit_code"] = int(args.exit_code)
    log_path = Path(form.get("log_path") or (REPO / "agents" / "runs" / "think-last.log"))
    log_tail = ""
    if log_path.exists():
        try:
            raw = log_path.read_text(encoding="utf-8", errors="replace")
            log_tail = raw[-12000:]
        except Exception:
            log_tail = "(unreadable log)"

    rdir = _report_dir()
    rname = f"{form['id']}-exit{form['exit_code']}.md"
    rpath = rdir / rname
    md = "\n".join(
        [
            f"# Think tick report — `{form['id']}`",
            "",
            f"- **started:** {form.get('started_at')}",
            f"- **ended:** {form.get('ended_at')}",
            f"- **exit:** {form.get('exit_code')}",
            f"- **task_id:** `{form.get('task_id') or '—'}`",
            f"- **access:** `{form.get('access')}`",
            f"- **protections:** {', '.join(form.get('protections') or [])}",
            f"- **blurb:** {form.get('blurb') or '—'}",
            f"- **form:** `{path}`",
            f"- **log:** `{log_path}`",
            "",
            "## Why this exists",
            "",
            "Unattended think ticks grant shell via Hermes `--yolo` so the agent can",
            "diagnose/fix the stack. Checks: `agents/THINK_SECURITY_CHECKS.md`.",
            "C0/hardline still blocks catastrophic commands; C1–C5 are passable gates.",
            "This report is the reverse-engineering trail if something breaks.",
            "",
            "## Log tail",
            "",
            "```text",
            log_tail.rstrip() or "(empty)",
            "```",
            "",
        ]
    )
    rpath.write_text(md, encoding="utf-8")
    form["report_path"] = str(rpath)
    path.write_text(json.dumps(form, indent=2) + "\n", encoding="utf-8")
    try:
        cur.unlink(missing_ok=True)
    except TypeError:
        if cur.exists():
            cur.unlink()
    # latest pointer in repo for Hub/ops
    latest = REPO / "reports" / "think-ticks" / "LATEST.md"
    latest.parent.mkdir(parents=True, exist_ok=True)
    latest.write_text(md, encoding="utf-8")
    _append_run_index(
        exit_code=int(form.get("exit_code") or 0),
        log_path=str(log_path),
        task_id=str(form.get("task_id") or ""),
        blurb=str(form.get("blurb") or ""),
        log_text=log_tail,
    )
    print(str(rpath))
    return 0


_OUTCOME_RE = re.compile(
    r"(?im)^\s*(?:[*_`#>\-\s]*)?(DONE|BLOCKED|IDLE)\s*:\s*(.*)$"
)


def _timeout_verify_rescue(log_text: str) -> bool:
    """Strong evidence a timed-out tick had already finished + verified:
    smoke PASS plus stated intent to mark the task done."""
    return bool(
        re.search(r"smoke\s+PASS(?:ES)?", log_text or "", re.I)
        and re.search(
            r"(?:mark|update|set)\s+.*(?:user-tasks|task).*(?:done|status)",
            log_text or "",
            re.I,
        )
    )


def _infer_outcome(log_text: str) -> str | None:
    """Last DONE:/BLOCKED:/IDLE: marker in the log wins."""
    found: list[str] = []
    for m in _OUTCOME_RE.finditer(log_text or ""):
        line = m.group(0)
        rest = (m.group(2) or "").strip()
        # Skip prompt templates like "End with … DONE: / BLOCKED: / IDLE:."
        up = line.upper()
        if sum(up.count(k) for k in ("DONE:", "BLOCKED:", "IDLE:")) > 1:
            continue
        # Wrapped prompt fragment e.g. lone "IDLE:." after line break.
        if not rest or re.fullmatch(r"[./|\s\-]*", rest):
            continue
        found.append(m.group(1).upper())
    if not found:
        # Prose fallback: agent said blocked but forgot the marker.
        low = (log_text or "").lower()
        if re.search(r"\bstatus\s*=\s*blocked\b", low) or re.search(
            r"\b(set|mark(?:ed)?)\s+(?:(?:the|this)\s+)?task\s+(?:as\s+)?blocked\b", low
        ):
            return "BLOCKED"
        if re.search(r"\bstatus\s*=\s*done\b", low):
            return "DONE"
        # Timeout/SIGINT after verify: smoke PASS + intent to mark done, but no DONE:
        # line (exit 124 thrash — burns another paid 300s redoing finished work).
        if _timeout_verify_rescue(log_text):
            return "DONE"
        return None
    return found[-1]


def _append_run_index(
    *,
    exit_code: int,
    log_path: str,
    task_id: str,
    blurb: str,
    log_text: str,
) -> None:
    """Hub run-index row — per-tick what/outcome (not generic pod think)."""
    try:
        import sys

        sys.path.insert(0, str(REPO / "scripts" / "linuxbox"))
        from archive_meta import append_run  # ponytail: local import avoids cycle at load
    except Exception:
        return
    outcome = _infer_outcome(log_text) or ""
    if not outcome:
        if int(exit_code) == 0:
            outcome = "ok"
        elif int(exit_code) in (124, -1):
            outcome = "timeout"
        elif int(exit_code) == 429:
            outcome = "fail"
        else:
            outcome = "fail"
    if re.search(r"\bIDLE\b", blurb or "", re.I) or re.search(r"\bIDLE\b", (log_text or "")[:400], re.I):
        outcome = "idle"
    clean_blurb = re.sub(r"\s+", " ", (blurb or "")).strip()[:240]
    if not clean_blurb:
        m = re.search(r"(?im)^\s*DONE:\s*(.+)$", log_text or "")
        if m:
            clean_blurb = m.group(1).strip()[:240]
    summary = clean_blurb or f"think exit {exit_code}"
    append_run(
        "agent_runs",
        "think",
        int(exit_code),
        str(log_path),
        summary,
        task_id=(task_id or "")[:80],
        blurb=clean_blurb,
        outcome=outcome,
    )


def cmd_enforce_status(args: argparse.Namespace) -> int:
    """C4 safety net: patch user-tasks status when Hermes forgot."""
    tid = (args.task_id or "").strip()
    if not tid:
        print("no task-id", flush=True)
        return 0
    log_path = Path(args.log) if args.log else (REPO / "agents" / "runs" / "think-last.log")
    try:
        log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.is_file() else ""
    except OSError:
        log_text = ""
    # pc-2026-08-04-think-exit124: a timed-out tick must not flip the board on
    # marker text alone — only on strong verify evidence; else leave open for re-pick.
    if getattr(args, "exit_code", -1) == 124 and not _timeout_verify_rescue(log_text):
        print("skip enforce: tick timed out (exit 124) without verify evidence", flush=True)
        return 0
    outcome = _infer_outcome(log_text)
    if outcome not in ("DONE", "BLOCKED"):
        print(f"no enforceable outcome ({outcome or 'none'})", flush=True)
        return 0
    if not USER_TASKS.is_file():
        print("no user-tasks.json", flush=True)
        return 0
    try:
        data = json.loads(USER_TASKS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"user-tasks read failed: {e}", flush=True)
        return 0
    tasks = data.get("tasks") if isinstance(data, dict) else None
    if not isinstance(tasks, list):
        print("user-tasks malformed", flush=True)
        return 0
    want = "done" if outcome == "DONE" else "blocked"
    touched = False
    for t in tasks:
        if not isinstance(t, dict):
            continue
        if str(t.get("id") or "") != tid:
            continue
        cur = str(t.get("status") or "").lower()
        if cur == want:
            print(f"already {want}", flush=True)
            return 0
        if cur not in ("open", "in_progress", "running", ""):
            # Do not clobber done↔blocked against an explicit other state.
            print(f"skip status={cur} (want {want})", flush=True)
            return 0
        t["status"] = want
        note = f"think-enforce-status:{outcome}:{_now()}"
        prev = str(t.get("notes") or t.get("agent_note") or "")
        t["agent_note"] = (prev + "\n" + note).strip() if prev else note
        touched = True
        break
    if not touched:
        print("task id not found", flush=True)
        return 0
    bak = USER_TASKS.with_suffix(USER_TASKS.suffix + f".bak.enforce.{_stamp()}")
    try:
        bak.write_text(USER_TASKS.read_text(encoding="utf-8"), encoding="utf-8")
    except OSError:
        pass
    USER_TASKS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"enforced {tid} -> {want}", flush=True)
    return 0


def cmd_enforce_lane(args: argparse.Namespace) -> int:
    """C4 for lane (progress-md) work: if log ended DONE: but the agent forgot
    to tick the box we handed it, flip that exact `[ ]`->`[x]` line and append a
    dated one-liner under `## Done`. Stops has-work re-picking the same item.

    Only touches the one line whose text matches the item we selected — never a
    blind sweep, so a mid-flight/abandoned tick can't false-complete other work.
    """
    rel = (args.file or "").strip()
    item = (args.item or "").strip()
    if not rel or not item:
        print("no lane file/item", flush=True)
        return 0
    log_path = Path(args.log) if args.log else (REPO / "agents" / "runs" / "think-last.log")
    try:
        log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.is_file() else ""
    except OSError:
        log_text = ""
    # pc-2026-08-04-think-exit124: no board flip on a timed-out tick unless the
    # work demonstrably finished + verified; leave the box open for re-pick.
    if getattr(args, "exit_code", -1) == 124 and not _timeout_verify_rescue(log_text):
        print("lane: skip enforce — exit 124 without verify evidence", flush=True)
        return 0
    if _infer_outcome(log_text) != "DONE":
        print("lane: no DONE marker", flush=True)
        return 0
    mf = REPO / rel
    if not mf.is_file():
        print("lane file missing", flush=True)
        return 0
    try:
        lines = mf.read_text(encoding="utf-8").splitlines()
    except OSError as e:
        print(f"lane read failed: {e}", flush=True)
        return 0
    key = re.sub(r"\s+", " ", item).strip().lower()[:60]
    flipped = False
    for i, line in enumerate(lines):
        m = re.match(r"^(\s*[-*]\s*)\[\s\](\s*)(.*)$", line)
        if not m:
            continue
        body_norm = re.sub(r"\s+", " ", m.group(3)).strip().lower()
        if key and (body_norm.startswith(key) or key.startswith(body_norm[:60])):
            lines[i] = f"{m.group(1)}[x]{m.group(2)}{m.group(3)}"
            flipped = True
            break
    if not flipped:
        print("lane: item line not found (agent may have already ticked it)", flush=True)
        return 0
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    done_line = f"- {stamp}: {item[:160]} — think-enforce-lane (log DONE:)"
    out = []
    inserted = False
    for line in lines:
        out.append(line)
        if not inserted and line.strip().lower() == "## done":
            out.append(done_line)
            inserted = True
    if not inserted:
        out.append("")
        out.append(done_line)
    bak = mf.with_suffix(mf.suffix + f".bak.enforce.{_stamp()}")
    try:
        bak.write_text(mf.read_text(encoding="utf-8"), encoding="utf-8")
    except OSError:
        pass
    mf.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"lane enforced: ticked box in {rel}", flush=True)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("open")
    o.add_argument("--task-id", default="")
    o.add_argument("--blurb", default="")
    o.add_argument("--log", default="")
    o.set_defaults(func=cmd_open)
    c = sub.add_parser("close")
    c.add_argument("--exit-code", type=int, required=True)
    c.set_defaults(func=cmd_close)
    e = sub.add_parser("enforce-status")
    e.add_argument("--task-id", required=True)
    e.add_argument("--log", default="")
    e.add_argument("--exit-code", type=int, default=-1)
    e.set_defaults(func=cmd_enforce_status)
    el = sub.add_parser("enforce-lane")
    el.add_argument("--file", required=True)
    el.add_argument("--item", required=True)
    el.add_argument("--log", default="")
    el.add_argument("--exit-code", type=int, default=-1)
    el.set_defaults(func=cmd_enforce_lane)
    args = ap.parse_args()
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
