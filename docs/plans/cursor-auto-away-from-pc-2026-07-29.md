# Cursor away-from-PC → linuxbox (2026-07-29)

**Goal:** Use Cursor without the desktop PC staying online. Potato (linuxbox) stays always-on via Hermes free ticks. Cloud Agents do the Cursor-paid coding; Hermes keeps ops/lanes.

**Holder:** `cursor-auto-away`

**Sources:** [cursor.com/docs cloud-agent](https://cursor.com/docs/cloud-agent), [setup](https://cursor.com/docs/cloud-agent/setup), [automations](https://cursor.com/docs/cloud-agent/automations), [mobile](https://cursor.com/docs/cloud-agent/mobile), [security-network](https://cursor.com/docs/cloud-agent/security-network), [cli/headless](https://cursor.com/docs/cli/headless).

**Related:** `docs/plans/think-incident-form-recurrence-2026-07-29.md` §1 (Hermes owns detect/forms; Cursor Auto/IDE does cleanup fixes — no CLI on cron).

---

## Why (clarification)

- IDE **Auto** (Cursor Models / Composer pool) can feel near-unlimited on this plan; that is **not** the same billing as **Cloud Agents**.
- **Cloud Agents** run in isolated cloud VMs, are **API-priced**, need a **spend limit**, and **do not require the local IDE/PC** to be connected.
- Away work should be **Cloud Agents / Automations** (PC can sleep), not Hermes cronning Cursor CLI on potato.

---

## Docs answers (short)

| Question | Answer |
|----------|--------|
| Do Cloud Agents / Automations run without PC? | **Yes.** Isolated VMs; access via [cursor.com/agents](https://cursor.com/agents), Slack, GitHub `@cursor`, API, phone. Automations = scheduled/event-driven cloud agents. |
| Point at potato SSH or GitHub? | Cloud clones **SCM** (GitHub/GitLab). Workspace SoT = **`kineticdirt/Linuxbox`**. Not “Remote SSH into potato as the editor root.” |
| Phone vs cloud? | Phone = **control + review** of the **same** cloud agents (kick, follow, merge). No full editor/terminal on phone. |
| Hermes + Cursor CLI on 1m cron? | **Still no.** Hermes free always-on; Cursor Automations for rare schedules; CLI = manual one-shots only. |

---

## Recommended away path (5 bullets)

1. Connect GitHub **`kineticdirt/Linuxbox`** → Cloud Agents dashboard → snapshot env + secrets; optional `.cursor/environment.json` + `AGENTS.md` “Cursor Cloud” section.
2. Away work: [cursor.com/agents](https://cursor.com/agents) or phone → Cloud agent on that repo → PR; merge → PC/laptop `push-linuxbox-git-bundle` / deploy when convenient (potato stays online via Hermes).
3. If cloud must call potato live: Tailscale **userspace** (or CF Tunnel + Access secrets) in cloud env — never rely on PC Remote SSH.
4. Phone = kick/review only; don’t expect Remote Control to potato without a machine online.
5. Keep Hermes on free 1m ticks; use **cursor.com/automations** for rare Cursor schedules — not CLI cron.

---

## Path A (recommended): Cloud Agents on GitHub Linuxbox

Code SoT for cloud is the private GitHub repo, not the live potato checkout.

1. **Integrations:** Dashboard → connect GitHub; grant R/W on `kineticdirt/Linuxbox`.
2. **Environment:** Cloud Agents → Environments → select that repo; agent-led setup or Dockerfile; save snapshot.
3. **Secrets:** Only what cloud needs (no dump of `~/.hermes/.env` / dashboard `.env`). Prefer Runtime Secrets for tokens.
4. **Instructions (optional):** Add an `AGENTS.md` section *Cursor Cloud specific instructions* — remind: bundle deploy after merge, honor `agents/protected-runtime-paths.json`, never wipe `agents/state/**` / registries / chat-threads.
5. **Away loop:** cursor.com/agents or phone → Cloud → task → PR.
6. **Land on potato:** After merge, from a machine that *is* up: `bash scripts/pc/push-linuxbox-git-bundle.sh` (or laptop equivalent / `push-linuxbox.sh` for urgent paths). Never treat the cloud VM as potato runtime SoT.

Potato keeps running Hermes the whole time; the PC does not need to stay awake for the agent run itself — only for the eventual deploy/bundle if you don’t do that from laptop.

---

## Path B (optional): Cloud agent reaches potato services

Use when a cloud task must hit live potato APIs (Hub `:8790`, Pixi `:8767`, etc.), not for everyday code PRs.

- Install Tailscale in the cloud env with **userspace networking** (`tailscaled --tun=userspace-networking`) — Cursor docs support this; default TUN often won’t work in their VM.
- Or Cloudflare Tunnel + Access service tokens as Cursor Secrets.
- Allowlist domains if egress is restricted.
- Do **not** expose potato SSH to the public internet for this.

---

## Path C (not for “PC offline”): Remote Control / My Machines

- Tools run on **your** computer; that machine must stay awake/online.
- Fails the “PC can sleep” goal.
- Use only when laptop/desktop is intentionally left on (e.g. long local verify).

---

## Phone

- **iOS:** Cursor app (beta) → same cloud agents as web.
- **Android:** Chrome → [cursor.com/agents](https://cursor.com/agents) → Install PWA (native Android not out yet per docs at drafting time).
- Role: kick tasks, follow live, merge PRs. Configure secrets/env on **web** first.
- Pixel 3a / Hub PWA for ops reading stays separate (`abhinavall.net/Linuxbox/`) — that is dashboard, not Cursor editor.

---

## Automations vs Hermes vs Cursor CLI

| Surface | Role | Billing |
|---------|------|---------|
| **Hermes `think` / `fast`** | Always-on ops/lanes on potato (~2 GB) | Free-first OpenRouter |
| **cursor.com/automations** | Intentional schedule (hourly/daily) or PR/webhook | Cursor API (Cloud Agent rates) |
| **Cursor CLI on potato** (`agent -p --force --disable-auto-update`) | Manual / rare one-shots when human asks | Cursor API key |
| **IDE Auto on PC** | Interactive coding while at desk | Cursor Models / plan pools |

| OK | Avoid |
|----|-------|
| Automations: daily digest, PR review, webhook | `agent -p` on `agent-cycle-think` / `agent-cycle-fast` (1m) |
| Manual CLI one-shot on potato when human asks | Cursor replacing Hermes free always-on |
| Cloud agent PR on `Linuxbox` then bundle deploy | Treating cloud VM as live `~/agent-dump` runtime |

---

## Setup checklist (concrete)

- [ ] GitHub app: Cursor has R/W on `kineticdirt/Linuxbox`
- [ ] Cloud Agents env snapshot for that repo (deps install documented)
- [ ] Spend limit set for Cloud Agents (separate from IDE Auto feel)
- [ ] Optional Tailscale userspace or CF Access secrets **only if** live potato calls needed
- [ ] Phone/PWA logged into same Cursor account; secrets configured on web
- [ ] Deploy habit: merge → `push-linuxbox-git-bundle.sh` (PC or laptop) — potato never HTTPS-pulls private repo alone
- [ ] Confirm Hermes crons have **no** Cursor CLI invoke

**Phase 1 shipped (2026-07-29):** potato CLI lane via Hub Chat `cursor:auto` — see `docs/plans/hermes-cursor-agent-lane-2026-07-29.md`. Cloud checklist above remains Phase 2 (dashboard OAuth).

---

## Non-goals

- Do not shut down potato or Hermes for this plan.
- Do not put Cursor CLI on 1m ticks even if spend is comfortable.
- Do not race cloud agents against live Hermes ticks on the same board/flock without a branch/PR boundary.
- Exit-node / Tailscale internet diagnostics are a **separate** holder (`exit-node-internet-fix`) — do not mix fixes into this plan.
