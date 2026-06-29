use crate::blockchain::Blockchain;
use crate::identity::IdentityRegistry;
use crate::compute::ComputeMarketplace;
use crate::types::*;
use std::sync::{Arc, RwLock};

#[derive(Debug, Clone)]
pub struct Node {
    pub node_id: NodeId,
    pub address: Address,
    pub blockchain: Arc<RwLock<Blockchain>>,
    pub identity_registry: Arc<RwLock<IdentityRegistry>>,
    pub compute_marketplace: Arc<RwLock<ComputeMarketplace>>,
    pub is_consensus_node: bool,
    pub stake: TokenAmount,
}

impl Node {
    pub fn new(node_id: NodeId, address: Address, chain_id: u64) -> Self {
        Node {
            node_id: node_id.clone(),
            address,
            blockchain: Arc::new(RwLock::new(Blockchain::new(chain_id))),
            identity_registry: Arc::new(RwLock::new(IdentityRegistry::new())),
            compute_marketplace: Arc::new(RwLock::new(ComputeMarketplace::new())),
            is_consensus_node: false,
            stake: 0,
        }
    }

    pub fn become_consensus_node(&mut self, stake: TokenAmount) {
        self.is_consensus_node = true;
        self.stake = stake;
    }

    pub fn propose_block(&self, transactions: Vec<Transaction>) -> Result<Block, String> {
        let blockchain = self.blockchain.read().unwrap();
        let latest = blockchain.get_latest_block()
            .ok_or("No blocks in chain")?;

        let block = Block {
            header: BlockHeader {
                previous_hash: latest.hash(),
                merkle_root: Block::calculate_merkle_root(&transactions),
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
                block_number: latest.header.block_number + 1,
                proposer: self.address.clone(),
            },
            transactions,
        };

        Ok(block)
    }

    pub fn add_block(&self, block: Block) -> Result<(), String> {
        let mut blockchain = self.blockchain.write().unwrap();
        blockchain.add_block(block)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_creation() {
        let node = Node::new("node1".to_string(), "0x123".to_string(), 1);
        assert_eq!(node.node_id, "node1");
        assert_eq!(node.address, "0x123");
        assert!(!node.is_consensus_node);
    }

    #[test]
    fn test_consensus_node() {
        let mut node = Node::new("node1".to_string(), "0x123".to_string(), 1);
        node.become_consensus_node(1000);
        assert!(node.is_consensus_node);
        assert_eq!(node.stake, 1000);
    }

    #[test]
    fn test_block_proposal() {
        let node = Node::new("node1".to_string(), "0x123".to_string(), 1);
        
        let tx = Transaction {
            nonce: 0,
            from: "alice".to_string(),
            to: Some("bob".to_string()),
            value: 100,
            gas_limit: 21000,
            gas_price: 1,
            payload: Vec::new(),
            transaction_type: TransactionType::Standard,
        };

        let block = node.propose_block(vec![tx]).unwrap();
        assert_eq!(block.header.block_number, 1);
        assert_eq!(block.header.proposer, "0x123");
    }
}




