# Infranet PoC v0 — metered jobs on a token ledger

The smallest honest slice of the V1 marketplace loop, runnable today on one Windows/Linux
machine with stock Python (stdlib only, no dependencies):

```text
submit job -> run in a sandboxed subprocess -> meter CPU-ms + wall-ms
          -> SQLite ledger debits consumer / credits producer in compute tokens
```

Unlike the older `projects/infranet/demo.py` (in-memory placeholders where every task
"succeeds" unconditionally), this PoC actually executes payloads, actually reads a meter,
and actually persists double-entry ledger rows.

## Run it

```bash
py -3 infranet_poc.py     # demo: 4 jobs incl. a sleeper, a crasher, a runaway loop
py -3 smoke_test.py       # self-check: fails loudly if metering or ledger math breaks
```

(`python3` on Linux/macOS.) The demo writes `ledger.sqlite3` beside the script
(gitignored, recreated each run); the smoke test uses a throwaway temp DB.

## What is real

- **Execution**: payloads run in a separate `python -I` process with a stripped
  environment, a scratch working directory, and a hard timeout. Crashing payloads are
  contained and still billed for the runtime they consumed.
- **Metering**: CPU-ms measured via `time.process_time()` around the payload (interpreter
  boot not billed), wall-ms from outside. The demo's sleeper job shows the meter telling
  them apart.
- **Ledger**: SQLite with `accounts` / `jobs` / `entries`; every settled job writes a
  balancing debit/credit pair (entries per job sum to zero, total tokens conserved).
  Rate: 1 token = 1 CPU-millisecond, integer math, minimum charge 1 token.
- **Self-check**: `smoke_test.py` asserts metering sanity (busy job billed, sleep not
  billed as CPU, crasher billed) and ledger math (per-job zero-sum, conservation,
  balances reconcile with the entry log, producer earned exactly what consumer spent).

## What is placeholder (and the v1 target)

- **Isolation is a process boundary, not a security boundary.** `python -I` + stripped env
  + timeout stops accidents, not attackers. The v1 design target is a micro-VM airgap
  (Firecracker / Cloud Hypervisor class) with guest egress routed through the host —
  see `../ARCHITECTURE.md`. Do not feed this runner genuinely untrusted payloads.
- **Metering is self-reported from inside the sandbox**, so a malicious payload could lie
  or (as the demo's runaway-loop job shows) die without a reading and go unbilled. In v1
  the meter reads from outside the guest (hypervisor/cgroup stats), which closes both holes.
- **No network of machines.** Consumer, producer, scheduler, and host are all this one
  machine. No discovery, no placement, no replication, no latency zones.
- **No payload screening.** The requester-side pre-screen ("forward security") from the
  threat model is not implemented here.
- **Tokens are ledger rows only** — no pricing, no benchmark tiers normalizing fast vs
  slow cores, no settlement to real money.

## Files

| File | Purpose |
|---|---|
| `infranet_poc.py` | Runner + meter + ledger + 4-job demo (`main()`) |
| `smoke_test.py` | Assert-based self-check, throwaway DB, no frameworks |
| `ledger.sqlite3` | Demo ledger (runtime artifact, gitignored) |

Pitch context: `docs/infranet/INFRANET-COMBINED-BRIEF.md` (PoC section). Engineering
detail: `../ARCHITECTURE.md`.
