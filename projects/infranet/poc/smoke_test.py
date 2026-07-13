"""Infranet PoC v0 self-check. Assert-based, stdlib only; fails loudly if metering
or ledger math breaks. Run: py -3 smoke_test.py
"""

import os
import tempfile

from infranet_poc import ensure_account, open_ledger, submit_job, balance

GRANT = 5_000


def main():
    fd, db = tempfile.mkstemp(prefix="infranet-smoke-", suffix=".sqlite3")
    os.close(fd)
    try:
        conn = open_ledger(db)
        ensure_account(conn, "consumer", grant=GRANT)
        ensure_account(conn, "producer", grant=0)

        # 1. CPU-busy job is metered and charged; cpu_ms drives the token amount
        r1 = submit_job(conn, "consumer", "producer", "sum(i * i for i in range(2_000_000))")
        assert r1["status"] == "completed", r1
        assert r1["cpu_ms"] is not None and r1["cpu_ms"] > 0, f"busy job read no CPU: {r1}"
        assert r1["tokens"] >= r1["cpu_ms"], f"charge below CPU reading: {r1}"

        # 2. Meter distinguishes wall time from CPU time (sleep burns wall, not CPU)
        r2 = submit_job(conn, "consumer", "producer", "import time; time.sleep(0.4)")
        assert r2["status"] == "completed", r2
        assert r2["wall_ms"] >= 350, f"sleep not reflected in wall clock: {r2}"
        assert r2["cpu_ms"] < r2["wall_ms"] // 2, f"sleep billed as CPU: {r2}"

        # 3. A payload that raises is still charged for runtime consumed (kettle boiled dry)
        r3 = submit_job(conn, "consumer", "producer", "raise RuntimeError('boom')")
        assert r3["status"] == "completed_with_error", r3
        assert r3["tokens"] >= 1, f"failed job escaped the meter: {r3}"

        # 4. Double-entry math: every job's entries sum to zero
        bad = conn.execute(
            "SELECT job_id, SUM(delta) FROM entries GROUP BY job_id HAVING SUM(delta) != 0"
        ).fetchall()
        assert not bad, f"non-balancing ledger entries: {bad}"

        # 5. Token conservation: balances still sum to the initial grant total
        total = conn.execute("SELECT SUM(balance) FROM accounts").fetchone()[0]
        assert total == GRANT, f"tokens created or destroyed: {total} != {GRANT}"

        # 6. Balances reconcile with the entry log (grant + deltas == stored balance)
        for acct, grant in (("consumer", GRANT), ("producer", 0)):
            deltas = conn.execute(
                "SELECT COALESCE(SUM(delta), 0) FROM entries WHERE account = ?", (acct,)
            ).fetchone()[0]
            assert grant + deltas == balance(conn, acct), f"{acct} balance drifted from entries"

        # 7. Producer earned exactly what consumer spent
        spent = GRANT - balance(conn, "consumer")
        assert spent == balance(conn, "producer") > 0, "debit/credit mismatch"

        conn.close()
        print(f"SMOKE OK - 3 jobs metered, {spent} tokens moved consumer->producer,"
              " ledger balanced and conserved")
    finally:
        os.remove(db)


if __name__ == "__main__":
    main()
