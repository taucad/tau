# PicoGK hosted support and ownership

This reference describes the current Tau worker and native viewer behavior. The generated source declarations preserve compiler accessibility and existing names/defaults. CAD programs use Library.Go, Library.oViewer, normal geometry owners, Add, group appearance and transforms. Embedding/native references cover host registration, ILibraryHost, IViewerBackend and raw handles. Protected members require a suitable derived type.

| Method / value | Tau hosted behavior | Native / ownership contract |
| --- | --- | --- |
| Viewer.Add(Voxels/Mesh/PolyLine, name, nGroupID) and unnamed Add | Owns coherent geometry before return; repeated same object replaces its scene entry. Later mutation needs another Add. | Native viewers capture geometry before return; queued operations own captured data until processing or teardown. New author geometry is disposable. |
| Viewer.SetGroupMaterial(groupId, material) | Synchronously snapshots descriptor/image bytes. Null throws ArgumentNullException; invalid content raises worker CS_TAU_RUNTIME with group/property path. | Unhosted typed material throws NotSupportedException. Legacy SetGroupMaterial(nGroupID, clr, fMetallic, fRoughness) remains available. |
| Viewer.SetMechanism(source) | Snapshots supported JSON-equivalent values, accepts PascalCase or canonical names for known structural C# properties, preserving exact dictionary keys and raw JSON, uses numeric CLR enums; getters run. JsonPropertyName and JsonIgnore are honored; fields are ignored. Projection failure clears metadata and reports CS_TAU_MECHANISM_SERIALIZATION warning while preserving geometry; cancellation/allocation failure propagates. | Unhosted calls throw NotSupportedException. |
| RequestScreenShot | No-op. | Native screenshot behavior uses the native window backend. |
| EnableExperimental, EnableOverhangWarning/DisableOverhangWarning, ZoomToFit, qOrientation | Unsupported worker capability issue. | Native backend owns viewport capabilities. |
| Library.oLibrary(), Library.oViewer(), wrapper lib | Borrowed current-run owners; use within the task and leave registration/disposal to the host. | Borrowed lifetime remains owner-bound. |
| field.oMetaData() | Borrowed field metadata; the field disposes it. | Keep metadata within the field lifetime. |
| Geometry constructors, oDuplicate/voxDuplicate and allocating geometry helpers | Returned native geometry is owned and disposable; mutators change the receiver and copies preserve source geometry. | Follow library affinity. Ordinary in parameters pass a mutable object reference. |
| MaterialImage and record with copies | Descriptor copies share the mutable byte[] until SetGroupMaterial owns its byte snapshot. Data is required and init-only. Omitted Format defaults to Auto=-1 and infers PNG/JPEG/WebP from fully validated encoded bytes; an explicit format must match. Existing values remain Png=0/Jpeg=1/WebP=2. | Required/init and nullable properties are shown in generated declarations. Record equality does not compare array content. |

## Params

Only a global public static Params class opts in. Supported public static read/write auto-properties use bool/int/float/double/string or a project enum, with finite non-null compile-time initializers. Nullable annotations do not permit a null runtime value. Fields, methods and namespaced/nonpublic Params classes do not opt in. Getter-only, private/custom setters, nullable value types, null/nonconstant defaults and explicit static constructors reject with source-located CS_TAU_PARAMETERS.

Range uses its two-numeric-argument constructor; Range(Type,string,string) is unsupported. Display consumes literal Name, Description and Order; ResourceType and other named arguments are ignored; resource-backed display text is not resolved. Enum names are case-sensitive; aliases map a numeric default to its first matching named value and undeclared Flags combinations need an explicitly declared name. Each execution resets omitted values to standalone defaults. Parameters and constant defaults do not imply purity of user code/getters/callbacks.

## Source owners

- Managed Viewer/Viewer.cs, Library/LibraryGlobal.cs, Base/FieldMetadata.cs, Material.cs and Internals/Interop.cs.
- Worker HostedLibraryHost.cs: EnqueueGeometry/SnapshotGeometry, SetMechanism/ProjectMechanism, RequestScreenShot and UnsupportedCapability.
- Worker MaterialCapture.cs: Snapshot/Invalid/Texture and captured-byte ownership.
- Worker CompilationService.cs: parameter discovery/defaults/attributes/binding; ModelRunner.cs: omitted-value reset and issue translation.

The compiler crosswalk and executed geometry/lifetime receipts belong to the owning blueprint evidence. This reference does not promise a uniform ObjectDisposedException from every legacy upstream method.
