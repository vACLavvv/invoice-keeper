"""Owner-only Telegram navigation; durable reply claims and message-bound actions."""
import json
import logging
import re
import secrets
import time
from datetime import date, timedelta
from urllib.parse import urlsplit

from .domain import OCCURRENCES, audit, materialize, money, timestamp

logger = logging.getLogger('invoice_keeper')
COMMANDS = [
    ('menu', 'Меню и быстрые действия'), ('payments', 'Все неоплаченные платежи'),
    ('week', 'Платежи на ближайшие 7 дней'), ('overdue', 'Просроченные платежи'),
    ('summary', 'Сводка за текущий месяц'), ('panel', 'Открыть веб-панель'),
    ('help', 'Как пользоваться ботом'),
]


def integer(value):
    return type(value) is int and 0 < value < 2**53


def text(value, limit=120):
    # No parse_mode: user-supplied titles and notes are always plain text.
    return ''.join(c for c in str(value) if c in '\n\t' or ord(c) >= 32)[:limit]


class TelegramCommands:
    def __init__(self, worker, now=None):
        self.worker = worker
        self.db, self.settings = worker.db, worker.settings
        self.now = now or time.time
        self.username = ''

    def configure(self):
        if not self.settings.telegram_commands:
            return
        with self.db.connect(write=True) as conn:
            conn.execute("UPDATE telegram_requests SET state='uncertain' WHERE state='sending'")
        result = self.worker.api('getMe', {})
        if result.get('ok') and isinstance(result.get('result'), dict):
            self.username = str(result['result'].get('username', '')).lower()
        scope = {'type': 'chat', 'chat_id': self.settings.telegram_chat_id}
        result = self.worker.api('setMyCommands', {
            'scope': scope, 'commands': [{'command': c, 'description': d} for c, d in COMMANDS],
        })
        if not result.get('ok'):
            logger.warning('Telegram: не удалось зарегистрировать меню команд')
        elif self.settings.telegram_chat_id.isdigit():
            self.worker.api('setChatMenuButton', {'chat_id': self.settings.telegram_chat_id,
                                               'menu_button': {'type': 'commands'}})

    def allowed(self, actor, chat):
        return (self.settings.telegram_commands and isinstance(actor, dict) and isinstance(chat, dict)
                and integer(actor.get('id')) and not actor.get('is_bot')
                and actor['id'] in self.settings.telegram_actors
                and type(chat.get('id')) is int and str(chat['id']) == self.settings.telegram_chat_id)

    def button(self, conn, update_id, actor, label, action, **values):
        token = secrets.token_urlsafe(18)
        conn.execute('INSERT INTO telegram_actions(token,chat_id,actor_id,request_id,payload,expires_at) VALUES(?,?,?,?,?,?)',
                     (token, self.settings.telegram_chat_id, actor, update_id,
                      json.dumps({'action': action, **values}), int(self.now()) + (300 if action == 'pay' else 900)))
        return {'text': label, 'callback_data': 'ui:' + token}

    def panel(self):
        url = self.settings.public_base_url
        return url if urlsplit(url).scheme == 'https' else ''

    def render(self, conn, update_id, actor, action, **values):
        def button(label, target, **params):
            return self.button(conn, update_id, actor, label, target, **params)
        menu = [[button('← В меню', 'menu')]]
        today = self.worker.today()
        if action in ('menu', 'start', 'help'):
            body = ('Invoice Keeper\n\nПроверяйте сроки и отмечайте оплату прямо здесь.\n'
                    'Выберите список → откройте платёж → подтвердите отметку оплаты.\n'
                    'Бот отмечает оплату в учёте; деньги не переводит.\n\n'
                    'Создать и изменить платёж, прикрепить счёт или отменить отметку можно в веб-панели.\n'
                    'Списки обновляются при открытии. Кнопки действуют 15 минут, подтверждение — 5 минут.\n'
                    'Если кнопка устарела, отправьте /menu.')
            rows = [[button('📋 Все платежи', 'payments'), button('📅 На 7 дней', 'week')],
                    [button('🔴 Просроченные', 'overdue'), button('📊 Сводка', 'summary')]]
            if self.panel():
                rows.append([{'text': 'Открыть панель ↗', 'url': self.panel()}])
            return body, rows
        if action == 'panel':
            return ('Веб-панель Invoice Keeper' if self.panel() else 'Публичный HTTPS-адрес панели ещё не настроен.'), (
                [[{'text': 'Открыть панель ↗', 'url': self.panel()}]] + menu if self.panel() else menu)
        if action == 'summary':
            start = today.replace(day=1).isoformat()
            end = (today.replace(day=28) + timedelta(days=4)).replace(day=1).isoformat()
            rows = conn.execute('''SELECT o.currency,COUNT(*) count,SUM(o.amount_cents) total,
                SUM(CASE WHEN o.paid_at IS NOT NULL THEN o.amount_cents ELSE 0 END) paid,
                SUM(CASE WHEN o.paid_at IS NULL AND o.due_date<? THEN o.amount_cents ELSE 0 END) overdue
                FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
                WHERE r.active=1 AND o.due_date>=? AND o.due_date<? GROUP BY o.currency ORDER BY o.currency''',
                                (today.isoformat(), start, end)).fetchall()
            lines = [f'Сводка за {today:%m.%Y}', 'Активные платежи со сроком в этом месяце. Суммы в разных валютах считаются отдельно.']
            for row in rows:
                lines.append(f"\n{row['currency']} · периодов: {row['count']}\nВсего: {money(row['total'])}\n"
                             f"Оплачено: {money(row['paid'])}\nОсталось: {money(row['total']-row['paid'])}\n"
                             f"Из них просрочено: {money(row['overdue'])}")
            if not rows:
                lines.append('\nВ этом месяце платежей нет.')
            return '\n'.join(lines), menu
        if action in ('payments', 'week', 'overdue'):
            page = max(0, min(int(values.get('page', 0)), 100000))
            clause, args = '', []
            if action == 'week':
                clause, args = ' AND o.due_date>=? AND o.due_date<=?', [today.isoformat(), (today+timedelta(days=6)).isoformat()]
            elif action == 'overdue':
                clause, args = ' AND o.due_date<?', [today.isoformat()]
            where = ' WHERE r.active=1 AND o.paid_at IS NULL' + clause
            count = conn.execute('SELECT COUNT(*) FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id'+where, args).fetchone()[0]
            page = min(page, max(0, (count-1)//6))
            rows = conn.execute(OCCURRENCES+where+' ORDER BY o.due_date,o.id LIMIT 6 OFFSET ?', [*args, page*6]).fetchall()
            title = {'payments': 'Неоплаченные платежи', 'week': 'Ближайшие 7 дней', 'overdue': 'Просроченные платежи'}[action]
            lines, keys = [title, f'На {today:%d.%m.%Y} · всего: {count}'], []
            for index, row in enumerate(rows, page*6+1):
                kind = 'разовый' if row['frequency'] == 'once' else 'ежемесячный'
                mark = '🔴' if row['due_date'] < today.isoformat() else '▫️'
                lines.append(f"\n{index}. {mark} {text(row['title'])}\n{money(row['amount_cents'])} {row['currency']} · до {date.fromisoformat(row['due_date']):%d.%m.%Y} · {kind}")
                keys.append([button(f"{index}. {text(row['title'], 45)} →", 'detail', id=row['id'])])
            if not rows:
                lines.append('\nЗдесь пока нет неоплаченных платежей. Всё актуальное можно посмотреть в панели.')
            nav = []
            if page:
                nav.append(button('← Назад', action, page=page-1))
            if (page+1)*6 < count:
                nav.append(button('Дальше →', action, page=page+1))
            if nav:
                keys.append(nav)
            return '\n'.join(lines), keys + menu
        if action in ('detail', 'confirm', 'pay'):
            row = conn.execute(OCCURRENCES+' WHERE o.id=?', (values.get('id'),)).fetchone()
            if not row or not row['active']:
                return 'Платёж больше не активен. Откройте свежий список.', menu
            snapshot = [row[k] for k in ('title', 'amount_cents', 'currency', 'due_date')]
            detail = (f"{text(row['title'])}\n{money(row['amount_cents'])} {row['currency']}\n"
                      f"Срок: {date.fromisoformat(row['due_date']):%d.%m.%Y}\n"
                      f"Тип: {'разовый' if row['frequency']=='once' else 'ежемесячный'}")
            if row['paid_at']:
                return detail + '\n\n✅ Уже оплачен: ' + row['paid_at'], menu
            if action == 'pay':
                if not self.settings.telegram_buttons:
                    return 'Отметка оплаты в Telegram отключена. Откройте панель.', menu
                if values.get('snapshot') != snapshot:
                    return 'Платёж изменился. Проверьте обновлённую карточку перед оплатой.', [[button('Открыть карточку', 'detail', id=row['id'])]] + menu
                paid_at, name = today.isoformat(), f'telegram:{actor}'
                conn.execute('UPDATE payment_occurrences SET paid_at=?,updated_by=?,updated_at=? WHERE id=? AND paid_at IS NULL',
                             (paid_at, name, timestamp(), row['id']))
                conn.execute("UPDATE reminders SET button_version=0,state=CASE WHEN state='pending' THEN 'cancelled' ELSE state END WHERE occurrence_id=?", (row['id'],))
                conn.execute("UPDATE notification_deliveries SET state='cancelled' WHERE state='pending' AND occurrence_id=?", (row['id'],))
                audit(conn, name, 'occurrence.paid', row['id'], {'source': 'telegram', 'old_paid_at': None, 'paid_at': paid_at,
                      'title': row['title'], 'due_date': row['due_date']})
                return detail + f'\n\n✅ Оплата отмечена: {paid_at}\nИзменён только этот период. Отменить отметку можно в панели.', menu
            if action == 'confirm' and self.settings.telegram_buttons:
                return detail + '\n\nОтметить этот период оплаченным сегодня? Деньги не списываются.', [
                    [button('✅ Да, отметить оплату', 'pay', id=row['id'], snapshot=snapshot)],
                    [button('Отмена', 'detail', id=row['id'])]]
            notes = text(row['notes'], 700)
            if notes:
                detail += '\n\nКомментарий:\n' + notes
            keys = [[button('Отметить оплату', 'confirm', id=row['id'])]] if self.settings.telegram_buttons else []
            return detail + '\n\nСтатус: ' + ('просрочен' if row['due_date'] < today.isoformat() else 'ожидает оплаты'), keys + menu
        return 'Откройте меню командой /menu.', menu

    def handle(self, update):
        if not isinstance(update, dict) or not integer(update.get('update_id')):
            return
        update_id, query = update['update_id'], update.get('callback_query')
        callback = isinstance(query, dict)
        message = query.get('message') if callback else update.get('message')
        if not isinstance(message, dict):
            return
        actor = query.get('from') if callback else message.get('from')
        if not self.allowed(actor, message.get('chat')) or not integer(message.get('message_id')):
            return
        if message.get('sender_chat') or message.get('forward_origin') or message.get('forward_from'):
            return
        actor_id, message_id = actor['id'], message['message_id']
        now = int(self.now())
        if callback:
            data = query.get('data')
            if not isinstance(data, str) or not data.startswith('ui:') or len(data) > 64:
                return
        else:
            # Do not act on old queued conversations when enabling message updates.
            if type(message.get('date')) is not int or not -30 <= now-message['date'] <= 900:
                return
            raw = message.get('text', '')
            if not isinstance(raw, str) or len(raw) > 256:
                return
            match = re.fullmatch(r'/([a-zA-Z]+)(?:@([A-Za-z0-9_]+))?(?:\s+.*)?', raw.strip())
            if match and match[2] and match[2].lower() != self.username:
                return
            if message['chat'].get('type') != 'private' and not match:
                return
            action = match[1].lower() if match else 'help'
            if action not in {c for c, _ in COMMANDS} | {'start'}:
                action = 'help'
        error = ''
        with self.db.connect(write=True) as conn:
            conn.execute('DELETE FROM telegram_actions WHERE expires_at<?', (now,))
            conn.execute('DELETE FROM telegram_requests WHERE created_at<?', (now-30*86400,))
            if conn.execute('SELECT 1 FROM telegram_requests WHERE update_id=?', (update_id,)).fetchone():
                error = 'Уже обработано. Для свежего списка откройте /menu.'
            elif conn.execute('SELECT COUNT(*) FROM telegram_requests WHERE actor_id=? AND created_at>?', (actor_id, now-10)).fetchone()[0] >= 20:
                error = 'Слишком быстро. Попробуйте через несколько секунд.'
            values = {}
            if callback and not error:
                row = conn.execute('SELECT * FROM telegram_actions WHERE token=? AND chat_id=? AND actor_id=? AND message_id=? AND expires_at>=?',
                                   (data[3:], self.settings.telegram_chat_id, actor_id, message_id, now)).fetchone()
                if not row:
                    error = 'Кнопка устарела. Откройте /menu.'
                else:
                    values = json.loads(row['payload'])
                    action = values.pop('action')
            if not error:
                conn.execute("INSERT INTO telegram_requests(update_id,actor_id,created_at,state) VALUES(?,?,?,'sending')", (update_id, actor_id, now))
                if callback:
                    conn.execute('DELETE FROM telegram_actions WHERE chat_id=? AND message_id=?', (self.settings.telegram_chat_id, message_id))
                materialize(conn, self.worker.today())
                body, keys = self.render(conn, update_id, actor_id, action, **values)
                payload = {'chat_id': self.settings.telegram_chat_id, 'text': body,
                           'reply_markup': {'inline_keyboard': keys}, 'link_preview_options': {'is_disabled': True}}
                if callback:
                    payload['message_id'] = message_id
        if callback:
            self.worker.api('answerCallbackQuery', {'callback_query_id': query.get('id'), 'text': error or 'Готово', 'show_alert': bool(error)})
        if error:
            return
        # Claim is durable before network I/O. An ambiguous response is never automatically re-sent.
        result = self.worker.api('editMessageText' if callback else 'sendMessage', payload)
        delivered = result.get('result')
        bound_id = message_id if callback else (delivered.get('message_id') if isinstance(delivered, dict) else None)
        success = bool(result.get('ok')) and integer(bound_id)
        with self.db.connect(write=True) as conn:
            conn.execute('UPDATE telegram_requests SET state=?,message_id=? WHERE update_id=?',
                         ('sent' if success else 'uncertain', bound_id if success else None, update_id))
            if success:
                conn.execute('UPDATE telegram_actions SET message_id=? WHERE request_id=?', (bound_id, update_id))
            else:
                conn.execute('DELETE FROM telegram_actions WHERE request_id=?', (update_id,))
        if not success:
            logger.warning('Telegram: ответ на команду не подтверждён; повторной отправки не будет')
        else:
            logger.info('Telegram: обработано действие %s', action)
