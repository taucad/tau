#!/usr/bin/env bash
#
# Build the exact GeoSpec OCCT TKDESTEP static closure into the workspace cache.
#
# The selected archive and extracted source are immutable inputs recorded by
# native/occt/source-manifest.json. Generated files stay under node_modules/.cache.
#
# Optional env vars:
#   GEOSPEC_OCCT_SOURCE   Extracted exact-pin OCCT source directory.
#   GEOSPEC_OCCT_CACHE    Build/install cache directory.
#   GEOSPEC_OCCT_JOBS     Parallel build jobs (default: logical CPU count).
#
# Usage:
#   packages/geospec-engine-native/native/occt/build-occt.sh
#
# Exit codes:
#   0  Static OCCT prefix built and installed.
#   1  Source/hash/configuration/build validation failed.
#   3  Required build tool is unavailable.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
GEOSPEC_OCCT_SOURCE="${GEOSPEC_OCCT_SOURCE:-${REPO_ROOT}/node_modules/.cache/geospec-engine-native/sources/occt}"
GEOSPEC_OCCT_CACHE="${GEOSPEC_OCCT_CACHE:-${REPO_ROOT}/node_modules/.cache/geospec-engine-native/occt}"
GEOSPEC_OCCT_JOBS="${GEOSPEC_OCCT_JOBS:-$(sysctl -n hw.logicalcpu 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || printf '1')}"
archive="${REPO_ROOT}/node_modules/.cache/geospec-engine-native/sources/occt-3d097a0328e71b826377d4814ab05ec3c3d23871.tar.gz"
expected_archive_hash="ac47dc1cd2404ff40678d4f64910894df79b689f14e1a584a5705cfe76df2ad3"
build_dir="${GEOSPEC_OCCT_CACHE}/build"
install_dir="${GEOSPEC_OCCT_CACHE}/install"

for tool in cmake diff ninja shasum tar; do
  command -v "${tool}" >/dev/null || { printf 'ERROR: %s is required\n' "${tool}" >&2; exit 3; }
done
[[ -f "${archive}" && -f "${GEOSPEC_OCCT_SOURCE}/CMakeLists.txt" ]] || {
  printf '%s\n' 'ERROR: exact OCCT archive/source cache is missing' >&2
  exit 1
}
actual_archive_hash="$(shasum -a 256 "${archive}" | awk '{print $1}')"
[[ "${actual_archive_hash}" == "${expected_archive_hash}" ]] || {
  printf 'ERROR: OCCT archive hash mismatch: %s\n' "${actual_archive_hash}" >&2
  exit 1
}

verification_source="${GEOSPEC_OCCT_CACHE}/source-verification-${expected_archive_hash}"
verification_staging="${verification_source}.tmp.$$"
source_diff="${GEOSPEC_OCCT_CACHE}/source-archive.diff"
trap 'rm -rf "${verification_staging}"' EXIT
rm -rf "${verification_staging}"
mkdir -p "${verification_staging}"
tar -xzf "${archive}" --strip-components=1 -C "${verification_staging}"
if ! diff -qr "${verification_staging}" "${GEOSPEC_OCCT_SOURCE}" > "${source_diff}"; then
  printf '%s\n' 'ERROR: selected OCCT source differs from the verified archive extraction' >&2
  head -20 "${source_diff}" >&2
  exit 1
fi
if [[ -d "${verification_source}" ]]; then
  chmod -R u+w "${verification_source}"
  rm -rf "${verification_source}"
fi
mv "${verification_staging}" "${verification_source}"
chmod -R a-w "${verification_source}"
trap - EXIT
printf '✓ OCCT source tree matches archive %s\n' "${expected_archive_hash}"

printf '%s\n' '→ configuring exact OCCT TKDESTEP static closure'
cmake -S "${GEOSPEC_OCCT_SOURCE}" -B "${build_dir}" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="${install_dir}" \
  -DINSTALL_DIR="${install_dir}" \
  -DINSTALL_DIR_LAYOUT=Unix \
  -DINSTALL_DIR_WITH_VERSION=OFF \
  -DBUILD_LIBRARY_TYPE=Static \
  -DBUILD_ADDITIONAL_TOOLKITS=TKDESTEP \
  -DBUILD_MODULE_ApplicationFramework=OFF \
  -DBUILD_MODULE_DataExchange=OFF \
  -DBUILD_MODULE_Draw=OFF \
  -DBUILD_MODULE_FoundationClasses=OFF \
  -DBUILD_MODULE_ModelingAlgorithms=OFF \
  -DBUILD_MODULE_ModelingData=OFF \
  -DBUILD_MODULE_Visualization=OFF \
  -DBUILD_DOC_Overview=OFF \
  -DBUILD_DOC_RefMan=OFF \
  -DINSTALL_TEST_CASES=OFF \
  -DUSE_GIT_HASH=OFF \
  -DUSE_TCL=OFF \
  -DUSE_TK=OFF \
  -DUSE_FREETYPE=OFF \
  -DUSE_OPENGL=OFF

printf '%s\n' '→ building and installing exact OCCT TKDESTEP static closure'
cmake --build "${build_dir}" --target install --parallel "${GEOSPEC_OCCT_JOBS}"

config="${install_dir}/lib/cmake/opencascade/OpenCASCADEConfig.cmake"
[[ -f "${config}" && -f "${install_dir}/lib/libTKDESTEP.a" ]] || {
  printf '%s\n' 'ERROR: installed OCCT prefix lacks TKDESTEP or its CMake contract' >&2
  exit 1
}
find "${install_dir}/lib" -maxdepth 1 -type f -name 'libTK*.a' -print | sort \
  > "${GEOSPEC_OCCT_CACHE}/static-toolkit-closure.txt"
printf '✓ OCCT static prefix: %s\n' "${install_dir}"
