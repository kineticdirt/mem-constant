# Tableslop World — verify / issue-finding plan (2026-08-12)

**Role:** `role-cicd` · **Scope:** World vertical slice **M1** (2D roads/overlays + phone dial matrix + weather tick + board→World writeback).  
**Hard locks:** **NEVER** mutate / SCP / regenerate `campaigns/tropic-gooner/map/regions-ui.json`. `/3d` shelved — do not gate M1 on 3D smokes.  
**Mode:** PLAN ONLY. Do not run long Playwright suites unless a check is trivial (`node` self-check / curl / one assert).  
**SoT bugs/features:** `projects/tableslop/dev-calendar.json` · friction: `agents/papercuts.md` · usage: `docs/agents/papercuts.md`.

---

## 1. Phone dial matrix → `dev-calendar.json`

Dial classes map to product bugs/features. Failures from smoke or manual probe **file into** the matching id (do not invent parallel trackers).

| Dial class | Example input | Expected product behavior (M1+) | Current engine reality (`phone-responder.js`) | Maps to `dev-calendar` |
|---|---|---|---|---|
| **911 / emergency** | keypad `911` (and aliases if added) | Diegetic dispatch tree: ringback/hold, triage script, location from World pins; **not** generic not-in-service | `lookupNumber` has **no** emergency intercept — unknown digits → `type: "dead"` / NOT_IN_SERVICE | **Bug:** `bug-phone-no-911` · **Feat:** `feat-phone-911` · Timeline: `tl-phone-911-voice` |
| **Non-emergency** | `555-0110` (Paradisio CRT) | Logged municipal line; distinct script from 911 and from contacts | `type: "intercept"` via `INTERCEPTS["555-0110"]` | Assert **pass** when intercept text/status present. Regression → new `bug-phone-non-emergency-*` or reopen related bug; keep tied to `feat-phone-911` notes (non-emergency split) |
| **Contact** | any seeded contact number / `data-contact-id` call | Pickup or voicemail per `force=` / availability; mid-call reply | `type: "contact"`; smoke already walks harbormaster / night-ledger | Audio realism still **Bug:** `bug-phone-beep-only-audio` · **Feat:** `feat-phone-voice-pc` (do not confuse with dial routing) |
| **Dead / unknown** | `555-0999` / `5550999` | Explicit not-in-service / OPERATOR recording | `type: "dead"`; smoke status `OPERATOR` | Baseline OK. If dead numbers start connecting as contacts → new high bug. Intake gap for matrix coverage: **Bug:** `bug-issue-finding-gap` |

### Filing rules for dial failures

1. **Routing wrong** (911→dead, contact→dead, dead→contact) → `bugs[]` in `dev-calendar.json` (prefer reopen/extend `bug-phone-no-911` for emergency; new id only if orthogonal).
2. **Audio only beeps** while routing correct → stay on `bug-phone-beep-only-audio` (not a new dial bug).
3. **Harness missing a class** → keep `bug-issue-finding-gap` open until §2 tests land; then mark fixed with holder.
4. **Agent friction** (smoke path tribal, GPU screenshot flake) → papercut `pc-*` lane `tableslop`, not a product bug.

### Trivial verify (allowed without full UI smoke)

```bash
node --input-type=module -e "import { lookupNumber } from './scripts/tableslop/phone-responder.js';
  const cases = [['911','want-emergency'],['5550110','intercept'],['5550999','dead']];
  for (const [n,label] of cases) console.log(n, label, lookupNumber(n).type);"
```

Expect today: `911` → `dead` (documents `bug-phone-no-911`); `5550110` → `intercept`; `5550999` → `dead`. Contact: pick one id from engine contacts and assert `type === "contact"`.

---

## 2. Extend `.staging/tableslop-phone` smoke (test list — not rewrite)

**Existing** (`smoke.mjs`): contacts → mid-call → recents/spam → keypad unknown (`5550999` OPERATOR) → intercept (`5550170`) → voicemail → mobile mid-call. Fail on console/pageerror.

**Add** (minimal cases; reuse `statusIs`, keypad digit clicks, fixed `date=`):

| ID | Case | Steps (sketch) | Assert | On fail file |
|---|---|---|---|---|
| P-911 | Emergency dial | Keypad `9`,`1`,`1` → Call | Prefer: dispatch/emergency status **≠** generic NOT_IN_SERVICE once `feat-phone-911` lands. **Until then:** assert current broken contract explicitly (`OPERATOR` / dead) **or** `test.skip` with comment linking `bug-phone-no-911` — do not silently PASS as “working 911” | `bug-phone-no-911` |
| P-NEM | Non-emergency | Keypad `5550110` → Call | Status OPERATOR (or dedicated non-emergency label); intercept copy mentions CRT / logged | new bug or `feat-phone-911` notes |
| P-CON | Contact | Keep one existing contact path (harbormaster) as **matrix anchor** — tag comment `dial-matrix:contact` | CONNECTED or VOICEMAIL under `force=` | existing contact bugs only if regression |
| P-DEAD | Dead number | Keep `5550999` path; tag `dial-matrix:dead` | OPERATOR + not-in-service recording path | regression bug |
| P-AUD | Optional soft check | After any CONNECTED call | Document beep-only: no requirement to fail smoke on missing TTS until voice spike | `bug-phone-beep-only-audio` |

**Do not:** rewrite server harness, expand to full HUD embed, touch regions-ui, or require potato deploy for local matrix.

**Close criteria for `bug-issue-finding-gap`:** P-911 + P-NEM + P-CON + P-DEAD present in smoke (even if P-911 is xfail/skip until feat lands).

---

## 3. 2D overlay smoke checklist (manual / short Playwright)

**Target:** map 2D working SoT (`tl-2d-working-sot`). **Out of scope:** `/3d`, `regions-ui` Draw/Save, `sync-overlay-coords.mjs --apply`, ellipse regen.

| # | Check | Pass | Fail → |
|---|---|---|---|
| O1 | Highways/roads visible on 2D (green freeway/highway overlay or equivalent layer) | Visible stroke without opening 3D | `dev-calendar` bug under 2D SoT / new `bug-2d-roads-invisible` |
| O2 | Overlay toggles (roads / wind / water / logistics — whichever chips exist) | Each toggle flips visibility; no full-page navigation | papercut if unlabeled; bug if state desync |
| O3 | 3D HUD overlay toggle (if still present) | Overlay iframe or layer only; **does not** navigate away as product SoT | regression vs `tl-3d-toggle` |
| O4 | Areas/pins readable with overlays on | Pins stay at label coords; no agent drag | pin bugs stay on `bug-pin-localstorage` class |
| O5 | **No regions-ui mutation** | Before/after: do **not** write `regions-ui.json`. Optional: `bash scripts/linuxbox/tableslop-gm-borders-guard.sh` (read-only compare) must still PASS if run | **STOP** — never “fix” by rewriting borders |
| O6 | Deploy/SCP hygiene | Map binary / overlay asset push must **exclude** regions-ui (default `push-tableslop-map` behavior) | papercut + guard |

**Trivial preflight:** `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/` (or potato) expect 200 — not a substitute for O1–O5.

---

## 4. Weather tick determinism self-check plan

**Module:** `scripts/linuxbox/tableslop-world-weather.js` (`generateWeatherState` seeded by `seed` + `diegetic_date` + city id).  
**Existing smokes (do not expand here):** `smoke-world-weather.js`, `smoke-world-weather-ui.mjs` — run only when weather code changes.

### Self-check plan (deterministic, no LLM)

1. **Pure generate twice:** same `{ seed, diegetic_date, forecast_days }` → city `current` + `forecast[]` deep-equal **excluding** `updated_at`.
2. **Date driver:** bump `diegetic_date` by +1 day → at least one city field changes (proves clock coupling).
3. **Seed driver:** change seed, same date → distribution changes (not identical snapshot).
4. **Advance action:** if API `POST /api/world/weather` advance/+1 exists — after tick, re-read state; second generate with stored seed+new date matches file (ignore `updated_at`).
5. **Phenomenon bag (when implemented):** TTL/decay bag at T influences T+1; same bag+seed → same next weather; document assert once code lands (canvas w3d).
6. **Lock:** writes use multitask lock `world-weather:tropic-gooner` — self-check must not race parallel agents; prefer generate-in-memory over write.

**Suggested one-liner shape (implement later, not now):**

```text
node -e "require('./scripts/linuxbox/tableslop-world-weather.js')" // or ESM import
  generate A = generateWeatherState(dir, { seed:'isla-primavera-weather', diegetic_date:'2019-05-14', forecast_days:7 })
  generate B = same opts
  assert stripUpdated(A) === stripUpdated(B)
```

Fail → `dev-calendar` weather bug + prevent papercut if harness missing.

---

## 5. Board resolve → World delta assert pattern

**Product intent (World canvas):** GM/admin action/thread board resolves a branch; **mandatory writeback** into World SoT (not chat-only).

### Assert pattern (contract for implementers + CI)

```text
GIVEN fixture board thread T with open node N
WHEN  resolve(N, choice=C)  // API or UI
THEN  World SoT changes:
  - response includes world_delta (or equivalent) with op list
  - persisted World artifact(s) updated (weather / place note / entity / board index — per op type)
  - GET World summary (or targeted GET) reflects delta
  - re-resolve same N is idempotent or rejected (no silent double-apply)
  - audit: actor role admin|owner; user role denied
NEVER touch regions-ui as part of board resolve
```

### Minimal verify matrix

| Step | Check |
|---|---|
| B1 | Resolve returns structured delta (ids, op kinds, target paths) — not prose-only |
| B2 | Diff World file(s) / version field before vs after (hash or `version` bump) |
| B3 | Board node status = resolved; thread graph edge records C |
| B4 | Replay: second resolve → 409/no-op with same SoT hash |
| B5 | Negative: observer/`user` cannot write World |

**Fixture policy:** gobbledygook / throwaway campaign note under test dir — never live GM borders or potato registry wipe.

Until board API exists: keep this as the **acceptance harness sketch**; file gaps as `feat-*` / `bug-*` in `dev-calendar`, not papercuts.

---

## 6. Papercut vs bug vs feat intake

| Kind | Where | Use when | Example |
|---|---|---|---|
| **Papercut** `pc-YYYY-MM-DD-slug` | `agents/papercuts.md` | Agent/ops friction, recurring harness cost, misleading labels — **not** player-facing product defects | Headless Chromium needs `--disable-gpu` for phone screenshots; smoke path tribal knowledge |
| **Bug** `bug-*` | `projects/tableslop/dev-calendar.json` → `bugs[]` | Player/GM-visible broken behavior on map/phone/world | `bug-phone-no-911`, `bug-phone-beep-only-audio` |
| **Feat** `feat-*` | same → `features[]` (+ timeline `tl-*` when scheduled) | New capability / intentional work item | `feat-phone-911`, `feat-phone-voice-pc` |

### Decision tree

1. Broken **user-visible** behavior → **bug** (link related **feat** in notes if the “fix” is really “build the feature”).
2. Missing capability never promised as done → **feat** (optional companion **bug** if current UX lies, e.g. dialing 911 looks like a call but is dead).
3. Only agents/lanes hurt → **papercut**.
4. Needs human product choice → Hub inbox / chat — **not** a silent papercut.
5. Dial-matrix coverage missing → `bug-issue-finding-gap` until §2 lands; harness flake → papercut.

**Do not** duplicate the same issue in all three. Cross-link ids in notes (`Tracked feat-phone-911`).

---

## 7. CI / local gate order — vertical slice M1

**M1 definition (World, 2026-08):** 2D roads/overlays readable + toggles; weather generate deterministic; phone dial matrix harness present; board→World assert pattern documented/stubbed; **regions-ui untouched**; `/3d` not required.

### Gate order (fail loud; stop on first red)

| Order | Gate | Command / action | Machine |
|---|---|---|---|
| **G0** | Regions-ui sacred | Do **not** open write paths. Optional read-only: `bash scripts/linuxbox/tableslop-gm-borders-guard.sh` | PC or potato |
| **G1** | Phone engine self-check | Existing `phone-responder.js` self-check / trivial `lookupNumber` matrix (§1) | local PC |
| **G2** | Phone dial-matrix smoke (extended) | `node .staging/tableslop-phone/smoke.mjs` — **after** §2 adds P-911/P-NEM tags; skip full run in plan-only sessions | local PC |
| **G3** | Weather determinism | In-memory double-generate self-check (§4); API smoke only if weather touched | PC; potato if API |
| **G4** | 2D overlay checklist | §3 O1–O5 against local `:8765` or potato — short; no regions-ui write | PC preferred for iterate |
| **G5** | Board→World contract | Unit/API fixture for B1–B5 when board lands; until then document-only PASS with explicit “stub” | — |
| **G6** | Issue intake | New failures filed per §6 into `dev-calendar` / papercuts; append `[PC]` Result to `AI_GROUPCHAT.md` | PC |
| **G7** | Deploy (milestone only) | `push-tableslop-map` / server restart **without** regions-ui; never auto on every change | potato |

### Explicit non-gates for M1

- Full `/3d` Playwright (`.staging/tableslop-3d`) — shelved.
- `regions-ui` Draw/Save / vert-count “improvements”.
- Voice TTS naturalness A/B (`feat-phone-voice-pc`) — spike later; beep-only stays open bug.
- SAFE-gate upgrades — only if M1 pulls a package bump (`safe-update-check.sh` → SAFE).

---

## Closeout checklist (when executing later)

- [ ] Dial matrix cases green or xfail-linked to `bug-phone-no-911`
- [ ] `bug-issue-finding-gap` closable
- [ ] Weather double-generate identical (sans `updated_at`)
- [ ] 2D roads visible + toggles; guard still PASS
- [ ] Board pattern has fixture or explicit stub deferral in `dev-calendar`
- [ ] Zero writes to `regions-ui.json`

**Prevention:** any M1 verify PR/checklist that includes “regenerate borders” or `/3d` as required is out of policy — reject.
