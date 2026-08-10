# scripts/linuxbox

On-box installers and ops scripts for potato (`~/agent-dump`).

## CRLF / Windows line endings (shared note)

PC checkouts and SCP can leave `\r` on `.sh` files. On linuxbox that becomes
`/bin/bash^M` (bad interpreter) or systemd `203/EXEC`.

**Before the first run of any `install-*.sh` on the box** (or after a Windows-side
edit), strip CR:

```bash
# one file
sed -i 's/\r$//' scripts/linuxbox/install-foo.sh

# whole tree (preferred after SCP / dirty sync)
find scripts/linuxbox -name '*.sh' -type f -exec sed -i 's/\r$//' {} +
chmod +x scripts/linuxbox/*.sh scripts/linuxbox/lib/*.sh 2>/dev/null || true
```

Automated paths (do not re-document this paragraph inside each installer):

- PC deploy: `scripts/pc/fix-sh-crlf-remote.sh` (called from `push-linuxbox.sh --finished`)
- Bundle apply: `scripts/linuxbox/apply-git-bundle.sh` (find+sed after chmod)

Installers may keep a one-line `sed -i 's/\r$//'` for a sibling script they
invoke; point humans here instead of pasting this block again.
