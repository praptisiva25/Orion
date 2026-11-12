
"use client";

import { useEffect, useRef, useState } from "react";
import OfficerShell from "@/components/officer/OfficerShell";
import { bankingApi } from "@/lib/api";
import type { SupportTicket, TicketMessage } from "@/types/banking";

export default function OfficerTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newStatus, setNewStatus] = useState("InProgress");
  const [draft, setDraft] = useState("");
  const [draftsByTicket, setDraftsByTicket] = useState<Record<number, string>>({});
  const [aiDraftsByTicket, setAiDraftsByTicket] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("All");
  const [view, setView] = useState<"active" | "history">("active");
  const [priority, setPriority] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const selectedTicketIdRef = useRef<number | null>(null);
  const latestDraftRef = useRef("");

  async function loadTickets() {
    const data = view === "active" ? await bankingApi.getOfficerTickets() : await bankingApi.getOfficerTicketHistory({ status: filter, priority, fromDate, toDate });
    setTickets(data);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = view === "active" ? await bankingApi.getOfficerTickets() : await bankingApi.getOfficerTicketHistory({ status: filter, priority, fromDate, toDate });
        if (active) setTickets(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load tickets.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [view, filter, priority, fromDate, toDate]);

  async function loadConversation(ticketId: number) {
    setConversationLoading(true);
    try {
      const data = await bankingApi.getOfficerTicketMessages(ticketId);
      if (selectedTicketIdRef.current === ticketId) setMessages(data);
    } catch (err) {
      if (selectedTicketIdRef.current === ticketId) {
        setError(err instanceof Error ? err.message : "Unable to load messages.");
      }
    } finally {
      if (selectedTicketIdRef.current === ticketId) setConversationLoading(false);
    }
  }

  async function openTicket(id: number) {
    selectedTicketIdRef.current = id;
    setAiSummary("");
    setSummaryError("");
    setSummaryLoading(false);
    setSuggestionError("");
    setSuggestionLoading(false);
    setSuggestionApplied(false);
    setError("");
    setMessage("");
    setMessages([]);
    setConversationLoading(true);
    setSelected(null);

    try {
      const ticket = await bankingApi.getOfficerTicket(id);
      if (selectedTicketIdRef.current !== id) return;
      setSelected(ticket);
      const savedDraft = draftsByTicket[id] ?? "";
      setDraft(savedDraft);
      latestDraftRef.current = savedDraft;
      setSuggestionApplied(aiDraftsByTicket[id] ?? false);
      setNewStatus(ticket.status);
      await loadConversation(id);
    } catch (err) {
      if (selectedTicketIdRef.current === id) {
        setError(err instanceof Error ? err.message : "Unable to load ticket.");
        setConversationLoading(false);
      }
    }
  }

  function closeTicketDetails() {
    selectedTicketIdRef.current = null;
    setSelected(null);
    setAiSummary("");
    setSummaryError("");
    setSuggestionError("");
    setSuggestionApplied(false);
    setMessages([]);
    setConversationLoading(false);
    setSummaryLoading(false);
    setSuggestionLoading(false);
  }

  async function generateAiSummary() {
    if (!selected) return;
    const ticketId = selected.id;
    setAiSummary("");
    setSummaryError("");
    setSummaryLoading(true);
    try {
      const response = await bankingApi.generateOfficerTicketSummary(ticketId);
      if (selectedTicketIdRef.current === ticketId) setAiSummary(response.result);
    } catch (err) {
      if (selectedTicketIdRef.current === ticketId) {
        setSummaryError(err instanceof Error ? err.message : "Unable to generate the AI summary.");
      }
    } finally {
      if (selectedTicketIdRef.current === ticketId) setSummaryLoading(false);
    }
  }

  async function suggestResponse() {
    if (!selected || selected.status.toLowerCase() === "closed") return;
    const ticketId = selected.id;
    const draftAtRequest = latestDraftRef.current;
    setSuggestionError("");
    setSuggestionLoading(true);
    try {
      const response = await bankingApi.generateOfficerSuggestedResponse(ticketId);
      if (selectedTicketIdRef.current === ticketId) {
        if (latestDraftRef.current === draftAtRequest) {
          setDraft(response.result);
          latestDraftRef.current = response.result;
          setDraftsByTicket((previous) => ({ ...previous, [ticketId]: response.result }));
          setAiDraftsByTicket((previous) => ({ ...previous, [ticketId]: true }));
          setSuggestionApplied(true);
        } else {
          setSuggestionError("Your draft changed while the suggestion was generating. Click Suggest Response again if you want to replace it.");
        }
      }
    } catch (err) {
      if (selectedTicketIdRef.current === ticketId) {
        setSuggestionError(err instanceof Error ? err.message : "Unable to generate a suggested response.");
      }
    } finally {
      if (selectedTicketIdRef.current === ticketId) setSuggestionLoading(false);
    }
  }

  async function updateStatus() {
    if (!selected) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await bankingApi.updateOfficerTicketStatus(selected.id, newStatus);

      await loadTickets();
      setSelected((previous) =>
        previous ? { ...previous, status: newStatus } : null
      );
      setMessage("Ticket status updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim()) return;

    setSending(true);
    setError("");
    setMessage("");

    try {
      await bankingApi.sendOfficerTicketMessage(selected.id, draft.trim());
      setDraft("");
      latestDraftRef.current = "";
      setDraftsByTicket((previous) => ({ ...previous, [selected.id]: "" }));
      setAiDraftsByTicket((previous) => ({ ...previous, [selected.id]: false }));
      setSuggestionApplied(false);
      await loadConversation(selected.id);
      await loadTickets();
      setMessage("Your reply has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reply.");
    } finally {
      setSending(false);
    }
  }

  const filteredTickets =
    view === "history" || filter === "All"
      ? tickets
      : tickets.filter(
          (ticket) => ticket.status.toLowerCase() === filter.toLowerCase()
        );

  const fieldClass =
    "mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#6B8E80]";
  const selectedTicketIsClosed = selected?.status.toLowerCase() === "closed";

  return (
    <OfficerShell
      title={view === "active" ? "Active Tickets" : "Ticket History"}
      subtitle="Review customer requests, manage status and respond to messages."
    >
      {error && (
        <p className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {message && (
        <p className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">
          {message}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="font-semibold text-[#172C46]">{view === "active" ? "Active ticket queue" : "Resolved and closed tickets"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {tickets.length} assigned ticket(s)
            </p>
          </div>

          <div className="flex flex-wrap gap-2"><button onClick={() => { setView("active"); setFilter("All"); setLoading(true); }} className={`rounded-lg px-4 py-2 text-sm ${view === "active" ? "bg-[#172C46] text-white" : "border border-slate-200"}`}>Active</button><button onClick={() => { setView("history"); setFilter("All"); setLoading(true); }} className={`rounded-lg px-4 py-2 text-sm ${view === "history" ? "bg-[#172C46] text-white" : "border border-slate-200"}`}>History</button>{view === "history" && <><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="All">All history</option><option>Resolved</option><option>Closed</option></select><select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">All priorities</option>{["Low", "Normal", "High", "Urgent"].map((p) => <option key={p}>{p}</option>)}</select><input aria-label="Created from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><input aria-label="Created to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/></>}</div>{view === "active" && <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none"
          >
            <option value="All">All statuses</option>
            <option value="Open">Open</option>
            <option value="InProgress">In progress</option>
          </select>}
        </div>

        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading tickets...</p>
        ) : filteredTickets.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No tickets found for this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-[#F8F9F7] text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4">Ticket</th>
                  <th className="px-6 py-4">Customer ID</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Updated</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id} className="border-t border-slate-100">
                    <td className="px-6 py-5">
                      <p className="font-medium text-[#172C46]">
                        {ticket.subject}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        #{ticket.id}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-slate-600">
                      {ticket.userId}
                    </td>
                    <td className="px-6 py-5 text-slate-600">
                      {ticket.priority}
                    </td>
                    <td className="px-6 py-5 text-slate-600">
                      {ticket.status}
                    </td>
                    <td className="px-6 py-5 text-slate-500">
                      {new Date(ticket.updatedAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-6 py-5">
                      <button
                        onClick={() => openTicket(ticket.id)}
                        className="font-medium text-[#456B58] hover:underline"
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
              <div>
                <p className="text-xs text-slate-400">
                  Ticket #{selected.id}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-[#172C46]">
                  {selected.subject}
                </h2>
              </div>
              <button
                onClick={closeTicketDetails}
                className="text-xl text-slate-400 hover:text-slate-700"
                aria-label="Close ticket details"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-[#F8F9F7] p-4">
                  <p className="text-xs text-slate-400">Customer ID</p>
                  <p className="mt-1 font-medium text-[#172C46]">
                    {selected.userId}
                  </p>
                </div>
                <div className="rounded-lg bg-[#F8F9F7] p-4">
                  <p className="text-xs text-slate-400">Priority</p>
                  <p className="mt-1 font-medium text-[#172C46]">
                    {selected.priority}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-sm font-medium text-[#172C46]">
                  Customer description
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {selected.description}
                </p>
              </div>

              <section className="mt-6 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-[#F8FAF8] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[#172C46]">AI Summary</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        AI-generated from this ticket and its conversation. Review it for accuracy.
                      </p>
                    </div>
                    <button
                      onClick={generateAiSummary}
                      disabled={summaryLoading}
                      className="rounded-lg bg-[#172C46] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {summaryLoading ? "Generating summary..." : summaryError ? "Retry summary" : aiSummary ? "Regenerate summary" : "Generate AI Summary"}
                    </button>
                  </div>
                  {summaryLoading && <p className="mt-3 text-sm text-slate-500" role="status">Generating an AI summary...</p>}
                  {summaryError && <p className="mt-3 text-sm text-red-700" role="alert">{summaryError}</p>}
                  {aiSummary && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{aiSummary}</p>}
                  {!summaryLoading && !summaryError && !aiSummary && <p className="mt-3 text-sm text-slate-400">Generate a summary when you need one.</p>}
                </article>

                <article className="rounded-xl border border-slate-200 bg-[#F8FAF8] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[#172C46]">Suggested Response</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        AI-generated draft. Clicking the button places it in the reply box; review and edit it before sending.
                      </p>
                    </div>
                    <button
                      onClick={suggestResponse}
                      disabled={suggestionLoading || selectedTicketIsClosed}
                      className="rounded-lg border border-[#456B58] px-3 py-2 text-xs font-medium text-[#345B4A] disabled:opacity-50"
                    >
                      {suggestionLoading ? "Generating suggestion..." : suggestionError ? "Retry suggestion" : draft.trim() ? "Replace draft with suggestion" : "Suggest Response"}
                    </button>
                  </div>
                  {suggestionLoading && <p className="mt-3 text-sm text-slate-500" role="status">Generating an editable draft...</p>}
                  {suggestionError && <p className="mt-3 text-sm text-red-700" role="alert">{suggestionError}</p>}
                  {suggestionApplied && <p className="mt-3 text-sm text-[#456B58]" role="status">The AI suggestion is in the reply box. It has not been sent.</p>}
                  {selectedTicketIsClosed && <p className="mt-3 text-xs text-slate-500">Closed tickets cannot receive replies.</p>}
                </article>
              </section>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-[#172C46]">
                    Conversation
                  </h3>
                  <button
                    onClick={() => loadConversation(selected.id)}
                    disabled={conversationLoading}
                    className="text-sm font-medium text-[#456B58] hover:underline disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-4 max-h-[320px] min-h-[180px] space-y-4 overflow-y-auto rounded-xl bg-[#F8F9F7] p-4">
                  {conversationLoading ? (
                    <p className="pt-12 text-center text-sm text-slate-500">
                      Loading messages...
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="pt-12 text-center text-sm text-slate-500">
                      No messages in this conversation yet.
                    </p>
                  ) : (
                    messages.map((item) => {
                      const isOfficer =
                        item.senderRole.toLowerCase() === "officer";

                      return (
                        <div
                          key={item.id}
                          className={`flex ${isOfficer ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                              isOfficer
                                ? "rounded-br-sm bg-[#172C46] text-white"
                                : "rounded-bl-sm border border-slate-100 bg-white text-[#25354A]"
                            }`}
                          >
                            <p className="mb-1 text-xs font-semibold opacity-70">
                              {isOfficer ? "You" : "Customer"}
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

                {selected.status.toLowerCase() !== "closed" && (
                  <form onSubmit={sendMessage} className="mt-4">
                    <textarea
                      value={draft}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDraft(value);
                        latestDraftRef.current = value;
                        setSuggestionApplied(false);
                        setDraftsByTicket((previous) => ({ ...previous, [selected.id]: value }));
                        setAiDraftsByTicket((previous) => ({ ...previous, [selected.id]: false }));
                      }}
                      maxLength={3000}
                      rows={3}
                      required
                      placeholder="Write your reply to the customer..."
                      className="w-full resize-y rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#6B8E80]"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="mt-3 rounded-lg bg-[#172C46] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {sending ? "Sending reply..." : "Send reply"}
                    </button>
                  </form>
                )}

                {selected.status.toLowerCase() === "closed" && (
                  <p className="mt-4 text-sm text-slate-500">
                    This ticket is closed. No further replies can be sent.
                  </p>
                )}
              </div>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <label className="text-sm font-medium text-[#172C46]">
                  Update ticket status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  disabled={selected.status.toLowerCase() === "closed"}
                  className={fieldClass}
                >
                  <option value="Open">Open</option>
                  <option value="InProgress">In progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>

                <button
                  onClick={updateStatus}
                  disabled={
                    saving ||
                    newStatus === selected.status ||
                    selected.status.toLowerCase() === "closed"
                  }
                  className="mt-4 w-full rounded-lg bg-[#172C46] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Updating..." : "Save status"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </OfficerShell>
  );
}
