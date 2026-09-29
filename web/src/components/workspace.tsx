"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  ListTodo,
  BookOpen,
  FolderKanban,
  CalendarDays,
  Files,
  Sparkles,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Check,
  Clock,
  AlertCircle,
  Search,
  LogOut,
  X,
  Pencil,
  Trash2,
  GraduationCap,
  Menu,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { supabase, configured } from "@/lib/supabase";
import { RecommendationCard, PlannerPage, AssistantPage } from "@/components/phase2";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/datetime";
import {
  Course,
  Project,
  Task,
  Status,
  statusLabel,
  priorityScore,
  isOverdue,
  metrics,
} from "@/lib/model";
import {
  loadWorkspace,
  saveTask,
  saveEntity,
  removeRecord,
} from "@/lib/repository";
const navigation = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["tasks", "Tasks", ListTodo],
  ["courses", "Courses", BookOpen],
  ["projects", "Projects", FolderKanban],
  ["planner", "Planner", CalendarDays],
  ["materials", "Materials", Files],
  ["ai-assistant", "AI Assistant", Sparkles],
  ["settings", "Settings", Settings],
] as const;
const blankTask = {
  title: "",
  description: "",
  course_id: null,
  project_id: null,
  due_at: null,
  importance: 3,
  difficulty: 3,
  estimated_minutes: 60,
  status: "todo" as Status,
  progress: 0,
};
const dateLabel = (date: string | null) =>
  date
    ? new Date(date).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No deadline";
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={24} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="modal"
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export default function Workspace({
  initialPage = "dashboard",
}: {
  initialPage?: string;
}) {
  const router = useRouter();
  const page =
    initialPage === "login" || initialPage === "register"
      ? "dashboard"
      : initialPage;
  const [user, setUser] = useState<User | null>(null),
    [authLoading, setAuthLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [menu, setMenu] = useState(false);
  const [data, setData] = useState<{
    tasks: Task[];
    courses: Course[];
    projects: Project[];
  }>({ tasks: [], courses: [], projects: [] });
  const [editor, setEditor] = useState<{
      kind: "task" | "course" | "project";
      item?: Task | Course | Project;
    } | null>(null),
    [deletion, setDeletion] = useState<{
      table: "tasks" | "courses" | "projects";
      id: string;
      name: string;
    } | null>(null);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [courseFilter, setCourseFilter] = useState("all"),
    [sort, setSort] = useState("priority");
  const refresh = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      setData(await loadWorkspace(uid));
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load your workspace",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setUser(data.session?.user || null);
        setAuthLoading(false);
        if (error) setError(error.message);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session) setData({ tasks: [], courses: [], projects: [] });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (user) void refresh(user.id);
  }, [user, refresh]);
  async function mutate(fn: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditor(null);
      setDeletion(null);
      setNotice(message);
      if (user) await refresh(user.id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const stats = metrics(data.tasks),
    active = data.tasks.filter((t) => t.status !== "completed"),
    priorities = [...active]
      .sort((a, b) => priorityScore(b) - priorityScore(a))
      .slice(0, 3);
  const deadlines = [...active]
    .filter((t) => t.due_at)
    .sort(
      (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime(),
    )
    .slice(0, 4);
  const visible = data.tasks
    .filter(
      (t) =>
        (t.title + " " + t.description)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "all" ||
          (filter === "overdue" ? isOverdue(t) : t.status === filter)) &&
        (courseFilter === "all" || t.course_id === courseFilter),
    )
    .sort((a, b) =>
      sort === "priority"
        ? priorityScore(b) - priorityScore(a)
        : sort === "deadline"
          ? (a.due_at ? Date.parse(a.due_at) : Infinity) -
            (b.due_at ? Date.parse(b.due_at) : Infinity)
          : sort === "progress"
            ? b.progress - a.progress
            : Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  if (authLoading)
    return (
      <div className="auth-wrap">
        <div className="loader" /> <p>Opening your workspace…</p>
      </div>
    );
  if (configured && !user)
    return <Auth initialRegister={initialPage === "register"} />;
  const name =
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "student";
  const createButton = (
    <button
      className="button primary"
      disabled={!user || loading}
      onClick={() => setEditor({ kind: "task" })}
    >
      <Plus size={17} /> New task
    </button>
  );
  function TaskRow({ task, index }: { task: Task; index?: number }) {
    const course = data.courses.find((c) => c.id === task.course_id);
    return (
      <div className={"task-row " + (isOverdue(task) ? "overdue-row" : "")}>
        <button
          className={
            "task-check " + (task.status === "completed" ? "checked" : "")
          }
          aria-label={
            task.status === "completed"
              ? `Reopen ${task.title}`
              : `Complete ${task.title}`
          }
          disabled={busy}
          onClick={() =>
            user &&
            void mutate(
              () =>
                saveTask(
                  user.id,
                  {
                    ...task,
                    status: task.status === "completed" ? "todo" : "completed",
                    progress: task.status === "completed" ? 0 : 100,
                  },
                  task.id,
                ),
              "Task updated",
            )
          }
        >
          <Check size={14} />
        </button>
        <div className="task-main">
          <button
            className="task-title"
            onClick={() => setEditor({ kind: "task", item: task })}
          >
            {task.title}
          </button>
          <div className="task-meta">
            {course && <span>{course.code || course.name}</span>}
            <span className={isOverdue(task) ? "danger-text" : ""}>
              <Clock size={12} />
              {dateLabel(task.due_at)}
              {isOverdue(task) && " · Overdue"}
            </span>
          </div>
        </div>
        <div className="task-end">
          <span className={"badge " + task.status}>
            {statusLabel[task.status]}
          </span>
          <span className="score">
            {priorityScore(task)} <span>priority</span>
          </span>
          <button
            className="icon-button"
            aria-label={`Edit ${task.title}`}
            onClick={() => setEditor({ kind: "task", item: task })}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button danger"
            aria-label={`Delete ${task.title}`}
            onClick={() =>
              setDeletion({ table: "tasks", id: task.id, name: task.title })
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Link href="/dashboard/" className="brand">
          <span className="brand-icon">
            <GraduationCap size={24} />
          </span>
          <span>
            KampusFlow<span className="ai-label">AI</span>
          </span>
        </Link>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {navigation.map(([id, label, Icon]) => (
            <Link
              onClick={() => setMenu(false)}
              className={page === id ? "nav-link selected" : "nav-link"}
              href={`/${id}/`}
              key={id}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "tasks" && stats.active > 0 && <b>{stats.active}</b>}

            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="focus-note">
            <Sparkles size={18} />
            <strong>A little progress, every day.</strong>
            <p>Make space for your next big idea.</p>
          </div>
          <div className="profile">
            <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>
                {user?.user_metadata?.full_name || "Your workspace"}
              </strong>
              <small>{user ? "Personal account" : "Setup required"}</small>
            </div>
            {user && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() =>
                  void mutate(async () => {
                    const { error } = await supabase!.auth.signOut();
                    if (error) throw error;
                    router.push("/login/");
                  }, "Signed out")
                }
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <button
              className="icon-button menu-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={14} />{" "}
              <strong>
                {navigation.find((n) => n[0] === page)?.[1] || "Dashboard"}
              </strong>
            </span>
          </div>
          <span className="top-date">
            <CalendarDays size={16} />
            {new Date().toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </header>
        <div className="content">
          {!configured && (
            <div className="setup-banner">
              <AlertCircle size={20} />
              <div>
                <strong>Connect your workspace to get started</strong>
                <p>
                  Supabase isn’t configured yet. Follow the setup guide to
                  enable sign-in and save your academic data.
                </p>
              </div>
              <Link href="/settings/">
                Setup details <ArrowRight size={16} />
              </Link>
            </div>
          )}
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button onClick={() => user && void refresh(user.id)}>
                Retry loading
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-panel">
              <div className="loader" />
              <p>Loading your academic data…</p>
            </div>
          ) : (
            <>
              {page === "dashboard" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">YOUR ACADEMIC OVERVIEW</div>
                      <h1>
                        Good{" "}
                        {new Date().getHours() < 12
                          ? "morning"
                          : new Date().getHours() < 18
                            ? "afternoon"
                            : "evening"}
                        , {name}
                        <span className="greeting-dot">.</span>
                      </h1>
                      <p>Clear your mind. Find your focus. Move forward.</p>
                    </div>
                    {createButton}
                  </div>
                  <div className="stats-grid">
                    {[
                      [
                        ListTodo,
                        "Active tasks",
                        stats.active,
                        "Ready for your next step",
                        "purple",
                      ],
                      [
                        CheckCircle2,
                        "Completed tasks",
                        stats.completed,
                        "Small wins add up",
                        "teal",
                      ],
                      [
                        AlertCircle,
                        "Overdue tasks",
                        stats.overdue,
                        stats.overdue
                          ? "Let’s get back on track"
                          : "You’re all caught up",
                        "orange",
                      ],
                      [
                        CalendarDays,
                        "Overall progress",
                        `${stats.progress}%`,
                        "Across all your tasks",
                        "blue",
                      ],
                    ].map(([Icon, label, value, caption, color]) => {
                      const I = Icon as typeof ListTodo;
                      return (
                        <div className="stat-card" key={String(label)}>
                          <div className="stat-top">
                            <span>{String(label)}</span>
                            <span className={`stat-icon ${color}`}>
                              <I size={18} />
                            </span>
                          </div>
                          <strong className="stat-value">
                            {String(value)}
                          </strong>
                          <p>{String(caption)}</p>
                          {label === "Overall progress" && (
                            <div className="progress-track">
                              <i style={{ width: stats.progress + "%" }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="dashboard-grid">
                    <div className="main-column">
                      <section className="panel priority-panel">
                        <div className="panel-heading">
                          <h2>
                            <span className="purple-text">
                              <Sparkles size={19} />
                            </span>{" "}
                            Today’s priority{" "}
                            <span className="subtle-chip">
                              {priorities.length} tasks
                            </span>
                          </h2>
                          <Link href="/tasks/">
                            View all <ArrowUpRight size={15} />
                          </Link>
                        </div>
                        {priorities.length ? (
                          <>
                            <p className="panel-description">
                              Your next steps, ranked by deadline, importance,
                              and effort.
                            </p>
                            {priorities.map((t, i) => (
                              <TaskRow key={t.id} task={t} index={i} />
                            ))}
                          </>
                        ) : (
                          <Empty
                            title="A fresh start, a clear head"
                            description="Add your first task and turn that to-do list into a plan."
                            action={createButton}
                          />
                        )}
                      </section>
                      <section className="panel">
                        <div className="panel-heading">
                          <h2>
                            <FolderKanban size={19} /> Recent projects
                          </h2>
                          <Link href="/projects/">
                            All projects <ArrowUpRight size={15} />
                          </Link>
                        </div>
                        {data.projects.length ? (
                          <div className="project-grid">
                            {data.projects.slice(0, 4).map((p) => {
                              const ts = data.tasks.filter(
                                (t) => t.project_id === p.id,
                              );
                              return (
                                <button
                                  className="project-card"
                                  key={p.id}
                                  onClick={() => router.push("/projects/")}
                                >
                                  <span className="project-symbol">
                                    <FolderKanban size={21} />
                                  </span>
                                  <h3>{p.name}</h3>
                                  <p>
                                    {ts.length} tasks · {statusLabel[p.status]}
                                  </p>
                                  <div className="progress-label">
                                    <span>Progress</span>
                                    <strong>{metrics(ts).progress}%</strong>
                                  </div>
                                  <div className="progress-track">
                                    <i
                                      style={{
                                        width: metrics(ts).progress + "%",
                                      }}
                                    />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <Empty
                            title="Big ideas start here"
                            description="Group related tasks into a project and keep the whole picture in view."
                            action={
                              <Link className="text-link" href="/projects/">
                                Create a project <ArrowRight size={15} />
                              </Link>
                            }
                          />
                        )}
                      </section>
                    </div>
                    <div className="right-column">
                      <section className="panel">
                        <div className="panel-heading">
                          <h2>
                            <CalendarDays size={19} /> Upcoming deadlines
                          </h2>
                        </div>
                        {deadlines.length ? (
                          <div className="deadlines">
                            {deadlines.map((t) => (
                              <button
                                key={t.id}
                                className="deadline-item"
                                onClick={() =>
                                  setEditor({ kind: "task", item: t })
                                }
                              >
                                <div
                                  className={
                                    "date-tile " + (isOverdue(t) ? "late" : "")
                                  }
                                >
                                  <span>
                                    {new Date(t.due_at!).toLocaleDateString(
                                      undefined,
                                      { month: "short" },
                                    )}
                                  </span>
                                  <strong>
                                    {new Date(t.due_at!).getDate()}
                                  </strong>
                                </div>
                                <div>
                                  <strong>{t.title}</strong>
                                  <small
                                    className={
                                      isOverdue(t) ? "danger-text" : ""
                                    }
                                  >
                                    {isOverdue(t)
                                      ? "Overdue"
                                      : dateLabel(t.due_at)}
                                  </small>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            title="Room to breathe"
                            description="Tasks with deadlines will appear here."
                          />
                        )}
                      </section>
                      <RecommendationCard tasks={data.tasks} userId={user?.id} />
                    </div>
                  </div>
                </>
              )}
              {page === "tasks" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">ONE STEP AT A TIME</div>
                      <h1>
                        Your tasks<span className="greeting-dot">.</span>
                      </h1>
                      <p>A place for everything you need to get done.</p>
                    </div>
                    {createButton}
                  </div>
                  <section className="panel">
                    <div className="toolbar">
                      <label className="search-input">
                        <Search size={18} />
                        <input
                          aria-label="Search tasks"
                          placeholder="Search your tasks…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Filter by course"
                        value={courseFilter}
                        onChange={(e) => setCourseFilter(e.target.value)}
                      >
                        <option value="all">All courses</option>
                        {data.courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Sort tasks"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="priority">Highest priority</option>
                        <option value="deadline">Nearest deadline</option>
                        <option value="newest">Newest first</option>
                        <option value="progress">Most progress</option>
                      </select>
                    </div>
                    <div className="filter-tabs">
                      {[
                        ["all", "All tasks"],
                        ["todo", "To do"],
                        ["in_progress", "In progress"],
                        ["completed", "Completed"],
                        ["overdue", "Overdue"],
                      ].map(([id, label]) => (
                        <button
                          className={filter === id ? "active" : ""}
                          key={id}
                          onClick={() => setFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {visible.length ? (
                      visible.map((t) => <TaskRow key={t.id} task={t} />)
                    ) : (
                      <Empty
                        title={
                          data.tasks.length
                            ? "No matching tasks"
                            : "Your next chapter starts with one task"
                        }
                        description={
                          data.tasks.length
                            ? "Try another search or filter."
                            : "Add an assignment, a study session, or the next step in your project."
                        }
                        action={data.tasks.length ? undefined : createButton}
                      />
                    )}
                  </section>
                </>
              )}
              {(page === "courses" || page === "projects") && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        {page === "courses"
                          ? "YOUR LEARNING, ORGANIZED"
                          : "FROM IDEA TO DONE"}
                      </div>
                      <h1>
                        {page === "courses" ? "Your courses" : "Your projects"}
                        <span className="greeting-dot">.</span>
                      </h1>
                      <p>
                        {page === "courses"
                          ? "Keep every subject and assignment connected."
                          : "Give your ambitions a little structure."}
                      </p>
                    </div>
                    <button
                      className="button primary"
                      disabled={!user}
                      onClick={() =>
                        setEditor({
                          kind: page === "courses" ? "course" : "project",
                        })
                      }
                    >
                      <Plus size={17} /> New{" "}
                      {page === "courses" ? "course" : "project"}
                    </button>
                  </div>
                  {data[page].length ? (
                    <div className="entity-grid">
                      {data[page].map((item) => {
                        const ts = data.tasks.filter((t) =>
                          page === "courses"
                            ? t.course_id === item.id
                            : t.project_id === item.id,
                        );
                        return (
                          <section className="panel entity-card" key={item.id}>
                            <div className="entity-top">
                              <span className="project-symbol">
                                {page === "courses" ? (
                                  <BookOpen />
                                ) : (
                                  <FolderKanban />
                                )}
                              </span>
                              <div>
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${item.name}`}
                                  onClick={() =>
                                    setEditor({
                                      kind:
                                        page === "courses"
                                          ? "course"
                                          : "project",
                                      item,
                                    })
                                  }
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="icon-button danger"
                                  aria-label={`Delete ${item.name}`}
                                  onClick={() =>
                                    setDeletion({
                                      table: page,
                                      id: item.id,
                                      name: item.name,
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                            <h2>{item.name}</h2>
                            <span className="badge">
                              {"code" in item
                                ? item.code || "Course"
                                : statusLabel[item.status]}
                            </span>
                            <p>{item.description || "No description yet."}</p>
                            <div className="progress-label">
                              <span>{ts.length} tasks</span>
                              <strong>{metrics(ts).progress}% complete</strong>
                            </div>
                            <div className="progress-track">
                              <i
                                style={{ width: metrics(ts).progress + "%" }}
                              />
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <section className="panel">
                      <Empty
                        title={`Make space for your ${page}`}
                        description={`Create your first ${page === "courses" ? "course to organize assignments by subject" : "project to connect tasks to a bigger goal"}.`}
                        action={
                          <button
                            className="button secondary"
                            disabled={!user}
                            onClick={() =>
                              setEditor({
                                kind: page === "courses" ? "course" : "project",
                              })
                            }
                          >
                            <Plus size={16} /> Add{" "}
                            {page === "courses" ? "course" : "project"}
                          </button>
                        }
                      />
                    </section>
                  )}
                </>
              )}
              {page === "planner" && <PlannerPage tasks={data.tasks} userId={user?.id} />}
              {page === "ai-assistant" && <AssistantPage tasks={data.tasks} userId={user?.id} />}
              {page === "materials" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">A FOUNDATION TO BUILD ON</div>
                      <h1>{navigation.find((n) => n[0] === page)?.[1]}</h1>
                    </div>
                    <span className="subtle-chip">COMING NEXT</span>
                  </div>
                  <section className="panel">
                    <Empty
                      title="Your academic knowledge, in one place"
                      description="Document uploads and search are planned for a later phase."
                      action={
                        <Link className="button secondary" href="/tasks/">
                          Go to tasks <ArrowRight size={16} />
                        </Link>
                      }
                    />
                  </section>
                </>
              )}
              {page === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">YOUR WORKSPACE</div>
                      <h1>Settings</h1>
                      <p>Account and connection information.</p>
                    </div>
                  </div>
                  <section className="panel settings-panel">
                    <h2>Account</h2>
                    <p>{user?.email || "Not signed in"}</p>
                    <h2>Database connection</h2>
                    <span
                      className={"badge " + (configured ? "completed" : "todo")}
                    >
                      {configured
                        ? "Supabase configured"
                        : "Configuration required"}
                    </span>
                    {!configured && (
                      <>
                        <p>
                          Set these public environment variables in{" "}
                          <code>web/.env.local</code>, run the database
                          migration, then rebuild the web application.
                        </p>
                        <pre>
                          NEXT_PUBLIC_SUPABASE_URL{`\n`}
                          NEXT_PUBLIC_SUPABASE_ANON_KEY
                        </pre>
                        <p>
                          Use the project URL and publishable / anon key from
                          your own Supabase project. The README contains the
                          complete setup steps.
                        </p>
                      </>
                    )}
                    <h2>Priority engine · v1</h2>
                    <p>
                      Deadline urgency 45% · importance 25% · difficulty 10% ·
                      estimated effort 10% · remaining progress 10%. Scores are
                      computed when the workspace renders. AI is not used.
                    </p>
                    <h2>Phase 1</h2>
                    <p>
                      Task, course, and project management remain available. V2
                      recommendations and Daily Planner use deterministic logic.
                      AI explanations require a configured backend; document uploads are deferred.
                    </p>
                  </section>
                </>
              )}
            </>
          )}
        </div>
        <footer className="app-footer">
          <span>KampusFlow AI</span>
          <span>A little more clarity. A little more progress.</span>
        </footer>
      </main>
      {editor && (
        <Modal
          title={`${editor.item ? "Edit" : "New"} ${editor.kind}`}
          onClose={() => !busy && setEditor(null)}
        >
          <RecordForm
            key={editor.item?.id || editor.kind}
            editor={editor}
            courses={data.courses}
            projects={data.projects}
            busy={busy}
            error={error}
            onCancel={() => setEditor(null)}
            onSave={async (value) => {
              if (!user) return;
              await mutate(
                () =>
                  editor.kind === "task"
                    ? saveTask(user.id, value, editor.item?.id)
                    : saveEntity(
                        editor.kind === "course" ? "courses" : "projects",
                        user.id,
                        value as { name: string; description: string },
                        editor.item?.id,
                      ),
                `${editor.kind[0].toUpperCase() + editor.kind.slice(1)} saved`,
              );
            }}
          />
        </Modal>
      )}
      {deletion && (
        <Modal
          title="Delete this item?"
          onClose={() => !busy && setDeletion(null)}
        >
          <p className="modal-copy">
            Delete “{deletion.name}”? This cannot be undone.
            {deletion.table !== "tasks"
              ? " Linked tasks will be kept without this association."
              : ""}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeletion(null)}
            >
              Cancel
            </button>
            <button
              className="button destructive"
              disabled={busy}
              onClick={() =>
                user &&
                void mutate(
                  () => removeRecord(deletion.table, user.id, deletion.id),
                  "Item deleted",
                )
              }
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Auth({ initialRegister }: { initialRegister: boolean }) {
  const [register, setRegister] = useState(initialRegister),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const email = String(f.get("email")).trim(),
        password = String(f.get("password"));
      if (register) {
        const { data, error } = await supabase!.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: String(f.get("name")).trim() },
            emailRedirectTo: window.location.origin + "/dashboard/",
          },
        });
        if (error) throw error;
        if (!data.session)
          setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase!.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <GraduationCap />
          </span>
          KampusFlow<span className="ai-label">AI</span>
        </Link>
        <div>
          <div className="eyebrow">LESS CHAOS. MORE CLARITY.</div>
          <h1>
            Your campus life.
            <br />
            <span>In a better flow.</span>
          </h1>
          <p>
            Bring your courses, deadlines, and big ideas together. One focused
            workspace. Your next step, clearer.
          </p>
          <div className="auth-pills">
            <span>
              <BookOpen size={17} /> Courses
            </span>
            <span>
              <ListTodo size={17} /> Tasks
            </span>
            <span>
              <FolderKanban size={17} /> Projects
            </span>
          </div>
        </div>
        <small>Built for the student. Designed for the journey.</small>
      </div>
      <div className="auth-form-area">
        <form onSubmit={submit} className="auth-form">
          <div className="eyebrow">YOUR PERSONAL WORKSPACE</div>
          <h2>{register ? "Start your next chapter" : "Welcome back"}</h2>
          <p>
            {register
              ? "A little organization goes a long way."
              : "Let’s make room for what matters today."}
          </p>
          {register && (
            <label>
              Full name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                placeholder="Your name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@university.edu"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={8}
              maxLength={128}
              placeholder="At least 8 characters"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="success-text">
              {message}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </button>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to KampusFlow?"}{" "}
            <button
              type="button"
              onClick={() => {
                setRegister(!register);
                setError("");
                setMessage("");
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
function RecordForm({
  editor,
  courses,
  projects,
  busy,
  error,
  onCancel,
  onSave,
}: {
  editor: {
    kind: "task" | "course" | "project";
    item?: Task | Course | Project;
  };
  courses: Course[];
  projects: Project[];
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (v: unknown) => Promise<void>;
}) {
  const task = editor.kind === "task";
  const original = editor.item;
  const initial = task
    ? { ...blankTask, ...original }
    : original || { name: "", description: "", code: "", status: "todo" };
  const [status, setStatus] = useState<Status>(
      (initial as Task).status || "todo",
    ),
    [progress, setProgress] = useState((initial as Task).progress || 0),
    [validation, setValidation] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidation("");
    const f = new FormData(e.currentTarget);
    try {
      if (task) {
        const date = String(f.get("due_at"));
        await onSave({
          title: String(f.get("title")).trim(),
          description: String(f.get("description")),
          course_id: f.get("course_id") || null,
          project_id: f.get("project_id") || null,
          due_at: fromDatetimeLocal(date, (initial as Task).due_at),
          importance: Number(f.get("importance")),
          difficulty: Number(f.get("difficulty")),
          estimated_minutes: Number(f.get("estimated_minutes")),
          status,
          progress,
        });
      } else
        await onSave({
          name: String(f.get("name")).trim(),
          description: String(f.get("description")),
          code: String(f.get("code") || ""),
          status,
        });
    } catch (error) {
      setValidation(
        error instanceof Error
          ? error.message
          : "Please check the fields and try again.",
      );
    }
  }
  return (
    <form onSubmit={submit} className="record-form">
      <fieldset disabled={busy}>
        <label>
          {task ? "Task title" : "Name"}
          <input
            name={task ? "title" : "name"}
            required
            maxLength={task ? 200 : 120}
            defaultValue={
              task ? (initial as Task).title : (initial as Course).name
            }
            placeholder={
              task
                ? "What’s your next step?"
                : editor.kind === "course"
                  ? "e.g. Intelligent Systems"
                  : "e.g. Final year research"
            }
          />
        </label>
        {editor.kind === "course" && (
          <label>
            Course code
            <input
              name="code"
              maxLength={30}
              defaultValue={(initial as Course).code}
              placeholder="e.g. CS301"
            />
          </label>
        )}
        <label>
          Description
          <textarea
            name="description"
            rows={3}
            maxLength={10000}
            defaultValue={initial.description}
            placeholder="Add a little context…"
          />
        </label>
        {task && (
          <>
            <div className="form-grid">
              <label>
                Course
                <select
                  name="course_id"
                  defaultValue={(initial as Task).course_id || ""}
                >
                  <option value="">No course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Project
                <select
                  name="project_id"
                  defaultValue={(initial as Task).project_id || ""}
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Deadline <small>(your local time)</small>
                <input
                  type="datetime-local"
                  name="due_at"
                  defaultValue={toDatetimeLocal((initial as Task).due_at)}
                />
              </label>
              <label>
                Estimated minutes
                <input
                  name="estimated_minutes"
                  type="number"
                  required
                  min={1}
                  max={10080}
                  defaultValue={(initial as Task).estimated_minutes}
                />
              </label>
            </div>
            <div className="form-grid">
              {(["importance", "difficulty"] as const).map((field) => (
                <label key={field}>
                  {field === "importance" ? "Importance" : "Difficulty"}
                  <select name={field} defaultValue={(initial as Task)[field]}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} —{" "}
                        {n === 1
                          ? "Very low"
                          : n === 2
                            ? "Low"
                            : n === 3
                              ? "Medium"
                              : n === 4
                                ? "High"
                                : "Very high"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
        {editor.kind !== "course" && (
          <div className="form-grid">
            <label>
              Status
              <select
                value={status}
                onChange={(e) => {
                  const s = e.target.value as Status;
                  setStatus(s);
                  if (task)
                    setProgress(
                      s === "completed" ? 100 : progress === 100 ? 0 : progress,
                    );
                }}
              >
                {Object.entries(statusLabel).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {task && (
              <label>
                Progress (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  required
                  value={progress}
                  onChange={(e) => {
                    const p = Number(e.target.value);
                    setProgress(p);
                    if (p === 100) setStatus("completed");
                    else if (status === "completed")
                      setStatus(p === 0 ? "todo" : "in_progress");
                  }}
                />
              </label>
            )}
          </div>
        )}
        {(error || validation) && (
          <p role="alert" className="form-error">
            {validation || error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            {busy ? "Saving…" : `Save ${editor.kind}`}
            <Check size={16} />
          </button>
        </div>
      </fieldset>
    </form>
  );
}
