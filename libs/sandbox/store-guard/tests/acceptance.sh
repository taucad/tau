#!/usr/bin/env bash
# Purpose: Acceptance of the store guard under real bubblewrap (Linux Terminal git parity blueprint, LP2): the
#   workflow, every protected write, git outside rewriting the store mid-session, the bypass shape, the server's death
#   and the cost against a plain writable store. Mirrors guard-probe.txt §1 and §2 and guard-bypass-probe.txt in Brain
#   `research/artifacts/linux-terminal-git-parity-blueprint/evidence/`, with Tau's eight-name policy.
# Why: The guard is the only thing between code in the Linux Terminal and git outside the sandbox; its tests must run
#   it the way the provider does, as an ordinary user, outer bubblewrap with CAP_SYS_ADMIN, nested bubblewrap inside.
# Environment: Linux, bash, git, an unprivileged user, a usable /dev/fuse, unprivileged user namespaces (or Tau's
#   AppArmor-profiled bubblewrap on a host that restricts them). No network.
# Usage: acceptance.sh <tau-store-guard> <bwrap> [<evidence file>]
# Exit codes: 0 every case held; 1 a case failed (each failure is printed); 2 usage or a missing prerequisite.
set -euo pipefail

guard="${1:?usage: acceptance.sh <tau-store-guard> <bwrap> [<evidence file>]}"
bwrap="${2:?usage: acceptance.sh <tau-store-guard> <bwrap> [<evidence file>]}"
evidence="${3:-/dev/null}"
[[ -x "$guard" && -x "$bwrap" ]] || { printf 'guard or bwrap is not executable\n' >&2; exit 2; }
[[ "$(id -u)" != 0 ]] || { printf 'run as an ordinary user: root would not need the namespace capability\n' >&2; exit 2; }
command -v git > /dev/null || { printf 'git is missing\n' >&2; exit 2; }

policy=(config hooks commondir config.worktree worktrees modules remotes branches)
bypass=(objects refs logs lfs)
work="$(mktemp -d "${TMPDIR:-/tmp}/tau-store-guard-acceptance.XXXXXX")"
trap 'rm -rf "$work"' EXIT
failures=0
log() { printf '%s\n' "$*" | tee -a "$evidence"; }
pass() { log "ok   $*"; }
fail() { log "FAIL $*"; failures=$((failures + 1)); }
expect() { # expect <label> <wanted rc> <actual rc>
  if [[ "$3" == "$2" ]]; then pass "$1 (rc $3)"; else fail "$1: rc $3, wanted $2"; fi
}

export HOME="$work/home" GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=Fixture GIT_AUTHOR_EMAIL=fixture@example.invalid \
  GIT_COMMITTER_NAME=Fixture GIT_COMMITTER_EMAIL=fixture@example.invalid
mkdir -p "$HOME"
git config --global init.defaultBranch main
git config --global advance.detachedHead false

new_store() {
  local project="$1"
  mkdir -p "$project"
  git -C "$project" init -q
  printf 'one\n' > "$project/a.txt"
  git -C "$project" add a.txt
  git -C "$project" commit -qm First
}

# guarded <project> <script> <arguments...>: the provider's shape, with the store's real path.
guarded() {
  local project="$1"
  shift
  local launch=("$guard" launch)
  for name in "${policy[@]}"; do launch+=(--protect "$name"); done
  for name in "${bypass[@]}"; do launch+=(--bypass "$name"); done
  "$bwrap" --unshare-user --unshare-pid --die-with-parent --cap-add CAP_SYS_ADMIN --dev-bind / / --proc /proc -- \
    "${launch[@]}" --store "$project/.git" -- \
    "$bwrap" --unshare-user --unshare-pid --unshare-net --die-with-parent --dev-bind / / --proc /proc --chdir "$project" \
    -- bash "$@"
}

plain() {
  local project="$1"
  shift
  "$bwrap" --unshare-user --unshare-pid --unshare-net --die-with-parent --dev-bind / / --proc /proc --chdir "$project" \
    -- bash "$@"
}

# The policy names present in a store, as git outside sees them.
listing() { local name; for name in "${policy[@]}"; do [[ -e "$1/.git/$name" || -L "$1/.git/$name" ]] && printf '%s ' "$name"; done; true; }

log "=== tau-store-guard acceptance: $("$guard" --version), $("$bwrap" --version), $(git --version), $(uname -r)"

log '=== 1. Workflow and protected writes through the guard'
project="$work/one"
new_store "$project"
git -C "$project" switch -qc side
printf 'side\n' > "$project/side.txt"
git -C "$project" add side.txt
git -C "$project" commit -qm Side
git -C "$project" switch -q main
before="$(listing "$project")"
cat > "$work/one.sh" <<'EOF'
set -u
rc() { "$@" > /dev/null 2>&1; printf '%s\n' "$?"; }
printf 'two\n' > a.txt
{ git add a.txt && git commit -qm Second && git switch -qc feature && printf 'three\n' > a.txt && git stash -q \
  && git stash pop -q && git commit -qam Third && git switch -q main && git merge -q --no-edit side; } > /dev/null 2>&1
printf 'workflow=%s\n' "$?"
printf 'git-config=%s\n' "$(rc git config core.fsmonitor forged)"
printf 'config-append=%s\n' "$(rc sh -c 'printf "[core]\n\tfsmonitor = forged\n" >> .git/config')"
printf 'config-truncate=%s\n' "$(rc sh -c ': > .git/config')"
printf 'config-rename-over=%s\n' "$(rc sh -c 'cp .git/config .git/config.new && mv -f .git/config.new .git/config')"
rm -f .git/config.new
printf 'config-rename-away=%s\n' "$(rc mv .git/config .git/config.old)"
printf 'config-unlink=%s\n' "$(rc rm -f .git/config)"
printf 'config-chmod=%s\n' "$(rc chmod 0777 .git/config)"
printf 'config-touch=%s\n' "$(rc touch .git/config)"
printf 'config-hard-link=%s\n' "$(rc ln .git/config .git/alias)"
printf 'config-symlink-write=%s\n' "$(rc sh -c 'ln -s config .git/pointer && printf x >> .git/pointer')"
rm -f .git/pointer
printf 'hook-write=%s\n' "$(rc sh -c 'printf "#!/bin/sh\n" > .git/hooks/post-commit')"
printf 'hooks-rename-away=%s\n' "$(rc mv .git/hooks .git/hooks.old)"
printf 'commondir=%s\n' "$(rc sh -c 'printf "%s\n" "$PWD/elsewhere" > .git/commondir')"
printf 'commondir-symlink=%s\n' "$(rc ln -s /tmp .git/commondir)"
printf 'config-worktree=%s\n' "$(rc sh -c 'printf x > .git/config.worktree')"
printf 'worktrees=%s\n' "$(rc mkdir .git/worktrees)"
printf 'modules=%s\n' "$(rc mkdir .git/modules)"
printf 'remotes=%s\n' "$(rc sh -c 'mkdir -p .git/remotes && printf "URL: /tmp/x\n" > .git/remotes/backup')"
printf 'branches=%s\n' "$(rc sh -c 'printf "/tmp/x\n" > .git/branches/mirror')"
printf 'branches-rmdir=%s\n' "$(rc rmdir .git/branches)"
printf 'rename-onto-hooks=%s\n' "$(rc sh -c 'mkdir .git/tmp-hooks && mv -T .git/tmp-hooks .git/hooks')"
rmdir .git/tmp-hooks 2> /dev/null
printf 'move-store=%s\n' "$(rc mv .git .git-moved)"
# Each spelling a case-folding directory (ext4 or f2fs casefold) reads as a policy name is refused as that name.
printf 'folded-case=%s\n' "$(rc mkdir .git/HOOKS)"
printf 'folded-kelvin=%s\n' "$(rc mkdir $'.git/hoo\xe2\x84\xaas')"
printf 'folded-long-s=%s\n' "$(rc mkdir $'.git/remote\xc5\xbf')"
printf 'folded-ligature=%s\n' "$(rc sh -c 'printf x > "$1"' _ $'.git/con\xef\xac\x81g')"
printf 'info-exclude=%s\n' "$(rc sh -c 'printf "*.tmp\n" >> .git/info/exclude')"
printf 'status=%s\n' "$(rc git status --porcelain)"
EOF
transcript="$(guarded "$project" "$work/one.sh" 2>&1)" || true
printf '%s\n' "$transcript" >> "$evidence"
value() { sed -n "s/^$1=//p" <<< "$transcript" | head -n 1; }
expect 'workflow: add, commit, switch -c, stash, stash pop, merge' 0 "$(value workflow)"
for case in git-config config-append config-truncate config-rename-over config-rename-away config-unlink config-chmod \
  config-touch config-hard-link config-symlink-write hook-write hooks-rename-away commondir commondir-symlink \
  config-worktree worktrees modules remotes branches branches-rmdir rename-onto-hooks move-store folded-case \
  folded-kelvin folded-long-s folded-ligature; do
  [[ "$(value "$case")" != 0 && -n "$(value "$case")" ]] && pass "$case refused (rc $(value "$case"))" ||
    fail "$case: rc $(value "$case"), wanted a refusal"
done
expect 'info/exclude stays writable' 0 "$(value info-exclude)"
expect 'status inside' 0 "$(value status)"
after="$(listing "$project")"
[[ "$after" == "$before" ]] && pass "the real store gained no protected name: $after" || fail "protected names changed: $before -> $after"
grep -q fsmonitor "$project/.git/config" && fail 'config was written' || pass 'config unchanged outside'
[[ ! -e "$project/.git/commondir" ]] && pass 'no commondir outside' || fail 'commondir exists outside'
git -C "$project" fsck > /dev/null 2>&1 && pass 'fsck outside' || fail 'fsck outside'
[[ "$(git -C "$project" log --oneline | wc -l)" -ge 4 ]] && pass 'git outside reads the commits' || fail 'commits missing'

log '=== 2. Git outside rewrites the store mid-session; the names stay refused'
project="$work/two"
new_store "$project"
sync_dir="$work/sync"
mkdir -p "$sync_dir"
cp "$project/.git/config" "$project/.git/config.lock"
chmod 0644 "$project/.git/config.lock"
lock_before="$(stat -c '%s %a %Y' "$project/.git/config.lock") $(sha256sum < "$project/.git/config.lock")"
cat > "$work/two.sh" <<'EOF'
set -u
sync="$1"
rc() { "$@" > /dev/null 2>&1; printf '%s\n' "$?"; }
printf 'before-append=%s\n' "$(rc sh -c 'printf x >> .git/config')"
# A protected name's lock is never opened for writing: git outside would rename it over the name.
printf 'lock-open=%s\n' "$(rc sh -c 'exec 3>> .git/config.lock')"
# Git outside's lock in flight: the Terminal can neither change, remove, move nor link it.
printf 'lock-truncate=%s\n' "$(rc truncate -s 0 .git/config.lock)"
printf 'lock-grow=%s\n' "$(rc truncate -s 1M .git/config.lock)"
printf 'lock-chmod=%s\n' "$(rc chmod 0666 .git/config.lock)"
printf 'lock-touch=%s\n' "$(rc touch .git/config.lock)"
printf 'lock-unlink=%s\n' "$(rc rm -f .git/config.lock)"
printf 'lock-rename=%s\n' "$(rc mv .git/config.lock .git/moved)"
printf 'lock-link=%s\n' "$(rc ln .git/config.lock .git/linked)"
# A descriptor held on an ordinary name, whose file git outside then renames over config.
exec 3>> .git/held
printf 'held-open=%s\n' "$?"
: > "$sync/inside-ready"
for _ in $(seq 300); do [[ -e "$sync/outside-done" ]] && break; sleep 0.1; done
printf 'outside-seen=%s\n' "$([[ -e "$sync/outside-done" ]] && echo 0 || echo 1)"
printf '[core]\n\tfsmonitor = forged\n' >&3 2> /dev/null
printf 'held-write=%s\n' "$?"
exec 3>&-
printf 'after-append=%s\n' "$(rc sh -c 'printf "[core]\n\tfsmonitor = forged\n" >> .git/config')"
printf 'after-replace=%s\n' "$(rc sh -c 'cp .git/config .git/config.lock && mv -f .git/config.lock .git/config')"
rm -f .git/config.lock
printf 'after-worktrees=%s\n' "$(rc mkdir .git/worktrees)"
printf 'reads-config=%s\n' "$(git config branch.main.remote 2> /dev/null)"
printf 'reads-commit=%s\n' "$(git log -1 --format=%s 2> /dev/null)"
printf 'commit-after=%s\n' "$(rc sh -c 'printf four > a.txt && git commit -qam Inside')"
EOF
guarded "$project" "$work/two.sh" "$sync_dir" > "$work/two.out" 2>&1 &
session=$!
for _ in $(seq 300); do [[ -e "$sync_dir/inside-ready" ]] && break; sleep 0.1; done
lock_after="$(stat -c '%s %a %Y' "$project/.git/config.lock") $(sha256sum < "$project/.git/config.lock")"
rm -f "$project/.git/config.lock"
{
  git -C "$project" config branch.main.remote origin &&
    cp "$project/.git/config" "$project/.git/held" && mv -f "$project/.git/held" "$project/.git/config" &&
    git -C "$project" worktree add -q "$work/two-linked" -b linked &&
    git -C "$project" worktree remove "$work/two-linked" &&
    printf 'outside\n' > "$project/b.txt" && git -C "$project" add b.txt && git -C "$project" commit -qm Outside
} > /dev/null 2>&1
expect 'git outside: config, a file renamed over config, worktree add and remove, commit during the session' 0 "$?"
: > "$sync_dir/outside-done"
wait "$session" || true
transcript="$(cat "$work/two.out")"
printf '%s\n' "$transcript" >> "$evidence"
[[ "$(value before-append)" != 0 ]] && pass 'config refused before the rewrite' || fail 'config written before'
[[ "$(value lock-open)" != 0 && -n "$(value lock-open)" ]] && pass "config.lock refused for writing (rc $(value lock-open))" ||
  fail "config.lock opened for writing: rc $(value lock-open)"
expect 'a descriptor held on an ordinary name' 0 "$(value held-open)"
for case in lock-truncate lock-grow lock-chmod lock-touch lock-unlink lock-rename lock-link; do
  [[ "$(value "$case")" != 0 && -n "$(value "$case")" ]] && pass "$case on git outside's lock refused" ||
    fail "$case: rc $(value "$case") on git outside's lock"
done
[[ "$lock_after" == "$lock_before" ]] && pass "git outside's lock unchanged" || fail "lock changed: $lock_before -> $lock_after"
[[ "$(value held-write)" != 0 && -n "$(value held-write)" ]] &&
  pass "the held descriptor cannot write once its file is config (rc $(value held-write))" ||
  fail "the held descriptor wrote into config: rc $(value held-write)"
expect 'the session saw git outside finish' 0 "$(value outside-seen)"
for case in after-append after-replace after-worktrees; do
  [[ "$(value "$case")" != 0 && -n "$(value "$case")" ]] && pass "$case refused after git outside rewrote config" ||
    fail "$case: rc $(value "$case") after the rewrite"
done
[[ "$(value reads-config)" == origin ]] && pass 'the Terminal reads the rewritten config' || fail "config read: $(value reads-config)"
[[ "$(value reads-commit)" == Outside ]] && pass 'the Terminal reads the outside commit' || fail "commit read: $(value reads-commit)"
expect 'commit inside after the rewrite' 0 "$(value commit-after)"
grep -q fsmonitor "$project/.git/config" && fail 'config was written' || pass 'config unchanged outside'
[[ ! -e "$project/.git/worktrees" ]] && pass 'no worktrees outside' || fail 'worktrees exists outside'
git -C "$project" fsck > /dev/null 2>&1 && pass 'fsck outside' || fail 'fsck outside'

log '=== 3. The bypass shape: packed refs, gc, rebase'
project="$work/three"
new_store "$project"
cat > "$work/three.sh" <<'EOF'
set -u
for n in 1 2 3; do printf '%s\n' "$n" > "n$n.txt"; git add "n$n.txt"; git commit -qm "N$n"; done
git branch -q topic
git branch -m topic renamed > /dev/null 2>&1; printf 'branch-rename=%s\n' "$?"
git show-ref --verify -q refs/heads/renamed; printf 'renamed-exists=%s\n' "$?"
git pack-refs --all > /dev/null 2>&1; printf 'pack-refs=%s\n' "$?"
git branch -D renamed > /dev/null 2>&1; printf 'delete-packed=%s\n' "$?"
git gc -q > /dev/null 2>&1; printf 'gc=%s\n' "$?"
git switch -qc rebased HEAD~2 && printf 'r\n' > r.txt && git add r.txt && git commit -qm R && git rebase -q main > /dev/null 2>&1
printf 'rebase=%s\n' "$?"
fsck_output="$(git fsck 2>&1)"; printf 'fsck=%s\n' "$?"
printf '%s\n' "$fsck_output" | sed 's/^/fsck-output: /'
EOF
transcript="$(guarded "$project" "$work/three.sh" 2>&1)" || true
printf '%s\n' "$transcript" >> "$evidence"
expect 'branch -m half-fails on the read-only config (OD8)' 128 "$(value branch-rename)"
expect 'the branch is renamed all the same' 0 "$(value renamed-exists)"
for case in pack-refs delete-packed gc rebase fsck; do expect "$case" 0 "$(value "$case")"; done
git -C "$project" fsck > /dev/null 2>&1 && pass 'fsck outside' || fail 'fsck outside'

log '=== 4. The shell cannot see the guard; when it dies, git inside fails and the store is untouched'
project="$work/four"
new_store "$project"
rm -f "$sync_dir"/*
cat > "$work/four.sh" <<'EOF'
set -u
sync="$1"
pgrep -x tau-store-guard > /dev/null 2>&1; printf 'visible=%s\n' "$?"
: > "$sync/inside-ready"
for _ in $(seq 300); do [[ -e "$sync/outside-done" ]] && break; sleep 0.1; done
git status > /dev/null 2>&1; printf 'status=%s\n' "$?"
printf x >> .git/config 2> /dev/null; printf 'config=%s\n' "$?"
EOF
guarded "$project" "$work/four.sh" "$sync_dir" > "$work/four.out" 2>&1 &
session=$!
for _ in $(seq 300); do [[ -e "$sync_dir/inside-ready" ]] && break; sleep 0.1; done
# The server is the one tau-store-guard process serving this store; the outer bwrap's command line names it too.
server=''
for pid in $(pgrep -x tau-store-guard); do
  tr '\0' ' ' < "/proc/$pid/cmdline" 2> /dev/null | grep -qF -- "--store $project/.git " && server="$pid"
done
[[ -n "$server" ]] && kill -KILL "$server" && pass "the guard ($server) was killed from outside" ||
  fail 'no guard process to kill'
: > "$sync_dir/outside-done"
wait "$session" || true
transcript="$(cat "$work/four.out")"
printf '%s\n' "$transcript" >> "$evidence"
expect 'the shell cannot see the guard process' 1 "$(value visible)"
[[ "$(value status)" != 0 && -n "$(value status)" ]] && pass "git inside fails once the guard is gone (rc $(value status))" ||
  fail "git inside after the guard died: rc $(value status)"
[[ "$(value config)" != 0 ]] && pass 'config still unwritable' || fail 'config written after the guard died'
grep -q '^x' "$project/.git/config" && fail 'config was written' || pass 'config unchanged outside'
git -C "$project" fsck > /dev/null 2>&1 && pass 'fsck outside' || fail 'fsck outside'

log '=== 5. Cost: 2000 small files added and committed, then status, against a plain writable store'
cat > "$work/five.sh" <<'EOF'
set -u
mkdir many
for n in $(seq 2000); do printf '%s\n' "$n" > "many/$n"; done
t() { local start end; start=$(date +%s%N); "$@" > /dev/null 2>&1; end=$(date +%s%N); printf '%s' "$(((end - start) / 1000000))"; }
printf 'add=%s commit=%s status=%s (ms)\n' "$(t git add many)" "$(t git commit -qm Many)" "$(t git status --porcelain)"
EOF
# Five interleaved pairs, each side judged by its fastest run, so a noisy runner's drift does not decide.
sample() { # sample <runner> <label> <attempt>: the add time of one fresh store
  local project="$work/five-$2-$3" line
  new_store "$project"
  line="$("$1" "$project" "$work/five.sh" 2>&1 | tail -n 1)"
  log "$2 run $3: $line" >&2
  sed -n 's/^add=\([0-9.]*\).*/\1/p' <<< "$line"
}
guarded_add=''
plain_add=''
for attempt in 1 2 3 4 5; do
  value_plain="$(sample plain plain "$attempt")"
  value_guarded="$(sample guarded guarded "$attempt")"
  [[ -n "$value_plain" && -n "$value_guarded" ]] || { fail "cost run $attempt produced no time"; continue; }
  [[ -z "$plain_add" ]] || ((value_plain < plain_add)) && plain_add="$value_plain"
  [[ -z "$guarded_add" ]] || ((value_guarded < guarded_add)) && guarded_add="$value_guarded"
done
if [[ -n "$plain_add" && -n "$guarded_add" ]]; then
  ratio="$((guarded_add * 100 / (plain_add > 0 ? plain_add : 1)))"
  log "git add of 2000 files: guarded ${guarded_add} ms, plain ${plain_add} ms, ${ratio}% of plain"
  ((guarded_add <= 3 * plain_add)) && pass "within three times the plain store (${ratio}%)" ||
    fail "guarded add costs ${ratio}% of the plain store"
fi

log "=== $([[ "$failures" == 0 ]] && echo 'all cases held' || echo "$failures case(s) failed")"
[[ "$failures" == 0 ]]
