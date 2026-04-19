# mem-constant.yaml

After **`mem-constant init`**, your project root contains **`mem-constant.yaml`**. It is **documentation-first**: humans and tools read the same file. The CLI does **not** require PyYAML; optional fields are commented in the generated file.

## Top-level keys

### `version`

Integer schema version. Currently **`1`**.

### `package_version`

String copied from the installed **`mem-constant`** package when **`init`** ran. Helps you know which bundled spec revision matches **`docs/mem-constant/`**.

### `routing`

Numeric thresholds aligned with [memory/routing-policy.md](memory/routing-policy.md):

| Key | Default | Meaning |
|-----|---------|---------|
| **`mempalace_min_confidence`** | `0.75` | Minimum confidence to treat a candidate as archive-ready (see spec § Route A). |
| **`quarantine_max_confidence`** | `0.45` | Values at or below this align with quarantine / uncertain handling in the spec. |

Tweak these per project when you automate routing.

### `mempalace_palace_path` (optional)

If set, your **own tooling** (or a future mem-constant release) can point automation at a MemPalace palace directory. The MemPalace project documents **`mempalace init`** and palace layout; see [INTEGRATION-MEMPALACE.md](INTEGRATION-MEMPALACE.md).

### `boundaries.sync_triggers`

List of named boundaries when you should **reconcile** archive vs working cache (see [memory/autonomous-memory-architecture.md](memory/autonomous-memory-architecture.md)):

- **`new_chat`**
- **`new_agent`**
- **`end_milestone`**

These are **policy hints** for humans and agents, not scheduled jobs by themselves.

## Parsing in Python (optional)

```bash
pip install pyyaml
```

```python
import yaml
from pathlib import Path
cfg = yaml.safe_load(Path("mem-constant.yaml").read_text(encoding="utf-8"))
```

## Relationship to Markdown specs

**`mem-constant.yaml`** is the **knob panel** for a project. **`docs/mem-constant/*.md`** (from **`init`**) are the **full design**. If they disagree during development, **update the YAML** to match the spec you intend to follow, or fork the spec text for your org.
