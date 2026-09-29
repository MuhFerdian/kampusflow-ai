import httpx
from pydantic import ValidationError
from fastapi import HTTPException
from .schemas import Task
class AcademicRepository:
    def __init__(self,settings,client): self.settings=settings;self.client=client
    async def active_tasks(self,user):
        cfg=self.settings
        try:
            r=await self.client.get(cfg.supabase_url+'/rest/v1/tasks',headers={'apikey':cfg.supabase_publishable_key,'Authorization':'Bearer '+user.token},params={
              'select':'id,user_id,title,due_at,importance,difficulty,estimated_minutes,progress,status,created_at,course_id,project_id',
              'user_id':'eq.'+user.id,'status':'neq.completed','order':'due_at.asc.nullslast,importance.desc,id.asc','limit':str(cfg.max_tasks+1)})
            if r.status_code==401: raise HTTPException(401,'Your session has expired. Sign in again.')
            if r.status_code==403: raise HTTPException(403,'Access to this data was denied.')
            r.raise_for_status(); rows=r.json()
            if not isinstance(rows,list): raise ValueError()
            if any(row.get('user_id')!=user.id for row in rows): raise HTTPException(403,'Access to this data was denied.')
            return [Task.model_validate(row) for row in rows[:cfg.max_tasks]],len(rows)>cfg.max_tasks
        except (httpx.HTTPError,ValidationError,ValueError,TypeError):
            raise HTTPException(503,'Academic data is temporarily unavailable.') from None
