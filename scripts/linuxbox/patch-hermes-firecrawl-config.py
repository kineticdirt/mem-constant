#!/usr/bin/env python3
"""Set Hermes cloud browser + web backends to Firecrawl in ~/.hermes/config.yaml."""
from pathlib import Path

config_path = Path.home() / ".hermes/config.yaml"
text = config_path.read_text(encoding="utf-8")

if "cloud_provider:" in text and "cloud_provider: firecrawl" not in text:
    raise SystemExit("config already has a different browser.cloud_provider; edit manually")

if "cloud_provider: firecrawl" not in text:
    needle = "browser:\n"
    if needle not in text:
        raise SystemExit("browser: section not found in config.yaml")
    insert = (
        "browser:\n"
        "  cloud_provider: firecrawl\n"
        "  # Prefer cloud on 2GB Pi; local Chromium only for LAN/private URLs (Hermes default hybrid)\n"
    )
    text = text.replace(needle, insert, 1)

if "\nweb:\n" not in text and not text.lstrip().startswith("web:\n"):
    marker = "# Browser Tool Configuration\n"
    web_block = (
        "# =============================================================================\n"
        "# Web Search & Extract (cloud — low RAM on Pi)\n"
        "# =============================================================================\n"
        "web:\n"
        "  backend: firecrawl\n"
        "\n"
    )
    if marker in text:
        text = text.replace(marker, web_block + marker, 1)
    else:
        text = web_block + text

config_path.write_text(text, encoding="utf-8")
print("ok: config.yaml patched (browser.cloud_provider + web.backend = firecrawl)")
