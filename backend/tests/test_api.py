import asyncio
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock
import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings
from app.auth import CurrentUser, get_current_user
from app.repository import AcademicRepository
from app.assistant import assisted_answer, fallback_reply
from app.priority import ranked_tasks
from test_priority import task, NOW

USER='22222222-2222-4222-8222-222222222222'
@pytest.fixture(autouse=True)
def no_external_network(monkeypatch):
    original=httpx.AsyncClient
    def offline_client(*args, **kwargs):
        kwargs.setdefault('transport',httpx.MockTransport(lambda _:httpx.Response(503)))
        return original(*args, **kwargs)
    monkeypatch.setattr(httpx,'AsyncClient',offline_client)

def settings(**kw):
    return Settings(_env_file=None,supabase_url='https://project.supabase.co',supabase_publishable_key='test-public',**kw)
@pytest.fixture
def client():
    app=create_app(settings())
    app.dependency_overrides[get_current_user]=lambda:CurrentUser(USER,'test-token')
    with TestClient(app) as client:
        app.state.repository=AsyncMock()
        app.state.repository.active_tasks.return_value=([task()],False)
        yield client
@pytest.mark.parametrize('headers',[{}, {'Authorization':'Basic x'}, {'Authorization':'Bearer malformed'}, {'Authorization':'Bearer '+ 'x'*8193}])
def test_unauthorized(headers):
    with TestClient(create_app(settings())) as c:
        assert c.get('/api/v1/recommendations',headers=headers).status_code==401
@pytest.mark.parametrize('path', ['/api/v1/recommendations/explain','/api/v1/planner/generate','/api/v1/assistant/chat'])
def test_all_posts_protected(path):
    with TestClient(create_app(settings())) as c:
        assert c.post(path,json={}).status_code==401

def test_recommendations_and_disabled_ai(client):
    before=client.get('/api/v1/recommendations')
    assert before.status_code==200
    data=before.json()
    assert data['engine_version']=='v2' and data['top_tasks'][0]['rank']==1
    assert data['ai_available'] is False
    reply=client.post('/api/v1/recommendations/explain',json={'task_id':str(task().id)})
    assert reply.status_code==200 and reply.json()['mode']=='deterministic'
    chat=client.post('/api/v1/assistant/chat',json={'message':'What should I work on first?'})
    assert chat.status_code==200 and chat.json()['task_ids']==[str(task().id)]
    assert client.get('/api/v1/recommendations').json()['top_tasks']==data['top_tasks']
@pytest.mark.parametrize('body',[{'message':''},{'message':' '},{'message':'x'*1001},{'message':'hi','user_id':USER}])
def test_validation_and_spoofing(client,body):
    response=client.post('/api/v1/assistant/chat',json=body)
    assert response.status_code==422 and 'user_id' not in response.text

def test_oversized(client):
    r=client.post('/api/v1/assistant/chat',content='x'*32769,headers={'Content-Type':'application/json'})
    assert r.status_code==413

def test_planner_and_bad_dates(client):
    start=datetime.now(timezone.utc)+timedelta(hours=1)
    body={'starts_at':start.isoformat(),'ends_at':(start+timedelta(hours=3)).isoformat()}
    result=client.post('/api/v1/planner/generate',json=body)
    assert result.status_code==200 and result.json()['scheduled_minutes']==120
    assert result.json()['source']=='backend'
    assert client.post('/api/v1/planner/generate',json={**body,'starts_at':'2026-09-29T12:00'}).status_code==422
    assert client.post('/api/v1/planner/generate',json={**body,'ends_at':start.isoformat()}).status_code==422
    assert client.post('/api/v1/planner/generate',json={'starts_at':NOW.isoformat(),'ends_at':(NOW+timedelta(days=1)).isoformat()}).status_code==422

def test_foreign_task_not_available(client):
    assert client.post('/api/v1/recommendations/explain',json={'task_id':'33333333-3333-4333-8333-333333333333'}).status_code==404

def test_cors_allowlist(client):
    headers={'Origin':'https://attacker.example','Access-Control-Request-Method':'POST'}
    response=client.options('/api/v1/assistant/chat',headers=headers)
    assert response.status_code==400 and 'access-control-allow-origin' not in response.headers
    headers['Origin']='http://localhost:3000'
    assert client.options('/api/v1/assistant/chat',headers=headers).headers['access-control-allow-origin']==headers['Origin']

def test_rate_limit_per_user():
    app=create_app(settings(rate_limit_per_minute=1))
    identity=[USER]
    app.dependency_overrides[get_current_user]=lambda:CurrentUser(identity[0],'test-token')
    with TestClient(app) as c:
        app.state.repository=AsyncMock();app.state.repository.active_tasks.return_value=([],False)
        assert c.get('/api/v1/recommendations').status_code==200
        r=c.get('/api/v1/recommendations');assert r.status_code==429 and r.headers['retry-after']=='60'
        identity[0]='33333333-3333-4333-8333-333333333333'
        assert c.get('/api/v1/recommendations').status_code==200

def test_ai_throttle(client):
    for _ in range(6): assert client.post('/api/v1/assistant/chat',json={'message':'first'}).status_code==200
    assert client.post('/api/v1/assistant/chat',json={'message':'first'}).status_code==429
    assert client.get('/api/v1/recommendations').status_code==200

@pytest.mark.parametrize('mode',['error','bad_json','unknown_task','success'])
def test_provider_fallback_and_valid_output(mode):
    cfg=settings(ai_provider='openai_compatible',ai_api_key='test',ai_model='test')
    app=create_app(cfg)
    app.dependency_overrides[get_current_user]=lambda:CurrentUser(USER,'test-token')
    with TestClient(app) as c:
        app.state.repository=AsyncMock();app.state.repository.active_tasks.return_value=([task()],False)
        provider=AsyncMock()
        if mode=='error':provider.explain.side_effect=httpx.ReadTimeout('private details')
        else: provider.explain.return_value='bad' if mode=='bad_json' else json.dumps({'strategy':'FOCUS_BLOCK','task_ids':['foreign'] if mode=='unknown_task' else [str(task().id)]})
        app.state.provider=provider
        before=c.get('/api/v1/recommendations').json()['top_tasks']
        assert provider.explain.await_count==0
        r=c.post('/api/v1/assistant/chat',json={'message':'What should I do first?'}).json()
        assert r['mode']==('ai' if mode=='success' else 'deterministic')
        assert 'private details' not in r['message']
        assert c.get('/api/v1/recommendations').json()['top_tasks']==before
        prompt=json.loads(provider.explain.call_args.args[0])
        assert 'user_id' not in prompt['active_tasks'][0] and 'description' not in prompt['active_tasks'][0]

def test_provider_context_bound():
    ranked=ranked_tasks([task(id=f'{i:08d}-1111-4111-8111-111111111111',title='A'*200) for i in range(20)],NOW)
    provider=AsyncMock();provider.explain.return_value=json.dumps({'strategy':'START_SMALL','task_ids':[]})
    cfg=settings(ai_provider='openai_compatible',ai_api_key='test',ai_model='test')
    asyncio.run(assisted_answer(provider,cfg,'first',ranked,fallback_reply('first',ranked)))
    prompt=json.loads(provider.explain.call_args.args[0])
    assert len(prompt['active_tasks'])==10 and prompt['context_is_partial']
    assert len(prompt['active_tasks'][0]['title'])==120

def test_repository_uses_bearer_rls_and_caps():
    def handler(req):
        assert req.headers['Authorization']=='Bearer user-test'
        assert req.headers['apikey']=='test-public'
        assert req.url.params['user_id']=='eq.'+USER and req.url.params['limit']=='2'
        assert 'description' not in req.url.params['select']
        return httpx.Response(200,json=[task().model_dump(mode='json')]*2)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as h:
            rows,truncated=await AcademicRepository(settings(max_tasks=1),h).active_tasks(CurrentUser(USER,'user-test'))
            assert len(rows)==1 and truncated
    asyncio.run(run())

def test_repository_rejects_foreign_rows():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _:httpx.Response(200,json=[task(user_id='33333333-3333-4333-8333-333333333333').model_dump(mode='json')]))) as h:
            with pytest.raises(HTTPException) as e:
                await AcademicRepository(settings(),h).active_tasks(CurrentUser(USER,'token'))
            assert e.value.status_code==403
    asyncio.run(run())

def test_provider_rejects_invented_prose_and_deadlines():
    ranked=ranked_tasks([task()],NOW)
    provider=AsyncMock()
    provider.explain.return_value=json.dumps({'strategy':'FOCUS_BLOCK','task_ids':[str(task().id)],'deadline':'invented','message':'Your assignment is due tomorrow.'})
    cfg=settings(ai_provider='openai_compatible',ai_api_key='test',ai_model='test')
    r=asyncio.run(assisted_answer(provider,cfg,'first',ranked,fallback_reply('first',ranked)))
    assert r['mode']=='deterministic' and 'tomorrow' not in r['message']

def test_provider_total_timeout_falls_back():
    async def slow(_):
        await asyncio.sleep(2)
    ranked=ranked_tasks([task()],NOW)
    provider=AsyncMock();provider.explain.side_effect=slow
    cfg=settings(ai_provider='openai_compatible',ai_api_key='test',ai_model='test',ai_timeout_seconds=1)
    r=asyncio.run(assisted_answer(provider,cfg,'first',ranked,fallback_reply('first',ranked)))
    assert r['mode']=='deterministic'

@pytest.mark.parametrize('origin',['*','https://example.com/','https://example.com/path'])
def test_cors_invalid_configuration(origin):
    with pytest.raises(ValueError): settings(cors_origins=origin)
