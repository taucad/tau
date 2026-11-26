# @taucad/vitest-ci

Shared Vitest reporter list, CI test outcome recorder and recorded retry for every Tau test target

A project's `quarantine.json` (testing policy § 16.3) lets a named flaky test keep running and reporting while the task's verdict ignores its failure. `testReporters` adds the verdict to every config; `pnpm nx run scripts:validate-quarantine` checks every file.
