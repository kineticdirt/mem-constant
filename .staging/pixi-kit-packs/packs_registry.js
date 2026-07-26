
/**
 * Injection packs — focused domain rules, injected only when the beat needs them.
 *
 * Four packs cover the aspects that kept degrading: how world state is stored, how
 * standing systems move, how kit is tracked, and how in-world mechanics behave.
 * They are NOT all injected every turn — that would be prompt bloat competing with
 * the scene. Each pack declares a cheap relevance test against the current beat and
 * at most PACK_MAX_PER_TURN fire.
 *
 * Manual override lives in `session.rpg.injection_packs`:
 *   - array of ids  -> inject exactly these, gating off
 *   - { pin: [], mute: [] } -> gating on, plus forced-in / forced-out ids
 * Per-scenario extra text rides in `session.rpg.injection_pack_notes[id]` so a
 * setting can state its own magic/tech rules without a code change.
 */
export const PACK_MAX_PER_TURN = 2;

export const INJECTION_PACKS = {
  kit_gear: {
    label: "Clothing · armor · weapons",
    summary: "Kit tracked as it changes, with slots and specificity.",
    match:
      /\b(wear|wearing|wore|dress|dressed|undress|strip|stripped|naked|outfit|clothes|clothing|jacket|jeans|shirt|hoodie|boots|shoes|bra|underwear|lingerie|sock|pants|skirt|armor|armour|vest|kevlar|helmet|weapon|gun|pistol|rifle|shotgun|knife|blade|machete|bat|axe|crowbar|holster|holstered|sheath|equip|equipped|loot|looted|inventory|duffel|backpack|pocket|change into|put on|pull on|take off)\b/i,
    lines: [
      "**Kit — clothing, armor, weapons.**",
      "- Track kit the turn it changes. Dressing, undressing, swapping, equipping, holstering, dropping, looting: each one updates `current_outfit` and/or `inventory` in WORLD_DELTA that same turn.",
      "- Describe garments by cut, fabric, and fit — `dark-wash straight-leg jeans, olive cotton long-sleeve, oversized grey hoodie`, not `casual clothes`. Shorts are not jeans.",
      "- Worn items use `new_objects` with `holder` (person id) and `wear_slot` (`torso`, `legs`, `feet`, `head`, `hands`, `back`, `underwear`, `outer`, `armor`, `weapon`). Held-but-not-worn items get `holder` and no `wear_slot`.",
      "- Weapons carry their state: loaded or empty, ammo count, condition, and where they are (in hand, holstered, slung, in the trunk). A weapon in the trunk is not in hand.",
      "- Armor carries coverage and condition. Damage to armor is recorded, not narrated and forgotten.",
      "- `inventory` is that person's full carried list, including what they already had — the merge unions rows, it does not infer what you left out. Consumed or dropped items are removed.",
    ],
  },
  world_storage: {
    label: "World storage",
    summary: "Objects, places, and facts persist with stable ids.",
    match:
      /\b(take|takes|took|grab|grabs|pick(?:s|ed)? up|drop|drops|dropped|stash|store|stored|leave|left behind|shelf|counter|trunk|drawer|room|door|hallway|stairs|upstairs|downstairs|apartment|building|store|garage|kitchen|bedroom|enter|enters|exit|walk into|head to|move to|arrive)\b/i,
    lines: [
      "**Storage discipline — objects, places, facts.**",
      "- Anything that persists past this beat goes in WORLD_DELTA, not just prose. An object described but never entered into `new_objects` does not exist next turn.",
      "- Ids are stable, lowercase, snake_case, and derived from the thing itself (`black_leather_jacket`, `kim_fashion_basics`) — never `object_1`. Reuse an existing id when the thing already exists; mint a new one only for a genuinely new thing.",
      "- Objects carry `name` plus `location` (place id) or `holder` (person id), and `wear_slot` when worn. An object with neither location nor holder is lost.",
      "- Places carry `name`, and `parent` when they nest (a fitting room inside a store inside a strip mall). Subdivide large spaces instead of treating one id as everywhere.",
      "- Facts established in narration — a jammed door, a learned name, a broken window — belong on the relevant row, not only in the paragraph.",
      "- Quantity and condition are state. Update them when they change; do not restate a stale value.",
    ],
  },
  system_dynamics: {
    label: "System dynamics",
    summary: "Standing pressures and off-screen forces keep moving.",
    match:
      /\b(later|hours?|minutes?|next (?:day|morning|night)|meanwhile|drive|drove|travel|arrive|arrived|outside|street|horde|group|faction|crowd|supplies|fuel|gas|food|water|ammo|noise|sirens?|radio|weather|cold|dark|nightfall|curfew)\b/i,
    lines: [
      "**System dynamics.**",
      "- The world runs whether or not the player is watching. Off-screen threats, factions, resources, and weather advance between beats; show that when the scene rejoins them.",
      "- Standing pressures — hunger, fuel, noise, infection, heat, reputation — tick in the direction the fiction implies. If one moved this beat, record it rather than leaving it frozen.",
      "- Consequences compound. A choice from three beats ago is still visible in world state; a scene change does not reset it.",
      "- Cause before effect: when something changes, the narration names the mechanism. No unexplained state jumps.",
      "- Escalation is earned. A quiet beat may stay quiet; a loud one draws attention that persists into later beats.",
    ],
  },
  mechanics: {
    label: "Mechanics (science / magic)",
    summary: "In-world systems obey consistent rules with real costs.",
    match:
      /\b(infect|infected|infection|bite|bitten|virus|fever|symptom|magic|spell|ritual|cast|mana|power|ability|curse|blessing|tech|engine|circuit|generator|battery|radiation|serum|vaccine|blood|wound|heal|healing)\b/i,
    lines: [
      "**Mechanics — how this world's systems work.**",
      "- Whatever system the setting runs on (science, magic, infection, tech, the supernatural) has rules, and those rules hold across beats. Consistency beats spectacle.",
      "- Every effect has a cost, a limit, and a visible tell. State the cost when the effect is used; no free power.",
      "- Established mechanics are canon. Do not contradict or quietly upgrade a rule the fiction has already demonstrated. When the player pushes past a limit, the limit pushes back.",
      "- Unknowns stay unknown. Characters reason from what they have observed; nobody narrates the true mechanism unless they earned that knowledge in-fiction.",
      "- Record mechanical state changes — a burned charge, a contracted infection, a fried circuit — in WORLD_DELTA so the next turn sees them.",
      "- Failure is a legitimate outcome. A mechanic that always works is not a mechanic.",
    ],
  },
};

export function listInjectionPacks() {
  return Object.keys(INJECTION_PACKS).map((id) => ({
    id: id,
    label: INJECTION_PACKS[id].label,
    summary: INJECTION_PACKS[id].summary,
  }));
}

function countMatches(re, text) {
  if (!text) return 0;
  const g = new RegExp(re.source, "gi");
  const m = text.match(g);
  return m ? m.length : 0;
}

/**
 * Score packs against this beat and return the ids that earn a slot.
 * `ctx.text` should be the player turn plus the most recent assistant beat.
 */
export function selectInjectionPackIds(session, ctx) {
  const rpg = session && session.rpg && typeof session.rpg === "object" ? session.rpg : {};
  const sel = rpg.injection_packs;
  const valid = (list) =>
    (Array.isArray(list) ? list : [])
      .map((x) => String(x || "").trim())
      .filter((x) => INJECTION_PACKS[x]);

  // Explicit array = full manual override, relevance gating off.
  if (Array.isArray(sel) && sel.length) return valid(sel).slice(0, 4);

  const pin = sel && typeof sel === "object" ? valid(sel.pin) : [];
  const mute = sel && typeof sel === "object" ? valid(sel.mute) : [];
  const text = String((ctx && ctx.text) || "");
  const scored = [];
  for (const id of Object.keys(INJECTION_PACKS)) {
    if (mute.indexOf(id) >= 0) continue;
    if (pin.indexOf(id) >= 0) continue;
    const n = countMatches(INJECTION_PACKS[id].match, text);
    if (n >= 2) scored.push({ id: id, n: n });
  }
  scored.sort((a, b) => b.n - a.n);
  const out = pin.slice();
  for (const s of scored) {
    if (out.length >= PACK_MAX_PER_TURN) break;
    out.push(s.id);
  }
  return out;
}

export function buildInjectionPacksSystemBlock(session, ctx) {
  const ids = selectInjectionPackIds(session, ctx);
  if (!ids.length) return "";
  const rpg = session && session.rpg && typeof session.rpg === "object" ? session.rpg : {};
  const notes =
    rpg.injection_pack_notes && typeof rpg.injection_pack_notes === "object"
      ? rpg.injection_pack_notes
      : {};
  const lines = ["[Injection packs — active domain rules]"];
  for (const id of ids) {
    lines.push("");
    for (const l of INJECTION_PACKS[id].lines) lines.push(l);
    const extra = String(notes[id] || "").trim();
    if (extra) lines.push("- Scenario rule: " + extra.slice(0, 600));
  }
  return lines.join("\n");
}
