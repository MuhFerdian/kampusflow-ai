import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  timestampSchema,
  toDatetimeLocal,
  fromDatetimeLocal,
} from "../src/lib/datetime";
import { taskSchema } from "../src/lib/model";

const task = {
  title: "Due date regression",
  description: "",
  course_id: null,
  project_id: null,
  importance: 3,
  difficulty: 3,
  estimated_minutes: 60,
  status: "todo",
  progress: 0,
};

test("Supabase offset timestamps survive completion, reopen and progress updates unchanged", () => {
  for (const due_at of [
    null,
    "2026-09-28T17:00:00Z",
    "2026-09-28T17:00:00+00:00",
    "2026-09-29T00:00:00+07:00",
    "2026-09-28T11:30:00-05:30",
    "2026-09-28T17:00:12.123456+00:00",
  ]) {
    const completed = taskSchema.parse({
      ...task,
      due_at,
      status: "completed",
      progress: 100,
    });
    assert.equal(completed.due_at, due_at);
    const reopened = taskSchema.parse({
      ...completed,
      status: "todo",
      progress: 0,
    });
    assert.equal(reopened.due_at, due_at);
    assert.equal(
      taskSchema.parse({ ...reopened, status: "in_progress", progress: 50 })
        .due_at,
      due_at,
    );
  }
});

test("API boundary rejects ambiguous local dates and malformed timestamps", () => {
  for (const due_at of [
    "",
    "not-a-date",
    "2026-09-29",
    "2026-09-29T00:00",
    "2026-02-30T00:00:00Z",
    "2026-09-29T00:00:00+07:99",
    "2026-09-29T00:00:00+24:00",
  ]) {
    assert.equal(timestampSchema.safeParse(due_at).success, false, due_at);
    assert.equal(
      taskSchema.safeParse({ ...task, due_at }).success,
      false,
      due_at,
    );
  }
});

test("empty form deadline is null; invalid form input is rejected", () => {
  assert.equal(toDatetimeLocal(null), "");
  assert.equal(fromDatetimeLocal(""), null);
  for (const value of [
    "no-date",
    "2026-02-30T12:30",
    "2026-09-29T25:00",
    "2026-09-29T00:00Z",
  ])
    assert.throws(() => fromDatetimeLocal(value));
});

for (const [timezone, local, changed, expected] of [
  [
    "Asia/Jakarta",
    "2026-09-29T00:00",
    "2026-09-29T01:00",
    "2026-09-28T18:00:00.000Z",
  ],
  ["UTC", "2026-09-28T17:00", "2026-09-28T18:00", "2026-09-28T18:00:00.000Z"],
  [
    "America/New_York",
    "2026-09-28T13:00",
    "2026-09-28T14:00",
    "2026-09-28T18:00:00.000Z",
  ],
]) {
  test(`local form round trip preserves instant and precision in ${timezone}`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import assert from 'node:assert/strict';
      import {toDatetimeLocal,fromDatetimeLocal} from './src/lib/datetime.ts';
      const original='2026-09-28T17:00:12.123456+00:00';
      assert.equal(toDatetimeLocal(original),${JSON.stringify(local)});
      assert.equal(fromDatetimeLocal(${JSON.stringify(local)},original),original);
      assert.equal(fromDatetimeLocal(${JSON.stringify(changed)},original),${JSON.stringify(expected)});
      assert.equal(fromDatetimeLocal(''),null);
    `,
      ],
      { env: { ...process.env, TZ: timezone }, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  });
}

test("DST gap is rejected; unchanged DST-fold deadline keeps the original instant", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import {toDatetimeLocal,fromDatetimeLocal} from './src/lib/datetime.ts';
    assert.throws(()=>fromDatetimeLocal('2026-03-08T02:30'),/does not exist/);
    const later='2026-11-01T01:30:15.123456-05:00';
    assert.equal(toDatetimeLocal(later),'2026-11-01T01:30');
    assert.equal(fromDatetimeLocal('2026-11-01T01:30',later),later);
  `,
    ],
    { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});
