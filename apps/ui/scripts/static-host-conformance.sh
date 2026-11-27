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
# Optional, for a host that serves a static shell (progressive loading PL3, shell invariant 5):
#   SHELL_PATH     A URL the host answers with a static shell, e.g. /w/home/example. Its COOP, COEP, CORP,
#                  Content-Security-Policy-Report-Only, Reporting-Endpoints and Document-Policy must equal those of
#                  PARITY_PATH, and it must expire the skew protection cookie (tau_skew) on every response,
#                  including the CDN cache hits that follow the first request.
#   SHELL_REPEAT   Requests of SHELL_PATH after the first, each of which must expire tau_skew (default: 3, minimum 1).
#                  The first request fills the edge cache; the next ones are usually answered from it, so a cookie set
#                  only on the response that fills the cache fails here (`cache-status` is printed with the failure).
#   PARITY_PATH    A function-rendered document of the same host to compare with (default: /projects)
#   NO_DOCUMENT_POLICY  1 to also require that neither carries Document-Policy (production, check C6)
#   SHELL_COOKIE   A Cookie header sent with the SHELL_PATH requests only. The Home shell (PL4) answers `/` only to the
#                  app preference: SHELL_PATH=/ SHELL_COOKIE=tau-entry=app. A shell at `/` must also answer
#                  `Cache-Control: private, no-store`, since the document there depends on that cookie.
#
# Usage:
#   apps/ui/scripts/static-host-conformance.sh https://taucad-prod-us.netlify.app
#   SHELL_PATH=/ SHELL_COOKIE=tau-entry=app apps/ui/scripts/static-host-conformance.sh https://taucad.dev
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

# fetch <path> <body-file> [cookie]: GET one path, headers to <body-file>.headers; prints the status code.
# A transport failure prints curl's reason on stderr and status 000, so it is reported rather than ending the run.
fetch() {
  : >"$2"
  : >"$2.headers"
  curl --silent --show-error --location --max-time 60 --compressed ${3:+--cookie "$3"} \
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

resources=4
if [[ -n "${SHELL_PATH:-}" ]]; then
  resources=6
  parity_path="${PARITY_PATH:-/projects}"
  shell_code="$(fetch "$SHELL_PATH" "$work/shell" "${SHELL_COOKIE:-}")"
  parity_code="$(fetch "$parity_path" "$work/parity")"
  check shell "$SHELL_PATH" "$shell_code" "$work/shell.headers" '^text/html(;|$)'
  problems=()
  [[ "$parity_code" == 200 ]] || problems+=("$parity_path status $parity_code")
  for name in cross-origin-opener-policy cross-origin-embedder-policy cross-origin-resource-policy \
    content-security-policy-report-only reporting-endpoints document-policy; do
    shell_value="$(header "$work/shell.headers" "$name")"
    parity_value="$(header "$work/parity.headers" "$name")"
    [[ "$shell_value" == "$parity_value" ]] || problems+=("$name '${shell_value}' differs from $parity_path '${parity_value}'")
    if [[ "$name" == document-policy && "${NO_DOCUMENT_POLICY:-}" == 1 && -n "$shell_value$parity_value" ]]; then
      problems+=("Document-Policy present")
    fi
  done
  [[ -n "$(header "$work/shell.headers" content-security-policy-report-only)" ]] || problems+=("no report-only CSP")
  grep -qiE '^set-cookie:[[:space:]]*tau_skew=;.*max-age=0' "$work/shell.headers" || problems+=("tau_skew not expired")
  if [[ "${SHELL_PATH%%\?*}" == / ]]; then
    shell_cache="$(header "$work/shell.headers" cache-control)"
    [[ "${shell_cache,,}" == *no-store* ]] || problems+=("Cache-Control '${shell_cache}' at / is not no-store")
  fi
  shell_repeat="${SHELL_REPEAT:-3}"
  [[ "$shell_repeat" =~ ^[0-9]+$ && "$shell_repeat" -ge 1 ]] || shell_repeat=1
  for attempt in $(seq 2 $((shell_repeat + 1))); do
    repeat_code="$(fetch "$SHELL_PATH" "$work/shell-repeat" "${SHELL_COOKIE:-}")"
    [[ "$repeat_code" == 200 ]] || problems+=("request $attempt status $repeat_code")
    grep -qiE '^set-cookie:[[:space:]]*tau_skew=;.*max-age=0' "$work/shell-repeat.headers" ||
      problems+=("tau_skew not expired on request $attempt (cache-status '$(header "$work/shell-repeat.headers" cache-status)')")
  done
  if [[ ${#problems[@]} -eq 0 ]]; then
    printf 'PASS %-8s %s matches %s\n' parity "$SHELL_PATH" "$parity_path"
  else
    printf 'FAIL %-8s %s: %s\n' parity "$SHELL_PATH" "$(IFS=';'; echo "${problems[*]}")"
    failures=$((failures + 1))
  fi
fi

if [[ "$failures" -eq 0 ]]; then
  echo "conformant: $resources of $resources resources"
else
  echo "not conformant: $failures of $resources resources fail"
  exit 1
fi
