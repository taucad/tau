//! Tau's OpenSCAD language server.
//!
//! The server speaks LSP 3.17 JSON-RPC through one entry point, [`Server::handle`], and performs no I/O: the browser
//! worker sends project files with the `tau/workspaceFiles` notification and the editor's open documents with the
//! usual `textDocument/did*` notifications. On `wasm32-unknown-unknown` the same entry point is exported as a small C
//! ABI (`osl_*`), so the module needs no imports and no JavaScript glue.

pub mod context;
pub mod docs;
pub mod document;
mod features;
pub mod format;
pub mod index;
pub mod resolve;
pub mod server;
pub mod text;
pub mod workspace;

pub use server::Server;

#[cfg(target_arch = "wasm32")]
mod wasm {
    use std::cell::RefCell;

    use crate::Server;

    thread_local! {
        static SERVER: RefCell<Server> = RefCell::new(Server::new());
        static RESPONSE: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    }

    /// Reserve `length` bytes for a message the host writes into module memory.
    #[unsafe(no_mangle)]
    pub extern "C" fn osl_alloc(length: usize) -> *mut u8 {
        let mut buffer = Vec::<u8>::with_capacity(length.max(1));
        let pointer = buffer.as_mut_ptr();
        std::mem::forget(buffer);
        pointer
    }

    /// Release a buffer from [`osl_alloc`].
    ///
    /// # Safety
    /// `pointer` and `length` must come from one `osl_alloc` call.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn osl_free(pointer: *mut u8, length: usize) {
        drop(unsafe { Vec::from_raw_parts(pointer, 0, length.max(1)) });
    }

    /// Handle one JSON-RPC message (UTF-8, `length` bytes at `pointer`, released by this call). Returns the byte
    /// length of the response, read from [`osl_response`]; 0 means the message was a notification.
    ///
    /// # Safety
    /// `pointer` and `length` must come from one `osl_alloc` call and hold the message.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn osl_handle(pointer: *mut u8, length: usize) -> usize {
        let bytes = unsafe { Vec::from_raw_parts(pointer, length, length.max(1)) };
        let message = String::from_utf8_lossy(&bytes);
        let response = SERVER.with(|server| server.borrow_mut().handle(&message));
        RESPONSE.with(|slot| {
            let mut slot = slot.borrow_mut();
            slot.clear();
            if let Some(response) = response {
                slot.extend_from_slice(response.as_bytes());
            }
            slot.len()
        })
    }

    /// The last response written by [`osl_handle`], valid until the next call.
    #[unsafe(no_mangle)]
    pub extern "C" fn osl_response() -> *const u8 {
        RESPONSE.with(|slot| slot.borrow().as_ptr())
    }
}
