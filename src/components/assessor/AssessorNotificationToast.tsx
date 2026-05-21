"use client";

type AssessorNotificationToastProps = Readonly<{
  title: string;
  message: string;
  onClose: () => void;
}>;

export function AssessorNotificationToast({
  title,
  message,
  onClose,
}: AssessorNotificationToastProps) {
  return (
    <div
      role="status"
      className="fixed right-4 top-4 z-[70] w-[min(420px,calc(100vw-2rem))] rounded border border-[#c3e6cb] bg-[#e8f6ea] px-3 py-2 text-sm text-[#2d6a3e] shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          {message && message !== title ? <p className="mt-0.5 text-[#3d5c47]">{message}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-0.5 text-sm text-[#2d6a3e] hover:bg-[#d7f0dc]"
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}
