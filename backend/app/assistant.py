"""Read-only guidance from bounded task facts, with a deterministic fallback."""
import asyncio
import json
import re
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

class ModelAnswer(BaseModel):
    model_config = ConfigDict(extra='forbid')
    strategy: Literal['START_SMALL','BREAK_DOWN','FOCUS_BLOCK','REVIEW_PROGRESS']
    task_ids: list[str] = Field(max_length=5)

def result(message, ids=None, mode='deterministic', notice=None):
    return {'mode': mode, 'message': message, 'task_ids': ids or [], 'notice': notice}

def explain_task(task):
    return result(f'Start with “{task["title"]}” ({task["priority_score"]}/100). '
                  f'{task["reason"]}. Estimated remaining work: {task["remaining_minutes"]} minutes.', [task['task_id']])

def fallback_reply(question, ranked, truncated=False):
    q=question.lower()
    if re.search(r'first|priority|prioritas|dulu|why|kenapa|rank',q):
        return explain_task(ranked[0]) if ranked else result('No active tasks. You are all caught up.')
    if re.search(r'urgent|mendesak|deadline',q):
        urgent=[t for t in ranked if set(t['reason_codes']) & {'OVERDUE','DUE_WITHIN_24H','DUE_WITHIN_72H'}][:5]
        return result('\n'.join(f'{t["title"]}: {t["reason"]}' for t in urgent) or 'No deadlines within 3 days in this overview.', [t['task_id'] for t in urgent])
    if re.search(r'work|remaining|sisa|beban|plan|tonight|malam|jam|hours',q):
        return result(f'{len(ranked)} active tasks; approximately {sum(t["remaining_minutes"] for t in ranked)} minutes of remaining work'
            + (' in this limited overview' if truncated else '')
            + '. Use Daily Planner to choose your available start and end time and see which tasks fit.')
    return result('AI explanation is currently unavailable. I can still answer questions about your first priority, urgent tasks, or remaining workload.',mode='unavailable')

async def assisted_answer(provider, cfg, question, ranked, fallback, truncated=False):
    unavailable='AI explanation is currently unavailable. Deterministic task information is still available.'
    if cfg.ai_provider=='disabled':
        return {**fallback,'notice':unavailable}
    # No description, user identity, email, JWT, course or project content is sent.
    facts=[{**t,'title':''.join(c for c in t['title'] if c.isprintable())[:120]} for t in ranked[:10]]
    payload={'question':question,'active_tasks':facts,'context_is_partial':truncated or len(ranked)>10,
             'active_task_count_in_overview':len(ranked),
             'remaining_workload_minutes_in_overview':sum(t['remaining_minutes'] for t in ranked)}
    try:
        prompt=json.dumps(payload,ensure_ascii=False)
        if len(prompt)>16000: raise ValueError('Context exceeds limit')
        async with asyncio.timeout(cfg.ai_timeout_seconds):
            raw=await provider.explain(prompt)
        if not isinstance(raw,str) or len(raw)>8000: raise ValueError('Invalid provider response')
        answer=ModelAnswer.model_validate_json(raw)
        allowed={t['task_id'] for t in facts}
        if not set(answer.task_ids)<=allowed: raise ValueError('Unknown task reference')
        strategies={
            'START_SMALL':'Begin with one small, concrete step, then reassess your progress.',
            'BREAK_DOWN':'Break the work into smaller deliverables before starting your next focus block.',
            'FOCUS_BLOCK':'Use Daily Planner to reserve a focused block with a break and reduce distractions.',
            'REVIEW_PROGRESS':'Review what is already done, then update your remaining progress and time estimate.',
        }
        grounded=fallback['message'] if fallback['mode']!='unavailable' else (
            explain_task(ranked[0])['message'] if ranked else 'No active tasks. You are all caught up.')
        return result(grounded+'\n\nSuggested approach: '+strategies[answer.strategy],
            list(dict.fromkeys(fallback['task_ids']+answer.task_ids)), 'ai',
            'AI selected a study approach; task facts and scores are rendered deterministically.')
    except Exception:
        # Do not log provider bodies, authorization headers, prompts or credentials.
        return {**fallback,'notice':unavailable}
