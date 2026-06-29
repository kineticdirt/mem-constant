#!/usr/bin/env python3
"""
Interactive Infranet Demo
Allows user to interact with the system in real-time
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "tests"))

from tests.test_blockchain import Blockchain, Block, BlockHeader, Transaction, Account
from tests.test_identity import IdentityRegistry
from tests.test_compute import ComputeMarketplace, ComputeResource, TaskType

class Logger:
    def __init__(self, enabled=True):
        self.enabled = enabled
    
    def info(self, message):
        if self.enabled:
            timestamp = int(time.time())
            print(f"[{timestamp}] [INFO] {message}")
    
    def success(self, message):
        if self.enabled:
            timestamp = int(time.time())
            print(f"[{timestamp}] [SUCCESS] {message}")
    
    def error(self, message):
        if self.enabled:
            timestamp = int(time.time())
            print(f"[{timestamp}] [ERROR] {message}")

def print_menu():
    print("\n" + "="*60)
    print("  Infranet Interactive Demo")
    print("="*60)
    print("\n1. Blockchain Operations")
    print("2. Identity Management")
    print("3. Compute Marketplace")
    print("4. View System Status")
    print("5. Run Full Demo")
    print("0. Exit")
    print("\n" + "-"*60)

def blockchain_menu(logger, blockchain):
    while True:
        print("\n--- Blockchain Operations ---")
        print("1. Create account")
        print("2. Send transaction")
        print("3. View account balance")
        print("4. View blockchain height")
        print("5. View all accounts")
        print("0. Back")
        
        choice = input("\nChoice: ").strip()
        
        if choice == "1":
            address = input("Account address: ").strip()
            balance = int(input("Initial balance: ").strip() or "0")
            blockchain.accounts[address] = Account(address, 0, balance)
            logger.success(f"Created account {address} with balance {balance}")
        
        elif choice == "2":
            from_addr = input("From address: ").strip()
            to_addr = input("To address: ").strip()
            value = int(input("Amount: ").strip())
            
            if from_addr not in blockchain.accounts:
                logger.error("Sender account not found")
                continue
            
            sender = blockchain.accounts[from_addr]
            tx = Transaction(sender.nonce, from_addr, to_addr, value, 21000, 1, b'', "standard")
            
            merkle_root = Block.calculate_merkle_root([tx])
            block = Block(
                header=BlockHeader(
                    previous_hash=blockchain.get_latest_block().hash(),
                    merkle_root=merkle_root,
                    timestamp=int(time.time()),
                    block_number=blockchain.get_block_count(),
                    proposer="user"
                ),
                transactions=[tx]
            )
            
            if blockchain.add_block(block):
                logger.success(f"Transaction processed: {from_addr} -> {to_addr} ({value} tokens)")
            else:
                logger.error("Transaction failed")
        
        elif choice == "3":
            address = input("Account address: ").strip()
            account = blockchain.get_account(address)
            if account:
                logger.info(f"Balance: {account.balance} tokens")
            else:
                logger.error("Account not found")
        
        elif choice == "4":
            logger.info(f"Blockchain height: {blockchain.get_block_count()}")
        
        elif choice == "5":
            logger.info("All accounts:")
            for addr, account in blockchain.accounts.items():
                print(f"  {addr}: {account.balance} tokens")
        
        elif choice == "0":
            break

def identity_menu(logger, registry):
    while True:
        print("\n--- Identity Management ---")
        print("1. Register identity")
        print("2. Activate identity")
        print("3. Verify identity")
        print("4. Revoke identity")
        print("5. Check activation status")
        print("0. Back")
        
        choice = input("\nChoice: ").strip()
        
        if choice == "1":
            address = input("User address: ").strip()
            card_id = input("Card ID: ").strip()
            try:
                identity_hash = registry.register_identity(address, card_id)
                logger.success(f"Identity registered: {identity_hash.hex()[:16]}...")
            except Exception as e:
                logger.error(str(e))
        
        elif choice == "2":
            address = input("User address: ").strip()
            key = input("Activation key: ").strip()
            if registry.activate_identity(address, key):
                logger.success("Identity activated")
            else:
                logger.error("Activation failed")
        
        elif choice == "3":
            address = input("User address: ").strip()
            identity = registry.get_identity(address)
            if identity:
                proof = identity.identity_hash
                if registry.verify_identity(address, proof):
                    logger.success("Identity verified")
                else:
                    logger.error("Verification failed")
            else:
                logger.error("Identity not found")
        
        elif choice == "4":
            address = input("User address: ").strip()
            if registry.revoke_identity(address):
                logger.success("Identity revoked")
            else:
                logger.error("Revocation failed")
        
        elif choice == "5":
            address = input("User address: ").strip()
            status = registry.check_activation(address)
            logger.info(f"Activation status: {'Active' if status else 'Inactive'}")
        
        elif choice == "0":
            break

def compute_menu(logger, marketplace):
    while True:
        print("\n--- Compute Marketplace ---")
        print("1. Register compute resource")
        print("2. Submit task")
        print("3. View tasks")
        print("4. View resources")
        print("0. Back")
        
        choice = input("\nChoice: ").strip()
        
        if choice == "1":
            node_id = input("Node ID: ").strip()
            cores = int(input("CPU cores: ").strip() or "8")
            memory = int(input("Memory (GB): ").strip() or "16")
            reputation = float(input("Reputation (0-100): ").strip() or "50.0")
            
            resource = ComputeResource(node_id, cores, memory, True, 0.0, reputation)
            if marketplace.register_resource(resource):
                logger.success(f"Resource {node_id} registered")
            else:
                logger.error("Registration failed")
        
        elif choice == "2":
            print("Task types: FHE, MPC, ZKP, VERIFICATION")
            task_type_str = input("Task type: ").strip().upper()
            try:
                task_type = TaskType[task_type_str]
            except KeyError:
                logger.error("Invalid task type")
                continue
            
            complexity = int(input("Complexity: ").strip() or "100")
            task_id = marketplace.submit_task(task_type, complexity)
            logger.success(f"Task submitted: {task_id}")
            
            # Auto-assign and complete
            node_id = marketplace.assign_task(task_id)
            if node_id:
                logger.info(f"Task assigned to {node_id}")
                marketplace.start_task(task_id)
                reward = marketplace.complete_task(task_id, True)
                logger.success(f"Task completed, reward: {reward} tokens")
            else:
                logger.error("No available nodes")
        
        elif choice == "3":
            # Show recent tasks (simplified)
            logger.info("Tasks are managed internally")
        
        elif choice == "4":
            logger.info("Registered resources:")
            for node_id in ["node1", "node2", "node3"]:
                resource = marketplace.get_resource(node_id)
                if resource:
                    print(f"  {node_id}: {resource.cpu_cores} cores, "
                          f"{resource.memory_gb}GB, reputation: {resource.reputation:.1f}")
        
        elif choice == "0":
            break

def main():
    logger = Logger()
    
    # Initialize systems
    blockchain = Blockchain(chain_id=1)
    registry = IdentityRegistry()
    marketplace = ComputeMarketplace()
    
    # Pre-register some resources
    marketplace.register_resource(ComputeResource("node1", 8, 16, True, 0.0, 75.0))
    marketplace.register_resource(ComputeResource("node2", 16, 32, True, 0.2, 85.0))
    
    logger.info("Systems initialized")
    
    while True:
        print_menu()
        choice = input("\nSelect option: ").strip()
        
        if choice == "1":
            blockchain_menu(logger, blockchain)
        elif choice == "2":
            identity_menu(logger, registry)
        elif choice == "3":
            compute_menu(logger, marketplace)
        elif choice == "4":
            print("\n--- System Status ---")
            print(f"Blockchain height: {blockchain.get_block_count()}")
            print(f"Accounts: {len(blockchain.accounts)}")
            print(f"Identities: {len(registry.identities)}")
            print(f"Compute resources: {len(marketplace.resources)}")
        elif choice == "5":
            print("\nRunning full automated demo...")
            import demo
            demo.main()
        elif choice == "0":
            logger.info("Exiting...")
            break
        else:
            logger.error("Invalid choice")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nExiting...")
        sys.exit(0)




