/**
 * Short-TTL read cache for GET /api/characters-registry.
 *
 * enrichCharactersRegistry re-reads every character sheet doc and scans portrait
 * dirs synchronously per request; on the SD-card linuxbox that blocks the Hub
 * event loop for the whole process. Registry writes invalidate via invalidate();
 * out-of-process writers (sync_character_registry.py, think ticks) land within TTL.
 *
 * Self-check: node scripts/linuxbox/chars-registry-read-cache.js
 */
const TTL_MS = 10_000;
let cache = null; // { key, at, data }

function get(key) {
  if (!cache || cache.key !== key) return null;
  if (Date.now() - cache.at > TTL_MS) return null;
  return cache.data;
}

function set(key, data) {
  cache = { key, at: Date.now(), data };
  return data;
}

function invalidate() {
  cache = null;
}

module.exports = { get, set, invalidate, TTL_MS };

if (require.main === module) {
  const assert = require("assert");
  assert.strictEqual(get("a"), null, "cold miss");
  set("a", { n: 1 });
  assert.deepStrictEqual(get("a"), { n: 1 }, "hit after set");
  assert.strictEqual(get("b"), null, "different key misses");
  invalidate();
  assert.strictEqual(get("a"), null, "invalidate clears");
  set("a", { n: 2 });
  cache.at = Date.now() - TTL_MS - 1;
  assert.strictEqual(get("a"), null, "expired entry misses");
  console.log("chars-registry-read-cache self-check OK");
}
