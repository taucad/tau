// Copyright 2026 Lars Brubaker
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Port of disjoint_sets.h — Union-Find data structure with path compression
// and union-by-rank, plus connected component computation.
//
// The C++ version uses atomic operations for thread-safety. This sequential
// Rust port uses the same bit-packing layout: the upper 32 bits of each u64
// store the rank, and the lower 32 bits store the parent index.

use std::cell::Cell;
use std::collections::HashMap;

pub struct DisjointSets {
    data: Vec<Cell<u64>>,
}

impl DisjointSets {
    pub fn new(size: u32) -> Self {
        let data = (0..size).map(|i| Cell::new(i as u64)).collect();
        Self { data }
    }

    pub fn find(&self, mut id: u32) -> u32 {
        loop {
            let p = self.parent(id);
            if p == id {
                return id;
            }
            // Path splitting: point to grandparent (matches C++ path compression)
            let gp = self.parent(p);
            if gp != p {
                let value = self.data[id as usize].get();
                let new_value = (value & 0xFFFFFFFF00000000u64) | gp as u64;
                self.data[id as usize].set(new_value);
            }
            id = gp;
        }
    }

    pub fn same(&self, mut id1: u32, mut id2: u32) -> bool {
        loop {
            id1 = self.find(id1);
            id2 = self.find(id2);
            if id1 == id2 {
                return true;
            }
            if self.parent(id1) == id1 {
                return false;
            }
        }
    }

    pub fn unite(&self, mut id1: u32, mut id2: u32) -> u32 {
        loop {
            id1 = self.find(id1);
            id2 = self.find(id2);

            if id1 == id2 {
                return id1;
            }

            let mut r1 = self.rank(id1);
            let mut r2 = self.rank(id2);

            // Ensure id1 has lower rank (or lower index if equal)
            if r1 > r2 || (r1 == r2 && id1 < id2) {
                std::mem::swap(&mut r1, &mut r2);
                std::mem::swap(&mut id1, &mut id2);
            }

            // Point id1 to id2
            let old_entry = ((r1 as u64) << 32) | id1 as u64;
            let new_entry = ((r1 as u64) << 32) | id2 as u64;

            if self.data[id1 as usize].get() != old_entry {
                continue;
            }
            self.data[id1 as usize].set(new_entry);

            if r1 == r2 {
                let old_entry2 = ((r2 as u64) << 32) | id2 as u64;
                let new_entry2 = (((r2 + 1) as u64) << 32) | id2 as u64;
                if self.data[id2 as usize].get() == old_entry2 {
                    self.data[id2 as usize].set(new_entry2);
                } else if r2 == 0 {
                    continue;
                }
            }

            break;
        }
        id2
    }

    pub fn size(&self) -> u32 {
        self.data.len() as u32
    }

    pub fn rank(&self, id: u32) -> u32 {
        ((self.data[id as usize].get() >> 32) as u32) & 0x7FFFFFFFu32
    }

    pub fn parent(&self, id: u32) -> u32 {
        self.data[id as usize].get() as u32
    }

    pub fn connected_components(&self, components: &mut Vec<i32>) -> i32 {
        components.resize(self.data.len(), 0);
        let mut lonely_nodes = 0i32;
        let mut to_label: HashMap<u32, i32> = HashMap::new();

        for i in 0..self.data.len() {
            let i_parent = self.find(i as u32);
            // Optimize for connected components of size 1
            if self.rank(i_parent) == 0 {
                components[i] = to_label.len() as i32 + lonely_nodes;
                lonely_nodes += 1;
                continue;
            }
            if let Some(&label) = to_label.get(&i_parent) {
                components[i] = label;
            } else {
                let s = to_label.len() as i32 + lonely_nodes;
                to_label.insert(i_parent, s);
                components[i] = s;
            }
        }
        to_label.len() as i32 + lonely_nodes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disjoint_sets_basic() {
        let ds = DisjointSets::new(10);
        assert_eq!(ds.size(), 10);
        assert!(!ds.same(0, 1));
        ds.unite(0, 1);
        assert!(ds.same(0, 1));
        assert!(!ds.same(0, 2));
    }

    #[test]
    fn test_disjoint_sets_chain() {
        let ds = DisjointSets::new(5);
        ds.unite(0, 1);
        ds.unite(1, 2);
        ds.unite(2, 3);
        assert!(ds.same(0, 3));
        assert!(!ds.same(0, 4));
    }

    #[test]
    fn test_connected_components() {
        let ds = DisjointSets::new(6);
        ds.unite(0, 1);
        ds.unite(1, 2);
        ds.unite(3, 4);
        // Groups: {0,1,2}, {3,4}, {5}
        let mut components = Vec::new();
        let num = ds.connected_components(&mut components);
        assert_eq!(num, 3);
        // Members of the same group should have the same component id
        assert_eq!(components[0], components[1]);
        assert_eq!(components[1], components[2]);
        assert_eq!(components[3], components[4]);
        assert_ne!(components[0], components[3]);
        assert_ne!(components[0], components[5]);
        assert_ne!(components[3], components[5]);
    }

    #[test]
    fn test_unite_returns_root() {
        let ds = DisjointSets::new(4);
        let root = ds.unite(0, 1);
        // The root should be one of the two
        assert!(root == 0 || root == 1);
        // Find should return the same root
        assert_eq!(ds.find(0), ds.find(1));
    }

    #[test]
    fn test_single_element() {
        let ds = DisjointSets::new(1);
        assert_eq!(ds.find(0), 0);
        let mut components = Vec::new();
        let num = ds.connected_components(&mut components);
        assert_eq!(num, 1);
    }
}
