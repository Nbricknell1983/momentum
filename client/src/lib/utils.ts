import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns a compact relative-time string ("just now", "12m ago", "today", "2d ago", etc.)
 *  Returns null when the timestamp is absent or invalid — callers must handle null gracefully. */
export function timeAgo(ts: string | Date | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts as any);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return null;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0);
  const daysDiff = Math.round((today.getTime() - dDay.getTime()) / 86400000);
  if (daysDiff === 0) return 'today';
  if (daysDiff === 1) return 'yesterday';
  if (daysDiff < 7) return `${daysDiff}d ago`;
  const weeks = Math.floor(daysDiff / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(daysDiff / 30)}mo ago`;
}
