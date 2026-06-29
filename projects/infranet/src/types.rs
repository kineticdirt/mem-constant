use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

pub type Address = String;
pub type Hash = [u8; 32];
pub type TokenAmount = u64;
pub type NodeId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub nonce: u64,
    pub from: Address,
    pub to: Option<Address>,
    pub value: TokenAmount,
    pub gas_limit: u64,
    pub gas_price: TokenAmount,
    pub payload: Vec<u8>,
    pub transaction_type: TransactionType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransactionType {
    Standard,
    Identity,
    Storage,
    Verification,
    Compute,
}

impl Transaction {
    pub fn hash(&self) -> Hash {
        let serialized = serde_json::to_vec(self).unwrap();
        let mut hasher = Sha256::new();
        hasher.update(&serialized);
        hasher.finalize().into()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub header: BlockHeader,
    pub transactions: Vec<Transaction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockHeader {
    pub previous_hash: Hash,
    pub merkle_root: Hash,
    pub timestamp: u64,
    pub block_number: u64,
    pub proposer: Address,
}

impl Block {
    pub fn hash(&self) -> Hash {
        let serialized = serde_json::to_vec(&self.header).unwrap();
        let mut hasher = Sha256::new();
        hasher.update(&serialized);
        hasher.finalize().into()
    }

    pub fn calculate_merkle_root(transactions: &[Transaction]) -> Hash {
        if transactions.is_empty() {
            return [0u8; 32];
        }

        let mut hashes: Vec<Hash> = transactions.iter().map(|tx| tx.hash()).collect();
        
        while hashes.len() > 1 {
            let mut next_level = Vec::new();
            for chunk in hashes.chunks(2) {
                let mut hasher = Sha256::new();
                hasher.update(&chunk[0]);
                if chunk.len() > 1 {
                    hasher.update(&chunk[1]);
                } else {
                    hasher.update(&chunk[0]); // Duplicate for odd number
                }
                next_level.push(hasher.finalize().into());
            }
            hashes = next_level;
        }

        hashes[0]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub address: Address,
    pub nonce: u64,
    pub balance: TokenAmount,
    pub code_hash: Option<Hash>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeResource {
    pub node_id: NodeId,
    pub cpu_cores: u32,
    pub memory_gb: u64,
    pub available: bool,
    pub current_load: f64,
    pub reputation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub task_id: String,
    pub task_type: TaskType,
    pub complexity: u64,
    pub assigned_node: Option<NodeId>,
    pub status: TaskStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    FHE,
    MPC,
    ZKP,
    Verification,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    Assigned,
    InProgress,
    Completed,
    Failed,
}




