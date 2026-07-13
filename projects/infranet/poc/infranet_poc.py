"""Infranet PoC v0 — submit job -> isolated-ish process -> meter CPU/wall -> SQLite token ledger.

The smallest honest slice of the V1 marketplace loop:

    consumer submits payload -> runs in a sandboxed subprocess on this machine
    -> meter reads CPU-ms and wall-ms -> ledger debits consumer / credits producer
    in compute tokens (1 token = 1 CPU-millisecond, integer math throughout).

What is real and what is placeholder: see README.md next to this file.
Run the demo:        py -3 infranet_poc.py        (Windows)  /  python3 infranet_poc.py
Run the self-check:  py -3 smoke_test.py
"""

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone

TOKENS_PER_CPU_MS = 1   # v0 rate: 1 compute token per CPU-millisecond, no hardware tiers yet
MIN_CHARGE_TOKENS = 1   # a metered job never rounds down to free
DEFAULT_TIMEOUT_S = 10
METER_MARK = "__INFRANET_METER__"
DEFAULT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger.sqlite3")

# ponytail: v0 isolation = `python -I` subprocess in a scratch dir with a stripped env and a
# timeout. That is a process boundary, not a security boundary; the v1 target is a micro-VM
# airgap (Firecracker / Cloud Hypervisor class) metered from outside the guest. Do not
# present this runner as safe for genuinely untrusted payloads.

# The wrapper runs inside the sandbox process. It executes the payload, then always emits a
# one-line meter record (survives payload exceptions). CPU is measured with process_time()
# from payload start, so interpreter boot is not billed. Self-reported metering is gameable;
# production meters from outside the guest (hypervisor/cgroup stats).
WRAPPER = """\
import json, sys, time
payload = sys.stdin.read()
t0 = time.process_time()
ok = True
try:
    exec(compile(payload, "<job>", "exec"), {"__name__": "__job__"})
except BaseException as e:
    ok = False
    print("job error: %r" % (e,), file=sys.stderr)
finally:
    cpu_ms = int((time.process_time() - t0) * 1000)
    print("@MARK@ " + json.dumps({"cpu_ms": cpu_ms, "ok": ok}))
""".replace("@MARK@", METER_MARK)

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts(
    id      TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS jobs(
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    consumer      TEXT NOT NULL,
    producer      TEXT NOT NULL,
    status        TEXT NOT NULL,
    wall_ms       INTEGER,
    cpu_ms        INTEGER,
    tokens        INTEGER NOT NULL DEFAULT 0,
    submitted_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entries(
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id  INTEGER NOT NULL REFERENCES jobs(id),
    account TEXT NOT NULL REFERENCES accounts(id),
    delta   INTEGER NOT NULL
);
"""


def open_ledger(db_path=DEFAULT_DB):
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def ensure_account(conn, account_id, grant=0):
    """Create the account with an initial grant if it does not exist yet."""
    conn.execute(
        "INSERT OR IGNORE INTO accounts(id, balance) VALUES(?, ?)", (account_id, grant)
    )
    conn.commit()


def balance(conn, account_id):
    row = conn.execute("SELECT balance FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return row[0] if row else None


def _run_sandboxed(payload, timeout_s):
    """Run payload in `python -I` with a scratch cwd and stripped env. Returns raw meter data."""
    with tempfile.TemporaryDirectory(prefix="infranet-job-") as scratch:
        env = {
            # minimum for python.exe to start on Windows (DLLs, temp); nothing inherited
            "SystemRoot": os.environ.get("SystemRoot", ""),
            "TEMP": scratch,
            "TMP": scratch,
        }
        t0 = time.perf_counter()
        try:
            proc = subprocess.run(
                [sys.executable, "-I", "-c", WRAPPER],
                input=payload,
                capture_output=True,
                text=True,
                cwd=scratch,
                env=env,
                timeout=timeout_s,
            )
        except subprocess.TimeoutExpired:
            wall_ms = int((time.perf_counter() - t0) * 1000)
            return {"status": "killed_unmetered", "wall_ms": wall_ms, "cpu_ms": None}
        wall_ms = int((time.perf_counter() - t0) * 1000)

    meter = None
    for line in reversed(proc.stdout.splitlines()):
        if line.startswith(METER_MARK):
            meter = json.loads(line[len(METER_MARK):])
            break
    if meter is None:
        # sandbox died before the meter line (hard crash); no reading -> no charge in v0
        return {"status": "failed_unmetered", "wall_ms": wall_ms, "cpu_ms": None}
    status = "completed" if meter["ok"] else "completed_with_error"
    return {"status": status, "wall_ms": wall_ms, "cpu_ms": meter["cpu_ms"]}


def submit_job(conn, consumer, producer, payload, timeout_s=DEFAULT_TIMEOUT_S):
    """Run one job and settle it. Returns a dict with job_id/status/wall_ms/cpu_ms/tokens.

    Charging rule (the power-company analogy): runtime consumed is runtime paid for, even if
    the payload raised. Only a missing meter reading (kill/crash) goes unbilled in v0 —
    production metering happens outside the guest, so that dodge disappears at v1.
    """
    result = _run_sandboxed(payload, timeout_s)
    metered = result["cpu_ms"] is not None
    tokens = max(MIN_CHARGE_TOKENS, result["cpu_ms"] * TOKENS_PER_CPU_MS) if metered else 0

    cur = conn.cursor()
    cur.execute("BEGIN")
    cur.execute(
        "INSERT INTO jobs(consumer, producer, status, wall_ms, cpu_ms, tokens, submitted_utc)"
        " VALUES(?,?,?,?,?,?,?)",
        (
            consumer,
            producer,
            result["status"],
            result["wall_ms"],
            result["cpu_ms"],
            tokens,
            datetime.now(timezone.utc).isoformat(timespec="seconds"),
        ),
    )
    job_id = cur.lastrowid
    if tokens > 0:
        # double entry: the pair always sums to zero, so the ledger conserves tokens
        cur.execute(
            "INSERT INTO entries(job_id, account, delta) VALUES(?,?,?)",
            (job_id, consumer, -tokens),
        )
        cur.execute(
            "INSERT INTO entries(job_id, account, delta) VALUES(?,?,?)",
            (job_id, producer, tokens),
        )
        cur.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (tokens, consumer))
        cur.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (tokens, producer))
    conn.commit()

    return {"job_id": job_id, "tokens": tokens, **result}


def statement(conn):
    """Per-account settlement summary: (account, balance, jobs_consumed, jobs_produced)."""
    rows = conn.execute(
        """
        SELECT a.id, a.balance,
               (SELECT COUNT(*) FROM jobs j WHERE j.consumer = a.id),
               (SELECT COUNT(*) FROM jobs j WHERE j.producer = a.id)
        FROM accounts a ORDER BY a.id
        """
    ).fetchall()
    return rows


DEMO_JOBS = [
    ("busy math", "total = sum(i * i for i in range(2_000_000))\nprint('sum of squares:', total)"),
    ("sleeper (wall != cpu)", "import time\ntime.sleep(0.3)\nprint('slept 0.3s')"),
    ("crasher (still metered)", "raise ValueError('paid for the runtime it burned')"),
]


def main():
    db = DEFAULT_DB
    if os.path.exists(db):
        os.remove(db)  # demo starts from a clean ledger each run
    conn = open_ledger(db)
    ensure_account(conn, "alice", grant=10_000)   # consumer with prepaid tokens
    ensure_account(conn, "garage-pc-1", grant=0)  # producer starts empty

    print(f"ledger: {db}")
    for name, payload in DEMO_JOBS:
        r = submit_job(conn, "alice", "garage-pc-1", payload)
        print(
            f"job {r['job_id']} [{name}] -> {r['status']}"
            f" wall={r['wall_ms']}ms cpu={r['cpu_ms']}ms charged={r['tokens']} tokens"
        )

    r = submit_job(conn, "alice", "garage-pc-1", "while True: pass", timeout_s=1)
    print(
        f"job {r['job_id']} [runaway loop] -> {r['status']}"
        f" wall={r['wall_ms']}ms cpu={r['cpu_ms']}ms charged={r['tokens']} tokens"
        " (no meter reading -> no charge in v0)"
    )

    print("\nsettlement statement:")
    for acct, bal, consumed, produced in statement(conn):
        print(f"  {acct:12s} balance={bal:6d} tokens  (consumed {consumed} jobs, produced {produced})")
    conn.close()


if __name__ == "__main__":
    main()
