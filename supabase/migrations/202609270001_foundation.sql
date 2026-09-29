begin;
create extension if not exists vector with schema extensions;
create type public.task_status as enum ('todo','in_progress','completed');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '' check(length(full_name)<=100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.courses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), code text not null default '' check(length(code)<=30),
 description text not null default '', color text not null default '#8b8fff',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), description text not null default '',
 status public.task_status not null default 'todo',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 course_id uuid, project_id uuid, title text not null check(length(trim(title)) between 1 and 200),
 description text not null default '' check(length(description)<=10000), due_at timestamptz,
 importance integer not null default 3 check(importance between 1 and 5),
 difficulty integer not null default 3 check(difficulty between 1 and 5),
 estimated_minutes integer not null default 60 check(estimated_minutes between 1 and 10080),
 status public.task_status not null default 'todo', progress integer not null default 0 check(progress between 0 and 100),
 priority_score numeric check(priority_score between 0 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id),
 foreign key(course_id,user_id) references public.courses(id,user_id) on delete set null (course_id),
 foreign key(project_id,user_id) references public.projects(id,user_id) on delete set null (project_id),
 check((status='completed' and progress=100) or (status<>'completed' and progress<100))
);
create table public.study_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid, title text not null, starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(task_id,user_id) references public.tasks(id,user_id) on delete set null (task_id)
);
create table public.documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 course_id uuid, project_id uuid, title text not null, storage_path text not null, mime_type text,
 processing_status text not null default 'pending' check(processing_status in ('pending','processing','ready','failed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id),
 foreign key(course_id,user_id) references public.courses(id,user_id) on delete set null (course_id),
 foreign key(project_id,user_id) references public.projects(id,user_id) on delete set null (project_id)
);
create table public.document_chunks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 document_id uuid not null, chunk_index integer not null check(chunk_index>=0), content text not null,
 embedding extensions.vector, embedding_model text, metadata jsonb not null default '{}',
 created_at timestamptz not null default now(), unique(document_id,chunk_index),
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade
);
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create function public.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),100)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();
insert into public.profiles(id,full_name) select id,left(coalesce(raw_user_meta_data->>'full_name',''),100) from auth.users on conflict do nothing;
do $$ declare t text; begin
 foreach t in array array['profiles','courses','projects','tasks','study_plans','documents','document_chunks'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid()) = %I) with check ((select auth.uid()) = %I)',t,case when t='profiles' then 'id' else 'user_id' end,case when t='profiles' then 'id' else 'user_id' end);
 execute format('grant select, insert, update, delete on public.%I to authenticated',t);
 if t<>'document_chunks' then execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t); end if;
 if t<>'profiles' then execute format('create index on public.%I(user_id)',t); end if;
 end loop;
end $$;
create index tasks_due_at_idx on public.tasks(user_id,due_at) where status<>'completed';
create index tasks_course_idx on public.tasks(course_id,user_id);
create index tasks_project_idx on public.tasks(project_id,user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('academic-documents','academic-documents',false,20971520,array['application/pdf','text/plain']) on conflict do nothing;
create policy own_document_objects on storage.objects for all to authenticated
 using(bucket_id='academic-documents' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check(bucket_id='academic-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
