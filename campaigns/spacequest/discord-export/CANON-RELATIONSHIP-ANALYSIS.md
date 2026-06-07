# Canon corpus — relationship analysis

**Channels covered:** `#loredoc`, `#characters`, `#dm-screen-spbs`, `#rp`, `#corpo-station` (Space Base V2 export, `messages.md` per folder).

**Elasticsearch:** Every Discord message block (`### timestamp — author`) is one document in `discord-export/elastic-bulk/messages-bulk.ndjson` (index `spacequest-discord-canon`). Curated edges are in `elastic-bulk/relationships-bulk.ndjson` (index `spacequest-discord-relations`). Each doc includes `obsidian_uri` (path under the SpaceQuest vault) and `line_start` so you can jump to the line in the markdown file.

**Regenerate message index:** `python scripts/discord_messages_to_elasticsearch_ndjson.py`

---

## 1. Stable entity IDs (for relations graph)


| ID                              | Kind      | Description                                         |
| ------------------------------- | --------- | --------------------------------------------------- |
| `ent:concordium`                | setting   | Name for all known civilization                     |
| `ent:feigned_anarchy`           | theme     | Petty fiefdoms; nobody dissolves the whole          |
| `ent:party_contractors`         | party     | Shipboard explorers / salvage crew                  |
| `ent:remote_corporation`        | faction   | Employer for blacksite job                          |
| `loc:blacksite_station`         | location  | Decades-abandoned research station (mission target) |
| `plot:bioengineered_plague`     | plot      | Fertility / futa rarity                             |
| `pc:cherish` … `pc:geli_pelsin` | character | See dossiers below                                  |
| `item:endo`                     | construct | Red’s Steel Defender / prototype                    |
| `loc:theta_h22`                 | station   | Meet-up point; Lucky Gal                            |
| `loc:corpo_market`              | location  | Live boards, vendors, guards                        |


Dossier links (vault): [[characters/pcs/cherish]], [[characters/pcs/daji]], [[characters/pcs/red-emilia]], [[characters/pcs/aurora]], [[characters/pcs/smolder-schwanzreiter]], [[characters/pcs/geli-pelsin]]

---

## 2. `#loredoc` — line / message–by–message

File: `discord-export/Space Base V2-1469873840703144060/loredoc-1469876798614405274/messages.md`


| Line | Time (UTC)       | Author           | Content summary                                                                           | Relationships                                                                                         |
| ---- | ---------------- | ---------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 9    | 2026-02-08 02:11 | WHOLESOMEest Boi | Interstellar humanoids; prosperity → ossification; decay/decadence; Homo Sapiens majority | Sets **scale** for `ent:concordium`; exploration genre                                                |
| 19   | 02:19            | same             | Feigned anarchy; petty fiefdoms; **party = shipboard explorers**; name **Concordium**     | `ent:concordium` **names** setting; `ent:party_contractors` **aligned** with [[story/arc-structure]]  |
| 29   | 02:23            | same             | Robots in workforce, slurs; **plague** → rare fertile men/futas, hard pregnancy           | `plot:bioengineered_plague` **pressure** on [[characters/pcs/geli-pelsin]] + nursery themes           |
| 39   | 02:43            | same             | **Corporate gig**: salvage **dataterms** blacksite; outside hires disposable              | `ent:remote_corporation` → `loc:blacksite_station` **mission**; ties [[story/station-and-antagonist]] |
| 47   | 02:25            | same             | Image attachment                                                                          | Visual only                                                                                           |
| 53   | 02:26            | same             | Image attachment                                                                          | Visual only                                                                                           |
| 59   | 02:26            | same             | Space cops / strip searches (*subject to change*)                                         | **Authority × sex** tone; not yet in play                                                             |
| 66   | 03:18            | same             | Short gag line + video                                                                    | Non-canon color                                                                                       |


---

## 3. `#characters` — line / message–by–message

File: `discord-export/Space Base V2-1469873840703144060/characters-1469873902208421997/messages.md`


| Line | Author              | PC          | Relationships                                                                                                           |
| ---- | ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| 9    | Hiatus Cause Life   | **Cherish** | **Kinship hints:** Dru-Nkar, Tyreen, Vocar/Cree, Preeva, GOO corruption — **outsider** identity; **psionics**; CH rogue |
| 31   | WHOLESOMEest Boi    | *(ping)*    | OOC                                                                                                                     |
| 37   | Myra Secretive Town | **Daji**    | Aasimar scourge barbarian; soldier; **TBA** backstory                                                                   |
| 70   | Ready for Bed       | **Red**     | **Artificer**; sexbot industry; **ex + cult + murders**; **Endo**; **Francessca** brand; **Lady in Purple**             |
| 100  | Honeydew            | **Aurora**  | Rogue assassin; guild artisan; **TBA** backstory                                                                        |
| 119  | Huatu               | **Smolder** | **Twilight cleric**; LG; **rancher** heroism → mercenary escape from fame                                               |
| 144  | Twinkie             | **Geli**    | **GOO warlock**; telepath; futa hidden; **libido**; poverty → mercenary                                                 |


---

## 4. `#dm-screen-spbs` — line / message–by–message

File: `discord-export/Space Base V2-1469873840703144060/dm-screen-spbs-1472402938327728383/messages.md`


| Line  | Summary                                                                                                                                                                                    | Ship relationships (spatial / system)                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 9–46  | **Upper** deck: cockpit → armory → **nursery** (port) / **pleasure pod** (starboard). **Lower:** living/gym, galley, bunks, engineering/cargo; **stealth**, **spinal cannon**, **turrets** | `ship:cockpit` **→** `ship:armory_ready`; nursery **vs** pleasure **same tier**; cargo **↔** contraband hatches |
| 50–91 | **Galley** detail: Culinator 9000, **flavor boost** water (euphoric), **briefing** holo on mess table                                                                                      | **Social hub** links **mission planning** ↔ **crew bonding**                                                    |


---

## 5. `#rp` — message flow (parent channel)

File: `discord-export/Space Base V2-1469873840703144060/rp-1469873871036612855/messages.md`

**Beat A — Dock & bar (≈L9–L80):** Smolder → **Theta-H22** → **Lucky Gal** → **Meeting Room 2**; sensory overload; **black op** pay **~1M** for captain arc.

**Beat B — Crew in room (≈L90–L200):** Aurora (gaming), Daji (bunny server), Red+Endo→Aurora, Cherish pole, **Geli** (Beli typo) bookish; **Smolder** asserts captain.

**Beat C — Corp recording (≈L204–L214):** **Abandoned research station**, **1M each**, **one month**, **jump point** to Smolder.

**Beat D — Tension (≈L216–L256):** Aurora **↔** Smolder (authority); Cherish **↔** secrecy; Aurora “free money” → move to ship.

**Beat E — Ship ingress (≈L288–L327):** Umbilical, decon, **nursery** colors, **cribs**, ladder; Smolder rules; Aurora wants **computers**.

**Beat F — Routing (≈L331–L363):** **Cockpit** / **Living** / **Cafeteria** / **Bunks**; Daji “where do we sit.”

**Beat G — Thread splits (L367+):** GM posts thread titles (Cockpit, Armory, Nursery, Medical, Canteen, Bunks, Cargo, Living). Cherish → cafeteria.

**Beat H — Resume (L429):** Feb 22 session.

*Full line-level rows: 56 messages in parent + use **Elasticsearch** `messages-bulk.ndjson` (filter `channel_key: rp`) — 150 total docs include all five channels.*

---

## 6. `#corpo-station` — message flow

File: `discord-export/Space Base V2-1469873840703144060/corpo-station-1474987916701863936/messages.md`

**Beat A — Entry (L9–L52):** Marble hallway; Aurora **hacks** keypad; **Geli** + **Smolder** (name **Geli**); **corporate uniform** crowd.

**Beat B — Mall (L54–L148):** **Live commodity boards**; **Red** gropes Aurora; **magic scrolls** hyper-specific (incl. lewd combat); chem/bio **banned**.

**Beat C — Shopping (L176–L198):** Smolder **rubble + chem lab** prep; **~70k** quote.

**Beat D — Split (L224–L300):** Staff areas; **~100k** mission pool; **Aurora** slips away; threads **Exploring (Aurora)** / **(Daji & Geli)**.

**Beat E — Fuel econ (L322–L332):** Solid/liquid/ion/antimatter **price lore**.

**Beat F — Load (L342–L372):** Payment to ship; **3–4 hr** load; Smolder **datapad** broadcast to crew.

**Beat G — Terminals (L454):** **Robotic women** info kiosks.

**Beat H — Timeskip (L465):** Move to ship; OOC outfit deferral.

---

## 7. Cross-channel relationship map (curated)


| Relation      | Source → Target                 | Evidence                                     |
| ------------- | ------------------------------- | -------------------------------------------- |
| frames        | Concordium → contractors        | loredoc L19                                  |
| mission       | Corporation → blacksite         | loredoc L39                                  |
| demographic   | plague → Geli                   | loredoc L29 + [[characters/pcs/geli-pelsin]] |
| kinship       | Cherish → Dru-Nkar / Tyreen / … | characters L9                                |
| backstory     | Red → cult / ex murders         | characters L70                               |
| owns          | Red → Endo                      | characters L70                               |
| patron        | Geli → GOO                      | characters L144                              |
| spatial       | Cockpit → Armory                | dm-screen L16–18                             |
| contract      | Employer → Smolder (captain)    | rp L204–212                                  |
| interpersonal | Red ↔ Aurora                    | rp L118–200, corpo L63–L118                  |
| interpersonal | Aurora ↔ Smolder                | rp L216–246                                  |
| bonding       | Smolder ↔ Geli                  | corpo L29–L45                                |
| purchase      | Smolder → market vendor         | corpo L184–L196                              |
| world_rule    | Market → scroll economy         | corpo L146–148                               |


Bulk JSON for these edges: [[elastic-bulk/relationships-bulk.ndjson]] (ingest with same `_bulk` endpoint, index `spacequest-discord-relations`).

---

## 8. Links

- Message bulk: [[elastic-bulk/messages-bulk.ndjson]]  
- Relationship bulk: [[elastic-bulk/relationships-bulk.ndjson]]  
- Ingest notes: [[elastic-bulk/ingest-instructions.md]]  
- [[META-ANALYSIS]] (older scope notes)  
- [[../reference/README]]

---

*Generated: 2026-04-11. Re-run `discord_messages_to_elasticsearch_ndjson.py` after re-export to refresh line numbers.*