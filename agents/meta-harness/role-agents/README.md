# Meta-Harness · role-agents

Live harness SoT for the role/project cluster.

| File | Role |
|------|------|
| `catalog.json` | Machine index (roles · projects · devices · dispatch_hints) |

Injected by:

- `scripts/linuxbox/role-agents-inject.py`
- `scripts/linuxbox/think-setup-context.py`
- `scripts/linuxbox/cursor-agent-run.sh`

Upstream: https://github.com/kineticdirt/agent-role-cluster  
Refresh: copy `catalog.json` from upstream (or `python scripts/pc/gen-role-agent-cluster.py` then copy).
