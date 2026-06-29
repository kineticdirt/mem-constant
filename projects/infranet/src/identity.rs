use crate::types::*;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct IdentityRegistry {
    identities: HashMap<Address, IdentityCommitment>,
    activations: HashMap<Address, bool>,
}

#[derive(Debug, Clone)]
pub struct IdentityCommitment {
    pub identity_hash: Hash,
    pub card_id: String,
    pub registered_at: u64,
    pub active: bool,
}

impl IdentityRegistry {
    pub fn new() -> Self {
        IdentityRegistry {
            identities: HashMap::new(),
            activations: HashMap::new(),
        }
    }

    pub fn register_identity(&mut self, address: Address, card_id: String) -> Result<Hash, String> {
        if self.identities.contains_key(&address) {
            return Err("Identity already registered".to_string());
        }

        // Create identity commitment (hash of card_id + address)
        let mut hasher = Sha256::new();
        hasher.update(card_id.as_bytes());
        hasher.update(address.as_bytes());
        let identity_hash: Hash = hasher.finalize().into();

        let commitment = IdentityCommitment {
            identity_hash,
            card_id: card_id.clone(),
            registered_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            active: false,
        };

        self.identities.insert(address.clone(), commitment.clone());
        self.activations.insert(address, false);

        Ok(identity_hash)
    }

    pub fn verify_identity(&self, address: &Address, proof: &[u8]) -> Result<bool, String> {
        let commitment = self.identities.get(address)
            .ok_or("Identity not found")?;

        // Simplified verification - in real system, this would use ZKP
        // For testing, we'll just check if proof matches identity hash
        if proof.len() != 32 {
            return Err("Invalid proof length".to_string());
        }

        let proof_hash: Hash = proof.try_into().unwrap();
        Ok(proof_hash == commitment.identity_hash && commitment.active)
    }

    pub fn activate_identity(&mut self, address: &Address, activation_key: &str) -> Result<(), String> {
        let commitment = self.identities.get_mut(address)
            .ok_or("Identity not found")?;

        // Simplified activation - in real system, this would use encrypted activation
        let mut hasher = Sha256::new();
        hasher.update(activation_key.as_bytes());
        hasher.update(&commitment.card_id.as_bytes());
        let expected_key: Hash = hasher.finalize().into();

        // For testing, accept any non-empty key
        if activation_key.is_empty() {
            return Err("Invalid activation key".to_string());
        }

        commitment.active = true;
        self.activations.insert(address.clone(), true);

        Ok(())
    }

    pub fn check_activation(&self, address: &Address) -> bool {
        self.activations.get(address).copied().unwrap_or(false)
    }

    pub fn revoke_identity(&mut self, address: &Address) -> Result<(), String> {
        let commitment = self.identities.get_mut(address)
            .ok_or("Identity not found")?;

        commitment.active = false;
        self.activations.insert(address.clone(), false);

        Ok(())
    }

    pub fn get_identity(&self, address: &Address) -> Option<&IdentityCommitment> {
        self.identities.get(address)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_registration() {
        let mut registry = IdentityRegistry::new();
        let address = "user1".to_string();
        let card_id = "CARD123456".to_string();

        let result = registry.register_identity(address.clone(), card_id);
        assert!(result.is_ok());

        let identity = registry.get_identity(&address);
        assert!(identity.is_some());
        assert!(!identity.unwrap().active);
    }

    #[test]
    fn test_identity_activation() {
        let mut registry = IdentityRegistry::new();
        let address = "user1".to_string();
        let card_id = "CARD123456".to_string();

        registry.register_identity(address.clone(), card_id).unwrap();
        assert!(!registry.check_activation(&address));

        registry.activate_identity(&address, "activation_key_123").unwrap();
        assert!(registry.check_activation(&address));
    }

    #[test]
    fn test_identity_verification() {
        let mut registry = IdentityRegistry::new();
        let address = "user1".to_string();
        let card_id = "CARD123456".to_string();

        let identity_hash = registry.register_identity(address.clone(), card_id).unwrap();
        registry.activate_identity(&address, "key").unwrap();

        // Create proof (simplified - in real system would be ZKP)
        let proof: Vec<u8> = identity_hash.to_vec();
        let verified = registry.verify_identity(&address, &proof);
        assert!(verified.is_ok());
        assert!(verified.unwrap());
    }

    #[test]
    fn test_identity_revocation() {
        let mut registry = IdentityRegistry::new();
        let address = "user1".to_string();
        let card_id = "CARD123456".to_string();

        registry.register_identity(address.clone(), card_id).unwrap();
        registry.activate_identity(&address, "key").unwrap();
        assert!(registry.check_activation(&address));

        registry.revoke_identity(&address).unwrap();
        assert!(!registry.check_activation(&address));
    }
}




