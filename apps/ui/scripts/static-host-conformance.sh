#!/usr/bin/env bash
#
# Check that a static host serves the Tau UI the way the browser needs it (charter D26, W19).
#
# The UI runs kernels in workers on SharedArrayBuffer and WebAssembly, which the browser allows only on a
# cross-origin-isolated page. A host that copies the static build must therefore answer the document, the JS chunks,
# the WASM modules and the worker scripts with the four isolation headers, and WASM with `application/wasm` (or
# streaming compilation refuses it). This script requests one of each from a running host and checks:
#
#   Cross-Origin-Opener-Policy: same-origin
#   Cross-Origin-Embedder-Policy: require-corp
#   Cross-Origin-Resource-Policy: same-origin
#   X-Content-Type-Options: nosniff
#   Content-Type: text/html (document), a JavaScript type (chunk, worker), application/wasm (WASM)
#
# Resources are discovered from the host: the asset receipt at `/tau-asset-receipt.json` when the build ships one,
# otherwise the document's script references and the chunks they load. Override discovery with the variables below.
# The handbook runbook is docs/handbooks/cloud/operate/static-host-conformance.md.
#
# Optional env vars:
#   DOCUMENT_PATH  Path of the HTML document to request (default: /)
#   CHUNK_PATH     Path of a JS chunk (default: discovered)
#   WASM_PATH      Path of a WASM module (default: discovered)
#   WORKER_PATH    Path of a worker script (default: discovered)
#   SCAN_LIMIT     Chunks read while discovering WASM and worker paths (default: 400)
#
# Usage:
#   apps/ui/scripts/static-host-conformance.sh https://taucad-prod-us.netlify.app
#   WASM_PATH=/assets/kernel-abc.wasm apps/ui/scripts/static-host-conformance.sh http://127.0.0.1:8080
#
# Exit codes:
#   0  Every resource carries every header and the right content type
#   1  A header or content type is missing or wrong, a resource did not answer 200, or a kind was not found
#   2  Usage
#   3  Missing dependency

set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^https?:// ]]; then
  echo "Usage: $0 <base-url>" >&2
  exit 2
fi
command -v curl >/dev/null || {
  echo "ERROR: curl required" >&2
  exit 3
}

base="${1%/}"
scan_limit="${SCAN_LIMIT:-400}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# fetch <path> <body-file>: GET one path, headers to <body-file>.headers; prints the status code.
# A transport failure prints curl's reason on stderr and status 000, so it is reported rather than ending the run.
fetch() {
  : >"$2"
  : >"$2.headers"
  curl --silent --show-error --location --max-time 60 --compressed \
    --dump-header "$2.headers" --output "$2" --write-out '%{http_code}' "$base$1" || true
}

# header <headers-file> <name>: value of the last response's header, lower-cased name, trimmed.
header() {
  awk -v name="$2" '
    /^HTTP\// { value = "" }
    {
      split($0, parts, ":")
      if (tolower(parts[1]) == name) {
        sub(/^[^:]*:[ \t]*/, "")
        sub(/\r$/, "")
        value = $0
      }
    }
    END { print value }
  ' "$1"
}

document_path="${DOCUMENT_PATH:-/}"
chunk_path="${CHUNK_PATH:-}"
wasm_path="${WASM_PATH:-}"
worker_path="${WORKER_PATH:-}"

document_code="$(fetch "$document_path" "$work/document")"

# Discovery 1: the build's asset receipt lists every emitted file. A host that answers every path with the SPA shell
# answers 200 here too, so the body must be the receipt.
first() { grep -E "$1" | grep -viE "$2" | sed -n '1s|^/*|/|p' || true; }
if [[ -z "$chunk_path" || -z "$wasm_path" || -z "$worker_path" ]] &&
  [[ "$(fetch /tau-asset-receipt.json "$work/receipt")" == 200 ]] &&
  grep -q 'tau-ui-asset-receipt-v1' "$work/receipt"; then
  listed="$(grep -oE '"path"[[:space:]]*:[[:space:]]*"[^"]+"' "$work/receipt" | sed -E 's/.*"([^"]+)"$/\1/' || true)"
  [[ -n "$chunk_path" ]] || chunk_path="$(first '\.m?js$' 'worker' <<<"$listed")"
  [[ -n "$wasm_path" ]] || wasm_path="$(first '\.wasm$' '^$' <<<"$listed")"
  [[ -n "$worker_path" ]] || worker_path="$(first '\.worker(-[A-Za-z0-9_-]+)?\.m?js$' '^$' <<<"$listed")"
fi

# Discovery 2: the document's script references, then the chunks they reference.
# references <file>: root-relative `/assets/…` paths the file names. A built chunk also names its siblings by bare
# file name (`new URL("kernel-abc.wasm", import.meta.url)`, `import("./chunk-def.js")`), which resolve beside it.
references() {
  {
    grep -oE '(/|\./|\.\./)?assets/[A-Za-z0-9._@~-]+\.(m?js|wasm)' "$1" | sed -E 's#^(\./|\.\./)?/?#/#' || true
    grep -oE '["'"'"'`](\./)?[A-Za-z0-9._@~-]+\.(m?js|wasm)["'"'"'`]' "$1" | sed -E 's#^.(\./)?#/assets/#; s#.$##' || true
  } | sort -u
}
if [[ -z "$chunk_path" || -z "$wasm_path" || -z "$worker_path" ]]; then
  references "$work/document" >"$work/queue"
  [[ -n "$chunk_path" ]] || chunk_path="$(grep -E '\.m?js$' "$work/queue" | grep -viE 'worker' | sed -n 1p || true)"
  : >"$work/seen"
  scanned=0
  while [[ (-z "$wasm_path" || -z "$worker_path") && "$scanned" -lt "$scan_limit" ]]; do
    next="$(grep -E '\.m?js$' "$work/queue" | grep -vxFf "$work/seen" | sed -n 1p || true)"
    [[ -n "$next" ]] || break
    echo "$next" >>"$work/seen"
    scanned=$((scanned + 1))
    [[ "$(fetch "$next" "$work/scan")" == 200 ]] || continue
    references "$work/scan" >>"$work/queue"
    sort -u -o "$work/queue" "$work/queue"
    [[ -n "$wasm_path" ]] || wasm_path="$(grep -E '\.wasm$' "$work/queue" | sed -n 1p || true)"
    [[ -n "$worker_path" ]] || worker_path="$(grep -E '\.worker(-[A-Za-z0-9_-]+)?\.m?js$' "$work/queue" | sed -n 1p || true)"
  done
fi

if [[ -z "$chunk_path" || -z "$wasm_path" || -z "$worker_path" ]]; then
  echo "  document $document_path: status $document_code, content-type '$(header "$work/document.headers" content-type)'" >&2
  echo "  its script and link references:" >&2
  grep -oE '(src|href)="[^"]+"' "$work/document" | sed -n '1,20s/^/    /p' >&2 || true
fi

failures=0
check() {
  local kind="$1" path="$2" code="$3" headers="$4" type_pattern="$5"
  if [[ -z "$path" ]]; then
    printf 'MISS %-8s not found on the host; set %s_PATH\n' "$kind" "$(tr '[:lower:]' '[:upper:]' <<<"$kind")"
    failures=$((failures + 1))
    return
  fi
  local problems=()
  [[ "$code" == 200 ]] || problems+=("status $code")
  local coop coep corp nosniff type
  coop="$(header "$headers" cross-origin-opener-policy)"
  coep="$(header "$headers" cross-origin-embedder-policy)"
  corp="$(header "$headers" cross-origin-resource-policy)"
  nosniff="$(header "$headers" x-content-type-options)"
  type="$(header "$headers" content-type)"
  [[ "${coop,,}" == same-origin ]] || problems+=("Cross-Origin-Opener-Policy '${coop}'")
  [[ "${coep,,}" == require-corp ]] || problems+=("Cross-Origin-Embedder-Policy '${coep}'")
  [[ "${corp,,}" == same-origin ]] || problems+=("Cross-Origin-Resource-Policy '${corp}'")
  [[ "${nosniff,,}" == nosniff ]] || problems+=("X-Content-Type-Options '${nosniff}'")
  [[ "${type,,}" =~ $type_pattern ]] || problems+=("Content-Type '${type}'")
  if [[ ${#problems[@]} -eq 0 ]]; then
    printf 'PASS %-8s %s (%s)\n' "$kind" "$path" "$type"
  else
    printf 'FAIL %-8s %s: %s\n' "$kind" "$path" "$(IFS=';'; echo "${problems[*]}")"
    failures=$((failures + 1))
  fi
}

echo "Static host conformance for $base"
check document "$document_path" "$document_code" "$work/document.headers" '^text/html(;|$)'
check chunk "$chunk_path" "$([[ -z "$chunk_path" ]] || fetch "$chunk_path" "$work/chunk")" "$work/chunk.headers" '^(text|application)/javascript(;|$)'
check wasm "$wasm_path" "$([[ -z "$wasm_path" ]] || fetch "$wasm_path" "$work/wasm")" "$work/wasm.headers" '^application/wasm(;|$)'
check worker "$worker_path" "$([[ -z "$worker_path" ]] || fetch "$worker_path" "$work/worker")" "$work/worker.headers" '^(text|application)/javascript(;|$)'

if [[ "$failures" -eq 0 ]]; then
  echo "conformant: 4 of 4 resources"
else
  echo "not conformant: $failures of 4 resources fail"
  exit 1
fi
