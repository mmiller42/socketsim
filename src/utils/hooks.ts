import { MutableRefObject, useCallback, useRef } from "react";

export function useValueRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;

  return ref;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEventCallback<TArgs extends any[] | readonly any[], TReturn>(
  fn: (...args: TArgs) => TReturn
): (...args: TArgs) => TReturn {
  const fnRef = useValueRef(fn);
  return useCallback(
    (...args: TArgs): TReturn => fnRef.current(...args),
    [fnRef]
  );
}
