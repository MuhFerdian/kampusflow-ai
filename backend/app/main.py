from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import settings, Settings
from .auth import TokenVerifier, get_current_user, CurrentUser
from .repository import AcademicRepository
from .limits import BodyLimitMiddleware, RateLimiter
from .priority import ranked_tasks
from .planner import generate_plan
from .schemas import PlannerInput, ExplainInput, ChatInput
from .assistant import explain_task, fallback_reply, assisted_answer
from .providers import get_provider

def create_app(cfg:Settings=settings):
    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=10,follow_redirects=False) as client:
            app.state.verifier=TokenVerifier(cfg,client)
            app.state.repository=AcademicRepository(cfg,client)
            yield
    app=FastAPI(title='KampusFlow AI',version='0.2.0',lifespan=lifespan)
    app.state.settings=cfg;app.state.limiter=RateLimiter();app.state.provider=get_provider(cfg)
    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in cfg.cors_origins.split(',')],allow_methods=['GET','POST'],allow_headers=['Authorization','Content-Type'],expose_headers=['Retry-After'])
    @app.exception_handler(RequestValidationError)
    async def validation_error(request,exc):
        return JSONResponse({'detail':'Check the request fields, dates and text length.'},status_code=422)
    @app.exception_handler(Exception)
    async def internal_error(request,exc):
        return JSONResponse({'detail':'Something went wrong. Please try again.'},status_code=500)
    async def authorized(request:Request,user:CurrentUser=Depends(get_current_user)):
        app.state.limiter.check(('api',user.id),cfg.rate_limit_per_minute)
        return user
    app.state.authorized=authorized
    async def context(user):
        tasks,truncated=await app.state.repository.active_tasks(user)
        now=datetime.now(timezone.utc)
        return tasks,truncated,now
    @app.get('/health')
    def health():
        return {'status':'ok','phase':2,'ai_recommendations':cfg.ai_provider!='disabled','backend_configured':bool(cfg.supabase_url and cfg.supabase_publishable_key)}
    @app.get('/recommendations',include_in_schema=False)
    def legacy_recommendations():
        raise HTTPException(503,'Use the authenticated /api/v1/recommendations endpoint.')
    @app.get('/api/v1/recommendations')
    async def recommendations(user:CurrentUser=Depends(authorized)):
        tasks,truncated,now=await context(user); ranked=ranked_tasks(tasks,now)
        return {'engine_version':'v2','generated_at':now.isoformat(),'top_tasks':ranked,
          'active_task_count':len(ranked),'remaining_workload_minutes':sum(t['remaining_minutes'] for t in ranked),
          'context_truncated':truncated,'ai_available':cfg.ai_provider!='disabled',
          'summary':f'{len(ranked)} active tasks in this overview.' if ranked else 'No active tasks. You are all caught up.'}
    @app.post('/api/v1/planner/generate')
    async def planner(body:PlannerInput,user:CurrentUser=Depends(authorized)):
        tasks,truncated,now=await context(user)
        if body.starts_at<now-timedelta(minutes=1): raise HTTPException(422,'Choose a planning start time in the future.')
        return {**generate_plan(tasks,body,now),'context_truncated':truncated,'source':'backend'}
    @app.post('/api/v1/recommendations/explain')
    async def explain(body:ExplainInput,user:CurrentUser=Depends(authorized)):
        app.state.limiter.check(('ai',user.id),cfg.ai_rate_limit_per_minute)
        tasks,truncated,now=await context(user)
        ranked=ranked_tasks(tasks,now)
        task=next((t for t in ranked if t['task_id']==str(body.task_id)),None)
        if task is None: raise HTTPException(404,'This active task is not available in your current overview.')
        # Explanation of any selected task must not claim it is ranked first.
        fallback=explain_task(task)
        fallback['message']=fallback['message'].replace('Start with ', 'Task: ',1)
        return await assisted_answer(app.state.provider,cfg,'Explain the supplied score components for this task.',[task],fallback,truncated)
    @app.post('/api/v1/assistant/chat')
    async def chat(body:ChatInput,user:CurrentUser=Depends(authorized)):
        app.state.limiter.check(('ai',user.id),cfg.ai_rate_limit_per_minute)
        tasks,truncated,now=await context(user)
        ranked=ranked_tasks(tasks,now)
        return await assisted_answer(app.state.provider,cfg,body.message,ranked,fallback_reply(body.message,ranked,truncated),truncated)
    return app
app=create_app()
