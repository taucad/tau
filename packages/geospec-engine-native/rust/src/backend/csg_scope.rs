//! Ordinary claim-scoped temporary results and bounded retained source operands.

use crate::budget::Budget;
use crate::protocol::{Observations, WorkCounter};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use super::{
    csg::{
        BooleanOp, CsgConnector, FillRule, MeshExport, Section, SectionOp, SolidId, SolidProperties,
    },
    BackendError, BackendErrorKind, TriangleMesh,
};

/// Engine-local source operands. The paired connector owns their actual solids
/// and drops the arena with the Engine; these IDs never escape that composition.
pub(crate) struct RetainedSolids {
    entries: HashMap<(String, u32), SolidId>,
    max_entries: u32,
}

impl RetainedSolids {
    pub(crate) fn new(max_entries: u32) -> Self {
        Self {
            entries: HashMap::new(),
            max_entries,
        }
    }

    pub(crate) fn release_subject(
        &mut self,
        subject: &str,
        connector: &mut dyn CsgConnector,
    ) -> Result<(), BackendError> {
        let prefix = format!("{subject}:");
        let entries = self
            .entries
            .iter()
            .filter(|((identity, _), _)| identity == subject || identity.starts_with(&prefix))
            .map(|(key, id)| (key.clone(), *id))
            .collect::<Vec<_>>();
        let mut first_error = None;
        for (key, id) in entries {
            match connector.release(id) {
                Ok(()) => {
                    self.entries.remove(&key);
                }
                Err(error) if first_error.is_none() => first_error = Some(error),
                Err(_) => {}
            }
        }
        first_error.map_or(Ok(()), Err)
    }

    pub(crate) fn release_all(
        &mut self,
        connector: &mut dyn CsgConnector,
    ) -> Result<(), BackendError> {
        let entries = self.entries.values().copied().collect::<Vec<_>>();
        let mut first_error = None;
        for id in entries {
            if let Err(error) = connector.release(id) {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
        self.entries.clear();
        first_error.map_or(Ok(()), Err)
    }
}

/// Every allocating call registers its output. Cached inputs remain borrowed.
pub struct CsgScope<'a> {
    connector: &'a mut dyn CsgConnector,
    transient: Vec<SolidId>,
    retained: Option<&'a mut RetainedSolids>,
    budget: Option<&'a Budget>,
    observations: Option<Rc<Observations>>,
    charged_sources: HashSet<(String, u32)>,
}

impl<'a> CsgScope<'a> {
    pub fn new(connector: &'a mut dyn CsgConnector) -> Self {
        Self {
            connector,
            transient: Vec::new(),
            retained: None,
            budget: None,
            observations: None,
            charged_sources: HashSet::new(),
        }
    }

    pub(crate) fn with_retained(
        connector: &'a mut dyn CsgConnector,
        retained: &'a mut RetainedSolids,
    ) -> Self {
        Self {
            connector,
            transient: Vec::new(),
            retained: Some(retained),
            budget: None,
            observations: None,
            charged_sources: HashSet::new(),
        }
    }

    pub(crate) fn with_observations(mut self, observations: Option<Rc<Observations>>) -> Self {
        self.observations = observations;
        self
    }

    fn observe(&self, counter: WorkCounter) {
        if let Some(observations) = &self.observations {
            observations.add(counter, 1);
        }
    }

    pub(crate) fn with_budget(mut self, budget: &'a Budget) -> Self {
        self.budget = Some(budget);
        self
    }

    pub(crate) fn charge(&self, units: u64) -> Result<(), BackendError> {
        if let Some(budget) = self.budget {
            budget.charge(units).map_err(|error| BackendError {
                kind: BackendErrorKind::BudgetExceeded {
                    limit: error.limit,
                    used: error.used,
                },
                message: "The claim exhausted its logical request budget.".into(),
            })?;
        }
        Ok(())
    }

    pub(crate) fn mesh_cost(mesh: &TriangleMesh) -> u64 {
        1_u64
            .saturating_add(mesh.positions.len() as u64)
            .saturating_add((mesh.triangles.len() as u64).saturating_mul(3))
    }

    /// Replay the same source request without needing a backend solid result.
    pub(crate) fn charge_cached_source(
        &mut self,
        identity: &str,
        component: u32,
        units: u64,
    ) -> Result<(), BackendError> {
        let key = (identity.to_owned(), component);
        if !self.charged_sources.contains(&key) {
            self.charge(units)?;
            self.charged_sources.insert(key);
        }
        Ok(())
    }

    /// Only immutable partition/profile operands use this path; Boolean outputs
    /// remain ordinary temporaries. Failed admission stays a typed failure.
    pub(crate) fn admit_cached(
        &mut self,
        identity: &str,
        component: u32,
        mesh: &TriangleMesh,
        merges: &[[u32; 2]],
    ) -> Result<SolidId, BackendError> {
        self.charge_cached_source(identity, component, Self::mesh_cost(mesh))?;
        let key = (identity.to_owned(), component);
        let Some(cache) = self.retained.as_deref_mut() else {
            if let Some(observations) = &self.observations {
                observations.add(WorkCounter::CsgAdmissions, 1);
            }
            let id = self.connector.admit(mesh, merges)?;
            self.transient.push(id);
            return Ok(id);
        };
        if let Some(result) = cache.entries.get(&key) {
            if let Some(observations) = &self.observations {
                observations.add(WorkCounter::CsgSourceHits, 1);
            }
            return Ok(*result);
        }
        if cache.entries.len() as u64 >= u64::from(cache.max_entries) {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Source CSG operands exceed the configured retained solid limit.".into(),
            });
        }
        if let Some(observations) = &self.observations {
            observations.add(WorkCounter::CsgAdmissions, 1);
        }
        let result = self.connector.admit(mesh, merges)?;
        cache.entries.insert(key, result);
        Ok(result)
    }

    pub fn admit(
        &mut self,
        mesh: &TriangleMesh,
        merges: &[[u32; 2]],
    ) -> Result<SolidId, BackendError> {
        self.charge(Self::mesh_cost(mesh))?;
        if let Some(observations) = &self.observations {
            observations.add(WorkCounter::CsgAdmissions, 1);
        }
        let id = self.connector.admit(mesh, merges)?;
        self.transient.push(id);
        Ok(id)
    }

    pub fn boolean(
        &mut self,
        operation: BooleanOp,
        operands: &[SolidId],
    ) -> Result<SolidId, BackendError> {
        self.charge(1)?;
        self.observe(WorkCounter::CsgBooleans);
        let id = self.connector.boolean(operation, operands)?;
        self.transient.push(id);
        Ok(id)
    }

    pub fn transform(
        &mut self,
        solid: SolidId,
        affine: [f64; 12],
    ) -> Result<SolidId, BackendError> {
        self.charge(1)?;
        self.observe(WorkCounter::CsgOther);
        let id = self.connector.transform(solid, affine)?;
        self.transient.push(id);
        Ok(id)
    }

    pub fn decompose(&mut self, solid: SolidId) -> Result<Vec<SolidId>, BackendError> {
        self.charge(1)?;
        self.observe(WorkCounter::CsgOther);
        let ids = self.connector.decompose(solid)?;
        self.transient.extend_from_slice(&ids);
        Ok(ids)
    }

    /// Transfer a newly created source solid to explicit subject-cache ownership.
    pub fn retain(&mut self, solid: SolidId) -> Result<SolidId, BackendError> {
        let Some(index) = self.transient.iter().position(|&id| id == solid) else {
            return Err(BackendError {
                kind: BackendErrorKind::InvalidInput,
                message: "The CSG scope does not own this solid.".into(),
            });
        };
        self.transient.remove(index);
        Ok(solid)
    }

    pub fn properties(&self, solid: SolidId) -> Result<SolidProperties, BackendError> {
        self.charge(1)?;
        self.observe(WorkCounter::CsgProperties);
        self.connector.properties(solid)
    }

    pub fn export(&self, solid: SolidId) -> Result<MeshExport, BackendError> {
        self.charge(1)?;
        self.observe(WorkCounter::CsgOther);
        self.connector.export(solid)
    }

    pub fn slice(&self, solid: SolidId, z: f64) -> Result<Section, BackendError> {
        self.charge(1)?;
        self.observe(WorkCounter::CsgOther);
        self.connector.slice(solid, z)
    }

    pub fn section(
        &self,
        contours: &[Vec<[f64; 2]>],
        fill: FillRule,
    ) -> Result<Section, BackendError> {
        self.charge(
            contours
                .iter()
                .fold(1_u64, |sum, row| sum.saturating_add(row.len() as u64)),
        )?;
        self.observe(WorkCounter::CsgOther);
        self.connector.section(contours, fill)
    }

    pub fn section_boolean(
        &self,
        operation: SectionOp,
        left: &Section,
        right: &Section,
    ) -> Result<Section, BackendError> {
        self.charge(1)?;
        self.observe(WorkCounter::CsgOther);
        self.connector.section_boolean(operation, left, right)
    }

    /// Release an ordinary completed pair result before evaluating the next pair.
    pub fn release_temporary(&mut self, solid: SolidId) -> Result<(), BackendError> {
        let Some(index) = self.transient.iter().position(|&id| id == solid) else {
            return Err(BackendError {
                kind: BackendErrorKind::InvalidInput,
                message: "The CSG scope does not own this temporary solid.".into(),
            });
        };
        self.connector.release(solid)?;
        self.transient.remove(index);
        Ok(())
    }

    /// Release all temporaries and report the first ordinary cleanup error.
    pub fn finish(mut self) -> Result<(), BackendError> {
        self.clear()
    }

    fn clear(&mut self) -> Result<(), BackendError> {
        let mut first_error = None;
        for id in self.transient.drain(..).rev() {
            if let Err(error) = self.connector.release(id) {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
        first_error.map_or(Ok(()), Err)
    }
}

impl Drop for CsgScope<'_> {
    fn drop(&mut self) {
        // Explicit finish reports errors; this covers an ordinary early return.
        let _ = self.clear();
    }
}
