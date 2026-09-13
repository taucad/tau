#!/usr/bin/env bash
# Fetches unresolved PR review comment threads from GitHub via GraphQL.
# Requires: gh (GitHub CLI, authenticated), jq
#
# Usage:
#   ./scripts/fetch-pr-comments.sh              # auto-detect PR from current branch
#   ./scripts/fetch-pr-comments.sh 123          # specific PR number
#   ./scripts/fetch-pr-comments.sh --all 123    # include resolved threads

set -euo pipefail

SHOW_ALL=false
PR_NUMBER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --all) SHOW_ALL=true; shift ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--all] [PR_NUMBER]"
      echo ""
      echo "Fetches unresolved PR review threads from GitHub."
      echo ""
      echo "Options:"
      echo "  PR_NUMBER   Pull request number (auto-detects from current branch if omitted)"
      echo "  --all       Include resolved threads (default: unresolved only)"
      echo ""
      echo "Requires: gh (authenticated), jq"
      exit 0
      ;;
    *) PR_NUMBER="$1"; shift ;;
  esac
done

for cmd in gh jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not installed." >&2
    exit 1
  fi
done

REMOTE_URL=$(git remote get-url origin 2>/dev/null) || {
  echo "Error: Not in a git repository or no 'origin' remote configured." >&2
  exit 1
}

if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
else
  echo "Error: Could not parse GitHub owner/repo from remote: $REMOTE_URL" >&2
  exit 1
fi

if [[ -z "$PR_NUMBER" ]]; then
  PR_NUMBER=$(gh pr view --json number --jq '.number' 2>/dev/null) || {
    echo "Error: No PR found for current branch. Pass PR number as argument." >&2
    exit 1
  }
fi

QUERY='
query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      number
      title
      url
      reviewThreads(first: 100, after: $cursor) {
        totalCount
        nodes {
          id
          isResolved
          isOutdated
          isCollapsed
          path
          line
          startLine
          diffSide
          comments(first: 50) {
            nodes {
              author { login }
              body
              createdAt
              url
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
'

ALL_THREADS="[]"
CURSOR=""
HAS_NEXT=true
PR_META=""

while $HAS_NEXT; do
  ARGS=(
    -f query="$QUERY"
    -f owner="$OWNER"
    -f repo="$REPO"
    -F pr="$PR_NUMBER"
  )
  if [[ -n "$CURSOR" ]]; then
    ARGS+=(-f cursor="$CURSOR")
  fi

  RESPONSE=$(gh api graphql "${ARGS[@]}")

  if echo "$RESPONSE" | jq -e '.errors' &>/dev/null; then
    echo "Error: GraphQL query failed:" >&2
    echo "$RESPONSE" | jq -r '.errors[].message' >&2
    exit 1
  fi

  PR_DATA=$(echo "$RESPONSE" | jq '.data.repository.pullRequest')

  if [[ "$(echo "$PR_DATA" | jq -r '.')" == "null" ]]; then
    echo "Error: PR #${PR_NUMBER} not found in ${OWNER}/${REPO}." >&2
    exit 1
  fi

  if [[ -z "$PR_META" ]]; then
    PR_META=$(echo "$PR_DATA" | jq '{ number, title, url }')
  fi

  PAGE_THREADS=$(echo "$PR_DATA" | jq '.reviewThreads.nodes')
  ALL_THREADS=$(jq -s '.[0] + .[1]' <(echo "$ALL_THREADS") <(echo "$PAGE_THREADS"))

  HAS_NEXT=$(echo "$PR_DATA" | jq -r '.reviewThreads.pageInfo.hasNextPage')
  CURSOR=$(echo "$PR_DATA" | jq -r '.reviewThreads.pageInfo.endCursor')
done

if $SHOW_ALL; then
  JQ_FILTER='.'
else
  JQ_FILTER='[.[] | select(.isResolved == false)]'
fi

FILTERED=$(echo "$ALL_THREADS" | jq "$JQ_FILTER")

jq -n \
  --argjson pr "$PR_META" \
  --argjson threads "$FILTERED" \
  '{
    pr: $pr,
    threadCount: ($threads | length),
    threads: [
      $threads[] | {
        id,
        isResolved,
        isOutdated,
        file: .path,
        line,
        startLine,
        diffSide,
        comments: [
          .comments.nodes[] | {
            author: .author.login,
            body,
            createdAt,
            url
          }
        ]
      }
    ]
  }'
