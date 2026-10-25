import { useEffect, useState } from 'react';
import { api, query } from './api';
import { useLoad } from './session';

export type Page<T> = { items: T[]; total: number; page: number; page_size: number; pages: number };

export function useDebounced(value: string, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setSettled(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return settled;
}

/** Changing filters resets the page immediately; responses for old filters never flash in the new view. */
export function usePage<T, Extra = object>(path: string, filters: Record<string, string | undefined>, size = 25) {
  const key = path + query(filters);
  const [selection, setSelection] = useState({ key, page: 1 });
  const page = selection.key === key ? selection.page : 1;
  const url = path + query({ ...filters, page: String(page), page_size: String(size) });
  const loaded = useLoad(async () => ({ key: url, result: await api<Page<T> & Extra>(url) }), [url]);
  const data = loaded.data?.key === url ? loaded.data.result : null;
  useEffect(() => {
    if (data && page > Math.max(1, data.pages)) setSelection({ key, page: Math.max(1, data.pages) });
  }, [data, key, page]);
  return { data, error: loaded.error, page, setPage: (next: number) => setSelection({ key, page: Math.max(1, next) }) };
}
