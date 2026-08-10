#!/usr/bin/env python3
"""Deterministic publish gate for source-analysis articles.

Two hard gates from the blog plan, plus soft warnings:
  1. anti-slop lint  — banned phrases / words / em-dash cap / "not X, it's Y" / repeated openers
                       + STE structural gates: sentence-length caps, semicolons, hedging
                       stacks, nominalizations, phrasal verbs, synonym rotation
  2. citation gate   — every external http(s) link must resolve (2xx/3xx)

Config (banned set + limits) is read from the single source of truth:
  .cursor/rules/anti-slop.mdc  (the fenced ```yaml block)

Usage:
  python check_article.py path/to/article.html [--no-net]
  python check_article.py --self-check

Exit 0 = all hard gates pass. Exit 1 = a hard gate failed. Network errors on link
resolution are warnings, not failures (transient); definitive 4xx/5xx fail the citation gate.
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import yaml

ANTI_SLOP = Path(__file__).resolve().parents[2] / "rules" / "anti-slop.mdc"


def load_config() -> dict:
    text = ANTI_SLOP.read_text(encoding="utf-8")
    m = re.search(r"```yaml\n(.*?)```", text, re.S)
    if not m:
        sys.exit(f"error: no ```yaml block in {ANTI_SLOP}")
    return yaml.safe_load(m.group(1))


class _Extract(HTMLParser):
    """Pull visible text + href links from the <article> body only.

    Scoping to <article> keeps shared site chrome (title, header/footer nav, modals)
    out of the prose lint and citation set — those aren't the post's content.
    Falls back to the whole document if no <article> is present.
    """

    def __init__(self) -> None:
        super().__init__()
        self._all_text: list[str] = []
        self._art_text: list[str] = []
        self._all_links: list[str] = []
        self._art_links: list[str] = []
        self._skip = 0
        self._article_depth = 0
        self._cur_block: list[str] = []
        self._cur_kind = "prose"
        self._art_blocks: list[tuple[str, str]] = []

    _BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "figcaption", "ul", "ol"}
    _HEADING = {"h1", "h2", "h3", "h4", "h5", "h6"}

    def _flush_block(self) -> None:
        text = re.sub(r"\s+", " ", " ".join(self._cur_block)).strip()
        if text:
            self._art_blocks.append((self._cur_kind, text))
        self._cur_block = []
        self._cur_kind = "prose"

    def _boundary(self) -> None:
        # Block edges end a "sentence" so headings/list items don't glue to prose.
        self._all_text.append("\n")
        if self._article_depth:
            self._art_text.append("\n")
            self._flush_block()

    def handle_starttag(self, tag, attrs):
        if tag == "article":
            self._article_depth += 1
        if tag in self._BLOCK:
            self._boundary()
        if tag in self._HEADING:
            self._cur_kind = "heading"
        elif tag == "li":
            self._cur_kind = "list"
        elif tag == "pre":
            # Code samples are exempt from STE prose gates (semicolons etc.).
            self._cur_kind = "code"
        if tag in ("script", "style"):
            self._skip += 1
        if tag == "a" and self._skip == 0:
            for k, v in attrs:
                if k == "href" and v and v.startswith(("http://", "https://")):
                    self._all_links.append(v)
                    if self._article_depth:
                        self._art_links.append(v)

    def handle_endtag(self, tag):
        if tag == "article" and self._article_depth:
            self._article_depth -= 1
        if tag in self._BLOCK:
            self._boundary()
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._skip == 0:
            self._all_text.append(data)
            if self._article_depth:
                self._art_text.append(data)
                self._cur_block.append(data)

    def close(self) -> None:
        super().close()
        if self._art_text:
            self._flush_block()  # trailing block with no closing boundary

    @property
    def text(self) -> str:
        parts = self._art_text if self._art_text else self._all_text
        return re.sub(r"[ \t]+", " ", " ".join(parts)).strip()  # keep \n block boundaries

    @property
    def blocks(self) -> list[tuple[str, str]]:
        """(kind, text) per article block; kind in {prose, heading, list, code}."""
        if self._art_text:
            return self._art_blocks
        return [("prose", self.text)] if self.text else []

    @property
    def links(self) -> list[str]:
        return self._art_links if self._art_text else self._all_links


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


# STE structural patterns live in code (they need word boundaries); the yaml block
# in anti-slop.mdc carries the numeric limits + plain-substring bans.
HEDGING_PATTERNS = [
    r"\bit is important to note\b",
    r"\bit should be noted\b",
    r"\bmay potentially\b",
    r"\bmight possibly\b",
    r"\bhelp to improve\b",
]
NOMINALIZATION_PATTERNS = [
    r"\bperform an analysis(?: of)?\b",
    r"\bmake a decision\b",
    r"\bconduct a review\b",
    r"\bgive an explanation(?: of)?\b",
    r"\bmake use of\b",
]
PHRASAL_VERB_PATTERNS = [
    r"\bspin up\b",
    r"\breach out\b",
    r"\bdive into\b",
    r"\btake off\b",  # as "remove" (STE 9.3); the aircraft sense is not blog prose
    r"\bput in place\b",
    r"\bfigure out\b",
    r"\bset up\b",
]
SYNONYM_GROUPS = [
    ("user", ("user", "customer", "client")),
    ("server", ("server", "host", "machine", "box")),
    ("agent", ("agent", "model", "assistant", "llm")),
]
# Imperative opener ⇒ instruction sentence (cap 20); anything else gets the
# description cap (25) — when unsure, take the lenient direction.
IMPERATIVE_STARTERS = {
    "run", "add", "set", "use", "open", "edit", "save", "check", "verify",
    "install", "configure", "restart", "start", "stop", "create", "delete",
    "remove", "do", "don't", "avoid", "prefer", "keep", "read", "write",
    "ask", "click", "copy", "build", "deploy", "push", "commit", "test",
    "fix", "update", "enable", "disable", "follow", "see", "note",
}


def lint_prose(text: str, cfg: dict, blocks: list[tuple[str, str]] | None = None) -> list[str]:
    fails: list[str] = []
    low = text.lower()
    words = re.findall(r"[a-zA-Z']+", low)
    n_words = max(len(words), 1)

    for phrase in cfg.get("banned_phrases", []):
        if phrase.lower() in low:
            fails.append(f"banned phrase: {phrase!r}")

    for word in cfg.get("banned_words", []):
        c = sum(1 for w in words if w == word.lower())
        if c > 2:  # ponytail: allow rare justified use, fail on overuse
            fails.append(f"overused word: {word!r} x{c}")

    limits = cfg.get("limits", {})
    cap = limits.get("em_dashes_per_1000_words")
    if cap is not None:
        em = text.count("\u2014")
        density = em * 1000.0 / n_words
        if density > cap:
            fails.append(f"em-dash density {density:.1f}/1000 > cap {cap} ({em} total)")

    if limits.get("not_x_its_y_template") == 0:
        if re.search(r"\bnot\b[^.?!,;]{0,60}?\bit(?:'s| is)\b", low):
            fails.append("'not X, it's Y' antithesis template present")

    max_rep = limits.get("repeated_sentence_opener_max")
    if max_rep is not None:
        openers = [s.split()[0].lower() for s in split_sentences(text) if s.split()]
        run = 1
        for a, b in zip(openers, openers[1:]):
            run = run + 1 if a == b else 1
            if run > max_rep:
                fails.append(f"repeated sentence opener {b!r} > {max_rep} in a row")
                break

    # --- STE structural gates (machine-checkable; structure beats word bans) ---
    if blocks is None:
        blocks = [("prose", b) for b in re.split(r"\n+", text) if b.strip()]
    prose_sentences = [
        (kind, s) for kind, b in blocks if kind != "code" for s in split_sentences(b)
    ]

    def _pattern_fails(patterns: list[str], max_n: int, tag: str) -> None:
        hits = [(s, p) for _, s in prose_sentences for p in patterns if re.search(p, s, re.I)]
        if len(hits) > max_n:
            for s, p in hits:
                fails.append(f"{tag}: matches /{p}/ ({s[:60]!r})")

    max_instr = limits.get("max_sentence_words_instruction", 20)
    max_desc = limits.get("max_sentence_words_description", 25)
    for kind, s in prose_sentences:
        n = len(re.findall(r"[a-zA-Z']+", s))
        if kind in ("heading", "list"):
            if n > 2 * max_desc:  # ponytail: headings/bullets fail only when egregious
                fails.append(f"sentence-length: {n} words in {kind} block > egregious {2 * max_desc} ({s[:60]!r})")
            continue
        m = re.match(r"[a-zA-Z']+", s.lower())
        is_instr = bool(m) and m.group(0) in IMPERATIVE_STARTERS
        cap = max_instr if is_instr else max_desc
        if n > cap:
            fails.append(f"sentence-length: {n} words > {'instruction' if is_instr else 'description'} cap {cap} ({s[:60]!r})")

    sem_max = limits.get("semicolons_max", 0)
    if sem_max is not None:
        hits = [s for _, s in prose_sentences if ";" in s]
        if len(hits) > sem_max:
            for s in hits:
                fails.append(f"semicolons: ';' in sentence ({s[:60]!r})")

    hedge_max = limits.get("hedging_stacks_max", 0)
    if hedge_max is not None:
        _pattern_fails(HEDGING_PATTERNS, hedge_max, "hedging-stack")
    nom_max = limits.get("nominalizations_max", 0)
    if nom_max is not None:
        _pattern_fails(NOMINALIZATION_PATTERNS, nom_max, "nominalization")
    pv_max = limits.get("phrasal_verbs_max", 0)
    if pv_max is not None:
        _pattern_fails(PHRASAL_VERB_PATTERNS, pv_max, "phrasal-verb")

    syn_max = limits.get("synonym_rotation_max", 0)
    if syn_max is not None:
        rot = []
        for kind, b in blocks:
            if kind == "code":
                continue
            for concept, terms in SYNONYM_GROUPS:
                used = [t for t in terms if re.search(rf"\b{re.escape(t)}s?\b", b, re.I)]
                if len(used) >= 2:
                    rot.append((concept, used, b))
        if len(rot) > syn_max:
            for concept, used, b in rot:
                fails.append(f"synonym-rotation: {concept!r} named {len(used)} ways {used} in one block ({b[:60]!r})")
    return fails


def resolve(url: str) -> tuple[str, str]:
    """Return (status, detail). status in {ok, fail, warn}."""
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "Mozilla/5.0 (article-gate)"})
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            code = r.status
            return ("ok", str(code)) if code < 400 else ("fail", str(code))
    except urllib.error.HTTPError as e:
        return ("fail", f"HTTP {e.code}") if e.code >= 400 else ("ok", str(e.code))
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return ("warn", f"unreachable: {e}")  # ponytail: transient net != broken citation


STE_RULE_TAGS = {"sentence-length", "semicolons", "hedging-stack", "nominalization", "phrasal-verb", "synonym-rotation"}

SELFCHECK_CLEAN = (
    "Run the report script. It writes one file per lane. "
    "Check the exit code before you commit. The script fails loudly when a lane file is missing. "
    "Read the log when a run fails. Each log line names the lane and the error."
)
SELFCHECK_SLOP = (
    "It is important to note that this may potentially help to improve reliability. "
    "The deployment process is something that matters because when you spin up a server and "
    "reach out to the team and dive into the logs it becomes clear that things can go wrong "
    "in many different ways. "
    "We should perform an analysis of the outage and make a decision about the rollback; "
    "conduct a review afterward."
    "\n\n"
    "The user sees the error first. The customer then files a ticket. The client waits for a fix."
)


def self_check() -> int:
    """Clean STE sample must pass; slop sample must fail on all six STE rules."""
    cfg = load_config()
    clean_fails = lint_prose(SELFCHECK_CLEAN, cfg)
    slop_fails = lint_prose(SELFCHECK_SLOP, cfg)
    got = {f.split(":", 1)[0] for f in slop_fails}
    ok = True
    if clean_fails:
        ok = False
        print("SELF-CHECK clean sample: FAIL (must produce no violations)")
        for f in clean_fails:
            print(f"  - {f}")
    else:
        print("SELF-CHECK clean sample: pass")
    missing = STE_RULE_TAGS - got
    if missing:
        ok = False
        print(f"SELF-CHECK slop sample: FAIL (rules did not fire: {sorted(missing)})")
    else:
        print("SELF-CHECK slop sample: pass (all six STE rules fired)")
    for f in slop_fails:
        print(f"  - {f}")
    print("SELF-CHECK RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?")
    ap.add_argument("--no-net", action="store_true", help="skip link resolution")
    ap.add_argument("--self-check", action="store_true", help="lint embedded samples and exit")
    ns = ap.parse_args()
    if ns.self_check:
        return self_check()
    if not ns.path:
        ap.error("path required (or use --self-check)")

    cfg = load_config()
    raw = Path(ns.path).read_text(encoding="utf-8")
    p = _Extract()
    p.feed(raw)
    p.close()

    print(f"== gate: {ns.path} ==")
    slop_fails = lint_prose(p.text, cfg, p.blocks)
    if slop_fails:
        print("ANTI-SLOP: FAIL")
        for f in slop_fails:
            print(f"  - {f}")
    else:
        print("ANTI-SLOP: pass")

    cite_fail = False
    if ns.no_net:
        print("CITATION: skipped (--no-net)")
    else:
        print(f"CITATION: resolving {len(p.links)} link(s)")
        for url in dict.fromkeys(p.links):
            status, detail = resolve(url)
            mark = {"ok": "ok ", "warn": "warn", "fail": "FAIL"}[status]
            print(f"  [{mark}] {detail:>14}  {url}")
            if status == "fail":
                cite_fail = True

    ok = not slop_fails and not cite_fail
    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
