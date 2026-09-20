use geospec_engine_native_cache_host::AuthenticatedOverlapCache;
use geospec_engine_native_core::{canonicalize as core_canonicalize, ProtocolError};
use geospec_engine_native_runtime::{
    create_engine, create_engine_with_overlap_cache, producer_identity_bytes,
    producer_identity_verified, Engine as CoreEngine, EngineConfig,
};
use napi::bindgen_prelude::{Buffer, Error, Result};
use napi_derive::napi;
use std::rc::Rc;

fn fail(error: ProtocolError) -> Error<&'static str> {
    Error::new(error.code(), error.to_string())
}

#[napi]
pub struct Engine {
    inner: Option<CoreEngine>,
    cache: Option<Rc<AuthenticatedOverlapCache>>,
}

#[napi(object)]
pub struct CacheOptions {
    pub root: String,
    pub project_root: String,
}

impl Default for Engine {
    fn default() -> Self {
        Self {
            inner: Some(create_engine(EngineConfig::entry())),
            cache: None,
        }
    }
}

impl Engine {
    fn engine(&self) -> Result<&CoreEngine, &'static str> {
        self.inner
            .as_ref()
            .ok_or_else(|| Error::new("invalid-request", "GeoSpec native engine is closed."))
    }

    fn engine_mut(&mut self) -> Result<&mut CoreEngine, &'static str> {
        self.inner
            .as_mut()
            .ok_or_else(|| Error::new("invalid-request", "GeoSpec native engine is closed."))
    }
}

#[napi]
impl Engine {
    #[napi(constructor)]
    pub fn new(cache_options: Option<CacheOptions>) -> Result<Self, &'static str> {
        let Some(options) = cache_options else {
            return Ok(Self::default());
        };
        if !producer_identity_verified() {
            return Err(Error::new(
                "invalid-request",
                "Persistent evidence requires the verified release producer profile.",
            ));
        }
        let cache = Rc::new(
            AuthenticatedOverlapCache::open(options.root, options.project_root)
                .map_err(|error| Error::new("invalid-request", error.to_string()))?,
        );
        Ok(Self {
            inner: Some(
                create_engine_with_overlap_cache(EngineConfig::entry(), cache.clone())
                    .map_err(|message| Error::new("invalid-request", message))?,
            ),
            cache: Some(cache),
        })
    }

    #[napi]
    pub fn close(&mut self) {
        if self.inner.is_none() {
            return;
        }
        if let Some(cache) = &self.cache {
            cache.flush();
        }
        self.inner.take();
        self.cache.take();
    }

    /// Non-mutating observation bytes; their transfer is excluded from copy counters.
    #[napi]
    pub fn observations(&self) -> Result<Buffer, &'static str> {
        Ok(Buffer::from(self.engine()?.observations()))
    }

    #[napi(js_name = "ingestSubject")]
    pub fn ingest_subject(
        &mut self,
        request: Buffer,
        primary: Buffer,
        resources: Vec<Buffer>,
    ) -> Result<Buffer, &'static str> {
        self.engine()?.observe_input_copy(primary.len());
        for bytes in &resources {
            self.engine()?.observe_input_copy(bytes.len());
        }
        self.engine_mut()?
            .ingest_subject(
                request.as_ref(),
                primary.to_vec(),
                resources.into_iter().map(|bytes| bytes.to_vec()).collect(),
            )
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "ingestMesh")]
    pub fn ingest_mesh(&mut self, request: Buffer, mesh: Buffer) -> Result<Buffer, &'static str> {
        self.engine_mut()?
            .ingest_mesh(request.as_ref(), mesh.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "subjectHandle")]
    pub fn subject_handle(&self, request: Buffer) -> Result<Buffer, &'static str> {
        self.engine()?
            .subject_handle(request.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "releaseSubject")]
    pub fn release_subject(&mut self, request: Buffer) -> Result<Buffer, &'static str> {
        self.engine_mut()?
            .release_subject(request.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "processRequest")]
    pub fn process_request(&self, request: Buffer) -> Result<Buffer, &'static str> {
        self.engine()?
            .process_request(request.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "canonicalPlan")]
    pub fn canonical_plan(&self, request: Buffer) -> Result<Buffer, &'static str> {
        self.engine()?
            .canonical_plan(request.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "evaluatePlan")]
    pub fn evaluate_plan(&self, plan: Buffer) -> Result<Buffer, &'static str> {
        self.engine()?
            .evaluate_plan(plan.as_ref())
            .map(Buffer::from)
            .map_err(fail)
    }

    #[napi(js_name = "flushCache")]
    pub fn flush_cache(&self) -> Result<Buffer, &'static str> {
        self.engine()?;
        Ok(self.cache.as_ref().map_or_else(
            || Buffer::from(br#"{"enabled":false,"sealed":true}"#.as_slice()),
            |cache| Buffer::from(cache.flush()),
        ))
    }

    #[napi(js_name = "clearOverlapCache")]
    pub fn clear_overlap_cache(&self) -> Result<bool, &'static str> {
        self.engine()?;
        Ok(self.cache.as_ref().is_some_and(|cache| cache.clear()))
    }

    #[napi(js_name = "cacheProducerIdentity")]
    pub fn cache_producer_identity(&self) -> Result<Buffer, &'static str> {
        self.engine()?;
        Ok(Buffer::from(producer_identity_bytes()))
    }
}

#[napi]
pub fn canonicalize(input: Buffer) -> Result<Buffer, &'static str> {
    core_canonicalize(input.as_ref())
        .map(Buffer::from)
        .map_err(fail)
}
