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
#   GEOSPEC_OCCT_ARCHIVE  Verified archive materialized by prepare-delivery.py.
#   GEOSPEC_GIT           Exact Git executable selected by preparation (default: git).
#
# Usage:
#   packages/geospec-engine-native/native/occt/build-occt.sh
#   Additional arguments are selected CMake options (mixed toolchain/profile).
#
# Exit codes:
#   0  Static OCCT prefix built and installed.
#   1  Source/hash/configuration/build validation failed.
#   3  Required build tool is unavailable.

set -euo pipefail

REPO_ROOT=""
if [[ -z "${GEOSPEC_OCCT_SOURCE:-}" || -z "${GEOSPEC_OCCT_ARCHIVE:-}" || -z "${GEOSPEC_OCCT_CACHE:-}" ]]; then
  git_tool="${GEOSPEC_GIT:-git}"
  command -v "${git_tool}" >/dev/null || { printf 'ERROR: %s is required\n' "${git_tool}" >&2; exit 3; }
  REPO_ROOT="$("${git_tool}" rev-parse --show-toplevel)"
fi
GEOSPEC_OCCT_SOURCE="${GEOSPEC_OCCT_SOURCE:-${REPO_ROOT}/node_modules/.cache/geospec-engine-native/sources/occt}"
GEOSPEC_OCCT_CACHE="${GEOSPEC_OCCT_CACHE:-${REPO_ROOT}/node_modules/.cache/geospec-engine-native/occt}"
GEOSPEC_OCCT_JOBS="${GEOSPEC_OCCT_JOBS:-$(sysctl -n hw.logicalcpu 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || printf '1')}"
archive="${GEOSPEC_OCCT_ARCHIVE:-${REPO_ROOT}/node_modules/.cache/geospec-engine-native/sources/occt-3d097a0328e71b826377d4814ab05ec3c3d23871.tar.gz}"
expected_archive_hash="ac47dc1cd2404ff40678d4f64910894df79b689f14e1a584a5705cfe76df2ad3"
build_dir="${GEOSPEC_OCCT_CACHE}/build"
install_dir="${GEOSPEC_OCCT_CACHE}/install"
build_source="${GEOSPEC_OCCT_CACHE}/patched-source"
patch_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/shape-fix-outer-edge.patch"
expected_patch_hash="e01565c2c9569c4dd8e2f849ac98987f4e0e74d142035c85c3ba1e1a97cb4279"
expected_patched_source_hash="5b259d58f50501568cba43b931afa67f8ecf531d1ecfe93d559e294f8d33f8ba"
stepcaf_patch_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/stepcaf-early-assembly.patch"
expected_stepcaf_patch_hash="0c0f128fcdf169c4cbf478bf6017e123bf4e246d7fd4889c4a64446dc740a491"
expected_stepcaf_source_hash="778a56e3a4f6b0d479116fd7dd885119d5584bfb932b476f170c429a02a4d8f6"
sharings_patch_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/step-assembly-sharings.patch"
expected_sharings_patch_hash="cb6393aad502bcfc6d39c01fa17dc533ba0e15f4a82a3c25e797fe7c96a055c5"
expected_sharings_assembly_hash="9d81709657351cd7d4768d928d9501bc1e7b9058b80fdac8d04cb9b38731cc92"
expected_sharings_actor_hash="f75f55b9ab11b8bcbaed82204519de6f34c2ff1ba9ca9ab33bc5a0d096e0d0fd"
gauss_patch_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/brepgprop-gauss-direct-arith.patch"
expected_gauss_patch_hash="7ceabdea39bc8b8e8bed213e11f10e47a6c91a43cc14fe40041ffe20ac82f8ae"
expected_gauss_header_hash="4ecd38a526d70a619b3972fede4df86ceb9a9eb7f3633877d0f357aec6d15213"
expected_gauss_source_hash="4de191aa1426665ae3d57409c02341b24ef3c80acc01ad37e2fc6fbad3fb8aa3"
edge_check_patch_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/step-edge-curve-check-sharing.patch"
expected_edge_check_patch_hash="86ed044bdfccd9facd56695d9492e6db85cb5b83b9cd6e25b4f09a7a5a98efe3"
expected_edge_check_source_hash="055ae30f6718f0f2aeffd3dfa0c8b8c9d99a8eb35c8c27aad70484e9a5fdf244"

for tool in cmake diff find ninja patch shasum tar; do
  command -v "${tool}" >/dev/null || { printf 'ERROR: %s is required\n' "${tool}" >&2; exit 3; }
done
if [[ -d "${GEOSPEC_OCCT_CACHE}" && -n "$(find "${GEOSPEC_OCCT_CACHE}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  printf 'ERROR: OCCT cache must be a fresh empty attempt: %s\n' "${GEOSPEC_OCCT_CACHE}" >&2
  exit 1
fi
mkdir -p "${GEOSPEC_OCCT_CACHE}"
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

[[ -f "${patch_file}" ]] || { printf 'ERROR: OCCT patch is missing: %s\n' "${patch_file}" >&2; exit 1; }
actual_patch_hash="$(shasum -a 256 "${patch_file}" | awk '{print $1}')"
[[ "${actual_patch_hash}" == "${expected_patch_hash}" ]] || {
  printf 'ERROR: OCCT patch hash mismatch: %s\n' "${actual_patch_hash}" >&2
  exit 1
}
mkdir -p "${build_source}"
tar -xzf "${archive}" --strip-components=1 -C "${build_source}"
patch -t -F 0 -p1 -d "${build_source}" -i "${patch_file}"
patched_source="${build_source}/src/ModelingAlgorithms/TKShHealing/ShapeFix/ShapeFix_IntersectionTool.cxx"
actual_patched_source_hash="$(shasum -a 256 "${patched_source}" | awk '{print $1}')"
[[ "${actual_patched_source_hash}" == "${expected_patched_source_hash}" ]] || {
  printf 'ERROR: patched OCCT source hash mismatch: %s\n' "${actual_patched_source_hash}" >&2
  exit 1
}
printf '✓ OCCT patch %s applied to fresh verified source\n' "${expected_patch_hash}"

[[ -f "${stepcaf_patch_file}" ]] || { printf 'ERROR: STEPCAF patch is missing: %s\n' "${stepcaf_patch_file}" >&2; exit 1; }
actual_stepcaf_patch_hash="$(shasum -a 256 "${stepcaf_patch_file}" | awk '{print $1}')"
[[ "${actual_stepcaf_patch_hash}" == "${expected_stepcaf_patch_hash}" ]] || {
  printf 'ERROR: STEPCAF patch hash mismatch: %s\n' "${actual_stepcaf_patch_hash}" >&2
  exit 1
}
patch -t -F 0 -p1 -d "${build_source}" -i "${stepcaf_patch_file}"
stepcaf_source="${build_source}/src/DataExchange/TKDESTEP/STEPCAFControl/STEPCAFControl_Reader.cxx"
actual_stepcaf_source_hash="$(shasum -a 256 "${stepcaf_source}" | awk '{print $1}')"
[[ "${actual_stepcaf_source_hash}" == "${expected_stepcaf_source_hash}" ]] || {
  printf 'ERROR: patched STEPCAF source hash mismatch: %s\n' "${actual_stepcaf_source_hash}" >&2
  exit 1
}
printf '✓ STEPCAF patch %s applied after B2a to fresh verified source\n' "${expected_stepcaf_patch_hash}"

[[ -f "${sharings_patch_file}" ]] || { printf 'ERROR: STEP sharings patch is missing: %s\n' "${sharings_patch_file}" >&2; exit 1; }
actual_sharings_patch_hash="$(shasum -a 256 "${sharings_patch_file}" | awk '{print $1}')"
[[ "${actual_sharings_patch_hash}" == "${expected_sharings_patch_hash}" ]] || {
  printf 'ERROR: STEP sharings patch hash mismatch: %s\n' "${actual_sharings_patch_hash}" >&2
  exit 1
}
patch -t -F 0 -p1 -d "${build_source}" -i "${sharings_patch_file}"
sharings_assembly_source="${build_source}/src/DataExchange/TKDESTEP/STEPConstruct/STEPConstruct_Assembly.cxx"
sharings_actor_source="${build_source}/src/DataExchange/TKDESTEP/STEPControl/STEPControl_ActorRead.cxx"
actual_sharings_assembly_hash="$(shasum -a 256 "${sharings_assembly_source}" | awk '{print $1}')"
actual_sharings_actor_hash="$(shasum -a 256 "${sharings_actor_source}" | awk '{print $1}')"
[[ "${actual_sharings_assembly_hash}" == "${expected_sharings_assembly_hash}" &&
  "${actual_sharings_actor_hash}" == "${expected_sharings_actor_hash}" ]] || {
  printf 'ERROR: patched STEP sharings source hash mismatch: %s %s\n' \
    "${actual_sharings_assembly_hash}" "${actual_sharings_actor_hash}" >&2
  exit 1
}
printf '✓ STEP sharings patch %s applied after B2b to fresh verified source\n' "${expected_sharings_patch_hash}"

[[ -f "${gauss_patch_file}" ]] || { printf 'ERROR: BRepGProp_Gauss patch is missing: %s\n' "${gauss_patch_file}" >&2; exit 1; }
actual_gauss_patch_hash="$(shasum -a 256 "${gauss_patch_file}" | awk '{print $1}')"
[[ "${actual_gauss_patch_hash}" == "${expected_gauss_patch_hash}" ]] || {
  printf 'ERROR: BRepGProp_Gauss patch hash mismatch: %s\n' "${actual_gauss_patch_hash}" >&2
  exit 1
}
patch -t -F 0 -p1 -d "${build_source}" -i "${gauss_patch_file}"
gauss_header_source="${build_source}/src/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Gauss.hxx"
gauss_source="${build_source}/src/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Gauss.cxx"
actual_gauss_header_hash="$(shasum -a 256 "${gauss_header_source}" | awk '{print $1}')"
actual_gauss_source_hash="$(shasum -a 256 "${gauss_source}" | awk '{print $1}')"
[[ "${actual_gauss_header_hash}" == "${expected_gauss_header_hash}" &&
  "${actual_gauss_source_hash}" == "${expected_gauss_source_hash}" ]] || {
  printf 'ERROR: patched BRepGProp_Gauss source hash mismatch: %s %s\n' \
    "${actual_gauss_header_hash}" "${actual_gauss_source_hash}" >&2
  exit 1
}
printf '✓ BRepGProp_Gauss patch %s applied after P1c to fresh verified source\n' "${expected_gauss_patch_hash}"

[[ -f "${edge_check_patch_file}" ]] || { printf 'ERROR: STEP edge-check patch is missing: %s\n' "${edge_check_patch_file}" >&2; exit 1; }
actual_edge_check_patch_hash="$(shasum -a 256 "${edge_check_patch_file}" | awk '{print $1}')"
[[ "${actual_edge_check_patch_hash}" == "${expected_edge_check_patch_hash}" ]] || {
  printf 'ERROR: STEP edge-check patch hash mismatch: %s\n' "${actual_edge_check_patch_hash}" >&2
  exit 1
}
patch -t -F 0 -p1 -d "${build_source}" -i "${edge_check_patch_file}"
edge_check_source="${build_source}/src/DataExchange/TKDESTEP/RWStepShape/RWStepShape_RWEdgeCurve.cxx"
actual_edge_check_source_hash="$(shasum -a 256 "${edge_check_source}" | awk '{print $1}')"
[[ "${actual_edge_check_source_hash}" == "${expected_edge_check_source_hash}" ]] || {
  printf 'ERROR: patched STEP edge-check source hash mismatch: %s\n' "${actual_edge_check_source_hash}" >&2
  exit 1
}
printf '✓ STEP edge-check patch %s applied after Gauss to fresh verified source\n' "${expected_edge_check_patch_hash}"

printf '%s\n' '→ configuring exact OCCT TKDESTEP static closure'
cmake -S "${build_source}" -B "${build_dir}" -G Ninja \
  -DGEOSPEC_OCCT_PATCH_SHA256:STRING="${expected_patch_hash}" \
  -DGEOSPEC_OCCT_STEPCAF_PATCH_SHA256:STRING="${expected_stepcaf_patch_hash}" \
  -DGEOSPEC_OCCT_STEP_SHARINGS_PATCH_SHA256:STRING="${expected_sharings_patch_hash}" \
  -DGEOSPEC_OCCT_GAUSS_PATCH_SHA256:STRING="${expected_gauss_patch_hash}" \
  -DGEOSPEC_OCCT_STEP_EDGE_CHECK_PATCH_SHA256:STRING="${expected_edge_check_patch_hash}" \
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
  -DUSE_OPENGL=OFF "$@"

printf '%s\n' '→ building and installing exact OCCT TKDESTEP static closure'
cmake --build "${build_dir}" --target install --parallel "${GEOSPEC_OCCT_JOBS}"

config="${install_dir}/lib/cmake/opencascade/OpenCASCADEConfig.cmake"
[[ -f "${config}" && -f "${install_dir}/lib/libTKDESTEP.a" ]] || {
  printf '%s\n' 'ERROR: installed OCCT prefix lacks TKDESTEP or its CMake contract' >&2
  exit 1
}
(
  cd "${install_dir}"
  find lib -maxdepth 1 -type f -name 'libTK*.a' -print | sort
) > "${GEOSPEC_OCCT_CACHE}/static-toolkit-closure.txt"
printf '✓ OCCT static prefix: %s\n' "${install_dir}"
