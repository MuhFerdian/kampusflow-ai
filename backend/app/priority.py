"""Priority Engine V2: continuous urgency, stable tie-breaking, no LLM."""
import math
from datetime import datetime
from .schemas import Task
VERSION = 'v2'

def round2(value):
    return math.floor((value + 2.220446049250313e-16) * 100 + .5) / 100

def remaining_minutes(task: Task) -> int:
    return 0 if task.status == 'completed' else max(1, math.ceil(task.estimated_minutes * (100-task.progress) / 100))

def score_task(task: Task, now: datetime) -> dict:
    if now.tzinfo is None:
        raise ValueError('now must be timezone-aware')
    components = dict.fromkeys(['deadline','importance','difficulty','effort','remaining_progress'], 0.0)
    reasons = []
    if task.status == 'completed':
        reasons = ['COMPLETED']
    else:
        hours = (task.due_at - now).total_seconds()/3600 if task.due_at else None
        components = {
            'deadline': round2(45 * max(0, min(1, 1-hours/336))) if hours is not None else 0,
            'importance': task.importance * 5,
            'difficulty': task.difficulty * 2,
            'effort': round2(10 * min(remaining_minutes(task)/240, 1)),
            'remaining_progress': round2((100-task.progress)/10),
        }
        if hours is None: reasons.append('NO_DEADLINE')
        elif hours < 0: reasons.append('OVERDUE')
        elif hours <= 24: reasons.append('DUE_WITHIN_24H')
        elif hours <= 72: reasons.append('DUE_WITHIN_72H')
        if task.importance >= 4: reasons.append('HIGH_IMPORTANCE')
        if task.difficulty >= 4: reasons.append('DIFFICULT_TASK')
        if remaining_minutes(task) >= 120: reasons.append('SUBSTANTIAL_WORK')
        if task.progress >= 90: reasons.append('NEARLY_DONE')
    return {'score': min(100, math.floor(sum(components.values()) + .5)), 'components': components, 'reason_codes': reasons}

REASONS = {'COMPLETED':'Already completed', 'NO_DEADLINE':'No deadline set', 'OVERDUE':'Deadline has passed',
 'DUE_WITHIN_24H':'Due within 24 hours', 'DUE_WITHIN_72H':'Due within 3 days', 'HIGH_IMPORTANCE':'High importance',
 'DIFFICULT_TASK':'Challenging work', 'SUBSTANTIAL_WORK':'At least 2 hours remaining', 'NEARLY_DONE':'Nearly finished'}

def ranked_tasks(tasks: list[Task], now: datetime) -> list[dict]:
    result=[]
    for task in tasks:
        if task.status == 'completed': continue
        score = score_task(task, now)
        result.append({'task_id': str(task.id), 'title':task.title, 'due_at':task.due_at.isoformat() if task.due_at else None,
          'importance':task.importance, 'difficulty':task.difficulty, 'estimated_minutes':task.estimated_minutes,
          'progress':task.progress, 'remaining_minutes':remaining_minutes(task), 'priority_score':score['score'],
          'components':score['components'], 'reason_codes':score['reason_codes'],
          'reason': '; '.join(REASONS[r] for r in score['reason_codes']) or 'Ranked by importance, effort and remaining progress',
          '_created':task.created_at.timestamp()})
    result.sort(key=lambda t:(-t['priority_score'], datetime.fromisoformat(t['due_at']).timestamp() if t['due_at'] else float('inf'), t['_created'], t['task_id']))
    for rank,t in enumerate(result,1):
        t.pop('_created');t['rank']=rank
    return result
