# Euro Adventure 2026 — Discord swamp-scene analysis

**Holder:** `euro-discord-analyze` · **Written:** 2026-08-09T16:11Z (PC)  
**Export SoT:** `../discord-export/snapshot-2026-08-09/` (bot re-ingest EXIT 0 earlier today; potato mirror verified)  
**Tooling reused:** `../export_discord_lore.py` + hunter/tropic `DISCORD_BOT_TOKEN` (read-only; not re-run this pass — snapshot already covers requested IDs)  
**Message refs:** export headers are `YYYY-MM-DD HH:MM UTC — Author` (no snowflake in header). Where Discord reply links appear, snowflakes are noted.

**Scope clarification**

| User-provided ID | What it is | Swamp relevance |
|------------------|------------|-----------------|
| Category `1477755184607396063` | **Guild Hall** | Primary play category — swamp contract + travel + Halkin-Gaul live in `#main-rp` |
| Channel `1477735120252178453` | **`#campaign-rp`** (under Discord “Text Channels”, *not* Guild Hall) | Early **SmithsVille** intake only — no swamp arrival scene |

The **swamp scene** (arrival at **Halkin-Gaul**) is in `#main-rp` `1495469564060893254`, not in `#campaign-rp`.

---

## 1. Channel / thread map

**Guild:** Wholesome's RP stuff · `1265793253798576148`

### Category Guild Hall · `1477755184607396063`

Exported 2026-08-09 15:18 UTC · 4 text channels · 5 threads · **1615** channel msgs + **107** thread msgs

| Channel | ID | Msgs | Role |
|---------|-----|------|------|
| `#main-guild-hall` | `1477755236591468647` | 228 | Early board / goblin (“boglin”) jobs |
| `#storage` | `1477755253335130246` | 0 | Empty |
| `#registration-and-accounting` | `1477755301552722011` | 0 | Empty |
| `#main-rp` | `1495469564060893254` | **1387** | Primary play log — swamp job → Blackdoor → **Halkin-Gaul** |

**Threads under `#main-rp`** (all Blackdoor-era, pre-Halkin)

| Thread | ID | Msgs | Notes |
|--------|-----|------|-------|
| `"Knife? Oh no, dear. There'll be no` | `1515805411763290132` | 7 | Knife / murder side beat |
| `"Sleep"` | `1513308759592796231` | 25 | Overnight / rooms |
| `*Outhouse investigation*` | `1520872806051614814` | 19 | Routes / escape after Vesper stab |
| `Elf to Elf Communication` | `1520867916168560783` | 32 | Party side talk |
| `Room Clearing` | `1520881912409755719` | 24 | Search rooms (adult items in loot — see spoilers) |

### Additional channel (user ID) · `#campaign-rp` · `1477735120252178453`

Exported 2026-08-09 15:18 UTC · **16** parent msgs + **58** interview-thread msgs

| Thread | ID | Notes |
|--------|-----|-------|
| First Interview Vyl | `1477741009650581517` | Vyllynn intake |
| Interviewing with the guildmaster (Ata) | `1477746632216023313` | Ata intake |
| First Interview (Blaire Witch project) | `1477749190116376658` | Blaire intake |
| First Interview (Fuyuko) | `1477758504264663133` | Fuyuko intake |

### Sheets · `1475174763533176844`

7 messages · roster source (2026-02-25 → 2026-05-28)

### Freshness

Last `#main-rp` play message: **2026-07-26 19:59 UTC** (session end at town hall). Re-ingest 2026-08-09 found **no later play**. DMs not exported (bot cannot read user↔user DMs).

---

## 2. Cast mentioned (PCs / NPCs)

### Player characters (from `#sheets` + RP)

| Character | Player (display) | Discord user id | Confidence | Class / hook |
|-----------|------------------|-----------------|------------|--------------|
| Vyllynn Alword | Yuki | `1397336508150841529` | High (reply `@!` + name) | Artificer Artillerist |
| Fuyuko (+ Natsuki) | Ren | `240116077130940416` | High (pings labeled Ren / Fuyuko context) | Oni bodyguard; Natsuki soul-bound |
| Ata | Thesaurus | `471376523065032724` | High (early party pings + Ata rolls) | Feral exile druid |
| Blaire Blakely | (sheets / early) | `1158756142802026647` | High (reply `@!` + name) | Wild Magic changeling |
| Leanora | DementedOne | — | Display-name only in export headers | Aasimar cleric (Tyr) |
| Camila … de Lanzarote | Prim | — | Display-name only | “Crimson Marauder”; joins on swamp road |
| Gwenevere | Uni | — | Display-name only | Serpentine acolyte |

Also seen in `#main-rp` pings (map carefully before locking): `1321029319455408190`, `233300187110572032`, `502127434003382282` — likely Leanora / Uni / Prim cluster, **not** snowflake-proven in this export format.

**GM:** WHOLESOMEest Boi · `265909664590331915` (high — owner ping style)

### Party / rival labels (diegetic)

| Name | Status | Notes |
|------|--------|-------|
| **SorePunks** | LOCK (table) | Party guild shop name; called small / placeholder |
| **Chelcins** | LOCK | Rival remote-branch guild party |

### NPCs established on road / Blackdoor (pre-swamp town)

| Name | Notes |
|------|-------|
| Guildmaster (SmithsVille) | Issues swamp contract; thin intel |
| Camila | PC joined mid-road; local-ish guide claims |
| Kaelen | Purple tiefling; speaks for Chelcins |
| Vesper | Red tiefling rogue — **murdered** at Blackdoor (stab + sulfur) |
| Elara | Human; rebukes Vesper |
| Ghorgash | Iron Orc; large build |
| Blackdoor innkeeper / gnomish staff | Multi-story inn; pigeon for guards |
| Pipe-smokers on Halkin town-hall steps | Present at arrival; unnamed |
| Guard presence | Guard shack visible; no named guards yet |

No named Halkin-Gaul townsfolk beyond ambient locals in export.

---

## 3. Plot beats leading to the swamp

Compressed from Discord clock (full 25-beat table: `../analysis/campaign-timeline.md`).

1. **2026-02-25 → 03-01** — Sheets + `#campaign-rp` **SmithsVille** intake (hot industrial city; metals/saddles/carriages; guild HQ hub; interviews).
2. **2026-03-08 → 05-17** — Local jobs via guild hall / `#main-rp`: goblins near **Fenrir Hills** (players slang **“boglins”**), Leanora joins, lumber/herbs.
3. **2026-05-24** — Long contract offered: investigate distant town — monsters + **disappearances**; **discretion**; thin intel; **1000 gp** / **200** up front; ~month; **~10 days** horse cart; **“far… Swampy… Overcast”**.
4. **2026-05-31** — Leave SmithsVille; road through empty swamp/moors; **Camila** joins cart.
5. **2026-06-07** — Rest stop **“The blackdoor in.”** → **Blackdoor Inn**; quest sheet names town **Halkin-Gaul**; “dozen villages” to frontier.
6. **2026-06-14 → ~06-28** — Meet **Chelcins**; Camila: region **settling the swamps**, missing people, no useful warning signs; **Vesper murdered**; investigation threads.
7. **2026-07-26** — Leave Blackdoor → hills → **snowy peaks** / valley stream → **bogs, marshes, tree cover** → wooden signs through bog → arrive **Halkin-Gaul** → stop at **town hall**. Session ends. **Play clock here.**

---

## 4. Swamp scene — established, gaps, quotes

### 4A. What is established (canon from Discord)

**Job (guild brief)** — `#main-rp` 2026-05-24 18:43–19:15 · WHOLESOMEest Boi

- Month-scale investigation; **1000 gp** total, **200** up front  
- Town has **several problems**; lacks adventurers vs **monsters**; **disappearances**  
- **Discretion** tantamount; party **on their own**; intel = “be prepared for anything”  
- Travel: **10 days** by horse cart; environment **swampy**, **overcast**, far  

**Approach geography**

- Stone-paved main road through barren repetitive swamps / humid muddy moors; cold, dark, rain; empty of traffic (Prim travel block 2026-05-31 19:44)  
- Mid-road: Camila flags inn ahead; region **settling the swamps**; rumors of missing people with no tells (2026-06-14)  
- Past mountains (snowy peaks, valley + stream) → horizon of **bogs, marshes, tree cover** (GM 2026-07-26 19:12–19:19)  
- Wooden road signs through bog; mildew smell; donkey/cart into village foot (GM 2026-07-26 19:44)  

**Halkin-Gaul (arrival only — no interior investigation yet)**

- Homes: **cobblestone + white plaster**  
- Scale: about **100–200 homes**  
- Site: **slightly raised outcropping** of dirt and rock amid bog  
- Roads: few **dirt roads**; dirt **squelches**  
- People: **seedy**, keep to themselves; scowl or ignore; not actively hostile  
- Guard shack: **wood + artisanally cut stone** (stands out)  
- Town hall: larger building, steps, **oak doors**; locals smoking pipes on steps  
- Session ends as party pulls up — “begin next session” (GM 2026-07-26 19:59)

**Explicit non-merges**

- **Blackdoor Inn** murder (Vesper, stab + sulfur) is a **road pitstop**, not Halkin-Gaul. Party already doubts “serial stabbing demon” = disappearance culprit (Prim 2026-07-26 19:17).  
- Early **“boglin”** talk = player slang for **goblin** Fenrir Hills job, **not** a named swamp species in export.

### 4B. Gaps (authoring / GM)

| Gap | Why it matters |
|-----|----------------|
| Cause of disappearances | Never revealed in export |
| Who hired the guild | Unknown |
| What evidence vanishings leave | Unknown |
| Blackdoor ↔ Halkin link | Unconfirmed |
| Named Halkin NPCs / maps | None in export |
| Post–2026-07-26 play | None in bot export |
| DMs | Out of scope for bot |

See also `../analysis/define-with-gm.md` and `../worldbuilding/swamp/HALKIN-GAUL.md` (proposals marked).

### 4C. Quotes / paraphrases with message refs

**Contract environment**

> “10 days by horse cart” … “ets fawr. Swampy too. Overcaset”  
> — `#main-rp` · **2026-05-24 19:06 UTC** — WHOLESOMEest Boi

> “An investigation… investigate a town regarding seceral problems as they lack adventurers to defend against monsters. As well as a few dissapearences. Discretion is tantamount” / “You will be on your own”  
> — `#main-rp` · **2026-05-24 18:50 UTC** — WHOLESOMEest Boi

**Table rumor texture (not proven)**

> “Hags, undead, swamp people.” *A shrug.* “Could be anything.”  
> — `#main-rp` · **2026-05-24 19:17 UTC** — Thesaurus (Ata)

> “So it's the same case as the boglin den again…”  
> — `#main-rp` · **2026-05-24 18:53 UTC** — Vyllynn Alword  
> (compare early board = goblins; not swamp fauna)

**Road / Camila**

> Days of travel… barren and repetitive sights of the swamps… main road… properly paved in stone… humid, muddy moors…  
> — `#main-rp` · **2026-05-31 19:44 UTC** — Prim (Camila entrance)

> “…they're in the process of settling the swamps… People have gone missing! … nobody knows a darn thing!”  
> — `#main-rp` · **2026-06-14** — Camila (see extract / timeline)

**Name lock**

> `The quest sheet lists the town name as Halkin-Gaul`  
> — `#main-rp` · **2026-06-07 18:10 UTC** — WHOLESOMEest Boi

**Arrival (core swamp scene)**

> Finally when they crossed the mountains, they could see the swampy lands before them, bogs, marches, and lots of tree cover as far as the eye could see.  
> — `#main-rp` · **2026-07-26 19:19 UTC** — WHOLESOMEest Boi

> The slight smell of the mildew from the swamps wafted up as the donkey trecherously made its way through the bog, following the wooden road signs to the foots of the village. there, they spotted homes, made of cobblestones and white plaster. It looked to be around 100–200 homes, all along a slightly raised outcropping of dirt and rocks… The dirt squelched…  
> — `#main-rp` · **2026-07-26 19:44 UTC** — WHOLESOMEest Boi

> No one paid them much head, maybe a scowl or two… Not entirely unfriendly, but the type that didn't speak much… The nearby guard shack was plainly different. Built of wood and artisinally cut stone blocks  
> — `#main-rp` · **2026-07-26 19:50 UTC** — WHOLESOMEest Boi

> Pulling into a larger one of the buildings with steps going up to a pair of oak doors… a few throngs of people smoking pipes on the steps…  
> — `#main-rp` · **2026-07-26 19:59 UTC** — WHOLESOMEest Boi  
> *(Gonna end here, so we can begin next session)*

**Reply snowflake example (swamp banter):** Vyllynn swamp-monster jab → message `1508186278380965969` in channel `1495469564060893254` (reply link in export at 2026-05-24 19:14).

### 4D. Authoring hooks (evidence-only)

Safe to write from Discord without inventing:

- Cold overcast frontier swamp basin past mountains  
- Settler town on a **hard rise**; wet everywhere else  
- Insular locals; nicer **guard stone**; town hall as first question stop  
- Job tension: **several problems** (monsters vs quiet vanishings) + **discretion**  
- Road stain: Chelcins + Vesper murder may or may not connect  

Do **not** lock as canon without GM: culprit class, kingdom name, Blackdoor spelling, hall clerk names, NEXT-ARC wraith/necromancer foils (`../worldbuilding/swamp/NEXT-ARC-HALKIN-GAUL.md` = **[proposal]** only).

---

## 5. Spoilers vs player-safe notes

### Player-safe (already at table)

- Job terms, travel time, swamp climate, Halkin-Gaul name and arrival description  
- Camila join; Chelcins meet; Vesper dead at Blackdoor; investigation threads existed  
- Party theories (hag / undead / mud disposal) as **rumors only**  
- Cliffhanger: at town-hall steps, no answers yet  

### Soft spoiler / keep in GM notes

- Whether Blackdoor sulfur-stab is related to swamp vanishings (**OPEN**)  
- Any NEXT-ARC culprit scaffolding (wraith / necromancer / adult NC seeds) — **not played**, **[proposal]**  
- Exact inn spelling **Blackdoor** vs GM typo “blackdoor in.”  

### Hard spoiler / adult (export present; not swamp-plot)

- `#main-rp` and threads include explicit sexual banter and Room Clearing loot (toys/condoms). Separate from swamp mystery; do not dump into player-facing swamp lore docs without intent.  
- Leanora sheet blurb includes lewd magic note; Camila sheet has SPOILER attachments in export.

### Out of band

- Private DMs (character facts may live there — **unknown**)  
- Anything after 2026-07-26 if it only happened offline / undiscorded  

---

## 6. Related artifacts (do not duplicate invent)

| Path | Use |
|------|-----|
| `../discord-export/snapshot-2026-08-09/` | Raw export |
| `../analysis/discord-swamp-extract.md` | Prior swamp fact table |
| `../analysis/campaign-timeline.md` | Full beat list |
| `../analysis/define-with-gm.md` | Open choices worksheet |
| `../worldbuilding/swamp/HALKIN-GAUL.md` | GM bible draft (canon vs proposal) |
| `../LOCKS.md` | Discord-cited locks only |
| `../players-characters.md` | Roster |
| `../scenes/swamp-scene.md` | **GM-ready playable scene** — Halkin-Gaul arrival from hall steps (aligned to this report) |
| `../story/halkin-gaul-arrival.md` | Current Story packet |
| `../discord.json` | Canonical Discord IDs |

---

## 7. Verify notes (this pass)

- Potato: `snapshot-2026-08-09` category-summary present; `export_discord_lore.py` OK; `#main-rp` messages.md **8904** lines; campaign-rp interview threads listed.  
- No fresh bot export this holder — same-day sibling ingest already EXIT 0; last play still **2026-07-26**.  
- Report lives under `reports/` as requested; prior extracts under `analysis/` remain valid SoT companions.
