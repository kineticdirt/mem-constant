use crate::types::*;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

#[derive(Debug, Clone)]
pub struct Blockchain {
    pub blocks: Vec<Block>,
    pub accounts: HashMap<Address, Account>,
    pub chain_id: u64,
}

impl Blockchain {
    pub fn new(chain_id: u64) -> Self {
        let mut blockchain = Blockchain {
            blocks: Vec::new(),
            accounts: HashMap::new(),
            chain_id,
        };
        
        // Create genesis block
        let genesis = blockchain.create_genesis_block();
        blockchain.blocks.push(genesis);
        
        blockchain
    }

    fn create_genesis_block(&self) -> Block {
        Block {
            header: BlockHeader {
                previous_hash: [0u8; 32],
                merkle_root: [0u8; 32],
                timestamp: 0,
                block_number: 0,
                proposer: "genesis".to_string(),
            },
            transactions: Vec::new(),
        }
    }

    pub fn add_block(&mut self, mut block: Block) -> Result<(), String> {
        // Validate block
        if let Some(last_block) = self.blocks.last() {
            if block.header.previous_hash != last_block.hash() {
                return Err("Invalid previous hash".to_string());
            }
            if block.header.block_number != last_block.header.block_number + 1 {
                return Err("Invalid block number".to_string());
            }
        }

        // Calculate merkle root
        block.header.merkle_root = Block::calculate_merkle_root(&block.transactions);

        // Process transactions
        for tx in &block.transactions {
            self.process_transaction(tx)?;
        }

        self.blocks.push(block);
        Ok(())
    }

    fn process_transaction(&mut self, tx: &Transaction) -> Result<(), String> {
        // Get or create sender account
        let sender = self.accounts
            .entry(tx.from.clone())
            .or_insert_with(|| Account {
                address: tx.from.clone(),
                nonce: 0,
                balance: 0,
                code_hash: None,
            });

        // Check nonce
        if tx.nonce != sender.nonce {
            return Err(format!("Invalid nonce: expected {}, got {}", sender.nonce, tx.nonce));
        }

        // Check balance
        let total_cost = tx.value + (tx.gas_limit as u64 * tx.gas_price);
        if sender.balance < total_cost {
            return Err("Insufficient balance".to_string());
        }

        // Update sender
        sender.nonce += 1;
        sender.balance -= total_cost;

        // Update recipient if exists
        if let Some(to) = &tx.to {
            let recipient = self.accounts
                .entry(to.clone())
                .or_insert_with(|| Account {
                    address: to.clone(),
                    nonce: 0,
                    balance: 0,
                    code_hash: None,
                });
            recipient.balance += tx.value;
        }

        Ok(())
    }

    pub fn get_account(&self, address: &Address) -> Option<&Account> {
        self.accounts.get(address)
    }

    pub fn get_latest_block(&self) -> Option<&Block> {
        self.blocks.last()
    }

    pub fn get_block_count(&self) -> usize {
        self.blocks.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blockchain_creation() {
        let blockchain = Blockchain::new(1);
        assert_eq!(blockchain.get_block_count(), 1);
        assert_eq!(blockchain.chain_id, 1);
    }

    #[test]
    fn test_add_block() {
        let mut blockchain = Blockchain::new(1);
        
        let block = Block {
            header: BlockHeader {
                previous_hash: blockchain.get_latest_block().unwrap().hash(),
                merkle_root: [0u8; 32],
                timestamp: 1000,
                block_number: 1,
                proposer: "node1".to_string(),
            },
            transactions: Vec::new(),
        };

        assert!(blockchain.add_block(block).is_ok());
        assert_eq!(blockchain.get_block_count(), 2);
    }

    #[test]
    fn test_transaction_processing() {
        let mut blockchain = Blockchain::new(1);
        
        // Create accounts
        let alice = "alice".to_string();
        let bob = "bob".to_string();
        
        blockchain.accounts.insert(alice.clone(), Account {
            address: alice.clone(),
            nonce: 0,
            balance: 1000,
            code_hash: None,
        });

        let tx = Transaction {
            nonce: 0,
            from: alice.clone(),
            to: Some(bob.clone()),
            value: 100,
            gas_limit: 21000,
            gas_price: 1,
            payload: Vec::new(),
            transaction_type: TransactionType::Standard,
        };

        let block = Block {
            header: BlockHeader {
                previous_hash: blockchain.get_latest_block().unwrap().hash(),
                merkle_root: [0u8; 32],
                timestamp: 1000,
                block_number: 1,
                proposer: "node1".to_string(),
            },
            transactions: vec![tx],
        };

        assert!(blockchain.add_block(block).is_ok());
        
        let alice_account = blockchain.get_account(&alice).unwrap();
        assert_eq!(alice_account.balance, 1000 - 100 - 21000); // value + gas
        assert_eq!(alice_account.nonce, 1);
        
        let bob_account = blockchain.get_account(&bob).unwrap();
        assert_eq!(bob_account.balance, 100);
    }
}




