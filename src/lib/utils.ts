import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generate random ID
export function generateId() {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// Format date to YYYY-MM-DD
export function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeDateRange(startDate: string, endDate: string) {
  if (startDate && endDate && startDate > endDate) {
    return {
      startDate: endDate,
      endDate: startDate,
      wasReversed: true,
    };
  }

  return {
    startDate,
    endDate,
    wasReversed: false,
  };
}
