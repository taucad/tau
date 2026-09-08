use geospec_engine_native_core::{
    canonicalize as core_canonicalize, Engine as CoreEngine, ProtocolError,
};
use napi::bindgen_prelude::{Buffer, Error, Result};
use napi_derive::napi;

fn fail(error: ProtocolError) -> Error<&'static str> {
    Error::new(error.code(), error.to_string())
}

#[napi]
pub struct Engine {
    inner: CoreEngine,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[napi]
impl Engine {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: CoreEngine::new(),
        }
    }

    #[napi(js_name = "ingestMesh")]
    pub fn ingest_mesh(&mut self, request: Buffer, mesh: Buffer) -> Result<Buffer, &'static str> {
        self.inner
            .ingest_mesh(request.as_ref(), mesh.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "processRequest")]
    pub fn process_request(&self, request: Buffer) -> Result<Buffer, &'static str> {
        self.inner
            .process_request(request.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "canonicalPlan")]
    pub fn canonical_plan(&self, request: Buffer) -> Result<Buffer, &'static str> {
        self.inner
            .canonical_plan(request.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "evaluatePlan")]
    pub fn evaluate_plan(&self, plan: Buffer) -> Result<Buffer, &'static str> {
        self.inner
            .evaluate_plan(plan.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }
}

#[napi]
pub fn canonicalize(input: Buffer) -> Result<Buffer, &'static str> {
    core_canonicalize(input.as_ref())
        .map(Buffer::from)
        .map_err(fail)
}
