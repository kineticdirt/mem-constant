# Infranet - Compute Cost Analysis

## Overview

This document analyzes the computational costs of running Infranet, including:
- Gas costs for blockchain operations
- Compute marketplace pricing
- Resource utilization
- Cost comparison with Ethereum

---

## 1. Blockchain Gas Costs

### 1.1 Standard Operations

**Transaction Costs** (in gas units):
- **Identity Operations**: 1,000 - 5,000 gas
  - Register identity: 2,000 gas
  - Activate identity: 1,000 gas
  - Verify identity: 3,000 gas
  - Revoke identity: 1,500 gas

- **Storage Operations**: 2,000 - 10,000 gas
  - Store encrypted data: 5,000 gas
  - Retrieve encrypted data: 2,000 gas
  - Verify storage: 3,000 gas
  - Delete data: 1,000 gas

- **Privacy Operations**: 5,000 - 50,000 gas
  - FHE computation: 10,000 - 50,000 gas (complexity-based)
  - MPC participation: 5,000 - 20,000 gas
  - ZKP generation: 15,000 - 40,000 gas
  - ZKP verification: 2,000 - 5,000 gas

- **Standard Operations**: Similar to Ethereum but optimized
  - Simple transfer: 21,000 gas
  - Contract call: 30,000 - 100,000 gas
  - Contract deployment: 200,000 - 500,000 gas

### 1.2 Gas Price Model

**Current Model** (simplified for demo):
- Base gas price: 1 token per gas unit
- Dynamic pricing: Based on network congestion
- Priority fees: Optional for faster processing

**Cost Examples** (assuming 1 token = $0.01):
- Identity registration: 2,000 gas × $0.01 = **$0.02**
- Simple transfer: 21,000 gas × $0.01 = **$0.21**
- FHE computation (medium): 25,000 gas × $0.01 = **$0.25**
- ZKP generation: 30,000 gas × $0.01 = **$0.30**

### 1.3 Cost Comparison: Ethereum vs Infranet

| Operation | Ethereum Gas | Ethereum Cost* | Infranet Gas | Infranet Cost* | Savings |
|-----------|--------------|----------------|--------------|----------------|---------|
| Simple Transfer | 21,000 | $0.50 - $50 | 21,000 | $0.21 | 58-99% |
| Identity Registration | N/A | N/A | 2,000 | $0.02 | N/A |
| FHE Computation | N/A | N/A | 25,000 | $0.25 | N/A |
| ZKP Verification | 100,000+ | $2.50 - $250 | 5,000 | $0.05 | 98-99% |
| Contract Call | 50,000 | $1.25 - $125 | 30,000 | $0.30 | 76-99% |

*Costs vary based on network conditions. Ethereum costs shown for low ($0.50) to high ($50) gas price scenarios.

---

## 2. Compute Marketplace Pricing

### 2.1 Task Pricing

**Base Pricing** (tokens per compute unit):
- **FHE Operations**: 0.1 tokens per operation
  - Encrypted addition: 10 compute units = 1 token
  - Encrypted multiplication: 50 compute units = 5 tokens
  - Deep computation chain: 100-1000 compute units = 10-100 tokens

- **MPC Participation**: 0.05 tokens per operation
  - Secret share computation: 20 compute units = 1 token
  - Protocol participation: 50-200 compute units = 2.5-10 tokens

- **ZKP Operations**: 0.15 tokens per operation
  - Proof generation: 100-500 compute units = 15-75 tokens
  - Proof verification: 10-50 compute units = 1.5-7.5 tokens

- **Verification Tasks**: 0.08 tokens per operation
  - Identity verification: 50 compute units = 4 tokens
  - Credential check: 25 compute units = 2 tokens

### 2.2 Reward Structure

**Reward Calculation**:
```
BaseReward = Complexity × BaseRate
PerformanceBonus = BaseReward × SpeedFactor × QualityFactor
ReputationBonus = BaseReward × (ReputationScore / 100)
TotalReward = BaseReward + PerformanceBonus + ReputationBonus
```

**Example Task Costs**:
- FHE task (complexity: 100): 100 × 0.1 = **10 tokens** base
- ZKP generation (complexity: 200): 200 × 0.15 = **30 tokens** base
- Verification (complexity: 50): 50 × 0.08 = **4 tokens** base

### 2.3 Node Resource Costs

**Resource Registration** (one-time):
- CPU cores: 1 token per core
- Memory: 0.1 tokens per GB
- Storage: 0.05 tokens per GB

**Example**:
- Node with 8 cores, 16GB RAM, 100GB storage:
  - Registration: 8 + 1.6 + 5 = **14.6 tokens**

**Ongoing Costs**:
- No ongoing fees for resource registration
- Only pay for actual compute usage

---

## 3. Resource Utilization

### 3.1 Demo System Costs

**Current Implementation** (Python):
- **CPU Usage**: < 1% (single-threaded, minimal computation)
- **Memory Usage**: ~10-20 MB
- **Execution Time**: ~30ms for full test suite
- **Storage**: < 1 MB (code + data)

**Estimated Costs** (if running on cloud):
- AWS t3.micro (1 vCPU, 1GB RAM): ~$0.01/hour
- Demo runtime: < 1 second
- **Cost per demo run**: ~$0.000003 (negligible)

### 3.2 Production System Estimates

**Single Node** (estimated):
- CPU: 2-4 cores recommended
- Memory: 4-8 GB RAM
- Storage: 100-500 GB
- Network: 100 Mbps

**Monthly Costs** (cloud hosting):
- Small node: $20-50/month
- Medium node: $50-100/month
- Large node: $100-200/month

**Network Costs** (distributed):
- 100 nodes: $2,000-5,000/month
- 1,000 nodes: $20,000-50,000/month
- 10,000 nodes: $200,000-500,000/month

---

## 4. Operation-Specific Costs

### 4.1 Identity Operations

**Registration**:
- Compute: ~1ms CPU time
- Storage: ~1 KB on-chain
- Cost: 2,000 gas = **$0.02**

**Activation**:
- Compute: ~0.5ms CPU time
- Storage: ~0.5 KB on-chain
- Cost: 1,000 gas = **$0.01**

**Verification** (simplified):
- Compute: ~2ms CPU time
- Storage: ~0.5 KB on-chain
- Cost: 3,000 gas = **$0.03**

**Verification** (full ZKP):
- Compute: ~100-500ms CPU time
- Storage: ~2-5 KB on-chain
- Cost: 15,000-40,000 gas = **$0.15 - $0.40**

### 4.2 Storage Operations

**Store Encrypted Data**:
- Compute: ~5-10ms CPU time
- Storage: Variable (off-chain)
- On-chain: ~0.5 KB (hash + metadata)
- Cost: 5,000 gas = **$0.05**

**Retrieve Encrypted Data**:
- Compute: ~2-5ms CPU time
- Network: Variable
- Cost: 2,000 gas = **$0.02**

### 4.3 Compute Marketplace Operations

**Submit Task**:
- Compute: ~1ms CPU time
- Storage: ~0.1 KB on-chain
- Cost: 1,000 gas = **$0.01**

**Task Execution** (FHE example):
- Compute: 100-1000ms CPU time (complexity-dependent)
- Network: Variable
- Reward: 10-100 tokens = **$0.10 - $1.00**

**Task Execution** (ZKP example):
- Compute: 200-2000ms CPU time
- Network: Variable
- Reward: 15-75 tokens = **$0.15 - $0.75**

---

## 5. Cost Optimization Strategies

### 5.1 Batch Processing

**Benefits**:
- Multiple operations in one transaction
- Reduced gas costs per operation
- Example: 10 identity verifications
  - Individual: 10 × 3,000 = 30,000 gas
  - Batched: 1 × 15,000 = 15,000 gas
  - **Savings: 50%**

### 5.2 Layer 2 Solutions

**Off-Chain Computation**:
- Perform FHE/MPC off-chain
- Submit only results on-chain
- **Cost reduction: 80-90%**

**State Channels**:
- Frequent operations off-chain
- Periodic settlement on-chain
- **Cost reduction: 70-85%**

### 5.3 Caching and Optimization

**Result Caching**:
- Cache verification results
- Reuse for identical queries
- **Cost reduction: 90-95%**

**Pre-computation**:
- Pre-compute common operations
- Store results for fast access
- **Cost reduction: 60-80%**

---

## 6. Cost Scaling

### 6.1 Network Growth

**Linear Scaling**:
- More nodes = more compute capacity
- More users = more transactions
- Costs scale with usage, not fixed infrastructure

**Efficiency Gains**:
- Larger network = better load distribution
- More competition = lower prices
- Economies of scale

### 6.2 Transaction Volume

**Current Demo**:
- ~10-20 transactions per demo
- Total cost: ~$0.20 - $0.40
- Execution time: < 1 second

**Production Estimates**:
- 1,000 transactions/second: $20-40/second = $1,728,000-3,456,000/day
- With optimizations: $172,800-345,600/day
- **Target: < $0.01 per transaction**

---

## 7. Cost Comparison Summary

### 7.1 Per-Operation Costs

| Operation | Infranet Cost | Ethereum Equivalent* | Savings |
|-----------|---------------|----------------------|---------|
| Identity Registration | $0.02 | N/A | N/A |
| Identity Verification | $0.03 | N/A | N/A |
| Simple Transfer | $0.21 | $0.50 - $50 | 58-99% |
| FHE Computation | $0.25 | N/A | N/A |
| ZKP Generation | $0.30 | $2.50 - $250 | 88-99% |
| Storage (per KB) | $0.05 | $0.10 - $10 | 50-99% |

*Ethereum costs vary widely based on network conditions

### 7.2 Monthly Costs (Example User)

**Light User** (10 transactions/month):
- Identity operations: 5 × $0.02 = $0.10
- Transfers: 3 × $0.21 = $0.63
- Verifications: 2 × $0.03 = $0.06
- **Total: ~$0.79/month**

**Medium User** (100 transactions/month):
- Identity operations: 20 × $0.02 = $0.40
- Transfers: 50 × $0.21 = $10.50
- Verifications: 20 × $0.03 = $0.60
- Compute tasks: 10 × $0.25 = $2.50
- **Total: ~$14.00/month**

**Heavy User** (1,000 transactions/month):
- Identity operations: 100 × $0.02 = $2.00
- Transfers: 500 × $0.21 = $105.00
- Verifications: 200 × $0.03 = $6.00
- Compute tasks: 200 × $0.25 = $50.00
- **Total: ~$163.00/month**

---

## 8. Cost Monitoring

### 8.1 Metrics to Track

- **Gas usage per transaction type**
- **Compute task costs**
- **Node resource utilization**
- **Network-wide costs**
- **User spending patterns**

### 8.2 Cost Alerts

- High gas price warnings
- Unusual spending patterns
- Resource exhaustion alerts
- Cost optimization suggestions

---

## 9. Future Cost Reductions

### 9.1 Planned Optimizations

- **Hardware acceleration**: GPU/FPGA for FHE/MPC
- **Algorithm improvements**: More efficient cryptographic operations
- **Network optimizations**: Better routing and load balancing
- **Layer 2 expansion**: More off-chain solutions

### 9.2 Expected Improvements

- **Year 1**: 50% cost reduction through optimizations
- **Year 2**: 70% cost reduction with hardware acceleration
- **Year 3**: 80% cost reduction with full Layer 2 deployment

---

## 10. Cost Transparency

### 10.1 User-Facing Costs

- Clear pricing before transaction
- Real-time cost estimation
- Historical cost tracking
- Cost breakdown by operation type

### 10.2 Developer Tools

- Cost estimation API
- Gas price oracle
- Cost analysis tools
- Optimization recommendations

---

## Appendix: Cost Calculation Examples

### Example 1: Identity Registration Flow

1. Register identity: 2,000 gas = $0.02
2. Activate identity: 1,000 gas = $0.01
3. First verification: 3,000 gas = $0.03
**Total: $0.06**

### Example 2: Compute Task Flow

1. Submit task: 1,000 gas = $0.01
2. Task execution: 10 tokens reward = $0.10
3. Result recording: 2,000 gas = $0.02
**Total: $0.13**

### Example 3: Full Verification Workflow

1. Identity registration: $0.02
2. Identity activation: $0.01
3. Submit verification task: $0.01
4. ZKP generation: 30 tokens = $0.30
5. Verification on-chain: $0.03
**Total: $0.37**

---

*Document Version: 1.0*  
*Last Updated: Initial Cost Analysis*  
*Note: Costs are estimates based on current design. Actual costs may vary.*




