// src/lib/hooks/useOptimistic.ts
//
// Lightweight optimistic update helper.
// Applies an optimistic state change immediately, then runs the async
// action in the background.  If it fails, rolls back to the snapshot
// taken before the optimistic update and surfaces the error.
//

import { useCallback, useRef } from "react";
import { haptic } from "@/lib/native/haptics";

type SetState<T> = (updater: T | ((prev: T) => T)) => void;

/**
 * Returns `applyOptimistic` - call it with the optimistic next-state (or
 * updater) and the async action to run.  The hook snapshots the current
 * value, applies the update, runs the action, and reverts + fires haptic
 * error on failure.
 *
 * Usage:
 * ```ts
 * const [items, setItems] = useState<Item[]>([]);
 * const optimistic = useOptimistic(items, setItems);
 *
 * const handleDelete = (id: string) =>
 *   optimistic(
 *     prev => prev.filter(x => x.id !== id),   // optimistic update
 *     () => api.delete(id),                      // async action
 *   );
 * ```
 */
export function useOptimistic<T>(
  currentValue: T,
  setState: SetState<T>,
) {
  // Always snapshot from the latest committed value
  const valueRef = useRef(currentValue);
  valueRef.current = currentValue;

  const applyOptimistic = useCallback(
    async (
      updater: T | ((prev: T) => T),
      action: () => Promise<void>,
      opts?: { onError?: (err: unknown) => void; silent?: boolean },
    ) => {
      const snapshot = valueRef.current;

      // Apply optimistic update immediately
      setState(updater);

      try {
        await action();
      } catch (err) {
        // Revert to snapshot
        setState(snapshot);
        if (!opts?.silent) haptic.error();
        opts?.onError?.(err);
        throw err; // let caller handle if needed
      }
    },
    [setState],
  );

  return applyOptimistic;
}
