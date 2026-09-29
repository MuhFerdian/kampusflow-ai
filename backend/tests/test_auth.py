import asyncio, time, json
import httpx, jwt, pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from app.auth import TokenVerifier
from app.config import Settings
from fastapi import HTTPException
ID='11111111-1111-4111-8111-111111111111'
KEY=rsa.generate_private_key(public_exponent=65537,key_size=2048)
OTHER=rsa.generate_private_key(public_exponent=65537,key_size=2048)
CFG=Settings(_env_file=None,supabase_url='https://example.supabase.co',supabase_publishable_key='public-test-key')
def claims(**changes):return {'sub':ID,'iss':CFG.supabase_url+'/auth/v1','aud':'authenticated','role':'authenticated','exp':int(time.time())+300,'iat':int(time.time())-1}|changes
def verify(token,status=200,remote_id=ID):
    jwk=json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key()));jwk.update(kid='test',alg='RS256')
    def handle(r):
        if r.url.path.endswith('jwks.json'):return httpx.Response(200,json={'keys':[jwk]})
        return httpx.Response(status,json={'id':remote_id})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as c:return await TokenVerifier(CFG,c).verify(token)
    return asyncio.run(run())
def test_valid_rs256_identity():
    assert verify(jwt.encode(claims(),KEY,algorithm='RS256',headers={'kid':'test'})).id==ID
@pytest.mark.parametrize('change',[{'exp':1},{'iss':'https://attacker.invalid'},{'aud':'anon'},{'role':'service_role'},{'sub':'bad'},{'is_anonymous':True}])
def test_invalid_claims(change):
    with pytest.raises(HTTPException) as e: verify(jwt.encode(claims(**change),KEY,algorithm='RS256',headers={'kid':'test'}))
    assert e.value.status_code==401
@pytest.mark.parametrize('token',['malformed',jwt.encode(claims(),OTHER,algorithm='RS256',headers={'kid':'test'}),jwt.encode(claims(),key='',algorithm='none')])
def test_malformed_signature_and_none(token):
    with pytest.raises(HTTPException) as e:verify(token)
    assert e.value.status_code==401

def test_hs256_requires_auth_server_acceptance_and_same_identity():
    token=jwt.encode(claims(),'test-secret-at-least-32-characters',algorithm='HS256')
    assert verify(token).id==ID
    for kwargs in [{'status':401},{'remote_id':'22222222-2222-4222-8222-222222222222'}]:
        with pytest.raises(HTTPException) as e:verify(token,**kwargs)
        assert e.value.status_code==401

def test_auth_upstream_failure_is_unavailable():
    token=jwt.encode(claims(),'test-secret-at-least-32-characters',algorithm='HS256')
    with pytest.raises(HTTPException) as e:verify(token,status=500)
    assert e.value.status_code==503
