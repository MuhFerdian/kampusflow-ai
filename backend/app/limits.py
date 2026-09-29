"""Single-process limits with bounded storage; keys never contain JWTs or content."""
import time, asyncio
from collections import deque
from fastapi import HTTPException
from starlette.responses import JSONResponse
class RateLimiter:
    def __init__(self): self.windows={}
    def check(self, key, limit):
        now=time.monotonic()
        if key not in self.windows:
            if len(self.windows)>=5000:
                self.windows={k:v for k,v in self.windows.items() if v and v[-1]>now-60}
                if len(self.windows)>=5000: raise HTTPException(503,'Service is busy. Try again shortly.')
            self.windows[key]=deque()
        queue=self.windows[key]
        while queue and queue[0]<=now-60: queue.popleft()
        if len(queue)>=limit: raise HTTPException(429,'Too many requests. Please wait a minute.',headers={'Retry-After':'60'})
        queue.append(now)
class BodyLimitMiddleware:
    def __init__(self,app,max_bytes=32768): self.app=app;self.max_bytes=max_bytes
    async def __call__(self,scope,receive,send):
        if scope['type']!='http': return await self.app(scope,receive,send)
        size=0;messages=[]
        try:
            async with asyncio.timeout(10):
                while True:
                    message=await receive()
                    if message['type']=='http.disconnect': return
                    size+=len(message.get('body',b''))
                    if size>self.max_bytes: return await JSONResponse({'detail':'Request is too large.'},status_code=413)(scope,receive,send)
                    messages.append(message)
                    if not message.get('more_body'): break
        except TimeoutError: return await JSONResponse({'detail':'Request timed out.'},status_code=408)(scope,receive,send)
        index=0
        async def replay():
            nonlocal index
            if index<len(messages):
                message=messages[index];index+=1;return message
            return await receive()
        await self.app(scope,replay,send)
