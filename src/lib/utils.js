import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui's class helper — v0-generated components import it as `@/lib/utils`.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
