# Mazda3 sports build — parts, prices & upgrade path

Tracking sheet for links, pricing, and the upgrade plan. Prices are **as-of 2026-06-29**
and change often (sales rotate); re-check before buying and log changes in the price-watch table.

**Live data:** the machine-readable source of truth is [`parts.json`](./parts.json). It feeds the
**Build** panel on the linuxbox dashboard (`/Linuxbox/` → Build tab) and is auto-checked every
**3 days** by [`scripts/mazda3/price_monitor.py`](../../scripts/mazda3/price_monitor.py), which
appends any price change to each part's history and writes a run report to `reports/mazda3/`.
This README is the human-readable mirror — when they disagree, `parts.json` wins.

> ⚠ **Fitment conflict to resolve first.** This list mixes two chassis:
> - The **H&R springs** linked are for the **Mazda CX-30** (2020-2023, Typ F1).
> - The **CorkSport strut tower bar** fits the **2019+ Mazda 3 only** — CorkSport states it does
>   **not** fit the CX-30 ("the mount points are not the same").
>
> A Mazda 3 and a CX-30 can't both be the target. Confirm the actual car, then swap whichever
> part is wrong (CorkSport sells 2019+ Mazda 3 lowering springs ~$279.99; H&R/others make Mazda 3
> springs). The CorkSport steering wheel fits **both** (Mazda 3, CX-30, CX-50), so it's safe either way.

## Parts tracked

| # | Part | Vendor | Price (2026-06-29) | SKU / code | Fitment | Status |
|---|------|--------|--------------------|------------|---------|--------|
| 1 | [H&R Sport Springs](https://www.darksidemotoring.com/products/h-r-sport-springs-2020-mazda-cx-30-2wd-4wd-typ-f1) | Darkside Motoring | **$272.30** (sale, was $389.00) | 28663-3 | **CX-30** 2020-2023 2WD/4WD. Lowers ~1.3" F/R | considering |
| 2 | [CorkSport Leather Steering Wheel](https://corksport.com/leather-steering-wheel-for-2019-mazda-3-and-mazda-3-turbo.html) | CorkSport | **$399.99** | AXO-9-342-10 | 2019+ Mazda 3, 2021+ 3 Turbo, 2020+ CX-30, 2023+ CX-50. *Disables heated wheel* | considering |
| 3 | [CorkSport Front Strut Tower Bar](https://corksport.com/2019-mazda-3-front-strut-tower-bar.html) | CorkSport | **$189.99** | AXO-3-020-10 | **2019+ Mazda 3 sedan & hatch only** (NOT CX-30). 4.9★/17 | considering |
| 4 | [EV West Tesla Small Rear Drive Unit Starter Kit (EV Controls T2-C)](https://evwest.com/tesla-small-rear-drive-unit-starter-kit-ev-controls-t2-c-controller) | EV West | **$9,900.00** | TSLA-MS-SDU | Tesla SDU, ~200 kW (264 HP), 277-408 VDC. *EV swap, not bolt-on* | researching |
| 5 | [EVTV Quaife ATB LSD (Tesla Model S SDU)](https://store.evtv.me/products/quaifeatb) | EVTV Motor Verks | **$2,195.99** | QDH3T | Installs **inside** the Tesla S/X small drive unit (#4) | researching |
| 6 | White wheels (spec — no product chosen yet) | — | — | — | **5x114.3** bolt pattern, **6-7"** width, white finish | spec-only |
| 7 | [Bayson R OE-Style Window Visors](https://baysonr.com/products/oe-style-window-visors-for-2019-2022-mazda-3-5dr) | Bayson R Motorsports | **$70.00** (sale, was $78.00) | DWV-MAZ3195D | **2019-2025 Mazda 3 5Dr Hatchback only.** Tinted acrylic | considering |
| 8 | [Bayson R CK-Style Mid Spoiler](https://baysonr.com/products/ck-style-mid-spoiler-for-2019-2021-mazda-3-5dr) | Bayson R Motorsports | **$80.00** (sale, was $89.00) | SPOILER-MAZ3195DMID-A-CK | **2019-2025 Mazda 3 5Dr Hatchback only.** ABS, unpainted (prep+paint) | considering |

**Subtotals:** handling bolt-ons (1,3) ≈ **$462.29** · styling (7,8) ≈ **$150.00** · interior (2) ≈ **$399.99** · EV-swap drivetrain (4-5) ≈ **$12,095.99** · everything priced ≈ **$13,108.27** (before tax/shipping). Wheels (#6) TBD.

> **Chassis signal:** parts #7 and #8 fit the **Mazda 3 5Dr hatchback only** (not CX-30). If these are on the buy list, the car is almost certainly a **Mazda 3 hatch** — which would resolve Tier 0 in favor of Mazda 3 (swap the CX-30 springs #1 for the Mazda 3 equivalent). Still pending your confirmation in the Inbox before the agent acts on it.

## Wheels (#6) — target spec

What you want, not yet a specific product:

- **Color:** white
- **Bolt pattern:** 5x114.3 (5x114.3 = 5x4.5"; matches Mazda 3 / CX-30)
- **Width:** 6-7" (narrower end is conservative/grippy daily; wider improves stance + tire footprint)

Open before buying (add to a future row once chosen):

- **Diameter** — 17" or 18" (18" common on the sport trims; affects tire choice + ride).
- **Offset** — Mazda 3 / CX-30 run roughly **+45mm**; confirm against the chosen width to avoid rub/poke.
- **Pick a model + source a link** so the price monitor can track it (add `url` to `parts.json` part `white-wheels`).

## Upgrade path (suggested order)

- **Tier 0 — Decide the chassis.** Resolve the Mazda 3 vs CX-30 fitment above. Everything downstream depends on it.
- **Tier 1 — Handling bolt-ons (best $/smile, easy installs).**
  - Strut tower bar (#3) — 15-30 min install, reviewers report noticeably flatter front end. *Mazda 3 only.*
  - Lowering springs (#1, or the Mazda 3 equivalent) — lower CoG, less body roll. Get an alignment after.
  - *Reviewers repeatedly pair the front strut bar + a rear sway bar + springs as the handling trifecta — a rear sway bar is a natural add to this tier.*
- **Tier 2 — Interior / driver feel.**
  - Leather steering wheel (#2) — ~2 hr install. Note: kills the factory heated-wheel function if equipped.
- **Tier 2 — Styling / exterior (cosmetic, Mazda 3 hatch).**
  - Window visors (#7) — DIY, hardware included, ~OEM look. Easy first cosmetic mod.
  - CK mid spoiler (#8) — ships unpainted ABS; budget for prep + paint before install.
- **Tier 3 — EV swap (major project, separate track).**
  - Tesla small rear drive unit + EV Controls T2-C (#4) and the Quaife ATB LSD that goes inside it (#5).
  - This is a full electric conversion / fabrication effort (battery pack, mounts, charging, safety), not a weekend bolt-on. Treat as its own build with its own budget and plan; the LSD (#5) only makes sense if committing to the Tesla unit (#4).

## Price-watch log

Append a row when a tracked price changes (deal alerts, restocks, sale ends).

| Date | Part # | Old | New | Note |
|------|--------|-----|-----|------|
| 2026-06-29 | 1 | $389.00 | $272.30 | On sale at Darkside Motoring (initial capture) |

## Notes

- All prices captured from the linked product pages on 2026-06-29; vendors rotate sales, so verify at checkout.
- Sources for #2, #4, #5 captured from page content; #1 and #3 from uploaded product snapshots.
- **On-vehicle data (optional, YAGNI):** CSS Electronics AI CAN→DBC workflow — watch-only note at [`reports/mazda3/auto-data-library-2026-07-28.md`](../../reports/mazda3/auto-data-library-2026-07-28.md) ([video](https://www.youtube.com/watch?v=jQDqWuL5-nQ)). Does not replace `parts.json` / price monitor.
