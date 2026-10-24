import copy
import time
from dataclasses import replace
from datetime import date

import pytest

from backend.app.domain import timestamp
from backend.app.telegram import TelegramBotWorker
from conftest import create_payment, sign_in


@pytest.fixture
def bot(setup):
    app, client, settings, clock = setup
    sign_in(client)
    calls = []
    def api(method, payload):
        calls.append((method, copy.deepcopy(payload)))
        if method == 'getMe':
            return {'ok': True, 'result': {'username': 'keeper_test_bot'}}
        if method in ('sendMessage', 'editMessageText'):
            return {'ok': True, 'result': {'message_id': payload.get('message_id', 900)}}
        return {'ok': True, 'result': True}
    worker = TelegramBotWorker(app.state.db, replace(settings, telegram_enabled=True,
                               telegram_bot_token='test', telegram_chat_id='123',
                               public_base_url='https://keeper.example.com'), today=lambda: clock[0], api=api)
    worker.commands.now = lambda: 1800000000
    return worker, calls


def message(command='/menu', uid=1):
    return {'update_id': uid, 'message': {'message_id': uid+10, 'date': 1800000000,
            'chat': {'id': 123, 'type': 'private'}, 'from': {'id': 123}, 'text': command}}


def click(payload, label, uid):
    buttons = [b for row in payload['reply_markup']['inline_keyboard'] for b in row]
    button = next(b for b in buttons if label in b['text'])
    return {'update_id': uid, 'callback_query': {'id': f'q{uid}', 'from': {'id': 123},
            'message': {'message_id': payload.get('message_id', 900), 'chat': {'id': 123}},
            'data': button['callback_data']}}


def response(calls):
    return next(payload for method, payload in reversed(calls) if method in ('sendMessage', 'editMessageText'))


def test_menu_registration_owner_scope_and_panel(bot):
    worker, calls = bot
    worker.commands.configure()
    registered = next(p for m, p in calls if m == 'setMyCommands')
    assert registered['scope'] == {'type': 'chat', 'chat_id': '123'}
    assert {c['command'] for c in registered['commands']} >= {'payments', 'week', 'overdue', 'summary', 'help'}
    worker.handle_update(message('/start'))
    payload = response(calls)
    assert any(b.get('url') == 'https://keeper.example.com' for row in payload['reply_markup']['inline_keyboard'] for b in row)
    assert 'parse_mode' not in payload and 'деньги не переводит' in payload['text']


def test_lists_filters_pagination_and_separate_currency_totals(setup, bot):
    worker, calls = bot
    client = setup[1]
    for i in range(8):
        create_payment(client, title=f'Счёт {i}', first_due_date='2026-01-20', currency='USD')
    create_payment(client, title='Завтра', first_due_date='2026-01-29', currency='RUB')
    create_payment(client, title='Позже', first_due_date='2026-02-10', currency='EUR')
    worker.handle_update(message('/overdue'))
    first = response(calls)
    assert 'всего: 8' in first['text'] and 'Завтра' not in first['text']
    assert 'Счёт 6' not in first['text']
    worker.handle_update(click(first, 'Дальше', 2))
    assert 'Счёт 6' in response(calls)['text']
    worker.handle_update(message('/week', 3))
    assert 'Завтра' in response(calls)['text'] and 'Счёт 0' not in response(calls)['text'] and 'Позже' not in response(calls)['text']
    worker.handle_update(message('/summary', 4))
    assert 'USD' in response(calls)['text'] and 'RUB' in response(calls)['text'] and 'EUR' not in response(calls)['text']


def test_payment_confirmation_only_one_period_audit_and_no_replay(setup, bot):
    worker, calls = bot
    client = setup[1]
    create_payment(client)
    item = client.get('/api/v1/payment-occurrences').json()[0]
    worker.handle_update(message('/payments'))
    worker.handle_update(click(response(calls), 'Аренда', 2))
    detail = response(calls)
    worker.handle_update(click(detail, 'Отметить оплату', 3))
    confirm = response(calls)
    assert client.get(f"/api/v1/payment-occurrences/{item['id']}").json()['paid_at'] is None
    update = click(confirm, 'Да, отметить', 4)
    worker.handle_update(update)
    count = len([m for m, p in calls if m == 'editMessageText'])
    worker.handle_update(update)
    again = copy.deepcopy(update); again['update_id'] = 5
    worker.handle_update(again)
    assert len([m for m, p in calls if m == 'editMessageText']) == count
    assert client.get(f"/api/v1/payment-occurrences/{item['id']}").json()['paid_at'] == '2026-01-28'
    assert client.get('/api/v1/payment-occurrences').json()[1]['paid_at'] is None
    with worker.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM audit_log WHERE actor='telegram:123' AND action='occurrence.paid'").fetchone()[0] == 1


@pytest.mark.parametrize('change', ['actor', 'chat', 'bot', 'stale', 'forward', 'edited', 'bool'])
def test_untrusted_messages_do_not_reply_or_disclose(bot, change):
    worker, calls = bot
    update = message('/payments')
    if change == 'actor': update['message']['from']['id'] = 999
    if change == 'chat': update['message']['chat']['id'] = 999
    if change == 'bot': update['message']['from']['is_bot'] = True
    if change == 'stale': update['message']['date'] -= 901
    if change == 'forward': update['message']['forward_origin'] = {'type': 'user'}
    if change == 'edited': update['edited_message'] = update.pop('message')
    if change == 'bool': update['message']['from']['id'] = True
    worker.handle_update(update)
    assert not calls


@pytest.mark.parametrize('change', ['actor', 'chat', 'message', 'expired', 'token'])
def test_callback_binding_and_expiry(bot, change):
    worker, calls = bot
    worker.handle_update(message())
    update = click(response(calls), 'Все платежи', 2)
    if change == 'actor': update['callback_query']['from']['id'] = 999
    if change == 'chat': update['callback_query']['message']['chat']['id'] = 999
    if change == 'message': update['callback_query']['message']['message_id'] = 999
    if change == 'expired': worker.commands.now = lambda: 1800000901
    if change == 'token': update['callback_query']['data'] = 'ui:forged'
    calls.clear()
    worker.handle_update(update)
    assert not any(m in ('sendMessage', 'editMessageText') for m, _ in calls)


def test_ambiguous_reply_not_resent_after_restart(bot):
    worker, calls = bot
    worker.api = lambda m, p: {'ok': False}
    worker.handle_update(message())
    with worker.db.connect() as conn:
        assert conn.execute('SELECT state FROM telegram_requests').fetchone()[0] == 'uncertain'
        assert conn.execute('SELECT COUNT(*) FROM telegram_actions').fetchone()[0] == 0
    worker.api = lambda m, p: calls.append((m, p)) or {'ok': True}
    worker.commands = type(worker.commands)(worker, now=lambda: 1800000000)
    worker.handle_update(message())
    assert not calls


@pytest.mark.parametrize('change', ['amount', 'archive', 'paid', 'cancel', 'disabled'])
def test_confirmation_rechecks_current_state(setup, bot, change):
    worker, calls = bot
    client = setup[1]
    create_payment(client)
    item = client.get('/api/v1/payment-occurrences').json()[0]
    worker.handle_update(message('/payments'))
    worker.handle_update(click(response(calls), 'Аренда', 2))
    worker.handle_update(click(response(calls), 'Отметить оплату', 3))
    confirm = response(calls)
    if change == 'amount':
        with worker.db.connect(write=True) as conn:
            conn.execute('UPDATE payment_occurrences SET amount_cents=20000 WHERE id=?', (item['id'],))
    if change == 'archive': client.delete(f"/api/v1/recurring-payments/{item['recurring_payment_id']}")
    if change == 'paid': client.patch(f"/api/v1/payment-occurrences/{item['id']}", json={'paid': True})
    if change == 'cancel': worker.handle_update(click(confirm, 'Отмена', 4))
    if change == 'disabled': worker.commands.settings = replace(worker.settings, telegram_buttons_enabled=False)
    worker.handle_update(click(confirm, 'Да, отметить', 5))
    with worker.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM audit_log WHERE actor='telegram:123' AND action='occurrence.paid'").fetchone()[0] == 0


def test_unknown_text_not_echoed_group_noise_ignored_and_other_bot_ignored(bot):
    worker, calls = bot
    worker.commands.configure()
    calls.clear()
    worker.handle_update(message('/payments@other_bot'))
    assert not calls
    update = message('some private password')
    update['message']['chat']['type'] = 'group'
    worker.handle_update(update)
    assert not calls
    worker.handle_update(message('some private password', 2))
    assert 'some private password' not in response(calls)['text']


def test_commands_work_without_payment_buttons(bot):
    worker, calls = bot
    worker.commands.settings = replace(worker.settings, telegram_buttons_enabled=False)
    worker.handle_update(message())
    assert 'Invoice Keeper' in response(calls)['text']


def test_v3_migration_preserves_offset_and_existing_records(bot):
    worker, _ = bot
    with worker.db.connect(write=True) as conn:
        conn.execute('DROP TABLE telegram_actions')
        conn.execute('DROP TABLE telegram_requests')
        conn.execute('PRAGMA user_version=3')
        conn.execute("INSERT INTO app_meta(key,value) VALUES('telegram_offset','524')")
        conn.execute("INSERT INTO telegram_callbacks VALUES(12,'done',?)", (timestamp(),))
    worker.db.initialize(); worker.db.initialize()
    with worker.db.connect() as conn:
        assert conn.execute('PRAGMA user_version').fetchone()[0] == 4
        assert conn.execute("SELECT value FROM app_meta WHERE key='telegram_offset'").fetchone()[0] == '524'
        assert conn.execute('SELECT response_text FROM telegram_callbacks WHERE update_id=12').fetchone()[0] == 'done'


def test_poll_includes_messages_and_rate_limit_is_bounded(bot):
    worker, calls = bot
    worker.api = lambda m, p: calls.append((m, p)) or {'ok': True, 'result': []}
    worker.poll_once()
    assert calls[-1][1]['allowed_updates'] == ['message', 'callback_query']
    for i in range(25): worker.handle_update(message(uid=i+1))
    assert sum(m == 'sendMessage' for m, _ in calls) == 20


def test_payment_audit_failure_rolls_back_payment_and_consumption(setup, bot):
    worker, calls = bot
    create_payment(setup[1])
    worker.handle_update(message('/payments'))
    worker.handle_update(click(response(calls), 'Аренда', 2))
    worker.handle_update(click(response(calls), 'Отметить оплату', 3))
    update = click(response(calls), 'Да, отметить', 4)
    with worker.db.connect(write=True) as conn:
        conn.execute("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log WHEN NEW.action='occurrence.paid' BEGIN SELECT RAISE(ABORT,'test audit failure'); END")
    with pytest.raises(Exception, match='test audit failure'):
        worker.handle_update(update)
    with worker.db.connect() as conn:
        assert conn.execute('SELECT COUNT(*) FROM payment_occurrences WHERE paid_at IS NOT NULL').fetchone()[0] == 0
        assert not conn.execute('SELECT 1 FROM telegram_requests WHERE update_id=4').fetchone()
        assert conn.execute('SELECT 1 FROM telegram_actions WHERE token=?', (update['callback_query']['data'][3:],)).fetchone()


def test_one_time_payment_card_and_pending_notifications_cancelled(setup, bot):
    worker, calls = bot
    result = setup[1].post('/api/v1/one-time-payments', json={'title': '<b>Разовая работа</b>',
                          'amount': '42.00', 'currency': 'EUR', 'due_date': '2026-01-29', 'notes': 'За фичу'})
    assert result.status_code == 201
    item = result.json()
    with worker.db.connect(write=True) as conn:
        conn.execute("INSERT INTO reminders(occurrence_id,state) VALUES(?,'pending')", (item['id'],))
        conn.execute("INSERT INTO notification_deliveries(occurrence_id,channel,state,delivery_key) VALUES(?,'email','pending','test-cancel')", (item['id'],))
    worker.handle_update(message('/week'))
    worker.handle_update(click(response(calls), 'Разовая', 2))
    assert 'разовый' in response(calls)['text'] and 'За фичу' in response(calls)['text']
    assert 'parse_mode' not in response(calls)
    worker.handle_update(click(response(calls), 'Отметить оплату', 3))
    worker.handle_update(click(response(calls), 'Да, отметить', 4))
    with worker.db.connect() as conn:
        assert conn.execute('SELECT state FROM reminders WHERE occurrence_id=?', (item['id'],)).fetchone()[0] == 'cancelled'
        assert conn.execute('SELECT state FROM notification_deliveries WHERE occurrence_id=?', (item['id'],)).fetchone()[0] == 'cancelled'
        assert conn.execute('SELECT COUNT(*) FROM payment_occurrences WHERE recurring_payment_id=?', (item['recurring_payment_id'],)).fetchone()[0] == 1
