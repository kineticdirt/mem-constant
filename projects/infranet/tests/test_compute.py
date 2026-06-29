#!/usr/bin/env python3
"""
Infranet Compute Marketplace Tests
"""
from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

class TaskType(Enum):
    FHE = "fhe"
    MPC = "mpc"
    ZKP = "zkp"
    VERIFICATION = "verification"

class TaskStatus(Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class ComputeResource:
    node_id: str
    cpu_cores: int
    memory_gb: int
    available: bool
    current_load: float
    reputation: float

@dataclass
class Task:
    task_id: str
    task_type: TaskType
    complexity: int
    assigned_node: Optional[str]
    status: TaskStatus

class ComputeMarketplace:
    def __init__(self):
        self.resources: Dict[str, ComputeResource] = {}
        self.tasks: Dict[str, Task] = {}
        self.task_counter = 0
    
    def register_resource(self, resource: ComputeResource) -> bool:
        if resource.node_id in self.resources:
            return False
        
        self.resources[resource.node_id] = resource
        return True
    
    def submit_task(self, task_type: TaskType, complexity: int) -> str:
        self.task_counter += 1
        task_id = f"task_{self.task_counter}"
        
        task = Task(
            task_id=task_id,
            task_type=task_type,
            complexity=complexity,
            assigned_node=None,
            status=TaskStatus.PENDING
        )
        
        self.tasks[task_id] = task
        return task_id
    
    def assign_task(self, task_id: str) -> Optional[str]:
        if task_id not in self.tasks:
            return None
        
        task = self.tasks[task_id]
        if task.status != TaskStatus.PENDING:
            return None
        
        # Find best available node
        best_node = self._find_best_node(task.task_type)
        if not best_node:
            return None
        
        task.assigned_node = best_node
        task.status = TaskStatus.ASSIGNED
        
        return best_node
    
    def _find_best_node(self, task_type: TaskType) -> Optional[str]:
        available = [
            r for r in self.resources.values()
            if r.available and r.current_load < 0.8
        ]
        
        if not available:
            return None
        
        # Sort by reputation (descending), then by load (ascending)
        best = max(available, key=lambda r: (r.reputation, -r.current_load))
        return best.node_id
    
    def start_task(self, task_id: str) -> bool:
        if task_id not in self.tasks:
            return False
        
        task = self.tasks[task_id]
        if task.status != TaskStatus.ASSIGNED:
            return False
        
        task.status = TaskStatus.IN_PROGRESS
        
        # Update node load
        if task.assigned_node and task.assigned_node in self.resources:
            self.resources[task.assigned_node].current_load += 0.1
        
        return True
    
    def complete_task(self, task_id: str, success: bool) -> int:
        if task_id not in self.tasks:
            return 0
        
        task = self.tasks[task_id]
        if task.status != TaskStatus.IN_PROGRESS:
            return 0
        
        if success:
            task.status = TaskStatus.COMPLETED
        else:
            task.status = TaskStatus.FAILED
        
        # Update node load and reputation
        if task.assigned_node and task.assigned_node in self.resources:
            resource = self.resources[task.assigned_node]
            resource.current_load = max(0.0, resource.current_load - 0.1)
            
            if success:
                resource.reputation = min(100.0, resource.reputation + 0.1)
            else:
                resource.reputation = max(0.0, resource.reputation - 1.0)
        
        # Calculate reward
        return task.complexity * 10 if success else 0
    
    def get_task(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)
    
    def get_resource(self, node_id: str) -> Optional[ComputeResource]:
        return self.resources.get(node_id)

def test_resource_registration():
    """Test resource registration"""
    marketplace = ComputeMarketplace()
    
    resource = ComputeResource(
        node_id="node1",
        cpu_cores=8,
        memory_gb=16,
        available=True,
        current_load=0.0,
        reputation=50.0
    )
    
    assert marketplace.register_resource(resource) == True
    assert len(marketplace.resources) == 1
    
    print("[OK] Resource registration test passed")

def test_task_lifecycle():
    """Test complete task lifecycle"""
    marketplace = ComputeMarketplace()
    
    # Register resource
    resource = ComputeResource(
        node_id="node1",
        cpu_cores=8,
        memory_gb=16,
        available=True,
        current_load=0.0,
        reputation=50.0
    )
    marketplace.register_resource(resource)
    
    # Submit task
    task_id = marketplace.submit_task(TaskType.FHE, 100)
    task = marketplace.get_task(task_id)
    assert task.status == TaskStatus.PENDING
    
    # Assign task
    node_id = marketplace.assign_task(task_id)
    assert node_id == "node1"
    assert task.status == TaskStatus.ASSIGNED
    
    # Start task
    assert marketplace.start_task(task_id) == True
    assert task.status == TaskStatus.IN_PROGRESS
    
    # Complete task
    reward = marketplace.complete_task(task_id, True)
    assert reward == 1000  # complexity * 10
    assert task.status == TaskStatus.COMPLETED
    
    print("[OK] Task lifecycle test passed")

def test_reputation_update():
    """Test reputation updates"""
    marketplace = ComputeMarketplace()
    
    resource = ComputeResource(
        node_id="node1",
        cpu_cores=8,
        memory_gb=16,
        available=True,
        current_load=0.0,
        reputation=50.0
    )
    marketplace.register_resource(resource)
    
    initial_reputation = marketplace.get_resource("node1").reputation
    
    task_id = marketplace.submit_task(TaskType.ZKP, 50)
    marketplace.assign_task(task_id)
    marketplace.start_task(task_id)
    marketplace.complete_task(task_id, True)
    
    final_reputation = marketplace.get_resource("node1").reputation
    assert final_reputation > initial_reputation
    
    print("[OK] Reputation update test passed")

if __name__ == "__main__":
    print("Testing Compute Marketplace...")
    test_resource_registration()
    test_task_lifecycle()
    test_reputation_update()
    print("All compute marketplace tests passed!\n")

