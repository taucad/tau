/*
 * tau-kqtrack — continuous descendant tracker for the macOS reaping spike, CANDIDATE (b).
 *
 * Tracks the shell's descendants from launch to cancel (not only at cancel), so a double-forked
 * grandchild can be recorded BEFORE it reparents to launchd and becomes invisible to a ppid walk.
 *
 * Mechanism: a kqueue EVFILT_PROC filter on the root pid with NOTE_FORK|NOTE_EXIT|NOTE_EXEC and —
 * crucially — NOTE_TRACK. NOTE_TRACK makes the kernel follow the process across fork(2): on each
 * fork it auto-registers the child on the same kqueue and posts a NOTE_CHILD event whose `ident` is
 * the new child pid (the parent pid is in fflags & NOTE_PDATAMASK). The auto-registered child knote
 * itself carries NOTE_TRACK, so the whole fork chain (child → grandchild of a double fork) is
 * followed. When the kernel cannot attach to a child (resource shortage) it posts NOTE_TRACKERR on
 * the parent — the escape signal. A periodic ppid re-enumeration backs it up: it re-walks the ppid
 * tree rooted at root to recover any live descendant NOTE_TRACK missed at startup, and records when
 * each tracked pid reparents to launchd (ppid becomes 1), so the race window is measured, not
 * assumed.
 *
 * Lifecycle: the probe spawns this immediately after launching the shell, passing the shell pid. The
 * tracker keeps a running set of every learned pid. On cancel the probe writes "REAP\n" to the
 * tracker's stdin (or closes it); the tracker then SIGKILLs every tracked pid (never pid 1, never
 * itself) and prints one JSON report to stdout. A hard max-runtime auto-reaps so nothing leaks on
 * the runner.
 *
 * Usage: tau-kqtrack <root-pid> | --selftest
 * Build (macOS): clang -O2 -Wall -Wextra -o tau-kqtrack tau-kqtrack.c
 *
 * Dev-only spike evidence. Never shipped; never run elevated.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>
#include <unistd.h>
#include <signal.h>
#include <time.h>

#if defined(__APPLE__)
#include <sys/event.h>
#include <sys/time.h>
#include <sys/types.h>
#include <libproc.h>
#include <sys/proc_info.h>

#define MAX_TRACKED 2048
#define MAX_RUNTIME_MS 60000
#define BACKFILL_INTERVAL_MS 200

typedef struct {
  pid_t pid;
  long learnMs;      /* relative to startMs */
  int ppidAtLearn;
  long reparentMs;   /* relative to startMs; -1 until ppid observed == 1 */
  long exitMs;       /* relative to startMs; -1 until NOTE_EXIT */
  int viaTrack;      /* 1: learned via NOTE_CHILD; 0: recovered by backfill walk (NOTE_TRACK missed) */
} tracked_t;

static tracked_t g_tracked[MAX_TRACKED];
static int g_n = 0;
static long g_startMs = 0;

static long now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static int find_tracked(pid_t pid) {
  for (int i = 0; i < g_n; i++) {
    if (g_tracked[i].pid == pid) return i;
  }
  return -1;
}

static int ppid_of(pid_t pid) {
  struct proc_bsdshortinfo sb;
  int r = proc_pidinfo(pid, PROC_PIDT_SHORTBSDINFO, 0, &sb, PROC_PIDT_SHORTBSDINFO_SIZE);
  if (r == (int)PROC_PIDT_SHORTBSDINFO_SIZE) {
    return (int)sb.pbsi_ppid;
  }
  return -1;
}

/* Record a pid if new. Returns its index. */
static int learn(pid_t pid, int viaTrack) {
  if (pid <= 1) return -1;
  int idx = find_tracked(pid);
  if (idx >= 0) return idx;
  if (g_n >= MAX_TRACKED) return -1;
  idx = g_n++;
  g_tracked[idx].pid = pid;
  g_tracked[idx].learnMs = now_ms() - g_startMs;
  g_tracked[idx].ppidAtLearn = ppid_of(pid);
  g_tracked[idx].reparentMs = -1;
  g_tracked[idx].exitMs = -1;
  g_tracked[idx].viaTrack = viaTrack;
  return idx;
}

/* Walk the ppid tree rooted at `root` and learn any live descendant not already tracked. Reparented
 * grandchildren (ppid == 1) do NOT appear here — only NOTE_TRACK catches those — so a pid recovered
 * here that was never seen via NOTE_CHILD is a measured startup miss, not the reparent gap. */
static void backfill_walk(pid_t root) {
  pid_t queue[MAX_TRACKED];
  int head = 0, tail = 0;
  queue[tail++] = root;
  int guard = 0;
  while (head < tail && guard++ < MAX_TRACKED) {
    pid_t p = queue[head++];
    int cap = proc_listpids(PROC_PPID_ONLY, (uint32_t)p, NULL, 0);
    if (cap <= 0) continue;
    int cnt = cap / (int)sizeof(pid_t);
    pid_t *kids = calloc((size_t)cnt + 8, sizeof(pid_t));
    if (!kids) continue;
    int got = proc_listpids(PROC_PPID_ONLY, (uint32_t)p, kids, (int)((cnt + 8) * (int)sizeof(pid_t)));
    int kn = (got > 0) ? got / (int)sizeof(pid_t) : 0;
    for (int i = 0; i < kn; i++) {
      pid_t kid = kids[i];
      if (kid <= 1) continue;
      if (find_tracked(kid) < 0) learn(kid, 0);
      if (tail < MAX_TRACKED) queue[tail++] = kid;
    }
    free(kids);
  }
}

/* Update reparent timestamps for every tracked pid still thought live. */
static void observe_reparent(void) {
  long t = now_ms() - g_startMs;
  for (int i = 0; i < g_n; i++) {
    if (g_tracked[i].reparentMs >= 0 || g_tracked[i].exitMs >= 0) continue;
    if (ppid_of(g_tracked[i].pid) == 1) g_tracked[i].reparentMs = t;
  }
}

static int register_proc(int kq, pid_t pid) {
  struct kevent kev;
  EV_SET(&kev, (uintptr_t)pid, EVFILT_PROC, EV_ADD | EV_CLEAR,
         NOTE_EXIT | NOTE_FORK | NOTE_EXEC | NOTE_TRACK, 0, NULL);
  return kevent(kq, &kev, 1, NULL, 0, NULL);
}

int main(int argc, char **argv) {
  if (argc < 2) {
    printf("{\"helper\":\"tau-kqtrack\",\"error\":\"usage: tau-kqtrack <root-pid|--selftest>\"}\n");
    return 64;
  }

  int kq = kqueue();
  if (strcmp(argv[1], "--selftest") == 0) {
    printf("{\"helper\":\"tau-kqtrack\",\"mode\":\"selftest\",\"feasible\":%s,\"errno\":%d}\n",
           (kq >= 0) ? "true" : "false", (kq >= 0) ? 0 : errno);
    if (kq >= 0) close(kq);
    return 0;
  }
  pid_t root = (pid_t)strtol(argv[1], NULL, 10);

  if (kq < 0) {
    printf("{\"helper\":\"tau-kqtrack\",\"root\":%d,\"feasible\":false,\"blocker\":\"kqueue() failed\","
           "\"errno\":%d}\n",
           (int)root, errno);
    return 1;
  }

  g_startMs = now_ms();
  learn(root, 1);
  int rootRegErrno = 0;
  if (register_proc(kq, root) < 0) rootRegErrno = errno;
  /* Catch anything the shell already forked before we registered. */
  backfill_walk(root);

  /* Watch stdin for the REAP command without blocking the proc events. */
  struct kevent sk;
  EV_SET(&sk, (uintptr_t)STDIN_FILENO, EVFILT_READ, EV_ADD, 0, 0, NULL);
  kevent(kq, &sk, 1, NULL, 0, NULL);

  int trackerr = 0;
  long childEvents = 0;
  int reap = 0;

  while (!reap) {
    struct kevent evs[32];
    struct timespec to = {0, BACKFILL_INTERVAL_MS * 1000000L};
    int nev = kevent(kq, NULL, 0, evs, 32, &to);
    for (int i = 0; i < nev; i++) {
      if (evs[i].filter == EVFILT_READ && (int)evs[i].ident == STDIN_FILENO) {
        char buf[64];
        ssize_t r = read(STDIN_FILENO, buf, sizeof(buf));
        if (r <= 0) {
          reap = 1; /* EOF: probe closed the pipe */
        } else {
          for (ssize_t j = 0; j < r; j++) {
            if (buf[j] == 'R' || buf[j] == 'r') reap = 1;
          }
        }
        continue;
      }
      if (evs[i].filter != EVFILT_PROC) continue;
      unsigned int ff = evs[i].fflags;
      if (ff & NOTE_CHILD) {
        childEvents++;
        learn((pid_t)evs[i].ident, 1);
        continue;
      }
      if (ff & NOTE_TRACKERR) trackerr++;
      if (ff & NOTE_EXIT) {
        int idx = find_tracked((pid_t)evs[i].ident);
        if (idx >= 0 && g_tracked[idx].exitMs < 0) g_tracked[idx].exitMs = now_ms() - g_startMs;
      }
    }
    observe_reparent();
    backfill_walk(root);
    if (now_ms() - g_startMs > MAX_RUNTIME_MS) reap = 1; /* safety: never leak on the runner */
  }

  /* REAP: SIGKILL every tracked pid (never pid 1, never ourselves). */
  int killed = 0, killFail = 0, firstKillErrno = 0;
  for (int i = 0; i < g_n; i++) {
    pid_t pid = g_tracked[i].pid;
    if (pid <= 1 || pid == getpid()) continue;
    if (kill(pid, SIGKILL) == 0) {
      killed++;
    } else if (errno != ESRCH) {
      killFail++;
      if (firstKillErrno == 0) firstKillErrno = errno;
    }
  }

  /* Aggregate the race window: learn→reparent delta for every pid that reparented to launchd. A
   * negative or missing delta on a stray would be an escape; backfillOnly counts pids NOTE_TRACK
   * never delivered (recovered only by the ppid walk). */
  int reparented = 0, backfillOnly = 0;
  long minDelta = -1, maxDelta = -1, sumDelta = 0;
  for (int i = 0; i < g_n; i++) {
    if (!g_tracked[i].viaTrack) backfillOnly++;
    if (g_tracked[i].reparentMs >= 0) {
      long d = g_tracked[i].reparentMs - g_tracked[i].learnMs;
      reparented++;
      sumDelta += d;
      if (minDelta < 0 || d < minDelta) minDelta = d;
      if (d > maxDelta) maxDelta = d;
    }
  }
  long avgDelta = reparented ? sumDelta / reparented : -1;

  printf("{\"helper\":\"tau-kqtrack\",\"root\":%d,\"feasible\":true,\"rootRegErrno\":%d,"
         "\"childEvents\":%ld,\"trackerr\":%d,\"tracked\":%d,\"killed\":%d,\"killFail\":%d,"
         "\"firstKillErrno\":%d,\"backfillOnly\":%d,\"raceWindowMs\":{\"reparented\":%d,\"min\":%ld,"
         "\"avg\":%ld,\"max\":%ld},\"pids\":[",
         (int)root, rootRegErrno, childEvents, trackerr, g_n, killed, killFail, firstKillErrno,
         backfillOnly, reparented, minDelta, avgDelta, maxDelta);
  for (int i = 0; i < g_n; i++) {
    printf("%s{\"pid\":%d,\"learnMs\":%ld,\"ppidAtLearn\":%d,\"reparentMs\":%ld,\"exitMs\":%ld,"
           "\"viaTrack\":%s}",
           i ? "," : "", (int)g_tracked[i].pid, g_tracked[i].learnMs, g_tracked[i].ppidAtLearn,
           g_tracked[i].reparentMs, g_tracked[i].exitMs, g_tracked[i].viaTrack ? "true" : "false");
  }
  printf("]}\n");
  fflush(stdout);
  close(kq);
  return 0;
}

#else
int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  printf("{\"helper\":\"tau-kqtrack\",\"error\":\"not macOS; kqueue EVFILT_PROC unavailable\",\"feasible\":false}\n");
  return 65;
}
#endif
