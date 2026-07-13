# Infranet - Distributed Digital Storage & Identity Network

A **purely decentralized** blockchain-based network for digital storage and identity management with **black-box verification** - the system can verify credentials without ever revealing them, even theoretically with unlimited compute.

## Project Status

📋 **Planning Phase** - Comprehensive system architecture and implementation plan completed

## Core Principles

1. **Black-Box Verification**: System verifies credentials without seeing them
2. **Theoretical Irreversibility**: Impossible to reverse-engineer credentials even with unlimited compute
3. **NFC + Mobile Integration**: Physical NFC cards authenticate via mobile app
4. **Pure Decentralization**: No central authority, no single point of failure
5. **Phased Expansion**: Gradual rollout with clear milestones

## Key Features

- **Black-Box Verification**: Fully Homomorphic Encryption (FHE) + Secure Multi-Party Computation (MPC) + Zero-Knowledge Proofs (ZKP)
- **NFC Card Authentication**: Tap-to-login via secure NFC cards with hardware security modules
- **Theoretical Security**: Multiple cryptographic layers ensuring data cannot be extracted even with quantum computers
- **Self-Sovereign Identity**: User-controlled identity with DIDs and Verifiable Credentials
- **Distributed Storage**: Encrypted data stored across decentralized network
- **No Data Revelation**: System learns nothing beyond verification results

## Documentation

- **[docs/infranet/INFRANET-COMBINED-BRIEF.md](../../docs/infranet/INFRANET-COMBINED-BRIEF.md)**: **Canonical** pitch brief — **V1 = compute marketplace** (eBay-for-shared-compute; matching, metering, settlement, first-party seed services), **V2 = identity + walled-garden communities** (this README's identity/FHE/MPC/ZKP material is V2 research). Pointers: [PROPOSAL.md](./PROPOSAL.md), `docs/infranet-proposal.md`. Former split docs are stubs only.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: V1 platform engineering notes — VM airgap vs containers, "pay someone to run your virus" threat model, restricted pure-math tier, routed guest egress, latency zones, cold start
- **[poc/](./poc/)**: Runnable PoC v0 — job → sandboxed subprocess → CPU/wall metering → SQLite double-entry token ledger + smoke test (`poc/README.md` for the real/placeholder split)
- **[PLANNING.md](./PLANNING.md)**: Comprehensive system architecture, cryptographic design, and phased implementation plan (V2 identity layer)
- **[RESEARCH.md](./RESEARCH.md)**: Research on identity verification, privacy-preserving methods, and blockchain architecture
- **[COMPUTE_REWARDS.md](./COMPUTE_REWARDS.md)**: Distributed compute marketplace and verification reward mechanism design
- **[BLOCKCHAIN_PLATFORM.md](./BLOCKCHAIN_PLATFORM.md)**: Ethereum-like smart contract platform optimized for identity, storage, and verification
- **[DEMO.md](./DEMO.md)**: How to run and use the system demo with logging
- **[COST_ANALYSIS.md](./COST_ANALYSIS.md)**: Comprehensive cost analysis of compute operations and system usage
- **[AGENT-CHARTER.md](./AGENT-CHARTER.md)**: R&D scope and agent notes for this project

## Running the System

### Automated Demo (Recommended)
```bash
python demo.py
```

Runs all 4 demos with comprehensive logging:
- Blockchain operations
- Identity management
- Compute marketplace
- Integrated workflows

### Interactive Demo
```bash
python interactive_demo.py
```

Interactive CLI to test the system in real-time.

### Unit Tests
```bash
python tests/run_all_tests.py
```

## Cryptographic Foundation

**Three-Layer Security**:
1. **FHE (Fully Homomorphic Encryption)**: Computation on encrypted data
2. **MPC (Secure Multi-Party Computation)**: Distributed computation without data revelation
3. **ZKP (Zero-Knowledge Proofs)**: Proof generation without data exposure

**Security Guarantee**: Even with full network access, all encrypted data, unlimited compute time, and quantum computers, credentials cannot be extracted.

## Technology Stack (Planned)

- **Cryptography**: TFHE-rs, MP-SPDZ, Circom/StarkWare
- **Blockchain**: Custom PoID + PoS consensus
- **Mobile**: React Native / Flutter with NFC support
- **Storage**: IPFS/Arweave-like distributed storage
- **Networking**: libp2p for P2P communication

## Project Structure

```
Infranet/
├── PLANNING.md          # System architecture and implementation plan
├── RESEARCH.md          # Research documentation
├── COMPUTE_REWARDS.md   # Compute marketplace and reward system design
├── BLOCKCHAIN_PLATFORM.md # Smart contract platform design
├── README.md           # Project overview
└── [Future implementation files]
```

## Implementation Phases

1. **Foundation & Research** (Months 1-3)
2. **Core Cryptography** (Months 4-6)
3. **Blockchain & Network** (Months 7-9)
4. **NFC Card & Mobile App** (Months 10-12)
5. **Black-Box Verification** (Months 13-15)
6. **Testing & Security** (Months 16-18)
7. **Pilot Deployment** (Months 19-21)
8. **Scale & Expand** (Months 22+)

## Contributing

This project is in early research phase. Contributions and feedback welcome.

## License

TBD

---

*Project in active development*


