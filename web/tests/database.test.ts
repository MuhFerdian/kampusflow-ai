import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { Task, taskSchema } from "../src/lib/model";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
test("migration, CRUD, user isolation, ownership FKs, status constraints and storage policies", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    // Emulates only Supabase's system schemas; the application migration is executed unchanged.
    await db.exec(`create role authenticated; create schema auth; create schema storage; create schema extensions;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;`);
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/202609270001_foundation.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into auth.users values ($1,$3),($2,$3)", [
      a,
      b,
      JSON.stringify({ full_name: "Test Student" }),
    ]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${a}';`);
    assert.equal((await db.query("select * from profiles")).rows.length, 1);
    const course = (
      await db.query<{ id: string }>(
        "insert into courses(user_id,name) values($1,$2) returning id",
        [a, "Intelligent Systems"],
      )
    ).rows[0].id;
    const project = (
      await db.query<{ id: string }>(
        "insert into projects(user_id,name) values($1,$2) returning id",
        [a, "Research"],
      )
    ).rows[0].id;
    const task = (
      await db.query<{ id: string }>(
        "insert into tasks(user_id,title,course_id,project_id) values($1,$2,$3,$4) returning id",
        [a, "Assignment", course, project],
      )
    ).rows[0].id;
    await db.query(
      "update tasks set title='Revised assignment',status='in_progress',progress=40 where id=$1",
      [task],
    );
    assert.equal(
      (
        await db.query<{ progress: number }>(
          "select progress from tasks where id=$1",
          [task],
        )
      ).rows[0].progress,
      40,
    );
    await assert.rejects(
      () => db.query("update tasks set status='completed' where id=$1", [task]),
      /check constraint/,
    );
    // Exercise PostgreSQL's JSON timestamp representation through the same schema
    // used by saveTask, then persist completion without changing the deadline.
    const deadline = "2026-09-29T00:00:12.123456+07:00";
    await db.query("update tasks set due_at=$1 where id=$2", [deadline, task]);
    const row = (
      await db.query<{ task: Task }>(
        "select to_jsonb(t) as task from tasks t where id=$1",
        [task],
      )
    ).rows[0].task;
    assert.match(row.due_at!, /[+-]\d{2}:\d{2}$/);
    const payload = taskSchema.parse({
      ...row,
      status: "completed",
      progress: 100,
    });
    await db.query(
      "update tasks set status=$1,progress=$2,due_at=$3 where id=$4",
      [payload.status, payload.progress, payload.due_at, task],
    );
    const saved = (
      await db.query<{ same: boolean; status: string }>(
        "select due_at=$1::timestamptz as same,status from tasks where id=$2",
        [deadline, task],
      )
    ).rows[0];
    assert.equal(saved.same, true);
    assert.equal(saved.status, "completed");
    await db.exec(`set request.jwt.claim.sub='${b}';`);
    for (const table of [
      "profiles",
      "courses",
      "projects",
      "tasks",
      "study_plans",
      "documents",
      "document_chunks",
    ]) {
      const rows = (await db.query(`select * from ${table}`)).rows;
      assert.equal(rows.length, table === "profiles" ? 1 : 0);
    }
    await assert.rejects(
      () =>
        db.query("insert into tasks(user_id,title) values($1,$2)", [
          a,
          "Spoofed owner",
        ]),
      /row-level security/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into tasks(user_id,title,course_id) values($1,$2,$3)",
          [b, "Foreign course", course],
        ),
      /foreign key/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into tasks(user_id,title,project_id) values($1,$2,$3)",
          [b, "Foreign project", project],
        ),
      /foreign key/,
    );
    assert.equal(
      (
        await db.query("update tasks set title=$1 where id=$2 returning id", [
          "Attack",
          task,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (await db.query("delete from tasks where id=$1 returning id", [task]))
        .rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
          "academic-documents",
          a + "/file.pdf",
        ]),
      /row-level security/,
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values($1,$2)",
      ["academic-documents", b + "/file.pdf"],
    );
    await db.exec(`set request.jwt.claim.sub='${a}';`);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await db.query("delete from courses where id=$1", [course]);
    const retained = (
      await db.query<{ course_id: string | null; user_id: string }>(
        "select course_id,user_id from tasks where id=$1",
        [task],
      )
    ).rows[0];
    assert.equal(retained.course_id, null);
    assert.equal(retained.user_id, a);
    await db.query("delete from projects where id=$1", [project]);
    assert.equal(
      (
        await db.query<{ project_id: string | null }>(
          "select project_id from tasks where id=$1",
          [task],
        )
      ).rows[0].project_id,
      null,
    );
    await db.query("delete from tasks where id=$1", [task]);
    assert.equal((await db.query("select * from tasks")).rows.length, 0);
  } finally {
    await db.close();
  }
});
