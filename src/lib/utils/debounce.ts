// src/lib/utils/debounce.ts
export function debounce<TArgs extends any[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): (...args: TArgs) => void {
  let t: any;
  return (...args: TArgs) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), waitMs);
  };
}
