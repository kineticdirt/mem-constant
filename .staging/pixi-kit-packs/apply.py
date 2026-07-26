#!/usr/bin/env python3
"""Apply kit-permanence + decide-don't-ask + injection packs to the live Pixi tree.

Idempotent: each patch checks for its own marker and skips if already applied.
Run from anywhere; paths are absolute off $HOME.
"""
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
CHAT_UI = Path.home() / "pixi-rp/ObsidianWriterStack/PixiApp/chat-ui"
AUG = CHAT_UI / "static/session_turn_augment.mjs"
APP = CHAT_UI / "static/app.js"
MOUNT = CHAT_UI / "static/pixi_augment_mount.mjs"
INDEX = CHAT_UI / "static/index.html"
SERVER = CHAT_UI / "server.py"

REV = "20260725-kit-packs-v1"
changed = []


def read(p):
    return p.read_text(encoding="utf-8")


def write(p, s):
    p.write_text(s, encoding="utf-8")
    changed.append(str(p))


# --- 1. salvage: clothing changes overwrite, gear lands in inventory ----------
src = read(AUG)
if "Clothing CHANGE beats must overwrite" in src:
    print("skip: salvage already patched")
else:
    anchor = """      if (wearM && !String(row.current_outfit || "").trim()) {
        patch.current_outfit = String(wearM[1] || "")
          .replace(/\\s+/g, " ")
          .trim()
          .slice(0, 160);
      }
"""
    if anchor not in src:
        sys.exit("FAIL: salvage anchor not found in session_turn_augment.mjs")
    src = src.replace(anchor, read(HERE / "kit_salvage.js"), 1)
    print("ok: salvage overwrite + gear capture")

# --- 2. present-cast-state: demand deltas on kit change ----------------------
if "Kit changes must be recorded the turn they happen" in src:
    print("skip: cast-state header already patched")
else:
    header_anchor = (
        '    "[Present cast \u2014 current state / clothing / body / kit]",\n'
        '    "Honor **Wearing now**, **Appearance**, **Inventory**, and worn/held object rows.",\n'
    )
    if header_anchor not in src:
        sys.exit("FAIL: cast-state header anchor not found")
    new_header = read(HERE / "cast_state_header.js")
    # replacement file restates the two anchor lines plus the surrounding originals
    old_full_start = src.index(header_anchor)
    old_full_end = src.index('    "",\n', old_full_start) + len('    "",\n')
    src = src[:old_full_start] + new_header + src[old_full_end:]
    print("ok: cast-state kit-delta demand")

# --- 3. injection packs registry --------------------------------------------
if "export const INJECTION_PACKS" in src:
    print("skip: packs registry already present")
else:
    src = src.rstrip("\n") + "\n" + read(HERE / "packs_registry.js")
    print("ok: injection packs registry appended")

write(AUG, src)

# --- 4. app.js: decide block + packs layer ----------------------------------
app = read(APP)
if "buildDecisionCommitBlock" in app:
    print("skip: app.js already patched")
else:
    app_anchor = "  /** Proxy-only: core scenario system + siloed layers"
    if app_anchor not in app:
        sys.exit("FAIL: app.js payload anchor not found")
    packs_fn = '''  function buildInjectionPacksInjectionBlock() {
    if (!session || !session.rpg || inSetupWindow()) return "";
    const ST = getSessionTurnAugment();
    if (!ST || !ST.buildInjectionPacksSystemBlock) return "";
    // Relevance is judged against the live beat: the last few turns of prose.
    const msgs = Array.isArray(session.messages) ? session.messages : [];
    const recent = [];
    for (let i = msgs.length - 1; i >= 0 && recent.length < 3; i--) {
      const m = msgs[i];
      if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
      recent.push(String(m.content || ""));
    }
    let composer = "";
    try {
      composer = el && el.input ? String(el.input.value || "") : "";
    } catch (_e) {
      composer = "";
    }
    const text = (composer + "\\n" + recent.join("\\n")).slice(0, 8000);
    return ST.buildInjectionPacksSystemBlock(session, { text: text });
  }

'''
    app = app.replace(
        app_anchor, read(HERE / "decide_block.js") + "\n" + packs_fn + app_anchor, 1
    )
    layer_anchor = '    pushLayer("direction_contract", buildDirectionContractBlock());\n'
    if layer_anchor not in app:
        sys.exit("FAIL: app.js pushLayer anchor not found")
    app = app.replace(
        layer_anchor,
        layer_anchor
        + '    pushLayer("decision_commit", buildDecisionCommitBlock());\n'
        + '    pushLayer("injection_packs", buildInjectionPacksInjectionBlock());\n',
        1,
    )
    write(APP, app)
    print("ok: app.js decide block + packs layer")

# --- 5. cache-bust the module graph -----------------------------------------
mount = read(MOUNT)
if REV not in mount:
    import re

    mount = re.sub(
        r'(session_turn_augment\.mjs\?v=)[^"]+', r"\g<1>" + REV, mount
    )
    write(MOUNT, mount)
    print("ok: mount ?v= bumped")

idx = read(INDEX)
if REV not in idx:
    import re

    idx = re.sub(r'(pixi_augment_mount\.mjs\?v=)[^"\']+', r"\g<1>" + REV, idx)
    write(INDEX, idx)
    print("ok: index.html ?v= bumped")

# --- 6. server revision ------------------------------------------------------
srv = read(SERVER)
if REV not in srv:
    import re

    new_srv, n = re.subn(
        r'(CHAT_API_REVISION\s*=\s*")[^"]+(")', r"\g<1>" + REV + r"\g<2>", srv, count=1
    )
    if n:
        write(SERVER, new_srv)
        print("ok: CHAT_API_REVISION -> " + REV)
    else:
        print("warn: CHAT_API_REVISION not found")

print("\nchanged files:")
for c in changed:
    print("  " + c)
