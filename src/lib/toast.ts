"use client";

import { toast } from "sonner";

import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";

export type ToastId = string | number;

interface NotifyOptions {
  description?: string;
  duration?: number;
  id?: ToastId;
}

export function toastMessageFromError(error: unknown, fallback = "Une erreur est survenue."): string {
  if (error instanceof Error) {
    return friendlyErrorMessage(error.message || fallback);
  }
  if (typeof error === "string") {
    return friendlyErrorMessage(error || fallback);
  }
  return friendlyErrorMessage(fallback);
}

export const notify = {
  success(message: string, options?: NotifyOptions): ToastId {
    return toast.success(message, options);
  },
  error(error: unknown, fallback?: string, options?: NotifyOptions): ToastId {
    return toast.error(toastMessageFromError(error, fallback), options);
  },
  warning(message: string, options?: NotifyOptions): ToastId {
    return toast.warning(message, options);
  },
  info(message: string, options?: NotifyOptions): ToastId {
    return toast.info(message, options);
  },
  loading(message: string, options?: Omit<NotifyOptions, "duration">): ToastId {
    return toast.loading(message, options);
  },
  dismiss(id?: ToastId): void {
    toast.dismiss(id);
  },
};
