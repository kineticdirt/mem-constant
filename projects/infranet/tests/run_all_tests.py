#!/usr/bin/env python3
"""
Infranet Test Suite Runner
"""
import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def run_tests():
    print("Infranet Test Suite")
    print("=" * 50)
    print()
    
    start_time = time.time()
    tests_passed = 0
    tests_failed = 0
    
    # Import and run tests
    try:
        print("[BLOCKCHAIN] Testing Blockchain...")
        from tests.test_blockchain import (
            test_blockchain_creation,
            test_add_block,
            test_transaction_processing
        )
        test_blockchain_creation()
        test_add_block()
        test_transaction_processing()
        tests_passed += 3
        print("[OK] Blockchain tests passed\n")
    except Exception as e:
        import traceback
        print(f"[FAIL] Blockchain tests failed: {e}")
        traceback.print_exc()
        print()
        tests_failed += 1
    
    try:
        print("[IDENTITY] Testing Identity Registry...")
        from tests.test_identity import (
            test_identity_registration,
            test_identity_activation,
            test_identity_verification,
            test_identity_revocation
        )
        test_identity_registration()
        test_identity_activation()
        test_identity_verification()
        test_identity_revocation()
        tests_passed += 4
        print("[OK] Identity tests passed\n")
    except Exception as e:
        print(f"[FAIL] Identity tests failed: {e}\n")
        tests_failed += 1
    
    try:
        print("[COMPUTE] Testing Compute Marketplace...")
        from tests.test_compute import (
            test_resource_registration,
            test_task_lifecycle,
            test_reputation_update
        )
        test_resource_registration()
        test_task_lifecycle()
        test_reputation_update()
        tests_passed += 3
        print("[OK] Compute Marketplace tests passed\n")
    except Exception as e:
        print(f"[FAIL] Compute Marketplace tests failed: {e}\n")
        tests_failed += 1
    
    # Integration test
    try:
        print("[INTEGRATION] Testing Integration...")
        from tests.test_blockchain import Blockchain
        from tests.test_identity import IdentityRegistry
        from tests.test_compute import ComputeMarketplace, TaskType, ComputeResource
        
        # Create components
        blockchain = Blockchain(chain_id=1)
        registry = IdentityRegistry()
        marketplace = ComputeMarketplace()
        
        # Register identity
        address = "user1"
        identity_hash = registry.register_identity(address, "CARD123")
        registry.activate_identity(address, "key")
        print("   - Registered and activated identity")
        
        # Register compute resource
        resource = ComputeResource(
            node_id="node1",
            cpu_cores=8,
            memory_gb=16,
            available=True,
            current_load=0.0,
            reputation=50.0
        )
        marketplace.register_resource(resource)
        print("   - Registered compute resource")
        
        # Submit and complete task
        task_id = marketplace.submit_task(TaskType.VERIFICATION, 50)
        marketplace.assign_task(task_id)
        marketplace.start_task(task_id)
        reward = marketplace.complete_task(task_id, True)
        print(f"   - Completed verification task, reward: {reward}")
        
        # Add block
        from tests.test_blockchain import Block, BlockHeader, Transaction
        tx = Transaction(
            nonce=0,
            from_addr="alice",
            to_addr=None,
            value=0,
            gas_limit=21000,
            gas_price=1,
            payload=b'',
            tx_type="identity"
        )
        block = Block(
            header=BlockHeader(
                previous_hash=blockchain.get_latest_block().hash(),
                merkle_root=Block.calculate_merkle_root([tx]),
                timestamp=int(time.time()),
                block_number=1,
                proposer="node1"
            ),
            transactions=[tx]
        )
        blockchain.add_block(block)
        print(f"   - Added block, height: {blockchain.get_block_count()}")
        
        tests_passed += 1
        print("[OK] Integration test passed\n")
    except Exception as e:
        print(f"[FAIL] Integration test failed: {e}\n")
        tests_failed += 1
        import traceback
        traceback.print_exc()
    
    elapsed_time = time.time() - start_time
    
    print("=" * 50)
    print(f"Test Results:")
    print(f"   Passed: {tests_passed}")
    print(f"   Failed: {tests_failed}")
    print(f"   Time: {elapsed_time:.3f}s")
    print("=" * 50)
    
    return tests_failed == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)

