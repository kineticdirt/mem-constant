# NYC worldbuilding artifacts

**Campaign:** `nyc-mafia-dnd` only.  
**Locks:** `LOCKS.md` · **Plans:** `docs/plans/nyc-worldbuilding-thought-loop-2026-07-31.md`

## Flow

```text
SoT SETTING-*.md + LOCKS.md
        ↓
Phase A — dialectic draft (thesis/antithesis/synthesis)
        ↓
Phase B — GM gate (Workshop / drip steer / ledger lock)
        ↓
Phase C — detail fill (§C grammar + ward)
        ↓
Phase D — vignettes (NSFW allowed, measured)
        ↓
Promote → story/ (human only)
```

## Directories

| Path | Purpose |
|------|---------|
| `strokes/` | Broad strokes + justification; `status: draft \| locked \| superseded` |
| `details/` | Device/place fills after lock |
| `vignettes/<stroke-slug>/` | Self-contained proof stories |
| `drip/` | Steer-option packs when GM picks drip direction |
| `legacy-reskin/` | Period reskins of superseded potato `reports/` |

## Tick checklist

Hermes think lane reads **`worldbuilding/progress.md`** (not `reports/progress.md` on potato).

Prep scaffold (no LLM):

```bash
bash scripts/linuxbox/nyc-worldbuilding-scaffold.sh --fork <slug> --type dialectic|detail|vignette|drip-steer
```

Optional burst:

```bash
bash scripts/linuxbox/cursor-agent-run.sh "NYC worldbuilding: …"   # cursor:auto when key present
```

## Read order (agents)

1. `LOCKS.md`
2. `SETTING-PROHIBITION-MAGIC.md` → `SETTING-MAGITECH-DIVERGENCE.md` → `SETTING-ANCESTRIES-WARDS.md`
3. `worldbuilding/strokes/*locked*`
4. `worldbuilding/progress.md` — first open `[ ]`

## Hub Workshop

Paste a stroke draft; ask for harder antithesis. Lock with ledger: `[GM] Stroke locked: <slug>`.

## Index — era-law / ward-visibility pack (E-7)

| Artifact | Path | Canon | Promote gate |
|----------|------|-------|--------------|
| Era + law strokes | `strokes/era-law-pack.md` | **locked** | Canon — `LOCKS.md` B1–B8 |
| Ward visibility dialectic | `strokes/ward-visibility-draft.md` | **draft** | Pairs locked B2/C2; lock via Workshop or drip **B** |
| Bootleg salon detail | `details/era-law-pack-bootleg-salons.md` | **draft-dependent** | Expand on drip **A**; no `story/` without GM |
| Era-law vignettes ×3 | `vignettes/era-law-pack/` | **draft-dependent** | Proof scenes; human-only `story/` promote |
| Legacy reskin batch 1 | `legacy-reskin/INDEX.md` | **in progress** | 5 done; batch 2 queued — mine hooks only |
| Drip steer | `drip/2026-08-01-post-era-law-vignettes-steer.md` | **open** | **Idle until GM picks A \| B \| C** |

Mirror row also in `reports/README.md` (potato legacy index).

### Promote gate (human only)

1. **`story/`** — GM explicit only; Hermes never auto-promotes.
2. **Locked stroke** — agents read `strokes/era-law-pack.md` + `LOCKS.md` before improvising law/era.
3. **Draft-dependent** detail/vignettes — ok for think ticks and Workshop; headers carry `draft-dependent: true`.
4. **Next drip** — blocked until ledger `[GM] Drip: A|B|C` or checkbox in steer file.

**Phase E v1** complete when `progress.md` E-7 is checked; lane idles until drip pick or GM re-opens.
