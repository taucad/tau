//! Deterministic per-claim accounting, independent of cache or wall time.

use std::cell::Cell;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct BudgetExceeded {
    pub limit: u64,
    pub used: u64,
}

pub(crate) struct Budget {
    limit: u64,
    used: Cell<u64>,
}

impl Budget {
    pub(crate) fn new(limit: u64) -> Self {
        Self {
            limit,
            used: Cell::new(0),
        }
    }

    /// Charge requested work before either computation or cache lookup.
    pub(crate) fn charge(&self, units: u64) -> Result<(), BudgetExceeded> {
        if self.used.get() > self.limit {
            return Err(BudgetExceeded {
                limit: self.limit,
                used: self.used.get(),
            });
        }
        self.used.set(self.used.get().saturating_add(units));
        if self.used.get() > self.limit {
            Err(BudgetExceeded {
                limit: self.limit,
                used: self.used.get(),
            })
        } else {
            Ok(())
        }
    }

    pub(crate) fn used(&self) -> u64 {
        self.used.get()
    }
    pub(crate) fn remaining(&self) -> u64 {
        self.limit.saturating_sub(self.used())
    }

    pub(crate) fn limit(&self) -> u64 {
        self.limit
    }
}
