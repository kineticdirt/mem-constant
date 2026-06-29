use crate::blockchain::Blockchain;
use crate::identity::IdentityRegistry;
use crate::compute::ComputeMarketplace;
use crate::node::Node;
use crate::types::*;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Logger {
    enabled: bool,
}

impl Logger {
    pub fn new(enabled: bool) -> Self {
        Logger { enabled }
    }

    pub fn info(&self, message: &str) {
        if self.enabled {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            println!("[{}] [INFO] {}", timestamp, message);
        }
    }

    pub fn success(&self, message: &str) {
        if self.enabled {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            println!("[{}] [SUCCESS] {}", timestamp, message);
        }
    }

    pub fn error(&self, message: &str) {
        if self.enabled {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            eprintln!("[{}] [ERROR] {}", timestamp, message);
        }
    }

    pub fn debug(&self, message: &str) {
        if self.enabled {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            println!("[{}] [DEBUG] {}", timestamp, message);
        }
    }
}

pub fn run_demo() {
    let logger = Logger::new(true);
    
    logger.info("Starting Infranet Demo");
    logger.info("=".repeat(50).as_str());
    
    // Demo 1: Blockchain Operations
    logger.info("Demo 1: Blockchain Operations");
    demo_blockchain(&logger);
    
    // Demo 2: Identity Management
    logger.info("Demo 2: Identity Management");
    demo_identity(&logger);
    
    // Demo 3: Compute Marketplace
    logger.info("Demo 3: Compute Marketplace");
    demo_compute(&logger);
    
    // Demo 4: Integrated Workflow
    logger.info("Demo 4: Integrated Workflow");
    demo_integrated(&logger);
    
    logger.success("All demos completed successfully!");
}

fn demo_blockchain(logger: &Logger) {
    logger.info("Creating new blockchain...");
    let mut blockchain = Blockchain::new(1);
    logger.success(&format!("Blockchain created with chain_id: {}", blockchain.chain_id));
    
    // Create accounts
    logger.info("Creating accounts...");
    let alice = "alice".to_string();
    let bob = "bob".to_string();
    
    blockchain.accounts.insert(alice.clone(), Account {
        address: alice.clone(),
        nonce: 0,
        balance: 100000,
        code_hash: None,
    });
    
    blockchain.accounts.insert(bob.clone(), Account {
        address: bob.clone(),
        nonce: 0,
        balance: 50000,
        code_hash: None,
    });
    
    logger.success(&format!("Created accounts: {} (balance: 100000), {} (balance: 50000)", alice, bob));
    
    // Create and process transaction
    logger.info("Creating transaction: Alice -> Bob (500 tokens)");
    let tx = Transaction {
        nonce: 0,
        from: alice.clone(),
        to: Some(bob.clone()),
        value: 500,
        gas_limit: 21000,
        gas_price: 1,
        payload: Vec::new(),
        transaction_type: TransactionType::Standard,
    };
    
    let block = Block {
        header: BlockHeader {
            previous_hash: blockchain.get_latest_block().unwrap().hash(),
            merkle_root: Block::calculate_merkle_root(&[tx.clone()]),
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            block_number: 1,
            proposer: "node1".to_string(),
        },
        transactions: vec![tx],
    };
    
    match blockchain.add_block(block) {
        Ok(_) => {
            logger.success("Block added successfully");
            let alice_balance = blockchain.get_account(&alice).unwrap().balance;
            let bob_balance = blockchain.get_account(&bob).unwrap().balance;
            logger.info(&format!("Alice balance: {}", alice_balance));
            logger.info(&format!("Bob balance: {}", bob_balance));
        }
        Err(e) => logger.error(&format!("Failed to add block: {}", e)),
    }
    
    logger.info(&format!("Blockchain height: {}", blockchain.get_block_count()));
}

fn demo_identity(logger: &Logger) {
    logger.info("Creating identity registry...");
    let mut registry = IdentityRegistry::new();
    
    // Register identities
    logger.info("Registering identities...");
    let user1 = "user1".to_string();
    let user2 = "user2".to_string();
    
    match registry.register_identity(user1.clone(), "CARD123456".to_string()) {
        Ok(hash) => {
            logger.success(&format!("Registered identity for {}: {:?}", user1, hex::encode(hash)));
        }
        Err(e) => logger.error(&format!("Failed to register identity: {}", e)),
    }
    
    match registry.register_identity(user2.clone(), "CARD789012".to_string()) {
        Ok(hash) => {
            logger.success(&format!("Registered identity for {}: {:?}", user2, hex::encode(hash)));
        }
        Err(e) => logger.error(&format!("Failed to register identity: {}", e)),
    }
    
    // Activate identities
    logger.info("Activating identities...");
    match registry.activate_identity(&user1, "activation_key_123") {
        Ok(_) => logger.success(&format!("Activated identity for {}", user1)),
        Err(e) => logger.error(&format!("Failed to activate identity: {}", e)),
    }
    
    // Verify identity
    logger.info("Verifying identity...");
    if let Some(identity) = registry.get_identity(&user1) {
        let proof = identity.identity_hash.to_vec();
        match registry.verify_identity(&user1, &proof) {
            Ok(verified) => {
                if verified {
                    logger.success(&format!("Identity verified for {}", user1));
                } else {
                    logger.error(&format!("Identity verification failed for {}", user1));
                }
            }
            Err(e) => logger.error(&format!("Verification error: {}", e)),
        }
    }
}

fn demo_compute(logger: &Logger) {
    logger.info("Creating compute marketplace...");
    let mut marketplace = ComputeMarketplace::new();
    
    // Register compute resources
    logger.info("Registering compute resources...");
    let resource1 = ComputeResource {
        node_id: "node1".to_string(),
        cpu_cores: 8,
        memory_gb: 16,
        available: true,
        current_load: 0.0,
        reputation: 75.0,
    };
    
    let resource2 = ComputeResource {
        node_id: "node2".to_string(),
        cpu_cores: 16,
        memory_gb: 32,
        available: true,
        current_load: 0.2,
        reputation: 85.0,
    };
    
    match marketplace.register_resource(resource1) {
        Ok(_) => logger.success("Registered node1 (8 cores, 16GB, reputation: 75.0)"),
        Err(e) => logger.error(&format!("Failed to register resource: {}", e)),
    }
    
    match marketplace.register_resource(resource2) {
        Ok(_) => logger.success("Registered node2 (16 cores, 32GB, reputation: 85.0)"),
        Err(e) => logger.error(&format!("Failed to register resource: {}", e)),
    }
    
    // Submit tasks
    logger.info("Submitting computation tasks...");
    let task1_id = marketplace.submit_task(TaskType::FHE, 100);
    logger.info(&format!("Submitted FHE task: {}", task1_id));
    
    let task2_id = marketplace.submit_task(TaskType::ZKP, 200);
    logger.info(&format!("Submitted ZKP task: {}", task2_id));
    
    // Assign and process tasks
    logger.info("Assigning tasks to nodes...");
    match marketplace.assign_task(&task1_id) {
        Ok(node_id) => {
            logger.success(&format!("Task {} assigned to {}", task1_id, node_id));
            marketplace.start_task(&task1_id).unwrap();
            let reward = marketplace.complete_task(&task1_id, true).unwrap();
            logger.success(&format!("Task {} completed, reward: {} tokens", task1_id, reward));
        }
        Err(e) => logger.error(&format!("Failed to assign task: {}", e)),
    }
    
    match marketplace.assign_task(&task2_id) {
        Ok(node_id) => {
            logger.success(&format!("Task {} assigned to {}", task2_id, node_id));
            marketplace.start_task(&task2_id).unwrap();
            let reward = marketplace.complete_task(&task2_id, true).unwrap();
            logger.success(&format!("Task {} completed, reward: {} tokens", task2_id, reward));
        }
        Err(e) => logger.error(&format!("Failed to assign task: {}", e)),
    }
    
    // Check updated reputation
    if let Some(resource) = marketplace.get_resource(&"node1".to_string()) {
        logger.info(&format!("Node1 updated reputation: {:.2}", resource.reputation));
    }
}

fn demo_integrated(logger: &Logger) {
    logger.info("Creating integrated node...");
    let node = Node::new("demo_node".to_string(), "0x1234".to_string(), 1);
    logger.success("Node created");
    
    // Register identity
    logger.info("Registering identity through node...");
    let mut registry = node.identity_registry.write().unwrap();
    let address = "demo_user".to_string();
    match registry.register_identity(address.clone(), "DEMO_CARD_001".to_string()) {
        Ok(hash) => {
            logger.success(&format!("Identity registered: {:?}", hex::encode(hash)));
            registry.activate_identity(&address, "demo_key").unwrap();
            logger.success("Identity activated");
        }
        Err(e) => logger.error(&format!("Failed to register identity: {}", e)),
    }
    drop(registry);
    
    // Register compute resource
    logger.info("Registering compute resource...");
    let mut marketplace = node.compute_marketplace.write().unwrap();
    let resource = ComputeResource {
        node_id: "demo_node".to_string(),
        cpu_cores: 8,
        memory_gb: 16,
        available: true,
        current_load: 0.0,
        reputation: 50.0,
    };
    marketplace.register_resource(resource).unwrap();
    logger.success("Compute resource registered");
    
    // Submit verification task
    logger.info("Submitting verification task...");
    let task_id = marketplace.submit_task(TaskType::Verification, 50);
    marketplace.assign_task(&task_id).unwrap();
    marketplace.start_task(&task_id).unwrap();
    let reward = marketplace.complete_task(&task_id, true).unwrap();
    logger.success(&format!("Verification task completed, reward: {} tokens", reward));
    drop(marketplace);
    
    // Add block to blockchain
    logger.info("Adding identity transaction to blockchain...");
    let mut blockchain = node.blockchain.write().unwrap();
    let alice = "alice".to_string();
    blockchain.accounts.insert(alice.clone(), Account {
        address: alice.clone(),
        nonce: 0,
        balance: 1000,
        code_hash: None,
    });
    
    let tx = Transaction {
        nonce: 0,
        from: alice.clone(),
        to: None,
        value: 0,
        gas_limit: 21000,
        gas_price: 1,
        payload: Vec::new(),
        transaction_type: TransactionType::Identity,
    };
    
    let block = Block {
        header: BlockHeader {
            previous_hash: blockchain.get_latest_block().unwrap().hash(),
            merkle_root: Block::calculate_merkle_root(&[tx]),
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            block_number: 1,
            proposer: node.address.clone(),
        },
        transactions: vec![tx],
    };
    
    match blockchain.add_block(block) {
        Ok(_) => {
            logger.success(&format!("Block added, blockchain height: {}", blockchain.get_block_count()));
        }
        Err(e) => logger.error(&format!("Failed to add block: {}", e)),
    }
    
    logger.success("Integrated workflow completed successfully!");
}




