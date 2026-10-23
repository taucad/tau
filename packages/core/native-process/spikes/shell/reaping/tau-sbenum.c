/*
 * tau-sbenum — enumerator for the macOS reaping spike, CANDIDATE (c), the SANDBOX-MEMBERSHIP half.
 *
 * Candidates (a)/(b) chase the process TREE (responsibility, kqueue tracking). Candidate (c) ignores
 * the tree entirely and asks the Seatbelt sandbox instead: every descendant of a shell launched inside
 * a per-session sandbox profile INHERITS that profile and cannot leave it — daemonized, double-forked,
 * setsid or not, and no matter how it reparents. So "is this pid one of ours?" becomes "does this pid
 * sit inside OUR session's sandbox?", which `sandbox_check` answers for ANY pid without its task port.
 *
 * The per-session profile (written by the driver, `deny default`) carries a UNIQUE marker rule:
 *   (allow file-read*  (literal <markerPath>))       ; only THIS session's marker
 * and denies a fixed CONTROL path (it is not in any allow, so `deny default` denies it). Membership of
 * a pid in OUR session is then decided by two `sandbox_check` queries, fail-closed:
 *
 *   markerAllowed  = sandbox_check(pid,"file-read-data",PATH, markerPath)  == 0   (operation permitted)
 *   controlDenied  = sandbox_check(pid,"file-read-data",PATH, controlPath) >  0   (operation blocked)
 *   inOurSession   = markerAllowed && controlDenied
 *
 * Why both halves are required:
 *   - An UNSANDBOXED pid (the probe, launchd, system daemons) is permitted everything, so its control
 *     check is ALSO allowed (==0) -> controlDenied is false -> excluded. The control check is what
 *     rejects the unsandboxed world, which would otherwise look "marker-allowed".
 *   - A pid in ANOTHER session's sandbox denies our marker literal (its profile only allows ITS marker)
 *     -> markerAllowed is false -> excluded. The unique marker is what rejects foreign sessions.
 *   - Only OUR descendants satisfy both: our marker allowed AND the control path denied.
 *
 * `sandbox_check` is SPI (<sandbox.h>, not in the public SDK). It is weak-imported: a NULL pointer at
 * runtime is reported as spiPresent=false, feasible=false, blocker "spi-unavailable" — a documented
 * blocker, NEVER a false pass. The pid list comes from the public `proc_listpids(PROC_ALL_PIDS)`
 * (libproc), the same route the proven candidate (a) enumerator uses.
 *
 * Modes:
 *   tau-sbenum --selftest                  Report whether sandbox_check resolved and pid listing works.
 *   tau-sbenum <markerPath> <controlPath>  Enumerate every pid in OUR session (see predicate above).
 *
 * Prints one JSON object to stdout:
 *   {"helper":"tau-sbenum","marker":"..","control":"..","spiPresent":<bool>,"listed":<N>,
 *    "checked":<M>,"errors":<K>,"firstErrno":<e>,"sandboxedObserved":<S>,"feasible":<bool>,
 *    "blocker":<string|null>,"match":[pid,...]}
 *
 * Usage: tau-sbenum <markerPath> <controlPath> | --selftest
 * Build (macOS): clang -O2 -Wall -Wextra -o tau-sbenum tau-sbenum.c
 *
 * Dev-only spike evidence. Never shipped; never run elevated.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <libproc.h>
#include <sys/types.h>

/* SANDBOX_FILTER_PATH selects a path-argument check. Value from the private <sandbox.h>; redefined
 * here because that header is not in the public SDK. The documented path-check form passes this type
 * alone (no extra flag bits), which keeps the `type` argument a small valid int. */
#ifndef SANDBOX_FILTER_PATH
#define SANDBOX_FILTER_PATH 1
#endif

/* Private SPI. Weak-imported: a NULL pointer at runtime means the symbol did not resolve on this host,
 * reported as spiPresent=false (a documented blocker, never a false pass). Returns 0 if the operation
 * is permitted for `pid`, >0 if it is blocked, -1 (errno set) on error. An unsandboxed pid is permitted
 * everything, so it returns 0 for every path. */
extern int sandbox_check(pid_t pid, const char *operation, int type, ...) __attribute__((weak_import));

static int spi_present(void) {
  return sandbox_check != NULL;
}

/* Fills `pids` (capacity `cap` entries) with the live pid set via the public proc_listpids(PROC_ALL_PIDS);
 * returns the count, or -1 on failure so listing is never silently reported as empty. */
static int list_pids(pid_t *pids, int cap) {
  int got = proc_listpids(PROC_ALL_PIDS, 0, pids, cap * (int)sizeof(pid_t));
  return (got > 0) ? got / (int)sizeof(pid_t) : -1;
}

/* 0 = permitted, >0 = blocked, -1 = error (errno set). */
static int sb_check(pid_t pid, const char *path) {
  if (!spi_present()) {
    errno = ENOSYS;
    return -1;
  }
  errno = 0;
  return sandbox_check(pid, "file-read-data", SANDBOX_FILTER_PATH, path);
}

int main(int argc, char **argv) {
  if (argc < 2) {
    printf("{\"helper\":\"tau-sbenum\",\"error\":\"usage: tau-sbenum <markerPath> <controlPath>|--selftest\"}\n");
    return 64;
  }

  if (strcmp(argv[1], "--selftest") == 0) {
    pid_t probe[8];
    int n = list_pids(probe, 8);
    /* Probe our OWN (unsandboxed) pid so the receipt records what sandbox_check returns and sets for
     * a process with no sandbox: this disambiguates "unsandboxed -> 0/allowed" from "unsandboxed ->
     * -1/EINVAL", which decides how the enumerator reads foreign pids. */
    int selfRc = spi_present() ? sb_check(getpid(), "/etc/hosts") : -1;
    int selfErrno = (selfRc < 0) ? errno : 0;
    printf("{\"helper\":\"tau-sbenum\",\"mode\":\"selftest\",\"spiPresent\":%s,\"listPidsOk\":%s,"
           "\"selfCheckRc\":%d,\"selfCheckErrno\":%d,\"feasible\":%s}\n",
           spi_present() ? "true" : "false", (n > 0) ? "true" : "false", selfRc, selfErrno,
           spi_present() ? "true" : "false");
    return 0;
  }

  if (argc < 3) {
    printf("{\"helper\":\"tau-sbenum\",\"error\":\"both <markerPath> and <controlPath> required\"}\n");
    return 64;
  }
  const char *marker = argv[1];
  const char *control = argv[2];

  if (!spi_present()) {
    printf("{\"helper\":\"tau-sbenum\",\"marker\":\"%s\",\"control\":\"%s\",\"spiPresent\":false,"
           "\"feasible\":false,\"blocker\":\"spi-unavailable\",\"match\":[]}\n",
           marker, control);
    return 0;
  }

  /* Size then fetch the full pid list. proc_listpids sizing query returns bytes. */
  int capBytes = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
  int cap = (capBytes > 0) ? (capBytes / (int)sizeof(pid_t)) + 64 : 4096;
  pid_t *pids = calloc((size_t)cap, sizeof(pid_t));
  if (!pids) {
    printf("{\"helper\":\"tau-sbenum\",\"error\":\"oom\",\"feasible\":false,\"blocker\":\"oom\",\"match\":[]}\n");
    return 1;
  }
  int n = list_pids(pids, cap);
  if (n < 0) {
    printf("{\"helper\":\"tau-sbenum\",\"error\":\"proc_listpids failed\",\"errno\":%d,\"feasible\":false,"
           "\"blocker\":\"pid-list-failed\",\"match\":[]}\n",
           errno);
    free(pids);
    return 1;
  }

  int listed = 0, checked = 0, errors = 0, firstErrno = 0, sandboxedObserved = 0;
  pid_t match[1024];
  int matchCount = 0;

  for (int i = 0; i < n; i++) {
    pid_t pid = pids[i];
    if (pid <= 0 || pid == getpid()) {
      continue;
    }
    listed++;
    int markerChk = sb_check(pid, marker);
    int controlChk = sb_check(pid, control);
    if (markerChk < 0 || controlChk < 0) {
      errors++;
      if (firstErrno == 0) {
        firstErrno = errno;
      }
      continue;
    }
    checked++;
    int controlDenied = (controlChk > 0);
    if (controlDenied) {
      sandboxedObserved++;
    }
    int markerAllowed = (markerChk == 0);
    if (markerAllowed && controlDenied && matchCount < 1024) {
      match[matchCount++] = pid;
    }
  }

  /* Feasible only if the SPI resolved AND the control check actually discriminated at least one
   * sandboxed process on this host (otherwise sandbox_check gave no signal and we refuse to claim a
   * membership answer). The external canary remains the final arbiter of reaping. */
  int feasible = spi_present() && (sandboxedObserved > 0);
  const char *blocker =
      !spi_present() ? "\"spi-unavailable\""
      : (sandboxedObserved == 0)
          ? "\"sandbox_check returned no deny for any pid; sandbox membership not observable here\""
          : "null";

  printf("{\"helper\":\"tau-sbenum\",\"marker\":\"%s\",\"control\":\"%s\",\"spiPresent\":true,"
         "\"listed\":%d,\"checked\":%d,\"errors\":%d,\"firstErrno\":%d,\"sandboxedObserved\":%d,"
         "\"feasible\":%s,\"blocker\":%s,\"match\":[",
         marker, control, listed, checked, errors, firstErrno, sandboxedObserved,
         feasible ? "true" : "false", blocker);
  for (int i = 0; i < matchCount; i++) {
    printf("%s%d", i ? "," : "", (int)match[i]);
  }
  printf("]}\n");
  free(pids);
  return 0;
}

#else
int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  printf("{\"helper\":\"tau-sbenum\",\"error\":\"not macOS; sandbox_check SPI unavailable\",\"feasible\":false}\n");
  return 65;
}
#endif
