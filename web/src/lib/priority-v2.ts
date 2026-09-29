import type { Task } from './model';
export type RankedTask = {
    task_id: string;
    title: string;
    due_at: string | null;
    importance: number;
    difficulty: number;
    estimated_minutes: number;
    progress: number;
    remaining_minutes: number;
    priority_score: number;
    rank: number;
    components: Record<string, number>;
    reason_codes: string[];
    reason: string;
};
export type Recommendations = {
    engine_version: 'v2';
    generated_at: string;
    top_tasks: RankedTask[];
    active_task_count: number;
    remaining_workload_minutes: number;
    context_truncated: boolean;
    ai_available: boolean;
    summary: string;
};
export const reasonLabels: Record<string, string> = { COMPLETED: 'Already completed', NO_DEADLINE: 'No deadline set', OVERDUE: 'Deadline has passed', DUE_WITHIN_24H: 'Due within 24 hours', DUE_WITHIN_72H: 'Due within 3 days', HIGH_IMPORTANCE: 'High importance', DIFFICULT_TASK: 'Challenging work', SUBSTANTIAL_WORK: 'At least 2 hours remaining', NEARLY_DONE: 'Nearly finished' };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const remainingMinutes = (t: Task) => t.status === 'completed' ? 0 : Math.max(1, Math.ceil(t.estimated_minutes * (100 - t.progress) / 100));
export function priorityV2(t: Task, now = Date.now()) {
    let components: Record<string, number> = { deadline: 0, importance: 0, difficulty: 0, effort: 0, remaining_progress: 0 };
    const reason_codes: string[] = [];
    if (t.status === 'completed')
        reason_codes.push('COMPLETED');
    else {
        const hours = t.due_at ? (Date.parse(t.due_at) - now) / 3600000 : null;
        components = { deadline: hours === null ? 0 : round2(45 * Math.max(0, Math.min(1, 1 - hours / 336))), importance: t.importance * 5, difficulty: t.difficulty * 2, effort: round2(10 * Math.min(remainingMinutes(t) / 240, 1)), remaining_progress: round2((100 - t.progress) / 10) };
        if (hours === null)
            reason_codes.push('NO_DEADLINE');
        else if (hours < 0)
            reason_codes.push('OVERDUE');
        else if (hours <= 24)
            reason_codes.push('DUE_WITHIN_24H');
        else if (hours <= 72)
            reason_codes.push('DUE_WITHIN_72H');
        if (t.importance >= 4)
            reason_codes.push('HIGH_IMPORTANCE');
        if (t.difficulty >= 4)
            reason_codes.push('DIFFICULT_TASK');
        if (remainingMinutes(t) >= 120)
            reason_codes.push('SUBSTANTIAL_WORK');
        if (t.progress >= 90)
            reason_codes.push('NEARLY_DONE');
    }
    return { score: Math.min(100, Math.round(Object.values(components).reduce((a, b) => a + b, 0))), components, reason_codes };
}
export function rankTasksV2(tasks: Task[], now = Date.now()): RankedTask[] {
    return tasks.filter(t => t.status !== 'completed').map(t => ({ t, s: priorityV2(t, now) })).sort((a, b) => b.s.score - a.s.score || (a.t.due_at ? Date.parse(a.t.due_at) : Infinity) - (b.t.due_at ? Date.parse(b.t.due_at) : Infinity) || Date.parse(a.t.created_at) - Date.parse(b.t.created_at) || a.t.id.localeCompare(b.t.id)).map(({ t, s }, i) => ({ task_id: t.id, title: t.title, due_at: t.due_at, importance: t.importance, difficulty: t.difficulty, estimated_minutes: t.estimated_minutes, progress: t.progress, remaining_minutes: remainingMinutes(t), priority_score: s.score, components: s.components, reason_codes: s.reason_codes, rank: i + 1, reason: s.reason_codes.map(r => reasonLabels[r]).join('; ') || 'Ranked by importance, effort and remaining progress' }));
}
export function localRecommendations(tasks: Task[], now = Date.now()): Recommendations {
    const active = tasks.filter(t => t.status !== 'completed').sort((a, b) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity) || b.importance - a.importance || a.id.localeCompare(b.id));
    const ranked = rankTasksV2(active.slice(0, 200), now);
    return { engine_version: 'v2', generated_at: new Date(now).toISOString(), top_tasks: ranked, active_task_count: ranked.length, remaining_workload_minutes: ranked.reduce((n, t) => n + t.remaining_minutes, 0), context_truncated: active.length > 200, ai_available: false, summary: ranked.length ? `${ranked.length} active tasks in this overview.` : 'No active tasks. You are all caught up.' };
}
