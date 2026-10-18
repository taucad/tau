# @taucad/native-kernels

The roster of native Tau kernels: adopters, plugin manifests and host-neutral payload-store composition

## Entries

| Subpath                           | Audience                                      | Holds                                                                                                                         |
| --------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@taucad/native-kernels`          | Every host and its worker or runtime child    | `nativeKernelAdopters` (membership and order), `nativeCompositionSchema`, the stand-in for kernels that cannot run, the types |
| `@taucad/native-kernels/manifest` | Bundled hosts, such as a desktop main process | Each package's `tau-plugin.json`, imported statically                                                                         |
| `@taucad/native-kernels/node`     | Node hosts that own a payload store           | The preparation roster, composition from the store, plugin loading, the closure re-verifier and the preparation host          |

The caller passes the payload store and the managed profile, so nothing here imports a host product package.
