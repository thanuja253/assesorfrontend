"use client";

type PanelNotificationToastProps = {
  title: string;
  message: string;
  onDismiss: () => void;
};

export function PanelNotificationToast({
  title,
  message,
  onDismiss,
}: Readonly<PanelNotificationToastProps>) {
  return (
    <div
      className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-lg border border-[#86efac] bg-white p-4 shadow-lg"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#166534]">{title}</p>
          {message && message !== title ? (
            <p className="mt-1 text-xs text-[#4b5563]">{message}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded px-2 py-1 text-xs font-medium text-[#166534] hover:bg-[#dcfce7]"
          aria-label="Dismiss notification"
        >
          OK
        </button>
      </div>
    </div>
  );
}
