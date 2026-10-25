import { useEffect, useRef, useState } from 'react';
import { api, type NotificationFeed, type User } from './api';
import { longDate, money, symbols } from './format';
import { t } from './i18n';
import { browserNoticeAccount, browserNoticeState, showBrowserNotice, startBrowserNotices, subscribeBrowserNotices, type BrowserNoticeState } from './browser-notices';

export function useBrowserNoticeState(user: User) {
  const account = browserNoticeAccount(user);
  const [state, setState] = useState<BrowserNoticeState>({ enabled: false, permission: 'unsupported', error: null });
  useEffect(() => {
    const update = () => setState(browserNoticeState(account, user.username));
    update();
    return subscribeBrowserNotices(account, update);
  }, [account, user.username]);
  return { account, ...state };
}

export function useBrowserNoticeDelivery(user: User, feed: NotificationFeed | null) {
  const account = browserNoticeAccount(user);
  const controller = useRef<ReturnType<typeof startBrowserNotices> | null>(null);
  useEffect(() => {
    browserNoticeState(account, user.username);
    controller.current = startBrowserNotices(account, {
      load: () => api<NotificationFeed>('/notifications?limit=50'),
      show: (items) => {
        if (items.length > 3) return showBrowserNotice(account, t('Новые события по платежам'), t('Откройте уведомления, чтобы посмотреть новые напоминания и оплаты.'), 'summary');
        const item = items[0];
        const status = item.kind === 'paid' ? t('Оплачено {date}', { date: longDate(item.paid_at) })
          : item.kind === 'overdue' ? t('Просрочено — срок прошёл') : t('Ожидает оплаты');
        return showBrowserNotice(account, item.title, `${money(item.amount)} ${symbols[item.currency]} · ${t('срок {date}', { date: longDate(item.due_date) })}\n${status}`, item.id);
      },
    });
    return () => { controller.current?.stop(); controller.current = null; };
  }, [account, user.username]);
  useEffect(() => { if (feed) void controller.current?.offer(feed); }, [feed, account]);
}
