import { z } from "zod";
import { timestampSchema } from "./datetime";
export type Status = "todo" | "in_progress" | "completed";
export type Course = {
  id: string;
  user_id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  created_at: string;
};
export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: Status;
  created_at: string;
};
export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  course_id: string | null;
  project_id: string | null;
  due_at: string | null;
  importance: number;
  difficulty: number;
  estimated_minutes: number;
  status: Status;
  progress: number;
  priority_score: number | null;
  created_at: string;
  updated_at: string;
};
export const taskSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a task title").max(200),
    description: z.string().max(10000),
    course_id: z.string().uuid().nullable(),
    project_id: z.string().uuid().nullable(),
    due_at: timestampSchema.nullable(),
    importance: z.number().int().min(1).max(5),
    difficulty: z.number().int().min(1).max(5),
    estimated_minutes: z.number().int().min(1).max(10080),
    status: z.enum(["todo", "in_progress", "completed"]),
    progress: z.number().int().min(0).max(100),
  })
  .refine((t) => (t.status === "completed") === (t.progress === 100), {
    message: "Completed tasks must have 100% progress",
  });
export const entitySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  description: z.string().max(10000),
});
export const statusLabel: Record<Status, string> = {
  todo: "To do",
  in_progress: "In progress",
  completed: "Completed",
};
export function isOverdue(t: Task, now = Date.now()) {
  return (
    t.status !== "completed" && !!t.due_at && new Date(t.due_at).getTime() < now
  );
}
// Versioned deterministic heuristic: no LLM dependency. Recomputed at read time as deadlines age.
export function priorityScore(t: Task, now = Date.now()): number {
  if (t.status === "completed") return 0;
  const hours = t.due_at
    ? (new Date(t.due_at).getTime() - now) / 3600000
    : Infinity;
  const urgency =
    hours <= 0
      ? 1
      : hours <= 24
        ? 0.9
        : hours <= 72
          ? 0.7
          : hours <= 168
            ? 0.45
            : hours <= 336
              ? 0.2
              : 0;
  return Math.round(
    100 *
      (0.45 * urgency +
        (0.25 * t.importance) / 5 +
        (0.1 * t.difficulty) / 5 +
        0.1 * Math.min(t.estimated_minutes / 240, 1) +
        0.1 * (1 - t.progress / 100)),
  );
}
export function metrics(list: Task[], now = Date.now()) {
  return {
    active: list.filter((t) => t.status !== "completed").length,
    completed: list.filter((t) => t.status === "completed").length,
    overdue: list.filter((t) => isOverdue(t, now)).length,
    progress: list.length
      ? Math.round(list.reduce((s, t) => s + t.progress, 0) / list.length)
      : 0,
  };
}
