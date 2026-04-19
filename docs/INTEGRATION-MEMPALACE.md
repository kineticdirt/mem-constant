# Integrating MemPalace (archive layer)

**MemPalace** is a good fit for the **canonical archive** role in the mem-constant model. This document is a **practical wiring guide**, not a replacement for MemPalace’s own README.

## Install MemPalace

```bash
pip install mempalace
```

Check:

```bash
mem-constant doctor
```

You should see **`mempalace: installed`**.

## Initialize a palace (MemPalace CLI)

MemPalace ships its own **`mempalace`** CLI. Typical flow (see MemPalace docs for flags that match your version):

```bash
mempalace init "$HOME" --yes
```

Pick a **dedicated palace directory** if you do not want a broad home scan. Example layout (illustrative; follow upstream for v3):

- A directory you own, e.g. **`~/mempalace-archive/palace`**
- MemPalace config and entities under that tree per **`mempalace init`**

Record the palace path in your project’s **`mem-constant.yaml`**:

```yaml
mempalace_palace_path: "/absolute/path/to/palace"
```

## Cursor MCP (optional)

To expose MemPalace to Cursor via MCP, add a server entry pointing at MemPalace’s MCP module. Exact flags depend on MemPalace version; your **AI_GROUPCHAT** / runbook may cite:

```text
py -3 -m mempalace.mcp_server --palace <path-to-palace>
```

Set **`PYTHONIOENCODING=utf-8`** on Windows if upstream recommends it. **Restart Cursor** after editing **`mcp.json`**.

## Policy alignment

When promoting facts from a **working cache** into MemPalace, use thresholds from **`mem-constant.yaml`** together with the rules in **`docs/mem-constant/routing-policy.md`** (from **`mem-constant init`**).

## See also

- [INSTALL.md](INSTALL.md)
- [CONFIGURATION.md](CONFIGURATION.md)
- Upstream MemPalace: [PyPI mempalace](https://pypi.org/project/mempalace/)
