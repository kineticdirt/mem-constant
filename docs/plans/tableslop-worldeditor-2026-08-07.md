# Tableslop world tools — separate World dashboard (revised 2026-08-08 GM correction)

**Holder:** `tableslop-admin-hud` / `tableslop-worldeditor`  
**Campaign:** tropic-gooner / Isla Primavera  
**Replaces / folds:** `tableslop-chars-stories-migrate`, `tableslop-cast-dashboard`, content-makers UI home

## GM locks (mandatory — 2026-08-08)

| Lock | Rule |
|------|------|
| **Map stays the map** | The map remains the play surface, but the **character-editing surface is a wholly separate dedicated page** (`/world`) — larger/readable sheets, WoD fit, additions, notes. No piddly HUD panel for character work. |
| **Admin / owner** | Get edit chrome on the map for borders/coords **and** the separate `/world` dashboard for characters. |
| **Observers / `role=user`** | Viewing only + **their player character** stuff. **No** edit chrome for borders, places, world SoT, or `/world`. |
| **Anonymous** | Public map view + Login. No edit. |

**UX north star:** map = play surface; **World click opens `/world` as a full page**, not an overlay.

## Auth (live on potato)

- Discord OAuth + roles `owner` / `admin` / `user` — see `docs/tableslop-discord-auth.md`.
- Server enforces edits via `editGate` → 401/403 on mutating APIs.
- Client mirrors with `can_edit` from `GET /api/me` (hide Draw / Edit / World / Users for non-editors).

| Role | Map view | Edit borders/coords | `/world` character studio | Users panel | Own PC link |
|------|----------|---------------------|-------------------|-------------|-------------|
| anon | yes | no | no | no | no |
| `user` | yes | no | no | no | yes (if Discord-linked in registry) |
| `admin` | yes | yes | yes | no | yes if linked |
| `owner` | yes | yes | yes | yes | yes if linked |

## Surface shape (separate World page)

```text
https://map.tableslop.org/                    ← default — always the map
https://map.tableslop.org/world               ← separate full-page character studio (owner/admin)
https://map.tableslop.org/worldeditor         ← legacy alias → 302 /world (owner/admin)
https://map.tableslop.org/#cast/<id>          ← Cast side panel (view for all; edit hints admin-only)
```

HUD (admin/owner only): **Edit** · **Draw borders** · **World → /world** · (owner) **Users**  
HUD (user): Login→Logout · **My char** (when linked) · Cast/Phone/Radio/Sim view  
HUD (anon): **Login** · view map

`/world` is the dedicated world editor dashboard: **Cast** (roster, large rendered sheet, WoD fit checklist, notes/additions, relations, portrait pick), **Places** (places/orgs/schools/factions/years backed by `wiki/entities.json`), and **Stories & notes** (whitelisted campaign markdown editor). Writes go through version-checked/locked persistence (`characters-registry.json` base_version + lock + revision backup; `entities.json` version + lock + revision backup; markdown pages sha256 conflict check + `.bak`). No Hub Chars escape hatch on tableslop.

## World page modules (v1 — `/world`)

Opened from HUD **World** as a separate page:

1. **Cast** — roster + large rendered sheet + edit fields/notes/relations; admin merge/upload stays Hub-side only, not linked from tableslop
2. **Places** — ✅ place/org/school/faction/year editor → `wiki/entities.json` (version + lock + revision backup)
3. **Stories & notes** — ✅ whitelisted campaign markdown editor (`story/`, `worldbuilding/`, `reports/`, `places/`, `characters/`, `Things and Places of Note/`, `Plot Lines/`) with sha256 conflict check
4. **Quests** — later (needs a structured quest SoT; do not invent quest debt for former PCs)
5. **Questions** — covered as world docs until/unless a structured pack SoT is wanted
6. *(later)* Highways / traffic, orgs deep editor, years

Hub Chars/Stories: **copy + link** — Hub remains; map World tools are play/GM home for Isla.

## Phased build

| Phase | Deliverable |
|-------|-------------|
| **O0** | ✅ OAuth env live + login smoke |
| **H1** | ✅ HUD role chrome: hide edit tools for `user`/anon; World chip links to separate page |
| **W1** | ✅ `/world` full-page world editor; `/worldeditor` → `/world`; old map World panel removed |
| **W2** | Chars tools parity bits vs Hub (upload/merge shortcuts) — Hub stays separate, not linked |
| **W3** | ✅ Stories & notes markdown surface |
| **W4** | ✅ Places editor; Quests maker still pending structured SoT |
| **W5** | Questions/templates/bak undo (questions currently editable as world docs) |

## Standing locks

- Registry multitask lock; soft-hide only; no invent faces  
- `wb-tg-factions`: no former-PC questgivers  
- Potato owns `characters-registry.json` + `wiki/` + `regions-ui.json` (GM borders sacred — read-only unless GM asks)  

## Superseded (do not re-open without GM)

- ~~World tools as a small map HUD panel for character editing~~ (GM rejected 2026-08-08: wants a wholly separate page)
- ~~Separate top-level `/cast` + `/stories` as default product routes~~ (Cast dock on map is fine)
