/**
 * Self-check for kit permanence + injection pack gating.
 * Run: node check_kit_packs.mjs  (from chat-ui/)
 */
import assert from "node:assert/strict";
import {
  salvageWorldDeltaFromAssistantProse,
  selectInjectionPackIds,
  buildInjectionPacksSystemBlock,
  INJECTION_PACKS,
} from "./static/session_turn_augment.mjs";

function sessionWith(people, packs) {
  const s = {
    messages: [{ role: "user", content: "x" }, { role: "assistant", content: "y" }],
    rpg: { observed_world: { people: people || {}, objects: {}, places: {} } },
  };
  if (packs !== undefined) s.rpg.injection_packs = packs;
  return s;
}

// --- 1. clothing CHANGE overwrites an existing outfit ------------------------
{
  const people = {
    emily: {
      id: "emily",
      name: "Emily",
      present: true,
      current_outfit: "grey sweatpants and an oversized hoodie",
    },
  };
  const prose =
    "[Day 1 | 2:00 PM | Kim's Fashion & Basics]\n" +
    "Emily changes into dark-wash straight-leg jeans and a black long-sleeve, " +
    "then ties the hoodie around her waist. Mia watches from the shoe rack.";
  const delta = salvageWorldDeltaFromAssistantProse(prose, sessionWith(people));
  assert.ok(delta, "salvage returned nothing");
  const em = (delta.new_people || []).find((p) => p.id === "emily");
  assert.ok(em, "no emily row salvaged");
  assert.ok(
    /jeans/i.test(String(em.current_outfit || "")),
    "clothing change did not overwrite current_outfit, got: " + em.current_outfit
  );
  assert.ok(
    !/sweatpants/i.test(String(em.current_outfit || "")),
    "stale outfit survived a change beat"
  );
}

// --- 2. passive description does NOT clobber an established outfit ----------
{
  const people = {
    mia: {
      id: "mia",
      name: "Mia",
      present: true,
      current_outfit: "rumpled sleep shirt, bare legs",
    },
  };
  const prose =
    "[Day 1 | 2:10 PM | Strip Mall]\n" +
    "Mia, wearing something she clearly slept in, leans against the counter and " +
    "turns the boots over to check the sole. The parking lot stays empty.";
  const delta = salvageWorldDeltaFromAssistantProse(prose, sessionWith(people));
  const mi = delta ? (delta.new_people || []).find((p) => p.id === "mia") : null;
  if (mi && mi.current_outfit) {
    assert.ok(
      /sleep shirt/i.test(mi.current_outfit),
      "passive mention clobbered an established outfit: " + mi.current_outfit
    );
  }
}

// --- 3. equipped weapons land in inventory ----------------------------------
{
  const people = { mia: { id: "mia", name: "Mia", present: true, inventory: [] } };
  const prose =
    "[Day 1 | 3:00 PM | Parking Lot]\n" +
    "Mia holsters a compact pistol and straps on a kevlar vest before " +
    "sliding into the passenger seat.";
  const delta = salvageWorldDeltaFromAssistantProse(prose, sessionWith(people));
  const mi = delta ? (delta.new_people || []).find((p) => p.id === "mia") : null;
  assert.ok(mi && Array.isArray(mi.inventory), "no inventory salvaged for gear beat");
  const names = mi.inventory.map((x) => String(x.name || x).toLowerCase()).join("|");
  assert.ok(/pistol/.test(names), "holstered weapon missing from inventory: " + names);
  assert.ok(/vest/.test(names), "armor missing from inventory: " + names);
}

// --- 4. pack gating: relevant packs only, capped ----------------------------
{
  const s = sessionWith({});
  const kitText =
    "she pulls on the jeans, zips the jacket, checks the boots, straps the holster, " +
    "loads the pistol, and stuffs the spare shirt into her backpack";
  const ids = selectInjectionPackIds(s, { text: kitText });
  assert.ok(ids.includes("kit_gear"), "kit pack did not fire on a kit beat: " + ids);
  assert.ok(ids.length <= 2, "pack cap exceeded: " + ids);
}
{
  const s = sessionWith({});
  const quiet = "They sit in silence. Nothing moves.";
  assert.equal(
    selectInjectionPackIds(s, { text: quiet }).length,
    0,
    "packs fired on an irrelevant beat"
  );
  assert.equal(buildInjectionPacksSystemBlock(s, { text: quiet }), "", "block not empty");
}

// --- 5. manual override wins over gating ------------------------------------
{
  const s = sessionWith({}, ["mechanics"]);
  const ids = selectInjectionPackIds(s, { text: "nothing relevant at all" });
  assert.deepEqual(ids, ["mechanics"], "explicit array override ignored: " + ids);
  const block = buildInjectionPacksSystemBlock(s, { text: "" });
  assert.ok(block.includes("Mechanics"), "override pack body missing");
}
{
  const s = sessionWith({}, { mute: ["kit_gear"], pin: ["world_storage"] });
  const kitText =
    "she pulls on the jeans, zips the jacket, checks the boots, straps the holster, loads the pistol";
  const ids = selectInjectionPackIds(s, { text: kitText });
  assert.ok(!ids.includes("kit_gear"), "muted pack still fired: " + ids);
  assert.ok(ids.includes("world_storage"), "pinned pack missing: " + ids);
}

assert.equal(Object.keys(INJECTION_PACKS).length, 4, "expected 4 packs");
console.log("KIT_PACKS_CHECK_OK");
