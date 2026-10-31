/*
 * tau-resp-enum — enumerator for the macOS reaping spike, CANDIDATE (a), ENUMERATE half.
 *
 * Given a target "responsible" pid (the shell launched through tau-spawn-disclaim), list every pid
 * whose RESPONSIBLE pid equals the target, using the private SPI
 * `responsibility_get_pid_responsible_for_pid(pid)`. Unlike the asid route (candidate A, prior
 * spike), this does NOT need the target's task port: the responsible pid is read via proc_info-style
 * machinery for same-uid processes, so it should be feasible non-elevated where task_for_pid is
 * denied under SIP. This helper MEASURES that per run and reports the evidence.
 *
 * The thesis under test: p_responsible_pid is inherited across fork, is NOT rewritten when a process
 * reparents to launchd, and is NOT rewritten when the responsible process itself dies — so a
 * double-forked (and even already-orphaned) grandchild stays attributable to the shell's pid, an
 * attribution a ppid walk cannot make. The enumerator therefore keys on the stored integer, matching
 * even when the target pid is already dead (so long as the pid has not been recycled).
 *
 * Modes:
 *   tau-resp-enum --self         Print this process's own responsible pid (preflight: did disclaim
 *                                take effect? isOwnResponsible should be true under tau-spawn-disclaim).
 *   tau-resp-enum <target-pid>   Enumerate every pid whose responsible pid == target.
 *
 * Prints one JSON object to stdout:
 *   {"helper":"tau-resp-enum","target":<pid>,"self":{"pid":...,"responsible":...},
 *    "spiPresent":<bool>,"listed":<N>,"readable":<M>,"denied":<K>,"firstDeniedErrno":<e>,
 *    "feasible":<bool>,"blocker":<string|null>,"match":[pid,...]}
 *
 * Usage: tau-resp-enum <target-pid|--self>
 * Build (macOS): clang -O2 -Wall -Wextra -o tau-resp-enum tau-resp-enum.c
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

/* Private SPI. Weak-imported: a NULL pointer at runtime means the symbol did not resolve on this
 * host, which the helper reports as spiPresent=false (a documented blocker, never a false pass). */
extern pid_t responsibility_get_pid_responsible_for_pid(pid_t pid) __attribute__((weak_import));

static int spi_present(void) {
  return responsibility_get_pid_responsible_for_pid != NULL;
}

/* Returns the responsible pid for `pid`, or -1 (with errno set by the SPI) on failure. */
static long responsible_of(pid_t pid) {
  if (!spi_present()) {
    errno = ENOSYS;
    return -1;
  }
  errno = 0;
  pid_t r = responsibility_get_pid_responsible_for_pid(pid);
  return (r < 0) ? -1 : (long)r;
}

int main(int argc, char **argv) {
  if (argc < 2) {
    printf("{\"helper\":\"tau-resp-enum\",\"error\":\"usage: tau-resp-enum <target-pid|--self>\"}\n");
    return 64;
  }

  long selfResp = responsible_of(getpid());

  if (strcmp(argv[1], "--self") == 0) {
    printf("{\"helper\":\"tau-resp-enum\",\"mode\":\"self\",\"spiPresent\":%s,\"self\":{\"pid\":%d,"
           "\"responsible\":%ld},\"isOwnResponsible\":%s,\"errno\":%d}\n",
           spi_present() ? "true" : "false", (int)getpid(), selfResp,
           (selfResp == (long)getpid()) ? "true" : "false", (selfResp < 0) ? errno : 0);
    return 0;
  }

  long target = strtol(argv[1], NULL, 10);

  /* Size then fetch the full pid list. */
  int cap = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
  if (cap <= 0) {
    printf("{\"helper\":\"tau-resp-enum\",\"error\":\"proc_listpids sizing failed\",\"errno\":%d,"
           "\"spiPresent\":%s,\"feasible\":false}\n",
           errno, spi_present() ? "true" : "false");
    return 1;
  }
  int count = cap / (int)sizeof(pid_t);
  pid_t *pids = calloc((size_t)count + 16, sizeof(pid_t));
  if (!pids) {
    printf("{\"helper\":\"tau-resp-enum\",\"error\":\"oom\",\"feasible\":false}\n");
    return 1;
  }
  int got = proc_listpids(PROC_ALL_PIDS, 0, pids, (int)((count + 16) * (int)sizeof(pid_t)));
  int n = (got > 0) ? got / (int)sizeof(pid_t) : 0;

  int listed = 0, readable = 0, denied = 0, firstDeniedErrno = 0;
  pid_t match[256];
  int matchCount = 0;

  for (int i = 0; i < n; i++) {
    pid_t pid = pids[i];
    if (pid <= 0) continue;
    listed++;
    long rp = responsible_of(pid);
    if (rp < 0) {
      denied++;
      if (firstDeniedErrno == 0) firstDeniedErrno = errno;
      continue;
    }
    readable++;
    if (rp == target && pid != getpid() && matchCount < 256) {
      match[matchCount++] = pid;
    }
  }

  /* Feasible only if the SPI resolved AND we could read the responsible pid of processes we do not
   * own — i.e. more than just ourselves. */
  int feasible = spi_present() && (readable > 1);
  const char *blocker =
      !spi_present() ? "\"responsibility_get_pid_responsible_for_pid SPI did not resolve on this host\""
      : (readable <= 1) ? "\"responsible pid readable only for self; cross-process attribution denied non-elevated\""
                        : "null";

  printf("{\"helper\":\"tau-resp-enum\",\"target\":%ld,\"self\":{\"pid\":%d,\"responsible\":%ld},"
         "\"spiPresent\":%s,\"listed\":%d,\"readable\":%d,\"denied\":%d,\"firstDeniedErrno\":%d,"
         "\"feasible\":%s,\"blocker\":%s,\"match\":[",
         target, (int)getpid(), selfResp, spi_present() ? "true" : "false", listed, readable, denied,
         firstDeniedErrno, feasible ? "true" : "false", blocker);
  for (int i = 0; i < matchCount; i++) printf("%s%d", i ? "," : "", (int)match[i]);
  printf("]}\n");
  free(pids);
  return 0;
}

#else
int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  printf("{\"helper\":\"tau-resp-enum\",\"error\":\"not macOS; responsibility SPI unavailable\",\"feasible\":false}\n");
  return 65;
}
#endif
