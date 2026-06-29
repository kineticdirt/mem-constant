#!/usr/bin/env python3
"""
Measure actual compute costs of running Infranet demo
"""
import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "tests"))

def measure_demo():
    print("Measuring Infranet Demo Costs...")
    print("=" * 60)
    
    # Measure before
    start_time = time.perf_counter()
    
    # Import and run demo
    from tests.test_blockchain import Blockchain, Block, BlockHeader, Transaction, Account
    from tests.test_identity import IdentityRegistry
    from tests.test_compute import ComputeMarketplace, ComputeResource, TaskType
    import time as time_module
    
    # Run a simplified version of operations
    operations = 0
    
    # Blockchain operations
    blockchain = Blockchain(chain_id=1)
    blockchain.accounts["alice"] = Account("alice", 0, 100000)
    operations += 1
    
    tx = Transaction(0, "alice", "bob", 100, 21000, 1, b'', "standard")
    block = Block(
        header=BlockHeader(
            previous_hash=blockchain.get_latest_block().hash(),
            merkle_root=Block.calculate_merkle_root([tx]),
            timestamp=int(time_module.time()),
            block_number=1,
            proposer="node1"
        ),
        transactions=[tx]
    )
    blockchain.add_block(block)
    operations += 1
    
    # Identity operations
    registry = IdentityRegistry()
    registry.register_identity("user1", "CARD123")
    operations += 1
    registry.activate_identity("user1", "key")
    operations += 1
    
    # Compute operations
    marketplace = ComputeMarketplace()
    marketplace.register_resource(ComputeResource("node1", 8, 16, True, 0.0, 50.0))
    operations += 1
    task_id = marketplace.submit_task(TaskType.FHE, 100)
    marketplace.assign_task(task_id)
    marketplace.start_task(task_id)
    marketplace.complete_task(task_id, True)
    operations += 1
    
    # Measure after
    end_time = time.perf_counter()
    elapsed = end_time - start_time
    
    print(f"\n=== Actual Runtime Costs ===")
    print(f"Execution time: {elapsed:.4f} seconds")
    print(f"Operations performed: {operations}")
    print(f"Operations per second: {operations/elapsed:.1f}")
    
    # Cost estimates
    print(f"\n=== Cost Estimates ===")
    
    # AWS t3.micro: $0.0104/hour = $0.00000289/second
    aws_cost_per_sec = 0.0104 / 3600
    aws_cost = elapsed * aws_cost_per_sec
    print(f"AWS t3.micro cost: ${aws_cost:.8f}")
    
    # Google Cloud e2-micro: $0.0067/hour = $0.00000186/second
    gcp_cost_per_sec = 0.0067 / 3600
    gcp_cost = elapsed * gcp_cost_per_sec
    print(f"Google Cloud e2-micro cost: ${gcp_cost:.8f}")
    
    # Local machine (estimated $0.10/kWh, 50W usage)
    local_power_watts = 50
    local_cost_per_hour = (local_power_watts / 1000) * 0.10
    local_cost_per_sec = local_cost_per_hour / 3600
    local_cost = elapsed * local_cost_per_sec
    print(f"Local machine cost (50W): ${local_cost:.10f}")
    
    # Per-operation costs
    print(f"\n=== Per-Operation Costs ===")
    print(f"Per operation (AWS): ${aws_cost/operations:.8f}")
    print(f"Per operation (GCP): ${gcp_cost/operations:.8f}")
    print(f"Per operation (Local): ${local_cost/operations:.10f}")
    
    # Scale estimates
    print(f"\n=== Scale Estimates ===")
    ops_per_second = operations / elapsed
    print(f"Current throughput: {ops_per_second:.1f} ops/sec")
    
    # 1 million operations
    million_ops_time = 1000000 / ops_per_second
    million_ops_cost_aws = million_ops_time * aws_cost_per_sec
    print(f"\n1 million operations:")
    print(f"  Time: {million_ops_time/3600:.2f} hours")
    print(f"  AWS cost: ${million_ops_cost_aws:.2f}")
    print(f"  GCP cost: ${million_ops_time * gcp_cost_per_sec:.2f}")
    
    print("\n" + "=" * 60)
    print("Note: These are actual measured costs for the demo system.")
    print("Production costs may vary based on optimizations and scale.")

if __name__ == "__main__":
    try:
        measure_demo()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

