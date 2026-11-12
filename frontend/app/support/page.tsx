
"use client";

import { useEffect, useState } from "react";
import CustomerShell from "@/components/customer/CustomerShell";
import { bankingApi } from "@/lib/api";
import type { SupportTicket, TicketMessage } from "@/types/banking";

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const descriptionWordCount = description.trim()
    ? description.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const descriptionMeetsMinimum = descriptionWordCount >= 25;

  async function loadTickets() {
    const data = await bankingApi.getMyTickets();
    setTickets(data);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await bankingApi.getMyTickets();
        if (active) setTickets(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load tickets.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!descriptionMeetsMinimum) {
      return;
    }
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      await bankingApi.createTicket({ subject, description, priority });

      setSubject("");
      setDescription("");
      setPriority("Normal");
      setMessage("Your support ticket has been created.");
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openConversation(ticket: SupportTicket) {
    setSelected(ticket);
    setMessages([]);
    setDraft("");
    setError("");
    setConversationLoading(true);

    try {
      const data = await bankingApi.getCustomerTicketMessages(ticket.id);
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load messages.");
    } finally {
      setConversationLoading(false);
    }
  }

  async function refreshConversation() {
    if (!selected) return;

    setConversationLoading(true);
    try {
      const data = await bankingApi.getCustomerTicketMessages(selected.id);
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh messages.");
    } finally {
      setConversationLoading(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim()) return;

    setSending(true);
    setError("");

    try {
      await bankingApi.sendCustomerTicketMessage(selected.id, draft.trim());
      setDraft("");
      await refreshConversation();
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  function statusStyle(status: string) {
    switch (status.toLowerCase()) {
      case "resolved":
      case "closed":
        return "bg-green-50 text-green-700";
      case "inprogress":
      case "in progress":
        return "bg-blue-50 text-blue-700";
      default:
        return "bg-amber-50 text-amber-700";
    }
  }

  const fieldClass =
    "mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#6B8E80]";

  return (
    <CustomerShell
      title="Customer Support"
      subtitle="Raise a query and communicate with our support team."
    >
      {error && (
        <p className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          onSubmit={createTicket}
          className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm"
        >
          <h2 className="font-semibold text-[#172C46]">
            Create a support ticket
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Describe your issue and our support team will assist you.
          </p>

          <label className="mt-6 block text-sm text-slate-600">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            required
            className={fieldClass}
            placeholder="Briefly describe your issue"
          />

          <label className="mt-5 block text-sm text-slate-600">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={3000}
            rows={5}
            required
            className={fieldClass}
            placeholder="Provide details about your query..."
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className={descriptionMeetsMinimum ? "text-[#456B58]" : "text-amber-700"} aria-live="polite">
              {descriptionWordCount}/25 words
            </p>
            <p className="text-slate-400">{description.length}/3000 characters</p>
          </div>
          {!descriptionMeetsMinimum && (
            <p className="mt-2 text-sm text-amber-700" role="status">
              Please add at least {25 - descriptionWordCount} more {25 - descriptionWordCount === 1 ? "word" : "words"} to describe your issue.
            </p>
          )}

          <label className="mt-5 block text-sm text-slate-600">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={fieldClass}
          >
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>

          {message && (
            <p className="mt-4 text-sm text-green-700">{message}</p>
          )}

          <button
            disabled={submitting || !descriptionMeetsMinimum}
            className="mt-6 w-full rounded-lg bg-[#172C46] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating ticket..." : "Submit ticket"}
          </button>
        </form>

        <section className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm">
          <h2 className="font-semibold text-[#172C46]">
            Your support requests
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Select a ticket to view its conversation.
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-slate-500">Loading tickets...</p>
          ) : tickets.length === 0 ? (
            <p className="mt-8 text-center text-sm text-slate-500">
              You haven&apos;t raised any support tickets.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {tickets.map((ticket) => (
                <article
                  key={ticket.id}
                  className={`rounded-xl border p-5 ${
                    selected?.id === ticket.id
                      ? "border-[#6B8E80] bg-[#F8FAF8]"
                      : "border-slate-100"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-400">
                        Ticket #{ticket.id}
                      </p>
                      <h3 className="mt-1 font-semibold text-[#172C46]">
                        {ticket.subject}
                      </h3>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(
                        ticket.status
                      )}`}
                    >
                      {ticket.status}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {ticket.description}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
                    <span>Priority: {ticket.priority}</span>
                    <span>
                      {new Date(ticket.createdAt).toLocaleDateString("en-IN")}
                    </span>
                  </div>

                  <button
                    onClick={() => openConversation(ticket)}
                    className="mt-4 text-sm font-semibold text-[#456B58] hover:underline"
                  >
                    {selected?.id === ticket.id
                      ? "Reload conversation"
                      : "View conversation"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <p className="text-xs text-slate-400">
                Ticket #{selected.id}
              </p>
              <h2 className="mt-1 font-semibold text-[#172C46]">
                {selected.subject}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Status: {selected.status}
              </p>
            </div>
            <button
              onClick={refreshConversation}
              disabled={conversationLoading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Refresh messages
            </button>
          </div>

          <div className="max-h-[420px] min-h-[220px] space-y-4 overflow-y-auto bg-[#F8F9F7] p-6">
            {conversationLoading ? (
              <p className="text-center text-sm text-slate-500">
                Loading conversation...
              </p>
            ) : messages.length === 0 ? (
              <p className="pt-16 text-center text-sm text-slate-500">
                No messages yet. Send a message to start the conversation.
              </p>
            ) : (
              messages.map((item) => {
                const isCustomer = item.senderRole.toLowerCase() === "customer";

                return (
                  <div
                    key={item.id}
                    className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[70%] ${
                        isCustomer
                          ? "rounded-br-sm bg-[#172C46] text-white"
                          : "rounded-bl-sm border border-slate-100 bg-white text-[#25354A]"
                      }`}
                    >
                      <p className="mb-1 text-xs font-semibold opacity-70">
                        {isCustomer ? "You" : "Support officer"}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {item.message}
                      </p>
                      <p className="mt-2 text-right text-[10px] opacity-60">
                        {new Date(item.sentAt).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {selected.status.toLowerCase() === "closed" ? (
            <p className="border-t border-slate-100 p-5 text-center text-sm text-slate-500">
              This ticket is closed. You cannot send further messages.
            </p>
          ) : (
            <form
              onSubmit={sendMessage}
              className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={3000}
                rows={2}
                required
                placeholder="Write a message to your support officer..."
                className="min-w-0 flex-1 resize-y rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#6B8E80]"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-lg bg-[#172C46] px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send message"}
              </button>
            </form>
          )}
        </section>
      )}
    </CustomerShell>
  );
}
