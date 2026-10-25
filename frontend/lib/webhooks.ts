export type WebhookDeliveryState = 'pending' | 'sending' | 'sent' | 'uncertain' | 'failed' | 'cancelled';
export type WebhookEndpoint = {
  id: number; name: string; url: string; url_readonly: boolean; enabled: boolean;
  notify_due: boolean; notify_overdue: boolean; has_secret: boolean; allow_private: boolean; legacy_source: boolean;
  created_at: string; updated_at: string;
  last_delivery: { state: WebhookDeliveryState; attempted_at: number | null; sent_at: string | null; error: string } | null;
};
export type WebhookDraft = { name: string; url: string; enabled: boolean; notify_due: boolean; notify_overdue: boolean; secret: string; removeSecret: boolean };
export type WebhookPayload = { name: string; url?: string; enabled: boolean; notify_due: boolean; notify_overdue: boolean; secret?: string };

export function webhookDraft(endpoint: WebhookEndpoint | null): WebhookDraft {
  return { name: endpoint?.name ?? '', url: endpoint?.url_readonly ? '' : endpoint?.url ?? '', enabled: endpoint?.enabled ?? true,
    notify_due: endpoint?.notify_due ?? true, notify_overdue: endpoint?.notify_overdue ?? true, secret: '', removeSecret: false };
}

/** PATCH must not echo a redacted legacy URL or clear an undisclosed signing secret. */
export function webhookPayload(draft: WebhookDraft, endpoint: WebhookEndpoint | null): WebhookPayload {
  const payload: WebhookPayload = { name: draft.name.trim(), enabled: draft.enabled, notify_due: draft.notify_due, notify_overdue: draft.notify_overdue };
  const url = draft.url.trim();
  if (!endpoint || (url && (endpoint.url_readonly || url !== endpoint.url))) payload.url = url;
  if (draft.removeSecret && endpoint?.has_secret) payload.secret = '';
  else if (draft.secret) payload.secret = draft.secret;
  return payload;
}
