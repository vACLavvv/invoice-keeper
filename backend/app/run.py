import argparse
import os
import socket
import subprocess
import sys
import time
import signal

import uvicorn
import httpx

from .config import ROOT,Settings


def start_demo_receiver(port,environment):
    # Never kill or replace a process already bound to this port.
    with socket.socket() as probe:
        try:probe.bind(('127.0.0.1',port))
        except OSError:raise RuntimeError(f'Порт {port} занят. Уже работающий приёмник можно оставить и запустить приложение без --demo-webhook.') from None
    process=subprocess.Popen([sys.executable,'-m','backend.app.webhook_demo','--port',str(port)],cwd=ROOT,env=environment)
    try:
        with httpx.Client(timeout=0.5,trust_env=False) as client:
            for _ in range(50):
                if process.poll() is not None:raise RuntimeError('Локальный приёмник не запустился')
                try:
                    result=client.get(f'http://127.0.0.1:{port}/healthz')
                    if result.status_code==200 and result.json().get('service')=='invoice-keeper-webhook-demo':return process
                except (httpx.RequestError,ValueError):pass
                time.sleep(0.1)
        raise RuntimeError('Локальный приёмник не ответил при запуске')
    except BaseException:
        if process.poll() is None:process.terminate()
        process.wait(timeout=5)
        raise


def main():
    parser = argparse.ArgumentParser(description="Запустить Invoice Keeper. По умолчанию доступен только на этом компьютере.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18080)
    parser.add_argument('--demo-webhook',action='store_true',help='Запустить вместе приложение и локальный webhook; остальные каналы работают по .env')
    parser.add_argument('--webhook-port',type=int,default=18083)
    args = parser.parse_args()
    if not 1<=args.port<=65535 or not 1<=args.webhook_port<=65535:parser.error('Порт должен быть в диапазоне 1–65535')
    receiver=None
    previous_term=None
    try:
        if args.demo_webhook:
            if args.port==args.webhook_port:parser.error('Приложению и приёмнику нужны разные порты')
            settings=Settings.from_env()
            if len(settings.webhook_secret)<24:parser.error('Для демо задайте WEBHOOK_SECRET в .env или создайте настройки через bootstrap')
            os.environ['WEBHOOK_ENABLED']='true'
            os.environ['WEBHOOK_ALLOW_LOCALHOST']='true'
            os.environ['WEBHOOK_URL']=f'http://127.0.0.1:{args.webhook_port}/events'
            def stop_group(signum,frame):raise KeyboardInterrupt
            previous_term=signal.getsignal(signal.SIGTERM)
            signal.signal(signal.SIGTERM,stop_group)
            environment={k:v for k,v in os.environ.items() if not k.startswith(('ADMIN_','SMTP_','TELEGRAM_','DEMO_'))}
            receiver=start_demo_receiver(args.webhook_port,environment)
        uvicorn.run("backend.app.main:create_app", factory=True, host=args.host, port=args.port, workers=1, proxy_headers=False,limit_concurrency=16,backlog=128,timeout_keep_alive=5)
    except RuntimeError as error:parser.exit(1,str(error)+'\n')
    except KeyboardInterrupt:pass
    finally:
        if receiver and receiver.poll() is None:
            receiver.terminate()
            try:receiver.wait(timeout=5)
            except subprocess.TimeoutExpired:receiver.kill();receiver.wait(timeout=5)
        if previous_term is not None:signal.signal(signal.SIGTERM,previous_term)


if __name__ == "__main__":
    main()
