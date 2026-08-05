# NYC worldbuilding — pre-decision brief

**Purpose:** Define every meaningful fork **before** you choose — not to pick for you. Use this when sitting down to lock the Prohibition-magic frame and wire the thought loop.

**Sources:** `docs/plans/nyc-worldbuilding-thought-loop-2026-07-31.md` · `campaigns/nyc-mafia-dnd/SETTING-PROHIBITION-MAGIC.md` · `SETTING-ANCESTRIES-WARDS.md` · `SETTING-MAGITECH-DIVERGENCE.md`

**Status:** Locks applied 2026-08-01 — see § LOCKED + `campaigns/nyc-mafia-dnd/LOCKS.md`.

**Holder:** `nyc-worldbuilding-choices-brief`

---

## How to read this doc

Each choice has:

| Field | Meaning |
|-------|---------|
| **Controls** | What downstream AI loop, tone, SoT, and play inherit if you lock it |
| **Options** | 2–4 forks with in-world example, pros, cons, and **cost** (tokens / human time / inconsistency risk) |
| **Default if you skip** | Soft recommendation only — not canon |
| **Depends on** | Other choices that should be decided first (or that this choice constrains) |

**Cost legend**

- **Tokens:** Hermes think ticks, Workshop/Cursor bursts, vignette generation volume
- **Human time:** Your review/gate minutes per week
- **Inconsistency risk:** How badly agents drift or contradict locked strokes if this stays open

---

## A. Worldbuilding process choices

These govern *how* the dialectic loop runs — not what the city *is*.

---

### A1. Dialectic cadence

**Controls:** How fast strokes accumulate; whether you review one fork at a time or batch; think-lane checkbox granularity.

| Option | What it means | In-world (process, not setting) | Pros | Cons | Cost |
|--------|---------------|----------------------------------|------|------|------|
| **Drip** | One fork per week (~1 Hermes tick → one draft) | Year draft Week 1, visibility Week 2… | Low review load; easy to veto bad drafts early | Slow to playable texture; cross-fork contradictions surface late | Tokens: low steady · Human: ~15 min/week · Inconsistency: medium until batch 3 |
| **Batch (Workshop/Cursor)** | 3 core forks in one sitting, then drip detail | All of §B1–B3 argued same session | Coherent era “shape” fast; vignettes can start sooner | Fatigue; one bad synthesis poisons a batch | Tokens: one paid burst + drip · Human: 1–2 hr once · Inconsistency: low if you gate batch |
| **Hybrid** | Batch B1–B3 once, then drip for ancestry/magitech/vignettes | “Lock the law, then let potato fill wards” | Matches thought-loop plan default | Requires discipline not to skip gate after batch | Tokens: medium · Human: spike + weekly · Inconsistency: low–medium |

**Default if you skip:** Hybrid (batch era/law trio, drip everything else).

**Depends on:** A2 (gate strictness), E (decision order).

---

### A2. Human gate — draft detail allowed?

**Controls:** Whether Hermes may run Phase C (detail fill) and Phase D (vignettes) on `status: draft` strokes, or only after `status: locked`.

| Option | What it means | Example | Pros | Cons | Cost |
|--------|---------------|---------|------|------|------|
| **Strict gate** | No detail/vignettes until GM approves stroke | Draft year-1931 sits until you checkbox approve | Zero wasted device lore on rejected forks; SoT stays clean | Slower texture; think lane may feel “stuck” waiting on you | Tokens: lower waste · Human: must respond within ~1 week · Inconsistency: lowest |
| **Parallel draft** | Think may draft §C devices on `draft` strokes (marked non-canon) | Bootleg salon price list tagged `draft: year-1931` | Potato stays busy; you see concrete implications before lock | 30–50% of detail may be thrown away; agents may cite draft as canon by mistake | Tokens: higher · Human: same gate, more to skim · Inconsistency: medium–high |
| **Vignettes locked-only** | Detail on draft ok; vignettes only on locked | Devices exploratory; stories only after approve | Balances exploration vs narrative waste | Two-tier rules for agents to forget | Tokens: medium · Human: medium · Inconsistency: medium |

**Default if you skip:** Strict gate (matches thought-loop Phase B rule).

**Depends on:** A1 (drip punishes strict gate more).

---

### A3. Where the loop runs (primary engine)

**Controls:** Which tool owns Phase A dialectic, Phase C detail, Phase D vignettes; spend profile.

| Option | What it means | Example | Pros | Cons | Cost |
|--------|---------------|---------|------|------|------|
| **Hermes think (default)** | One artifact per ~8m tick on potato | `worldbuilding/strokes/…-year-draft.md` from cron | Free-first; background progress | Exit 124 timeouts; weak multi-fork dialectic in one tick | Tokens: free (time spread) · Human: async review · Inconsistency: low if read-order enforced |
| **Hub Workshop** | You paste fork; Chat argues live | “Steel-man polite denial for visibility” | Rich antithesis; you steer | Manual; not on cron | Tokens: per message · Human: active session · Inconsistency: low |
| **Cursor `cursor:auto` burst** | One sitting: dialectic + 3 vignettes | Phase A+B batch when free lane thrashes | Best single-session coherence | Paid; explicit pick only | Tokens: paid spike · Human: 1 session · Inconsistency: low |
| **Script scaffold only** | Folders/templates without LLM | `nyc-worldbuilding-scaffold.sh --fork year` | Deterministic paths | No content generation | Tokens: none · Human: minimal · Inconsistency: n/a |

**Default if you skip:** Hybrid — script scaffold (when implemented) + Hermes primary + Workshop for Phase B gate + optional Cursor burst.

**Depends on:** A1, A2.

---

### A4. NSFW vignette policy (Phase D)

**Controls:** How explicit vignettes may be; whether intimate magitech appears in proof stories; Docs Beta voice-check depth.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Fade-to-black** | Crime drama only; intimacy off-screen | “They disappeared into the lace-house; the raid came at dawn” | Matches NYC tone vs Tropic; safest for eventual players | Doesn’t stress-test intimate craft domain or bootleg-link economy | Tokens: low · Human: low · Inconsistency: intimate domain under-specified |
| **Magitech texture, not explicit** | Portal-lace / oath-lock as **industry** without sex acts on page | Inspector describes seized **paired stitches**, not bodies | Tests §B intimate regulation without smut | Writers may slide explicit without flag | Tokens: medium · Human: medium review · Inconsistency: medium |
| **Explicit opt-in pack** | Stroke header `explicit: allowed`; vignettes may be graphic | Bootleg link raid through a salon back room | Full stress-test of divergence seed `intimate=high` | Higher guardrail load; not default NYC tone | Tokens: higher · Human: high review · Inconsistency: low if flagged |

**Default if you skip:** Magitech texture, not explicit (aligns with `SETTING-PROHIBITION-MAGIC.md` tone table).

**Depends on:** B2 (visibility), D5 (intimate regulation seed), B8 (opening job if eroticized).

---

### A5. Legacy potato reports (~30 drafts)

**Controls:** Whether think lane mines old NPC/location ideas or treats them as toxic present-day era.

| Option | What it means | Example | Pros | Cons | Cost |
|--------|---------------|---------|------|------|------|
| **Mine-only** | Read for names/hooks; never copy tech/law | Valenti dock boss name reused; phones discarded | Fast; no bulk rewrite | Good ideas stay buried in wrong era | Tokens: low · Human: low · Inconsistency: low |
| **Re-skin pass** | Scripted header + manual review per report | `2026-07-30-era-and-tone.md` marked superseded, NPC extracted | Recovers sunk think work | 30 files × review = real time | Tokens: medium · Human: high · Inconsistency: medium until done |
| **Archive ignore** | `reports/` legacy frozen; all new work in `worldbuilding/` | Think only touches `worldbuilding/*` | Cleanest cut | Duplicated effort if NPCs re-invented | Tokens: lowest · Human: lowest · Inconsistency: lowest |

**Default if you skip:** Mine-only (ponytail).

**Depends on:** None (parallel to era locks).

---

### A6. Stroke conflict resolution

**Controls:** What happens when a new dialectic contradicts a `locked` stroke.

| Option | What it means | Example | Pros | Cons | Cost |
|--------|---------------|---------|------|------|------|
| **GM retcon line required** | You amend SoT + ledger; old stroke stays `locked` with note | “1931→1933 shift: Repeal prologue” | Audit trail; vignettes stay valid with annotation | Manual bookkeeping | Tokens: low · Human: per retcon · Inconsistency: low |
| **Auto-supersede** | New lock marks old `status: superseded` | `year-1931` → `year-1933` replaces | Machine-readable for agents | Vignettes may silently wrong until re-written | Tokens: medium (re-vignette) · Human: medium · Inconsistency: medium without vignette pass |
| **No retcon — fork is final** | Locked means locked; contradictions become new campaign | Rare for worldbuilding | Strongest continuity | Inflexible | Tokens: lowest · Human: lowest · Inconsistency: lowest until you break rule |

**Default if you skip:** GM retcon line required.

**Depends on:** A2 (strict gate reduces conflicts).

---

### A7. Thought-loop pilot scope

**Controls:** Whether NYC loop templates propagate to Tropic/Euro later.

| Option | What it means | Example | Pros | Cons | Cost |
|--------|---------------|---------|------|------|------|
| **NYC only** | No abstraction until v1 artifacts exist | `worldbuilding/README` is NYC-specific | Smallest ship | Repeat planning for other campaigns | Tokens: lowest · Human: lowest · Inconsistency: n/a |
| **Template after v1** | Document pattern in `docs/plans/` after first locked stroke pack | “Stroke → vignette” copied to Euro | Reuse | Premature generalization risk | Tokens: +one doc · Human: later · Inconsistency: n/a |

**Default if you skip:** NYC only.

**Depends on:** None.

---

### A8. Discord dependency for Phase D

**Controls:** Whether vignette/story work blocks on `discord.json` IDs.

| Option | What it means | Example | Pros | Cons | Cost |
|--------|---------------|---------|------|------|------|
| **Proceed without Discord** | Worldbuilding independent of tracker | Vignettes use generic operators | Unblocks thought loop now | Player-facing tracker stays placeholder | Tokens: none extra · Human: none · Inconsistency: n/a |
| **Block Phase D until linked** | No promote/vignette until guild/channel IDs | Think stays dialectic-only | Forces integration order | Idle lane if IDs delayed | Tokens: saved · Human: deferred · Inconsistency: n/a |

**Default if you skip:** Proceed without Discord (SoT already says no action until GM pastes IDs).

**Depends on:** None.

---

### A9. Fork priority within process (which stroke first)

**Controls:** Order of Phase A dialectic checkboxes (E-1…E-3 in thought-loop plan).

| Option | What it means | Example | Pros | Cons | Cost |
|--------|---------------|---------|------|------|------|
| **Era/law trio first** | Year → visibility → federal face | Recommended in thought-loop §7 | Everything else hangs off law enforcement mood | Opening job/story hooks wait | Tokens: efficient · Human: clear · Inconsistency: low |
| **Opening job first** | Session 1 hook before federal detail | “Speakeasy raid” stroke before BCC charter | Faster playable pitch | Magitech/law may contradict chosen set-piece | Tokens: may waste · Human: tempting · Inconsistency: high |
| **Ward table first** | Ancestry visibility before federal | Harlem elf density before OTR | Rich texture early | Law strokes may not fit chosen ward politics | Tokens: medium waste risk · Human: high · Inconsistency: medium–high |

**Default if you skip:** Era/law trio first (see Section E).

**Depends on:** B1–B3 should complete before C/D if you pick era-first.

---

## B. Era / setting locks

These define *what* Prohibition New York is. Partial answers in SoT are noted.

---

### B1. Campaign year

**Controls:** Federal pressure, Repeal proximity, public mood, price lists, news voice, which historical beats are diegetic.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **1928** | Mid-Prohibition; optimism and corruption both high | Bathtub gin still novel; Hoover ascending | Long runway before Repeal; classic speakeasy era | Less “end-of-an-era” urgency | Tokens: baseline · Human: low · Inconsistency: low once locked |
| **1931** | Depression + enforcement harder | Breadlines beside blind-tiger salons | Gritty crime drama default; moral exhaustion | Fewer “Repeal party” hooks | Tokens: baseline · Human: low · Inconsistency: low |
| **1933 (Repeal looming)** | Magic/alcohol parallel can echo legal pivot | BCC debates registering salon licenses like beer | Strong thematic parallel for magical legalization debate | Shorter runway; dates are hot | Tokens: baseline · Human: low · Inconsistency: low |

**Default if you skip:** 1931 (depression pressure without Repeal dominating every scene).

**Depends on:** B3 (federal face), B4 (Prohibition parallel intensity).

---

### B2. Magic visibility (social default)

**Controls:** Street dialogue, vignette smell test, whether PCs hide powers, salon signage, press coverage.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Common knowledge** | Everyone knows salons, speaking-tubes, ghost-binding exist | Kid on stoop: “Mom’s at the healer, not the doctor” | Easy exposition; magitech as infrastructure play | Less noir secrecy; harder “reveal” plots | Tokens: lower (agents state facts openly) · Human: low · Inconsistency: low |
| **Polite denial** | Known but not discussed in respectable spaces | Midtown club pretends glamour is “stage lighting” | Noir texture; double life for operators | Agents may over-explain or break denial | Tokens: higher (need consistent voice rules) · Human: medium · Inconsistency: medium–high |
| **Tiered by ward** | Docks/Harlem open; Midtown denial (see C2) | Same city, two social rules | Rich geographic play | Must sync with ancestry visibility (C2) | Tokens: medium · Human: medium · Inconsistency: medium without ward table discipline |

**Default if you skip:** Tiered by ward (bridges to `SETTING-ANCESTRIES-WARDS.md` default texture).

**Depends on:** C2 (non-human visibility) — lock together or immediately after.

---

### B3. Federal face (enforcement topology)

**Controls:** Who raids speakeasies/salons, RICO-analog evidence, PC enemy list, bureaucratic tone.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **BCC monopoly** | Single **Bureau of Consecrated Commerce** under Treasury | One warrant for gin still + unregistered luck charm | Simple for players and agents | Less jurisdictional friction | Tokens: low · Human: low · Inconsistency: low |
| **OTR + BCC split** | **Office of Thaumaturgical Revenue** taxes; BCC seizes | OTR audit → BCC raid chain | Prohibition parallel richer | Two agencies to track | Tokens: medium · Human: medium · Inconsistency: medium |
| **Federal + NYPD Occult Squad** | Split + local cops with ward-inspectors | Valenti bribes precinct occult desk | Classic NYPD noir crossover | Most moving parts | Tokens: higher · Human: higher · Inconsistency: higher |

**Default if you skip:** OTR + BCC split (already named in ancestries SoT prose).

**Depends on:** B1 (year affects agency maturity), B4 (what is prohibited).

---

### B4. Magical Prohibition target (what is banned)

**Controls:** Bootleg economy, raid set-pieces, family rackets, §C step 4 “legal status” defaults.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Salon/healing focus** | Unlicensed healing, luck, ward-breaking (parallel speakeasies) | Blind-tiger **salon** raid mirrors gin | Clean alcohol parallel | Less variety in federal cases | Tokens: low · Human: low · Inconsistency: low |
| **Relic + rite focus** | Smuggling saints’ bones, forbidden formulae | Chen-Okafor **relic run** from Canada | Ties to import wards / Chinatown | Heavier lore load | Tokens: medium · Human: medium · Inconsistency: medium |
| **Broad “unregistered miracles”** | Anything not BCC/OTR licensed | Raid seizes speaking-tube splice + gin | Maximum hook surface | Agents may over-raid every scene | Tokens: higher · Human: review load · Inconsistency: medium |

**Default if you skip:** Salon/healing focus + relic runs as secondary (table in `SETTING-PROHIBITION-MAGIC.md` already implies both).

**Depends on:** B3, D5 (intimate regulation).

---

### B5. Five Families naming

**Controls:** `story/factions.md` continuity, ethnic texture vs period authenticity, think-lane NPC crosswalk.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Keep Valenti / Moretti / Chen-Okafor / Kowalski / Ashford** | Modern-multicultural names on 1930s frame | Chen-Okafor already hyphenated diaspora | Zero migration work; ward table aligned | Some players notice anachronism | Tokens: lowest · Human: none · Inconsistency: low |
| **Period rename pass** | Italian/Irish/Jewish/WASP-coded surnames per territory | Moretti stays; others renamed once | Stronger period smell | Must rewrite factions.md + tracker + all reports | Tokens: high one-time · Human: high · Inconsistency: high until done |
| **Keep names, revise origin blurbs** | Names stick; exposition explains mergers | “Ashford was Astor-adjacent cover” | Compromise | Still slightly anachronistic | Tokens: medium · Human: medium · Inconsistency: low |

**Default if you skip:** Keep names, revise origin blurbs when promoting to `story/`.

**Depends on:** C4 (inner circles), ward table (already maps families).

---

### B6. The Below (subway-deep threat)

**Controls:** Horror lane, Commission problems, mid-campaign reveals, ancestry options (deep gnomes).

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Same as potato drafts** | Active threat; families dump problems Below | Session 3 may involve tunnel kid witness | Uses legacy think work | May overshadow Prohibition crime | Tokens: medium · Human: low · Inconsistency: low if phased |
| **Demote to mid-campaign** | Foreshadow only; no Below-centric Phase D | Vignettes stay street-level | Keeps tone crime-not-cosmic | Potato Below lore idle | Tokens: low · Human: low · Inconsistency: low |
| **Background myth only** | Tables talk; no PC descent until arc 2 | “Don’t ride the closed platform” | Maximum restraint | Wastes existing Below drafts | Tokens: lowest · Human: lowest · Inconsistency: lowest |

**Default if you skip:** Demote to mid-campaign (matches open question bias in Prohibition SoT).

**Depends on:** C5 (tunnel ancestries), B8 (opening job).

---

### B7. Opening job (Session 1 hook)

**Controls:** First vignettes, think Phase D targets, party introduction fiction.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Cursed ledger** | Keep `story/premise.md` hook; period-reskin | Truth-bind book bleeds names | Continuity with existing seed | Present-day voice in premise until rewritten | Tokens: medium reskin · Human: medium · Inconsistency: medium until reskin |
| **Speakeasy / salon raid** | Prohibition-forward cold open | Operators extract boss from BCC raid | Instant tone signal | Drops ledger hook | Tokens: low new · Human: low · Inconsistency: low |
| **Relic run** | Smuggling sacred cargo | Ferry contract with river spirit goes wrong | Ties Chen-Okafor / docks | Less personal to party | Tokens: medium · Human: low · Inconsistency: low |

**Default if you skip:** Speakeasy/salon raid (strongest Prohibition signal).

**Depends on:** B1, B3, B4; A9 if you considered opening-first process.

---

### B8. Party anchor

**Controls:** PC identity, law enforcement contact, faction loyalty prompts, think-lane NPC generation.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Family-adjacent operators** (SoT default) | Fixers, muscle, ward-breakers on retainer | “Moretti’s consultant” | Flexible; grey morality | Needs family pick or multi-family | Tokens: low · Human: low · Inconsistency: low |
| **Independent Ledger crew** | Truth-bind specialists for hire | Neutral arbiters between families | Sandbox neutrality | Less built-in patron pressure | Tokens: medium · Human: medium · Inconsistency: low |
| **OCU-adjacent double agents** | Federal / occult squad informants | Raid one week, tip the next | High tension | Risk of “cop show” not crime | Tokens: medium · Human: high (balance) · Inconsistency: medium |

**Default if you skip:** Family-adjacent operators.

**Depends on:** B3 (if OCU path), B5 (which family names).

---

## C. Ancestry / ward forks

From `SETTING-ANCESTRIES-WARDS.md`. **Non-negotiable already locked:** human NYC stays human; fantasy diasporas alongside; no 1:1 ancestry↔ethnicity mapping.

---

### C1. Playable / prominent ancestry list

**Controls:** PC options, ward table rows, think-lane NPC generator, token burn inventing new ancestries per tick.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Core six + dragonborn + goblinoids** | Dwarf, elf, orc/half-orc, tiefling, halfling, gnome + DB + goblin/hobgoblin | Ward table as written | Matches current SoT table | Kenku/tabaxi/etc. need ad-hoc rules | Tokens: low · Human: low · Inconsistency: low |
| **Expanded list** | Add aasimar, goliath, kenku, tabaxi | Kenku couriers in Chinatown row | More PC expressiveness | Larger harassment/permit matrix | Tokens: medium · Human: medium · Inconsistency: medium |
| **Core six only** | Cut dragonborn/goblinoids from prominent wards | Chinatown human-majority only | Simpler | Weakens existing ward table rows | Tokens: low · Human: rewrite table · Inconsistency: high |

**Default if you skip:** Core six + dragonborn + goblinoids (current doc default).

**Depends on:** C7 (no lizardfolk stand-in if expanding).

---

### C2. Non-human visibility (geography)

**Controls:** Harlem/docks vs Midtown scenes; passing mechanics; federal harassment tables.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Ward-tiered** | Open in dock/tenement/guild blocks; denied or glamoured Midtown | Tiefling consultant passes; orc turned from Ashford lobby | Matches ward table vibe | Two rule sets | Tokens: medium · Human: medium · Inconsistency: medium |
| **Citywide polite fiction** | “Foreign” excuse everywhere | Elf in Harlem same as elf in Midtown legally | Simpler rhetoric | Flattens neighborhood color | Tokens: low · Human: low · Inconsistency: low |
| **Citywide open** | Non-human unremarkable except bigotry hotspots | Orc stevedore walks Broadway | Easy inclusion | Less noir exclusion | Tokens: low · Human: low · Inconsistency: low |

**Default if you skip:** Ward-tiered (align with B2 tiered magic visibility).

**Depends on:** B2 (magic visibility), C3 (half-blood ladder).

---

### C3. Half-blood stigma ladder

**Controls:** PC backstory friction, ALB permit plots, “respectable job” gates.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Role-based stigma** | Half-elf “artistic”; half-orc “muscle”; tiefling always watched | Harlem club hires half-elf singer, not half-orc clerk | Nuanced; table already hints this | Complex for agents | Tokens: medium · Human: low · Inconsistency: medium |
| **Human-passing ladder** | Visible non-human blood bars permits | Half-elf with pointed ears denied ALB clerk job | Clear mechanical hook | Harsher setting | Tokens: low · Human: low · Inconsistency: low |
| **Permit-neutral on paper** | Harassment only in enforcement | Inspector discretion only | Matches “ancestry-neutral on paper” row | Less personal drama | Tokens: low · Human: low · Inconsistency: low |

**Default if you skip:** Role-based stigma (current quick-ref table).

**Depends on:** C2, B3 (inspectors).

---

### C4. Family inner circles (human-only made-men)

**Controls:** PC ascent plots, blood-oath storylines, political marriage hooks.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Soft tradition** | Made-men usually human; exceptions are scandal | Dwarf vault-smith “family” but not Commission voter | Matches “mostly human capos” SoT | Edge cases need GM ruling | Tokens: low · Human: low · Inconsistency: low |
| **Hard rule** | No non-human made-men ever | PC half-orc hits glass ceiling | Strong conflict for non-human PCs | Can frustrate players | Tokens: low · Human: low · Inconsistency: low |
| **Already broken** | One family has non-human capo | Chen-Okafor dragonborn negotiator is made | Immediate drama | Weakens “human-led Commission” | Tokens: medium · Human: medium · Inconsistency: medium |

**Default if you skip:** Soft tradition.

**Depends on:** B5 (family names), C1.

---

### C5. The Below — ancestry reveal timing

**Controls:** Deep gnomes, aberrant bleed, tunnel NPCs in Phase D.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Mid-campaign reveal** | Below ancestries rare above ground | Tunnel kid speaks in Session 5 | Horror pacing | Agents shouldn’t front-load Below NPCs | Tokens: low early · Human: low · Inconsistency: low |
| **Occasional above-ground** | Deep gnome smugglers seen rarely | Below courier in Bushwick warren | More usable NPCs | Dilutes mystery | Tokens: medium · Human: low · Inconsistency: medium |
| **Same as B6 demote** | No Below ancestry until arc 2 | Align with setting threat demote | Consistent | — | Tokens: lowest · Human: lowest · Inconsistency: lowest |

**Default if you skip:** Mid-campaign reveal (pair with B6 demote).

**Depends on:** B6.

---

### C6. Harlem & elf presence density

**Controls:** Harlem Renaissance tone vs fantasy patronage; “elf quarter” risk.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Patron-artist minority** (current row) | Elves as arts/elven salons; human-majority Harlem | Cotton Club glamour wards | Respects human Harlem center | Agents may elf-wash history | Tokens: medium (guardrails) · Human: medium · Inconsistency: medium |
| **Shrink elf presence** | Harlem overwhelmingly human; elves elsewhere | Elves mainly Queens estates | Safest historical respect | Weakens ward table Harlem column | Tokens: low · Human: table edit · Inconsistency: low |
| **Expand elf salon culture** | Elves more visible in Renaissance nightlife | Elf scryer books jazz acts | Flashy | Higher “elf quarter” failure mode | Tokens: higher · Human: high review · Inconsistency: high |

**Default if you skip:** Patron-artist minority with explicit “human-majority Harlem” in stroke lock.

**Depends on:** C1, C2.

---

### C7. Puerto Rican wave & fantasy enclave

**Controls:** East Harlem / South Bronx row; **must not** map lizardfolk ↔ Latino identity.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Human-majority only** | Puerto Rican migration as human communities | Bushwick row as written | Safest; matches design principle | No new ancestry hook | Tokens: low · Human: low · Inconsistency: lowest |
| **Separate ancestry enclave (non-Latino-coded)** | e.g. lizardfolk river-workers in **industrial** zone distinct from East Harlem | Workers on ferry docks, not “Puerto Rican stand-in” | Adds fantasy texture | High risk if mis-placed | Tokens: medium · Human: high review · Inconsistency: high if sloppy |
| **Defer** | Leave South Bronx human-only until mid-campaign | — | No rush | Open question lingers | Tokens: none · Human: none · Inconsistency: n/a |

**Default if you skip:** Human-majority only (defer separate enclave unless you have a clear non-allegorical placement).

**Depends on:** C1, ward table geography.

---

## D. Magitech path forks

`SETTING-MAGITECH-DIVERGENCE.md` locks **high-rise rarity**, domain stances (summary), and §C grammar. Remaining choices are **path-dependence seeds** (§D) and domain emphasis — pick once per campaign or per stroke batch, then stay consistent.

---

### D1. Vertical city seed (d6 axis 1)

**Controls:** Skyline descriptions, elevator rarity, ward-tower prevalence, Ashford prestige scenes.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Low (1–2)** | Mostly 4–6 story brick; elevators exotic | Chase on foot across rooftops | Matches “high-rises rare” principle strongly | Less “tower” crime | Tokens: low · Human: low · Inconsistency: low |
| **Mid (3–4)** | Mix; a few towers, mostly mid-rise | Ashford spire visible from harbor | Balanced | Agents may creep toward skyscraper | Tokens: medium · Human: low · Inconsistency: medium |
| **High (5–6)** | Several ward-towers + one infamous spire | Etched-round sniper from consecrated tower | Dramatic vertical set-pieces | Fights anti-modern-tech guardrail | Tokens: medium · Human: review · Inconsistency: high |

**Default if you skip:** Low–mid (mostly brick; Ashford exception).

**Depends on:** B1 (1931 depression favors low skyline).

---

### D2. Automaton labor seed (d6 axis 2)

**Controls:** Union plots, dock scenes, spirit-scab riots, golem presence.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Rare automaton labor** | Human unions dominate; spirits exotic | Red Hook mostly human stevedores | Simpler labor politics | Less magitech flavor | Tokens: low · Human: low · Inconsistency: low |
| **Hot automaton conflict** | Clockwork galleries on docks; union war | Valenti job crosses picket line | Rich hooks; matches Hell’s Kitchen row | More NPC types to track | Tokens: medium · Human: medium · Inconsistency: medium |

**Default if you skip:** Rare automaton labor (spirit scab as plot spice, not default background).

**Depends on:** Ward focus (Red Hook / Hell’s Kitchen scenes).

---

### D3. Comms monopoly seed (d6 axis 3)

**Controls:** Speaking-tube plots, splice raids, Chen-Okafor wire rackets.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Fragmented ward tubes** | Borough-local networks | Each family owns block-level horns | Decentralized crime | Harder city-wide coordination stories | Tokens: medium (track many nets) · Human: medium · Inconsistency: medium |
| **Tube-Layer’s Union near-monopoly** | City hub; splice bootlegs | Raid on Western Union back room | Single chokepoint for federal heat | One comms model to maintain | Tokens: low · Human: low · Inconsistency: low |

**Default if you skip:** Near-monopoly with active bootleg splice ( noir wiretap parallel).

**Depends on:** B3 (who raids splices).

---

### D4. Divine vs arcane dominance (d6 axis 6)

**Controls:** Healing/notary plots, guild vs temple patronage, PC “chaplain” vs mage roles.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Temple-led** | Apollo surgeons, parish notaries dominate | Moretti chaplain is political kingmaker | Clear sacred hierarchy | Less alchemist noir | Tokens: low · Human: low · Inconsistency: low |
| **Guild alchemy dominates** | Street alchemists; priests lobby | LES bathtub elixir economy | Bootleg texture | Temples feel weak | Tokens: medium · Human: low · Inconsistency: medium |
| **Balanced bureaucracies** | Competing permits; arcane vs divine | BCC forms for both “licensed miracle” types | Matches Prohibition “competing bureaucracies” line | Agents must track two lanes | Tokens: medium · Human: medium · Inconsistency: medium |

**Default if you skip:** Balanced bureaucracies.

**Depends on:** B4 (what is licensed vs bootleg).

---

### D5. Intimate regulation seed (d6 axis 4)

**Controls:** Bootleg link economy, OTR raids, vignette policy (A4), family rackets.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Strict salon licensing** | Bootleg intimate links rare | Unregistered oath-lock ring is scandal | Tighter tone; easier fade-to-black | Less parallel to gin epidemic | Tokens: low · Human: low · Inconsistency: low |
| **Bootleg link epidemic** | Unregistered spatial sympathy common | OTR raids lace-houses like speakeasies | Strong Prohibition parallel; rich raids | Pulls toward intimate vignettes (A4) | Tokens: medium · Human: medium · Inconsistency: medium |

**Default if you skip:** Bootleg link epidemic (matches alcohol parallel table).

**Depends on:** A4 (NSFW policy), B4.

---

### D6. War bleed seed (d6 axis 5)

**Controls:** Street violence garnish, veteran NPCs, etched-round prevalence.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Muted WWI garnish** | Tommy guns mundane; etched rounds rare | Veterans with mundane trauma | Keeps focus Prohibition | Less magitech in violence | Tokens: low · Human: low · Inconsistency: low |
| **Strong war bleed** | Etched rounds common; gas nightmares | Drive-by with one-shot evocation shell | High action color | Escalates magic arms race | Tokens: medium · Human: low · Inconsistency: medium |

**Default if you skip:** Muted WWI garnish (magical garnish on violence, not dominant).

**Depends on:** B1 (1931 depression veterans).

---

### D7. “What exists here?” default (quick d6 culture)

**Controls:** Baseline scene magic level before plot spikes; think-lane `reports/` headers.

| Option | What it means | In-world example | Pros | Cons | Cost |
|--------|---------------|------------------|------|------|------|
| **Licensed infrastructure visible (3–4)** | Tubes, salons, wards everyday | Speaking-tube in café back room | Matches common-knowledge/tiered visibility | Low mystery | Tokens: low · Human: low · Inconsistency: low |
| **Bootleg boom (5)** | Unregistered charms common | Raid risk every job | High tension | Agents may overuse raid beats | Tokens: medium · Human: medium · Inconsistency: medium |
| **Mundane rumor (1–2)** | Magic backstage | Operators know; civilians unsure | Noir secrecy | Fights SoT “gods are real” | Tokens: high conflict · Human: high · Inconsistency: high vs SoT |

**Default if you skip:** Licensed infrastructure visible (3–4).

**Depends on:** B2 (visibility), D3–D5.

---

### D8. Seed logging discipline

**Controls:** Whether agents roll per report vs once per campaign; contradiction rate across think ticks.

| Option | What it means | Example | Pros | Cons | Cost |
|--------|---------------|---------|------|------|------|
| **Campaign bundle** | GM picks all §D axes once; header on stroke doc | `seeds: vertical=low, comms=high, intimate=high` | Lowest inconsistency | Up-front decision load | Tokens: lowest long-run · Human: one sitting · Inconsistency: lowest |
| **Per stroke batch** | One axis per invention batch per §D ponytail rule | Detail file notes `comms=high` only | Flexible | Drift across files | Tokens: medium · Human: medium · Inconsistency: medium |
| **Ad hoc** | Agents pick without logging | — | Zero prep | **Forbidden** for production | Tokens: waste · Human: retcon · Inconsistency: **high** |

**Default if you skip:** Campaign bundle at first locked stroke.

**Depends on:** First locked stroke (Phase B); E steps 4–5.

---

## E. Recommended decision order

Decide in this order to minimize rework and token waste. Steps in **bold** are human-gate moments.

| Step | Choice ID | Why now |
|------|-----------|---------|
| **1** | A7, A8 | Pilot scope & Discord — unblock process without setting content |
| **2** | A1, A3, A2 | How you’ll run the loop before generating artifacts |
| **3** | **B1** Year | Pins federal mood, news, prices — everything else dates from here |
| **4** | **B2** Magic visibility | Vignette smell test + street voice |
| **5** | **B3** Federal face + **B4** Prohibition target | Law enforcement topology; raid fiction |
| **6** | **A6** Stroke conflict rule | Before first **lock** |
| **7** | **Lock stroke pack #1** (year + visibility + federal) | Phase B gate — thought-loop `status: locked` |
| **8** | **D8** + **D1–D7** magitech seeds (campaign bundle) | Grammar is post-choice; seeds need law/visibility |
| **9** | **C2** + **C6** + **C1** | Ward visibility & Harlem elf density — after city law shape |
| **10** | C3, C4, C7 | PC social ladders & family politics |
| **11** | **B6** + **C5** The Below | Horror depth — after street table firm |
| **12** | B5, B7, B8 | Faction names & play hook — need anchors from above |
| **13** | A4 NSFW vignette policy | Now you know intimate seed (D5) |
| **14** | A5 Legacy reports | Parallel; can run during drip |
| **15** | **A9** satisfied by order 3–12 if era-first | Opening job last unless you explicitly chose opening-first in A9 |

### Numbered decision order (quick reference)

1. A7 — Thought-loop pilot scope  
2. A8 — Discord dependency  
3. A1 — Dialectic cadence  
4. A3 — Primary loop engine  
5. A2 — Human gate strictness  
6. **B1 — Campaign year**  
7. **B2 — Magic visibility**  
8. **B3 — Federal face**  
9. **B4 — Magical Prohibition target**  
10. A6 — Stroke conflict policy  
11. **→ Lock era/law stroke pack (Phase B)**  
12. D8 — Seed logging discipline  
13. D1–D7 — Magitech path seeds (bundle)  
14. C1 — Ancestry list  
15. C2 — Non-human visibility  
16. C6 — Harlem elf density  
17. C3 — Half-blood stigma  
18. C4 — Family inner circles  
19. C7 — Puerto Rican wave / fantasy enclave  
20. B6 — The Below threat level  
21. C5 — Below ancestry timing  
22. B5 — Five Families naming  
23. B7 — Opening job  
24. B8 — Party anchor  
25. A4 — NSFW vignette policy  
26. A5 — Legacy potato reports  

---

## What is already locked (do not re-litigate without retcon)

| Item | Source |
|------|--------|
| Prohibition-era NYC (~1928–1933 window until B1 narrows) | `SETTING-PROHIBITION-MAGIC.md` |
| Magitech = medieval/alchemical divergence, not modern tech | Same + `SETTING-MAGITECH-DIVERGENCE.md` |
| High-rises rare; brick/timber default skyline | `SETTING-MAGITECH-DIVERGENCE.md` §A |
| §C simulation grammar for new devices | Mandatory for agents |
| Human multicultural wards + fantasy diasporas alongside; no 1:1 ancestry↔ethnicity | `SETTING-ANCESTRIES-WARDS.md` |
| Five Families human-led; mixed crews at soldier level | Same |
| Tone: period crime drama; no gang glorification; explicit opt-in later | `SETTING-PROHIBITION-MAGIC.md` |
| Thought-loop artifact types (stroke → justification → vignette) | `nyc-worldbuilding-thought-loop-2026-07-31.md` |

---

## Suggested first GM session (90 minutes)

If you want one sitting without reading every fork:

1. Confirm **A1 hybrid**, **A2 strict gate**, **A3 Hermes + Workshop** (5 min)  
2. Decide **B1, B2, B3, B4** (30 min) — use dialectic template from thought-loop §3 Phase A  
3. Pick **D1, D3, D5, D7** only — vertical, comms, intimate, baseline magic level (15 min)  
4. Pick **C2 + C6** — visibility geography + Harlem (15 min)  
5. Defer **B6–B8, C4, C7, A4** to next session unless opening job urgent  

Record locks in ledger: `[GM] Stroke locked: <slug>` per thought-loop convention.

---

*Brief author: PC agent · 2026-07-31 · Locks applied 2026-08-01.*

---

## LOCKED (GM decisions — 2026-08-01)

**Authority:** `campaigns/nyc-mafia-dnd/LOCKS.md` + `worldbuilding/strokes/era-law-pack.md`. Auto-supersede remaining forks below.

### Process

| ID | Lock |
|----|------|
| Scope | NYC only |
| A7 | NYC thought-loop pilot |
| A8 | No Discord dependency |
| A1 | Batch now + drip with steer options |
| A3 | Parallel draft + Hermes + Hub Workshop; `cursor:auto` when available |
| A2 | Soft gate — drip steer / Workshop locks |
| A4 | NSFW full depravity allowed; kinky measured |
| A5 | Reskin pass |
| A6 | Auto-supersede; new SoT over potato present-day |
| Characters | Broad strokes first; city flesh later |

### Era / law (stroke pack #1)

| ID | Lock |
|----|------|
| B1 | **1931** |
| B2 | **Tiered visibility by ward** |
| B3 | **OTR + BCC + NYPD inspectors** |
| B4 | **Salon/healing primary**; relic runs secondary |
| B5 | **Keep family names**; revise blurbs on promote |
| B6 | **Below demoted** mid-campaign |
| B7 | **Speakeasy/salon raid** opening |
| B8 | **Family-adjacent operators** |

### Ancestry / wards

| ID | Lock |
|----|------|
| C1 | Core six + dragonborn + goblinoids |
| C2 | Ward-tiered visibility |
| C3 | Role-based half-blood stigma |
| C4 | Soft tradition human capos |
| C5 | Below ancestry mid-campaign |
| C6 | Patron-artist elf minority; human-majority Harlem |
| C7 | Human-majority Puerto Rican wave |

### Magitech seeds (campaign bundle)

`vertical=low · automaton=rare · comms=fragmented · intimate=high · war=muted · divine_arcane=split`

§C grammar mandatory. See `LOCKS.md` for header format.
