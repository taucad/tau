# libcascade — CreateInstanceOptions

1 top-level symbols. Signatures are verbatim typescript.

CreateInstanceOptions: InitOpenCascadeOptions & {
/\*\*

- Variant to load. Omitted, the most capable variant the host supports is
- selected (see the `./init` entry for the capability probes).
  \*/
  variant?: LibcascadeVariant;
  /\*\*
- Size of OCCT's default thread pool for a threads variant. Omitted, OCCT
- sizes the pool itself and the launch cap is raised to match it.
  \*/
  threadCount?: number;
  }
