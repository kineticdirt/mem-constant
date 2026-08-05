#!/usr/bin/env python3
"""Fetch one URL via the Firecrawl cloud scrape API and print markdown.

Potato policy (agents/THINK_SECURITY_CHECKS.md C3): external live-page fetches
go through Firecrawl cloud instead of raw curl or local Chromium (~2 GB RAM).
Key: FIRECRAWL_API_KEY — process env first, else ~/.hermes/.env (last line
wins, same override semantics as Hermes). The key is never printed.

Usage: firecrawl-fetch.py <url>     # markdown on stdout
Exit:  0 ok | 1 usage | 2 no key | 3 API error | 4 network/timeout
"""
import json
import os
import sys
import urllib.error
import urllib.request

API_URL = "https://api.firecrawl.dev/v2/scrape"  # matches configure-firecrawl-hermes.sh smoke
ENV_PATH = os.path.expanduser("~/.hermes/.env")
TIMEOUT = 60  # hard cap, seconds


def load_key():
    key = os.environ.get("FIRECRAWL_API_KEY")
    try:
        with open(ENV_PATH, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("FIRECRAWL_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("\"'")
    except OSError:
        pass
    return key


def main():
    if len(sys.argv) != 2 or not sys.argv[1].startswith(("http://", "https://")):
        sys.exit("usage: firecrawl-fetch.py <url>")
    key = load_key()
    if not key:
        print("error: FIRECRAWL_API_KEY not in env or " + ENV_PATH, file=sys.stderr)
        sys.exit(2)
    body = json.dumps({"url": sys.argv[1], "formats": ["markdown"]}).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        print("error: firecrawl HTTP %s: %s" % (exc.code, detail), file=sys.stderr)
        sys.exit(3)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print("error: firecrawl fetch failed: %s" % exc, file=sys.stderr)
        sys.exit(4)
    except json.JSONDecodeError as exc:
        print("error: bad firecrawl response: %s" % exc, file=sys.stderr)
        sys.exit(4)
    data = payload.get("data") or payload
    markdown = data.get("markdown") or ""
    if not payload.get("success", True) or not markdown:
        print("error: no markdown returned: " + str(payload)[:300], file=sys.stderr)
        sys.exit(3)
    print(markdown)


if __name__ == "__main__":
    main()
