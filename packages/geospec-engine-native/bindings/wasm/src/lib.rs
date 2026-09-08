use geospec_engine_native_core::{
    canonicalize as core_canonicalize, Engine as CoreEngine, ProtocolError as CoreProtocolError,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = ProtocolError)]
pub struct ProtocolError {
    code: String,
    message: String,
}

#[wasm_bindgen(js_class = ProtocolError)]
impl ProtocolError {
    #[wasm_bindgen(getter)]
    pub fn code(&self) -> String {
        self.code.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn message(&self) -> String {
        self.message.clone()
    }
}

impl From<CoreProtocolError> for ProtocolError {
    fn from(error: CoreProtocolError) -> Self {
        Self {
            code: error.code().to_owned(),
            message: error.to_string(),
        }
    }
}

fn fail(error: CoreProtocolError) -> JsValue {
    ProtocolError::from(error).into()
}

#[wasm_bindgen]
pub struct Engine {
    inner: CoreEngine,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: CoreEngine::new(),
        }
    }

    #[wasm_bindgen(js_name = ingestMesh)]
    pub fn ingest_mesh(&mut self, request: &[u8], mesh: &[u8]) -> Result<Vec<u8>, JsValue> {
        self.inner.ingest_mesh(request, mesh).map_err(fail)
    }

    #[wasm_bindgen(js_name = processRequest)]
    pub fn process_request(&self, request: &[u8]) -> Result<Vec<u8>, JsValue> {
        self.inner.process_request(request).map_err(fail)
    }

    #[wasm_bindgen(js_name = canonicalPlan)]
    pub fn canonical_plan(&self, request: &[u8]) -> Result<Vec<u8>, JsValue> {
        self.inner.canonical_plan(request).map_err(fail)
    }

    #[wasm_bindgen(js_name = evaluatePlan)]
    pub fn evaluate_plan(&self, plan: &[u8]) -> Result<Vec<u8>, JsValue> {
        self.inner.evaluate_plan(plan).map_err(fail)
    }
}

#[wasm_bindgen]
pub fn canonicalize(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    core_canonicalize(input).map_err(fail)
}
