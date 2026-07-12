#!/usr/bin/env python3
"""
Restore unresolved Discord sheet attachments into characters/portraits/<id>/.

Default: copy from local discord-export/**/attachments by basename (fast, no API).
Optional: --from-discord re-fetches remaining misses via bot history (batched).

Usage:
  python tools/resolve_discord_attachments.py
  python tools/resolve_discord_attachments.py --id rosalina-bonetto
  python tools/resolve_discord_attachments.py --from-discord
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = ROOT / "characters-registry.json"
EXPORT = ROOT / "discord-export"
PORTRAITS = ROOT / "characters" / "portraits"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
ATT_PAT = re.compile(r"Attachment:\s*`([^`]+)`", re.I)


def basename_index() -> dict[str, Path]:
    idx: dict[str, Path] = {}
    for root in (PORTRAITS, ROOT / "Character Images"):
        if not root.is_dir():
            continue
        for f in root.rglob("*"):
            if f.is_file() and f.suffix.lower() in IMAGE_EXTS:
                idx.setdefault(f.name.lower(), f)
    if EXPORT.is_dir():
        for d in EXPORT.rglob("attachments"):
            if not d.is_dir():
                continue
            for f in d.iterdir():
                if f.is_file() and f.suffix.lower() in IMAGE_EXTS:
                    idx.setdefault(f.name.lower(), f)
    return idx


def story_abs(sp: str) -> Path | None:
    if not sp:
        return None
    rel = sp.replace("\\", "/")
    if rel.startswith("campaigns/tropic-gooner/"):
        rel = rel[len("campaigns/tropic-gooner/") :]
    p = ROOT / rel
    return p if p.is_file() else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", default="", help="Single registry id (default: all non-hidden PCs)")
    ap.add_argument("--from-discord", action="store_true", help="Re-fetch remaining misses via Discord bot")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    reg = json.loads(REG.read_text(encoding="utf-8"))
    idx = basename_index()
    targets = []
    for c in reg.get("characters", []):
        if args.id:
            if c.get("id") == args.id:
                targets.append(c)
        elif not c.get("hidden") and c.get("role") != "gm":
            targets.append(c)

    copied = already = missing = skipped = 0
    miss_job: list[dict] = []
    for row in targets:
        paths = [row.get("story_path"), *(row.get("duplicate_paths") or [])]
        refs: list[str] = []
        for sp in paths:
            abs_p = story_abs(str(sp or ""))
            if not abs_p:
                continue
            text = abs_p.read_text(encoding="utf-8", errors="replace")
            refs.extend(m.group(1).strip() for m in ATT_PAT.finditer(text))
        refs = sorted(set(refs))
        if not refs:
            continue
        dest_dir = PORTRAITS / row["id"]
        imgs = list(row.get("images") or [])
        for ref in refs:
            base = Path(ref).name
            ext = Path(base).suffix.lower()
            if ext not in IMAGE_EXTS:
                skipped += 1
                continue
            dest = dest_dir / base
            rel = f"characters/portraits/{row['id']}/{base}"
            if dest.is_file():
                already += 1
                if rel not in imgs:
                    imgs.append(rel)
                continue
            src = idx.get(base.lower())
            if not src:
                missing += 1
                miss_job.append({"id": row["id"], "ref": ref})
                continue
            if args.dry_run:
                print(f"WOULD_COPY {row['id']} <- {src.relative_to(ROOT)}")
                copied += 1
                continue
            dest_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            if rel not in imgs:
                imgs.append(rel)
            copied += 1
            print(f"COPIED {rel}")
        if not args.dry_run:
            row["images"] = imgs
            if not row.get("image_path") and imgs:
                row["image_path"] = imgs[0]
            row["doc_attachments"] = refs

    if not args.dry_run:
        REG.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    discord_result = None
    if args.from_discord and miss_job:
        agents_state = ROOT.parent.parent / "agents" / "state"
        agents_state.mkdir(parents=True, exist_ok=True)
        job = agents_state / "attach-fetch-cli.json"
        job.write_text(
            json.dumps({"campaign": "tropic-gooner", "missing": miss_job}, indent=2),
            encoding="utf-8",
        )
        script = Path(__file__).with_name("fetch_unresolved_attachments.py")
        proc = subprocess.run(
            [sys.executable, str(script), "--job", str(job), "--batch", "4"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=180,
        )
        line = (proc.stdout or "").strip().splitlines()[-1:] or ["{}"]
        try:
            discord_result = json.loads(line[-1])
        except json.JSONDecodeError:
            discord_result = {"ok": False, "message": (proc.stderr or proc.stdout or "")[:400]}
        try:
            job.unlink()
        except OSError:
            pass

    out = {
        "ok": True,
        "copied": copied,
        "already": already,
        "missing": missing,
        "skipped_non_image": skipped,
        "discord": discord_result,
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
