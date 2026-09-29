import { supabase } from "./supabase";
import { Course, Project, Task, taskSchema, entitySchema } from "./model";
function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}
export async function loadWorkspace(userId: string) {
  const results = await Promise.all([
    client()
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    client().from("courses").select("*").eq("user_id", userId).order("name"),
    client()
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  for (const r of results) if (r.error) throw new Error(r.error.message);
  return {
    tasks: results[0].data as Task[],
    courses: results[1].data as Course[],
    projects: results[2].data as Project[],
  };
}
export async function saveTask(userId: string, input: unknown, id?: string) {
  const payload = {
    ...taskSchema.parse(input),
    user_id: userId,
    priority_score: null,
  };
  const q = id
    ? client().from("tasks").update(payload).eq("id", id).eq("user_id", userId)
    : client().from("tasks").insert(payload);
  const { error } = await q.select().single();
  if (error) throw new Error(error.message);
}
export async function saveEntity(
  table: "courses" | "projects",
  userId: string,
  input: { name: string; description: string; code?: string; status?: string },
  id?: string,
) {
  const base = entitySchema.parse(input);
  const payload: {
    name: string;
    description: string;
    user_id: string;
    code?: string;
    status?: string;
  } = {
    ...base,
    user_id: userId,
    ...(table === "courses"
      ? { code: (input.code || "").slice(0, 30) }
      : { status: input.status || "todo" }),
  };
  const q = id
    ? client().from(table).update(payload).eq("id", id).eq("user_id", userId)
    : client().from(table).insert(payload);
  const { error } = await q.select().single();
  if (error) throw new Error(error.message);
}
export async function removeRecord(
  table: "tasks" | "courses" | "projects",
  userId: string,
  id: string,
) {
  const { error } = await client()
    .from(table)
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
}
