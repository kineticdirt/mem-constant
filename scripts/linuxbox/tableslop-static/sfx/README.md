# Tableslop SFX / VFX bank

Shared audio catalog for Phone, Radio, Sim, and later map chrome.

## Layout

| Path | Role |
|------|------|
| `sfx-manifest.json` | Catalog of ids (clicks, door, static, buzz, voice slots) |
| `sfx-bank.js` | `TableslopSfx.play(id)` — file if present, else procedural |
| `assets/` | Drop `.ogg` / `.wav` / `.mp3` here using manifest `file` names |
| `/sfx/` HTTP mount | Served by `tableslop-server` `STATIC_MOUNTS.sfx` |

## Usage

```js
import { TableslopSfx } from "/sfx/sfx-bank.js";
await TableslopSfx.load();
TableslopSfx.setEnabled(true);
TableslopSfx.play("ui.click");
TableslopSfx.play("line.static");
```

## Adding real assets (PC voice / Foley)

1. Put file in `assets/` matching `file` in the manifest (e.g. `ui-click.ogg`).
2. Optionally set entry `ready` to `"file"`.
3. Voice lines use campaign `campaigns/tropic-gooner/phone/voice-manifest.json` (PC generates; potato caches). Do not run TTS on potato.

## Rules

- Fail soft — missing files fall back to `proc`.
- Respect user mute (`tableslop-sfx-on` / phone SND toggle).
- Never write `regions-ui.json`.
