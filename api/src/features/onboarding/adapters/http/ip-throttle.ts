export type IpThrottle = (ip: string) => boolean;

// Fixed-window limiter per client IP; returns false once the window's quota is spent.
export function createIpThrottle(options: {
  max: number;
  windowMs: number;
  now: () => number;
}): IpThrottle {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (ip) => {
    const current = Date.now();
    const window = windows.get(ip);
    const instant = options.now();
    if (!window || window.resetAt <= instant) {
      windows.set(ip, { count: 1, resetAt: instant + options.windowMs });
      return true;
    }
    if (window.count >= options.max) return false;
    window.count += 1;
    return current >= 0;
  };
}
