use crate::types::*;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use rand::Rng;

#[derive(Debug, Clone)]
pub struct ComputeMarketplace {
    resources: HashMap<NodeId, ComputeResource>,
    tasks: HashMap<String, Task>,
    task_counter: u64,
}

impl ComputeMarketplace {
    pub fn new() -> Self {
        ComputeMarketplace {
            resources: HashMap::new(),
            tasks: HashMap::new(),
            task_counter: 0,
        }
    }

    pub fn register_resource(&mut self, resource: ComputeResource) -> Result<(), String> {
        if self.resources.contains_key(&resource.node_id) {
            return Err("Resource already registered".to_string());
        }

        self.resources.insert(resource.node_id.clone(), resource);
        Ok(())
    }

    pub fn submit_task(&mut self, task_type: TaskType, complexity: u64) -> String {
        self.task_counter += 1;
        let task_id = format!("task_{}", self.task_counter);

        let task = Task {
            task_id: task_id.clone(),
            task_type,
            complexity,
            assigned_node: None,
            status: TaskStatus::Pending,
        };

        self.tasks.insert(task_id.clone(), task);
        task_id
    }

    pub fn assign_task(&mut self, task_id: &str) -> Result<NodeId, String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or("Task not found")?;

        if task.status != TaskStatus::Pending {
            return Err("Task already assigned or completed".to_string());
        }

        // Find best available node
        let best_node = self.find_best_node(&task.task_type)
            .ok_or("No available nodes")?;

        task.assigned_node = Some(best_node.clone());
        task.status = TaskStatus::Assigned;

        Ok(best_node)
    }

    fn find_best_node(&self, task_type: &TaskType) -> Option<NodeId> {
        // Simple selection: find node with lowest load and highest reputation
        self.resources
            .values()
            .filter(|r| r.available && r.current_load < 0.8)
            .max_by(|a, b| {
                // Prioritize by reputation, then by availability (lower load)
                a.reputation.partial_cmp(&b.reputation)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| b.current_load.partial_cmp(&a.current_load)
                        .unwrap_or(std::cmp::Ordering::Equal))
            })
            .map(|r| r.node_id.clone())
    }

    pub fn start_task(&mut self, task_id: &str) -> Result<(), String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or("Task not found")?;

        if task.status != TaskStatus::Assigned {
            return Err("Task not assigned".to_string());
        }

        task.status = TaskStatus::InProgress;

        // Update node load
        if let Some(node_id) = &task.assigned_node {
            if let Some(resource) = self.resources.get_mut(node_id) {
                resource.current_load += 0.1; // Simulate load increase
            }
        }

        Ok(())
    }

    pub fn complete_task(&mut self, task_id: &str, success: bool) -> Result<u64, String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or("Task not found")?;

        if task.status != TaskStatus::InProgress {
            return Err("Task not in progress".to_string());
        }

        if success {
            task.status = TaskStatus::Completed;
        } else {
            task.status = TaskStatus::Failed;
        }

        // Update node load
        if let Some(node_id) = &task.assigned_node {
            if let Some(resource) = self.resources.get_mut(node_id) {
                resource.current_load = (resource.current_load - 0.1).max(0.0);
                
                // Update reputation
                if success {
                    resource.reputation = (resource.reputation + 0.1).min(100.0);
                } else {
                    resource.reputation = (resource.reputation - 1.0).max(0.0);
                }
            }
        }

        // Calculate reward (simplified)
        let reward = if success {
            task.complexity * 10 // Base reward
        } else {
            0
        };

        Ok(reward)
    }

    pub fn get_task(&self, task_id: &str) -> Option<&Task> {
        self.tasks.get(task_id)
    }

    pub fn get_resource(&self, node_id: &NodeId) -> Option<&ComputeResource> {
        self.resources.get(node_id)
    }

    pub fn list_resources(&self) -> Vec<&ComputeResource> {
        self.resources.values().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_registration() {
        let mut marketplace = ComputeMarketplace::new();
        
        let resource = ComputeResource {
            node_id: "node1".to_string(),
            cpu_cores: 8,
            memory_gb: 16,
            available: true,
            current_load: 0.0,
            reputation: 50.0,
        };

        assert!(marketplace.register_resource(resource).is_ok());
        assert_eq!(marketplace.list_resources().len(), 1);
    }

    #[test]
    fn test_task_lifecycle() {
        let mut marketplace = ComputeMarketplace::new();
        
        // Register resource
        let resource = ComputeResource {
            node_id: "node1".to_string(),
            cpu_cores: 8,
            memory_gb: 16,
            available: true,
            current_load: 0.0,
            reputation: 50.0,
        };
        marketplace.register_resource(resource).unwrap();

        // Submit task
        let task_id = marketplace.submit_task(TaskType::FHE, 100);
        let task = marketplace.get_task(&task_id).unwrap();
        assert!(matches!(task.status, TaskStatus::Pending));

        // Assign task
        let node_id = marketplace.assign_task(&task_id).unwrap();
        assert_eq!(node_id, "node1");
        
        let task = marketplace.get_task(&task_id).unwrap();
        assert!(matches!(task.status, TaskStatus::Assigned));

        // Start task
        marketplace.start_task(&task_id).unwrap();
        let task = marketplace.get_task(&task_id).unwrap();
        assert!(matches!(task.status, TaskStatus::InProgress));

        // Complete task
        let reward = marketplace.complete_task(&task_id, true).unwrap();
        assert_eq!(reward, 1000); // complexity * 10
        
        let task = marketplace.get_task(&task_id).unwrap();
        assert!(matches!(task.status, TaskStatus::Completed));
    }

    #[test]
    fn test_reputation_update() {
        let mut marketplace = ComputeMarketplace::new();
        
        let resource = ComputeResource {
            node_id: "node1".to_string(),
            cpu_cores: 8,
            memory_gb: 16,
            available: true,
            current_load: 0.0,
            reputation: 50.0,
        };
        marketplace.register_resource(resource).unwrap();

        let task_id = marketplace.submit_task(TaskType::ZKP, 50);
        marketplace.assign_task(&task_id).unwrap();
        marketplace.start_task(&task_id).unwrap();
        marketplace.complete_task(&task_id, true).unwrap();

        let resource = marketplace.get_resource(&"node1".to_string()).unwrap();
        assert!(resource.reputation > 50.0);
    }
}




