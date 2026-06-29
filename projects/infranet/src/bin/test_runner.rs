use infranet::*;
use std::time::Instant;

fn main() {
    println!("🚀 Infranet Test Suite");
    println!("=====================\n");

    let start = Instant::now();

    // Test 1: Blockchain
    println!("📦 Testing Blockchain...");
    test_blockchain();
    println!("✅ Blockchain tests passed\n");

    // Test 2: Identity
    println!("🆔 Testing Identity Registry...");
    test_identity();
    println!("✅ Identity tests passed\n");

    // Test 3: Compute Marketplace
    println!("💻 Testing Compute Marketplace...");
    test_compute();
    println!("✅ Compute Marketplace tests passed\n");

    // Test 4: Node
    println!("🖥️  Testing Node...");
    test_node();
    println!("✅ Node tests passed\n");

    // Test 5: Integration
    println!("🔗 Testing Integration...");
    test_integration();
    println!("✅ Integration tests passed\n");

    let duration = start.elapsed();
    println!("=====================");
    println!("✨ All tests completed in {:.2}ms", duration.as_secs_f64() * 1000.0);
}

fn test_blockchain() {
    let mut blockchain = Blockchain::new(1);
    assert_eq!(blockchain.get_block_count(), 1);

    // Create accounts
    let alice = "alice".to_string();
    let bob = "bob".to_string();
    
    blockchain.accounts.insert(alice.clone(), Account {
        address: alice.clone(),
        nonce: 0,
        balance: 1000,
        code_hash: None,
    });

    // Create transaction
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

    // Create and add block
    let block = Block {
        header: BlockHeader {
            previous_hash: blockchain.get_latest_block().unwrap().hash(),
            merkle_root: Block::calculate_merkle_root(&[tx.clone()]),
            timestamp: 1000,
            block_number: 1,
            proposer: "node1".to_string(),
        },
        transactions: vec![tx],
    };

    blockchain.add_block(block).unwrap();
    assert_eq!(blockchain.get_block_count(), 2);
    
    let alice_account = blockchain.get_account(&alice).unwrap();
    assert_eq!(alice_account.balance, 1000 - 100 - 21000);
    
    let bob_account = blockchain.get_account(&bob).unwrap();
    assert_eq!(bob_account.balance, 100);
    
    println!("   - Created blockchain with genesis block");
    println!("   - Processed transaction: Alice → Bob (100 tokens)");
    println!("   - Verified account balances");
}

fn test_identity() {
    let mut registry = IdentityRegistry::new();
    let address = "user1".to_string();
    let card_id = "CARD123456".to_string();

    // Register identity
    let identity_hash = registry.register_identity(address.clone(), card_id).unwrap();
    println!("   - Registered identity: {}", hex::encode(identity_hash));

    // Activate identity
    registry.activate_identity(&address, "activation_key_123").unwrap();
    assert!(registry.check_activation(&address));
    println!("   - Activated identity");

    // Verify identity
    let proof: Vec<u8> = identity_hash.to_vec();
    let verified = registry.verify_identity(&address, &proof).unwrap();
    assert!(verified);
    println!("   - Verified identity (simplified proof)");

    // Revoke identity
    registry.revoke_identity(&address).unwrap();
    assert!(!registry.check_activation(&address));
    println!("   - Revoked identity");
}

fn test_compute() {
    let mut marketplace = ComputeMarketplace::new();
    
    // Register resources
    let resource1 = ComputeResource {
        node_id: "node1".to_string(),
        cpu_cores: 8,
        memory_gb: 16,
        available: true,
        current_load: 0.0,
        reputation: 50.0,
    };

    let resource2 = ComputeResource {
        node_id: "node2".to_string(),
        cpu_cores: 16,
        memory_gb: 32,
        available: true,
        current_load: 0.2,
        reputation: 75.0,
    };

    marketplace.register_resource(resource1).unwrap();
    marketplace.register_resource(resource2).unwrap();
    println!("   - Registered 2 compute resources");

    // Submit and process task
    let task_id = marketplace.submit_task(TaskType::FHE, 100);
    println!("   - Submitted FHE task: {}", task_id);

    let node_id = marketplace.assign_task(&task_id).unwrap();
    println!("   - Assigned task to: {}", node_id);

    marketplace.start_task(&task_id).unwrap();
    println!("   - Started task execution");

    let reward = marketplace.complete_task(&task_id, true).unwrap();
    println!("   - Completed task, reward: {} tokens", reward);
    assert_eq!(reward, 1000);
}

fn test_node() {
    let mut node = Node::new("node1".to_string(), "0x123".to_string(), 1);
    println!("   - Created node: {}", node.node_id);

    node.become_consensus_node(1000);
    assert!(node.is_consensus_node);
    println!("   - Node became consensus node (stake: 1000)");

    let tx = Transaction {
        nonce: 0,
        from: "alice".to_string(),
        to: Some("bob".to_string()),
        value: 50,
        gas_limit: 21000,
        gas_price: 1,
        payload: Vec::new(),
        transaction_type: TransactionType::Standard,
    };

    let block = node.propose_block(vec![tx]).unwrap();
    assert_eq!(block.header.block_number, 1);
    println!("   - Proposed block #{}", block.header.block_number);
}

fn test_integration() {
    // Create node
    let node = Node::new("node1".to_string(), "0x123".to_string(), 1);
    println!("   - Created integrated node");

    // Register identity
    let mut registry = node.identity_registry.write().unwrap();
    let address = "user1".to_string();
    registry.register_identity(address.clone(), "CARD123".to_string()).unwrap();
    registry.activate_identity(&address, "key").unwrap();
    drop(registry);
    println!("   - Registered and activated identity");

    // Register compute resource
    let mut marketplace = node.compute_marketplace.write().unwrap();
    let resource = ComputeResource {
        node_id: "node1".to_string(),
        cpu_cores: 8,
        memory_gb: 16,
        available: true,
        current_load: 0.0,
        reputation: 50.0,
    };
    marketplace.register_resource(resource).unwrap();
    println!("   - Registered compute resource");

    // Submit verification task
    let task_id = marketplace.submit_task(TaskType::Verification, 50);
    marketplace.assign_task(&task_id).unwrap();
    marketplace.start_task(&task_id).unwrap();
    let reward = marketplace.complete_task(&task_id, true).unwrap();
    println!("   - Completed verification task, reward: {}", reward);

    // Add block to blockchain
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
            timestamp: 1000,
            block_number: 1,
            proposer: node.address.clone(),
        },
        transactions: vec![tx],
    };

    blockchain.add_block(block).unwrap();
    println!("   - Added identity transaction to blockchain");
    println!("   - Final blockchain height: {}", blockchain.get_block_count());
}




