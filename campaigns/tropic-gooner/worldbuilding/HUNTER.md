# Isla Primavera — the Hunter layer (Hunter: The Reckoning silo)

**Chronicle:** Tropic Gooner ∪ Hunter: The Reckoning — one chronicle, `campaigns/tropic-gooner/`.
**Status:** new file, 2026-08-05. The Hunter silo's worldbuilding layer: the veil, the bestiary, the enemy groups, the cells, and the preparation doctrine. Canon grading follows `LORE-BIBLE.md` — **canon** cites a locked source, **[proposal]** is mine until the GM says otherwise, **[open]** is a GM call.
**Locks honored:** `wb-tg-masquerade` (mortal party town — monsters hidden), `wb-tg-threats` (cult, vampire, corrupt cops, serial killer, Stevens, other factions), `wb-tg-hunter-rules` (default Hunter + house rules), `wb-tg-rules` (WoD 20th baseline), `wb-tg-date` (2019), `wb-tg-factions` (no favor-debt anchors — nobody owes the party anything on paper).
**Companion code:** `scripts/tableslop/hunter-prep.js` implements the veil + preparation loop as a deterministic CLI; the case data there is the mechanical twin of the bestiary below. Design contract for combat stays here, in prose.

---

## The veil (the Sam & Dean rule, made mechanical)

The island's one law above all others is `wb-tg-masquerade`: this is a mortal party town, and the monsters are hidden. Not rare — *hidden*. There are more supernatural things on Primavera per square mile than the brochures have adjectives, and a tourist can spend a week inside a feeding rotation and go home with nothing worse than a sunburn and a story about great service. The veil is not a spell. It is an economy: licensed vice, sealed guest lists, a sanitation contractor, a law firm that rewrites autopsies, and two million visitors a year who are paying to not look closely. Nobody has to cast anything. The county does the work.

So the supernatural is hard to find — unless you look hard for it, on purpose, in the right places. That is the whole Hunter fantasy and it is now a mechanic.

**Every supernatural entity and event on the island carries a veil tier, 0 to 3.** The tier is how well the mundane story is holding *for a given observer* — the same ghoul attack is tier 0 for the cruise passenger, tier 2 for the Stevens driver who mopped it, and tier 3 for the hunter who found the manifest. Veil is knowledge-state, not world-state. It lowers with investigation. It does not go back up on its own — but the county is always trying to push it back up, and that is what Stevens & Co. and Coral Trace LLP are *for*.

| Tier | Name | What the observer sees | What the county files |
|------|------|------------------------|------------------------|
| **0** | Mundane cover | A dog mauling. A riptide. A bad batch. A medical event with a discretion clause. | The incident as ordinary; case closed on intake. |
| **1** | Seam visible | Details that don't line up: the van arrived before the call; the dog left no tracks; the RSVP name is on a headstone. | Still ordinary — the seams are deniable one at a time. |
| **2** | Pattern named | You know what *kind* of thing it is and where it holds turf. Its cover is transparent to you. | Ordinary on paper; somebody at Stevens bills it correctly. |
| **3** | Fully exposed | Identity, lair, schedule, weaknesses. Preparation is now possible; going loud is a choice, not an accident. | Whatever the hunter can't prevent them from filing afterward. |

**Mundane cover doctrine.** Everything gets a cover story, and the cover stories are *local*: this island has practiced explanations, the way it has practiced cocktails. A ghoul attack reads as a dog mauling — the CRT keeps a standing "stray pack" line for exactly this. A vampire court reads as the marina gala circuit, because it literally is the marina gala circuit. A fae glamour harvest reads as a burlesque season with a devoted following. The Dry Contract reads as a rain shadow and a good engineering department. The cover is never a lie pasted over the truth; it is the truth wearing its work uniform. That is what makes it durable, and it is why peeling it takes work instead of a lucky roll.

### Investigation actions

Four action types lower the veil. Each reveals **tells** — the observable seams in a cover story. Every tell in the bestiary is tagged with the action(s) that can reveal it: **[research]**, **[interview]**, **[surveillance]**, **[scene]**.

- **Research** — county records, property files, obits cross-referenced against RSVP lists, manifests against crate counts, the Ash List archive, Night Ledger's forecasts if you can read them. Reveals *paper tells*: provenance, priors, ownership, the decade where a face doesn't age. Costs time and library patience; near-zero heat. The Ash List is the island's research arm whether Marco Reyes likes it or not — two independent artifacts or one body photo plus a Coral Trace denial, that's the entry rule, and it is a good rule.
- **Interview** — witnesses, survivors, the Lunch Regulars at table 6, dock foremen at the 4 a.m. coffee, nurses who rotated off a floor, festival-committee aunts who know when to stop a kid from asking. Reveals *human tells*: what people saw and won't say officially. Costs trust; bad interviews raise heat — the county notices who asks.
- **Surveillance** — stakeouts, camera pulls, pattern-of-life: who meets whom at the marina after the gala, which corridor a gray van favors, whether a person shows up in photographs at all. Reveals *behavior tells*: schedules, routes, feeding patterns. Costs time and exposure; getting made is the standard failure.
- **Scene** — walking the site: tracks, residue, smells, cold spots, salt behavior, the humidity reading where it shouldn't be. Reveals *physical tells*. Cheapest in money, most expensive in risk — you are standing where the thing stood, and some of them come back.

**Crossing thresholds.** Tells accumulate veil progress. Tier 1 (seam visible) opens the case: the cover story is now a question. Tier 2 (pattern named) unlocks the **entity profile** — kind, turf, behavior. Tier 3 (fully exposed) unlocks **weaknesses**, and only then does preparation mean anything. A hunter who prepares at tier 1 is a person buying silver for a dog. The mechanical numbers (thresholds, per-tell deltas, reveal order) live in `hunter-prep.js` and its export; this document is the model, the code is the dials.

**The other meter: heat.** Veil is what you know. **Heat** is what the county knows about you. Interviews done badly, surveillance done sloppy, and — above all — collateral during the endgame raise heat, and heat is how hunters meet Capt. Renata Voss's tier system, Coral Trace's 48-hour NDA machine, or a Stevens invoice with their name in the description field. Heat events are emitted by the prep CLI in a documented shape (`--resolve`); the sim lane consumes them. The contract is written under the preparation doctrine below. Quiet work is the only cheap work.

---

## The bestiary

Fifteen entries: three Kindred, two ghoul entries, three ghosts, three cursed objects, one Garou, one fae court focus, and two island-unique things tied to locked lore (the Dry Contract, the Villa Miel harvest cult). Turf ties to the three focus cities and the fringes, per `REGIONS.md`. Danger runs 1–5: **1** a prepared hunter walks away bored; **2** prepared wins, unprepared gets hurt; **3** unprepared hunters disappear; **4** even prepared work leaves scars; **5** do not go alone, do not go loud, maybe do not go.

Cursed objects carry extra fields, per the GM ask: provenance in one line, what it does, how it is destroyed or laid, and where it might surface.

### Kindred (vampires)

**1. Elder Marisol del Castillo, the Gilded Anchor — vampire (elder)** [canon org, proposal detail]
- **Veil:** 1 · **Danger:** 5 · **Turf:** Paradise marina, the yacht club, the gala circuit (r01).
- **Mundane cover:** old money and philanthropy. The del Castillo surname sits on colonial land grants two centuries older than the marina [canon whisper, LORE-BIBLE]; nobody brings it up at the galas.
- **Tells:** [research] her name or her face recurring in gala photography across decades, unaged; [research] the land-grant overlap — the family never sold, only "managed"; [surveillance] she is never seen eating in public, and neither is anyone at her table [canon]; [interview] catering staff who work the club describe a table that orders and never eats, tipped too well to remember clearly; [scene] the marina rigging ticks all night and the slips with the best security cameras have a feeding roster, not a berth list.
- **Weaknesses (prep):** sunlight and fire, the classics, and she has had two centuries to make both expensive to deliver. The real lever is her supply chain: the VIP cruise-disembark roster she feeds from arrives 72 hours early from CiDance [canon] — disrupt the roster and the court starves politely and visibly. She will not break Elysium herself; the gala truce is armor she cannot take off.
- **Behavior:** patient the way old money is patient. She does not hunt; hunting is what poor predators do. Threats to the court are handled the way the county handles them — a cleanup contract, a rewritten autopsy, a donation that makes the question gauche. If she ever handles a problem personally, the problem was already over; she is simply the last thing it sees. Hunters do not fight her at tier 3. They *negotiate the terms of her noticing them*, and the smartest cell on this island treats the Anchor as weather.

**2. Envoy "Kingside," the Crimson Tithe — vampire** [canon]
- **Veil:** 1 · **Danger:** 4 · **Turf:** Jackedsonville — the Quay, casino back rooms, anywhere the night is loud (r03).
- **Mundane cover:** nightlife politics. A collective with an envoy reads as a club-owners' association with a spokesperson; the tax reads as protection money, because the visible layer of it *is*.
- **Tells:** [surveillance] camera pulls have a gap where a person should be — Kingside does not photograph; [research] the Tithe's street tax formalized in 2014, the same year the Crimson Quay rebrand failed, and the same people signed both papers [canon]; [interview] Quay Rojo's collectors talk about "the night owing" in a way that predates any gang [canon tension]; [scene] tribute routes can be walked from the marginalia in returned Book Nook paperbacks — dates, initials, street corners [STORIES seed 8]; [surveillance] Quay Nights casualties cluster on collection nights: the drunk, the alone, the app-mis-paired [canon].
- **Weaknesses (prep):** the classics — stake, sun, fire — plus the collective's structure: it cannot act without consensus, which makes it slow, and it needs the night *loud*, which makes it predictable. Dark the Quay and the Tithe starves and panics in that order. Recognized by three off-island princes [canon] — humiliate it and bigger fish arrive, which is a weakness wearing a strength's clothes.
- **Behavior:** a duchy, not a warband. Kingside speaks for a collective and has never once claimed to be a prince, and that precision is the whole personality: the Tithe wants its tax legible, its turf loud, its feeding confused for bad decisions tourists were going to make anyway. It scavenges rather than hunts, taxes rather than raids, and it is genuinely rattled when something that isn't with any faction eats in the dark during a power cut [STORIES seed 7] — the Tithe knows the island has things in it older than its ledgers.

**3. "The Plus-One" — vampire (thin-blood)** [proposal]
- **Veil:** 0 · **Danger:** 2 · **Turf:** migrates the tri-city — Paradise hotel bars, Porto suites, Quay apps (r01–r03).
- **Mundane cover:** a date gone wrong. Alcohol, a mugging, a tourist who partied too hard; the county has a form for each.
- **Tells:** [interview] victims remember a wonderful evening and nothing after the second bar, and they remember it *fondly*, which is wrong; [research] bite-pattern ER visits recur on a two-week orbit through the three cities; [surveillance] victims' phones all end their night in geofence range of the same after-hours spot; [scene] two punctures, healed too fast, and a waiter who swears the plus-one paid cash for a table of two and ate nothing [scene]; [research] no social footprint older than a year — the face is new everywhere it exists.
- **Weaknesses (prep):** thin blood means thin protection — sunlight and UV hurt it properly, a stake works, and it is addicted to its own app trail, which makes it the one entry in this book a new cell should cut its teeth on. It also cannot enter a room it wasn't invited into *while the invitation-holder is watching* — hotel doors are fine, a watched threshold is not [proposal house rule, pending GM].
- **Behavior:** a scavenger with a smartphone. It doesn't scheme, court, or tax; it swipes, charms, feeds, and moves before the county's paperwork catches up. It is afraid of the courts more than of hunters — the Tithe taxes it when noticed, the Anchor would erase it for making the marina sloppy — and that fear is the handle: it will run from a cell that looks connected, and running things leave trails.

### Ghouls

**4. "The Doorman" — ghoul, Anchor-bound** [proposal built on the canon wrist incident]
- **Veil:** 1 · **Danger:** 3 · **Turf:** Paradise marina parking, the yacht club service side (r01).
- **Mundane cover:** long-tenured valet captain. Staff turnover on the marina is such that nobody audits how long "long" is.
- **Tells:** [interview] a Tithe collector came north once and left with a broken wrist, and both courts called it nothing [canon incident] — marina staff remember *who* did the breaking; [research] staff photos across thirty years show the same man at the same door, unaged, always third from the left; [scene] he lifts things one-handed that valet captains do not lift one-handed; [surveillance] he drinks from a flask on shift that is not liquor, and he never, ever eats.
- **Weaknesses (prep):** the blood is the chain — cut him off the court's supply and the strength curdles into craving within weeks, and a craving ghoul makes mistakes. He is disciplined but not patient; the wrist incident is his template (provoke, over-answer, regret). Bullets he notices — ghouls are flesh — but a prepared hunter brings restraints and a reason for him to talk, not a firefight in marina parking.
- **Behavior:** a lifer. The door is his territory, the court is his god, and the flask is his sacrament; he is loyal the way employees of old families are loyal, because the alternative is aging thirty years in a month. He does not start fights — the wrist was a border ruling, delivered with a ghoul's arithmetic — but he finishes them, and Stevens bills the marina for the mopping.

**5. The Float Barn pack — ghouls (feral)** [proposal on the canon sealed-float hook]
- **Veil:** 0 · **Danger:** 3 · **Turf:** Porto Lujara — the float barns and dockside cold storage behind the Carnaval Route (r02).
- **Mundane cover:** dog packs and dock accidents. The CRT's "stray pack" line earns its keep here every unload night.
- **Tells:** [research] mauling reports cluster on unload nights and only on unload nights; [research/interview] crate counts don't match manifests and the people who notice get paid to stop noticing [canon texture]; [scene] a generator hums on a float that should have run dry [STORIES seed 4]; [scene] blood under the diesel smell, and scratch marks on the *inside* of the barn doors; [interview] the barn crew's senior man feeds something on Thursdays and calls it "the insurance."
- **Weaknesses (prep):** leaderless — their domitor is dead, off-island, or inside the float, and a feral pack without a domitor oscillates between frenzy and starvation; fire and daylight both work; they are *flesh*, so honest stopping power applies — this is the one bestiary entry where the shotgun is the correct answer; and they can potentially be adopted by a new domitor, which is a GM door, not a prep plan.
- **Behavior:** a kennel, not a conspiracy. They den where the crates are warm, eat what the unload nights provide, and keep — barely — to the schedule the domitor beat into them years ago. Carnaval week terrifies the barn crew because the schedule slips. The horror here is administrative: everybody on that dock already knows, and the knowledge is distributed one paycheck at a time.

### Ghosts

**6. The Drowned Bellhop — ghost** [proposal]
- **Veil:** 0 · **Danger:** 2 · **Turf:** CiDance Paradise flagship, floor 14 and the service shaft (r01).
- **Mundane cover:** elevator maintenance and plumbing condensation. Guest complaints get comped suites.
- **Tells:** [surveillance] the service elevator stops on 14 with no call registered, mostly on cleanup nights; [interview] guests report wet footprints that end at a wall, and staff who mention the shaft get rotated off the floor; [research] a bellhop "fell" down that shaft three years ago and Coral Trace sealed the accident report inside 48 hours [canon method]; [scene] a permanent cold spot at the shaft door, and the floor's brass name-tags tarnish overnight — except one, in lost-and-found, that stays bright.
- **Weaknesses (prep):** he is an anchor ghost — the sealed report and the name-tag are the tethers. Salt slows him at thresholds; cold iron holds a door against him; but the laying is not a fight: he wants the report public more than he wants anyone hurt. Expose the accident file — the Ash List exists for exactly this — and he goes quiet. A cell that fights him is doing Coral Trace's job for free.
- **Behavior:** he saw a cleanup from the wrong side of a door on floor 14, and someone decided the discretion clause covered him too. Now he re-enacts the last ninety seconds of his shift on cleanup nights: the elevator, the corridor, the wet walk to the shaft. He is not angry at the guests — he barely perceives them — he is angry at the *paperwork*, which makes him the most Paradise ghost imaginable.

**7. The Carnaval Drowned — ghost (collective)** [proposal]
- **Veil:** 1 · **Danger:** 2 normally, 4 during Carnaval week · **Turf:** Porto Lujara waterfront, the harbor mouth along the parade route (r02).
- **Mundane cover:** riptide statistics. The county publishes them annually, with the same chart.
- **Tells:** [research] party-cruise drownings cluster on the same spring tide, same hour, back a decade — the harbor sighs on schedule; [interview] brass-band veterans drop tempo at the same corner every year without agreeing to; [surveillance] cruise photos from the route show salt-wet figures on the seaward railing who boarded as nobody; [scene] during Carnaval the harbor water along the route runs colder than the bay by ten degrees and smells of perfume, not diesel.
- **Weaknesses (prep):** bound to the route and the week. Cold iron from the docks — a fire iron, a mooring hook — has authority over them by provenance. Blessed water cast from the *route itself* during the parade displaces them for the year. The permanent laying is naming: the county's drowned are filed as statistics, and a public naming of the dead — the Choir's committee minutes and the harbor master's log both have them — thins the collective one name at a time.
- **Behavior:** they are the bill for the week of sanctioned looking-away. Every Carnaval sells a window where the county doesn't watch, and some people go into the water in that window and come up as paperwork. The Drowned don't hate the living; they attend the parade the way they attended it alive, from the wrong side of the railing, and the living who fall in during the route report hands — some pushing down, more pushing up. Hunters should read that sentence twice before deciding what this case is.

**8. The Wrong-Door — ghost** [proposal on the canon wrong-door hook]
- **Veil:** 0 · **Danger:** 1 to hunters, 4 to the officers involved · **Turf:** a Jackedsonville tenement next to a licensed club, one sealed apartment (r03).
- **Mundane cover:** a gas-leak evacuation that never quite ends; the building stays half-empty by "pending inspection."
- **Tells:** [research] a CRT Tier-3 stack hit the wrong door on this block and the incident report's address was corrected *after* filing [STORIES seed 5 sideways / canon texture]; [surveillance] body-cam footage from the raid glitches at one apartment number, always the same one; [interview] officers request transfer off the beat and won't say why, and the balcony patrons who filmed it sold the clip nowhere; [scene] knocking in threes from inside the sealed unit, and the seal tape is never broken — the knocking comes from *inside* the seal.
- **Weaknesses (prep):** salt does nothing — he isn't bound by threshold rules, he's bound by *records*. The correction is the tether: get the incident report amended to the truth — the real address, the real name — and he stops knocking. He cannot be fought, only refused or answered. A hunter who "cleanses" him with force becomes his new subject, and he is *very* patient.
- **Behavior:** he is not angry at hunters, who did not kill him, and he is barely angry at the county, which kills on schedule; he is *correcting the record*, one knock at a time, forever, because nobody in the building will say his name in the same breath as the word "mistake." The officers on that stack dream in threes. The Ash List has the clip. Everyone involved is waiting for everyone else to file first.

### Cursed objects

**9. Object 14 — cursed object (class: unknown)** [proposal built on canon Ash List meme + reef-station blip]
- **Object:** a waterproof field notebook in a humidity-proof bag, the bag always faintly damp inside no matter what. **Veil:** 2 (the Ash List half-knows it as a meme) · **Danger:** 3 · **Turf:** InterFederal Shores, reef station 7; currently *in circulation* (r14 → tri-city gray market).
- **Provenance:** pulled out of reef station 7's logs — the station logged an "Object 14" recovered near the 120m sonar blip [canon: AquaTech's unpublished blip, REGIONS r14], and then the logs stopped numbering things at all.
- **What it does:** its pages rewrite themselves into tide tables for coasts that don't exist, and possession dries you out — you stop sweating first, then stop crying, then start numbering things. It is the Dry Contract's calling card [proposal link]: moisture near it goes *somewhere*, and the somewhere signs receipts.
- **Destroyed/laid:** it resists fire unless the fire is fed with salt — a salt-fueled burn on a dry dock, dawn, east wind. The clean lay is return: 120 meters down, on the blip, with the pages left open. Do not read it on the way down [proposal; GM may rule the return is its own arc].
- **Surfaces:** Ash List meme threads first [canon: half the moderation queue is "Object 14" traffic]; once in a Ledger Row pawn shop, priced as "surplus"; once in the estate sale of a coast-guard officer whose family did not open the bag.
- **Tells:** [research] the station's log numbering restarts at 14 every page — the archivist noticed, then stopped noticing; [scene] paper curls and salt-lines crumble near the bag; [interview] the pawn broker who held it describes the week he stopped dreaming about water.
- **Weaknesses (prep):** it is an object, not an entity — it does not fight; the *contract behind it* does. Salt in quantity, blessed containment, and never bringing it east of the bay.

**10. The Harvest Crown — cursed object** [proposal on the locked Choir arc]
- **Object:** the Villa Miel harvest-queen crown, woven each year from last season's cane and something older that the weavers do not discuss. **Veil:** 1 · **Danger:** 4 · **Turf:** Villa Miel festival-committee storage; worn publicly exactly one night a year (r04).
- **Provenance:** the committee's minutes record the same crowning paragraph verbatim back to the 1960s; the crown has been "re-woven annually" for sixty years and has never once looked new.
- **What it does:** it is the hive's antenna. The rite funnels the festival's appetite through the queen, and the queen hears the hive for a night; queens dream the same dream the week before crowning [interview tell]. Wearing it outside the rite is a standing invitation — to *it*.
- **Destroyed/laid:** unweave it strand by strand while naming every queen who wore it — the committee's minutes have the names, which is why the minutes are kept — or burn it *before* the harvest moon. After the moon it regrows with the cane; it has been burned after the fact at least twice.
- **Surfaces:** festival storage; once, mislabeled as folk art, in a Ruby Harbor estate sale — the buyer returned it within the week, by mail, no note.
- **Tells:** [research] the verbatim crowning paragraph, sixty years deep; [scene] cane flowers out of season in a spiral around the storage barn; [interview] a retired queen, now an abuela with opinions, will describe the dream if you bring good coffee and no recording.
- **Weaknesses (prep):** off-season it is nearly inert — the window matters more than the weapon; smoke befuddles its connection; blessed cutting tools, not blessed fire, for the unweaving.

**11. The Mirror Compact — cursed object (fae spill)** [proposal tied to the canon Mirror Court]
- **Object:** a dancer's compact from a Lagooni Seika burlesque dressing room; the glass shows you the face you were performing, not the face you have. **Veil:** 1 · **Danger:** 2 · **Turf:** drifted — estate sales, pawn shops, hotel lost-and-found (r10 → anywhere).
- **Provenance:** a Mirror Court performer left it in a dressing room, or it left *her*; the Court does not lose things, it mislays them into mortal circulation [proposal].
- **What it does:** glamour on loan — the user becomes what the room wants, a little more each use, and a little of the real face stays in the mirror each time. Old compacts of this line have *crowded* glass.
- **Destroyed/laid:** shatter it in front of its current owner while they look at their true reflection — the faces go home and the owner keeps whichever one is left; or reunite every stolen face with its owner first, after which the glass is just glass.
- **Surfaces:** hotel lost-and-found (a compact is the most lost-and-found object imaginable), pawn shops off the Carnaval Route, estate sales of retired performers.
- **Tells:** [interview] a performer who "found her look" overnight and can't find anything else — photos of her pre-season face read as a stranger to her; [scene] backstage mirrors covered during shows, by house rule, no exceptions [canon-adjacent: the Court's turf]; [research] the compact's make went out of production in the fifties, and the powder inside is fresh.
- **Weaknesses (prep):** cold iron breaks the glamour on contact — a fire iron held to the glass shows the crowd inside; salt across the lid seals it for transport. Do not look in it to check.

### The fringes (werewolf, fae)

**12. The Black Sand ridge-runner — werewolf (Garou)** [proposal on the canon pack]
- **Veil:** 1 · **Danger:** 5 · **Turf:** Black Sand Beach Preserve, the north-tip trails and the survey lines above the sand (r11).
- **Mundane cover:** feral dogs and turtle-poacher scares, backed by the eco-NGO's own safety briefings — the pack writes its own cover and files it with the county [canon: the NGO is the pack].
- **Tells:** [scene] dog tracks that change gait mid-trail, and claw marks on survey stakes eight feet up; [research] NGO staff who appear in no census, payroll, or visa file, year over year; [interview] condo survey crews quit en masse after night work and pay their own contract penalties without complaint; [surveillance] the preserve's night cameras fail in a moving pattern, not a fixed one.
- **Weaknesses (prep):** silver is real and so is the wolfsbane analog, and a prepared hunter *could* win the first exchange — the pack's response to losing a member is not a second exchange. The correct prep is not a loadout, it's a briefcase: the ridge-runner's war is with the Wyrm-tainted condo money behind the Development Consortium [canon], and a hunter who brings proof of the taint gets an ally. A hunter who brings silver gets a lesson.
- **Behavior:** it patrols. The preserve is its charge, the turtles are its neighbors, and the condo money is its war; it is not interested in the tri-city's appetites except where they leak north. It has watched hunters work the island before and files them the way it files weather — most pass, some turn, a few are useful. The Lantern Chapel remnant still has its letterhead somewhere, and the ridge-runner remembers the Chapel as the humans who *asked first*.

**13. The Lagoona Mirror Court — fae** [canon org, proposal detail]
- **Veil:** 1 · **Danger:** 3 · **Turf:** Lagooni Seika boardwalk — the burlesque rooms, the Sizzle Fest arches, backstage everywhere (r10).
- **Mundane cover:** show-business eccentricity. A devoted burlesque season with strange house rules reads as brand, and on the east coast it *is* brand.
- **Tells:** [surveillance] Sizzle Fest crowds cheer one beat too late, in unison, like a delayed broadcast; [research] performer headshots across seasons trend *younger*; [interview] patrons lose an hour between the boardwalk arches and remember it as the best part; [scene] every backstage mirror is covered during shows, by house rule, and the dressing-room iron is missing [canon-adjacent house detail]; [research] the Court's talent poaching reaches into CiDance "wellness retreat" packages — and two poached Sirens turned up beaten, nobody filed anything, everybody knows [canon: the CiDance–Sirens tension].
- **Weaknesses (prep):** cold iron, the oldest clause — it must touch them, which is why melee doctrine exists; their word binds them literally, to the comma, and they cannot read a contract the way a mortal lawyer can't read a spell; applause is the harvest — a silent house starves them faster than any weapon; salt at thresholds marks a dressing room they cannot glamour.
- **Behavior:** they are not cruel the way the Kindred are cruel; they are *thorough* the way producers are thorough. Glamour is their crop, applause is their harvest, and performers are their orchard — they prune, they graft, they do not ask the trees. The Court fears silence and litigation in that order, and its envoys negotiate with hunters the way they negotiate with venues: everything is a contract, and everything in the contract is meant.

### Island-unique (locked lore)

**14. The Dry Contract — phenomenon/entity** [canon-locked as a real plot engine, PRI-0607]
- **Veil:** 2 · **Danger:** 5 · **Turf:** the east side — Lagooni Seika outward toward East Bayby; strongest at the coast (r10, r16 fringe).
- **Mundane cover:** a rain shadow, a microclimate, and a very good engineering department. The east side simply doesn't flood, and the island is proud of it.
- **Tells:** [research] east-side humidity readings sit twenty points below the island model, every month, for years — the "something wrong with the humidity" of the locked lore is measurable; [research] the casino-hotels' water bills are flat for a decade while occupancy doubled; [research] a 1970s water-district charter names a signatory the county has no record of; [interview] east-side residents "don't dream about water anymore," and say so like it's a joke; [scene] salt-lines laid across the enforcement zone crumble to powder overnight — the salt dries from the *inside*; [scene] pools, fountains, and dehumidifiers all run low or dry, and maintenance logs call it evaporation in 90% humidity.
- **Weaknesses (prep):** it is not a creature, it is a *contract* — you cannot stake a clause. Void the terms: return the water — a genuine flood, or a blessed baptism of the signatory site; name the signatory, which is a research endgame the whole cell survives or doesn't; salt and blessed water in *quantity* break local enforcement in a small zone for a short time — enough to extract people, not to win. Offering it a better deal is a door the GM owns; the prep doctrine does not recommend it.
- **Behavior:** it keeps accounts. Moisture on the east side goes somewhere — sweat dries too fast, tears don't arrive, roofs never leak — and in exchange the east side never floods and the water bills never move. Somebody signed for the town, and the group that knows calls the arrangement the Dry Contract; the consent blur [canon: PRI-0607's one-liner] is that nobody alive consented and everybody pays. It does not hunt hunters; it *bills* them, and the collectors it sends are things the county files as drought, mold, and bad luck.

**15. The Hive under the cane — island-unique (Honeycomb Choir focus)** [canon org foreground arc, proposal detail]
- **Veil:** 1 · **Danger:** 4 · **Turf:** Villa Miel — the cane country inland of the festival town; its *distribution* runs island-wide (r04 + routes).
- **Mundane cover:** festival tradition and the apiary industry. Town pride with a parade.
- **Tells:** [research] honey barrel sugar content is wrong — and the wrong barrels move through IFC cold-chain manifests that otherwise check out [canon: IFC cold-chain + crate-count texture]; [research] the festival committee's minutes carry one verbatim paragraph, sixty years deep [shares the crown's tell — they are the same archive]; [interview] festival queens share a dream in the week before crowning, and the gratitude-circle converts in Paradise describe the *same* dream, four cities away [canon: the sunrise gratitude circle handbills]; [surveillance] cane flowers out of season in a spiral centered on the storage barn — visible from any small aircraft; [scene] the honey smells of the boardwalk, the gala, and the parade — it is flavored by *appetite*, and a scene worker with a good nose can read last year's festival in it.
- **Weaknesses (prep):** bee-logic — smoke calms and confuses its attention (a bee smoker is honest prep here, not a joke); cold — at the harvest moon it is enormous, off-season it is sluggish and nearly deaf; the crown (entry 10) is its antenna — unweave the crown off-season and the rite goes dark for a year; and it cannot cross running seawater — cane country is inland for a reason, and a retreat to the coast is a real retreat.
- **Behavior:** not a goddess — a *hive*. The Choir is the beekeeping apparatus: the festival committee tends it, the Miel Boys distribute its product without asking what's in the barrels [canon org + proposal link], the gratitude circles recruit its middle managers, and the festival feeds it one night a year with a town's worth of wanting. It does not hate, scheme, or speak; it *gathers*, and what it gathers is appetite, and business is good. The Choir's middle managers are as scared of it as anyone [STORIES seed 3 sideways, canon-flavored] — the correct endgame may be evacuating the beekeepers, not killing the bees.

---

## Enemy groups (supernatural organizations on the island)

Seven operating groups. Human fronts tie to `GROUPS.md` factions where canon allows; the links marked [proposal] are mine. Agendas and fears follow the why-chain rule: what they believe, what pressures them, what they choose to be afraid of.

| # | Group | Kind | Turf | Human fronts | Agenda | Afraid of |
|---|-------|------|------|--------------|--------|-----------|
| 1 | **The Gilded Anchor** [canon] | Kindred court | Paradise marina, yacht club, gala circuit (r01) | The yacht club and philanthropy calendar [canon]; the CiDance 72-hour VIP disembark roster [canon]; del Castillo land money [canon whisper] | Keep tourism *pretty*; feed controlled, via roster not hunting; stay the island's quietest landlord | The OF/streamer pipeline graph (PRI-0703) that no court controls [canon]; the Ash List's timestamp gaps; a young court member's sunlight discipline failure; depending on a mortal cleanup contractor that keeps receipts |
| 2 | **The Crimson Tithe** [canon] | Kindred collective | Jackedsonville Quay, casinos, alleys (r03) | Quay Rojo's tribute structure [canon: the gang pays the Tithe]; casino back rooms; the 2014 rebrand money [canon] | Keep the night *loud* and the tax legible; scavenge the festival casualties the licensed week provides | Quiet — a dark Quay starves and panics them in that order; the three off-island princes withdrawing recognition [canon]; the Anchor's contempt becoming policy; something that isn't with any faction eating in their dark [STORIES seed 7] |
| 3 | **The Honeycomb Choir** [canon, foreground arc] | Cult (hive-tending) | Villa Miel + island-wide routes (r04) | The harvest festival committee [canon]; the Miel Boys' honey distribution [proposal: they move product and don't ask]; the sunrise gratitude circles in Paradise [canon: handbills]; IFC cold-chain slack [proposal] | Feed the hive through festival appetite; recruit middle managers who are grateful, countable, and scared | An off-season investigation (their window is the moon, not the calendar); the crown being found and understood; a county health inspector with actual teeth; smoke |
| 4 | **The Lagoona Mirror Court** [canon: PRI-0603] | Fae court | Lagooni Seika boardwalk, burlesque rooms, Sizzle Fest (r10) | The burlesque scene itself [canon: glamour harvest]; a talent-poaching channel into CiDance retreat packages [canon: the Sirens tension]; Sizzle Fest production [proposal] | Harvest glamour; keep the applause coming; prune the orchard | Silence — an empty house starves them; cold iron at the stage door; their own contracts read literally back to them; hunters who *applaud on the wrong beat* |
| 5 | **The Black Sand Pact** [canon] | Garou pack | Black Sand Beach Preserve (r11) | The eco-NGO itself — cover they file with the county [canon] | Hold the preserve; kill the Wyrm-tainted condo money moving through the Development Consortium [canon] | Hunters who can't tell werewolf from Wyrm-thing; silver in civilian hands; being outed as ecoterrorists — the Visibility Board would love the headline |
| 6 | **The Dry Contract signatories** [canon-locked: PRI-0607] | Contract cult / phenomenon apparatus | Lagooni Seika outward, east coast (r10, r16) | A 1970s water-district charter with a signatory the county has no record of [proposal detail on canon lock]; east-side casino-hotel facilities management [proposal]; "whoever is answering the humidity" [canon line, `smatterings.md`] | Keep the contract paid — moisture goes somewhere, floods never happen, the bills never move | The signatory being named; a genuine flood on the east side; Object 14 surfacing where a hunter can read it |
| 7 | **Stevens & Co. Team 7** [canon] | Mortal — which is worse | Mobile, county-wide; marina and hotel priority clients | Stevens & Co. itself — the front is the company, licensed and invoiced [canon]; 56 staff, 16 three-person teams [canon] | Billable cleanup; keep the county's secrets *contractually*; Team 7 handles what the other fifteen teams are for deniability about [canon: wetwork reputation is locked real] | The Ash List's humidity-bag photo [canon]; a subpoena that names a team number; one of their own talking — mortality is their one shared weakness |

Two deliberate exclusions, per the locks: the **CRT** and **Coral Trace LLP** are enemy *pressure*, not supernatural groups — they are what heat feels like. And no former-PC faction owes the party anything (`wb-tg-factions`); the Tithe's Quay Rojo tribute is an org-to-org debt, which is the only kind on this island.

---

## Hunter cells (who hunts on Primavera today)

**The Imbued.** Per `wb-tg-hunter-rules` (default Hunter): the Messengers still call, and the called still answer with a creed — the island produces Avengers out of survivors, Judges out of whistleblowers, Innocents out of interns, Redeemers out of anyone who watched the Carnaval Drowned push a swimmer *up*. Sasha is the anchor case: she lives in Paradise (`wb-tg-sasha-base`), she noticed the seam in the carpet [canon], and the Ash List tags her "anomaly" [canon: kindred-county]. Her cell is the table.

**The Lantern Chapel remnant** [canon: PRI-0503]. The old guard — Orchid Falls vigilantes who hunted spa predators around Seaside Springs before the county learned to price that kind of thing. Mostly burned out, retired, or dead; their files survive in fragments and their name survives as a warning the old-timers give new hunters: the Chapel *won*, twice, and winning is how they got buried. One member still answers mail. [proposal: the mail reaches **Sister Aurea Finn**, 61, Seaside Springs — arthritis, a dead phone tree, and the island's only complete pre-Stevens map of what the county used to file as "animal."]

**The retired-hunter bar** [proposal]: **The Last Light**, on the Ruby Harbor bonfire strip (r09) — a bar that doesn't make the tourist maps, keeps its tiki-kitsch unironic, and waters nothing. Retired and between-hunt hunters drink there; the fireplace is cold iron from a wreck, the lost-and-found is 30% cursed, and the house rule is *no cases past the second drink*. The bartender comps any hunter who can name a thing they've actually laid. [GM owns whether the Chapel and the Last Light overlap.]

**The podcast amateur** [proposal]: **"The Humidity Hour,"** an east-side paranormal show run out of a Lagooni Seika storage unit by **Ondrej "Ondi" Paz**, 24 — good ears, wrong conclusions, rising downloads. He is the Ash List's "Object 14" meme traffic made flesh [canon meme], and his current season is three episodes from naming the Dry Contract out loud, which will make him either a hunter, a case, or a Stevens invoice. The cell that finds him first gets a researcher with an audience; the county is betting he stays a meme.

**The Ash List** [canon] is not a cell — it is the library every cell uses, and Marco Reyes is one contact away from the work [canon: locked recurring NPC]. Treat the List as infrastructure: two independent artifacts or one body photo plus a Coral Trace denial.

**How a new hunter gets pulled in** — the on-ramps, in order of frequency on this island: (1) the Imbued moment — the Messengers, the seam, the carpet [canon mechanism]; (2) you saw a Stevens cleanup you weren't scheduled to see, and the invoice you glimpsed had your building's name on it; (3) a Lunch Regulars joke that wasn't — table 6 tests people with the truth and hires the ones who laugh second [proposal mechanic on canon org]; (4) an Ash List entry with your address in it; (5) you survived something and the county rewrote your interview — the rewrite is the recruitment poster, because the one thing a rewritten survivor knows for certain is that the county *lies on letterhead*.

---

## The preparation doctrine (design contract for the endgame)

The GM's ask, made doctrine: hunters bring guns to a knife fight against things that barely notice bullets. Resolution favors correct preparation over raw stats — the bestiary's weaknesses are the only stats that matter. Melee matters against specific kinds. Collateral raises police heat, and heat is how the county fights back without ever believing in monsters.

**The prep loop.** Veil to tier 3 → weaknesses known → assemble the kit → plan the approach → resolve. The CLI (`hunter-prep.js --loadout` / `--resolve`) is the mechanical twin of this paragraph; the numbers live there, the reasons live here.

**Gear table** (static; the CLI's `GEAR` is generated from this table — price is 2019 USD, per `wb-tg-date`):

| Gear | Source | Price | Legality | Prep tags |
|------|--------|-------|----------|-----------|
| Rock salt, 25 lb | hardware store / grocery | $15 | legal | ghost-lines, fae-thresholds, contract-enforcement zones |
| Cold iron bar (fire iron, dock salvage) | blacksmith / dock salvage | $120 | gray (salvage paperwork) | fae — must *touch*; ghost thresholds; mooring authority over the drowned |
| Silver (shot load or blade) | black market | $400 | gray (legal to own, suspicious to buy) | werewolf — the one kind silver settles |
| UV rig (reptile lamps, handheld array) | pet / hardware store | $90 | legal | vampire — thin-blood effective, elder-irritant |
| Hardwood stakes, fire-hardened | hardware lumber | $10 | legal | vampire — delivery is the problem, see melee |
| Blessed kit (holy water, chalk, cord) | church donation | $40 | legal | vampire, ghost-laying, contract zones, crown unweaving (blessed *cutters*) |
| Road flares / accelerant | hardware / gas station | $25 | legal purchase, **illegal use** | vampire, ghouls, hive (off-season only), salt-fed object burns |
| Bee smoker | farm supply | $35 | legal | hive — bee-logic, not a joke |
| Machete | farm supply | $30 | legal-ish | ghouls, cult mortal muscle — melee where flesh is honest |
| Shotgun, county permit | sporting goods | $350 | legal-with-permit, **heat-heavy** | mortals and ghouls only — see gunplay |
| Surplus vest | black market | $300 | gray | generic survival — the county sells its own mistakes back |
| Running seawater | the bay | free | legal | hive — it cannot cross running seawater; retreat lines |

**Gunplay, honestly.** Guns solve *people*, not monsters. Against Kindred, bullets are noise — an elder barely notices and the county notices plenty; against ghouls and mortal cult muscle, a shotgun is honest work, because flesh is honest. Every firearm row in the table carries a heat flag because every gunshot in the tri-city is a CRT optics problem, and the CRT does not need to believe in anything to ruin a cell. The gun is for the doorman's *friends*, the barn crew's bad night, the Choir's hired security — the human perimeter around the thing you actually came for.

**Melee, honestly.** Melee matters where the payload must arrive by hand: a stake is a melee delivery system, cold iron only works on *contact* with the fae, and you do not shoot a ghost — you lay it, with the report, the name, or the corrected record. Cells that plan firefights against tier-5 entries are writing their own Ash List entry.

**Outcome model.** Three outcomes: **clean win**, **win with cost**, **disaster**. Preparation moves probability — correct kit plus known weaknesses buys clean wins at low danger and survival at high; rushing buys costs and disasters in proportion to danger. The exact tables are generated and validated in the CLI (`--self-check` proves they sum to 1 per mode and danger); design intent: at danger 2, prepared ≈ mostly clean; at danger 5, prepared ≈ win-with-cost is the *good* outcome, and rushed is a coin flip between cost and disaster. No table grants certainty. The island does not do certainty.

**Heat events (sim-lane contract).** `--resolve` emits zero or more heat events as JSON. Shape, stable for the sim lane to consume:

```json
{ "event": "heat", "case": "thin-blood-plus-one", "source": "gunfire|collateral|witness|cleanup_bill",
  "severity": 1, "faction": "CRT|Stevens|Visibility Board|Coral Trace", "note": "one line, diegetic" }
```

Severity 1 = paperwork (a form, a forecast, a name in a description field); 2 = attention (a sergeant, a forecast bought, a Lunch Regular asking who you are); 3 = response (a tier, an NDA machine, a Stevens team re-tasked). Sources: `gunfire` (any firearm discharge), `collateral` (bystander/property), `witness` (survivors who talk), `cleanup_bill` (Stevens invoices the county — someone reads those). The sim lane owns what heat *does* next; this silo only emits. Documented here, not implemented there.

---

## Case hooks on the board

The bestiary entries double as case seeds; the CLI ships all fifteen as cases (`--list`). Table-facing hooks already exist in `STORIES.md` and the encounter decks — the seams are the same seams: the early van (seed 1 → entry 6's corridor), the gratitude circle (seed 3 → group 3), the sealed float (seed 4 → entry 5), the marginalia (seed 8 → entry 2), the lights-out (seed 7 → group 2's fear), the overtime forecast (seed 5 → heat, personified). Villa Miel and the Dry Contract are queued behind real table time, per the STORIES footer — their entries here are prep, not permission to skip the line.

## Open questions for the GM

1. **The Plus-One's threshold rule** — the "watched threshold" house rule on entry 3 (invitation only holds while the inviter watches). Options: (a) keep as house rule for thin-bloods only; (b) drop it, classic WoD hospitality; (c) extend it to all Kindred on the island as a local metaphysic. [open]
2. **Sister Aurea Finn and the Last Light** — confirm the Chapel survivor and the Ruby Harbor bar, or fold both into one location/person. [open]
3. **Ondi Paz's season finale** — does the podcast name the Dry Contract, and which of the three outcomes (hunter / case / invoice) does the table want on deck? [open]
4. **Object 14's return** — is returning it to the blip a laying, a delivery, or a negotiation? [open]
5. **Does the Choir's hive have a face?** — options: (a) never, it stays weather-with-accounts; (b) one queen, once, at a harvest moon; (c) the face is the crown and it has been worn sixty times. [open]

---

## Cross-refs

`LORE-BIBLE.md` (island frame, "what lurks," aesthetic/voice) · `GROUPS.md` (mortal factions and their canon tensions) · `STORIES.md` (nine seeds; the veil's seams in story form) · `REGIONS.md` (turf map; Villa Miel and Lagooni Seika first in the deferred line) · `reports/open-threads.md` (the locked threat roster this file operationalizes) · `reports/organizations/kindred-county.md` (the two courts) · `reports/organizations/smatterings.md` (PRI index: Mirror Court 0603, Honeycomb Choir 0606, Dry Contract 0607, Lantern Chapel 0503) · `reports/worldbuilding-decisions.md` (the locks) · `scripts/tableslop/hunter-prep.js` (the mechanical twin: veil loop, gear, outcomes, self-check) · `scripts/linuxbox/tableslop-static/hunter/` (the case-board UI over the CLI's export).

*Voice note for whoever writes here next: the veil is an economy, not a spell. The county does the hiding. Hunters are the people the economy forgot to bill.*
