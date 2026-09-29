from datetime import datetime, timedelta
from .priority import ranked_tasks
from .schemas import PlannerInput, Task

def generate_plan(tasks: list[Task], options: PlannerInput, now: datetime):
    ranked=ranked_tasks(tasks,now)
    cursor=options.starts_at; end=options.ends_at
    blocks=[]; unscheduled=[]; focus_used=0; work=0; breaks=0
    for task in ranked:
        left=task['remaining_minutes']; assigned=0
        while left and (end-cursor).total_seconds()>=60:
            available=int((end-cursor).total_seconds()//60)
            if focus_used==options.focus_minutes:
                if options.break_minutes:
                    if available<=options.break_minutes: break
                    finish=cursor+timedelta(minutes=options.break_minutes)
                    blocks.append({'kind':'break','task_id':None,'title':'Break','starts_at':cursor.isoformat(),'ends_at':finish.isoformat(),'minutes':options.break_minutes,'past_deadline':False})
                    cursor=finish;breaks+=options.break_minutes
                focus_used=0
            available=int((end-cursor).total_seconds()//60)
            length=min(left,options.focus_minutes-focus_used,available)
            if length<=0: break
            finish=cursor+timedelta(minutes=length)
            due=datetime.fromisoformat(task['due_at']) if task['due_at'] else None
            blocks.append({'kind':'task','task_id':task['task_id'],'title':task['title'],
              'starts_at':cursor.isoformat(),'ends_at':finish.isoformat(),'minutes':length,
              'past_deadline':bool(due and finish>due)})
            cursor=finish;left-=length;assigned+=length;focus_used+=length;work+=length
        if left:
            unscheduled.append({'task_id':task['task_id'],'title':task['title'],'remaining_minutes':left,
              'reason':'PARTIALLY_SCHEDULED' if assigned else 'WINDOW_FULL'})
    return {'engine_version':'v2','blocks':blocks,'scheduled_minutes':work,'break_minutes':breaks,
      'remaining_workload_minutes':sum(t['remaining_minutes'] for t in unscheduled),
      'unscheduled_tasks':unscheduled,'available_minutes':int((end-options.starts_at).total_seconds()//60),
      'unused_minutes':int((end-cursor).total_seconds()//60)}
