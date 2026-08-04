#!/usr/bin/env python3
"""Protected runtime paths helper — see docs/runtime-state-protection.md.

Reads agents/protected-runtime-paths.json and implements the preserve /
restore / filter / verify primitives used by apply-git-bundle.sh,
git-pull-and-deploy.sh, push-linuxbox.sh and verify-runtime-state.sh.

Commands (run from anywhere; repo root auto-detected or $PROTECTED_REPO):
  list [--tracked-only] [--backup-only]   print matching paths (relative)
  preserve DIR                            copy git-TRACKED matches into DIR
  restore DIR                             type-aware restore from DIR
  filter-stdin                            drop protected paths from a path list
  verify-versions                         versioned-json watermark check

Exit codes: 0 ok, 1 verification failure, 2 usage/config error.
"""

import json
import os
import shutil
import subprocess
import sys

# ponytail: stdlib-only, single file — this must run on Debian python3.9 and
# Windows git-bash python3 with zero deps.


def repo_root():
    env = os.environ.get("PROTECTED_REPO")
    if env:
        return os.path.abspath(env)
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", ".."))


def load_manifest(repo):
    p = os.path.join(repo, "agents", "protected-runtime-paths.json")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _seg_match(seg, pat):
    import fnmatch

    return fnmatch.fnmatch(seg, pat)


def glob_match(path, glob):
    """Match with ** crossing '/' and * staying within one segment."""
    path = path.replace("\\", "/")
    glob = glob.replace("\\", "/")
    if glob.endswith("/**"):
        base = glob[:-3]
        if "*" not in base:
            return path == base or path.startswith(base + "/")
        # base itself has single-* segments (e.g. campaigns/*/characters/portraits/**)
        bsegs = base.split("/")
        psegs = path.split("/")
        if len(psegs) < len(bsegs):
            return False
        return all(_seg_match(p, b) for p, b in zip(psegs, bsegs))
    # segment-wise match, same segment count
    gsegs = glob.split("/")
    psegs = path.split("/")
    if len(gsegs) != len(psegs):
        return False
    return all(_seg_match(p, g) for p, g in zip(psegs, gsegs))


def entry_for(path, entries):
    for e in entries:
        if glob_match(path, e["glob"]):
            for ex in e.get("exclude", []):
                # exclude patterns like **/README.md → basename match
                if ex.startswith("**/") and path.endswith("/" + ex[3:]):
                    break
                if glob_match(path, ex):
                    break
            else:
                return e
    return None


def allowed_push(path, entries):
    for e in entries:
        for a in e.get("allow_push", []):
            if path.replace("\\", "/") == a:
                return True
    return False


def walk_matches(repo, entries):
    """All existing files under repo matching any entry. Yields (rel, entry)."""
    seen = set()
    for e in entries:
        g = e["glob"].replace("\\", "/")
        if g.endswith("/**"):
            base = g[:-3]
            roots = []
            if "*" in base:
                # expand single-* dirs level by level
                import glob as _glob

                roots = [
                    r.replace("\\", "/")
                    for r in _glob.glob(os.path.join(repo, base))
                    if os.path.isdir(r)
                ]
            else:
                cand = os.path.join(repo, base)
                if os.path.isdir(cand):
                    roots = [cand.replace("\\", "/")]
            for root in roots:
                for dirpath, _dirs, files in os.walk(root):
                    for name in files:
                        rel = os.path.relpath(os.path.join(dirpath, name), repo).replace(
                            "\\", "/"
                        )
                        if rel in seen:
                            continue
                        ent = entry_for(rel, entries)
                        if ent is not None:
                            seen.add(rel)
                            yield rel, ent
        else:
            import glob as _glob

            for hit in _glob.glob(os.path.join(repo, g)):
                if not os.path.isfile(hit):
                    continue
                rel = os.path.relpath(hit, repo).replace("\\", "/")
                if rel in seen:
                    continue
                ent = entry_for(rel, entries)
                if ent is not None:
                    seen.add(rel)
                    yield rel, ent


def git_tracked(repo):
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=repo,
            capture_output=True,
            check=True,
        ).stdout
    except Exception:
        return set()
    return {p.decode("utf-8", "replace") for p in out.split(b"\0") if p}


def json_version(path):
    try:
        with open(path, encoding="utf-8") as f:
            return int(json.load(f).get("version") or 0)
    except Exception:
        return 0


def cmd_list(repo, entries, tracked_only=False, backup_only=False):
    tracked = git_tracked(repo) if tracked_only else None
    for rel, ent in sorted(walk_matches(repo, entries)):
        if backup_only and not ent.get("backup", False):
            continue
        if tracked is not None and rel not in tracked:
            continue
        print(rel)
    return 0


def cmd_preserve(repo, entries, dest):
    """Snapshot protected paths before git reset — runtime files on disk are truth."""
    tracked = git_tracked(repo)
    n = 0
    for rel, ent in walk_matches(repo, entries):
        typ = ent.get("type", "runtime-file")
        src = os.path.join(repo, rel)
        if not os.path.isfile(src):
            continue
        # Runtime files: always preserve on-box copy (GM borders may differ from git HEAD).
        if typ != "runtime-file" and rel not in tracked:
            continue
        dst = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        n += 1
        print("preserve: %s" % rel)
    print("preserved %d protected file(s)" % n)
    return 0




def _gm_stats_json(path):
    """GM polygon vert stats via regions-ui-gm-stats.py (sibling script)."""
    if not path or not os.path.isfile(path):
        return None
    tool = os.path.join(os.path.dirname(os.path.abspath(__file__)), "regions-ui-gm-stats.py")
    if not os.path.isfile(tool):
        return None
    try:
        out = subprocess.run(
            [sys.executable, tool, path, "--json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None


def _restore_regions_ui_richer(saved, dest, rel):
    """Prefer preserve snapshot when it has more GM verts than post-reset head."""
    s_stats = _gm_stats_json(saved)
    d_stats = _gm_stats_json(dest) if os.path.isfile(dest) else None
    sv = int((s_stats or {}).get("total_verts") or 0)
    dv = int((d_stats or {}).get("total_verts") or 0)
    s_stub = bool((s_stats or {}).get("is_empty_or_stub"))
    d_stub = bool((d_stats or {}) .get("is_empty_or_stub")) if d_stats else True
    if s_stats and (sv > dv or (not s_stub and d_stub)):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(saved, dest)
        print(
            "restore: %s (GM-rich preserve verts=%d > head %d)"
            % (rel, sv, dv)
        )
        return True
    if d_stats and dv > sv:
        print(
            "restore: keep head %s (head GM verts %d > preserve %d)"
            % (rel, dv, sv)
        )
        return False
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(saved, dest)
    print("restore: %s (runtime truth)" % rel)
    return True

def cmd_restore(repo, entries, src_dir):
    """Type-aware restore of files copied by `preserve`."""
    restored = 0
    for dirpath, _dirs, files in os.walk(src_dir):
        for name in files:
            saved = os.path.join(dirpath, name)
            rel = os.path.relpath(saved, src_dir).replace("\\", "/")
            ent = entry_for(rel, entries)
            if ent is None:
                continue
            dest = os.path.join(repo, rel)
            typ = ent.get("type", "runtime-file")
            if typ == "versioned-json":
                local_ver = json_version(saved)
                head_ver = json_version(dest) if os.path.exists(dest) else 0
                if local_ver >= head_ver and local_ver > 0:
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    shutil.copy2(saved, dest)
                    restored += 1
                    print(
                        "restore: %s (local v%d >= head v%d)" % (rel, local_ver, head_ver)
                    )
                else:
                    print(
                        "restore: keep head %s (head v%d > local v%d)"
                        % (rel, head_ver, local_ver)
                    )
            else:
                # runtime-file: on-box copy is truth; regions-ui uses GM vert richness
                if rel.endswith("regions-ui.json"):
                    if _restore_regions_ui_richer(saved, dest, rel):
                        restored += 1
                else:
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    shutil.copy2(saved, dest)
                    restored += 1
                    print("restore: %s (runtime truth)" % rel)
    print("restored %d protected file(s)" % restored)
    return 0


def cmd_filter_stdin(repo, entries):
    dropped = 0
    for line in sys.stdin:
        p = line.strip().replace("\\", "/")
        if not p:
            continue
        ent = entry_for(p, entries)
        if ent is not None and not allowed_push(p, entries):
            dropped += 1
            print("filter: DROP protected %s" % p, file=sys.stderr)
            continue
        print(p)
    if dropped:
        print("filter: dropped %d protected path(s)" % dropped, file=sys.stderr)
    return 0


def cmd_verify_versions(repo, entries):
    """Fail (exit 1) if any versioned-json went DOWN vs the stored watermark."""
    wm_path = os.path.join(repo, "agents", "state", "protected-versions.json")
    try:
        with open(wm_path, encoding="utf-8") as f:
            marks = json.load(f)
    except Exception:
        marks = {}
    failures = []
    for rel, ent in walk_matches(repo, entries):
        if ent.get("type") != "versioned-json":
            continue
        cur = json_version(os.path.join(repo, rel))
        stored = int(marks.get(rel) or 0)
        if cur < stored:
            failures.append("%s: version went DOWN %d -> %d" % (rel, stored, cur))
        else:
            marks[rel] = cur
            print("verify-versions: %s v%d (watermark ok)" % (rel, cur))
    os.makedirs(os.path.dirname(wm_path), exist_ok=True)
    if not failures:
        with open(wm_path, "w", encoding="utf-8") as f:
            json.dump(marks, f, indent=2)
            f.write("\n")
    for msg in failures:
        print("verify-versions: FAIL %s" % msg, file=sys.stderr)
    return 1 if failures else 0


def main(argv):
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    repo = repo_root()
    try:
        manifest = load_manifest(repo)
    except Exception as e:
        print("protected-paths: cannot read manifest: %s" % e, file=sys.stderr)
        return 2
    entries = manifest.get("paths", [])
    cmd = argv[1]
    if cmd == "list":
        return cmd_list(
            repo,
            entries,
            tracked_only="--tracked-only" in argv,
            backup_only="--backup-only" in argv,
        )
    if cmd == "preserve":
        if len(argv) < 3:
            print("usage: preserve DIR", file=sys.stderr)
            return 2
        return cmd_preserve(repo, entries, argv[2])
    if cmd == "restore":
        if len(argv) < 3:
            print("usage: restore DIR", file=sys.stderr)
            return 2
        return cmd_restore(repo, entries, argv[2])
    if cmd == "filter-stdin":
        return cmd_filter_stdin(repo, entries)
    if cmd == "verify-versions":
        return cmd_verify_versions(repo, entries)
    print("unknown command: %s" % cmd, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
