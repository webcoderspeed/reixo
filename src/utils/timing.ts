export function debounce<T extends (this: unknown, ...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (this: ThisParameterType<T>, ...args: Parameters<T>) => void {
  const state = {
    timeout: null as ReturnType<typeof setTimeout> | null,
  };
  const { leading = false, trailing = true } = options;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (state.timeout) {
      clearTimeout(state.timeout);
    }

    if (leading && !state.timeout) {
      func.apply(this, args);
    }

    state.timeout = setTimeout(() => {
      state.timeout = null;
      if (trailing) {
        func.apply(this, args);
      }
    }, wait);
  };
}

export function throttle<T extends (this: unknown, ...args: unknown[]) => unknown>(
  func: T,
  limit: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (this: ThisParameterType<T>, ...args: Parameters<T>) => void {
  const state = {
    inThrottle: false,
    lastFunc: undefined as ReturnType<typeof setTimeout> | undefined,
    lastRan: 0,
  };
  const { leading = true, trailing = true } = options;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (!state.inThrottle) {
      if (leading) {
        func.apply(this, args);
        state.lastRan = Date.now();
        state.inThrottle = true;
        setTimeout(() => (state.inThrottle = false), limit);
      } else {
        state.inThrottle = true;
        setTimeout(() => (state.inThrottle = false), limit);

        if (trailing) {
          state.lastFunc = setTimeout(() => {
            func.apply(this, args);
            state.lastRan = Date.now();
          }, limit);
        }
      }
    } else {
      if (state.lastFunc) clearTimeout(state.lastFunc);
      if (trailing) {
        state.lastFunc = setTimeout(
          () => {
            if (Date.now() - state.lastRan >= limit) {
              func.apply(this, args);
              state.lastRan = Date.now();
            }
          },
          limit - (Date.now() - state.lastRan)
        );
      }
    }
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
