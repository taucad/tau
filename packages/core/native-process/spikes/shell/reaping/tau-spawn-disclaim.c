/*
 * tau-spawn-disclaim — exec wrapper for the macOS reaping spike, CANDIDATE (a), SET half.
 *
 * Makes the shell its OWN responsible process. posix_spawn carries a private responsibility
 * spawn attribute (`responsibility_spawnattrs_setdisclaim`, SPI from <spawn_private.h>): with the
 * disclaim flag set the spawned image disclaims its spawner's responsibility and the kernel records
 * the new image as responsible for itself (p_responsible_pid = self). We combine it with
 * POSIX_SPAWN_SETEXEC so the current process is RE-IMAGED in place (pid preserved, exactly like
 * tau-setasid's execvp model): the launched Bash therefore keeps the pid the probe already holds,
 * and that pid is its own responsible pid.
 *
 * Every descendant Bash forks inherits the PARENT's responsible pid (the shell), and — this is the
 * thesis of candidate (a) — reparenting to launchd does NOT rewrite p_responsible_pid. So a
 * double-forked grandchild that reparents to pid 1 (invisible to a ppid walk) remains attributable
 * to the shell by responsibility. tau-resp-enum tests whether that attribution is readable
 * non-elevated and survives the shell's own death.
 *
 * This helper only SETS and REPORTS; it never kills. It prints one JSON object to stderr (so stdout
 * stays the child's) describing the attempt, then re-execs. The SPI is weak-imported: if it is
 * absent at runtime the helper reports spiPresent=false and STILL execs (so the probe records
 * candidate (a) as a documented blocker, never a vacuous pass).
 *
 * Usage: tau-spawn-disclaim <program> [args...]
 * Build (macOS): clang -O2 -Wall -Wextra -o tau-spawn-disclaim tau-spawn-disclaim.c
 *
 * Dev-only spike evidence. Never shipped; never run elevated.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <spawn.h>

extern char **environ;

/* Private SPI (<spawn_private.h>, not in the public SDK). Weak-imported so a missing symbol does not
 * break the link; a NULL pointer at runtime is reported as spiPresent=false. */
extern int responsibility_spawnattrs_setdisclaim(posix_spawnattr_t *attr, int disclaim)
    __attribute__((weak_import));

/* POSIX_SPAWN_SETEXEC: re-image the calling process in place instead of forking a child; the pid is
 * preserved and posix_spawn does not return on success. Defined in <spawn_private.h>. */
#ifndef POSIX_SPAWN_SETEXEC
#define POSIX_SPAWN_SETEXEC 0x0040
#endif

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "{\"helper\":\"tau-spawn-disclaim\",\"error\":\"usage: tau-spawn-disclaim <program> [args...]\"}\n");
    return 64;
  }

  posix_spawnattr_t attr;
  if (posix_spawnattr_init(&attr) != 0) {
    fprintf(stderr, "{\"helper\":\"tau-spawn-disclaim\",\"error\":\"posix_spawnattr_init\",\"errno\":%d}\n", errno);
    return 71;
  }
  int setFlagsRc = posix_spawnattr_setflags(&attr, (short)POSIX_SPAWN_SETEXEC);

  int spiPresent = (responsibility_spawnattrs_setdisclaim != NULL);
  int disclaimRc = -1;
  int disclaimErrno = 0;
  if (spiPresent) {
    disclaimRc = responsibility_spawnattrs_setdisclaim(&attr, 1);
    disclaimErrno = (disclaimRc == 0) ? 0 : errno;
  }

  fprintf(stderr,
          "{\"helper\":\"tau-spawn-disclaim\",\"pid\":%d,\"spiPresent\":%s,\"disclaimRc\":%d,"
          "\"disclaimErrno\":%d,\"setexecRc\":%d}\n",
          (int)getpid(), spiPresent ? "true" : "false", disclaimRc, disclaimErrno, setFlagsRc);
  fflush(stderr);

  /* SETEXEC: replaces this image with the target, keeping our pid. Returns only on failure, and
   * posix_spawn returns the error number directly (it does not set errno). */
  int rc = posix_spawn(NULL, argv[1], NULL, &attr, &argv[1], environ);
  fprintf(stderr, "{\"helper\":\"tau-spawn-disclaim\",\"error\":\"posix_spawn returned\",\"rc\":%d}\n", rc);
  return 127;
}

#else
int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  fprintf(stderr, "{\"helper\":\"tau-spawn-disclaim\",\"error\":\"not macOS; responsibility SPI unavailable\"}\n");
  return 65;
}
#endif
