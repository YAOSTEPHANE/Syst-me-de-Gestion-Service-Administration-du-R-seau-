export const NOTIFICATION_READ_EVENT = "lonaci:notification-read";

export function emitNotificationRead(notificationId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(NOTIFICATION_READ_EVENT, {
      detail: notificationId,
    }),
  );
}
