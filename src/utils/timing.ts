export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const { leading = false, trailing = true } = options;

  return function(this: any, ...args: Parameters<T>) {
    const context = this;

    if (timeout) {
      clearTimeout(timeout);
    }

    if (leading && !timeout) {
      func.apply(context, args);
    }

    timeout = setTimeout(() => {
      timeout = null;
      if (trailing) {
        func.apply(context, args);
      }
    }, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  let lastFunc: ReturnType<typeof setTimeout>;
  let lastRan: number;
  const { leading = true, trailing = true } = options;

  return function(this: any, ...args: Parameters<T>) {
    const context = this;

    if (!inThrottle) {
      if (leading) {
        func.apply(context, args);
        lastRan = Date.now();
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      } else {
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    } else {
      if (lastFunc) clearTimeout(lastFunc);
      if (trailing) {
        lastFunc = setTimeout(function() {
          if ((Date.now() - lastRan) >= limit) {
            func.apply(context, args);
            lastRan = Date.now();
          }
        }, limit - (Date.now() - lastRan));
      }
    }
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
