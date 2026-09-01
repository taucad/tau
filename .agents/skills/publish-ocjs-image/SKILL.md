---
name: publish-ocjs-image
description: Publish the @taucad/opencascade.js Docker image to GitHub Container Registry (ghcr.io/taucad/opencascade.js) by cutting an annotated git tag on the taucad fork; GitHub Actions builds linux/amd64 + linux/arm64 natively and pushes a multi-arch manifest list. Use when releasing a new ocjs container image, cutting an ocjs beta tag, refreshing the published opencascade.js image on GHCR, or when the user mentions publishing, releasing, or sharing the opencascade.js Docker image.
disable-model-invocation: true
---

# Publish opencascade.js Docker image to GHCR

Release flow for the `@taucad/opencascade.js` Docker image. The taucad fork at `repos/opencascade.js` is the source of truth; tagged releases publish multi-arch images to `ghcr.io/taucad/opencascade.js` via GitHub Actions.

## Quick Reference

```bash
# Cut a release (validates branch + clean tree, tags, pushes, watches CI)
./scripts/release-ocjs-image.sh v3.0.0-beta.<sha>

# Verify a published image
docker pull ghcr.io/taucad/opencascade.js:beta
docker buildx imagetools inspect ghcr.io/taucad/opencascade.js:beta

# List recent releases
gh release list --repo taucad/opencascade.js
gh api /users/taucad/packages/container/opencascade.js/versions --jq '.[].metadata.container.tags'
```

## Prerequisites

| Requirement                                                        | Check                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `gh` CLI authenticated with `repo` + `workflow` scopes             | `gh auth status`                                                          |
| `repos/opencascade.js` checked out at the release branch           | `git -C repos/opencascade.js symbolic-ref --short HEAD`                   |
| Working tree clean                                                 | `git -C repos/opencascade.js status`                                      |
| First-time only: GHCR package visibility set to public (see below) | `gh api /users/taucad/packages/container/opencascade.js --jq .visibility` |

## Release flow

1. **Pick the version.** Read the current `version` in [repos/opencascade.js/package.json](../../repos/opencascade.js/package.json) and bump if needed. Prerelease tags follow `v3.0.0-beta.<short-sha>`.

2. **Commit any pending changes** on `occt-v8-emscripten-5` (or set `OCJS_RELEASE_BRANCH`). The script refuses to tag a dirty tree.

3. **Run the release helper:**

   ```bash
   ./scripts/release-ocjs-image.sh v3.0.0-beta.d3056ef
   ```

   The script (see [scripts/release-ocjs-image.sh](../../scripts/release-ocjs-image.sh)) validates inputs, cuts an annotated tag, pushes it to `origin`, locates the triggered `docker.yml` workflow run, and watches it to completion via `gh run watch --exit-status`.

4. **Verify the published image:**

   ```bash
   docker pull ghcr.io/taucad/opencascade.js:${TAG#v}
   docker buildx imagetools inspect ghcr.io/taucad/opencascade.js:${TAG#v}
   # → should list two manifests: linux/amd64 + linux/arm64
   ```

5. **Optional smoke run** against the published image (no local build needed). Use a folder under your home directory for `-v` — `/tmp` is not shared into the Docker VM on macOS/Windows under Colima or Docker Desktop, so outputs would silently land inside the VM:

   ```bash
   mkdir -p "$PWD/ocjs-smoke"
   docker run --rm \
     -e OCJS_CONFIG=O0-debug \
     -v "$PWD/repos/opencascade.js/build-configs/link-filter-poc.yml:/src/config.yml:ro" \
     -v "$PWD/ocjs-smoke:/output" \
     ghcr.io/taucad/opencascade.js:${TAG#v} full /src/config.yml
   ls "$PWD/ocjs-smoke"/opencascade_linkfilter_poc.{wasm,js,d.ts}
   ```

   The entrypoint prints an `[output] /output -> <path>  (your computer, files will be saved)` line at the top of every build, so you can sanity-check the bind-mount before the long-running steps start.

## First-time setup (one-shot)

After the first successful publish, the GHCR package is created **private** by default. Flip it to public so external consumers can `docker pull` without authentication:

```bash
# Via gh API (user-namespaced package)
gh api -X PATCH /user/packages/container/opencascade.js \
  -f visibility=public

# Or via web UI:
# https://github.com/users/taucad/packages/container/opencascade.js/settings
# → "Change visibility" → Public
```

Also link the package to the repository so the GHCR page surfaces a "Source" link:

```bash
# Settings → Manage Actions access → grant write access to taucad/opencascade.js
gh api -X PUT /user/packages/container/opencascade.js/repository \
  -f repository=taucad/opencascade.js 2>/dev/null || true
```

## Tag strategy

`docker/metadata-action` in [repos/opencascade.js/.github/workflows/docker.yml](../../repos/opencascade.js/.github/workflows/docker.yml) derives the published tags from the git tag:

| Tag                | Source rule                                              | Example                    |
| ------------------ | -------------------------------------------------------- | -------------------------- |
| `:<version>`       | `type=semver,pattern={{version}}`                        | `:3.0.0-beta.d3056ef`      |
| `:<major>.<minor>` | `type=semver,pattern={{major}}.{{minor}}`                | `:3.0`                     |
| `:sha-<short>`     | `type=sha,prefix=sha-,format=short`                      | `:sha-d3056ef`             |
| `:beta`            | `type=raw,value=beta,enable=<git tag contains '-beta.'>` | `:beta` (prereleases only) |

`:latest` is reserved for the first stable `v3.0.0` (no prerelease suffix) — add the `type=raw,value=latest,enable=<no -beta. in tag>` rule when ready.

## Troubleshooting

| Problem                                                      | Fix                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-ocjs-image.sh`: "no '<workflow>' run found for tag" | GitHub took longer than 5s to register the run. Find it manually: `gh run list --repo taucad/opencascade.js --workflow docker.yml --event push` and `gh run watch <id>`.                                                                     |
| `publish-platform (linux/arm64)`: "no runner matching"       | Confirm `taucad/opencascade.js` is public — GitHub-hosted arm64 runners are free for public repos only. Otherwise switch the matrix entry to `ubuntu-latest` with `--platform linux/arm64` + QEMU (slow, and may hit the libclang segfault). |
| `publish-manifest`: "image not found" for a digest           | One of the platform jobs silently produced no digest. Re-run the failed `publish-platform` job from the Actions UI.                                                                                                                          |
| `docker pull`: "denied"                                      | Package visibility is still private — see "First-time setup".                                                                                                                                                                                |
| `manifest unknown` after tag push                            | Manifest job hadn't finished when you pulled. `gh run watch` should have caught this; re-pull after the run finishes.                                                                                                                        |
| Need to delete a bad tag                                     | `git -C repos/opencascade.js push --delete origin <tag> && git -C repos/opencascade.js tag -d <tag>`. To delete the published GHCR version: `gh api -X DELETE /user/packages/container/opencascade.js/versions/<version-id>`.                |

## Additional Resources

- [Dockerfile (with OCI labels)](../../repos/opencascade.js/Dockerfile)
- [GitHub Actions workflow](../../repos/opencascade.js/.github/workflows/docker.yml)
- [Release helper script](../../scripts/release-ocjs-image.sh)
- [GHCR docs — publishing images](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [docker/metadata-action tag patterns](https://github.com/docker/metadata-action#tags-input)
