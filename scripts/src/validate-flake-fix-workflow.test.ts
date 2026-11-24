import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { workflowPaths } from "#validate-workflows.js";

/*
 * The validate-flake-fix check (FQ-14) judges agent fixes, so the fix must not be able to change the judge: the workflow runs
 * from `main` (`pull_request_target`), executes nothing from the pull request, and writes nothing but its label.
 * It reports on every pull request and merge-queue group so it can be made a required check.
 */
const path = ".github/workflows/validate-flake-fix.yml";
const text = readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

type Step = {
  readonly name: string;
  readonly id?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
};
type Workflow = {
  readonly on: Record<
    string,
    { readonly types?: readonly string[] } | undefined
  >;
  readonly permissions: Record<string, string>;
  readonly jobs: Record<
    string,
    {
      readonly name: string;
      readonly permissions: Record<string, string>;
      readonly outputs: Record<string, string>;
      readonly steps: Step[];
    }
  >;
};
const workflow = load(text) as Workflow;
const job = workflow.jobs["validate-flake-fix"]!;

describe("validate-flake-fix workflow", () => {
  it("should report under one stable check name on every pull request and merge-queue group", () => {
    expect(Object.keys(workflow.on).sort()).toEqual([
      "merge_group",
      "pull_request_target",
    ]);
    expect(workflow.on["pull_request_target"]?.types).toEqual(
      expect.arrayContaining(["opened", "synchronize", "edited", "labeled"]),
    );
    expect(Object.keys(workflow.jobs)).toEqual(["validate-flake-fix"]);
    expect(job.name).toBe("validate-flake-fix");
  });

  it("should only read, apart from the label", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(job.permissions).toEqual({
      contents: "read",
      "pull-requests": "write",
    });
    expect(text).not.toMatch(/secrets\./u);
  });

  it("should run the validator from main and never execute the pull request", () => {
    const checkout = job.steps.find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    expect(checkout?.with).toMatchObject({
      "persist-credentials": false,
      "sparse-checkout": "scripts/src/validate-flake-fix.ts",
    });
    expect(checkout?.with).not.toHaveProperty("ref");
    expect(text).not.toMatch(/pnpm|npm (?:ci|install)|setup-nx/u);
    // Event values reach a script through `env`, never by expression interpolation.
    for (const step of job.steps.filter((entry) => entry.run !== undefined)) {
      expect(step.run).not.toMatch(/\$\{\{/u);
    }
    expect(job.steps.find((step) => step.id === "validate")?.run).toContain(
      "node scripts/src/validate-flake-fix.ts",
    );
  });

  it("should skip everything but the scope step outside a flake fix, and label even a failed validation", () => {
    for (const step of job.steps.slice(1, -1)) {
      expect(step.if).toBe("steps.scope.outputs.applies == 'true'");
    }
    expect(job.steps.at(-1)?.if).toBe(
      "always() && steps.validate.outputs.label != ''",
    );
    expect(job.outputs["classification"]).toBe(
      // oxlint-disable-next-line no-template-curly-in-string -- a GitHub expression, not a template
      "${{ steps.validate.outputs.classification || 'not-applicable' }}",
    );
  });

  it("should pin every external action to a commit", () => {
    for (const step of job.steps.filter((entry) => entry.uses !== undefined)) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/u);
    }
  });

  it("should be one of the workflows validate-workflows reads", () => {
    expect(workflowPaths).toContain(path);
  });
});
