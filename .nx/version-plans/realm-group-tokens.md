---
runtime: major
replicad: major
opencascade: major
---

`services.realm.hold` takes a typed group token instead of a string, so a hold returns exactly the type its backend declares and the realm registry needs no cast. Declare each realm-shared backend once at module scope with `createRealmGroup<Value>(name)` from `@taucad/runtime/kernel` and pass it as `group`; the hold input is now the named `RealmHoldInput<Value>`, and `RealmGroup` and `RealmHoldInput` are exported from `@taucad/runtime/kernel` and `@taucad/runtime/types`.

Breaking: `group` is a `RealmGroup<Value>`, not a string, and `hold`'s type argument comes from the token. A second token with a held name, such as one from a duplicate copy of a kernel package, is refused instead of sharing the instance. The realm's shared state is stamped with `runtimePluginAbiVersion`, and a token or realm state from a runtime copy of another plugin ABI is refused. Every `KERNEL_REALM_CONFLICT` now carries `details.reason`: `'build'` for another build of a held group, `'declaration'` and `'runtime'` for the new refusals.

`@taucad/replicad` and `@taucad/opencascade` hold their OpenCASCADE instances through module-local tokens; their behaviour is unchanged.
