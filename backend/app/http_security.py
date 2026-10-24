"""Host checks, bounded request streams and uniform headers, including error paths."""
from urllib.parse import urlsplit
import re
import asyncio
import time

BODY_TIMEOUT_SECONDS=30

from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import Request
from starlette.responses import JSONResponse


def origin_allowed(request,settings):
    raw=request.headers.get('origin')
    if request.headers.get('sec-fetch-site')=='cross-site':return False
    if raw is None:return True
    try:
        parsed=urlsplit(raw)
        expected=urlsplit(settings.public_base_url) if settings.public_base_url else request.url
        if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment:return False
        if not parsed.netloc or len(raw)>2048:return False
        actual_port=parsed.port or (443 if parsed.scheme=='https' else 80)
        expected_port=expected.port or (443 if expected.scheme=='https' else 80)
        return parsed.scheme==expected.scheme and parsed.hostname.lower()==expected.hostname.lower() and actual_port==expected_port
    except (ValueError,AttributeError):return False


class RequestBoundary:
    def __init__(self,app,settings,authenticate_upload):
        self.app,self.settings,self.authenticate_upload=app,settings,authenticate_upload

    async def __call__(self,scope,receive,send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        path=scope.get('path','')
        async def secured_send(message):
            if message['type']=='http.response.start':
                headers=MutableHeaders(scope=message)
                headers['X-Content-Type-Options']='nosniff'
                headers['X-Frame-Options']='DENY'
                headers['Referrer-Policy']='same-origin'
                headers['Cache-Control']='no-store'
                headers['Permissions-Policy']='camera=(), microphone=(), geolocation=()'
                style="'self' 'unsafe-inline'" if path=='/api/v1/docs' else "'self'"
                headers['Content-Security-Policy']=f"default-src 'self'; script-src 'self'; style-src {style}; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
                if self.settings.cookie_secure:headers['Strict-Transport-Security']='max-age=31536000'
            await send(message)
        async def reject(status,detail):
            await JSONResponse(status_code=status,content={'detail':detail})(scope,receive,secured_send)
        headers=Headers(scope=scope)
        host_headers=[v for k,v in scope.get('headers',[]) if k.lower()==b'host']
        try:
            host=headers.get('host','')
            if len(host_headers)!=1 or len(host)>255 or re.search(r'[\s\\/@#?]',host):raise ValueError()
            parsed=urlsplit('//'+host)
            if not parsed.hostname or parsed.username or parsed.password:raise ValueError()
            _=parsed.port
            allowed={h.strip('[]').lower() for h in self.settings.allowed_hosts}
            if self.settings.public_base_url:allowed.add(urlsplit(self.settings.public_base_url).hostname.lower())
            if parsed.hostname.lower() not in allowed:raise ValueError()
        except (ValueError,AttributeError):return await reject(400,'Недопустимый Host запроса')
        if scope['method'] not in ('POST','PUT','PATCH','DELETE'):
            return await self.app(scope,receive,secured_send)
        upload=scope['method']=='POST' and re.fullmatch(r'/api/v1/payment-occurrences/\d+/attachments',path)
        limit=self.settings.max_attachment_bytes+128*1024 if upload else 64*1024
        length=headers.get('content-length')
        lengths=[v for k,v in scope.get('headers',[]) if k.lower()==b'content-length']
        if len(lengths)>1 or (length is not None and (len(length)>12 or not length.isascii() or not length.isdigit())):
            return await reject(400,'Некорректный Content-Length')
        if length is not None and int(length)>limit:return await reject(413,'Слишком большой запрос')
        if upload:
            if length is None:return await reject(411,'Для загрузки нужен Content-Length')
            # Do not spool attacker-supplied multipart files before checking the session.
            from fastapi import HTTPException
            request=Request(scope)
            try:self.authenticate_upload(request,request.cookies.get('invoice_session'))
            except HTTPException as error:return await reject(error.status_code,error.detail)
        body=bytearray()
        deadline=time.monotonic()+BODY_TIMEOUT_SECONDS
        while True:
            remaining=deadline-time.monotonic()
            if remaining<=0:return await reject(408,'Истекло время передачи запроса')
            try:message=await asyncio.wait_for(receive(),timeout=remaining)
            except TimeoutError:return await reject(408,'Истекло время передачи запроса')
            if message['type']=='http.disconnect':return
            chunk=message.get('body',b'')
            if len(body)+len(chunk)>limit:return await reject(413,'Слишком большой запрос')
            body.extend(chunk)
            if not message.get('more_body'):break
        if length is not None and len(body)!=int(length):return await reject(400,'Размер тела не совпадает с Content-Length')
        payload=bytes(body);body.clear();del body
        supplied=False
        async def replay():
            nonlocal supplied
            if not supplied:
                supplied=True
                return {'type':'http.request','body':payload,'more_body':False}
            return await receive()
        await self.app(scope,replay,secured_send)
