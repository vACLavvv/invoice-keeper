from dataclasses import replace
import hashlib
import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from backend.app.main import create_app
from backend.app.security import hash_password, verify_password
from conftest import sign_in


def test_currency_filter_offers_each_supported_currency(setup):
    from html.parser import HTMLParser

    class CurrencyOptions(HTMLParser):
        def __init__(self):
            super().__init__()
            self.inside=False
            self.option=None
            self.options=[]

        def handle_starttag(self,tag,attrs):
            attributes=dict(attrs)
            if tag=='select' and attributes.get('id')=='currency-filter':self.inside=True
            if self.inside and tag=='option':self.option=[attributes.get('value'),[]]

        def handle_data(self,data):
            if self.option is not None:self.option[1].append(data)

        def handle_endtag(self,tag):
            if tag=='option' and self.option is not None:
                value,text=self.option
                self.options.append(value if value is not None else ''.join(text).strip())
                self.option=None
            if tag=='select':self.inside=False

    _,client,_,_=setup
    sign_in(client)
    parser=CurrencyOptions()
    parser.feed(client.get('/').text)
    assert parser.options==['','RUB','USD','EUR']


def test_malformed_origin_is_rejected_without_server_error(setup):
    app,_,_,_=setup
    client=TestClient(app,raise_server_exceptions=False)
    response=client.post('/api/v1/auth/login',headers={'Origin':'http://['},json={'username':'admin','password':'TestAdmin-Only123!'})
    assert response.status_code==403


def test_csrf_non_ascii_is_forbidden_without_server_error(setup):
    app,client,_,_=setup
    sign_in(client)
    other=TestClient(app,raise_server_exceptions=False)
    other.cookies.update(client.cookies)
    response=other.post('/api/v1/auth/logout',headers={b'X-CSRF-Token':b'\xff'})
    assert response.status_code==403
    assert client.get('/api/v1/auth/me').status_code==200


def test_untrusted_host_is_rejected(setup):
    _,client,_,_=setup
    assert client.get('/login',headers={'Host':'evil.invalid'}).status_code==400


def test_json_body_limit_checks_actual_bytes_not_only_declared_length(setup):
    _,client,_,_=setup
    body=json.dumps({'username':'x'*100_000,'password':'small'}).encode()
    response=client.post('/api/v1/auth/login',content=body,headers={'Content-Type':'application/json','Content-Length':'10'})
    assert response.status_code==413


def test_chunked_json_body_is_bounded(setup):
    _,client,_,_=setup
    def chunks():
        yield b'{"username":"'
        for _ in range(100):yield b'x'*1024
        yield b'","password":"small"}'
    response=client.post('/api/v1/auth/login',content=chunks(),headers={'Content-Type':'application/json'})
    assert response.status_code==413


@pytest.mark.parametrize('mutation',['password','delete'])
def test_login_cannot_create_session_after_credentials_changed_during_verification(setup,monkeypatch,mutation):
    import backend.app.main as main
    app,admin,_,_=setup
    sign_in(admin)
    created=admin.post('/api/v1/users',json={'username':'alex','display_name':'Alex','password':'User-password123!'})
    user_id=created.json()['id']
    with app.state.db.connect() as conn:old_hash=conn.execute('SELECT password_hash FROM users WHERE id=?',(user_id,)).fetchone()[0]
    new_hash=hash_password('Replacement-password123!')
    real_verify=main.verify_password
    def changed_while_verifying(password,encoded):
        result=real_verify(password,encoded)
        if result and encoded==old_hash:
            with app.state.db.connect(write=True) as conn:
                if mutation=='password':conn.execute('UPDATE users SET password_hash=? WHERE id=?',(new_hash,user_id))
                else:conn.execute('DELETE FROM users WHERE id=?',(user_id,))
        return result
    monkeypatch.setattr(main,'verify_password',changed_while_verifying)
    client=TestClient(app,raise_server_exceptions=False)
    result=client.post('/api/v1/auth/login',json={'username':'alex','password':'User-password123!'})
    assert result.status_code==401
    with app.state.db.connect() as conn:assert conn.execute('SELECT COUNT(*) FROM sessions WHERE user_id=?',(user_id,)).fetchone()[0]==0


def test_legacy_password_is_upgraded_without_changing_user_password(setup):
    app,client,_,_=setup
    sign_in(client)
    user=client.post('/api/v1/users',json={'username':'alex','display_name':'Alex','password':'User-password123!'}).json()
    salt='01'*16
    value=hashlib.scrypt(b'User-password123!',salt=salt.encode(),n=16384,r=8,p=1).hex()
    legacy=f'scrypt${salt}${value}'
    with app.state.db.connect(write=True) as conn:conn.execute('UPDATE users SET password_hash=? WHERE id=?',(legacy,user['id']))
    assert verify_password('User-password123!',legacy)
    sign_in(client,'alex','User-password123!')
    with app.state.db.connect() as conn:upgraded=conn.execute('SELECT password_hash FROM users WHERE id=?',(user['id'],)).fetchone()[0]
    assert upgraded.startswith('scrypt$32768$8$3$')
    assert verify_password('User-password123!',upgraded)
    assert not verify_password('wrong',upgraded)


def test_swagger_supports_openapi31_and_does_not_need_inline_scripts(setup):
    app,client,_,_=setup
    sign_in(client)
    html=client.get('/api/v1/docs')
    assert html.status_code==200
    assert '/assets/js/swagger-init.js' in html.text
    policy=html.headers['content-security-policy']
    assert "script-src 'self';" in policy and "script-src 'self' 'unsafe-inline'" not in policy
    assert client.get('/swagger-assets/swagger-ui-bundle.js').status_code==200
    assert 'validatorUrl: null' in client.get('/assets/js/swagger-init.js').text


def test_database_file_is_private(setup):
    path=setup[2].database_path
    assert path.stat().st_mode & 0o777==0o600


def test_release_manifest_and_license_are_included(tmp_path):
    from scripts.package import FILES,build_archive
    from scripts.verify_archive import verify
    for filename in FILES:
        (tmp_path/filename).parent.mkdir(parents=True,exist_ok=True)
        (tmp_path/filename).write_text('source file\n')
    (tmp_path/'backend/app').mkdir(parents=True)
    (tmp_path/'backend/app/main.py').write_text('print("demo")\n')
    (tmp_path/'backend/app/LICENSE.txt').write_text('Vendor license\n')
    (tmp_path/'.env').write_text('ADMIN_PASSWORD=local-only-actual-password\n')
    path,count=build_archive(tmp_path)
    assert verify(path)==count
    from zipfile import ZipFile
    with ZipFile(path) as archive:
        assert 'invoice-keeper/backend/app/LICENSE.txt' in archive.namelist()
        assert 'invoice-keeper/.env' not in archive.namelist()


def test_release_refuses_a_secret_without_overwriting_previous_archive(tmp_path):
    from scripts.package import FILES,build_archive
    for filename in FILES:
        (tmp_path/filename).parent.mkdir(parents=True,exist_ok=True)
        (tmp_path/filename).write_text('source file\n')
    (tmp_path/'backend/app').mkdir(parents=True)
    (tmp_path/'.env').write_text('SMTP_PASSWORD=do-not-leak-this-password\n')
    (tmp_path/'backend/app/config.py').write_text('leaked = "do-not-leak-this-password"\n')
    (tmp_path/'output').mkdir()
    previous=tmp_path/'output/invoice-keeper.zip';previous.write_bytes(b'previous artifact')
    with pytest.raises(RuntimeError,match='секрет'):build_archive(tmp_path)
    assert previous.read_bytes()==b'previous artifact'
    assert not list((tmp_path/'output').glob('.release-*'))


def test_same_host_with_wrong_origin_scheme_is_rejected(setup):
    _,client,_,_=setup
    sign_in(client)
    assert client.post('/api/v1/auth/logout',headers={'Origin':'https://testserver'}).status_code==403


def test_upload_is_authorized_before_multipart_parsing(setup):
    _,client,_,_=setup
    result=client.post('/api/v1/payment-occurrences/1/attachments',content=b'not even multipart',headers={'Content-Type':'multipart/form-data; boundary=x'})
    assert result.status_code==401


def test_relogin_rotates_session_and_invalidates_previous_browser_cookie(setup):
    app,client,_,_=setup
    sign_in(client)
    old_cookie=dict(client.cookies)
    sign_in(client)
    old=TestClient(app);old.cookies.update(old_cookie)
    assert old.get('/api/v1/auth/me').status_code==401
    assert client.get('/api/v1/auth/me').status_code==200


def test_logging_redacts_credentials_and_preserves_access_log_shape(setup):
    import logging
    from backend.app.logging_security import SecretFilter
    filter=SecretFilter();filter.add(('a-private-application-secret',))
    record=logging.LogRecord('httpx',logging.INFO,'test',1,'HTTP Request: %s %s',('POST','https://api.telegram.org/bot123:a-private-application-secret/sendMessage'),None)
    filter.filter(record)
    assert 'a-private-application-secret' not in record.getMessage()
    assert '/bot[REDACTED]/sendMessage' in record.getMessage()
    access=logging.LogRecord('uvicorn.access',logging.INFO,'test',1,'%s %s %s %s %s',('127.0.0.1:1','GET','/a-private-application-secret','1.1',200),None)
    filter.filter(access)
    assert len(access.args)==5 and access.args[-1]==200
    assert 'a-private-application-secret' not in access.getMessage()


def test_mandatory_openapi_paths_and_response_models(setup):
    _,client,_,_=setup
    sign_in(client)
    spec=client.get('/api/v1/openapi.json').json()
    required={
        '/api/v1/auth/login':{'post'},'/api/v1/auth/me':{'get'},'/api/v1/auth/logout':{'post'},
        '/api/v1/recurring-payments':{'get','post'},'/api/v1/recurring-payments/{id}':{'delete'},
        '/api/v1/payment-occurrences':{'get'},'/api/v1/payment-occurrences/{id}':{'get','patch'},
        '/api/v1/payments/summary':{'get'},'/api/v1/users':{'get','post'},'/api/v1/users/{id}':{'patch','delete'},
    }
    for path,methods in required.items():assert methods<=set(spec['paths'][path])
    model=spec['paths']['/api/v1/payment-occurrences/{id}']['get']['responses']['200']['content']['application/json']['schema']
    assert model['$ref'].endswith('/PaymentOccurrence')
    assert spec['components']['schemas']['Login']['properties']['password']['writeOnly'] is True


def test_reverse_proxy_uses_explicit_public_origin_not_untrusted_forwarded_header(setup):
    from backend.app.http_security import origin_allowed
    from starlette.requests import Request
    settings=replace(setup[2],public_base_url='https://keeper.example.com',cookie_secure=True)
    scope={'type':'http','method':'POST','scheme':'http','server':('127.0.0.1',8000),'path':'/api/v1/auth/login','query_string':b'',
           'headers':[(b'host',b'keeper.example.com'),(b'origin',b'https://keeper.example.com')]}
    assert origin_allowed(Request(scope),settings)
    scope['headers']=[(b'host',b'testserver'),(b'origin',b'https://testserver'),(b'x-forwarded-proto',b'https')]
    assert not origin_allowed(Request(scope),setup[2])
