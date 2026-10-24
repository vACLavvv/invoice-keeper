"""Exercise the built image without network, secrets, production data or a second poller."""
import subprocess
import sys

CODE = r'''
import copy
import tempfile
import time
from pathlib import Path
from datetime import date
from backend.app.config import Settings
from backend.app.db import Database
from backend.app.domain import materialize
from backend.app.telegram import TelegramBotWorker

with tempfile.TemporaryDirectory() as directory:
    db=Database(Path(directory)/'check.sqlite3');db.initialize()
    settings=Settings(database_path=db.path,admin_username='check',admin_password='isolated-check-only',
        telegram_enabled=True,telegram_bot_token='fake',telegram_chat_id='123',public_base_url='https://keeper.example.com')
    calls=[]
    def api(method,payload):
        calls.append((method,copy.deepcopy(payload)))
        if method=='getMe':return {'ok':True,'result':{'username':'check_bot'}}
        return {'ok':True,'result':{'message_id':payload.get('message_id',501)}}
    bot=TelegramBotWorker(db,settings,today=lambda:date(2026,1,28),api=api)
    with db.connect(write=True) as conn:
        for title,due in [('Old','2026-01-27'),('Next','2026-01-30'),('Future','2026-02-12')]:
            conn.execute("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,frequency,created_at) VALUES(?,100,'RUB',?,1,'once','test')",(title,due))
        materialize(conn,date(2026,1,28))
    bot.commands.configure()
    def command(name,uid):
        bot.handle_update({'update_id':uid,'message':{'message_id':uid+20,'chat':{'id':123,'type':'private'},'from':{'id':123},'date':int(time.time()),'text':name}})
    def current():return next(p for m,p in reversed(calls) if m in ('sendMessage','editMessageText'))
    def press(label,uid):
        p=current();button=next(b for row in p['reply_markup']['inline_keyboard'] for b in row if label in b['text'])
        update={'update_id':uid,'callback_query':{'id':'q'+str(uid),'from':{'id':123},'message':{'message_id':p.get('message_id',501),'chat':{'id':123}},'data':button['callback_data']}}
        bot.handle_update(update);return update
    command('/start',1);assert 'Invoice Keeper' in current()['text']
    command('/week',2);assert 'Next' in current()['text'] and 'Old' not in current()['text'] and 'Future' not in current()['text']
    press('Next',3);assert 'разовый' in current()['text']
    press('Отметить оплату',4)
    with db.connect() as conn:assert conn.execute('SELECT COUNT(*) FROM payment_occurrences WHERE paid_at IS NOT NULL').fetchone()[0]==0
    update=press('Да, отметить',5);bot.handle_update(update)
    with db.connect() as conn:
        assert conn.execute('SELECT COUNT(*) FROM payment_occurrences WHERE paid_at IS NOT NULL').fetchone()[0]==1
        assert conn.execute("SELECT COUNT(*) FROM audit_log WHERE action='occurrence.paid'").fetchone()[0]==1
        assert conn.execute('PRAGMA user_version').fetchone()[0]==4
    command('/overdue',6);assert 'Old' in current()['text'] and 'Next' not in current()['text']
    command('/summary',7);assert 'Оплачено: 1.00' in current()['text']
    assert any(m=='setMyCommands' and p['scope']=={'type':'chat','chat_id':'123'} for m,p in calls)
print('Telegram image acceptance passed: menu, week, once card, confirmation, one-period payment, deduplication, overdue, summary, schema v4')
'''


def main(image):
    if not image.startswith('invoice-keeper:'):
        raise ValueError('Expected a versioned Invoice Keeper image')
    subprocess.run(['docker','run','--rm','--interactive','--pull=never','--name','invoice-keeper-bot-check',
        '--network','none','--read-only','--tmpfs','/tmp:size=16m,mode=1777','--memory','384m','--memory-swap','384m',
        '--cpus','0.35','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true',
        image,'python','-'],input=CODE,text=True,check=True)


if __name__=='__main__':main(sys.argv[1])
