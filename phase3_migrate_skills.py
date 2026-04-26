"""Phase 3.1 — copy 34 reframed/keep skills from .cursor/skills/bmad-*/
into src/mem_constant/templates/workflow-skills/<clean-name>/.

Strips the bmad- prefix in folder names, in SKILL.md frontmatter `name:`
fields, and in cross-references inside text files (.md, .yaml, .csv).

One-shot migration. Idempotent: re-running overwrites target tree.
Run from workspace root: python phase3_migrate_skills.py
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

SRC_ROOT = Path(".cursor/skills")
DST_ROOT = Path("src/mem_constant/templates/workflow-skills")

EXCLUDED = {
    "bmad-help",
    "bmad-party-mode",
    "bmad-distillator",
    "bmad-checkpoint-preview",
    "bmad-correct-course",
    "bmad-document-project",
    "bmad-shard-doc",
}

ALL_BMAD_NAMES = [
    "bmad-advanced-elicitation",
    "bmad-agent-architect",
    "bmad-agent-code-analyst",
    "bmad-agent-dev",
    "bmad-agent-dx-designer",
    "bmad-agent-spec-author",
    "bmad-agent-tech-writer",
    "bmad-brainstorming",
    "bmad-check-implementation-readiness",
    "bmad-checkpoint-preview",
    "bmad-code-review",
    "bmad-correct-course",
    "bmad-create-architecture",
    "bmad-create-developer-experience-design",
    "bmad-create-epics-and-stories",
    "bmad-create-implementation-spec",
    "bmad-create-story",
    "bmad-dev-story",
    "bmad-distillator",
    "bmad-document-project",
    "bmad-edit-implementation-spec",
    "bmad-editorial-review-prose",
    "bmad-editorial-review-structure",
    "bmad-feature-brief",
    "bmad-generate-project-context",
    "bmad-help",
    "bmad-index-docs",
    "bmad-party-mode",
    "bmad-qa-generate-e2e-tests",
    "bmad-quick-dev",
    "bmad-release-notes-prfaq",
    "bmad-retrospective",
    "bmad-review-adversarial-general",
    "bmad-review-edge-case-hunter",
    "bmad-shard-doc",
    "bmad-sprint-planning",
    "bmad-sprint-status",
    "bmad-technical-domain-research",
    "bmad-technical-research",
    "bmad-tooling-landscape-research",
    "bmad-validate-implementation-spec",
]

REWRITABLE_SUFFIXES = {".md", ".yaml", ".yml", ".csv", ".txt"}

NAME_RE = re.compile(
    r"\b(" + "|".join(re.escape(n) for n in sorted(ALL_BMAD_NAMES, key=len, reverse=True)) + r")\b"
)


def clean(name: str) -> str:
    return name[len("bmad-"):] if name.startswith("bmad-") else name


def rewrite_text(text: str) -> str:
    return NAME_RE.sub(lambda m: clean(m.group(1)), text)


def copy_skill(src_dir: Path, dst_dir: Path) -> tuple[int, int]:
    """Copy src_dir -> dst_dir, rewriting text files. Returns (files, rewrites)."""
    if dst_dir.exists():
        shutil.rmtree(dst_dir)
    files = 0
    rewrites = 0
    for src_file in src_dir.rglob("*"):
        if src_file.is_dir():
            continue
        rel = src_file.relative_to(src_dir)
        dst_file = dst_dir / rel
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        if src_file.suffix.lower() in REWRITABLE_SUFFIXES:
            try:
                text = src_file.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                shutil.copy2(src_file, dst_file)
                files += 1
                continue
            new_text = rewrite_text(text)
            dst_file.write_text(new_text, encoding="utf-8")
            if new_text != text:
                rewrites += 1
        else:
            shutil.copy2(src_file, dst_file)
        files += 1
    return files, rewrites


def main() -> None:
    if not SRC_ROOT.is_dir():
        raise SystemExit(f"source root not found: {SRC_ROOT}")
    DST_ROOT.mkdir(parents=True, exist_ok=True)

    src_skills = sorted(p for p in SRC_ROOT.iterdir() if p.is_dir() and p.name.startswith("bmad-"))
    if len(src_skills) != 41:
        print(f"WARNING: expected 41 source skills, found {len(src_skills)}")

    published = 0
    skipped = 0
    total_files = 0
    total_rewrites = 0
    for src in src_skills:
        if src.name in EXCLUDED:
            skipped += 1
            continue
        dst_name = clean(src.name)
        dst = DST_ROOT / dst_name
        files, rewrites = copy_skill(src, dst)
        published += 1
        total_files += files
        total_rewrites += rewrites
        print(f"  {src.name:<48} -> {dst_name:<42} ({files} files, {rewrites} rewritten)")

    print()
    print(f"Published: {published} skills (expected 34)")
    print(f"Skipped:   {skipped} skills (expected 7)")
    print(f"Total:     {total_files} files, {total_rewrites} rewritten with name strips")


if __name__ == "__main__":
    main()
