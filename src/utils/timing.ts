export function debounce<T extends (...args: any[]) => any>( // eslint-disable-line @typescript-eslint/no-explicit-any
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const { leading = false, trailing = true } = options;

  return function (this: any, ...args: Parameters<T>) {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    if (timeout) {
      clearTimeout(timeout);
    }

    if (leading && !timeout) {
      func.apply(this, args);
    }

    timeout = setTimeout(() => {
      timeout = null;
      if (trailing) {
        func.apply(this, args);
      }
    }, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>( // eslint-disable-line @typescript-eslint/no-explicit-any
  func: T,
  limit: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  let lastFunc: ReturnType<typeof setTimeout>;
  let lastRan: number;
  const { leading = true, trailing = true } = options;

  return function (this: any, ...args: Parameters<T>) {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!inThrottle) {
      if (leading) {
        func.apply(this, args);
        lastRan = Date.now();
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      } else {
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);

        if (trailing) {
          lastFunc = setTimeout(() => {
            func.apply(this, args);
            lastRan = Date.now();
          }, limit);
        }
      }
    } else {
      if (lastFunc) clearTimeout(lastFunc);
      if (trailing) {
        lastFunc = setTimeout(
          () => {
            if (Date.now() - lastRan >= limit) {
              func.apply(this, args);
              lastRan = Date.now();
            }
          },
          limit - (Date.now() - lastRan)
        );
      }
    }
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
