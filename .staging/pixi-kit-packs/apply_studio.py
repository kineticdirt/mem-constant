#!/usr/bin/env python3
"""Add Studio pin/mute UI for injection packs + last-fired tracking."""
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
CHAT_UI = Path.home() / "pixi-rp/ObsidianWriterStack/PixiApp/chat-ui"
INDEX = CHAT_UI / "static/index.html"
APP = CHAT_UI / "static/app.js"
CSS = CHAT_UI / "static/styles.css"
MOUNT = CHAT_UI / "static/pixi_augment_mount.mjs"
SERVER = CHAT_UI / "server.py"

REV = "20260725-kit-packs-v2"
changed = []


def read(p):
    return p.read_text(encoding="utf-8")


def write(p, s):
    p.write_text(s, encoding="utf-8")
    changed.append(str(p))


# --- 1. HTML -----------------------------------------------------------------
html = read(INDEX)
if 'id="packsPanel"' in html:
    print("skip: packs panel HTML already present")
else:
    marker = '            <div class="lab-form" id="labForm">'
    if marker not in html:
        sys.exit("FAIL: labForm marker missing")
    html = html.replace(marker, read(HERE / "studio_packs_html.html") + "\n" + marker, 1)
    # bump index mount query if present
    html = re.sub(r'(pixi_augment_mount\.mjs\?v=)[^"\']+', r"\g<1>" + REV, html)
    write(INDEX, html)
    print("ok: studio packs HTML")

# --- 2. CSS ------------------------------------------------------------------
css = read(CSS)
if ".packs-panel" in css:
    print("skip: packs CSS already present")
else:
    write(CSS, css.rstrip() + "\n\n" + read(HERE / "studio_packs.css") + "\n")
    print("ok: studio packs CSS")

# --- 3. app.js: studio UI + last-fired + el.userInput fix --------------------
app = read(APP)
if "renderInjectionPacksUi" in app:
    print("skip: packs UI JS already present")
else:
    # Fix composer reference (was el.input — wrong)
    app = app.replace(
        "composer = el && el.input ? String(el.input.value || "") : \"\";",
        "composer = el && el.userInput ? String(el.userInput.value || \"\") : \"\";",
    )
    # Also handle if escaped differently
    app = app.replace(
        'composer = el && el.input ? String(el.input.value || "") : "";',
        'composer = el && el.userInput ? String(el.userInput.value || "") : "";',
    )

    old_block = '''  function buildInjectionPacksInjectionBlock() {
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
      composer = el && el.userInput ? String(el.userInput.value || "") : "";
    } catch (_e) {
      composer = "";
    }
    const text = (composer + "\\n" + recent.join("\\n")).slice(0, 8000);
    return ST.buildInjectionPacksSystemBlock(session, { text: text });
  }
'''
    # Find function by start marker and replace through closing brace of function
    start = app.find("  function buildInjectionPacksInjectionBlock()")
    if start < 0:
        sys.exit("FAIL: buildInjectionPacksInjectionBlock not found")
    # find next function after this one
    next_fn = app.find("\n  /** Proxy-only:", start)
    if next_fn < 0:
        next_fn = app.find("\n  function buildForegroundChatSystemPayload()", start)
    if next_fn < 0:
        sys.exit("FAIL: could not locate end of packs block")
    new_block = '''  function buildInjectionPacksInjectionBlock() {
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
      composer = el && el.userInput ? String(el.userInput.value || "") : "";
    } catch (_e) {
      composer = "";
    }
    const text = (composer + "\\n" + recent.join("\\n")).slice(0, 8000);
    const ctx = { text: text };
    if (typeof ST.selectInjectionPackIds === "function") {
      try {
        session.rpg._last_injection_packs = ST.selectInjectionPackIds(session, ctx);
      } catch (_sel) {
        session.rpg._last_injection_packs = [];
      }
    }
    return ST.buildInjectionPacksSystemBlock(session, ctx);
  }

'''
    app = app[:start] + new_block + app[next_fn:]

    # Insert studio UI helpers before initEntityLabUi
    init_marker = "  function initEntityLabUi() {"
    if init_marker not in app:
        sys.exit("FAIL: initEntityLabUi not found")
    app = app.replace(init_marker, read(HERE / "studio_packs_js.js") + "\n" + init_marker, 1)

    # Call init + render on studio page
    app = app.replace(
        '    if (name === "studio") updateLabKindFields();',
        '    if (name === "studio") {\n'
        "      updateLabKindFields();\n"
        "      renderInjectionPacksUi();\n"
        "    }",
        1,
    )
    app = app.replace(
        "  initEntityLabUi();",
        "  initEntityLabUi();\n  initInjectionPacksUi();",
        1,
    )
    # Refresh packs UI after loadSession succeeds
    load_ok = "      hideSendPipelineFrame();\n"
    if load_ok in app and "renderInjectionPacksUi();" not in app[app.find("async function loadSession") : app.find("async function loadSession") + 2500]:
        app = app.replace(
            "      hideSendPipelineFrame();\n",
            "      hideSendPipelineFrame();\n"
            "      try {\n"
            "        renderInjectionPacksUi();\n"
            "      } catch (_packs) {}\n",
            1,
        )

    write(APP, app)
    print("ok: app.js packs UI + last-fired")

# --- 4. cache bust + revision ------------------------------------------------
mount = read(MOUNT)
if REV not in mount:
    mount = re.sub(r'(session_turn_augment\.mjs\?v=)[^"]+', r"\g<1>" + REV, mount)
    write(MOUNT, mount)
    print("ok: mount ?v=")

srv = read(SERVER)
if REV not in srv:
    srv2, n = re.subn(
        r'(CHAT_API_REVISION\s*=\s*")[^"]+(")', r"\g<1>" + REV + r"\g<2>", srv, count=1
    )
    if n:
        write(SERVER, srv2)
        print("ok: CHAT_API_REVISION -> " + REV)
    else:
        print("warn: revision not found")

print("\nchanged:")
for c in changed:
    print(" ", c)
