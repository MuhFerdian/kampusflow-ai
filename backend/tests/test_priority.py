from datetime import datetime, timezone, timedelta
from app.schemas import Task
from app.priority import score_task, remaining_minutes, ranked_tasks
NOW=datetime(2026,9,29,12,tzinfo=timezone.utc)
def task(**kwargs):
    return Task(**({'id':'11111111-1111-4111-8111-111111111111','user_id':'22222222-2222-4222-8222-222222222222','title':'Assignment','due_at':None,'importance':3,'difficulty':3,'estimated_minutes':120,'progress':0,'status':'todo','created_at':NOW}|kwargs))
def test_completed_zero():
    t=task(status='completed',progress=100,due_at=NOW-timedelta(days=1))
    assert score_task(t,NOW)['score']==0 and remaining_minutes(t)==0

def test_deadline_order_and_no_deadline():
    values=[score_task(task(due_at=NOW+timedelta(hours=h)),NOW)['score'] for h in [-24,4,28,336]]
    assert values==sorted(values,reverse=True)
    assert 0 < score_task(task(),NOW)['score'] < values[0]
    assert 'OVERDUE' in score_task(task(due_at=NOW-timedelta(seconds=1)),NOW)['reason_codes']

def test_importance_progress_and_components():
    assert score_task(task(importance=5),NOW)['score']>score_task(task(importance=1),NOW)['score']
    assert score_task(task(progress=0),NOW)['score']>score_task(task(progress=90),NOW)['score']
    s=score_task(task(),NOW)
    assert abs(sum(s['components'].values())-s['score'])<=.5
    assert remaining_minutes(task(progress=90))==12

def test_continuous_urgency_and_stable_ranking():
    a=score_task(task(due_at=NOW+timedelta(hours=24)),NOW)['score']
    b=score_task(task(due_at=NOW+timedelta(hours=24,seconds=1)),NOW)['score']
    assert abs(a-b)<=1
    rows=ranked_tasks([task(status='completed',progress=100),task()],NOW)
    assert len(rows)==1 and rows[0]['rank']==1

def test_shared_web_contract():
    import json
    from pathlib import Path
    fixture=json.loads((Path(__file__).parents[2]/'tests/fixtures/priority-v2.json').read_text())
    for case in fixture['cases']:
        assert score_task(task(**case['task']),NOW)['score']==case['score'],case['name']
    assert score_task(task(estimated_minutes=3),NOW)['components']['effort']==.13
