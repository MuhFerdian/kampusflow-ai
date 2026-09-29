import type { Task } from './model';
import { localRecommendations } from './priority-v2';
export type PlannerInput = {
    starts_at: string;
    ends_at: string;
    focus_minutes: number;
    break_minutes: number;
};
export type PlanBlock = {
    kind: 'task' | 'break';
    task_id: string | null;
    title: string;
    starts_at: string;
    ends_at: string;
    minutes: number;
    past_deadline: boolean;
};
export type Plan = {
    engine_version: 'v2';
    blocks: PlanBlock[];
    scheduled_minutes: number;
    break_minutes: number;
    remaining_workload_minutes: number;
    unscheduled_tasks: {
        task_id: string;
        title: string;
        remaining_minutes: number;
        reason: string;
    }[];
    available_minutes: number;
    unused_minutes: number;
    context_truncated: boolean;
    source: string;
};
export function generateLocalPlan(tasks: Task[], options: PlannerInput, now = Date.now()): Plan {
    const start = Date.parse(options.starts_at), end = Date.parse(options.ends_at), available = Math.floor((end - start) / 60000);
    if (!Number.isFinite(start) || !Number.isFinite(end) || available < 1 || end - start > 16 * 3600000 || start < now - 60000)
        throw new Error('Choose a future planning window between 1 minute and 16 hours.');
    if (!Number.isInteger(options.focus_minutes) || options.focus_minutes < 15 || options.focus_minutes > 120 || !Number.isInteger(options.break_minutes) || options.break_minutes < 0 || options.break_minutes > 30)
        throw new Error('Choose 15–120 focus minutes and 0–30 break minutes.');
    const ranking = localRecommendations(tasks, now), blocks: PlanBlock[] = [], unscheduled: Plan['unscheduled_tasks'] = [];
    let cursor = start, focus = 0, work = 0, breaks = 0;
    for (const task of ranking.top_tasks) {
        let left = task.remaining_minutes, assigned = 0;
        while (left && end - cursor >= 60000) {
            if (focus === options.focus_minutes) {
                if (options.break_minutes) {
                    if (Math.floor((end - cursor) / 60000) <= options.break_minutes)
                        break;
                    const finish = cursor + options.break_minutes * 60000;
                    blocks.push({ kind: 'break', task_id: null, title: 'Break', starts_at: new Date(cursor).toISOString(), ends_at: new Date(finish).toISOString(), minutes: options.break_minutes, past_deadline: false });
                    cursor = finish;
                    breaks += options.break_minutes;
                }
                focus = 0;
            }
            const length = Math.min(left, options.focus_minutes - focus, Math.floor((end - cursor) / 60000));
            if (length <= 0)
                break;
            const finish = cursor + length * 60000;
            blocks.push({ kind: 'task', task_id: task.task_id, title: task.title, starts_at: new Date(cursor).toISOString(), ends_at: new Date(finish).toISOString(), minutes: length, past_deadline: !!task.due_at && finish > Date.parse(task.due_at) });
            cursor = finish;
            left -= length;
            assigned += length;
            focus += length;
            work += length;
        }
        if (left)
            unscheduled.push({ task_id: task.task_id, title: task.title, remaining_minutes: left, reason: assigned ? 'PARTIALLY_SCHEDULED' : 'WINDOW_FULL' });
    }
    return { engine_version: 'v2', blocks, scheduled_minutes: work, break_minutes: breaks, remaining_workload_minutes: unscheduled.reduce((n, t) => n + t.remaining_minutes, 0), unscheduled_tasks: unscheduled, available_minutes: available, unused_minutes: Math.floor((end - cursor) / 60000), context_truncated: ranking.context_truncated, source: 'local' };
}
