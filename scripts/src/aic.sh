#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
POLICY_FILE="$REPO_ROOT/docs/policy/commit-policy.md"

# ---------------------------------------------------------------------------
# Scope discovery
# ---------------------------------------------------------------------------

discover_scopes() {
  local scopes=("root")
  for dir in "$REPO_ROOT"/apps/*/project.json "$REPO_ROOT"/apps/libs/*/project.json "$REPO_ROOT"/packages/*/project.json "$REPO_ROOT"/packages/kernels/*/project.json "$REPO_ROOT"/libs/*/project.json; do
    [ -f "$dir" ] || continue
    local name
    name=$(node -e "console.log(require('$dir').name || '')" 2>/dev/null)
    [ -n "$name" ] && scopes+=("$name")
  done
  printf '%s\n' "${scopes[@]}" | sort -u
}

detect_touched_scopes() {
  local all_scopes=("$@")
  local touched=()
  local has_root=false
  local staged_files
  staged_files=$(git diff --cached --name-only 2>/dev/null)

  if [ -z "$staged_files" ]; then
    return
  fi

  while IFS= read -r file; do
    local matched=false
    for scope in "${all_scopes[@]}"; do
      [ "$scope" = "root" ] && continue
      if [[ "$file" == apps/"$scope"/* ]] || [[ "$file" == apps/libs/"$scope"/* ]] || [[ "$file" == packages/"$scope"/* ]] || [[ "$file" == packages/kernels/"$scope"/* ]] || [[ "$file" == libs/"$scope"/* ]]; then
        touched+=("$scope")
        matched=true
        break
      fi
    done
    if [ "$matched" = false ]; then
      has_root=true
    fi
  done <<< "$staged_files"

  [ "$has_root" = true ] && touched+=("root")

  [ ${#touched[@]} -gt 0 ] && printf '%s\n' "${touched[@]}" | sort -u
}

build_scope_map() {
  local scopes=("$@")
  local map=""
  for scope in "${scopes[@]}"; do
    if [ "$scope" = "root" ]; then
      map+="  - root: files not under apps/, packages/, or libs/ (e.g. config, CI, docs, scripts)"$'\n'
    elif [ -d "$REPO_ROOT/packages/kernels/$scope" ]; then
      map+="  - $scope: packages/kernels/$scope/"$'\n'
    elif [ -d "$REPO_ROOT/apps/libs/$scope" ]; then
      map+="  - $scope: apps/libs/$scope/"$'\n'
    else
      for parent in apps packages libs; do
        if [ -d "$REPO_ROOT/$parent/$scope" ]; then
          map+="  - $scope: $parent/$scope/"$'\n'
          break
        fi
      done
    fi
  done
  echo "$map"
}

# ---------------------------------------------------------------------------
# Policy extraction — reads rules from docs/policy/commit-policy.md
# ---------------------------------------------------------------------------

extract_policy_rules() {
  if [ ! -f "$POLICY_FILE" ]; then
    echo "(commit policy not found — using built-in rules)"
    return
  fi

  # Extract the Rules and Anti-Patterns sections from the policy markdown.
  # Strips frontmatter, keeps content between "## Rules" and "## Enforcement".
  awk '
    /^## Rules$/        { capture=1; next }
    /^## Anti-Patterns$/ { capture=1; next }
    /^## Enforcement$/  { capture=0 }
    /^## Summary/       { capture=0 }
    capture             { print }
  ' "$POLICY_FILE" \
    | sed '/^```/,/^```/d' \
    | sed 's/^### [0-9]*\. /- /' \
    | sed '/^$/d' \
    | head -80
}

# ---------------------------------------------------------------------------
# Build prompt
# ---------------------------------------------------------------------------

ALL_SCOPES=($(discover_scopes))

TOUCHED_OUTPUT=$(detect_touched_scopes "${ALL_SCOPES[@]}")
if [ -z "$TOUCHED_OUTPUT" ]; then
  echo "No staged changes detected. Stage files first with 'git add'."
  exit 1
fi
TOUCHED_SCOPES=($TOUCHED_OUTPUT)

SCOPE_LIST=$(printf ', %s' "${TOUCHED_SCOPES[@]}")
SCOPE_LIST="${SCOPE_LIST:2}"
SCOPE_MAP=$(build_scope_map "${TOUCHED_SCOPES[@]}")
ALL_SCOPE_LIST=$(printf ', %s' "${ALL_SCOPES[@]}")
ALL_SCOPE_LIST="${ALL_SCOPE_LIST:2}"

read -r -d '' PROMPT <<PROMPT_EOF || true
You are generating a conventional commit message for a monorepo.

FORMAT: type(scope): Description

ALLOWED TYPES: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

SCOPE RULES (CRITICAL — violations will be rejected by a commit hook):
- You MUST use one of these scopes: [${SCOPE_LIST}]
- The ONLY valid scopes in this repository are: [${ALL_SCOPE_LIST}]
- NEVER invent a scope. The commit will be rejected if the scope is not in this list.

Scope-to-directory mapping (use to determine scope from changed files):
${SCOPE_MAP}
If changes span multiple scopes, use the scope of the most significant change.

DESCRIPTION RULES:
- Start with a capitalized imperative present-tense verb (Add, Fix, Resolve, Extract, Implement, Remove, Bump, Refactor)
- Complete the sentence: "If applied, this commit will..."
- Be specific: reference concrete names, file types, formats, numbers, error messages
- Keep under 72 characters total (including type and scope)
- Do NOT end with a period

QUALITY GUIDELINES:
- "Fix bug" is bad. "Fix null shape crash on empty STEP file import" is good.
- "Update dependencies" is bad. "Bump Node.js requirement from 22 to 24" is good.
- "Improve performance" is bad. "Reduce STL parse time by 40% via streaming decoder" is good.
- "Add feature" is bad. "Add Cmd+K keyboard shortcut for command palette" is good.

ANTI-PATTERNS TO AVOID:
- Invented scopes not in the valid list
- Missing scope entirely
- Past tense ("added", "fixed") or gerund ("adding", "fixing")
- Vague generic descriptions ("update code", "fix issue", "improve things")
- Lowercase first word in description

EXAMPLES OF CORRECT MESSAGES:
- feat(api): Add user authentication endpoint
- fix(runtime): Resolve OpenCASCADE null shape crash on empty STEP files
- refactor(ui): Extract theme provider into separate module
- chore(root): Bump Node.js requirement from 22 to 24
- style(oxlint): Add no-literal-const-assertion linting rule
- perf(converter): Reduce STL parse time via streaming decoder
- test(runtime): Add integration tests for JSCAD boolean operations
- ci(root): Add license-deps validation to CI pipeline
PROMPT_EOF

GENERATE=${1:-3}

aicommit2 -t conventional -y -p "$PROMPT" --generate "$GENERATE"
