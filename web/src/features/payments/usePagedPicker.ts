import { useCallback, useEffect, useRef, useState } from 'react';
import type { Paginated } from '@/types/api';

/** Her kullanıcı isteğinde tek sayfa; hatada önceki seçenekler korunur. */
export function usePagedPicker<T extends { id: number }>(fetchPage: (page: number) => Promise<Paginated<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const nextPage = useRef(1);
  const inFlight = useRef(false);
  const generation = useRef(0);

  const load = useCallback(async (page: number, epoch: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPage(page);
      if (generation.current !== epoch) return;
      setItems((current) => [...new Map([...current, ...result.data].map((item) => [item.id, item])).values()]);
      nextPage.current = result.meta.current_page + 1;
      setHasMore(result.meta.current_page < result.meta.last_page);
    } catch (caught) {
      if (generation.current === epoch) setError(caught);
    } finally {
      if (generation.current === epoch) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [fetchPage]);

  useEffect(() => {
    const epoch = ++generation.current;
    nextPage.current = 1;
    inFlight.current = false;
    setItems([]);
    setHasMore(false);
    void load(1, epoch);
    return () => { generation.current += 1; inFlight.current = false; };
  }, [load]);

  return { items, error, loading, hasMore, loadMore: () => void load(nextPage.current, generation.current) };
}
