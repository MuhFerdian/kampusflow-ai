from datetime import timedelta
from app.planner import generate_plan
from app.schemas import PlannerInput
from test_priority import task,NOW

def options(minutes=180,**kw):return PlannerInput(starts_at=NOW,ends_at=NOW+timedelta(minutes=minutes),**kw)
def test_enough_time_and_completed_excluded():
    plan=generate_plan([task(estimated_minutes=30),task(status='completed',progress=100)],options(),NOW)
    assert plan['scheduled_minutes']==30 and plan['remaining_workload_minutes']==0
    assert len(plan['blocks'])==1 and plan['unused_minutes']==150

def test_insufficient_time_partial_and_unscheduled():
    plan=generate_plan([task(estimated_minutes=120)],options(60),NOW)
    assert plan['scheduled_minutes']==50 and plan['remaining_workload_minutes']==70
    assert plan['unscheduled_tasks'][0]['reason']=='PARTIALLY_SCHEDULED'
    assert plan['scheduled_minutes']+plan['break_minutes']+plan['unused_minutes']==60

def test_order_breaks_and_remaining_effort():
    low=task(importance=1,estimated_minutes=100,progress=50)
    urgent=task(id='33333333-3333-4333-8333-333333333333',due_at=NOW,estimated_minutes=50)
    plan=generate_plan([low,urgent],options(150),NOW)
    assert plan['blocks'][0]['task_id']==str(urgent.id)
    assert plan['blocks'][0]['past_deadline']
    assert plan['blocks'][1]['kind']=='break'
    assert plan['scheduled_minutes']==100 and plan['break_minutes']==10
    assert plan['blocks'][-1]['kind']=='task'

def test_no_breaks_no_overlap_and_empty():
    plan=generate_plan([task()],options(120,break_minutes=0),NOW)
    assert plan['scheduled_minutes']==120 and plan['break_minutes']==0
    for a,b in zip(plan['blocks'],plan['blocks'][1:]):assert a['ends_at']==b['starts_at']
    assert generate_plan([],options(),NOW)['blocks']==[]
