// src/lib/hooks/useDebounceSearch.ts
//
// Shared debounced search hook with abort control.
// Eliminates duplicate search patterns across StopRow, PlaceSearchModal, etc.
"use client";

import { useCallback, useRef, useState } from "react";

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MIN_QUERY = 2;

type UseDebounceSearchOpts<T> = {
  /** The async search function. Receives query + AbortSignal. */
  searchFn: (query: string, signal: AbortSignal) => Promise<T[]>;
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
  /** Minimum query length before searching (default 2) */
  minQueryLen?: number;
};

type UseDebounceSearchReturn<T> = {
  results: T[];
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  /** Call on every keystroke - handles debounce + abort internally */
  search: (query: string) => void;
  /** Immediately execute search (e.g. on Enter) */
  searchNow: (query: string) => void;
  /** Reset all state */
  reset: () => void;
};

export function useDebounceSearch<T>({
  searchFn,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  minQueryLen = DEFAULT_MIN_QUERY,
}: UseDebounceSearchOpts<T>): UseDebounceSearchReturn<T> {
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < minQueryLen) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(null);

      try {
        const items = await searchFn(trimmed, ac.signal);
        if (ac.signal.aborted) return;
        setResults(items);
        setHasSearched(true);
      } catch (e: unknown) {
        if (ac.signal.aborted) return;
        setResults([]);
        setHasSearched(true);
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [searchFn, minQueryLen],
  );

  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (query.trim().length < minQueryLen) {
        setResults([]);
        setHasSearched(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(() => doSearch(query), debounceMs);
    },
    [doSearch, debounceMs, minQueryLen],
  );

  const searchNow = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query);
    },
    [doSearch],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResults([]);
    setLoading(false);
    setError(null);
    setHasSearched(false);
  }, []);

  return { results, loading, error, hasSearched, search, searchNow, reset };
}
