"""Redact integration credentials without breaking structured access-log arguments."""
import logging
import re
import traceback


class SecretFilter(logging.Filter):
    def __init__(self):
        super().__init__()
        self.values=frozenset()

    def add(self,values):
        self.values=self.values | frozenset(v for v in values if v and len(v)>=8)

    def redact(self,value):
        if isinstance(value,dict):return {k:self.redact(v) for k,v in value.items()}
        if isinstance(value,tuple):return tuple(self.redact(v) for v in value)
        if isinstance(value,list):return [self.redact(v) for v in value]
        if value is None or isinstance(value,(int,float,bool)):return value
        text=str(value)
        text=re.sub(r'/bot[^/\s]+/', '/bot[REDACTED]/', text)
        for secret in sorted(self.values,key=len,reverse=True):text=text.replace(secret,'[REDACTED]')
        text=re.sub(r'(https?://)[^/\s@]+@',r'\1[REDACTED]@',text)
        text=re.sub(r"(https?://[^\s<>\"'?]+)\?[^\s<>\"']+",r'\1?[REDACTED]',text)
        text=re.sub(r"(?i)(\b(?:Bearer|Basic)\s+)[^\s\"']+",r'\1[REDACTED]',text)
        text=re.sub(r'(?i)((?:set-cookie|cookie)\s*:\s*)[^\r\n]+',r'\1[REDACTED]',text)
        text=re.sub(r"(?i)([\"']?(?:password|passwd|smtp_password|admin_password|token|access_token|refresh_token|secret|webhook_secret|csrf_token|x-csrf-token|invoice_session|authorization)[\"']?\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,;&}]+)",r'\1[REDACTED]',text)
        return text

    def filter(self,record):
        if record.name=='uvicorn.access' and isinstance(record.args,tuple):
            record.args=self.redact(record.args)
            if len(record.args)==5:
                record.args=record.args[:2]+(str(record.args[2]).split('?',1)[0],)+record.args[3:]
        else:
            record.msg=self.redact(record.getMessage())
            record.args=()
        if record.exc_info:
            record.exc_text=self.redact(''.join(traceback.format_exception(*record.exc_info)))
            record.exc_info=None
        return True


_FILTER=SecretFilter()


def install_secret_filters(settings):
    _FILTER.add((settings.admin_password,settings.smtp_password,settings.telegram_bot_token,settings.webhook_secret))
    for name in ('invoice_keeper','httpx','httpcore','httpcore.connection','httpcore.http11','httpcore.http2','httpcore.proxy','uvicorn.error','uvicorn.access'):
        logger=logging.getLogger(name)
        if _FILTER not in logger.filters:logger.addFilter(_FILTER)
    # Ancestor logger filters do not run for child records; filter output handlers too.
    for name in ('', 'uvicorn', 'uvicorn.error', 'uvicorn.access'):
        for handler in logging.getLogger(name).handlers:
            if _FILTER not in handler.filters:handler.addFilter(_FILTER)
