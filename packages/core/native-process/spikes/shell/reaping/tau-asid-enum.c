/*
 * tau-asid-enum — enumerator for the macOS reaping spike, strategy (A), ENUMERATE half.
 *
 * Given a target asid, list every pid that currently carries it. Prints one JSON object to stdout:
 *   {"helper":"tau-asid-enum","target":<asid>,"self":{"pid":...,"asid":...},
 *    "listed":<N>,"readable":<M>,"readMethod":"task_for_pid/TASK_AUDIT_TOKEN",
 *    "feasible":<bool>,"blocker":<string|null>,"match":[pid,...],"readErrnos":{...}}
 *
 * macOS exposes NO public, non-privileged libproc flavor that returns a process's audit session id:
 *   - proc_listpids selectors are PROC_ALL_PIDS / PGRP / TTY / UID / RUID / PPID — none by asid.
 *   - proc_pidinfo(PROC_PIDT*INFO) structs carry no ai_asid field.
 *   - getaudit_addr(2) operates on the CALLER only (no pid argument).
 * The only route to another process's asid is its audit_token, obtained from its task port via
 * task_for_pid()+task_info(TASK_AUDIT_TOKEN). On stock (SIP-on) macOS task_for_pid on a process the
 * caller does not own as root returns KERN_FAILURE/ (not entitled). So this helper MEASURES, per
 * run, how many of the listed pids it could actually read an asid for: if it can read only itself,
 * asid-based enumeration is infeasible for a non-elevated reaper, and it says so with evidence.
 *
 * Usage: tau-asid-enum <target-asid>
 * Build (macOS): clang -O2 -Wall -Wextra -o tau-asid-enum tau-asid-enum.c -lbsm
 * (proc_* live in libSystem and are auto-linked; audit_token_to_asid needs -lbsm. There is no
 * separate -lproc on macOS.)
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
#include <bsm/audit.h>
#include <bsm/libbsm.h>
#include <bsm/audit_session.h>
#include <mach/mach.h>
#include <mach/task.h>
#include <mach/mach_traps.h>

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "{\"helper\":\"tau-asid-enum\",\"error\":\"usage: tau-asid-enum <target-asid>\"}\n");
    return 64;
  }
  long target = strtol(argv[1], NULL, 10);

  auditinfo_addr_t self;
  memset(&self, 0, sizeof(self));
  long selfAsid = (getaudit_addr(&self, sizeof(self)) == 0) ? (long)self.ai_asid : -1;

  /* Size then fetch the full pid list. */
  int cap = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
  if (cap <= 0) {
    printf("{\"helper\":\"tau-asid-enum\",\"error\":\"proc_listpids sizing failed\",\"errno\":%d}\n", errno);
    return 1;
  }
  int count = cap / (int)sizeof(pid_t);
  pid_t *pids = calloc((size_t)count + 16, sizeof(pid_t));
  if (!pids) {
    printf("{\"helper\":\"tau-asid-enum\",\"error\":\"oom\"}\n");
    return 1;
  }
  int got = proc_listpids(PROC_ALL_PIDS, 0, pids, (int)((count + 16) * (int)sizeof(pid_t)));
  int n = (got > 0) ? got / (int)sizeof(pid_t) : 0;

  int listed = 0, readable = 0, denied = 0, firstDeniedErrno = 0;
  /* Up to 256 matches is plenty for a spike; avoids unbounded JSON. */
  pid_t match[256];
  int matchCount = 0;

  for (int i = 0; i < n; i++) {
    pid_t pid = pids[i];
    if (pid <= 0) continue;
    listed++;
    if (pid == getpid()) {
      /* We can always read our own asid via getaudit_addr (already have selfAsid). */
      readable++;
      if (selfAsid == target && matchCount < 256) match[matchCount++] = pid;
      continue;
    }
    mach_port_t task = MACH_PORT_NULL;
    kern_return_t kr = task_for_pid(mach_task_self(), pid, &task);
    if (kr != KERN_SUCCESS) {
      denied++;
      if (firstDeniedErrno == 0) firstDeniedErrno = (int)kr;
      continue;
    }
    audit_token_t token;
    mach_msg_type_number_t cnt = TASK_AUDIT_TOKEN_COUNT;
    kr = task_info(task, TASK_AUDIT_TOKEN, (task_info_t)&token, &cnt);
    mach_port_deallocate(mach_task_self(), task);
    if (kr != KERN_SUCCESS) {
      denied++;
      if (firstDeniedErrno == 0) firstDeniedErrno = (int)kr;
      continue;
    }
    readable++;
    au_asid_t asid = audit_token_to_asid(token);
    if ((long)asid == target && matchCount < 256) match[matchCount++] = pid;
  }

  /* Feasible only if we could read the asid of processes we do not own — i.e. more than just self. */
  int feasible = (readable > 1);
  printf("{\"helper\":\"tau-asid-enum\",\"target\":%ld,\"self\":{\"pid\":%d,\"asid\":%ld},"
         "\"listed\":%d,\"readable\":%d,\"denied\":%d,\"firstDeniedKr\":%d,"
         "\"readMethod\":\"task_for_pid+TASK_AUDIT_TOKEN\",\"feasible\":%s,\"blocker\":%s,\"match\":[",
         target, (int)getpid(), selfAsid, listed, readable, denied, firstDeniedErrno,
         feasible ? "true" : "false",
         feasible ? "null" : "\"task_for_pid denied for processes not owned as root; only self asid readable\"");
  for (int i = 0; i < matchCount; i++) printf("%s%d", i ? "," : "", (int)match[i]);
  printf("]}\n");
  free(pids);
  return 0;
}

#else
int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  printf("{\"helper\":\"tau-asid-enum\",\"error\":\"not macOS; audit session API unavailable\",\"feasible\":false}\n");
  return 65;
}
#endif
