#!/usr/bin/env node
"use strict";
/*
 * hunter-prep.js — Hunter: The Reckoning preparation prototype (Isla Primavera / tableslop)
 *
 * Zero deps, deterministic (seeded per case). Mechanical twin of
 * campaigns/tropic-gooner/worldbuilding/HUNTER.md — that file is the model, this file is the dials.
 *
 * Usage:
 *   node hunter-prep.js --list
 *   node hunter-prep.js --case <id>
 *   node hunter-prep.js --case <id> --action research|interview|surveillance|scene
 *   node hunter-prep.js --case <id> --actions research,scene,interview,...   (accumulates veil)
 *   node hunter-prep.js --case <id> --loadout
 *   node hunter-prep.js --case <id> --resolve prepared|rushed [--json]
 *   node hunter-prep.js --export [path]     (default: scripts/linuxbox/tableslop-static/hunter/hunter-data.js)
 *   node hunter-prep.js --self-check
 *
 * Stateless per invocation: --actions runs a whole investigation sequence in one run so veil
 * accumulation is visible end-to-end. The board UI persists progress client-side instead.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- deterministic PRNG (FNV-1a hash + mulberry32) ---------------- */

function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(ids, seedKey) {
  const rand = mulberry32(hashStr(seedKey));
  const out = ids.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/* ---------------- model constants ---------------- */

const ACTIONS = ["research", "interview", "surveillance", "scene"];

// Veil thresholds (HUNTER.md "The veil"): progress crossings unlock tiers.
const VEIL_TIERS = [
  { tier: 1, at: 2, label: "seam visible" },
  { tier: 2, at: 5, label: "pattern named" },
  { tier: 3, at: 8, label: "fully exposed" },
];

// Gear table — generated from HUNTER.md "Gear table". legality: legal | gray | illegal-use.
const GEAR = [
  { id: "rock_salt", name: "Rock salt, 25 lb", source: "hardware store / grocery", price: 15, legality: "legal", tags: ["salt"] },
  { id: "cold_iron", name: "Cold iron bar (dock-salvage fire iron)", source: "blacksmith / dock salvage", price: 120, legality: "gray (salvage paperwork)", tags: ["cold_iron"] },
  { id: "silver", name: "Silver load / silvered blade", source: "black market", price: 400, legality: "gray (legal to own, suspicious to buy)", tags: ["silver"] },
  { id: "uv_rig", name: "UV rig (reptile lamps, handheld array)", source: "pet / hardware store", price: 90, legality: "legal", tags: ["uv"] },
  { id: "stakes", name: "Hardwood stakes, fire-hardened", source: "hardware lumber", price: 10, legality: "legal", tags: ["stake"] },
  { id: "blessed_kit", name: "Blessed kit (holy water, chalk, cord, cutters)", source: "church donation", price: 40, legality: "legal", tags: ["blessed"] },
  { id: "flares", name: "Road flares / accelerant", source: "hardware / gas station", price: 25, legality: "illegal-use", tags: ["fire"] },
  { id: "bee_smoker", name: "Bee smoker", source: "farm supply", price: 35, legality: "legal", tags: ["smoke"] },
  { id: "machete", name: "Machete", source: "farm supply", price: 30, legality: "legal-ish", tags: ["melee"] },
  { id: "shotgun", name: "Shotgun, county permit", source: "sporting goods", price: 350, legality: "legal-with-permit, heat-heavy", tags: ["firearm"] },
  { id: "vest", name: "Surplus vest", source: "black market", price: 300, legality: "gray", tags: ["armor"] },
  { id: "seawater", name: "Running seawater (the bay)", source: "the bay", price: 0, legality: "legal", tags: ["seawater"] },
];

/* ---------------- cases (bestiary twin — 15 entries, HUNTER.md) ----------------
 * tell: { id, by: [actions], delta, desc }   — desc is the observable seam, one line.
 */

const CASES = [
  {
    id: "elder-anchor",
    name: "Elder Marisol del Castillo, the Gilded Anchor",
    kind: "vampire (elder)",
    turf: "Paradise marina, yacht club, gala circuit",
    region: "r01",
    danger: 5,
    veil_start: 1,
    mundane_cover: "Old money and philanthropy; the del Castillo name on colonial land grants two centuries older than the marina.",
    truth: "Camarilla-flavored elder running the Anchor court. Feeds off a VIP cruise-disembark roster delivered 72 hours early by CiDance — she does not hunt, hunting is what poor predators do.",
    weaknesses: [
      "Sunlight and fire — after two centuries she has made both expensive to deliver",
      "Her supply chain is the lever: disrupt the 72-hour CiDance roster and the court starves politely and visibly",
      "Elysium — she cannot break the gala truce herself; it is armor she cannot take off",
    ],
    gear_tags: ["uv", "stake", "blessed", "fire"],
    plan: "Do not bring a kit to Marisol del Castillo; bring a calendar. Document the gala circuit, intercept the roster handoff, and let the court starve on schedule.",
    tells: [
      { id: "elder-anchor-t1", by: ["research"], delta: 2, desc: "Gala photography across decades shows the same unaged face at the Anchor table." },
      { id: "elder-anchor-t2", by: ["research"], delta: 2, desc: "The del Castillo land grants predate the marina by two centuries; the family never sold, only 'managed'." },
      { id: "elder-anchor-t3", by: ["surveillance"], delta: 2, desc: "She is never seen eating in public — and neither is anyone seated at her table." },
      { id: "elder-anchor-t4", by: ["interview"], delta: 2, desc: "Catering staff describe a table that orders and never eats, tipped too well to remember clearly." },
      { id: "elder-anchor-t5", by: ["scene", "surveillance"], delta: 2, desc: "The slips with the best security cameras hold a feeding roster, not a berth list." },
    ],
  },
  {
    id: "kingside-tithe",
    name: "Envoy \"Kingside\", the Crimson Tithe",
    kind: "vampire",
    turf: "Jackedsonville Quay, casino back rooms, the loud night",
    region: "r03",
    danger: 4,
    veil_start: 1,
    mundane_cover: "Nightlife politics — a club-owners' association with a spokesperson; the tax reads as ordinary protection money.",
    truth: "Anarch-flavored collective that taxes street vice and scavenges festival casualties: the drunk, the alone, the app-mis-paired. Wants the night loud and stable.",
    weaknesses: [
      "The classics — stake, sun, fire",
      "Consensus-bound: the collective cannot act fast, only deliberately",
      "Needs the night loud — dark the Quay and the Tithe starves, then panics, in that order",
      "Recognition by three off-island princes: humiliate it and bigger fish arrive",
    ],
    gear_tags: ["uv", "stake", "blessed", "fire", "armor"],
    plan: "Map the tribute route from the marginalia, pick a collection night, and make the Quay go quiet at the worst possible hour — let starvation do the loud work.",
    tells: [
      { id: "kingside-tithe-t1", by: ["surveillance"], delta: 2, desc: "Camera pulls have a gap where a person should be — Kingside does not photograph." },
      { id: "kingside-tithe-t2", by: ["research"], delta: 2, desc: "The street tax formalized in 2014, the same year the Crimson Quay rebrand failed — same signatures on both papers." },
      { id: "kingside-tithe-t3", by: ["interview"], delta: 2, desc: "Quay Rojo collectors talk about 'the night owing' in a grammar that predates any gang." },
      { id: "kingside-tithe-t4", by: ["scene", "research"], delta: 2, desc: "The tribute route can be walked from marginalia in returned Book Nook paperbacks — dates, initials, corners." },
      { id: "kingside-tithe-t5", by: ["surveillance"], delta: 1, desc: "Quay Nights casualties cluster on collection nights." },
    ],
  },
  {
    id: "thin-blood-plus-one",
    name: "\"The Plus-One\" (thin-blood scavenger)",
    kind: "vampire (thin-blood)",
    turf: "Migrates the tri-city — Paradise hotel bars, Porto suites, Quay apps",
    region: "r01-r03",
    danger: 2,
    veil_start: 0,
    mundane_cover: "A date gone wrong: alcohol, a mugging, a tourist who partied too hard. The county has a form for each.",
    truth: "A thin-blood feeding on app-mis-paired tourists on a two-week orbit through the three cities. Afraid of both courts more than of hunters.",
    weaknesses: [
      "Thin blood means thin protection — UV and sunlight hurt it properly, a stake works",
      "Addicted to its own app trail — predictable to anyone who plots the geofences",
      "Watched thresholds hold it out (house rule, GM-pending): hotel doors are fine, a watched threshold is not",
    ],
    gear_tags: ["uv", "stake", "blessed"],
    plan: "Plot the orbit, be waiting at the after-hours geofence with UV and a watched threshold, and end it quietly before the county's paperwork notices it started.",
    tells: [
      { id: "thin-blood-plus-one-t1", by: ["interview"], delta: 2, desc: "Victims remember a wonderful evening and nothing after the second bar — and remember it fondly, which is wrong." },
      { id: "thin-blood-plus-one-t2", by: ["research"], delta: 2, desc: "Bite-pattern ER visits recur on a two-week orbit through the three cities." },
      { id: "thin-blood-plus-one-t3", by: ["surveillance"], delta: 2, desc: "Victims' phones all end the night inside the same after-hours geofence." },
      { id: "thin-blood-plus-one-t4", by: ["scene"], delta: 2, desc: "Two punctures, healed too fast; a waiter swears the plus-one paid cash for a table of two and ate nothing." },
      { id: "thin-blood-plus-one-t5", by: ["research"], delta: 1, desc: "No social footprint older than a year — the face is new everywhere it exists." },
    ],
  },
  {
    id: "ghoul-doorman",
    name: "\"The Doorman\" (Anchor-bound ghoul)",
    kind: "ghoul",
    turf: "Paradise marina parking, yacht club service side",
    region: "r01",
    danger: 3,
    veil_start: 1,
    mundane_cover: "Long-tenured valet captain; marina staff turnover means nobody audits how long 'long' is.",
    truth: "A ghoul lifer bound to the Anchor court — the wrist-breaker of the border incident. The door is his territory, the court is his god, the flask is his sacrament.",
    weaknesses: [
      "The blood is the chain — cut the court's supply and the strength curdles into craving within weeks",
      "Disciplined but not patient: provoke, over-answer, regret is his template",
      "He is flesh — restraints and a reason to talk beat a firefight in marina parking",
    ],
    gear_tags: ["melee", "armor", "blessed"],
    plan: "Document the flask schedule, interdict one delivery, and be there with restraints when the craving makes him sloppy — then offer him a way to talk that isn't betrayal.",
    tells: [
      { id: "ghoul-doorman-t1", by: ["interview"], delta: 2, desc: "Marina staff remember who broke the Tithe collector's wrist, and that both courts called it nothing." },
      { id: "ghoul-doorman-t2", by: ["research"], delta: 2, desc: "Staff photos across thirty years show the same man at the same door, unaged, always third from the left." },
      { id: "ghoul-doorman-t3", by: ["scene"], delta: 2, desc: "He lifts things one-handed that valet captains do not lift one-handed." },
      { id: "ghoul-doorman-t4", by: ["surveillance"], delta: 2, desc: "He drinks from a flask on shift that is not liquor, and he never, ever eats." },
    ],
  },
  {
    id: "float-barn-pack",
    name: "The Float Barn pack (feral ghouls)",
    kind: "ghoul (feral pack)",
    turf: "Porto Lujara — float barns and dockside cold storage behind the Carnaval Route",
    region: "r02",
    danger: 3,
    veil_start: 0,
    mundane_cover: "Dog packs and dock accidents; the CRT's standing 'stray pack' line earns its keep every unload night.",
    truth: "A leaderless ghoul kennel denning where the crates are warm, eating what unload nights provide, keeping — barely — to a dead domitor's schedule.",
    weaknesses: [
      "Leaderless: oscillates between frenzy and starvation without a domitor",
      "Fire and daylight both work",
      "Flesh — honest stopping power applies; this is the one entry where the shotgun is the correct answer",
      "Adoptable by a new domitor — a GM door, not a prep plan",
    ],
    gear_tags: ["firearm", "fire", "melee", "armor"],
    plan: "Pick a non-unload night, bring fire and honest stopping power, clear the barn from the doors inward, and do not open the sealed float until the pack is down.",
    tells: [
      { id: "float-barn-pack-t1", by: ["research"], delta: 2, desc: "Mauling reports cluster on unload nights, and only on unload nights." },
      { id: "float-barn-pack-t2", by: ["research", "interview"], delta: 2, desc: "Crate counts don't match manifests, and the people who notice get paid to stop noticing." },
      { id: "float-barn-pack-t3", by: ["scene"], delta: 2, desc: "A generator hums on a shrink-wrapped float that should have run dry." },
      { id: "float-barn-pack-t4", by: ["scene"], delta: 2, desc: "Blood under the diesel smell; scratch marks on the inside of the barn doors." },
      { id: "float-barn-pack-t5", by: ["interview"], delta: 1, desc: "The barn crew's senior man feeds something on Thursdays and calls it 'the insurance'." },
    ],
  },
  {
    id: "drowned-bellhop",
    name: "The Drowned Bellhop",
    kind: "ghost",
    turf: "CiDance Paradise flagship, floor 14 and the service shaft",
    region: "r01",
    danger: 2,
    veil_start: 0,
    mundane_cover: "Elevator maintenance and plumbing condensation; guest complaints get comped suites.",
    truth: "A bellhop who saw a cleanup from the wrong side of a door on floor 14 and 'fell' down the service shaft. He re-enacts his last ninety seconds on cleanup nights.",
    weaknesses: [
      "Anchor ghost — the sealed accident report and the bright name-tag in lost-and-found are the tethers",
      "Salt slows him at thresholds; cold iron holds a door",
      "He wants the report public more than he wants anyone hurt — expose the file and he goes quiet",
    ],
    gear_tags: ["salt", "cold_iron", "blessed"],
    plan: "Salt the corridor, pull the sealed accident report via the Ash List, and publish — the laying is a byline, not a fight.",
    tells: [
      { id: "drowned-bellhop-t1", by: ["surveillance"], delta: 2, desc: "The service elevator stops on 14 with no call registered, mostly on cleanup nights." },
      { id: "drowned-bellhop-t2", by: ["interview"], delta: 2, desc: "Guests report wet footprints that end at a wall; staff who mention the shaft get rotated off the floor." },
      { id: "drowned-bellhop-t3", by: ["research"], delta: 2, desc: "A bellhop 'fell' down that shaft three years ago; Coral Trace sealed the report inside 48 hours." },
      { id: "drowned-bellhop-t4", by: ["scene"], delta: 2, desc: "A permanent cold spot at the shaft door; the floor's brass name-tags tarnish overnight — except one in lost-and-found that stays bright." },
    ],
  },
  {
    id: "carnaval-drowned",
    name: "The Carnaval Drowned",
    kind: "ghost (collective)",
    turf: "Porto Lujara waterfront, the harbor mouth along the parade route",
    region: "r02",
    danger: 2,
    veil_start: 1,
    mundane_cover: "Riptide statistics, published annually with the same chart.",
    truth: "The bill for the week of sanctioned looking-away: party-cruise dead who attend the parade from the wrong side of the railing. Some hands push down. More push up.",
    weaknesses: [
      "Bound to the route and the week — they only hold strength during Carnaval",
      "Cold iron from the docks — a mooring hook, a fire iron — has authority by provenance",
      "Blessed water cast from the route itself displaces them for the year",
      "The permanent laying is naming the dead publicly, one name at a time",
    ],
    gear_tags: ["cold_iron", "blessed", "salt"],
    plan: "Work off-season: pull the harbor master's log, name the dead in print before the route, and keep dock-iron on the railing during the parade itself.",
    tells: [
      { id: "carnaval-drowned-t1", by: ["research"], delta: 2, desc: "Party-cruise drownings cluster on the same spring tide, same hour, back a decade." },
      { id: "carnaval-drowned-t2", by: ["interview"], delta: 2, desc: "Brass-band veterans drop tempo at the same corner every year without agreeing to." },
      { id: "carnaval-drowned-t3", by: ["surveillance"], delta: 2, desc: "Cruise photos from the route show salt-wet figures on the seaward railing who boarded as nobody." },
      { id: "carnaval-drowned-t4", by: ["scene"], delta: 2, desc: "During Carnaval the route's water runs ten degrees colder than the bay and smells of perfume, not diesel." },
    ],
  },
  {
    id: "wrong-door",
    name: "The Wrong-Door",
    kind: "ghost",
    turf: "Jackedsonville tenement next to a licensed club, one sealed apartment",
    region: "r03",
    danger: 1,
    veil_start: 0,
    mundane_cover: "A gas-leak evacuation that never quite ends; the building stays half-empty 'pending inspection'.",
    truth: "A raid victim correcting the record one knock at a time, forever. Not bound by thresholds — bound by paperwork. Danger 1 to hunters, 4 to the officers involved.",
    weaknesses: [
      "Salt does nothing — he is bound by records, not thresholds",
      "The correction is the tether: amend the incident report to the truth — the real address, the real name — and he stops knocking",
      "He cannot be fought, only refused or answered; force makes you his new subject",
    ],
    gear_tags: ["blessed"],
    plan: "No loadout — bring a folder. Get the raid's incident report amended to the true address and the true name, and say the name in the apartment.",
    tells: [
      { id: "wrong-door-t1", by: ["research"], delta: 2, desc: "A CRT Tier-3 hit the wrong door on this block; the incident report's address was corrected after filing." },
      { id: "wrong-door-t2", by: ["surveillance"], delta: 2, desc: "Body-cam footage from the raid glitches at one apartment number — always the same one." },
      { id: "wrong-door-t3", by: ["interview"], delta: 2, desc: "Officers request transfer off the beat and won't say why; the balcony patrons who filmed it sold the clip nowhere." },
      { id: "wrong-door-t4", by: ["scene"], delta: 2, desc: "Knocking in threes from inside the sealed unit — the seal tape never broken, the knocking from inside the seal." },
    ],
  },
  {
    id: "object-14",
    name: "Object 14",
    kind: "cursed object (class unknown)",
    turf: "InterFederal Shores reef station 7 → tri-city gray market",
    region: "r14",
    danger: 3,
    veil_start: 2,
    mundane_cover: "An Ash List meme. Half the moderation queue is 'Object 14' traffic; the serious editors burn out on schedule.",
    truth: "A waterproof field notebook in a humidity-proof bag, pages rewriting into tide tables for coasts that don't exist. Possession dries you out — you stop sweating, then crying, then start numbering things. The Dry Contract's calling card.",
    weaknesses: [
      "An object, not an entity — it does not fight; the contract behind it does",
      "Resists fire unless the fire is fed with salt",
      "The clean lay is return: 120 meters down, on the blip, pages left open — do not read it on the way down",
      "Never bring it east of the bay",
    ],
    gear_tags: ["salt", "blessed", "fire"],
    plan: "Track the gray-market chain, contain it in salt and blessed cord, and either burn it salt-fed on a dry dock at dawn or charter the drop to 120 meters.",
    tells: [
      { id: "object-14-t1", by: ["research"], delta: 2, desc: "Reef station 7's log numbering restarts at 14 every page; the archivist noticed, then stopped noticing." },
      { id: "object-14-t2", by: ["scene"], delta: 2, desc: "Paper curls and salt-lines crumble near the bag — the damp inside never dries." },
      { id: "object-14-t3", by: ["interview"], delta: 2, desc: "The pawn broker who held it describes the week he stopped dreaming about water." },
      { id: "object-14-t4", by: ["research"], delta: 2, desc: "It has surfaced twice: a Ledger Row pawn shop priced as 'surplus', and the estate sale of a coast-guard officer whose family never opened the bag." },
      { id: "object-14-t5", by: ["surveillance"], delta: 1, desc: "Ash List 'Object 14' meme spikes trace back to one coast-guard posting cycle." },
    ],
  },
  {
    id: "harvest-crown",
    name: "The Harvest Crown",
    kind: "cursed object",
    turf: "Villa Miel festival-committee storage; worn publicly one night a year",
    region: "r04",
    danger: 4,
    veil_start: 1,
    mundane_cover: "Festival tradition — re-woven annually, town pride, a parade accessory.",
    truth: "The hive's antenna. The rite funnels the festival's appetite through the queen, and the queen hears the hive for a night. Sixty years of 're-woven annually' and it has never once looked new.",
    weaknesses: [
      "Off-season it is nearly inert — the window matters more than the weapon",
      "Unweave it strand by strand while naming every queen who wore it — the committee's minutes have the names",
      "Burn it before the harvest moon; after the moon it regrows with the cane",
      "Smoke befuddles its connection",
    ],
    gear_tags: ["blessed", "smoke", "salt"],
    plan: "Move off-season with blessed cutters and the minutes' queen list; unweave in a salted room with a smoker going, and be off the island before the committee counts strands.",
    tells: [
      { id: "harvest-crown-t1", by: ["research"], delta: 2, desc: "The committee minutes carry the same crowning paragraph verbatim, sixty years deep." },
      { id: "harvest-crown-t2", by: ["scene"], delta: 2, desc: "Cane flowers out of season in a spiral centered on the storage barn." },
      { id: "harvest-crown-t3", by: ["interview"], delta: 2, desc: "A retired festival queen will describe the shared dream — for good coffee and no recording." },
      { id: "harvest-crown-t4", by: ["research"], delta: 2, desc: "It surfaced once mislabeled as folk art in a Ruby Harbor estate sale; the buyer mailed it back within the week, no note." },
      { id: "harvest-crown-t5", by: ["surveillance"], delta: 1, desc: "Committee storage keeps a climate bill the cane doesn't need — something in there is kept cool and moist on purpose." },
    ],
  },
  {
    id: "mirror-compact",
    name: "The Mirror Compact",
    kind: "cursed object (fae spill)",
    turf: "Drifted — estate sales, pawn shops, hotel lost-and-found",
    region: "r10",
    danger: 2,
    veil_start: 1,
    mundane_cover: "Vintage vanity; the most lost-and-found object imaginable.",
    truth: "A dancer's compact from a Lagooni Seika dressing room — glamour on loan. Each use makes you more of what the room wants, and a little of the real face stays in the glass. Old ones have crowded glass.",
    weaknesses: [
      "Cold iron to the glass shows the crowd inside and breaks the active glamour",
      "Salt across the lid seals it for transport",
      "Shatter it in front of its owner while they look at their true reflection — the faces go home",
      "Do not look in it to check",
    ],
    gear_tags: ["cold_iron", "salt"],
    plan: "Trace the lost-and-found chain, seal it salted in a cold-iron-lined box, and bring the owner to a true mirror before the glass gets more crowded.",
    tells: [
      { id: "mirror-compact-t1", by: ["interview"], delta: 2, desc: "A performer who 'found her look' overnight now reads her own pre-season photos as a stranger." },
      { id: "mirror-compact-t2", by: ["scene"], delta: 2, desc: "Backstage mirrors are covered during shows, by house rule, no exceptions — and the dressing-room iron is missing." },
      { id: "mirror-compact-t3", by: ["research"], delta: 2, desc: "The compact's make went out of production in the fifties; the powder inside is fresh." },
      { id: "mirror-compact-t4", by: ["surveillance"], delta: 2, desc: "Its owner is becoming what each room wants — the mannerisms change per venue like a delayed broadcast." },
    ],
  },
  {
    id: "ridge-runner",
    name: "The Black Sand ridge-runner",
    kind: "werewolf (Garou)",
    turf: "Black Sand Beach Preserve, north-tip trails and survey lines",
    region: "r11",
    danger: 5,
    veil_start: 1,
    mundane_cover: "Feral dogs and turtle-poacher scares, backed by the eco-NGO's own safety briefings — the pack files its own cover with the county.",
    truth: "A Garou patrolling its charge. The preserve is its post, the turtles are its neighbors, and the Wyrm-tainted condo money moving through the Development Consortium is its war.",
    weaknesses: [
      "Silver is real, and so is the wolfsbane analog — you could win the first exchange",
      "The pack's response to losing a member is not a second exchange",
      "The correct prep is a briefcase: bring proof of the condo money's taint and get an ally, not a fight",
    ],
    gear_tags: ["silver", "armor"],
    plan: "Do not pack silver for the ridge-runner; pack documents. Survey the Consortium's unpublished soil studies, carry proof up the trail in daylight, and let the pack's war do the rest.",
    tells: [
      { id: "ridge-runner-t1", by: ["scene"], delta: 2, desc: "Dog tracks that change gait mid-trail; claw marks on survey stakes eight feet up." },
      { id: "ridge-runner-t2", by: ["research"], delta: 2, desc: "NGO staff who appear in no census, payroll, or visa file, year over year." },
      { id: "ridge-runner-t3", by: ["interview"], delta: 2, desc: "Condo survey crews quit en masse after night work and pay their own contract penalties without complaint." },
      { id: "ridge-runner-t4", by: ["surveillance"], delta: 2, desc: "The preserve's night cameras fail in a moving pattern, not a fixed one." },
    ],
  },
  {
    id: "mirror-court",
    name: "The Lagoona Mirror Court",
    kind: "fae court",
    turf: "Lagooni Seika boardwalk — burlesque rooms, Sizzle Fest arches, backstage",
    region: "r10",
    danger: 3,
    veil_start: 1,
    mundane_cover: "Show-business eccentricity — a devoted burlesque season with strange house rules reads as brand, and on the east coast it is brand.",
    truth: "A fae court harvesting glamour off the boardwalk. Applause is the crop, performers are the orchard; they prune, they graft, they do not ask the trees.",
    weaknesses: [
      "Cold iron, the oldest clause — it must touch them, which is why melee doctrine exists",
      "Their word binds them literally, to the comma",
      "Applause is the harvest — a silent house starves them faster than any weapon",
      "Salt at thresholds marks a room they cannot glamour",
    ],
    gear_tags: ["cold_iron", "salt", "blessed"],
    plan: "Carry dock-iron on your person, salt the dressing-room thresholds, and negotiate nothing verbally — make them write it, then read the commas back.",
    tells: [
      { id: "mirror-court-t1", by: ["surveillance"], delta: 2, desc: "Sizzle Fest crowds cheer one beat too late, in unison, like a delayed broadcast." },
      { id: "mirror-court-t2", by: ["research"], delta: 2, desc: "Performer headshots across seasons trend younger." },
      { id: "mirror-court-t3", by: ["interview"], delta: 2, desc: "Patrons lose an hour between the boardwalk arches and remember it as the best part." },
      { id: "mirror-court-t4", by: ["scene"], delta: 2, desc: "Every backstage mirror is covered during shows by house rule; the dressing-room iron is missing." },
      { id: "mirror-court-t5", by: ["research"], delta: 1, desc: "The Court's talent poaching reaches into CiDance 'wellness retreat' packages — two poached Sirens turned up beaten and nobody filed anything." },
    ],
  },
  {
    id: "dry-contract",
    name: "The Dry Contract",
    kind: "island-unique (contract phenomenon)",
    turf: "The east side — Lagooni Seika outward toward East Bayby, strongest at the coast",
    region: "r10",
    danger: 5,
    veil_start: 2,
    mundane_cover: "A rain shadow, a microclimate, and a very good engineering department. The east side simply doesn't flood, and the island is proud of it.",
    truth: "Not a creature — a contract. Moisture on the east side goes somewhere; in exchange the east side never floods and the water bills never move. Somebody signed for the town. Nobody alive consented and everybody pays.",
    weaknesses: [
      "You cannot stake a clause — void the terms: return the water (a genuine flood, or a blessed baptism of the signatory site)",
      "Name the signatory — a research endgame the whole cell survives or doesn't",
      "Salt and blessed water in quantity break local enforcement in a small zone for a short time — extraction, not victory",
      "Offering it a better deal is a door the GM owns; the prep doctrine does not recommend it",
    ],
    gear_tags: ["salt", "blessed", "seawater"],
    plan: "Build the paper case first — charter, signatory, water bills — then break a small enforcement zone with salt and blessed seawater long enough to extract whoever the contract is billing.",
    tells: [
      { id: "dry-contract-t1", by: ["research"], delta: 2, desc: "East-side humidity readings sit twenty points below the island model, every month, for years." },
      { id: "dry-contract-t2", by: ["research"], delta: 2, desc: "The casino-hotels' water bills are flat for a decade while occupancy doubled." },
      { id: "dry-contract-t3", by: ["research"], delta: 2, desc: "A 1970s water-district charter names a signatory the county has no record of." },
      { id: "dry-contract-t4", by: ["interview"], delta: 2, desc: "East-side residents 'don't dream about water anymore', and say so like it's a joke." },
      { id: "dry-contract-t5", by: ["scene"], delta: 2, desc: "Salt-lines laid across the enforcement zone crumble to powder overnight — the salt dries from the inside." },
      { id: "dry-contract-t6", by: ["scene"], delta: 1, desc: "Pools, fountains, and dehumidifiers all run low; maintenance logs call it evaporation in 90% humidity." },
    ],
  },
  {
    id: "hive-cane",
    name: "The Hive under the cane (Honeycomb Choir focus)",
    kind: "island-unique (hive)",
    turf: "Villa Miel — cane country inland of the festival town; distribution runs island-wide",
    region: "r04",
    danger: 4,
    veil_start: 1,
    mundane_cover: "Festival tradition and the apiary industry. Town pride with a parade.",
    truth: "Not a goddess — a hive. The Choir is the beekeeping apparatus: the committee tends it, the Miel Boys distribute its product without asking, the gratitude circles recruit its middle managers, and the festival feeds it a town's worth of wanting one night a year.",
    weaknesses: [
      "Bee-logic: smoke calms and confuses its attention",
      "Cold — at the harvest moon it is enormous; off-season it is sluggish and nearly deaf",
      "The Harvest Crown is its antenna — unweave the crown off-season and the rite goes dark for a year",
      "It cannot cross running seawater — cane country is inland for a reason; a retreat to the coast is a real retreat",
    ],
    gear_tags: ["smoke", "blessed", "seawater", "salt"],
    plan: "Work off-season with smokers and blessed kit, unweave the crown first, and keep a running-seawater line between you and the cane while the committee is evacuated, not martyred.",
    tells: [
      { id: "hive-cane-t1", by: ["research", "scene"], delta: 2, desc: "Honey barrel sugar content is wrong — and the wrong barrels move through IFC cold-chain manifests that otherwise check out." },
      { id: "hive-cane-t2", by: ["research"], delta: 2, desc: "The festival committee's minutes carry one verbatim paragraph, sixty years deep." },
      { id: "hive-cane-t3", by: ["interview"], delta: 2, desc: "Festival queens share a dream before crowning — and Paradise gratitude-circle converts describe the same dream, four cities away." },
      { id: "hive-cane-t4", by: ["surveillance"], delta: 2, desc: "Cane flowers out of season in a spiral centered on the storage barn — visible from any small aircraft." },
      { id: "hive-cane-t5", by: ["scene"], delta: 2, desc: "The honey smells of the boardwalk, the gala, and the parade — it is flavored by appetite, and a good nose can read last year's festival in it." },
    ],
  },
];

/* ---------------- core model ---------------- */

function veilTier(progress) {
  let tier = 0;
  for (const t of VEIL_TIERS) if (progress >= t.at) tier = t.tier;
  return tier;
}

function veilLabel(tier) {
  if (tier === 0) return "mundane cover";
  const found = VEIL_TIERS.find((t) => t.tier === tier);
  return found ? found.label : "unknown";
}

function getCase(id) {
  const c = CASES.find((k) => k.id === id);
  if (!c) throw new Error(`unknown case id "${id}" (see --list)`);
  return c;
}

// Deterministic reveal order per case: seeded shuffle of tell ids.
function revealOrder(caseDef) {
  return seededShuffle(caseDef.tells.map((t) => t.id), "reveal|" + caseDef.id);
}

// Apply one investigation action to a state { revealed:Set, progress }.
// Returns { tell|null, progress, tier } — null tell means diminishing returns.
function applyAction(caseDef, state, action) {
  if (!ACTIONS.includes(action)) {
    throw new Error(`unknown action "${action}" (valid: ${ACTIONS.join(", ")})`);
  }
  const order = revealOrder(caseDef);
  for (const tid of order) {
    if (state.revealed.has(tid)) continue;
    const tell = caseDef.tells.find((t) => t.id === tid);
    if (!tell.by.includes(action)) continue;
    state.revealed.add(tid);
    state.progress += tell.delta;
    return { tell, progress: state.progress, tier: veilTier(state.progress) };
  }
  return { tell: null, progress: state.progress, tier: veilTier(state.progress) };
}

// Outcome tables by mode and danger (d 1..5). Always sum to 1.
// Design intent (HUNTER.md): at d2 prepared is mostly clean; at d5 win-with-cost
// is the good outcome and rushed is a coin flip between cost and disaster.
function outcomeTable(mode, danger) {
  const d = Math.min(5, Math.max(1, danger));
  let clean, cost, disaster;
  if (mode === "prepared") {
    clean = 0.90 - 0.13 * (d - 1);
    cost = 0.08 + 0.09 * (d - 1);
    disaster = 1 - clean - cost;
  } else if (mode === "rushed") {
    disaster = 0.22 + 0.13 * (d - 1);
    clean = Math.max(0.05, 0.30 - 0.06 * (d - 1));
    cost = 1 - disaster - clean;
  } else {
    throw new Error(`unknown resolve mode "${mode}" (prepared|rushed)`);
  }
  const r = (x) => Math.round(x * 1000) / 1000;
  return { clean_win: r(clean), win_with_cost: r(cost), disaster: r(disaster) };
}

// Deterministic roll seeded by case+mode so CLI, self-check, and the UI export agree.
function rollOutcome(caseDef, mode) {
  const table = outcomeTable(mode, caseDef.danger);
  const rand = mulberry32(hashStr("resolve|" + caseDef.id + "|" + mode));
  const r = rand();
  let acc = 0;
  for (const key of ["clean_win", "win_with_cost", "disaster"]) {
    acc += table[key];
    if (r < acc) return { outcome: key, roll: Math.round(r * 1000) / 1000, table };
  }
  return { outcome: "disaster", roll: Math.round(r * 1000) / 1000, table };
}

// Heat events (sim-lane contract — HUNTER.md "Heat events"). Emitted, not consumed, here.
function heatEvents(caseDef, mode, outcome) {
  const events = [];
  const mk = (source, severity, faction, note) =>
    events.push({ event: "heat", case: caseDef.id, source, severity, faction, note });
  if (outcome === "clean_win") {
    if (caseDef.danger >= 2) mk("cleanup_bill", 1, "Stevens", "a sanitation line item with the case's address in the description field");
  } else if (outcome === "win_with_cost") {
    mk("witness", 2, "Coral Trace", "a survivor talks; the 48-hour NDA machine wakes up");
    mk("cleanup_bill", 1, "Stevens", "a sanitation line item with the case's address in the description field");
  } else if (outcome === "disaster") {
    if (mode === "rushed") mk("gunfire", 2, "CRT", "shots logged in a licensed zone — a sergeant asks for the optics calendar");
    mk("collateral", 3, "CRT", "bystander/property damage forces a tier review");
    mk("cleanup_bill", 2, "Stevens", "Team 7 re-tasked; the invoice names a hunter");
  }
  return events;
}

// Kit recommendation: gear whose tags intersect the case's gear_tags.
function recommendKit(caseDef) {
  const want = new Set(caseDef.gear_tags);
  const kit = GEAR.filter((g) => g.tags.some((t) => want.has(t)));
  const total = kit.reduce((s, g) => s + g.price, 0);
  return { kit, total };
}

/* ---------------- export (UI bundle) ---------------- */

function buildExport() {
  const cases = CASES.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    turf: c.turf,
    region: c.region,
    danger: c.danger,
    veil_start: c.veil_start,
    mundane_cover: c.mundane_cover,
    truth: c.truth,
    weaknesses: c.weaknesses,
    gear_tags: c.gear_tags,
    plan: c.plan,
    tells: c.tells,
    reveal_order: revealOrder(c),
    kit: recommendKit(c).kit.map((g) => g.id),
    kit_total: recommendKit(c).total,
    resolve: {
      prepared: rollOutcome(c, "prepared"),
      rushed: rollOutcome(c, "rushed"),
      heat: {
        prepared: heatEvents(c, "prepared", rollOutcome(c, "prepared").outcome),
        rushed: heatEvents(c, "rushed", rollOutcome(c, "rushed").outcome),
      },
    },
  }));
  return {
    meta: {
      generator: "scripts/tableslop/hunter-prep.js --export",
      generated_at: new Date().toISOString(),
      campaign: "tropic-gooner",
      silo: "hunter-reckoning",
      case_count: cases.length,
      doc: "campaigns/tropic-gooner/worldbuilding/HUNTER.md",
      note: "Deterministic bundle. All rolls/orders precomputed by the CLI; the board UI only renders and walks them.",
    },
    veil: {
      actions: ACTIONS,
      tiers: [{ tier: 0, at: 0, label: "mundane cover" }].concat(VEIL_TIERS),
      unlocks: { profile_at_tier: 2, weaknesses_at_tier: 3 },
    },
    gear: GEAR,
    outcome_tables: {
      prepared: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, outcomeTable("prepared", d)])),
      rushed: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, outcomeTable("rushed", d)])),
    },
    cases,
  };
}

function exportData(outPath) {
  const data = buildExport();
  const js =
    "/* Generated by scripts/tableslop/hunter-prep.js --export (" + data.meta.generated_at + ").\n" +
    " * Do not hand-edit; regenerate. Deterministic: same cases -> same orders/rolls. */\n" +
    "window.HUNTER_DATA = " + JSON.stringify(data, null, 2) + ";\n";
  // ponytail: workspace convention is CRLF on disk (core.autocrlf=true; git stores LF).
  const out = js.replace(/\n/g, "\r\n");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out, "utf8");
  return { outPath, bytes: out.length, cases: data.cases.length };
}

/* ---------------- self-check ---------------- */

function selfCheck() {
  const failures = [];
  const bad = (msg) => failures.push(msg);
  const EPS = 1e-6;

  // 1. tell id uniqueness (global) + valid action refs + sane deltas
  const seen = new Set();
  for (const c of CASES) {
    for (const t of c.tells) {
      if (seen.has(t.id)) bad(`duplicate tell id ${t.id}`);
      seen.add(t.id);
      if (!t.by.length) bad(`tell ${t.id} has empty revealed_by`);
      for (const a of t.by) if (!ACTIONS.includes(a)) bad(`tell ${t.id} uses invalid action "${a}"`);
      if (!(t.delta >= 1 && t.delta <= 3)) bad(`tell ${t.id} delta ${t.delta} out of range`);
    }
  }

  // 2. thresholds monotonic
  for (let i = 1; i < VEIL_TIERS.length; i++) {
    if (VEIL_TIERS[i].at <= VEIL_TIERS[i - 1].at) bad("veil thresholds not monotonic");
  }

  // 3. per-case integrity + resolvability simulation
  const maxAt = VEIL_TIERS[VEIL_TIERS.length - 1].at;
  for (const c of CASES) {
    if (!(c.danger >= 1 && c.danger <= 5)) bad(`case ${c.id} danger ${c.danger} out of 1..5`);
    if (!(c.veil_start >= 0 && c.veil_start <= 3)) bad(`case ${c.id} veil_start out of range`);
    if (!c.weaknesses.length) bad(`case ${c.id} has no weaknesses`);
    if (!c.plan) bad(`case ${c.id} has no plan line`);
    if (!c.tells.length) bad(`case ${c.id} has no tells`);

    const gearIds = new Set(GEAR.map((g) => g.id));
    const gearTags = new Set(GEAR.flatMap((g) => g.tags));
    for (const t of c.gear_tags) if (!gearTags.has(t)) bad(`case ${c.id} gear_tag "${t}" not in gear table`);
    const rec = recommendKit(c);
    for (const g of rec.kit) if (!gearIds.has(g.id)) bad(`case ${c.id} recommends unknown gear ${g.id}`);
    if (!rec.kit.length) bad(`case ${c.id} resolves to an empty kit`);

    const sumDelta = c.tells.reduce((s, t) => s + t.delta, 0);
    if (sumDelta < maxAt) bad(`case ${c.id} tell deltas sum ${sumDelta} < T3 threshold ${maxAt}`);

    // no single action type may trivialize a case (investigation must look hard, in different ways)
    for (const a of ACTIONS) {
      const perAction = c.tells.filter((t) => t.by.includes(a)).reduce((s, t) => s + t.delta, 0);
      if (perAction >= maxAt) bad(`case ${c.id} fully resolvable by spamming "${a}" (${perAction} >= ${maxAt})`);
    }

    // resolvability: rotate all four actions to fixpoint; must reach T3 (weaknesses)
    const state = { revealed: new Set(), progress: 0 };
    let stuck = 0;
    for (let step = 0; step < 200 && veilTier(state.progress) < 3; step++) {
      const r = applyAction(c, state, ACTIONS[step % ACTIONS.length]);
      stuck = r.tell ? 0 : stuck + 1;
      if (stuck >= ACTIONS.length) break;
    }
    if (veilTier(state.progress) < 3) {
      bad(`case ${c.id} not resolvable to weaknesses (stuck at veil ${veilTier(state.progress)})`);
    }
  }

  // 4. outcome tables sum to 1 for both modes at every danger rating, and stay in [0,1]
  for (const mode of ["prepared", "rushed"]) {
    for (let d = 1; d <= 5; d++) {
      const t = outcomeTable(mode, d);
      const sum = t.clean_win + t.win_with_cost + t.disaster;
      if (Math.abs(sum - 1) > 1e-3) bad(`outcome table ${mode} d${d} sums to ${sum}`);
      for (const k of Object.keys(t)) {
        if (t[k] < -EPS || t[k] > 1 + EPS) bad(`outcome table ${mode} d${d} ${k}=${t[k]} out of range`);
      }
    }
  }

  // 5. export determinism: two builds are byte-identical apart from the timestamp line
  const stripTs = (o) => JSON.stringify({ ...o, meta: { ...o.meta, generated_at: null } });
  if (stripTs(buildExport()) !== stripTs(buildExport())) bad("export is not deterministic");

  return failures;
}

/* ---------------- CLI printing ---------------- */

function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }

function printList() {
  console.log("HUNTER BOARD — Isla Primavera case files (" + CASES.length + ")");
  console.log("");
  for (const c of CASES) {
    const sum = c.tells.reduce((s, t) => s + t.delta, 0);
    console.log(
      "  " + pad(c.id, 22) + pad(c.kind, 30) + "danger " + c.danger +
      "  veil " + c.veil_start + "  " + pad(c.region, 8) + " tells " + c.tells.length + " (sum " + sum + ")"
    );
    console.log("  " + pad("", 22) + c.name);
  }
  console.log("");
  console.log("Investigate: --case <id> --actions research,interview,surveillance,scene");
}

function printCase(c) {
  console.log("CASE FILE: " + c.name + "  [" + c.id + "]");
  console.log("  kind:    " + c.kind);
  console.log("  turf:    " + c.turf + "  (" + c.region + ")");
  console.log("  danger:  " + c.danger + "/5   public veil tier: " + c.veil_start + " (" + veilLabel(c.veil_start) + ")");
  console.log("  cover:   " + c.mundane_cover);
  console.log("  tells:   " + c.tells.length + " hidden — reveal with --actions " + ACTIONS.join(","));
  console.log("  truth:   REDACTED (unlocks at veil tier 2)");
  console.log("  weaknesses: REDACTED (unlock at veil tier 3, then --loadout)");
}

function printActionStep(c, action, res) {
  if (!res.tell) {
    console.log("  -> " + pad(action, 13) + "no new seam. Diminishing returns — try another angle.");
  } else {
    console.log("  -> " + pad(action, 13) + "TELL [" + res.tell.id + "] (+" + res.tell.delta + " veil)");
    console.log("     " + res.tell.desc);
  }
  console.log(
    "     veil progress " + res.progress + " -> tier " + res.tier + " (" + veilLabel(res.tier) + ")" +
    (res.tier === 2 ? "  [ENTITY PROFILE UNLOCKED]" : "") +
    (res.tier === 3 ? "  [WEAKNESSES UNLOCKED — prep possible]" : "")
  );
}

function runActions(c, actions) {
  console.log("CASE FILE: " + c.name + "  [" + c.id + "]");
  console.log("cover story: " + c.mundane_cover);
  console.log("");
  const state = { revealed: new Set(), progress: 0 };
  let lastTier = 0;
  for (const a of actions) {
    const res = applyAction(c, state, a);
    printActionStep(c, a, res);
    lastTier = res.tier;
  }
  console.log("");
  if (lastTier >= 2) {
    console.log("ENTITY PROFILE (veil tier 2):");
    console.log("  " + c.kind + " — " + c.truth);
  } else {
    console.log("ENTITY PROFILE: still REDACTED (veil tier " + lastTier + " < 2). Keep looking.");
  }
  if (lastTier >= 3) {
    console.log("");
    console.log("WEAKNESSES (veil tier 3):");
    for (const w of c.weaknesses) console.log("  - " + w);
    console.log("");
    console.log("Next: --case " + c.id + " --loadout");
  } else {
    console.log("WEAKNESSES: still REDACTED (veil tier " + lastTier + " < 3). The county thanks you for stopping.");
  }
  return state;
}

function printLoadout(c) {
  const { kit, total } = recommendKit(c);
  console.log("PREP KIT — " + c.name + "  [" + c.id + "]  danger " + c.danger + "/5");
  console.log("");
  for (const g of kit) {
    console.log(
      "  " + pad(g.name, 46) + pad(g.source, 30) + pad("$" + g.price, 6) + g.legality
    );
  }
  console.log("  " + "-".repeat(88));
  console.log("  " + pad("TOTAL", 46) + pad("", 30) + "$" + total);
  const flags = kit.filter((g) => /gray|illegal/.test(g.legality)).map((g) => g.id);
  if (flags.length) {
    console.log("  legality flags: " + flags.join(", ") + " — expect questions if the county inventory-checks you.");
  }
  console.log("");
  console.log("PLAN: " + c.plan);
  console.log("");
  console.log("Outcome swing (tables; roll with --resolve prepared|rushed):");
  const tp = outcomeTable("prepared", c.danger);
  const tr = outcomeTable("rushed", c.danger);
  console.log(
    "  prepared: clean " + tp.clean_win + " / cost " + tp.win_with_cost + " / disaster " + tp.disaster +
    "    rushed: clean " + tr.clean_win + " / cost " + tr.win_with_cost + " / disaster " + tr.disaster
  );
}

const OUTCOME_LINES = {
  clean_win: "CLEAN WIN — the cover story holds for everyone else. The county files something ordinary.",
  win_with_cost: "WIN WITH COST — the thing is down; someone saw something. The paperwork begins.",
  disaster: "DISASTER — the hunter becomes the incident. Stevens gets a new line item.",
};

function printResolve(c, mode, asJson) {
  const { outcome, roll, table } = rollOutcome(c, mode);
  const heat = heatEvents(c, mode, outcome);
  const swing = {
    prepared: outcomeTable("prepared", c.danger),
    rushed: outcomeTable("rushed", c.danger),
  };
  if (asJson) {
    console.log(JSON.stringify({ case: c.id, mode, danger: c.danger, roll, outcome, table, swing, heat_events: heat }, null, 2));
    return;
  }
  console.log("RESOLVE — " + c.name + "  [" + c.id + "]  mode: " + mode + "  danger " + c.danger + "/5");
  console.log("");
  console.log("  expected outcome swing (preparation vs rushing):");
  console.log("    prepared: clean " + swing.prepared.clean_win + " / cost " + swing.prepared.win_with_cost + " / disaster " + swing.prepared.disaster);
  console.log("    rushed:   clean " + swing.rushed.clean_win + " / cost " + swing.rushed.win_with_cost + " / disaster " + swing.rushed.disaster);
  console.log("");
  console.log("  deterministic roll (seed resolve|" + c.id + "|" + mode + "): " + roll);
  console.log("  table: clean <" + table.clean_win + " / cost <" + (table.clean_win + table.win_with_cost).toFixed(3) + " / else disaster");
  console.log("");
  console.log("  OUTCOME: " + OUTCOME_LINES[outcome]);
  console.log("");
  if (heat.length) {
    console.log("  heat events emitted (sim-lane contract):");
    for (const h of heat) {
      console.log("    - [" + h.source + " sev " + h.severity + " -> " + h.faction + "] " + h.note);
    }
  } else {
    console.log("  heat events emitted: none. Quiet work is the only cheap work.");
  }
}

function printHelp() {
  console.log("hunter-prep.js — Hunter: The Reckoning prep prototype (Isla Primavera)");
  console.log("");
  console.log("  --list                                  list case files");
  console.log("  --case <id>                             show case cover (redacted)");
  console.log("  --case <id> --action <type>             one investigation action (fresh)");
  console.log("  --case <id> --actions a,b,c             run a sequence, accumulating veil");
  console.log("  --case <id> --loadout                   recommended prep kit + plan + swing");
  console.log("  --case <id> --resolve prepared|rushed   deterministic outcome + heat events [--json]");
  console.log("  --export [path]                         write hunter-data.js bundle for the board UI");
  console.log("  --self-check                            validate cases, tables, resolvability");
  console.log("");
  console.log("actions: " + ACTIONS.join(", "));
}

/* ---------------- main ---------------- */

function main(argv) {
  const args = { json: false };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    } else positional.push(a);
  }

  if (args["self-check"]) {
    const failures = selfCheck();
    const tellCount = CASES.reduce((s, c) => s + c.tells.length, 0);
    console.log("hunter-prep self-check: " + CASES.length + " cases, " + tellCount + " tells, " + GEAR.length + " gear rows");
    console.log("  veil thresholds: " + VEIL_TIERS.map((t) => "T" + t.tier + "@" + t.at).join(" "));
    console.log("  outcome tables: 2 modes x 5 danger ratings, all sum to 1");
    console.log("  resolvability: every case simulated to veil tier 3 via action rotation");
    console.log("  determinism: export builds byte-identical (sans timestamp)");
    if (failures.length) {
      console.error("");
      for (const f of failures) console.error("FAIL: " + f);
      console.error("\n" + failures.length + " check(s) failed");
      process.exit(1);
    }
    console.log("\nSELF-CHECK OK");
    return;
  }

  if (args.export !== undefined) {
    const out = args.export === true
      ? path.resolve(__dirname, "..", "linuxbox", "tableslop-static", "hunter", "hunter-data.js")
      : path.resolve(args.export);
    const res = exportData(out);
    console.log("exported " + res.cases + " cases -> " + res.outPath + " (" + res.bytes + " bytes)");
    return;
  }

  if (args.list) { printList(); return; }

  if (args.case) {
    const c = getCase(args.case);
    if (args.resolve) {
      if (args.resolve !== "prepared" && args.resolve !== "rushed") {
        console.error("FAIL: --resolve must be prepared|rushed");
        process.exit(1);
      }
      printResolve(c, args.resolve, args.json);
      return;
    }
    if (args.loadout) { printLoadout(c); return; }
    const seq = args.actions
      ? String(args.actions).split(",").map((s) => s.trim()).filter(Boolean)
      : (args.action ? [args.action] : []);
    if (seq.length) {
      for (const a of seq) {
        if (!ACTIONS.includes(a)) {
          console.error('FAIL: unknown action "' + a + '" (valid: ' + ACTIONS.join(", ") + ")");
          process.exit(1);
        }
      }
      runActions(c, seq);
      return;
    }
    printCase(c);
    return;
  }

  printHelp();
}

main(process.argv);
