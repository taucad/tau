use geospec_engine_native_cache_host::AuthenticatedOverlapCache;
use geospec_engine_native_core::ProtocolError as CoreProtocolError;
use geospec_engine_native_runtime::{
    create_engine, create_engine_with_overlap_cache, producer_identity_bytes,
    producer_identity_verified, Engine, EngineConfig,
};
use pyo3::{
    create_exception,
    exceptions::{PyException, PyRuntimeError, PyValueError},
    prelude::*,
    types::{PyBytes, PyModule},
};
use std::rc::Rc;

create_exception!(geospec_engine_native, ProtocolError, PyException);

fn protocol_error(py: Python<'_>, error: CoreProtocolError) -> PyErr {
    let exception = ProtocolError::new_err(error.to_string());
    if let Err(attribute_error) = exception.value(py).setattr("code", error.code()) {
        return attribute_error;
    }
    exception
}

#[pyclass(name = "Engine", unsendable)]
struct PyEngine {
    inner: Option<Engine>,
    cache: Option<Rc<AuthenticatedOverlapCache>>,
}

impl PyEngine {
    fn engine(&self) -> PyResult<&Engine> {
        self.inner
            .as_ref()
            .ok_or_else(|| PyRuntimeError::new_err("GeoSpec native engine is closed."))
    }

    fn engine_mut(&mut self) -> PyResult<&mut Engine> {
        self.inner
            .as_mut()
            .ok_or_else(|| PyRuntimeError::new_err("GeoSpec native engine is closed."))
    }
}

#[pymethods]
impl PyEngine {
    #[new]
    #[pyo3(signature = (cache_root=None, project_root=None, *, execution_permits=None))]
    fn new(
        cache_root: Option<String>,
        project_root: Option<String>,
        execution_permits: Option<f64>,
    ) -> PyResult<Self> {
        let config = EngineConfig::entry()
            .with_execution_permits(execution_permits.unwrap_or(1.0))
            .map_err(PyValueError::new_err)?;
        match (cache_root, project_root) {
            (None, None) => Ok(Self {
                inner: Some(create_engine(config).map_err(PyValueError::new_err)?),
                cache: None,
            }),
            (Some(root), Some(project)) => {
                if !producer_identity_verified() {
                    return Err(PyValueError::new_err(
                        "Persistent evidence requires the verified release producer profile.",
                    ));
                }
                let cache = Rc::new(
                    AuthenticatedOverlapCache::open(root, project)
                        .map_err(|error| PyValueError::new_err(error.to_string()))?,
                );
                Ok(Self {
                    inner: Some(
                        create_engine_with_overlap_cache(config, cache.clone())
                            .map_err(PyValueError::new_err)?,
                    ),
                    cache: Some(cache),
                })
            }
            _ => Err(PyValueError::new_err(
                "cache_root and project_root must be supplied together",
            )),
        }
    }

    fn close(&mut self) {
        if self.inner.is_none() {
            return;
        }
        if let Some(cache) = &self.cache {
            cache.flush();
        }
        self.inner.take();
        self.cache.take();
    }

    /// Owned snapshot bytes; diagnostic copies deliberately do not count themselves.
    fn observations<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyBytes>> {
        Ok(PyBytes::new(py, &self.engine()?.observations()))
    }

    fn ingest_subject<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
        primary: &[u8],
        resources: Vec<Vec<u8>>,
    ) -> PyResult<Bound<'py, PyBytes>> {
        self.engine()?.observe_input_copy(primary.len());
        for bytes in &resources {
            self.engine()?.observe_input_copy(bytes.len());
        }
        let result = self
            .engine_mut()?
            .ingest_subject(request, primary.to_vec(), resources)
            .map_err(|error| protocol_error(py, error))?;
        self.engine()?.observe_output_copy(result.len());
        Ok(PyBytes::new(py, &result))
    }

    fn ingest_mesh<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
        mesh: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .engine_mut()?
            .ingest_mesh(request, mesh)
            .map_err(|error| protocol_error(py, error))?;
        self.engine()?.observe_output_copy(result.len());
        Ok(PyBytes::new(py, &result))
    }

    fn subject_handle<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .engine()?
            .subject_handle(request)
            .map_err(|error| protocol_error(py, error))?;
        self.engine()?.observe_output_copy(result.len());
        Ok(PyBytes::new(py, &result))
    }

    fn release_subject<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .engine_mut()?
            .release_subject(request)
            .map_err(|error| protocol_error(py, error))?;
        self.engine()?.observe_output_copy(result.len());
        Ok(PyBytes::new(py, &result))
    }

    fn process_request<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .engine()?
            .process_request(request)
            .map_err(|error| protocol_error(py, error))?;
        self.engine()?.observe_output_copy(result.len());
        Ok(PyBytes::new(py, &result))
    }

    fn canonical_plan<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .engine()?
            .canonical_plan(request)
            .map_err(|error| protocol_error(py, error))?;
        self.engine()?.observe_output_copy(result.len());
        Ok(PyBytes::new(py, &result))
    }

    fn evaluate_plan<'py>(
        &mut self,
        py: Python<'py>,
        plan: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .engine()?
            .evaluate_plan(plan)
            .map_err(|error| protocol_error(py, error))?;
        self.engine()?.observe_output_copy(result.len());
        Ok(PyBytes::new(py, &result))
    }

    fn flush_cache<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyBytes>> {
        self.engine()?;
        let bytes = self.cache.as_ref().map_or_else(
            || br#"{"enabled":false,"sealed":true}"#.to_vec(),
            |cache| cache.flush(),
        );
        Ok(PyBytes::new(py, &bytes))
    }

    fn clear_overlap_cache(&self) -> PyResult<bool> {
        self.engine()?;
        Ok(self.cache.as_ref().is_some_and(|cache| cache.clear()))
    }

    fn cache_producer_identity<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyBytes>> {
        self.engine()?;
        Ok(PyBytes::new(py, &producer_identity_bytes()))
    }
}

#[pyfunction]
fn canonicalize<'py>(py: Python<'py>, input: &[u8]) -> PyResult<Bound<'py, PyBytes>> {
    let input = input.to_vec();
    let result = py
        .detach(|| geospec_engine_native_core::canonicalize(&input))
        .map_err(|error| protocol_error(py, error))?;
    Ok(PyBytes::new(py, &result))
}

#[pymodule]
fn geospec_engine_native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<PyEngine>()?;
    module.add("ProtocolError", module.py().get_type::<ProtocolError>())?;
    module.add_function(wrap_pyfunction!(canonicalize, module)?)?;
    Ok(())
}
