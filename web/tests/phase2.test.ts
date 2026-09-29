import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Task } from '../src/lib/model';
import { priorityV2, rankTasksV2, localRecommendations, remainingMinutes } from '../src/lib/priority-v2';
import { generateLocalPlan } from '../src/lib/planner';
const fixture = JSON.parse(readFileSync(new URL('../../tests/fixtures/priority-v2.json', import.meta.url), 'utf8'));
const now = Date.parse(fixture.now);
const task: Task = { id: '11111111-1111-4111-8111-111111111111', user_id: '22222222-2222-4222-8222-222222222222', title: 'Assignment', description: '', course_id: null, project_id: null, due_at: null, importance: 3, difficulty: 3, estimated_minutes: 120, status: 'todo', progress: 0, priority_score: null, created_at: fixture.now, updated_at: fixture.now };
for (const c of fixture.cases)
    test(`V2 shared contract: ${c.name}`, () => { const score = priorityV2({ ...task, ...c.task }, now); assert.equal(score.score, c.score); assert.equal(Math.round(Object.values(score.components).reduce((a, b) => a + b, 0)), score.score); });
test('V2 uses half-up rounding identically to Python', () => assert.equal(priorityV2({ ...task, estimated_minutes: 3 }, now).components.effort, .13));
test('V2 stable ties, completion exclusion, continuity and bounded overview', () => {
    assert.deepEqual(rankTasksV2([{ ...task, id: 'b' }, task, { ...task, status: 'completed' }], now).map(t => t.task_id), [task.id, 'b']);
    const at = priorityV2({ ...task, due_at: new Date(now + 86400000).toISOString() }, now).score;
    assert.ok(Math.abs(at - priorityV2({ ...task, due_at: new Date(now + 86401000).toISOString() }, now).score) <= 1);
    assert.equal(remainingMinutes({ ...task, progress: 90 }), 12);
    const context = localRecommendations(Array.from({ length: 201 }, (_, i) => ({ ...task, id: String(i) })), now);
    assert.equal(context.top_tasks.length, 200);
    assert.ok(context.context_truncated);
    assert.equal(context.ai_available, false);
});
const options = { starts_at: fixture.now, ends_at: '2026-09-29T15:00:00Z', focus_minutes: 50, break_minutes: 10 };
test('Planner fits work with breaks, never schedules completed tasks or overlaps', () => {
    const plan = generateLocalPlan([task, { ...task, status: 'completed' }], options, now);
    assert.equal(plan.scheduled_minutes, 120);
    assert.equal(plan.break_minutes, 20);
    assert.equal(plan.remaining_workload_minutes, 0);
    assert.equal(plan.blocks.at(-1)?.kind, 'task');
    for (let i = 1; i < plan.blocks.length; i++)
        assert.ok(Date.parse(plan.blocks[i].starts_at) >= Date.parse(plan.blocks[i - 1].ends_at));
    assert.equal(plan.scheduled_minutes + plan.break_minutes + plan.unused_minutes, plan.available_minutes);
});
test('Planner reports partial and unscheduled work, uses priorities and remaining duration', () => {
    const overdue = { ...task, id: 'urgent', due_at: '2026-09-28T12:00:00Z', estimated_minutes: 120, progress: 50 };
    const plan = generateLocalPlan([task, overdue], { ...options, ends_at: '2026-09-29T12:45:00Z' }, now);
    assert.equal(plan.blocks[0].task_id, 'urgent');
    assert.equal(plan.scheduled_minutes, 45);
    assert.equal(plan.remaining_workload_minutes, 135);
    assert.ok(plan.blocks[0].past_deadline);
    assert.equal(plan.unscheduled_tasks[0].reason, 'PARTIALLY_SCHEDULED');
    assert.equal(plan.unscheduled_tasks[1].reason, 'WINDOW_FULL');
});
test('Planner validates window and handles empty, timezone offsets and no breaks', () => {
    assert.equal(generateLocalPlan([], options, now).blocks.length, 0);
    assert.throws(() => generateLocalPlan([task], { ...options, ends_at: fixture.now }, now));
    assert.throws(() => generateLocalPlan([task], { ...options, focus_minutes: 0 }, now));
    assert.throws(() => generateLocalPlan([task], { ...options, starts_at: 'invalid' }, now));
    const p = generateLocalPlan([task], { ...options, starts_at: '2026-09-29T19:00:00+07:00', ends_at: '2026-09-29T21:00:00+07:00', break_minutes: 0 }, now);
    assert.equal(p.scheduled_minutes, 120);
    assert.equal(p.break_minutes, 0);
    assert.equal(p.blocks[0].starts_at, fixture.now.replace('Z', '.000Z'));
});
