#!/usr/bin/env python3
"""Generate agent-role-cluster tree + mem-constant templates/role-agents mirror."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(r"c:/Users/abhinav/Desktop/MAIN_PROGRAMMING_FILES/agent-role-cluster")
MC = Path(
    r"c:/Users/abhinav/Desktop/MAIN_PROGRAMMING_FILES/agent-dump"
    r"/src/mem_constant/templates/role-agents"
)

# Discipline / infra roles
ROLES = [
    {
        "id": "orchestrator",
        "name": "role-orchestrator",
        "title": "Role orchestrator",
        "description": (
            "Route build work to discipline roles, project agents, or android. "
            "Use when starting multi-role work or when the user asks for the role-agent cluster."
        ),
        "job": [
            "Read catalog.json (roles + projects + devices) and pick the smallest set.",
            "If the ask is a known product lane, prefer project-* over generic FE/BE.",
            "If scope is a new product with no project agent, invoke role-new-project first.",
            "Append ledger Intent with holder + roles/projects invoked.",
            "Dispatch parallel only when write surfaces do not collide.",
            "Merge results; one verify; one Result line.",
        ],
        "do_not": [
            "Implement everything yourself when a specialist fits",
            "Spawn all roles by default",
            "Invent a second SoT beside the project's docs/ledger",
        ],
    },
    {
        "id": "ui",
        "name": "role-ui",
        "title": "UI builder",
        "description": (
            "Visual system, layout, CSS, component chrome, density, dash_build. "
            "Use for Hub/panels look and structure, not deep interaction research."
        ),
        "job": [
            "Read docs/dashboard-ui-architecture.md when Hub.",
            "Touch only presentation: HTML structure, CSS families A-E, spacing, chrome.",
            "Bump dash_build when shipping Hub UI.",
            "Pair with role-ux for progressive disclosure / drawers.",
        ],
        "do_not": ["Rewrite as SPA", "Global input{} rules", "Invent API contracts"],
    },
    {
        "id": "ux",
        "name": "role-ux",
        "title": "UX / IA",
        "description": (
            "Information architecture, progressive disclosure, drawers/side sheets, "
            "click-through depth. Use when L0-L2 depth, NN/g patterns, or flow clarity."
        ),
        "job": [
            "Apply hub-ui-depth + hub-drawer-sheet skills when present.",
            "Prefer summary L1 then detail L2; side sheet on mobile; master-detail on desktop.",
            "Cite NN/g terms: Drawer Menu vs Side Sheet vs Dialog.",
            "Specify open/close/focus/scroll invariants before coding.",
            "Coordinate with role-android-pixel3a for phone-first flows.",
        ],
        "do_not": [
            "Duplicate silo nav as a second drawer menu",
            "Modal dialogs for long logs",
        ],
    },
    {
        "id": "frontend",
        "name": "role-frontend",
        "title": "Frontend engineer",
        "description": (
            "Client logic, state, fetch, event wiring, render loops. "
            "Use for JS/TS behavior in Hub or web UIs."
        ),
        "job": [
            "Preserve hubUserIsEditing / draft state; patch DOM don't wipe.",
            "Wire click to detail APIs; keep list payloads lean.",
            "Match existing JS style in the file you touch.",
        ],
        "do_not": ["Add frameworks without ask", "Full innerHTML rebuild on poll"],
    },
    {
        "id": "backend",
        "name": "role-backend",
        "title": "Backend engineer",
        "description": (
            "HTTP APIs, server JS/Python, persistence contracts. "
            "Use for /api/*, stores, auth gates."
        ),
        "job": [
            "Extend existing server modules; smallest endpoint surface.",
            "Admin/loopback gates consistent with siblings.",
            "Return related logs/reports for task detail without dumping into list GET.",
        ],
        "do_not": ["Wipe runtime state files", "Commit secrets"],
    },
    {
        "id": "cicd",
        "name": "role-cicd",
        "title": "CI/CD",
        "description": (
            "Smoke tests, Playwright gates, supply-chain SAFE check, pipeline wiring. "
            "Use when verify loops or automation gates."
        ),
        "job": [
            "One concrete verify per change (smoke/curl/pytest).",
            "SAFE-gate before package upgrades (safe-update-check.sh).",
            "Extend existing smoke harnesses; fail loud.",
        ],
        "do_not": ["Skip verify", "Auto-upgrade on HOLD"],
    },
    {
        "id": "devops",
        "name": "role-devops",
        "title": "DevOps / host ops",
        "description": (
            "systemd, crons, potato deploy, swap/storage, process health. "
            "Use for linuxbox host ops and push-linuxbox."
        ),
        "job": [
            "Evidence on the right machine (potato vs PC).",
            "Protect agents/state/** ; use linuxbox-push agent for deploys.",
            "chmod +x scripts after bundle; no CRLF breaks.",
        ],
        "do_not": ["Claim UP without curl evidence", "Blind overwrite potato runtime"],
    },
    {
        "id": "cloud",
        "name": "role-cloud",
        "title": "Cloud / edge infra",
        "description": (
            "Cloudflare tunnels/Access, Tailscale, DNS, public vs LAN exposure. "
            "Use for edge routing and remote access."
        ),
        "job": [
            "Prefer existing tunnel units; never run deprecated installers.",
            "Pixi stays Tailscale/LAN — not public abhinavall.",
            "Document before changing DNS/Access.",
        ],
        "do_not": ["Put secrets in chat or git", "Expose Hub without Access+Basic"],
    },
    {
        "id": "new-project",
        "name": "role-new-project",
        "title": "New project scaffolder",
        "description": (
            "Create a new project-* agent + catalog entry when scope demands a dedicated lane. "
            "Use when no existing project agent fits and the work will recur."
        ),
        "job": [
            "Confirm with GM: project id (kebab), one-line purpose, primary paths, verify command.",
            "Run scripts/new-project-agent.py (or write files matching its template).",
            "Add agents/projects/project-<id>.md, update catalog.json projects[] + dispatch_hints.",
            "Regenerate mem-constant mirror via scripts/pc/gen-role-agent-cluster.py when dogfooding.",
            "Ledger Intent/Result; do not invent product requirements beyond the scaffold.",
        ],
        "do_not": [
            "Create a project agent for a one-off typo fix",
            "Overwrite an existing project-* without ask",
            "Put secrets in the scaffold",
        ],
    },
    {
        "id": "android-pixel3a",
        "name": "role-android-pixel3a",
        "title": "Android Pixel 3a (legacy reader)",
        "description": (
            "Pixel 3a on legacy Android as light remote reader/ops surface. "
            "Use for Hub/map PWA, Tailscale, JuiceSSH, mobile UX constraints — not Telegram."
        ),
        "job": [
            "Target: Pixel 3a — Tailscale + Chrome PWAs; optional JuiceSSH; no Telegram dependency.",
            "Hub: https://abhinavall.net/Linuxbox/ (Access + Basic); public Intel at /Intel/.",
            "Map: https://map.tableslop.org/ — touch targets, drawers, no desktop-only chrome.",
            "Pixi: Tailscale/LAN HTTPS preferred for Secure Context / PWA; not public CF.",
            "Prefer mobile side sheets / Back over crushed multi-column layouts (≤720px).",
            "Document phone runbooks under docs/agents/android-tailscale-interface.md when changing access.",
            "Verify with Playwright mobile emulation and/or real-device notes — not desktop-only screenshots.",
        ],
        "do_not": [
            "Assume modern Android APIs or Play-only flows",
            "Ship desktop-only Hub chrome as phone-ready",
            "Put Discord/Telegram as the required phone ops path",
            "Expose Pixi on public abhinavall.net",
        ],
    },
]

# Product / campaign lanes (expandable via role-new-project)
PROJECTS = [
    {
        "id": "hub",
        "name": "project-hub",
        "title": "Linuxbox Hub",
        "description": (
            "Ops Hub /Linuxbox/ (:8790) — Tasks depth, Inbox, Chat, Docs, Meta, Systems. "
            "Use for dashboard click-through, Active Now, dash_build, protected runtime."
        ),
        "paths": [
            "scripts/linuxbox/linuxbox-status/",
            "scripts/linuxbox/linuxbox-status-server.js",
            "docs/dashboard-ui-architecture.md",
            "docs/plans/hub-clickthrough-depth-2026-08-11.md",
        ],
        "pair": ["ux", "ui", "frontend", "backend", "cicd", "android-pixel3a"],
        "verify": "bash scripts/linuxbox/run-dashboard-ui-smoke.sh ; curl :8790 → 200",
        "do_not": [
            "Wipe agents/state/chat-threads or human-inbox answered[]",
            "Add global input{} CSS",
            "Embed map.tableslop as Hub SoT",
        ],
    },
    {
        "id": "tableslop",
        "name": "project-tableslop",
        "title": "tableslop / Isla Primavera",
        "description": (
            "map.tableslop.org + worldeditor + campaigns.tableslop. "
            "Use for map, regions-ui, cast, Discord OAuth, /world, /3d."
        ),
        "paths": [
            "scripts/linuxbox/tableslop-server.js",
            "scripts/linuxbox/tableslop-static/",
            "campaigns/tropic-gooner/map/",
            "docs/plans/tableslop-dual-app-roadmap-2026-08-01.md",
        ],
        "pair": ["frontend", "backend", "devops", "cicd", "android-pixel3a"],
        "verify": "tableslop-gm-borders-guard + curl :8765/:8768 200; never wipe regions-ui",
        "do_not": [
            "Clear or ellipse-stub GM regions-ui.json",
            "Push map binaries every tiny edit — milestones only",
            "Hard-delete GM cast without ask",
        ],
    },
    {
        "id": "pixi",
        "name": "project-pixi",
        "title": "Pixi RP",
        "description": (
            "Pixi RP continuity engine (:8767 linuxbox-pixi-rp). "
            "Use for Send pipeline, WORLD_DELTA, sheets, hygiene, OpenRouter-only."
        ),
        "paths": [
            "docs/pixi/",
            "~/pixi-rp/ObsidianWriterStack (potato)",
            "scripts/pc/deploy-pixi-linuxbox.sh",
        ],
        "pair": ["backend", "frontend", "ux", "devops", "android-pixel3a"],
        "verify": "curl Tailscale/LAN :8767 200; no public CF route",
        "do_not": [
            "Share Hermes OpenRouter key with Pixi env",
            "Load GGUF on potato",
            "Force Laguna over explicit model pick",
        ],
    },
    {
        "id": "portfolio",
        "name": "project-portfolio",
        "title": "abhinavall.net portfolio",
        "description": (
            "Public portfolio/blog (v8-brutalist-map). "
            "Use for sites/abhinavall.net, staging redesign, Playwright portfolio smoke."
        ),
        "paths": [
            "sites/abhinavall.net/",
            ".staging/portfolio-redesign/",
            "docs/cloudflare-tunnels-linuxbox.md",
        ],
        "pair": ["ui", "frontend", "cicd", "cloud"],
        "verify": "npm test / portfolio-smoke; preview before production deploy",
        "do_not": [
            "Auto-deploy AI blog to production without ask",
            "Remove background watermark",
        ],
    },
    {
        "id": "mazda3",
        "name": "project-mazda3",
        "title": "Mazda3 garage build",
        "description": (
            "Hub Garage / mazda3 parts and build tracking. "
            "Use for parts.json, EV-swap notes, garage silo."
        ),
        "paths": [
            "projects/mazda3-sports-build/",
            "agents/user-tasks.json (mazda3 project)",
        ],
        "pair": ["frontend", "backend", "hub"],
        "verify": "Hub Garage renders parts; /api/user-tasks shows mazda3",
        "do_not": ["Invent part fitment without GM note"],
    },
    {
        "id": "infranet",
        "name": "project-infranet",
        "title": "Infranet",
        "description": (
            "Spare/garage compute marketplace (not LLM hosting). "
            "Use for docs/infranet + projects/infranet PoC."
        ),
        "paths": [
            "docs/infranet/",
            "projects/infranet/",
        ],
        "pair": ["backend", "cloud", "devops"],
        "verify": "Docs tree scopes infranet + infranet-eng; brief build script if touched",
        "do_not": ["Mint a currency", "Conflate with LLM-token metering"],
    },
    {
        "id": "euro-adventure",
        "name": "project-euro-adventure",
        "title": "Euro Adventure 2026 D&D",
        "description": (
            "Euro campaign tree + Discord ingest (separate from Tropic/Hunter). "
            "Use for campaigns/euro-adventure-2026 worldbuilding and bot allowlists."
        ),
        "paths": [
            "campaigns/euro-adventure-2026/",
            "docs/agents/discord-hunter-linuxbox.md",
        ],
        "pair": ["backend", "devops"],
        "verify": "campaign paths exist; Discord scope documented; no token print",
        "do_not": ["Merge Euro into tropic-gooner SoT", "Log DISCORD_BOT_TOKEN"],
    },
    {
        "id": "nyc-mafia",
        "name": "project-nyc-mafia",
        "title": "NYC Mafia × D&D",
        "description": (
            "NYC Mafia × D&D setting (campaigns/nyc-mafia-dnd). "
            "Use for worldbuilding prose, Docs surfaces, not Discord-required SoT."
        ),
        "paths": ["campaigns/nyc-mafia-dnd/"],
        "pair": ["hub"],
        "verify": "SETTING* docs coherent; soft-archive to _trash not hard-delete",
        "do_not": ["Assert exact calendar year", "Gunpowder guns — capsule arms only"],
    },
]


def when_text(desc: str) -> str:
    if "Use " in desc:
        return desc.split("Use ", 1)[1]
    return desc


def agent_md(r: dict) -> str:
    job = "\n".join(f"{i}. {x}" for i, x in enumerate(r["job"], 1))
    dont = "\n".join(f"- {x}" for x in r["do_not"])
    return (
        f"---\n"
        f"name: {r['name']}\n"
        f"description: >-\n"
        f"  {r['description']}\n"
        f"---\n\n"
        f"# {r['title']} (`{r['id']}`)\n\n"
        f"Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. "
        f"Catalog: `catalog.json`.\n\n"
        f"## Job\n\n{job}\n\n"
        f"## Do not\n\n{dont}\n\n"
        f"## Pairing\n\n"
        f"- Skill: `.cursor/skills/role-cluster/SKILL.md`\n"
        f"- Upstream: https://github.com/kineticdirt/agent-role-cluster\n"
        f"- Install: `mem-constant init --with-role-agents`\n"
    )


def project_md(p: dict) -> str:
    paths = "\n".join(f"- `{x}`" for x in p["paths"])
    pair = ", ".join(f"`{x}`" for x in p["pair"])
    dont = "\n".join(f"- {x}" for x in p["do_not"])
    return (
        f"---\n"
        f"name: {p['name']}\n"
        f"description: >-\n"
        f"  {p['description']}\n"
        f"---\n\n"
        f"# {p['title']} (`project:{p['id']}`)\n\n"
        f"Product-lane subagent. Expand this lane; pair discipline roles as needed.\n"
        f"New lanes: invoke `role-new-project`.\n\n"
        f"## Scope paths\n\n{paths}\n\n"
        f"## Pair with\n\n{pair}\n\n"
        f"## Verify\n\n{p['verify']}\n\n"
        f"## Do not\n\n{dont}\n\n"
        f"## Pairing\n\n"
        f"- Skill: `.cursor/skills/role-cluster/SKILL.md`\n"
        f"- Upstream: https://github.com/kineticdirt/agent-role-cluster\n"
    )


SKILL = """---
name: role-cluster
description: >-
  Programmatic role-agent cluster (UI, UX, Frontend, Backend, CI/CD, DevOps,
  Cloud, Orchestrator, Android Pixel 3a) plus project-* lane agents and
  role-new-project scaffolder. Use when dispatching specialist Cursor agents.
---

# Role-agent cluster

## Purpose

Callable **specialists** + **project lanes** with `catalog.json` so orchestrators
can spawn the right agent without a monolith prompt.

## Install

```bash
mem-constant init --with-role-agents --yes
mem-constant init --with-role-agents --role-agents-repo https://github.com/kineticdirt/agent-role-cluster.git --yes
```

Lands under:

- `.cursor/agents/roles/` — discipline + android + new-project
- `.cursor/agents/projects/` — product lane agents
- `.cursor/skills/role-cluster/`
- `.mem-constant/role-agents/catalog.json`

## Dispatch

1. Read `.mem-constant/role-agents/catalog.json`.
2. Prefer `projects[]` when the ask names a product (Hub, tableslop, Pixi, …).
3. Else match discipline `roles[]` / `dispatch_hints`.
4. Pixel / phone / PWA / JuiceSSH → `android-pixel3a` (+ ux).
5. No project fits but work will recur → `role-new-project`.
6. One verify per domain; orchestrator merges.

## New project

```bash
python scripts/new-project-agent.py --id my-lane --title "My Lane" --purpose "…"
```

Or invoke the `role-new-project` agent.

## Hub depth example

`project-hub` + `ux` + `ui` + `frontend` + `backend` + `cicd` + `android-pixel3a`.
"""

README = """# agent-role-cluster

Programmatic **role** + **project** Cursor subagents (pullable SoT for mem-constant).

## Includes

- Discipline: UI, UX, Frontend, Backend, CI/CD, DevOps, Cloud, Orchestrator
- Device: **Android Pixel 3a** (legacy OS reader / PWA / Tailscale)
- Projects: Hub, tableslop, Pixi, portfolio, mazda3, infranet, euro-adventure, nyc-mafia
- **role-new-project** — scaffold a new `project-*` when scope demands it

## Install

```bash
mem-constant init --with-role-agents --yes
```

## New project agent

```bash
python scripts/new-project-agent.py --id cool-app --title "Cool App" \\
  --purpose "Use for Cool App feature work." --path apps/cool-app/
```

## License

MIT
"""

NEW_PROJECT_SCRIPT = '''#!/usr/bin/env python3
"""Scaffold a new project-* agent and append catalog.json."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    ap = argparse.ArgumentParser(description="Create project-<id> agent + catalog entry")
    ap.add_argument("--id", required=True, help="kebab-case project id")
    ap.add_argument("--title", required=True)
    ap.add_argument("--purpose", required=True, help="description / when-to-use sentence")
    ap.add_argument("--path", action="append", default=[], help="scope path (repeatable)")
    ap.add_argument("--pair", default="frontend,backend,cicd", help="comma role ids")
    ap.add_argument("--verify", default="one concrete smoke/curl for this lane")
    ap.add_argument("--force", action="store_true")
    ns = ap.parse_args()

    pid = ns.id.strip().lower().replace("_", "-")
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,40}", pid):
        raise SystemExit("id must be kebab-case [a-z][a-z0-9-]{1,40}")

    name = f"project-{pid}"
    agents_dir = ROOT / "agents" / "projects"
    agents_dir.mkdir(parents=True, exist_ok=True)
    out = agents_dir / f"{name}.md"
    if out.exists() and not ns.force:
        raise SystemExit(f"exists: {out} (use --force)")

    paths = ns.path or [f"projects/{pid}/"]
    pair = [x.strip() for x in ns.pair.split(",") if x.strip()]
    desc = ns.purpose if ns.purpose.startswith("Use ") else f"{ns.purpose} Use for {ns.title} lane work."
    body = f"""---
name: {name}
description: >-
  {desc}
---

# {ns.title} (`project:{pid}`)

Product-lane subagent. Created by `scripts/new-project-agent.py`.

## Scope paths

{chr(10).join(f'- `{p}`' for p in paths)}

## Pair with

{", ".join(f"`{p}`" for p in pair)}

## Verify

{ns.verify}

## Do not

- Expand scope past this lane without GM ask
- Commit secrets

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
"""
    out.write_text(body, encoding="utf-8")

    catalog_path = ROOT / "catalog.json"
    cat = json.loads(catalog_path.read_text(encoding="utf-8"))
    projects = cat.setdefault("projects", [])
    projects = [p for p in projects if p.get("id") != pid]
    projects.append(
        {
            "id": pid,
            "agent": f"agents/projects/{name}.md",
            "cursor_path": f".cursor/agents/projects/{name}.md",
            "tags": ["project", pid],
            "when": desc,
            "pair": pair,
        }
    )
    cat["projects"] = projects
    hints = cat.setdefault("dispatch_hints", {})
    hints[pid] = [pid] + pair
    catalog_path.write_text(json.dumps(cat, indent=2) + "\\n", encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}")
    print(f"updated catalog.json projects ({len(projects)} total)")


if __name__ == "__main__":
    main()
'''

PLUGIN = {
    "name": "agent-role-cluster",
    "version": "0.2.0",
    "description": "Role + project Cursor agents (Hub, tableslop, Pixi, Pixel 3a, …).",
    "author": {"name": "kineticdirt"},
    "license": "MIT",
    "keywords": ["agents", "roles", "projects", "android", "devops", "ux"],
}

LICENSE = """MIT License

Copyright (c) 2026 kineticdirt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""


def build_catalog() -> dict:
    return {
        "version": 2,
        "name": "agent-role-cluster",
        "repo": "https://github.com/kineticdirt/agent-role-cluster",
        "install": {
            "cursor_agents_dir": ".cursor/agents/roles",
            "cursor_projects_dir": ".cursor/agents/projects",
            "cursor_skills_dir": ".cursor/skills",
            "mem_constant_flag": "--with-role-agents",
        },
        "roles": [
            {
                "id": r["id"],
                "agent": f"agents/{r['name']}.md",
                "cursor_path": f".cursor/agents/roles/{r['name']}.md",
                "tags": [r["id"]],
                "when": when_text(r["description"]),
            }
            for r in ROLES
        ],
        "projects": [
            {
                "id": p["id"],
                "agent": f"agents/projects/{p['name']}.md",
                "cursor_path": f".cursor/agents/projects/{p['name']}.md",
                "tags": ["project", p["id"]],
                "when": when_text(p["description"]),
                "pair": p["pair"],
            }
            for p in PROJECTS
        ],
        "devices": [
            {
                "id": "pixel3a",
                "agent": "agents/role-android-pixel3a.md",
                "model": "Pixel 3a",
                "notes": "Legacy Android; Tailscale + Chrome PWA + JuiceSSH; Hub/map reader",
            }
        ],
        "dispatch_hints": {
            "hub_clickthrough": ["hub", "ux", "ui", "frontend", "backend", "cicd", "android-pixel3a"],
            "potato_deploy": ["devops", "cicd"],
            "tunnel_dns": ["cloud", "devops"],
            "api_only": ["backend", "cicd"],
            "phone_pwa": ["android-pixel3a", "ux", "hub"],
            "tableslop": ["tableslop", "frontend", "backend", "cicd"],
            "pixi": ["pixi", "backend", "frontend", "android-pixel3a"],
            "new_lane": ["new-project", "orchestrator"],
        },
    }


def write_tree(base: Path, *, full_repo: bool) -> None:
    agents = base / "agents"
    projects = agents / "projects"
    agents.mkdir(parents=True, exist_ok=True)
    projects.mkdir(parents=True, exist_ok=True)
    (base / "skills" / "role-cluster").mkdir(parents=True, exist_ok=True)

    # remove stale role-only files we no longer emit? keep additive
    for r in ROLES:
        (agents / f"{r['name']}.md").write_text(agent_md(r), encoding="utf-8")
    for p in PROJECTS:
        (projects / f"{p['name']}.md").write_text(project_md(p), encoding="utf-8")

    (base / "catalog.json").write_text(json.dumps(build_catalog(), indent=2) + "\n", encoding="utf-8")
    (base / "skills" / "role-cluster" / "SKILL.md").write_text(SKILL, encoding="utf-8")

    if full_repo:
        (base / ".cursor-plugin").mkdir(parents=True, exist_ok=True)
        (base / "scripts").mkdir(parents=True, exist_ok=True)
        (base / "README.md").write_text(README, encoding="utf-8")
        (base / "LICENSE").write_text(LICENSE, encoding="utf-8")
        (base / ".cursor-plugin" / "plugin.json").write_text(
            json.dumps(PLUGIN, indent=2) + "\n", encoding="utf-8"
        )
        (base / ".gitignore").write_text(".DS_Store\n*.pyc\n__pycache__/\n", encoding="utf-8")
        script = base / "scripts" / "new-project-agent.py"
        # fix escaped newline in catalog write from template
        script.write_text(NEW_PROJECT_SCRIPT.replace("\\\\n", "\\n"), encoding="utf-8")


def main() -> None:
    write_tree(ROOT, full_repo=True)
    write_tree(MC, full_repo=False)
    print(f"wrote {ROOT} roles={len(ROLES)} projects={len(PROJECTS)}")
    print(f"wrote {MC}")


if __name__ == "__main__":
    main()
