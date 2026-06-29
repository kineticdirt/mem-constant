# Infranet System Demo

## Overview

The Infranet demo showcases the actual system in action with comprehensive logging. This is different from unit tests - it demonstrates real workflows and system behavior.

## Running the Demo

### Python Demo (Recommended - Works Now)

```bash
python demo.py
```

This will run all 4 demos:
1. **Blockchain Operations** - Transaction processing, account management
2. **Identity Management** - Registration, activation, verification, revocation
3. **Compute Marketplace** - Resource registration, task allocation, rewards
4. **Integrated Workflow** - End-to-end system integration

### Rust Demo (Requires Rust Installation)

Once Rust is installed:

```bash
cargo run --bin demo
```

## Demo Features

### Logging System

The demo includes a comprehensive logging system with:
- **Timestamps**: Unix timestamp for each log entry
- **Log Levels**: INFO, SUCCESS, ERROR, DEBUG
- **Structured Output**: Easy to parse and analyze
- **71+ log entries** per full demo run

### Demo 1: Blockchain Operations

Demonstrates:
- Blockchain creation
- Account creation and management
- Multiple transaction processing
- Balance tracking
- Block validation

**Example Output:**
```
[INFO] Creating new blockchain...
[SUCCESS] Blockchain created with chain_id: 1
[INFO] Processing transactions...
[SUCCESS] Block #1 added successfully
[INFO] Final account balances:
  - alice: 56,500 tokens
  - bob: 29,300 tokens
```

### Demo 2: Identity Management

Demonstrates:
- Identity registration
- Identity activation
- Identity verification
- Identity revocation

**Example Output:**
```
[SUCCESS] Registered identity for user1 (Card: CARD123456)
[SUCCESS] Activated identity for user1
[SUCCESS] Identity verified for user1
[SUCCESS] Identity revoked for user2
```

### Demo 3: Compute Marketplace

Demonstrates:
- Compute resource registration
- Task submission and assignment
- Task execution and completion
- Reward distribution
- Reputation updates

**Example Output:**
```
[SUCCESS] Registered node1: 8 cores, 16GB, reputation: 75.0
[INFO] Submitted task: task_1 (FHE computation, complexity: 100)
[SUCCESS] Task task_1 assigned to node2
[SUCCESS] Task task_1 completed, reward: 1000 tokens
[INFO] Total rewards distributed: 5250 tokens
```

### Demo 4: Integrated Workflow

Demonstrates:
- Cross-component integration
- Identity + Compute + Blockchain workflow
- End-to-end verification process

**Example Output:**
```
[SUCCESS] Identity registered and activated for demo_user
[SUCCESS] Compute resource registered
[SUCCESS] Verification task completed, reward: 500 tokens
[SUCCESS] Verification recorded on blockchain (height: 2)
```

## Log Analysis

The logger stores all entries in memory. You can:
- Count total log entries
- Filter by log level
- Analyze system behavior
- Debug issues

## Customization

### Enable Debug Logging

In `demo.py`, change:
```python
logger = Logger(enabled=True, debug=True)
```

### Run Individual Demos

Comment out demos you don't want to run:
```python
# demo_blockchain(logger)
# demo_identity(logger)
demo_compute(logger)
demo_integrated(logger)
```

### Custom Scenarios

Modify the demo functions to test specific scenarios:
- Different transaction amounts
- Multiple identity registrations
- Complex compute task workflows
- Error conditions

## Performance Metrics

The demo tracks:
- Transaction processing time
- Task completion rates
- Resource utilization
- System throughput

## Next Steps

1. **Add More Scenarios**: Create additional demo scenarios
2. **Performance Testing**: Add timing and performance metrics
3. **Error Handling**: Test error conditions and recovery
4. **Network Simulation**: Simulate multi-node network behavior
5. **Real Cryptography**: Integrate actual FHE/MPC/ZKP libraries

## Troubleshooting

### Unicode Errors (Windows)

If you see Unicode encoding errors, the demo uses ASCII characters. If issues persist, ensure your terminal supports UTF-8.

### Import Errors

Make sure you're running from the project root:
```bash
cd /path/to/Infranet
python demo.py
```

### Missing Dependencies

The demo only requires Python standard library - no external dependencies needed!




