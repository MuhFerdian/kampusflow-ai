import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Task,
  priorityScore,
  metrics,
  isOverdue,
  taskSchema,
} from "../src/lib/model";
const now = Date.parse("2026-09-27T12:00:00Z");
const task: Task = {
  id: "a",
  user_id: "b",
  title: "Assignment",
  description: "",
  course_id: null,
  project_id: null,
  due_at: null,
  importance: 3,
  difficulty: 3,
  estimated_minutes: 60,
  status: "todo",
  progress: 0,
  priority_score: null,
  created_at: "",
  updated_at: "",
};
test("deadline urgency ranks overdue work above distant work", () => {
  assert.ok(
    priorityScore({ ...task, due_at: "2026-09-26T00:00:00Z" }, now) >
      priorityScore({ ...task, due_at: "2026-11-26T00:00:00Z" }, now),
  );
});
test("completed tasks never rank or count as overdue", () => {
  const t = {
    ...task,
    status: "completed" as const,
    progress: 100,
    due_at: "2026-09-01T00:00:00Z",
  };
  assert.equal(priorityScore(t, now), 0);
  assert.equal(isOverdue(t, now), false);
});
test("metrics use real progress and handle empty workspace", () => {
  assert.deepEqual(metrics([]), {
    active: 0,
    completed: 0,
    overdue: 0,
    progress: 0,
  });
  assert.equal(metrics([task, { ...task, progress: 50 }]).progress, 25);
});
test("validation rejects blank titles, invalid durations and mismatched completion", () => {
  assert.equal(taskSchema.safeParse({ ...task, title: "  " }).success, false);
  assert.equal(
    taskSchema.safeParse({ ...task, estimated_minutes: 0 }).success,
    false,
  );
  assert.equal(
    taskSchema.safeParse({ ...task, status: "completed", progress: 50 })
      .success,
    false,
  );
  assert.equal(
    taskSchema.safeParse({ ...task, status: "completed", progress: 100 })
      .success,
    true,
  );
});
test("priority respects importance, remaining progress and effort", () => {
  assert.ok(
    priorityScore({ ...task, importance: 5 }, now) >
      priorityScore({ ...task, importance: 1 }, now),
  );
  assert.ok(
    priorityScore(task, now) > priorityScore({ ...task, progress: 90 }, now),
  );
  assert.ok(
    priorityScore({ ...task, estimated_minutes: 240 }, now) >
      priorityScore(task, now),
  );
});
