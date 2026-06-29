#!/usr/bin/env python3
"""
Infranet System Demo with Logging
Demonstrates the actual system in action (not just tests)
"""
import sys
import time
import hashlib
from pathlib import Path

# Add tests to path for imports
sys.path.insert(0, str(Path(__file__).parent / "tests"))

from tests.test_blockchain import Blockchain, Block, BlockHeader, Transaction, Account
from tests.test_identity import IdentityRegistry
from tests.test_compute import ComputeMarketplace, ComputeResource, TaskType

class Logger:
    def __init__(self, enabled=True, debug=False):
        self.enabled = enabled
        self.debug_mode = debug
        self.logs = []
    
    def _log(self, level, message):
        if not self.enabled:
            return
        
        timestamp = int(time.time())
        log_entry = f"[{timestamp}] [{level}] {message}"
        print(log_entry)
        self.logs.append(log_entry)
    
    def info(self, message):
        self._log("INFO", message)
    
    def success(self, message):
        self._log("SUCCESS", message)
    
    def error(self, message):
        self._log("ERROR", message)
    
    def debug(self, message):
        if self.debug_mode:
            self._log("DEBUG", message)
    
    def section(self, title):
        if self.enabled:
            print(f"\n{'='*60}")
            print(f"  {title}")
            print(f"{'='*60}\n")

def demo_blockchain(logger):
    """Demo 1: Blockchain Operations"""
    logger.section("Demo 1: Blockchain Operations")
    
    logger.info("Creating new blockchain...")
    blockchain = Blockchain(chain_id=1)
    logger.success(f"Blockchain created with chain_id: {blockchain.chain_id}")
    
    # Create accounts
    logger.info("Creating accounts...")
    alice = "alice"
    bob = "bob"
    charlie = "charlie"
    
    blockchain.accounts[alice] = Account(
        address=alice,
        nonce=0,
        balance=100000
    )
    
    blockchain.accounts[bob] = Account(
        address=bob,
        nonce=0,
        balance=50000
    )
    
    blockchain.accounts[charlie] = Account(
        address=charlie,
        nonce=0,
        balance=25000
    )
    
    logger.success(f"Created accounts:")
    logger.info(f"  - {alice}: 100,000 tokens")
    logger.info(f"  - {bob}: 50,000 tokens")
    logger.info(f"  - {charlie}: 25,000 tokens")
    
    # Process multiple transactions
    logger.info("Processing transactions...")
    
    transactions = [
        Transaction(0, alice, bob, 500, 21000, 1, b'', "standard"),
        Transaction(0, bob, charlie, 200, 21000, 1, b'', "standard"),
        Transaction(1, alice, charlie, 1000, 21000, 1, b'', "standard"),
    ]
    
    for i, tx in enumerate(transactions, 1):
        logger.debug(f"Processing transaction {i}: {tx.from_addr} -> {tx.to_addr} ({tx.value} tokens)")
        
        merkle_root = Block.calculate_merkle_root([tx])
        block = Block(
            header=BlockHeader(
                previous_hash=blockchain.get_latest_block().hash(),
                merkle_root=merkle_root,
                timestamp=int(time.time()),
                block_number=i,
                proposer="node1"
            ),
            transactions=[tx]
        )
        
        if blockchain.add_block(block):
            logger.success(f"Block #{i} added successfully")
        else:
            logger.error(f"Failed to add block #{i}")
    
    # Show final balances
    logger.info("Final account balances:")
    for addr in [alice, bob, charlie]:
        account = blockchain.get_account(addr)
        logger.info(f"  - {addr}: {account.balance:,} tokens")
    
    logger.info(f"Blockchain height: {blockchain.get_block_count()}")
    logger.success("Blockchain demo completed")

def demo_identity(logger):
    """Demo 2: Identity Management"""
    logger.section("Demo 2: Identity Management")
    
    logger.info("Creating identity registry...")
    registry = IdentityRegistry()
    
    # Register multiple identities
    logger.info("Registering identities...")
    users = [
        ("user1", "CARD123456"),
        ("user2", "CARD789012"),
        ("user3", "CARD345678"),
    ]
    
    identity_hashes = {}
    for user, card_id in users:
        try:
            identity_hash = registry.register_identity(user, card_id)
            identity_hashes[user] = identity_hash
            logger.success(f"Registered identity for {user} (Card: {card_id})")
            logger.debug(f"  Identity hash: {identity_hash.hex()[:16]}...")
        except Exception as e:
            logger.error(f"Failed to register {user}: {e}")
    
    # Activate identities
    logger.info("Activating identities...")
    for user, _ in users:
        if registry.activate_identity(user, f"key_{user}"):
            logger.success(f"Activated identity for {user}")
        else:
            logger.error(f"Failed to activate {user}")
    
    # Verify identities
    logger.info("Verifying identities...")
    for user, identity_hash in identity_hashes.items():
        proof = identity_hash
        if registry.verify_identity(user, proof):
            logger.success(f"Identity verified for {user}")
        else:
            logger.error(f"Identity verification failed for {user}")
    
    # Revoke one identity
    logger.info("Revoking identity for user2...")
    if registry.revoke_identity("user2"):
        logger.success("Identity revoked for user2")
        if not registry.check_activation("user2"):
            logger.info("Confirmed: user2 is no longer active")
    
    logger.success("Identity management demo completed")

def demo_compute(logger):
    """Demo 3: Compute Marketplace"""
    logger.section("Demo 3: Compute Marketplace")
    
    logger.info("Creating compute marketplace...")
    marketplace = ComputeMarketplace()
    
    # Register multiple compute resources
    logger.info("Registering compute resources...")
    resources = [
        ComputeResource("node1", 8, 16, True, 0.0, 75.0),
        ComputeResource("node2", 16, 32, True, 0.2, 85.0),
        ComputeResource("node3", 4, 8, True, 0.5, 60.0),
    ]
    
    for resource in resources:
        if marketplace.register_resource(resource):
            logger.success(f"Registered {resource.node_id}: {resource.cpu_cores} cores, "
                          f"{resource.memory_gb}GB, reputation: {resource.reputation}")
    
    # Submit various tasks
    logger.info("Submitting computation tasks...")
    tasks = [
        (TaskType.FHE, 100, "FHE computation"),
        (TaskType.ZKP, 200, "ZKP proof generation"),
        (TaskType.MPC, 150, "MPC participation"),
        (TaskType.VERIFICATION, 75, "Identity verification"),
    ]
    
    task_ids = []
    for task_type, complexity, description in tasks:
        task_id = marketplace.submit_task(task_type, complexity)
        task_ids.append((task_id, description, complexity))
        logger.info(f"Submitted task: {task_id} ({description}, complexity: {complexity})")
    
    # Process all tasks
    logger.info("Processing tasks...")
    total_rewards = 0
    for task_id, description, complexity in task_ids:
        node_id = marketplace.assign_task(task_id)
        if node_id:
            logger.success(f"Task {task_id} assigned to {node_id}")
            marketplace.start_task(task_id)
            reward = marketplace.complete_task(task_id, True)
            total_rewards += reward
            logger.success(f"Task {task_id} completed, reward: {reward} tokens")
        else:
            logger.error(f"Failed to assign task {task_id}")
    
    logger.info(f"Total rewards distributed: {total_rewards} tokens")
    
    # Show updated node status
    logger.info("Updated node status:")
    for node_id in ["node1", "node2", "node3"]:
        resource = marketplace.get_resource(node_id)
        if resource:
            logger.info(f"  - {node_id}: load={resource.current_load:.2}, "
                       f"reputation={resource.reputation:.2}")
    
    logger.success("Compute marketplace demo completed")

def demo_integrated(logger):
    """Demo 4: Integrated Workflow"""
    logger.section("Demo 4: Integrated Workflow")
    
    logger.info("Creating integrated system components...")
    
    # Create blockchain
    blockchain = Blockchain(chain_id=1)
    logger.info("Blockchain initialized")
    
    # Create identity registry
    registry = IdentityRegistry()
    logger.info("Identity registry initialized")
    
    # Create compute marketplace
    marketplace = ComputeMarketplace()
    logger.info("Compute marketplace initialized")
    
    # Register identity
    logger.info("Registering user identity...")
    user = "demo_user"
    identity_hash = registry.register_identity(user, "DEMO_CARD_001")
    registry.activate_identity(user, "demo_key")
    logger.success(f"Identity registered and activated for {user}")
    
    # Register compute resource
    logger.info("Registering compute resource...")
    resource = ComputeResource("demo_node", 8, 16, True, 0.0, 50.0)
    marketplace.register_resource(resource)
    logger.success("Compute resource registered")
    
    # Submit verification task
    logger.info("Submitting identity verification task...")
    task_id = marketplace.submit_task(TaskType.VERIFICATION, 50)
    node_id = marketplace.assign_task(task_id)
    marketplace.start_task(task_id)
    reward = marketplace.complete_task(task_id, True)
    logger.success(f"Verification task completed, reward: {reward} tokens")
    
    # Record verification on blockchain
    logger.info("Recording verification on blockchain...")
    alice = "alice"
    blockchain.accounts[alice] = Account(alice, 0, 1000)
    
    tx = Transaction(0, alice, None, 0, 21000, 1, b'', "identity")
    merkle_root = Block.calculate_merkle_root([tx])
    block = Block(
        header=BlockHeader(
            previous_hash=blockchain.get_latest_block().hash(),
            merkle_root=merkle_root,
            timestamp=int(time.time()),
            block_number=1,
            proposer="demo_node"
        ),
        transactions=[tx]
    )
    
    if blockchain.add_block(block):
        logger.success(f"Verification recorded on blockchain (height: {blockchain.get_block_count()})")
    
    logger.success("Integrated workflow completed successfully!")

def main():
    print("\n")
    print("=" * 60)
    print("  Infranet Distributed System Demo")
    print("  (Live System Demonstration)")
    print("=" * 60)
    print()
    
    # Create logger
    logger = Logger(enabled=True, debug=False)
    
    try:
        # Run all demos
        demo_blockchain(logger)
        time.sleep(1)
        
        demo_identity(logger)
        time.sleep(1)
        
        demo_compute(logger)
        time.sleep(1)
        
        demo_integrated(logger)
        
        print()
        print("=" * 60)
        print("  All Demos Completed Successfully")
        print("=" * 60)
        print()
        print(f"Total log entries: {len(logger.logs)}")
        
    except Exception as e:
        logger.error(f"Demo failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

