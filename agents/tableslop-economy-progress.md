# Tableslop economy sim progress

**Lane:** full economic sim (GM unlock 2026-08-10) · Holder `tableslop-economy-sim-full`  
**Locks:** city pins FROZEN · regions-ui sacred

## Done

- [x] **eco-01** SoT `economy-state.json` — water (6) · minerals (4) · other (8) · commodities · markets
- [x] **eco-02** Deterministic tick engine `tableslop-economy-sim.js` + `--self-check`
- [x] **eco-03** Overlay `map/economy-overlay.json` + layers manifest `economy-resources`
- [x] **eco-04** World editor **Economy** module + Tick +1/+7 + `/api/world/economy`
- [x] **eco-05** Map **Econ** HUD toggle (resource diamonds ≠ city pins)

## Open

- [ ] **eco-10** Soft-clock cron/agent tick (optional; wire to diegetic 48h IRL later)
- [ ] **eco-11** Sim dock panel: live prices snapshot (honest, not fake)
- [ ] **eco-12** GM promote `[proposal]` mineral/federal rows → canon
- [ ] **eco-13** Playwright smoke: World Economy dashboard + Econ overlay toggle
- [ ] **eco-14** Couple agriculture-state fishing numbers from water extract (one-way sync)

## Docs

- `worldbuilding/ECONOMY.md`
- Roadmap: full economy sim **in scope** for this chronicle (was listed out-of-scope; GM override)
