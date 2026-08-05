# Cursor cloud agents → linuxbox sync



**Cloud agents:** [Cursor on web and mobile](https://cursor.com/blog/agent-web) at **https://cursor.com/agents** — run tasks while away, review diffs/PRs, PWA on phone.



**linuxbox** is the deployment target. The PC is not always on. This doc is the **git path** cloud agents use; PC SCP is the **binary/secret path**.



**Repo:** **`github.com/kineticdirt/Linuxbox`** branch **`main`** — **not** mem-constant (that's the versioned memory-tool package). See `docs/repo-split-linuxbox-memconstant.md`.



## Two sync lanes



| Lane | Who runs it | What moves | Services restart |

|------|-------------|------------|------------------|

| **Git auto-deploy** | linuxbox every ~30s | After push to Linuxbox `main` | `apply-git-bundle.sh` (PC drops bundle) or `git-pull-and-deploy.sh` if deploy key |

| **PC SCP push** | Desktop when online | Gitignored map binaries, urgent pre-push bundles | `push-linuxbox.sh` |



Cloud agents **cannot** SSH to Tailscale `potato`. They **commit + push to Linuxbox**; linuxbox pulls and **swarm-dispatch** may run queued tasks.



## Cloud agent workflow



1. Open **https://cursor.com/agents** (PWA on Pixel — see Cursor docs).

2. Point the agent at **`github.com/kineticdirt/Linuxbox`** branch **`main`**.

3. Give a task; let it finish.

4. **Commit + push to `main`** (or open PR → merge).

5. On linuxbox within ~30–60s:

   - `git-pull-and-deploy.sh` pulls + restarts dashboard/tableslop if needed

   - `swarm-dispatch.sh` runs any `ready` tasks in `agents/swarm-queue.json`

6. Back on PC: review in Cursor IDE; optional `push-linuxbox.sh --finished` for gitignored assets.



## Swarm handoff (optional)



Add a task to `agents/swarm-queue.json` in the same commit:



```json

{

  "id": "task-<unix>",

  "status": "ready",

  "source": "cursor-cloud",

  "expert": "cloud",

  "goal": "One verifiable step on linuxbox after your code push",

  "priority": 60,

  "created_at": "<ISO8601>"

}

```



See `docs/agents/swarm-moe-linuxbox.md`.



## Agent instructions (paste into cloud agent task)



```text

Repo: github.com/kineticdirt/Linuxbox branch main (NOT mem-constant).

Deployment target is linuxbox (potato), not this machine.

When done:

1. Commit all changed tracked files.

2. Push to origin main.

3. Optionally enqueue a ready task in agents/swarm-queue.json (source=cursor-cloud).

4. Do NOT claim linuxbox deployed — box auto-pulls within ~30s.

5. Gitignored map binaries need PC push-tableslop-map.sh — say so in PR body.

6. Append [PC] intent to AI_GROUPCHAT.md in the commit.

```



## PC bundle sync (private repo — box has no GitHub creds)

After cloud agent or PC pushes to **Linuxbox** `main`:

```bash
bash scripts/pc/push-linuxbox-git-bundle.sh
```

Optional: `bash scripts/pc/publish-linuxbox-repo.sh` (bulk publish) · `bash scripts/pc/push-linuxbox.sh --finished` (SCP binaries)

Add a read-only **deploy key** on potato later for direct `git pull`.



## One-time: git on linuxbox



```bash

ssh potato 'bash ~/agent-dump/scripts/linuxbox/bootstrap-agent-dump-git.sh'

ssh potato 'bash ~/agent-dump/scripts/linuxbox/repoint-agent-dump-remote.sh'

```



## Verify



```bash

bash ~/agent-dump/scripts/linuxbox/git-pull-and-deploy.sh

bash ~/agent-dump/scripts/linuxbox/swarm-dispatch.sh --dry-run

```



## Related



- `docs/repo-split-linuxbox-memconstant.md`

- `docs/agents/swarm-moe-linuxbox.md`

- `.cursor/agents/linuxbox-push.md`


