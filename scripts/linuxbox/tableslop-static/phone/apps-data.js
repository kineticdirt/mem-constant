/**
 * Diegetic phone apps for Isla Primavera.
 * System apps (Contacts / Texts / …) live in phone.js HOME_APPS.
 * Firearms: catalog only — purchase requires physical storefront visit.
 * Icons: single-glyph LCD tiles (no image CDN).
 */
globalThis.PHONE_APPS = [
  {
    id: "wcdonalds",
    name: "WcDonalds",
    icon: "W",
    tag: "food",
    blurb: "Island fast food · delivery or pickup",
    kind: "commerce",
    delivery: true,
    pickup: true,
    inPersonOnly: false,
    storefront: { place: "WcDonalds — Boardwalk Strip", region: "r01-paradise", modeHint: "walk" },
    items: [
      { id: "wc-1", name: "WBig Sandwich", price: 6.5, note: "two patties, island sauce" },
      { id: "wc-2", name: "9-piece Nuggets", price: 5.25, note: "sweet-chili or CRT heat" },
      { id: "wc-3", name: "Fries (L)", price: 3.1, note: "salted, paper cone" },
      { id: "wc-4", name: "Shake — guava", price: 4.0, note: "too sweet, still correct" },
      { id: "wc-5", name: "Breakfast wrap", price: 4.75, note: "until 11:00 island" },
    ],
  },
  {
    id: "islemart",
    name: "IsleMart",
    icon: "I",
    tag: "mart",
    blurb: "Off-brand big-box · groceries + housewares (Target-aisle energy)",
    kind: "commerce",
    delivery: true,
    pickup: true,
    inPersonOnly: false,
    storefront: { place: "IsleMart Supercenter — Crimson Quay", region: "r03-crimson-quay", modeHint: "drive" },
    items: [
      { id: "im-1", name: "Family rice (10kg)", price: 12.0, note: "aisle 4" },
      { id: "im-2", name: "Bottle water flat", price: 8.5, note: "warm from the pallet" },
      { id: "im-3", name: "Cheap earbuds", price: 14.0, note: "break in a week" },
      { id: "im-4", name: "Beach towel 2-pack", price: 11.0, note: "faded neon" },
      { id: "im-5", name: "Rotisserie chicken", price: 7.25, note: "pickup only after 16:00" },
    ],
  },
  {
    id: "primazon",
    name: "Primazon",
    icon: "P",
    tag: "cart",
    blurb: "Off-brand everything-store · vans, not drones",
    kind: "commerce",
    delivery: true,
    pickup: false,
    inPersonOnly: false,
    storefront: { place: "Primazon Sort Hub — Porto Lujara", region: "r02-porto-lujuria", modeHint: "bus" },
    items: [
      { id: "pz-1", name: "USB fan (USB-C)", price: 19.0, note: "ships in 2 island days" },
      { id: "pz-2", name: "Instant noodles ×12", price: 9.5, note: "warehouse brand" },
      { id: "pz-3", name: "Rain poncho", price: 6.0, note: "one-size regret" },
      { id: "pz-4", name: "Used paperback", price: 4.5, note: "mystery; spine cracked" },
      { id: "pz-5", name: "Phone case (clear)", price: 8.0, note: "yellows in sun" },
    ],
  },
  {
    id: "quay-arms",
    name: "Quay Arms",
    icon: "Q",
    tag: "firearms",
    blurb: "Licensed counter · catalog only — you must go in person",
    kind: "arms",
    delivery: false,
    pickup: false,
    inPersonOnly: true,
    storefront: { place: "Quay Arms — The Quay", region: "r03-crimson-quay", modeHint: "walk" },
    items: [
      { id: "qa-1", name: "Service pistol (licensed)", price: 420, note: "ID + wait · counter only" },
      { id: "qa-2", name: "Pump shotgun", price: 380, note: "sporting / home · in-store" },
      { id: "qa-3", name: "Box 9mm (50)", price: 28, note: "ammo · with firearm purchase" },
      { id: "qa-4", name: "Cleaning kit", price: 22, note: "solvent smells like regret" },
      { id: "qa-5", name: "Trigger lock", price: 15, note: "required for some permits" },
    ],
  },
  {
    id: "maps",
    name: "Island Maps",
    icon: "M",
    tag: "maps",
    blurb: "Walk · drive · bus to places (Google-Maps-style)",
    kind: "maps",
  },
];

/** Fallback destinations if city JSON fetch fails. */
globalThis.PHONE_MAP_DESTINATIONS = [
  { id: "d-boardwalk", name: "Boardwalk Strip", region: "r01-paradise", kind: "district" },
  { id: "d-marina", name: "Marina / Gilded Anchor", region: "r01-paradise", kind: "district" },
  { id: "d-wc", name: "WcDonalds — Boardwalk", region: "r01-paradise", kind: "storefront" },
  { id: "d-islemart", name: "IsleMart Supercenter", region: "r03-crimson-quay", kind: "storefront" },
  { id: "d-primazon", name: "Primazon Sort Hub", region: "r02-porto-lujuria", kind: "storefront" },
  { id: "d-arms", name: "Quay Arms storefront", region: "r03-crimson-quay", kind: "storefront" },
  { id: "d-muelle", name: "Muelle Viejo", region: "r02-porto-lujuria", kind: "district" },
  { id: "d-quay", name: "The Quay", region: "r03-crimson-quay", kind: "district" },
];
