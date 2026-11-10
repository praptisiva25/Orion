"use client";

import { useEffect, useState } from "react";
import CustomerShell from "@/components/customer/CustomerShell";
import { bankingApi } from "@/lib/api";
import type { Notification } from "@/types/banking";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadNotifications() {
    const data = await bankingApi.getNotifications();
    setNotifications(data);
  }

  useEffect(() => {
    loadNotifications()
      .catch((err) =>
        setError(err.message || "Unable to load notifications.")
      )
      .finally(() => setLoading(false));
  }, []);

  async function markAsRead(id: number) {
    try {
      await bankingApi.markNotificationRead(id);

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, isRead: true } : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update.");
    }
  }

  async function markAllAsRead() {
    const unread = notifications.filter((item) => !item.isRead);

    try {
      await Promise.all(
        unread.map((item) => bankingApi.markNotificationRead(item.id))
      );

      setNotifications((previous) =>
        previous.map((item) => ({ ...item, isRead: true }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update.");
    }
  }

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  return (
    <CustomerShell
      title="Notifications"
      subtitle="Stay informed about your account and applications."
    >
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="font-semibold text-[#172C46]">
              Your notifications
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {unreadCount} unread notification(s)
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm font-medium text-[#456B58] hover:underline"
            >
              Mark all as read
            </button>
          )}
        </div>

        {error && <p className="px-6 pt-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="p-8 text-sm text-slate-500">
            Loading notifications...
          </p>
        ) : notifications.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            You're all caught up. No notifications yet.
          </p>
        ) : (
          <div>
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={`flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 last:border-0 ${
                  !notification.isRead ? "bg-[#F8FAF8]" : "bg-white"
                }`}
              >
                <div className="flex gap-4">
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      notification.isRead ? "bg-slate-200" : "bg-[#6B8E80]"
                    }`}
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-[#172C46]">
                      {notification.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {new Date(notification.createdAt).toLocaleString(
                        "en-IN"
                      )}
                    </p>
                  </div>
                </div>

                {!notification.isRead && (
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="text-xs font-medium text-[#456B58] hover:underline"
                  >
                    Mark as read
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </CustomerShell>
  );
}