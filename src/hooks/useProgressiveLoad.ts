import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface UseProgressiveLoadOptions {
  initialBatchSize?: number;
  incrementSize?: number;
  delay?: number;
}

/**
 * Hook for progressive/lazy loading of large arrays.
 * Shows an initial batch immediately, then progressively loads more.
 */
export function useProgressiveLoad<T>(
  items: T[],
  options: UseProgressiveLoadOptions = {}
) {
  const {
    initialBatchSize = 20,
    incrementSize = 20,
    delay = 100,
  } = options;

  const [displayCount, setDisplayCount] = useState(initialBatchSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  // Reset when items change significantly (new filter applied)
  useEffect(() => {
    setDisplayCount(initialBatchSize);
  }, [items.length, initialBatchSize]);

  // Memoize visible items
  const visibleItems = useMemo(() => {
    return items.slice(0, displayCount);
  }, [items, displayCount]);

  const hasMore = displayCount < items.length;
  const remainingCount = items.length - displayCount;
  const progress = items.length > 0 ? Math.min(100, (displayCount / items.length) * 100) : 100;

  // Load more function with debounce protection
  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    
    loadingRef.current = true;
    setIsLoadingMore(true);

    // Use requestAnimationFrame for smoother loading
    requestAnimationFrame(() => {
      setTimeout(() => {
        setDisplayCount(prev => Math.min(prev + incrementSize, items.length));
        setIsLoadingMore(false);
        loadingRef.current = false;
      }, delay);
    });
  }, [hasMore, incrementSize, items.length, delay]);

  // Load all remaining items
  const loadAll = useCallback(() => {
    setDisplayCount(items.length);
  }, [items.length]);

  return {
    visibleItems,
    displayCount,
    totalCount: items.length,
    hasMore,
    remainingCount,
    progress,
    isLoadingMore,
    loadMore,
    loadAll,
  };
}
