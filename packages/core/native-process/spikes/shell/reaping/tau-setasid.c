/*
 * tau-setasid — exec wrapper for the macOS reaping spike, strategy (A), SET half.
 *
 * Allocates a FRESH audit session id (asid) for itself via setaudit_addr(AU_ASSIGN_ASID) and then
 * execs the rest of argv. Every descendant inherits the asid across fork/exec and keeps it across
 * reparenting (launchd adoption of a daemonized grandchild does NOT change the asid), so a reaper
 * that can enumerate pids by asid would catch session-escaping and daemonized descendants alike.
 *
 * This helper only SETS and REPORTS; it never kills. It prints one JSON object to stderr (so stdout
 * stays the child's) describing the attempt, then execs. Exit/erroring is reported honestly:
 *   - setaudit_addr on stock macOS requires privilege; a non-elevated caller gets EPERM. The helper
 *     reports {"setOk":false,"errno":...} and STILL execs with the INHERITED login-session asid, so
 *     the probe can observe that strategy A cannot isolate a fresh session without root.
 *
 * Usage: tau-setasid <program> [args...]
 * Build (macOS): clang -O2 -Wall -Wextra -o tau-setasid tau-setasid.c -lbsm
 *
 * Dev-only spike evidence. Never shipped; never run elevated.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <bsm/audit.h>
#include <bsm/audit_session.h>

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "{\"helper\":\"tau-setasid\",\"error\":\"usage: tau-setasid <program> [args...]\"}\n");
    return 64;
  }

  auditinfo_addr_t before;
  memset(&before, 0, sizeof(before));
  int gotBefore = getaudit_addr(&before, sizeof(before));
  long beforeAsid = (gotBefore == 0) ? (long)before.ai_asid : -1;
  int getErrno = (gotBefore == 0) ? 0 : errno;

  /* Request a fresh, kernel-allocated session id. */
  auditinfo_addr_t want = before;
  want.ai_asid = AU_ASSIGN_ASID;
  int setRc = setaudit_addr(&want, sizeof(want));
  int setErrno = (setRc == 0) ? 0 : errno;

  long afterAsid = beforeAsid;
  int setOk = (setRc == 0);
  if (setOk) {
    auditinfo_addr_t after;
    memset(&after, 0, sizeof(after));
    if (getaudit_addr(&after, sizeof(after)) == 0) {
      afterAsid = (long)after.ai_asid;
    }
  }

  fprintf(stderr,
          "{\"helper\":\"tau-setasid\",\"pid\":%d,\"beforeAsid\":%ld,\"getErrno\":%d,"
          "\"setOk\":%s,\"setErrno\":%d,\"afterAsid\":%ld}\n",
          (int)getpid(), beforeAsid, getErrno, setOk ? "true" : "false", setErrno, afterAsid);
  fflush(stderr);

  execvp(argv[1], &argv[1]);
  fprintf(stderr, "{\"helper\":\"tau-setasid\",\"error\":\"execvp failed\",\"errno\":%d}\n", errno);
  return 127;
}

#else
int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  fprintf(stderr, "{\"helper\":\"tau-setasid\",\"error\":\"not macOS; audit session API unavailable\"}\n");
  return 65;
}
#endif
