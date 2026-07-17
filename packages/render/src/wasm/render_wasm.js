/* @ts-self-types="./render_wasm.d.ts" */

/**
 * Benchmark the codec encoders over one render (white background so JPEG
 * participates): JSON report with per-format avg ms / bytes / FNV-1a
 * fingerprints for cross-artifact byte-identity checks.
 * @param {Uint8Array} glb
 * @param {number} width
 * @param {number} height
 * @returns {Promise<string>}
 */
export function bench_codecs(glb, width, height) {
  const ptr0 = passArray8ToWasm0(glb, wasm.__wbindgen_export);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.bench_codecs(ptr0, len0, width, height);
  return takeObject(ret);
}

/**
 * Compare six singular calls with one six-view batch.
 * @param {Uint8Array} glb
 * @param {number} width
 * @param {number} height
 * @returns {Promise<string>}
 */
export function bench_multi_view(glb, width, height) {
  const ptr0 = passArray8ToWasm0(glb, wasm.__wbindgen_export);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.bench_multi_view(ptr0, len0, width, height);
  return takeObject(ret);
}

/**
 * GPU-independent PNG/WebP/JPEG fingerprints for native/wasm conformance.
 * @returns {string}
 */
export function codec_conformance() {
  let deferred2_0;
  let deferred2_1;
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.codec_conformance(retptr);
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
    var ptr1 = r0;
    var len1 = r1;
    if (r3) {
      ptr1 = 0;
      len1 = 0;
      throw takeObject(r2);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
    wasm.__wbindgen_export5(deferred2_0, deferred2_1, 1);
  }
}

/**
 * Backend + device name of the adapter the browser hands us.
 * @returns {Promise<string>}
 */
export function describe_adapter() {
  const ret = wasm.describe_adapter();
  return takeObject(ret);
}

/**
 * Render a kernel GLB to encoded image bytes. `options_json` is the shared
 * render-request contract (`render_core::RenderRequest`): width/height,
 * format `"png" | "webp" | "jpeg" | "jpg"`, quality 0..=1, phi/theta degrees,
 * margin 0..=0.5, up `"x" | "y" | "z"`, background `[r, g, b, a]` in 0..=1.
 * @param {Uint8Array} glb
 * @param {string} options_json
 * @returns {Promise<Uint8Array>}
 */
export function render_glb_to_image(glb, options_json) {
  const ptr0 = passArray8ToWasm0(glb, wasm.__wbindgen_export);
  const len0 = WASM_VECTOR_LEN;
  const ptr1 = passStringToWasm0(options_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len1 = WASM_VECTOR_LEN;
  const ret = wasm.render_glb_to_image(ptr0, len0, ptr1, len1);
  return takeObject(ret);
}

/**
 * Render ordered identified views through one batch-scoped render session.
 * @param {Uint8Array} glb
 * @param {string} options_json
 * @returns {Promise<Array<any>>}
 */
export function render_glb_to_images(glb, options_json) {
  const ptr0 = passArray8ToWasm0(glb, wasm.__wbindgen_export);
  const len0 = WASM_VECTOR_LEN;
  const ptr1 = passStringToWasm0(options_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
  const len1 = WASM_VECTOR_LEN;
  const ret = wasm.render_glb_to_images(ptr0, len0, ptr1, len1);
  return takeObject(ret);
}
function __wbg_get_imports() {
  const import0 = {
    __proto__: null,
    __wbg_Error_92b29b0548f8b746: function (arg0, arg1) {
      const ret = Error(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    },
    __wbg_Window_afcc911b2f9c92e2: function (arg0) {
      const ret = getObject(arg0).Window;
      return addHeapObject(ret);
    },
    __wbg_WorkerGlobalScope_5d19ebc889ff397e: function (arg0) {
      const ret = getObject(arg0).WorkerGlobalScope;
      return addHeapObject(ret);
    },
    __wbg___wbindgen_debug_string_c25d447a39f5578f: function (arg0, arg1) {
      const ret = debugString(getObject(arg1));
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg___wbindgen_is_function_1ff95bcc5517c252: function (arg0) {
      const ret = typeof getObject(arg0) === 'function';
      return ret;
    },
    __wbg___wbindgen_is_null_ea9085d691f535d3: function (arg0) {
      const ret = getObject(arg0) === null;
      return ret;
    },
    __wbg___wbindgen_is_string_ea5e6cc2e4141dfe: function (arg0) {
      const ret = typeof getObject(arg0) === 'string';
      return ret;
    },
    __wbg___wbindgen_is_undefined_c05833b95a3cf397: function (arg0) {
      const ret = getObject(arg0) === undefined;
      return ret;
    },
    __wbg___wbindgen_throw_344f42d3211c4765: function (arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    },
    __wbg__wbg_cb_unref_fffb441def202758: function (arg0) {
      getObject(arg0)._wbg_cb_unref();
    },
    __wbg_beginRenderPass_aa22c432e793359a: function () {
      return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).beginRenderPass(getObject(arg1));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_call_a6e5c5dce5018821: function () {
      return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_configure_0e4789c0f6b35c8e: function () {
      return handleError(function (arg0, arg1) {
        getObject(arg0).configure(getObject(arg1));
      }, arguments);
    },
    __wbg_copyTextureToBuffer_ed6e67a77ecb768d: function () {
      return handleError(function (arg0, arg1, arg2, arg3) {
        getObject(arg0).copyTextureToBuffer(getObject(arg1), getObject(arg2), getObject(arg3));
      }, arguments);
    },
    __wbg_createBindGroupLayout_49a7e2b3d076afcf: function () {
      return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).createBindGroupLayout(getObject(arg1));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_createBindGroup_655c6e6c0258530e: function (arg0, arg1) {
      const ret = getObject(arg0).createBindGroup(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_createBuffer_0726dd2ab09ea1d2: function () {
      return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).createBuffer(getObject(arg1));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_createCommandEncoder_ec1f40f0cb4d09df: function (arg0, arg1) {
      const ret = getObject(arg0).createCommandEncoder(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_createPipelineLayout_2c8cd4528b06c108: function (arg0, arg1) {
      const ret = getObject(arg0).createPipelineLayout(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_createRenderPipeline_cf98d4d699bfb03c: function () {
      return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).createRenderPipeline(getObject(arg1));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_createSampler_c8ffb3c8d565f704: function (arg0, arg1) {
      const ret = getObject(arg0).createSampler(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_createShaderModule_2e44fc7677c6288b: function (arg0, arg1) {
      const ret = getObject(arg0).createShaderModule(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_createTexture_1bac74c999b8a48e: function () {
      return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).createTexture(getObject(arg1));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_createView_ceaf2f5881adbd34: function () {
      return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).createView(getObject(arg1));
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_description_02485704e69b1e7f: function (arg0, arg1) {
      const ret = getObject(arg1).description;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg_drawIndexed_d31913e79d58fbac: function (arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject(arg0).drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
    },
    __wbg_draw_6877f98847e1e36c: function (arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
    },
    __wbg_end_f99ebed53d4e198a: function (arg0) {
      getObject(arg0).end();
    },
    __wbg_finish_4d91de5e927dd13f: function (arg0, arg1) {
      const ret = getObject(arg0).finish(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_finish_6e06b68ab68cd9f6: function (arg0) {
      const ret = getObject(arg0).finish();
      return addHeapObject(ret);
    },
    __wbg_getContext_fd298c901058eb31: function () {
      return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
      }, arguments);
    },
    __wbg_getMappedRange_d0bf3141224111b6: function () {
      return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).getMappedRange(arg1, arg2);
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_gpu_2ccc250735d24a2a: function (arg0) {
      const ret = getObject(arg0).gpu;
      return addHeapObject(ret);
    },
    __wbg_info_cf0d9a286850cd24: function (arg0) {
      const ret = getObject(arg0).info;
      return addHeapObject(ret);
    },
    __wbg_isFallbackAdapter_8ccb967428491dcb: function (arg0) {
      const ret = getObject(arg0).isFallbackAdapter;
      return ret;
    },
    __wbg_label_7ed42f25f841996b: function (arg0, arg1) {
      const ret = getObject(arg1).label;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg_length_1f0964f4a5e2c6d8: function (arg0) {
      const ret = getObject(arg0).length;
      return ret;
    },
    __wbg_mapAsync_52b01fa9e8f765fd: function (arg0, arg1, arg2, arg3) {
      const ret = getObject(arg0).mapAsync(arg1 >>> 0, arg2, arg3);
      return addHeapObject(ret);
    },
    __wbg_navigator_51379c10a84aeec9: function (arg0) {
      const ret = getObject(arg0).navigator;
      return addHeapObject(ret);
    },
    __wbg_navigator_99621db14b3f1099: function (arg0) {
      const ret = getObject(arg0).navigator;
      return addHeapObject(ret);
    },
    __wbg_new_25e75d1f0df4d87a: function () {
      return handleError(function (arg0, arg1) {
        const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
        return addHeapObject(ret);
      }, arguments);
    },
    __wbg_new_32b398fb48b6d94a: function () {
      const ret = new Array();
      return addHeapObject(ret);
    },
    __wbg_new_da52cf8fe3429cb2: function () {
      const ret = new Object();
      return addHeapObject(ret);
    },
    __wbg_new_from_slice_77cdfb7977362f3c: function (arg0, arg1) {
      const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
      return addHeapObject(ret);
    },
    __wbg_new_typed_1824d93f294193e5: function (arg0, arg1) {
      try {
        var state0 = { a: arg0, b: arg1 };
        var cb0 = (arg0, arg1) => {
          const a = state0.a;
          state0.a = 0;
          try {
            return __wasm_bindgen_func_elem_912(a, state0.b, arg0, arg1);
          } finally {
            state0.a = a;
          }
        };
        const ret = new Promise(cb0);
        return addHeapObject(ret);
      } finally {
        state0.a = 0;
      }
    },
    __wbg_new_typed_4148bd5ae72ab3f0: function () {
      const ret = new Object();
      return addHeapObject(ret);
    },
    __wbg_new_with_byte_offset_and_length_54c7724ee3ec7d82: function (arg0, arg1, arg2) {
      const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
      return addHeapObject(ret);
    },
    __wbg_now_86c0d4ba3fa605b8: function () {
      const ret = Date.now();
      return ret;
    },
    __wbg_onSubmittedWorkDone_270d6b5a45520e79: function (arg0) {
      const ret = getObject(arg0).onSubmittedWorkDone();
      return addHeapObject(ret);
    },
    __wbg_prototypesetcall_4770620bbe4688a0: function (arg0, arg1, arg2) {
      Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
    },
    __wbg_push_d2ae3af0c1217ae6: function (arg0, arg1) {
      const ret = getObject(arg0).push(getObject(arg1));
      return ret;
    },
    __wbg_queueMicrotask_0ab5b2d2393e99b9: function (arg0) {
      const ret = getObject(arg0).queueMicrotask;
      return addHeapObject(ret);
    },
    __wbg_queueMicrotask_6a09b7bc46549209: function (arg0) {
      queueMicrotask(getObject(arg0));
    },
    __wbg_queue_adce34608fd0c893: function (arg0) {
      const ret = getObject(arg0).queue;
      return addHeapObject(ret);
    },
    __wbg_requestAdapter_2e6718811c735a57: function (arg0, arg1) {
      const ret = getObject(arg0).requestAdapter(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_requestDevice_ab46d0519ea1cc34: function (arg0, arg1) {
      const ret = getObject(arg0).requestDevice(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_resolve_2191a4dfe481c25b: function (arg0) {
      const ret = Promise.resolve(getObject(arg0));
      return addHeapObject(ret);
    },
    __wbg_setBindGroup_f0de6cb2c7dbfc2c: function (arg0, arg1, arg2) {
      getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2));
    },
    __wbg_setIndexBuffer_7f3cf667b4d71566: function (arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).setIndexBuffer(getObject(arg1), __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
    },
    __wbg_setPipeline_c41bf46790f27f9e: function (arg0, arg1) {
      getObject(arg0).setPipeline(getObject(arg1));
    },
    __wbg_setVertexBuffer_7cf533d694e747f3: function (arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).setVertexBuffer(arg1 >>> 0, getObject(arg2), arg3, arg4);
    },
    __wbg_set_61e45ae8061eca11: function (arg0, arg1, arg2) {
      getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    },
    __wbg_set_8535240470bf2500: function () {
      return handleError(function (arg0, arg1, arg2) {
        const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
        return ret;
      }, arguments);
    },
    __wbg_set_a_88262a42340d0b1c: function (arg0, arg1) {
      getObject(arg0).a = arg1;
    },
    __wbg_set_access_9a5092f05dc45fad: function (arg0, arg1) {
      getObject(arg0).access = __wbindgen_enum_GpuStorageTextureAccess[arg1];
    },
    __wbg_set_address_mode_u_9e2695575a219e33: function (arg0, arg1) {
      getObject(arg0).addressModeU = __wbindgen_enum_GpuAddressMode[arg1];
    },
    __wbg_set_address_mode_v_f479b2e6cccbcac4: function (arg0, arg1) {
      getObject(arg0).addressModeV = __wbindgen_enum_GpuAddressMode[arg1];
    },
    __wbg_set_address_mode_w_46273e153230180d: function (arg0, arg1) {
      getObject(arg0).addressModeW = __wbindgen_enum_GpuAddressMode[arg1];
    },
    __wbg_set_alpha_bfd2df62e7bc581b: function (arg0, arg1) {
      getObject(arg0).alpha = getObject(arg1);
    },
    __wbg_set_alpha_to_coverage_enabled_8b5dc2b0a225b3b2: function (arg0, arg1) {
      getObject(arg0).alphaToCoverageEnabled = arg1 !== 0;
    },
    __wbg_set_array_layer_count_7312f0f31af94e7c: function (arg0, arg1) {
      getObject(arg0).arrayLayerCount = arg1 >>> 0;
    },
    __wbg_set_array_stride_f64_27ffaf4fffd74e61: function (arg0, arg1) {
      getObject(arg0).arrayStride = arg1;
    },
    __wbg_set_aspect_0d453bca3d012f02: function (arg0, arg1) {
      getObject(arg0).aspect = __wbindgen_enum_GpuTextureAspect[arg1];
    },
    __wbg_set_aspect_4962514fe99e68e6: function (arg0, arg1) {
      getObject(arg0).aspect = __wbindgen_enum_GpuTextureAspect[arg1];
    },
    __wbg_set_attributes_7537844a7e6dafdc: function (arg0, arg1, arg2) {
      getObject(arg0).attributes = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_b_c47befe0af3261eb: function (arg0, arg1) {
      getObject(arg0).b = arg1;
    },
    __wbg_set_base_array_layer_f176bb9f1b37b342: function (arg0, arg1) {
      getObject(arg0).baseArrayLayer = arg1 >>> 0;
    },
    __wbg_set_base_mip_level_1df145d9f8db32a9: function (arg0, arg1) {
      getObject(arg0).baseMipLevel = arg1 >>> 0;
    },
    __wbg_set_bind_group_layouts_5a9cfea401c020ab: function (arg0, arg1, arg2) {
      getObject(arg0).bindGroupLayouts = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_binding_155b0440b4307793: function (arg0, arg1) {
      getObject(arg0).binding = arg1 >>> 0;
    },
    __wbg_set_binding_f74df3510792aba1: function (arg0, arg1) {
      getObject(arg0).binding = arg1 >>> 0;
    },
    __wbg_set_blend_7493c2066c3e9970: function (arg0, arg1) {
      getObject(arg0).blend = getObject(arg1);
    },
    __wbg_set_buffer_9c01e3b6d6765ea2: function (arg0, arg1) {
      getObject(arg0).buffer = getObject(arg1);
    },
    __wbg_set_buffer_c3410572051920ba: function (arg0, arg1) {
      getObject(arg0).buffer = getObject(arg1);
    },
    __wbg_set_buffer_ef7f75306cf663ed: function (arg0, arg1) {
      getObject(arg0).buffer = getObject(arg1);
    },
    __wbg_set_buffers_7d0d8f507699e956: function (arg0, arg1, arg2) {
      getObject(arg0).buffers = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_bytes_per_row_c54ca96953f35774: function (arg0, arg1) {
      getObject(arg0).bytesPerRow = arg1 >>> 0;
    },
    __wbg_set_bytes_per_row_d69b88eee3929c07: function (arg0, arg1) {
      getObject(arg0).bytesPerRow = arg1 >>> 0;
    },
    __wbg_set_clear_value_gpu_color_dict_6211425789c76e59: function (arg0, arg1) {
      getObject(arg0).clearValue = getObject(arg1);
    },
    __wbg_set_code_b4f37f81f45b5b25: function (arg0, arg1, arg2) {
      getObject(arg0).code = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_color_83aa977526e88cbb: function (arg0, arg1) {
      getObject(arg0).color = getObject(arg1);
    },
    __wbg_set_color_attachments_581fdb3310e4abfa: function (arg0, arg1, arg2) {
      getObject(arg0).colorAttachments = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_compare_f36b34abfaa08ccb: function (arg0, arg1) {
      getObject(arg0).compare = __wbindgen_enum_GpuCompareFunction[arg1];
    },
    __wbg_set_count_069a4eac409bac55: function (arg0, arg1) {
      getObject(arg0).count = arg1 >>> 0;
    },
    __wbg_set_cull_mode_fc649853947a3d0c: function (arg0, arg1) {
      getObject(arg0).cullMode = __wbindgen_enum_GpuCullMode[arg1];
    },
    __wbg_set_depth_bias_clamp_1c0d695df7f092e5: function (arg0, arg1) {
      getObject(arg0).depthBiasClamp = arg1;
    },
    __wbg_set_depth_bias_d7cd16096242a657: function (arg0, arg1) {
      getObject(arg0).depthBias = arg1;
    },
    __wbg_set_depth_bias_slope_scale_c4e52ec743ef55ba: function (arg0, arg1) {
      getObject(arg0).depthBiasSlopeScale = arg1;
    },
    __wbg_set_depth_clear_value_beda3ec5b1a5c43a: function (arg0, arg1) {
      getObject(arg0).depthClearValue = arg1;
    },
    __wbg_set_depth_compare_0c8631eb2eae98e3: function (arg0, arg1) {
      getObject(arg0).depthCompare = __wbindgen_enum_GpuCompareFunction[arg1];
    },
    __wbg_set_depth_fail_op_668155ae33d3c06f: function (arg0, arg1) {
      getObject(arg0).depthFailOp = __wbindgen_enum_GpuStencilOperation[arg1];
    },
    __wbg_set_depth_load_op_511c513eab4e56a9: function (arg0, arg1) {
      getObject(arg0).depthLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
    },
    __wbg_set_depth_or_array_layers_89371305ed0bd962: function (arg0, arg1) {
      getObject(arg0).depthOrArrayLayers = arg1 >>> 0;
    },
    __wbg_set_depth_read_only_7f41a74741c144ec: function (arg0, arg1) {
      getObject(arg0).depthReadOnly = arg1 !== 0;
    },
    __wbg_set_depth_stencil_97506c7bea4f53da: function (arg0, arg1) {
      getObject(arg0).depthStencil = getObject(arg1);
    },
    __wbg_set_depth_stencil_attachment_73b79e8b4e948222: function (arg0, arg1) {
      getObject(arg0).depthStencilAttachment = getObject(arg1);
    },
    __wbg_set_depth_store_op_c89f33b39b43361c: function (arg0, arg1) {
      getObject(arg0).depthStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
    },
    __wbg_set_depth_write_enabled_ce89750042940350: function (arg0, arg1) {
      getObject(arg0).depthWriteEnabled = arg1 !== 0;
    },
    __wbg_set_device_e275d1d4f3c9eb74: function (arg0, arg1) {
      getObject(arg0).device = getObject(arg1);
    },
    __wbg_set_dimension_868eee80f4b90011: function (arg0, arg1) {
      getObject(arg0).dimension = __wbindgen_enum_GpuTextureDimension[arg1];
    },
    __wbg_set_dimension_e325282e613ca0a4: function (arg0, arg1) {
      getObject(arg0).dimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
    },
    __wbg_set_dst_factor_ec7407f19be1aff9: function (arg0, arg1) {
      getObject(arg0).dstFactor = __wbindgen_enum_GpuBlendFactor[arg1];
    },
    __wbg_set_entries_86a29dd6291c95e7: function (arg0, arg1, arg2) {
      getObject(arg0).entries = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_entries_a12aca1e458b0456: function (arg0, arg1, arg2) {
      getObject(arg0).entries = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_entry_point_207540f042015ce5: function (arg0, arg1, arg2) {
      getObject(arg0).entryPoint = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_entry_point_e87e79251dd3144f: function (arg0, arg1, arg2) {
      getObject(arg0).entryPoint = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_external_texture_386483d8dd82ab56: function (arg0, arg1) {
      getObject(arg0).externalTexture = getObject(arg1);
    },
    __wbg_set_fail_op_92f716dbc88b6973: function (arg0, arg1) {
      getObject(arg0).failOp = __wbindgen_enum_GpuStencilOperation[arg1];
    },
    __wbg_set_format_1fcaa7d60546b490: function (arg0, arg1) {
      getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
    },
    __wbg_set_format_2c1414a817c213f8: function (arg0, arg1) {
      getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
    },
    __wbg_set_format_533f9ffa7eef563d: function (arg0, arg1) {
      getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
    },
    __wbg_set_format_5d2f25cc93654ecc: function (arg0, arg1) {
      getObject(arg0).format = __wbindgen_enum_GpuVertexFormat[arg1];
    },
    __wbg_set_format_5ff53724ed6cedf2: function (arg0, arg1) {
      getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
    },
    __wbg_set_format_815efd4dc4817bbb: function (arg0, arg1) {
      getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
    },
    __wbg_set_format_e52bdcca880d2c8e: function (arg0, arg1) {
      getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
    },
    __wbg_set_fragment_8b780f00a0b0e6f3: function (arg0, arg1) {
      getObject(arg0).fragment = getObject(arg1);
    },
    __wbg_set_front_face_28ffdf524eedce5b: function (arg0, arg1) {
      getObject(arg0).frontFace = __wbindgen_enum_GpuFrontFace[arg1];
    },
    __wbg_set_g_5983abfc46e0cf4e: function (arg0, arg1) {
      getObject(arg0).g = arg1;
    },
    __wbg_set_has_dynamic_offset_62bc230bdb7c54d0: function (arg0, arg1) {
      getObject(arg0).hasDynamicOffset = arg1 !== 0;
    },
    __wbg_set_height_14335c4047cf9c1b: function (arg0, arg1) {
      getObject(arg0).height = arg1 >>> 0;
    },
    __wbg_set_label_08d9be3e4719c226: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_17eb9fe3a02f62b0: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_48e6b787d256f621: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_547d0d4aec39fbe9: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_5ee7427342869829: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_60ad96c811e0d109: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_72bb4f41ef0cb893: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_79387decda299036: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_9556af8b5cda3c9d: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_d010f237b26f2c55: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_e16e2dbe51349c7f: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_e3944e54881b8c50: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_label_e922700240417ab5: function (arg0, arg1, arg2) {
      getObject(arg0).label = getStringFromWasm0(arg1, arg2);
    },
    __wbg_set_layout_50ab727f44b38f26: function (arg0, arg1) {
      getObject(arg0).layout = getObject(arg1);
    },
    __wbg_set_layout_913d53c17194c989: function (arg0, arg1) {
      getObject(arg0).layout = getObject(arg1);
    },
    __wbg_set_layout_gpu_auto_layout_mode_aeba193938b47882: function (arg0, arg1) {
      getObject(arg0).layout = __wbindgen_enum_GpuAutoLayoutMode[arg1];
    },
    __wbg_set_load_op_99661da6c4eab9b0: function (arg0, arg1) {
      getObject(arg0).loadOp = __wbindgen_enum_GpuLoadOp[arg1];
    },
    __wbg_set_lod_max_clamp_dd2d9f9f052f4f44: function (arg0, arg1) {
      getObject(arg0).lodMaxClamp = arg1;
    },
    __wbg_set_lod_min_clamp_6d20c97916baeb93: function (arg0, arg1) {
      getObject(arg0).lodMinClamp = arg1;
    },
    __wbg_set_mag_filter_b5adebc99cb938e1: function (arg0, arg1) {
      getObject(arg0).magFilter = __wbindgen_enum_GpuFilterMode[arg1];
    },
    __wbg_set_mapped_at_creation_81b586dc90a50347: function (arg0, arg1) {
      getObject(arg0).mappedAtCreation = arg1 !== 0;
    },
    __wbg_set_mask_70a8a59ce09e5997: function (arg0, arg1) {
      getObject(arg0).mask = arg1 >>> 0;
    },
    __wbg_set_max_anisotropy_2beada0e2db62c45: function (arg0, arg1) {
      getObject(arg0).maxAnisotropy = arg1;
    },
    __wbg_set_min_binding_size_f64_5005a6904cdf43da: function (arg0, arg1) {
      getObject(arg0).minBindingSize = arg1;
    },
    __wbg_set_min_filter_c72f17375e135f0a: function (arg0, arg1) {
      getObject(arg0).minFilter = __wbindgen_enum_GpuFilterMode[arg1];
    },
    __wbg_set_mip_level_count_534caaa7e68e68b8: function (arg0, arg1) {
      getObject(arg0).mipLevelCount = arg1 >>> 0;
    },
    __wbg_set_mip_level_count_776c8c218b65bc08: function (arg0, arg1) {
      getObject(arg0).mipLevelCount = arg1 >>> 0;
    },
    __wbg_set_mip_level_f7ac79e8c54f59ad: function (arg0, arg1) {
      getObject(arg0).mipLevel = arg1 >>> 0;
    },
    __wbg_set_mipmap_filter_5bf66195a3639700: function (arg0, arg1) {
      getObject(arg0).mipmapFilter = __wbindgen_enum_GpuMipmapFilterMode[arg1];
    },
    __wbg_set_module_d0e2098713606cae: function (arg0, arg1) {
      getObject(arg0).module = getObject(arg1);
    },
    __wbg_set_module_f02e076ca7e7daf8: function (arg0, arg1) {
      getObject(arg0).module = getObject(arg1);
    },
    __wbg_set_multisample_37ddafe88b5cd466: function (arg0, arg1) {
      getObject(arg0).multisample = getObject(arg1);
    },
    __wbg_set_multisampled_7913fd7183272840: function (arg0, arg1) {
      getObject(arg0).multisampled = arg1 !== 0;
    },
    __wbg_set_offset_f64_28c24dc15000932e: function (arg0, arg1) {
      getObject(arg0).offset = arg1;
    },
    __wbg_set_offset_f64_89f0ce01a689839e: function (arg0, arg1) {
      getObject(arg0).offset = arg1;
    },
    __wbg_set_offset_f64_b562d1367e34ef93: function (arg0, arg1) {
      getObject(arg0).offset = arg1;
    },
    __wbg_set_offset_f64_fa66068813376ca3: function (arg0, arg1) {
      getObject(arg0).offset = arg1;
    },
    __wbg_set_operation_62ce44e1728c4047: function (arg0, arg1) {
      getObject(arg0).operation = __wbindgen_enum_GpuBlendOperation[arg1];
    },
    __wbg_set_origin_gpu_origin_3d_dict_631c04520718091f: function (arg0, arg1) {
      getObject(arg0).origin = getObject(arg1);
    },
    __wbg_set_pass_op_cf02fa088d6352a7: function (arg0, arg1) {
      getObject(arg0).passOp = __wbindgen_enum_GpuStencilOperation[arg1];
    },
    __wbg_set_power_preference_8fdca0b7af640d49: function (arg0, arg1) {
      getObject(arg0).powerPreference = __wbindgen_enum_GpuPowerPreference[arg1];
    },
    __wbg_set_primitive_43c23761a55b4088: function (arg0, arg1) {
      getObject(arg0).primitive = getObject(arg1);
    },
    __wbg_set_r_c6f4c68f4804d655: function (arg0, arg1) {
      getObject(arg0).r = arg1;
    },
    __wbg_set_required_features_1baf274a8669db60: function (arg0, arg1, arg2) {
      getObject(arg0).requiredFeatures = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_required_limits_871ed33c68613dcb: function (arg0, arg1) {
      getObject(arg0).requiredLimits = getObject(arg1);
    },
    __wbg_set_resolve_target_gpu_texture_view_b19a4f2debf79b96: function (arg0, arg1) {
      getObject(arg0).resolveTarget = getObject(arg1);
    },
    __wbg_set_resource_5ae7b5e67924f234: function (arg0, arg1) {
      getObject(arg0).resource = getObject(arg1);
    },
    __wbg_set_resource_gpu_buffer_binding_e5dbca063e7cb67b: function (arg0, arg1) {
      getObject(arg0).resource = getObject(arg1);
    },
    __wbg_set_resource_gpu_texture_view_eb46c355d51ad7e5: function (arg0, arg1) {
      getObject(arg0).resource = getObject(arg1);
    },
    __wbg_set_rows_per_image_5011f97318ee71af: function (arg0, arg1) {
      getObject(arg0).rowsPerImage = arg1 >>> 0;
    },
    __wbg_set_rows_per_image_59a813ac5006e10e: function (arg0, arg1) {
      getObject(arg0).rowsPerImage = arg1 >>> 0;
    },
    __wbg_set_sample_count_eb86a8b18545b54f: function (arg0, arg1) {
      getObject(arg0).sampleCount = arg1 >>> 0;
    },
    __wbg_set_sample_type_c32e1dfff94e63eb: function (arg0, arg1) {
      getObject(arg0).sampleType = __wbindgen_enum_GpuTextureSampleType[arg1];
    },
    __wbg_set_sampler_c0e1258543a33bce: function (arg0, arg1) {
      getObject(arg0).sampler = getObject(arg1);
    },
    __wbg_set_shader_location_7e1832a74f912217: function (arg0, arg1) {
      getObject(arg0).shaderLocation = arg1 >>> 0;
    },
    __wbg_set_size_f64_6bcd40704bf4cfdc: function (arg0, arg1) {
      getObject(arg0).size = arg1;
    },
    __wbg_set_size_f64_8b8f6bba5d678162: function (arg0, arg1) {
      getObject(arg0).size = arg1;
    },
    __wbg_set_size_gpu_extent_3d_dict_7e42e1c98fa36434: function (arg0, arg1) {
      getObject(arg0).size = getObject(arg1);
    },
    __wbg_set_src_factor_9bfe84af9b7b5cac: function (arg0, arg1) {
      getObject(arg0).srcFactor = __wbindgen_enum_GpuBlendFactor[arg1];
    },
    __wbg_set_stencil_back_85b22f1db5b1940a: function (arg0, arg1) {
      getObject(arg0).stencilBack = getObject(arg1);
    },
    __wbg_set_stencil_front_525526164a798a44: function (arg0, arg1) {
      getObject(arg0).stencilFront = getObject(arg1);
    },
    __wbg_set_stencil_read_mask_5cc26495e8b3ae82: function (arg0, arg1) {
      getObject(arg0).stencilReadMask = arg1 >>> 0;
    },
    __wbg_set_stencil_read_only_bf1d0c1897e25c62: function (arg0, arg1) {
      getObject(arg0).stencilReadOnly = arg1 !== 0;
    },
    __wbg_set_stencil_write_mask_d9cb40ec4b4bee5b: function (arg0, arg1) {
      getObject(arg0).stencilWriteMask = arg1 >>> 0;
    },
    __wbg_set_step_mode_a97bb24714da41a9: function (arg0, arg1) {
      getObject(arg0).stepMode = __wbindgen_enum_GpuVertexStepMode[arg1];
    },
    __wbg_set_storage_texture_939a097db4b18bd4: function (arg0, arg1) {
      getObject(arg0).storageTexture = getObject(arg1);
    },
    __wbg_set_store_op_b5fdf672436f13f3: function (arg0, arg1) {
      getObject(arg0).storeOp = __wbindgen_enum_GpuStoreOp[arg1];
    },
    __wbg_set_strip_index_format_9f787be6c5fc9e87: function (arg0, arg1) {
      getObject(arg0).stripIndexFormat = __wbindgen_enum_GpuIndexFormat[arg1];
    },
    __wbg_set_targets_c38bd200c836d66f: function (arg0, arg1, arg2) {
      getObject(arg0).targets = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_texture_1f64653a5d2d7b4d: function (arg0, arg1) {
      getObject(arg0).texture = getObject(arg1);
    },
    __wbg_set_texture_9dcedde1bb31eda6: function (arg0, arg1) {
      getObject(arg0).texture = getObject(arg1);
    },
    __wbg_set_topology_da25f2cc5af203d2: function (arg0, arg1) {
      getObject(arg0).topology = __wbindgen_enum_GpuPrimitiveTopology[arg1];
    },
    __wbg_set_type_ccf8472d40abcddf: function (arg0, arg1) {
      getObject(arg0).type = __wbindgen_enum_GpuSamplerBindingType[arg1];
    },
    __wbg_set_type_d09829f59932a0fc: function (arg0, arg1) {
      getObject(arg0).type = __wbindgen_enum_GpuBufferBindingType[arg1];
    },
    __wbg_set_unclipped_depth_04524a2b44e1e3c1: function (arg0, arg1) {
      getObject(arg0).unclippedDepth = arg1 !== 0;
    },
    __wbg_set_usage_b2a2935f37bf3d08: function (arg0, arg1) {
      getObject(arg0).usage = arg1 >>> 0;
    },
    __wbg_set_usage_ba5b0f8b333ab325: function (arg0, arg1) {
      getObject(arg0).usage = arg1 >>> 0;
    },
    __wbg_set_usage_ddd42599bbba7779: function (arg0, arg1) {
      getObject(arg0).usage = arg1 >>> 0;
    },
    __wbg_set_vertex_0be5d146f9ff6f36: function (arg0, arg1) {
      getObject(arg0).vertex = getObject(arg1);
    },
    __wbg_set_view_dimension_0df554032f1f3a85: function (arg0, arg1) {
      getObject(arg0).viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
    },
    __wbg_set_view_dimension_4818d4c18ce5815e: function (arg0, arg1) {
      getObject(arg0).viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
    },
    __wbg_set_view_formats_4347dc8363331086: function (arg0, arg1, arg2) {
      getObject(arg0).viewFormats = getArrayJsValueViewFromWasm0(arg1, arg2);
    },
    __wbg_set_view_gpu_texture_view_9b2d86b6b99d9fd9: function (arg0, arg1) {
      getObject(arg0).view = getObject(arg1);
    },
    __wbg_set_view_gpu_texture_view_c0f35f8857c25206: function (arg0, arg1) {
      getObject(arg0).view = getObject(arg1);
    },
    __wbg_set_visibility_9570b037224c4cc2: function (arg0, arg1) {
      getObject(arg0).visibility = arg1 >>> 0;
    },
    __wbg_set_width_9f685402c2cbee70: function (arg0, arg1) {
      getObject(arg0).width = arg1 >>> 0;
    },
    __wbg_set_write_mask_d45279e56abbfcb5: function (arg0, arg1) {
      getObject(arg0).writeMask = arg1 >>> 0;
    },
    __wbg_set_x_876d592971db129a: function (arg0, arg1) {
      getObject(arg0).x = arg1 >>> 0;
    },
    __wbg_set_y_2b1f5ac0dd5586a5: function (arg0, arg1) {
      getObject(arg0).y = arg1 >>> 0;
    },
    __wbg_set_z_ef005d82bc9d24e3: function (arg0, arg1) {
      getObject(arg0).z = arg1 >>> 0;
    },
    __wbg_static_accessor_GLOBAL_4ef717fb391d88b7: function () {
      const ret = typeof global === 'undefined' ? null : global;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    },
    __wbg_static_accessor_GLOBAL_THIS_8d1badc68b5a74f4: function () {
      const ret = typeof globalThis === 'undefined' ? null : globalThis;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    },
    __wbg_static_accessor_SELF_146583524fe1469b: function () {
      const ret = typeof self === 'undefined' ? null : self;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    },
    __wbg_static_accessor_WINDOW_f2829a2234d7819e: function () {
      const ret = typeof window === 'undefined' ? null : window;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    },
    __wbg_subgroupMaxSize_1527c5f7a8fe91bb: function (arg0) {
      const ret = getObject(arg0).subgroupMaxSize;
      return ret;
    },
    __wbg_subgroupMinSize_d6c5ad4bddc828e9: function (arg0) {
      const ret = getObject(arg0).subgroupMinSize;
      return ret;
    },
    __wbg_submit_ce44115121cd166c: function (arg0, arg1, arg2) {
      getObject(arg0).submit(getArrayJsValueViewFromWasm0(arg1, arg2));
    },
    __wbg_then_16d107c451e9905d: function (arg0, arg1, arg2) {
      const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    },
    __wbg_then_6ec10ae38b3e92f7: function (arg0, arg1) {
      const ret = getObject(arg0).then(getObject(arg1));
      return addHeapObject(ret);
    },
    __wbg_unconfigure_0a07a0a40de8988d: function (arg0) {
      getObject(arg0).unconfigure();
    },
    __wbg_unmap_adaf93276fdf9aaf: function (arg0) {
      getObject(arg0).unmap();
    },
    __wbg_writeBuffer_8b5bd251a89198bc: function () {
      return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        getObject(arg0).writeBuffer(getObject(arg1), arg2, getArrayU8FromWasm0(arg3, arg4), arg5, arg6);
      }, arguments);
    },
    __wbg_writeTexture_53ba204c494b042c: function () {
      return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
        getObject(arg0).writeTexture(
          getObject(arg1),
          getArrayU8FromWasm0(arg2, arg3),
          getObject(arg4),
          getObject(arg5),
        );
      }, arguments);
    },
    __wbindgen_cast_0000000000000001: function (arg0, arg1) {
      // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 33, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
      const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_662);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000002: function (arg0, arg1) {
      // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUDevice")], shim_idx: 33, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
      const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_662_1);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000003: function (arg0, arg1) {
      // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("any")], shim_idx: 33, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
      const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_662_2);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000004: function (arg0, arg1) {
      // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("undefined")], shim_idx: 33, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
      const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_662_3);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000005: function (arg0) {
      // Cast intrinsic for `F64 -> Externref`.
      const ret = arg0;
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000006: function (arg0, arg1) {
      // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
      const ret = getArrayU8FromWasm0(arg0, arg1);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000007: function (arg0, arg1) {
      // Cast intrinsic for `Ref(String) -> Externref`.
      const ret = getStringFromWasm0(arg0, arg1);
      return addHeapObject(ret);
    },
    __wbindgen_cast_0000000000000008: function (arg0, arg1) {
      var v0 = getArrayU8FromWasm0(arg0, arg1).slice();
      wasm.__wbindgen_export5(arg0, arg1 * 1, 1);
      // Cast intrinsic for `Vector(U8) -> Externref`.
      const ret = v0;
      return addHeapObject(ret);
    },
    __wbindgen_object_clone_ref: function (arg0) {
      const ret = getObject(arg0);
      return addHeapObject(ret);
    },
    __wbindgen_object_drop_ref: function (arg0) {
      takeObject(arg0);
    },
  };
  return {
    __proto__: null,
    './render_wasm_bg.js': import0,
  };
}

function __wasm_bindgen_func_elem_662(arg0, arg1, arg2) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_662(retptr, arg0, arg1, addHeapObject(arg2));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    if (r1) {
      throw takeObject(r0);
    }
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}

function __wasm_bindgen_func_elem_662_1(arg0, arg1, arg2) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_662_1(retptr, arg0, arg1, addHeapObject(arg2));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    if (r1) {
      throw takeObject(r0);
    }
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}

function __wasm_bindgen_func_elem_662_2(arg0, arg1, arg2) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_662_2(retptr, arg0, arg1, addHeapObject(arg2));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    if (r1) {
      throw takeObject(r0);
    }
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}

function __wasm_bindgen_func_elem_662_3(arg0, arg1, arg2) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_662_3(retptr, arg0, arg1, addHeapObject(arg2));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    if (r1) {
      throw takeObject(r0);
    }
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}

function __wasm_bindgen_func_elem_912(arg0, arg1, arg2, arg3) {
  wasm.__wasm_bindgen_func_elem_912(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}

const __wbindgen_enum_GpuAddressMode = ['clamp-to-edge', 'repeat', 'mirror-repeat'];

const __wbindgen_enum_GpuAutoLayoutMode = ['auto'];

const __wbindgen_enum_GpuBlendFactor = [
  'zero',
  'one',
  'src',
  'one-minus-src',
  'src-alpha',
  'one-minus-src-alpha',
  'dst',
  'one-minus-dst',
  'dst-alpha',
  'one-minus-dst-alpha',
  'src-alpha-saturated',
  'constant',
  'one-minus-constant',
  'src1',
  'one-minus-src1',
  'src1-alpha',
  'one-minus-src1-alpha',
];

const __wbindgen_enum_GpuBlendOperation = ['add', 'subtract', 'reverse-subtract', 'min', 'max'];

const __wbindgen_enum_GpuBufferBindingType = ['uniform', 'storage', 'read-only-storage'];

const __wbindgen_enum_GpuCompareFunction = [
  'never',
  'less',
  'equal',
  'less-equal',
  'greater',
  'not-equal',
  'greater-equal',
  'always',
];

const __wbindgen_enum_GpuCullMode = ['none', 'front', 'back'];

const __wbindgen_enum_GpuFilterMode = ['nearest', 'linear'];

const __wbindgen_enum_GpuFrontFace = ['ccw', 'cw'];

const __wbindgen_enum_GpuIndexFormat = ['uint16', 'uint32'];

const __wbindgen_enum_GpuLoadOp = ['load', 'clear'];

const __wbindgen_enum_GpuMipmapFilterMode = ['nearest', 'linear'];

const __wbindgen_enum_GpuPowerPreference = ['low-power', 'high-performance'];

const __wbindgen_enum_GpuPrimitiveTopology = [
  'point-list',
  'line-list',
  'line-strip',
  'triangle-list',
  'triangle-strip',
];

const __wbindgen_enum_GpuSamplerBindingType = ['filtering', 'non-filtering', 'comparison'];

const __wbindgen_enum_GpuStencilOperation = [
  'keep',
  'zero',
  'replace',
  'invert',
  'increment-clamp',
  'decrement-clamp',
  'increment-wrap',
  'decrement-wrap',
];

const __wbindgen_enum_GpuStorageTextureAccess = ['write-only', 'read-only', 'read-write'];

const __wbindgen_enum_GpuStoreOp = ['store', 'discard'];

const __wbindgen_enum_GpuTextureAspect = ['all', 'stencil-only', 'depth-only'];

const __wbindgen_enum_GpuTextureDimension = ['1d', '2d', '3d'];

const __wbindgen_enum_GpuTextureFormat = [
  'r8unorm',
  'r8snorm',
  'r8uint',
  'r8sint',
  'r16unorm',
  'r16snorm',
  'r16uint',
  'r16sint',
  'r16float',
  'rg8unorm',
  'rg8snorm',
  'rg8uint',
  'rg8sint',
  'r32uint',
  'r32sint',
  'r32float',
  'rg16unorm',
  'rg16snorm',
  'rg16uint',
  'rg16sint',
  'rg16float',
  'rgba8unorm',
  'rgba8unorm-srgb',
  'rgba8snorm',
  'rgba8uint',
  'rgba8sint',
  'bgra8unorm',
  'bgra8unorm-srgb',
  'rgb9e5ufloat',
  'rgb10a2uint',
  'rgb10a2unorm',
  'rg11b10ufloat',
  'rg32uint',
  'rg32sint',
  'rg32float',
  'rgba16unorm',
  'rgba16snorm',
  'rgba16uint',
  'rgba16sint',
  'rgba16float',
  'rgba32uint',
  'rgba32sint',
  'rgba32float',
  'stencil8',
  'depth16unorm',
  'depth24plus',
  'depth24plus-stencil8',
  'depth32float',
  'depth32float-stencil8',
  'bc1-rgba-unorm',
  'bc1-rgba-unorm-srgb',
  'bc2-rgba-unorm',
  'bc2-rgba-unorm-srgb',
  'bc3-rgba-unorm',
  'bc3-rgba-unorm-srgb',
  'bc4-r-unorm',
  'bc4-r-snorm',
  'bc5-rg-unorm',
  'bc5-rg-snorm',
  'bc6h-rgb-ufloat',
  'bc6h-rgb-float',
  'bc7-rgba-unorm',
  'bc7-rgba-unorm-srgb',
  'etc2-rgb8unorm',
  'etc2-rgb8unorm-srgb',
  'etc2-rgb8a1unorm',
  'etc2-rgb8a1unorm-srgb',
  'etc2-rgba8unorm',
  'etc2-rgba8unorm-srgb',
  'eac-r11unorm',
  'eac-r11snorm',
  'eac-rg11unorm',
  'eac-rg11snorm',
  'astc-4x4-unorm',
  'astc-4x4-unorm-srgb',
  'astc-5x4-unorm',
  'astc-5x4-unorm-srgb',
  'astc-5x5-unorm',
  'astc-5x5-unorm-srgb',
  'astc-6x5-unorm',
  'astc-6x5-unorm-srgb',
  'astc-6x6-unorm',
  'astc-6x6-unorm-srgb',
  'astc-8x5-unorm',
  'astc-8x5-unorm-srgb',
  'astc-8x6-unorm',
  'astc-8x6-unorm-srgb',
  'astc-8x8-unorm',
  'astc-8x8-unorm-srgb',
  'astc-10x5-unorm',
  'astc-10x5-unorm-srgb',
  'astc-10x6-unorm',
  'astc-10x6-unorm-srgb',
  'astc-10x8-unorm',
  'astc-10x8-unorm-srgb',
  'astc-10x10-unorm',
  'astc-10x10-unorm-srgb',
  'astc-12x10-unorm',
  'astc-12x10-unorm-srgb',
  'astc-12x12-unorm',
  'astc-12x12-unorm-srgb',
];

const __wbindgen_enum_GpuTextureSampleType = ['float', 'unfilterable-float', 'depth', 'sint', 'uint'];

const __wbindgen_enum_GpuTextureViewDimension = ['1d', '2d', '2d-array', 'cube', 'cube-array', '3d'];

const __wbindgen_enum_GpuVertexFormat = [
  'uint8',
  'uint8x2',
  'uint8x4',
  'sint8',
  'sint8x2',
  'sint8x4',
  'unorm8',
  'unorm8x2',
  'unorm8x4',
  'snorm8',
  'snorm8x2',
  'snorm8x4',
  'uint16',
  'uint16x2',
  'uint16x4',
  'sint16',
  'sint16x2',
  'sint16x4',
  'unorm16',
  'unorm16x2',
  'unorm16x4',
  'snorm16',
  'snorm16x2',
  'snorm16x4',
  'float16',
  'float16x2',
  'float16x4',
  'float32',
  'float32x2',
  'float32x3',
  'float32x4',
  'uint32',
  'uint32x2',
  'uint32x3',
  'uint32x4',
  'sint32',
  'sint32x2',
  'sint32x3',
  'sint32x4',
  'unorm10-10-10-2',
  'unorm8x4-bgra',
];

const __wbindgen_enum_GpuVertexStepMode = ['vertex', 'instance'];

function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];

  heap[idx] = obj;
  return idx;
}

const CLOSURE_DTORS =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((state) => wasm.__wbindgen_export4(state.a, state.b));

function debugString(val) {
  // primitive types
  const type = typeof val;
  if (type == 'number' || type == 'boolean' || val == null) {
    return `${val}`;
  }
  if (type == 'string') {
    return `"${val}"`;
  }
  if (type == 'symbol') {
    const description = val.description;
    if (description == null) {
      return 'Symbol';
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == 'function') {
    const name = val.name;
    if (typeof name == 'string' && name.length > 0) {
      return `Function(${name})`;
    } else {
      return 'Function';
    }
  }
  // objects
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = '[';
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ', ' + debugString(val[i]);
    }
    debug += ']';
    return debug;
  }
  // Test for built-in
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    // Failed to match the standard '[object ClassName]'
    return toString.call(val);
  }
  if (className == 'Object') {
    // we're a user defined class or Object
    // JSON.stringify avoids problems with cycles, and is generally much
    // easier than looping through ownProperties of `val`.
    try {
      return 'Object(' + JSON.stringify(val) + ')';
    } catch (_) {
      return 'Object';
    }
  }
  // errors
  if (val instanceof Error) {
    return `${val.name}: ${val.message}\n${val.stack}`;
  }
  // TODO we could test for more things here, like `Set`s and `Map`s.
  return className;
}

function dropObject(idx) {
  if (idx < 1028) return;
  heap[idx] = heap_next;
  heap_next = idx;
}

function getArrayJsValueViewFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  const mem = getDataViewMemory0();
  const result = [];
  for (let i = ptr; i < ptr + 4 * len; i += 4) {
    result.push(getObject(mem.getUint32(i, true)));
  }
  return result;
}

function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (
    cachedDataViewMemory0 === null ||
    cachedDataViewMemory0.buffer.detached === true ||
    (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)
  ) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
  return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}

function getObject(idx) {
  return heap[idx];
}

function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_export3(addHeapObject(e));
  }
}

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
  return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
  const state = { a: arg0, b: arg1, cnt: 1 };
  const real = (...args) => {
    // First up with a closure we increment the internal reference
    // count. This ensures that the Rust closure environment won't
    // be deallocated while we're invoking it.
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      state.a = a;
      real._wbg_cb_unref();
    }
  };
  real._wbg_cb_unref = () => {
    if (--state.cnt === 0) {
      wasm.__wbindgen_export4(state.a, state.b);
      state.a = 0;
      CLOSURE_DTORS.unregister(state);
    }
  };
  CLOSURE_DTORS.register(real, state, state);
  return real;
}

function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }

  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;

  const mem = getUint8ArrayMemory0();

  let offset = 0;

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7f) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder.encodeInto(arg, view);

    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }

  WASM_VECTOR_LEN = offset;
  return ptr;
}

function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length,
    };
  };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
  wasmInstance = instance;
  wasm = instance.exports;
  wasmModule = module;
  cachedDataViewMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  return wasm;
}

async function __wbg_load(module, imports) {
  if (typeof Response === 'function' && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && expectedResponseType(module.type);

        if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
          console.warn(
            '`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n',
            e,
          );
        } else {
          throw e;
        }
      }
    }

    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);

    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }

  function expectedResponseType(type) {
    switch (type) {
      case 'basic':
      case 'cors':
      case 'default':
        return true;
    }
    return false;
  }
}

function initSync(module) {
  if (wasm !== undefined) return wasm;

  if (module !== undefined) {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ({ module } = module);
    } else {
      console.warn('using deprecated parameters for `initSync()`; pass a single object instead');
    }
  }

  const imports = __wbg_get_imports();
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
  if (wasm !== undefined) return wasm;

  if (module_or_path !== undefined) {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn('using deprecated parameters for the initialization function; pass a single object instead');
    }
  }

  if (module_or_path === undefined) {
    module_or_path = new URL('render_wasm_bg.wasm', import.meta.url);
  }
  const imports = __wbg_get_imports();

  if (
    typeof module_or_path === 'string' ||
    (typeof Request === 'function' && module_or_path instanceof Request) ||
    (typeof URL === 'function' && module_or_path instanceof URL)
  ) {
    module_or_path = fetch(module_or_path);
  }

  const { instance, module } = await __wbg_load(await module_or_path, imports);

  return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
