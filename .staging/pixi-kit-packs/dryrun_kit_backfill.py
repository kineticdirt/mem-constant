#!/usr/bin/env python3
"""Dry-run kit backfill for session c5409afe — write nothing, print proposals."""
from __future__ import annotations

import json
import re
from pathlib import Path

SESSION = Path.home() / (
    "pixi-rp/ObsidianWriterStack/PixiApp/chat-ui/sessions/"
    "c5409afe-0bca-4dce-89f3-3d9d6469f511.json"
)

ALIASES = {
    "mia": ["mia", "mia chen"],
    "emily": ["emily", "lin mei", "lin-mei"],
}
ID_MAP = {
    "mia": "npc:mia",
    "emily": "npc:lin-mei",
}

CHANGE_RE = re.compile(
    r"\b(?:changes?\s+into|changed\s+into|pulls?\s+on|pulled\s+on|puts?\s+on|put\s+on|"
    r"slips?\s+into|slipped\s+into|swaps?\s+(?:into|to)|dresses?\s+in|now\s+wearing|"
    r"tugs?\s+on|shrugs?\s+into|steps?\s+into|steps?\s+out\s+wearing|"
    r"emerges?\s+(?:a moment later,\s+)?(?:dressed|wearing))\s+"
    r"(?:a\s|an\s|the\s|her\s|his\s|their\s|\*\*)?([^.!?\n*]{4,120})",
    re.I,
)
WEAR_RE = re.compile(
    r"\b(?:wearing|dressed in|in a|in an|in her|in his)\s+([^.!?\n]{6,90})",
    re.I,
)
GEAR_RE = re.compile(
    r"\b(?:equips?|equipped|straps?\s+on|slings?|slung|holsters?|sheathes?|"
    r"shoulders?|dons?|buckles?\s+on)\s+(?:a\s|an\s|the\s|her\s|his\s|their\s)?"
    r"([A-Za-z][A-Za-z0-9 \-']{2,48})",
    re.I,
)
BOLD_OUTFIT = re.compile(r"now\s+wearing\s+\*\*([^*]{4,160})\*\*", re.I)


def clean(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip(" .,*;:—-*")
    return s[:160]


def main() -> None:
    sess = json.loads(SESSION.read_text(encoding="utf-8"))
    people = ((sess.get("rpg") or {}).get("observed_world") or {}).get("people") or {}
    msgs = sess.get("messages") or []
    results = {k: {"outfit_history": [], "final_outfit": None, "gear": []} for k in ALIASES}

    for i, m in enumerate(msgs):
        if not m or m.get("role") != "assistant":
            continue
        prose = str(m.get("content") or "")
        if len(prose) < 40:
            continue
        prose_low = prose.lower()

        for bm in BOLD_OUTFIT.finditer(prose):
            ctx = prose[max(0, bm.start() - 200) : bm.end() + 20]
            who = None
            if re.search(r"(?i)\bemily\b|\blin\s*mei\b", ctx):
                who = "emily"
            elif re.search(r"(?i)\bmia\b", ctx):
                who = "mia"
            if who:
                outfit = clean(bm.group(1))
                results[who]["outfit_history"].append(
                    {
                        "msg": i,
                        "kind": "change-bold",
                        "text": outfit,
                        "snip": re.sub(r"\s+", " ", ctx)[-140:],
                    }
                )
                results[who]["final_outfit"] = outfit

        for key, names in ALIASES.items():
            for nm in names:
                idx = 0
                while True:
                    name_idx = prose_low.find(nm, idx)
                    if name_idx < 0:
                        break
                    window = prose[
                        max(0, name_idx - 40) : min(len(prose), name_idx + len(nm) + 200)
                    ]
                    cm = CHANGE_RE.search(window)
                    wm = WEAR_RE.search(window)
                    outfit = None
                    kind = None
                    if cm:
                        outfit = clean(cm.group(1))
                        kind = "change"
                    elif wm and results[key]["final_outfit"] is None:
                        outfit = clean(wm.group(1))
                        kind = "wear-fill"
                    if outfit and len(outfit) >= 4:
                        low = outfit.lower()
                        if not low.startswith(("the front", "you ", "that ", "like ")):
                            results[key]["outfit_history"].append(
                                {
                                    "msg": i,
                                    "kind": kind,
                                    "text": outfit,
                                    "snip": re.sub(r"\s+", " ", window)[:140],
                                }
                            )
                            if kind == "change":
                                results[key]["final_outfit"] = outfit
                            elif results[key]["final_outfit"] is None:
                                results[key]["final_outfit"] = outfit
                    for gm in GEAR_RE.finditer(window):
                        gname = clean(gm.group(1))
                        gname = re.sub(
                            r"\s+(?:and|then|before|after|while|as)$",
                            "",
                            gname,
                            flags=re.I,
                        )
                        if len(gname) >= 3:
                            if re.search(
                                r"sword|knife|blade|gun|pistol|rifle|shotgun|bat|axe|"
                                r"machete|crowbar|weapon|revolver",
                                gname,
                                re.I,
                            ):
                                slot = "weapon"
                            elif re.search(
                                r"vest|armor|armour|plate|helmet|pads|guard|jacket|kevlar",
                                gname,
                                re.I,
                            ):
                                slot = "armor"
                            else:
                                slot = "gear"
                            results[key]["gear"].append(
                                {"msg": i, "name": gname[:60], "slot": slot}
                            )
                    idx = name_idx + len(nm)

    print("=== DRY-RUN KIT BACKFILL (write nothing) ===")
    print(f"session: c5409afe  messages: {len(msgs)}")
    print()
    for key in ("mia", "emily"):
        sid = ID_MAP[key]
        row = people.get(sid) or {}
        cur = (row.get("current_outfit") or "")[:80]
        r = results[key]
        print(f"## {key}  ->  {sid}")
        print(f"  current on disk: {cur!r}")
        print(f"  WOULD SET outfit: {r['final_outfit']!r}")
        for h in r["outfit_history"][-10:]:
            print(f"    msg#{h['msg']:3d} [{h['kind']:12s}] {h['text'][:100]}")
        seen: set[str] = set()
        gears = []
        for g in r["gear"]:
            k = g["name"].lower()
            if k in seen:
                continue
            seen.add(k)
            gears.append(g)
        if gears:
            print(f"  WOULD ADD inventory ({len(gears)}):")
            for g in gears[:10]:
                print(f"    - {g['name']} ({g['slot']}) from msg#{g['msg']}")
        else:
            print("  gear: (none matched)")
        print()

    # Highlight known strong beats
    for i in (78, 84, 86, 94, 96):
        if i >= len(msgs) or (msgs[i] or {}).get("role") != "assistant":
            continue
        t = str(msgs[i].get("content") or "")
        lines = [
            ln.strip()
            for ln in t.splitlines()
            if re.search(
                r"(?i)wear|change|outfit|jeans|camisole|bodysuit|hoodie|sleep shirt|tank|leggings",
                ln,
            )
        ]
        if not lines:
            continue
        print(f"--- msg#{i} key lines ---")
        for ln in lines[:10]:
            print(" ", ln[:150])
        print()


if __name__ == "__main__":
    main()
