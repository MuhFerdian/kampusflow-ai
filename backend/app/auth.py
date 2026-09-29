"""JWKS verification for asymmetric Supabase JWTs; Auth-server verification for HS256."""
import asyncio
import time
from dataclasses import dataclass, field
from uuid import UUID
import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
bearer=HTTPBearer(auto_error=False)
@dataclass
class CurrentUser:
    id: str
    token: str = field(repr=False)
    claims: dict = field(default_factory=dict, repr=False)
class TokenVerifier:
    def __init__(self, settings, client):
        self.settings=settings; self.client=client
        self.keys=[]; self.fetched=0.0; self.lock=asyncio.Lock()
    async def _key(self, kid, alg):
        async with self.lock:
            now=time.monotonic()
            found=next((k for k in self.keys if k.get('kid')==kid and k.get('alg',alg)==alg),None)
            if now-self.fetched>300 or (not found and now-self.fetched>10):
                r=await self.client.get(self.settings.supabase_url+'/auth/v1/.well-known/jwks.json')
                r.raise_for_status(); self.keys=r.json().get('keys',[])[:20]; self.fetched=now
            found=next((k for k in self.keys if k.get('kid')==kid and k.get('alg',alg)==alg),None)
            if not found: raise jwt.InvalidTokenError()
            return jwt.PyJWK.from_dict(found, algorithm=alg).key
    async def verify(self, token):
        cfg=self.settings
        if not cfg.supabase_url or not cfg.supabase_publishable_key:
            raise HTTPException(503,'Authentication service is not configured.')
        try:
            header=jwt.get_unverified_header(token);alg=header.get('alg')
            options={'require':['exp','iat','sub','aud','iss'], 'verify_aud':True, 'verify_iss':True, 'verify_exp':True, 'verify_iat':True, 'verify_nbf':True}
            issuer=cfg.supabase_url+'/auth/v1'
            if alg in ('RS256','ES256'):
                kid=header.get('kid')
                if not isinstance(kid,str) or len(kid)>200: raise jwt.InvalidTokenError()
                key=await self._key(kid,alg)
                claims=jwt.decode(token,key,algorithms=[alg],audience='authenticated',issuer=issuer,options=options)
            elif alg=='HS256':
                # Identity is used only after the trusted Auth server accepts the bearer.
                r=await self.client.get(cfg.supabase_url+'/auth/v1/user',headers={'apikey':cfg.supabase_publishable_key,'Authorization':'Bearer '+token})
                if r.status_code in (401,403): raise jwt.InvalidTokenError()
                r.raise_for_status()
                claims=jwt.decode(token,algorithms=['HS256'],audience='authenticated',issuer=issuer,options={**options,'verify_signature':False})
                if r.json().get('id')!=claims['sub']: raise jwt.InvalidTokenError()
            else: raise jwt.InvalidTokenError()
            identity=str(UUID(claims['sub']))
            if claims.get('role')!='authenticated' or claims.get('is_anonymous',False): raise jwt.InvalidTokenError()
            return CurrentUser(identity,token,claims)
        except (jwt.PyJWTError,ValueError,KeyError,TypeError):
            raise HTTPException(401,'Invalid or expired session.',headers={'WWW-Authenticate':'Bearer'}) from None
        except (httpx.HTTPError,RuntimeError):
            raise HTTPException(503,'Authentication service is temporarily unavailable.') from None
async def get_current_user(request:Request, credentials:HTTPAuthorizationCredentials|None=Depends(bearer)):
    if not credentials or credentials.scheme.lower()!='bearer' or len(credentials.credentials)>8192:
        raise HTTPException(401,'Sign in to continue.',headers={'WWW-Authenticate':'Bearer'})
    return await request.app.state.verifier.verify(credentials.credentials)
