#!/usr/bin/env python3
"""
Infranet Identity Registry Tests
"""
import hashlib
from typing import Dict, Optional

class IdentityCommitment:
    def __init__(self, identity_hash: bytes, card_id: str, registered_at: int):
        self.identity_hash = identity_hash
        self.card_id = card_id
        self.registered_at = registered_at
        self.active = False

class IdentityRegistry:
    def __init__(self):
        self.identities: Dict[str, IdentityCommitment] = {}
        self.activations: Dict[str, bool] = {}
    
    def register_identity(self, address: str, card_id: str) -> bytes:
        if address in self.identities:
            raise ValueError("Identity already registered")
        
        # Create identity commitment
        hasher = hashlib.sha256()
        hasher.update(card_id.encode())
        hasher.update(address.encode())
        identity_hash = hasher.digest()
        
        commitment = IdentityCommitment(
            identity_hash=identity_hash,
            card_id=card_id,
            registered_at=0  # Simplified
        )
        
        self.identities[address] = commitment
        self.activations[address] = False
        
        return identity_hash
    
    def verify_identity(self, address: str, proof: bytes) -> bool:
        if address not in self.identities:
            return False
        
        commitment = self.identities[address]
        
        if len(proof) != 32:
            return False
        
        # Simplified verification
        return proof == commitment.identity_hash and commitment.active
    
    def activate_identity(self, address: str, activation_key: str) -> bool:
        if address not in self.identities:
            return False
        
        if not activation_key:
            return False
        
        commitment = self.identities[address]
        commitment.active = True
        self.activations[address] = True
        
        return True
    
    def check_activation(self, address: str) -> bool:
        return self.activations.get(address, False)
    
    def revoke_identity(self, address: str) -> bool:
        if address not in self.identities:
            return False
        
        commitment = self.identities[address]
        commitment.active = False
        self.activations[address] = False
        
        return True
    
    def get_identity(self, address: str) -> Optional[IdentityCommitment]:
        return self.identities.get(address)

def test_identity_registration():
    """Test identity registration"""
    registry = IdentityRegistry()
    address = "user1"
    card_id = "CARD123456"
    
    identity_hash = registry.register_identity(address, card_id)
    assert identity_hash is not None
    
    identity = registry.get_identity(address)
    assert identity is not None
    assert not identity.active
    
    print("[OK] Identity registration test passed")

def test_identity_activation():
    """Test identity activation"""
    registry = IdentityRegistry()
    address = "user1"
    card_id = "CARD123456"
    
    registry.register_identity(address, card_id)
    assert not registry.check_activation(address)
    
    registry.activate_identity(address, "activation_key_123")
    assert registry.check_activation(address)
    
    print("[OK] Identity activation test passed")

def test_identity_verification():
    """Test identity verification"""
    registry = IdentityRegistry()
    address = "user1"
    card_id = "CARD123456"
    
    identity_hash = registry.register_identity(address, card_id)
    registry.activate_identity(address, "key")
    
    proof = identity_hash
    verified = registry.verify_identity(address, proof)
    assert verified == True
    
    print("[OK] Identity verification test passed")

def test_identity_revocation():
    """Test identity revocation"""
    registry = IdentityRegistry()
    address = "user1"
    card_id = "CARD123456"
    
    registry.register_identity(address, card_id)
    registry.activate_identity(address, "key")
    assert registry.check_activation(address)
    
    registry.revoke_identity(address)
    assert not registry.check_activation(address)
    
    print("[OK] Identity revocation test passed")

if __name__ == "__main__":
    print("Testing Identity Registry...")
    test_identity_registration()
    test_identity_activation()
    test_identity_verification()
    test_identity_revocation()
    print("All identity tests passed!\n")

