#!/usr/bin/env python3
"""Generate a daily situation brief from RSS sources.

This script is intentionally dependency-free so it can run from cron,
Task Scheduler, or a subagent shell lane without extra setup.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import textwrap
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_MAX_ITEMS_PER_SOURCE = 8
DEFAULT_MAX_HEADLINES = 30


@dataclass
class Source:
    name: str
    rss_url: str
    tags: list[str]


@dataclass
class Headline:
    source: str
    title: str
    link: str
    published: str
    tags: list[str]


def _load_sources(path: Path) -> list[Source]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    sources: list[Source] = []
    for item in raw.get("sources", []):
        name = str(item.get("name", "")).strip()
        rss_url = str(item.get("rss_url", "")).strip()
        tags = [str(t).strip() for t in item.get("tags", []) if str(t).strip()]
        if not name or not rss_url:
            continue
        sources.append(Source(name=name, rss_url=rss_url, tags=tags))
    if not sources:
        raise ValueError(f"No valid sources found in {path}")
    return sources


def _fetch_xml(url: str, timeout_seconds: int) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "situation-monitor/1.0 (+local automation)"},
    )
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        return resp.read()


def _node_text(node: ET.Element | None, default: str = "") -> str:
    if node is None or node.text is None:
        return default
    return node.text.strip()


def _parse_feed(source: Source, xml_bytes: bytes, max_items: int) -> list[Headline]:
    root = ET.fromstring(xml_bytes)
    items: list[ET.Element] = []

    # RSS 2.0
    channel = root.find("channel")
    if channel is not None:
        items.extend(channel.findall("item"))

    # Atom
    if not items:
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        items.extend(root.findall("atom:entry", ns))

    headlines: list[Headline] = []
    for item in items[:max_items]:
        title = _node_text(item.find("title"), default="(untitled)")
        link = _node_text(item.find("link"), default="")
        published = _node_text(item.find("pubDate"), default="")

        # Atom-specific parsing
        if not link:
            atom_link = item.find("{http://www.w3.org/2005/Atom}link")
            if atom_link is not None:
                link = atom_link.attrib.get("href", "").strip()
        if not published:
            published = _node_text(item.find("{http://www.w3.org/2005/Atom}updated"), default="")

        headlines.append(
            Headline(
                source=source.name,
                title=_normalize_whitespace(title),
                link=link,
                published=published,
                tags=source.tags,
            )
        )
    return headlines


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _category_for_headline(headline: Headline) -> str:
    text = f"{headline.title} {' '.join(headline.tags)}".lower()
    rules = [
        ("geopolitics", ["war", "conflict", "sanction", "treaty", "border", "nato", "geopolit"]),
        ("markets", ["stocks", "bond", "inflation", "rate", "fed", "market", "economy", "oil"]),
        ("ai", ["ai", "model", "llm", "gpu", "inference", "openai", "anthropic", "gemma"]),
        ("cybersecurity", ["breach", "ransomware", "vulnerability", "cyber", "exploit", "malware"]),
    ]
    for category, keywords in rules:
        if any(k in text for k in keywords):
            return category
    return "general"


def _render_markdown(
    run_at_utc: dt.datetime,
    headlines: Iterable[Headline],
    max_headlines: int,
    source_errors: list[str],
) -> str:
    all_items = list(headlines)[:max_headlines]
    categorized: dict[str, list[Headline]] = {}
    for item in all_items:
        categorized.setdefault(_category_for_headline(item), []).append(item)

    lines: list[str] = []
    lines.append(f"# Daily Situation Brief ({run_at_utc.strftime('%Y-%m-%d %H:%M UTC')})")
    lines.append("")
    lines.append("## Snapshot")
    lines.append(f"- Headlines captured: {len(all_items)}")
    lines.append(f"- Categories present: {', '.join(sorted(categorized.keys())) if categorized else 'none'}")
    lines.append("")
    lines.append("## Priority Watchlist")
    watchlist = _build_watchlist(categorized)
    for item in watchlist:
        lines.append(f"- {item}")
    if not watchlist:
        lines.append("- No watchlist items inferred from current sources.")

    for category in sorted(categorized.keys()):
        lines.append("")
        lines.append(f"## {category.title()}")
        for h in categorized[category]:
            source_label = h.source
            link_part = f" ([link]({h.link}))" if h.link else ""
            lines.append(f"- {h.title} — `{source_label}`{link_part}")

    lines.append("")
    lines.append("## Mem-Constant Handoff Draft")
    lines.append("Promote to archive only if still relevant after current milestone:")
    for item in watchlist[:5]:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("Keep operational continuity in working cache:")
    lines.append("- Review this report in the next run and mark resolved watchlist items.")
    lines.append("- Escalate only recurring signals with repeated confirmation across days.")

    if source_errors:
        lines.append("")
        lines.append("## Source Errors")
        for err in source_errors:
            lines.append(f"- {err}")

    lines.append("")
    return "\n".join(lines)


def _build_watchlist(categorized: dict[str, list[Headline]]) -> list[str]:
    watchlist: list[str] = []
    for category in ("geopolitics", "markets", "ai", "cybersecurity"):
        items = categorized.get(category, [])
        if not items:
            continue
        sample = items[0]
        watchlist.append(f"{category.title()}: monitor '{sample.title}'")
    return watchlist


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _maybe_write_carryover(carryover_path: Path, brief_path: Path, watchlist: list[str]) -> None:
    carryover_lines = [
        "# Session Carryover (Situation Monitor)",
        "",
        f"- Latest brief: `{brief_path.as_posix()}`",
        "- Suggested next action: scan Priority Watchlist and resolve stale items.",
        "",
        "## Active Watchlist",
    ]
    if watchlist:
        carryover_lines.extend([f"- {w}" for w in watchlist])
    else:
        carryover_lines.append("- No active watchlist items.")
    carryover_lines.append("")
    _write(carryover_path, "\n".join(carryover_lines))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a daily news/macro/AI situation brief for agent workflows."
    )
    parser.add_argument(
        "--sources",
        default="scripts/situation_monitor/sources.example.json",
        help="Path to sources JSON file.",
    )
    parser.add_argument(
        "--out-dir",
        default="reports/situation-monitor",
        help="Directory for generated daily brief files.",
    )
    parser.add_argument(
        "--max-items-per-source",
        type=int,
        default=DEFAULT_MAX_ITEMS_PER_SOURCE,
    )
    parser.add_argument(
        "--max-headlines",
        type=int,
        default=DEFAULT_MAX_HEADLINES,
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
    )
    parser.add_argument(
        "--write-carryover",
        action="store_true",
        help="Also write .mem-constant/last-session.md with a short handoff.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(os.getcwd())
    sources_path = (root / args.sources).resolve()
    out_dir = (root / args.out_dir).resolve()

    try:
        sources = _load_sources(sources_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Failed to load sources: {exc}")
        return 2

    run_at_utc = dt.datetime.now(tz=dt.timezone.utc)
    all_headlines: list[Headline] = []
    source_errors: list[str] = []

    for source in sources:
        try:
            xml_bytes = _fetch_xml(source.rss_url, timeout_seconds=args.timeout_seconds)
            parsed = _parse_feed(source, xml_bytes, max_items=args.max_items_per_source)
            all_headlines.extend(parsed)
        except (urllib.error.URLError, ET.ParseError, TimeoutError, OSError) as exc:
            source_errors.append(f"{source.name}: {exc}")

    markdown = _render_markdown(
        run_at_utc=run_at_utc,
        headlines=all_headlines,
        max_headlines=args.max_headlines,
        source_errors=source_errors,
    )

    stamp = run_at_utc.strftime("%Y%m%d-%H%M%S")
    output_path = out_dir / f"situation-brief-{stamp}.md"
    _write(output_path, markdown)

    watchlist = []
    for line in markdown.splitlines():
        if line.startswith("- ") and ": monitor '" in line:
            watchlist.append(line[2:])

    if args.write_carryover:
        carryover_path = root / ".mem-constant" / "last-session.md"
        _maybe_write_carryover(carryover_path, output_path, watchlist)

    print(
        textwrap.dedent(
            f"""
            OK: wrote situation brief
            - output: {output_path}
            - headlines: {len(all_headlines)}
            - source_errors: {len(source_errors)}
            """
        ).strip()
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
