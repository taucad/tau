use geospec_engine_native_core::ProtocolError as CoreProtocolError;
use geospec_engine_native_runtime::{create_engine, Engine, EngineConfig};
use pyo3::{
    create_exception,
    exceptions::PyException,
    prelude::*,
    types::{PyBytes, PyModule},
};

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
    inner: Engine,
}

#[pymethods]
impl PyEngine {
    #[new]
    fn new() -> Self {
        Self {
            inner: create_engine(EngineConfig::entry()),
        }
    }

    fn ingest_subject<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
        primary: &[u8],
        resources: Vec<Vec<u8>>,
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .inner
            .ingest_subject(request, primary.to_vec(), resources)
            .map_err(|error| protocol_error(py, error))?;
        Ok(PyBytes::new(py, &result))
    }

    fn ingest_mesh<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
        mesh: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .inner
            .ingest_mesh(request, mesh)
            .map_err(|error| protocol_error(py, error))?;
        Ok(PyBytes::new(py, &result))
    }

    fn subject_handle<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .inner
            .subject_handle(request)
            .map_err(|error| protocol_error(py, error))?;
        Ok(PyBytes::new(py, &result))
    }

    fn release_subject<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .inner
            .release_subject(request)
            .map_err(|error| protocol_error(py, error))?;
        Ok(PyBytes::new(py, &result))
    }

    fn process_request<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .inner
            .process_request(request)
            .map_err(|error| protocol_error(py, error))?;
        Ok(PyBytes::new(py, &result))
    }

    fn canonical_plan<'py>(
        &mut self,
        py: Python<'py>,
        request: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .inner
            .canonical_plan(request)
            .map_err(|error| protocol_error(py, error))?;
        Ok(PyBytes::new(py, &result))
    }

    fn evaluate_plan<'py>(
        &mut self,
        py: Python<'py>,
        plan: &[u8],
    ) -> PyResult<Bound<'py, PyBytes>> {
        let result = self
            .inner
            .evaluate_plan(plan)
            .map_err(|error| protocol_error(py, error))?;
        Ok(PyBytes::new(py, &result))
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
