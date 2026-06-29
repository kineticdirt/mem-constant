#!/usr/bin/env python3
"""
Infranet Blockchain Tests
"""
import hashlib
import json
import time
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict

@dataclass
class Transaction:
    nonce: int
    from_addr: str
    to_addr: Optional[str]
    value: int
    gas_limit: int
    gas_price: int
    payload: bytes
    tx_type: str

    def hash(self) -> bytes:
        data = json.dumps({
            'nonce': self.nonce,
            'from': self.from_addr,
            'to': self.to_addr,
            'value': self.value,
            'gas_limit': self.gas_limit,
            'gas_price': self.gas_price,
            'type': self.tx_type
        }, sort_keys=True).encode()
        return hashlib.sha256(data).digest()

@dataclass
class BlockHeader:
    previous_hash: bytes
    merkle_root: bytes
    timestamp: int
    block_number: int
    proposer: str

    def hash(self) -> bytes:
        # Convert bytes to hex for JSON serialization
        data_dict = {
            'previous_hash': self.previous_hash.hex(),
            'merkle_root': self.merkle_root.hex(),
            'timestamp': self.timestamp,
            'block_number': self.block_number,
            'proposer': self.proposer
        }
        data = json.dumps(data_dict, sort_keys=True).encode()
        return hashlib.sha256(data).digest()

@dataclass
class Block:
    header: BlockHeader
    transactions: List[Transaction]

    def hash(self) -> bytes:
        return self.header.hash()

    @staticmethod
    def calculate_merkle_root(transactions: List[Transaction]) -> bytes:
        if not transactions:
            return b'\x00' * 32
        
        hashes = [tx.hash() for tx in transactions]
        
        while len(hashes) > 1:
            next_level = []
            for i in range(0, len(hashes), 2):
                if i + 1 < len(hashes):
                    combined = hashes[i] + hashes[i + 1]
                else:
                    combined = hashes[i] + hashes[i]
                next_level.append(hashlib.sha256(combined).digest())
            hashes = next_level
        
        return hashes[0]

@dataclass
class Account:
    address: str
    nonce: int
    balance: int

class Blockchain:
    def __init__(self, chain_id: int = 1):
        self.chain_id = chain_id
        self.blocks: List[Block] = []
        self.accounts: Dict[str, Account] = {}
        self._create_genesis_block()
    
    def _create_genesis_block(self):
        genesis = Block(
            header=BlockHeader(
                previous_hash=b'\x00' * 32,
                merkle_root=b'\x00' * 32,
                timestamp=0,
                block_number=0,
                proposer="genesis"
            ),
            transactions=[]
        )
        self.blocks.append(genesis)
    
    def add_block(self, block: Block) -> bool:
        # Validate block
        if self.blocks:
            last_block = self.blocks[-1]
            if block.header.previous_hash != last_block.hash():
                return False
            if block.header.block_number != last_block.header.block_number + 1:
                return False
        
        # Calculate merkle root
        block.header.merkle_root = Block.calculate_merkle_root(block.transactions)
        
        # Process transactions
        for tx in block.transactions:
            if not self._process_transaction(tx):
                return False
        
        self.blocks.append(block)
        return True
    
    def _process_transaction(self, tx: Transaction) -> bool:
        # Get or create sender account
        if tx.from_addr not in self.accounts:
            self.accounts[tx.from_addr] = Account(
                address=tx.from_addr,
                nonce=0,
                balance=0
            )
        
        sender = self.accounts[tx.from_addr]
        
        # Check nonce
        if tx.nonce != sender.nonce:
            return False
        
        # Check balance
        total_cost = tx.value + (tx.gas_limit * tx.gas_price)
        if sender.balance < total_cost:
            return False
        
        # Update sender
        sender.nonce += 1
        sender.balance -= total_cost
        
        # Update recipient
        if tx.to_addr:
            if tx.to_addr not in self.accounts:
                self.accounts[tx.to_addr] = Account(
                    address=tx.to_addr,
                    nonce=0,
                    balance=0
                )
            self.accounts[tx.to_addr].balance += tx.value
        
        return True
    
    def get_account(self, address: str) -> Optional[Account]:
        return self.accounts.get(address)
    
    def get_latest_block(self) -> Optional[Block]:
        return self.blocks[-1] if self.blocks else None
    
    def get_block_count(self) -> int:
        return len(self.blocks)

def test_blockchain_creation():
    """Test blockchain initialization"""
    blockchain = Blockchain(chain_id=1)
    assert blockchain.get_block_count() == 1
    assert blockchain.chain_id == 1
    print("[OK] Blockchain creation test passed")

def test_add_block():
    """Test adding blocks"""
    blockchain = Blockchain(chain_id=1)
    
    block = Block(
        header=BlockHeader(
            previous_hash=blockchain.get_latest_block().hash(),
            merkle_root=b'\x00' * 32,
            timestamp=int(time.time()),
            block_number=1,
            proposer="node1"
        ),
        transactions=[]
    )
    
    assert blockchain.add_block(block) == True
    assert blockchain.get_block_count() == 2
    print("[OK] Add block test passed")

def test_transaction_processing():
    """Test transaction processing"""
    blockchain = Blockchain(chain_id=1)
    
    # Create accounts
    alice = "alice"
    bob = "bob"
    
    blockchain.accounts[alice] = Account(
        address=alice,
        nonce=0,
        balance=50000  # Enough for value + gas
    )
    
    tx = Transaction(
        nonce=0,
        from_addr=alice,
        to_addr=bob,
        value=100,
        gas_limit=21000,
        gas_price=1,
        payload=b'',
        tx_type="standard"
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
    
    assert blockchain.add_block(block) == True
    
    alice_account = blockchain.get_account(alice)
    expected_balance = 50000 - 100 - 21000
    assert alice_account.balance == expected_balance, f"Expected {expected_balance}, got {alice_account.balance}"
    
    bob_account = blockchain.get_account(bob)
    assert bob_account.balance == 100
    
    print("[OK] Transaction processing test passed")

if __name__ == "__main__":
    print("Testing Blockchain...")
    test_blockchain_creation()
    test_add_block()
    test_transaction_processing()
    print("All blockchain tests passed!\n")

