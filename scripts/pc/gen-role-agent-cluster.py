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

ROLES = [
    {
        "id": "orchestrator",
        "name": "role-orchestrator",
        "title": "Role orchestrator",
        "description": (
            "Route build work to UI/UX/FE/BE/CI/DevOps/Cloud role agents. "
            "Use when starting multi-role work or when the user asks for the role-agent cluster."
        ),
        "job": [
            "Read catalog.json and pick the smallest set of roles for the ask.",
            "Append ledger Intent with holder + roles invoked.",
            "Dispatch parallel only when roles do not share the same write surface.",
            "Merge results; one verify; one Result line.",
        ],
        "do_not": [
            "Implement everything yourself when a specialist fits",
            "Spawn all roles by default",
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
]


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


def when_text(desc: str) -> str:
    if "Use " in desc:
        return desc.split("Use ", 1)[1]
    return desc


CATALOG = {
    "version": 1,
    "name": "agent-role-cluster",
    "repo": "https://github.com/kineticdirt/agent-role-cluster",
    "install": {
        "cursor_agents_dir": ".cursor/agents/roles",
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
    "dispatch_hints": {
        "hub_clickthrough": ["ux", "ui", "frontend", "backend", "cicd"],
        "potato_deploy": ["devops", "cicd"],
        "tunnel_dns": ["cloud", "devops"],
        "api_only": ["backend", "cicd"],
    },
}

SKILL = """---
name: role-cluster
description: >-
  Programmatic role-agent cluster (UI, UX, Frontend, Backend, CI/CD, DevOps,
  Cloud, Orchestrator). Use when dispatching specialist Cursor agents for
  build/infra work, or when mem-constant --with-role-agents is installed.
---

# Role-agent cluster

## Purpose

Callable **specialist subagents** with a machine-readable `catalog.json` so
orchestrators (and humans) can spawn the right role without a monolith prompt.

## Install

```bash
mem-constant init --with-role-agents
# optional refresh from GitHub:
mem-constant init --with-role-agents --role-agents-repo https://github.com/kineticdirt/agent-role-cluster.git --yes
```

Lands under:

- `.cursor/agents/roles/*.md`
- `.cursor/skills/role-cluster/`
- `.mem-constant/role-agents/catalog.json` (pointer copy)

## Dispatch

1. Read `.mem-constant/role-agents/catalog.json` (or package catalog).
2. Match ask → `dispatch_hints` or role `when` text.
3. Invoke Cursor Task / agent with the matching `role-*` file.
4. One verify per role's domain; orchestrator merges.

## Hub depth example

Click-through Tasks L2 → roles **ux** (sheet/IA) + **ui** (chrome) + **frontend** (wire) + **backend** (detail API) + **cicd** (smoke).

## Related Hub skills (agent-dump)

- `hub-ui-depth` · `hub-drawer-sheet` · `hub-dashboard-builder`
"""

README = """# agent-role-cluster

Programmatic **role subagents** for Cursor (and mem-constant install): UI, UX,
Frontend, Backend, CI/CD, DevOps, Cloud, plus an orchestrator.

## Why

Build work needs specialists you can **call**, not one mega-prompt. This repo is
the pullable SoT; **mem-constant** scaffolds it into projects via
`--with-role-agents`.

## Layout

```text
agents/                 # Cursor subagent markdown (role-*.md)
skills/role-cluster/    # How to dispatch
catalog.json            # Machine-readable role index + dispatch_hints
.cursor-plugin/         # Optional Cursor plugin manifest
```

## Install into a project

```bash
mem-constant init --with-role-agents --yes
```

Or clone this repo and copy `agents/` → `.cursor/agents/roles/`.

## GitHub remote

```bash
gh repo create kineticdirt/agent-role-cluster --public --source=. --remote=origin --push
# or create empty repo in the UI, then:
git remote add origin git@github.com:kineticdirt/agent-role-cluster.git
git push -u origin main
```

## License

MIT
"""

PLUGIN = {
    "name": "agent-role-cluster",
    "version": "0.1.0",
    "description": "Role specialist Cursor agents: UI, UX, FE, BE, CI/CD, DevOps, Cloud.",
    "author": {"name": "kineticdirt"},
    "license": "MIT",
    "keywords": ["agents", "roles", "devops", "ux", "cicd"],
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


def write_tree(base: Path, *, full_repo: bool) -> None:
    (base / "agents").mkdir(parents=True, exist_ok=True)
    (base / "skills" / "role-cluster").mkdir(parents=True, exist_ok=True)
    for r in ROLES:
        (base / "agents" / f"{r['name']}.md").write_text(agent_md(r), encoding="utf-8")
    (base / "catalog.json").write_text(json.dumps(CATALOG, indent=2) + "\n", encoding="utf-8")
    (base / "skills" / "role-cluster" / "SKILL.md").write_text(SKILL, encoding="utf-8")
    if full_repo:
        (base / ".cursor-plugin").mkdir(parents=True, exist_ok=True)
        (base / "README.md").write_text(README, encoding="utf-8")
        (base / "LICENSE").write_text(LICENSE, encoding="utf-8")
        (base / ".cursor-plugin" / "plugin.json").write_text(
            json.dumps(PLUGIN, indent=2) + "\n", encoding="utf-8"
        )
        (base / ".gitignore").write_text(".DS_Store\n*.pyc\n__pycache__/\n", encoding="utf-8")


def main() -> None:
    write_tree(ROOT, full_repo=True)
    write_tree(MC, full_repo=False)
    print(f"wrote {ROOT} ({len(ROLES)} roles)")
    print(f"wrote {MC}")


if __name__ == "__main__":
    main()
