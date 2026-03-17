/**
 * NotificationsAdmin — Admin panel for sending push notifications to customers.
 * Supports broadcast (all), targeted (specific customer), and scheduled notifications.
 */
import { useState, useEffect, useCallback } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import {
  Bell, Send, Megaphone, User, Clock, Trash2, RefreshCw,
  Link2, Calendar, CheckCircle2, AlertCircle, Loader2, Users, ExternalLink,
} from "lucide-react";
import { APP_CONFIG } from "../lib/config";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface AdminNotifLog {
  id: string;
  type: "broadcast" | "targeted";
  title: string;
  message: string;
  url?: string;
  targetPhone?: string;
  targetName?: string;
  scheduledAt?: string;
  sentAt?: string;
  status: "sent" | "scheduled" | "delivered";
  recipientCount?: number;
  createdAt: string;
}

export function NotificationsAdmin({ customToken }: { customToken: string }) {
  // Compose form
  const [notifType, setNotifType] = useState<"broadcast" | "targeted">("broadcast");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);

  // History
  const [history, setHistory] = useState<AdminNotifLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetchWithRetry(`${API_BASE}/admin/notifications`, {
        headers: {
          "X-Custom-Auth": customToken,
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.notifications || []);
      }
    } catch (err) {
      console.error("Failed to fetch notification history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [customToken]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (notifType === "targeted" && !targetPhone.trim()) {
      toast.error("Please enter target customer phone number");
      return;
    }

    try {
      setSending(true);
      const body: any = {
        type: notifType,
        title: title.trim(),
        message: message.trim(),
      };
      if (url.trim()) body.url = url.trim();
      if (notifType === "targeted") body.targetPhone = targetPhone.trim();
      if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();

      const res = await fetchWithRetry(`${API_BASE}/admin/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Custom-Auth": customToken,
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(scheduledAt ? "Notification scheduled!" : `Notification sent to ${data.recipientCount || 0} customer(s)!`);
        // Reset form
        setTitle("");
        setMessage("");
        setUrl("");
        setTargetPhone("");
        setScheduledAt("");
        fetchHistory();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to send notification");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send notification");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetchWithRetry(`${API_BASE}/admin/notifications/${id}`, {
        method: "DELETE",
        headers: {
          "X-Custom-Auth": customToken,
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });
      if (res.ok) {
        toast.success("Notification deleted");
        fetchHistory();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
            <Bell className="w-5 h-5" style={{ color: BRAND }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Push Notifications</h2>
            <p className="text-xs text-gray-500">Send notifications to your customers</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchHistory}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Compose Card */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Send className="w-4 h-4" style={{ color: BRAND }} />
          Compose Notification
        </h3>

        <div className="space-y-4">
          {/* Type selector */}
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Send To</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setNotifType("broadcast")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                  notifType === "broadcast"
                    ? "text-white border-transparent"
                    : "text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                style={notifType === "broadcast" ? { backgroundColor: BRAND } : {}}
              >
                <Users className="w-4 h-4" />
                All Customers
              </button>
              <button
                onClick={() => setNotifType("targeted")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                  notifType === "targeted"
                    ? "text-white border-transparent"
                    : "text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                style={notifType === "targeted" ? { backgroundColor: BRAND } : {}}
              >
                <User className="w-4 h-4" />
                Specific Customer
              </button>
            </div>
          </div>

          {/* Target phone (for targeted) */}
          {notifType === "targeted" && (
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Customer Phone Number</Label>
              <Input
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                placeholder="e.g. +62812345678"
                className="text-sm"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekend Special Offer!"
              className="text-sm"
              maxLength={100}
            />
          </div>

          {/* Message */}
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Get 20% off on all biryanis this weekend! Use code WEEKEND20"
              rows={3}
              className="text-sm resize-none"
              maxLength={500}
            />
            <p className="text-[10px] text-gray-400 mt-1 text-right">{message.length}/500</p>
          </div>

          {/* URL (optional) */}
          <div>
            <Label className="text-xs font-medium mb-1.5 block flex items-center gap-1">
              <Link2 className="w-3 h-3" /> Link URL <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="text-sm"
            />
          </div>

          {/* Schedule (optional) */}
          <div>
            <Label className="text-xs font-medium mb-1.5 block flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Schedule <span className="text-gray-400 font-normal">(optional — leave empty to send immediately)</span>
            </Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="text-sm"
              min={new Date().toISOString().slice(0, 16)}
            />
            {scheduledAt && (
              <button onClick={() => setScheduledAt("")} className="text-[10px] text-red-500 mt-1 hover:underline">
                Clear schedule (send now)
              </button>
            )}
          </div>

          {/* Preview */}
          {(title || message) && (
            <div className="bg-gray-50 rounded-lg p-3 border">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Preview</p>
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-100 flex-shrink-0">
                  <Megaphone className="w-4 h-4 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{title || "Title..."}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{message || "Message..."}</p>
                  {url && (
                    <p className="text-[10px] text-blue-500 mt-1 flex items-center gap-0.5 truncate">
                      <ExternalLink className="w-3 h-3 flex-shrink-0" /> {url}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={sending || !title.trim() || !message.trim()}
            className="w-full h-11 text-sm font-semibold text-white"
            style={{ backgroundColor: sending ? "#9CA3AF" : BRAND }}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
            ) : scheduledAt ? (
              <><Clock className="w-4 h-4 mr-2" /> Schedule Notification</>
            ) : (
              <><Send className="w-4 h-4 mr-2" /> Send {notifType === "broadcast" ? "to All Customers" : "to Customer"}</>
            )}
          </Button>
        </div>
      </Card>

      {/* Notification History */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" style={{ color: BRAND }} />
          Sent Notifications
          {history.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{history.length}</Badge>
          )}
        </h3>

        {loadingHistory ? (
          <div className="text-center py-8">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: BRAND, borderTopColor: "transparent" }} />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8">
            <Megaphone className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No notifications sent yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map(notif => (
              <div key={notif.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  notif.status === "scheduled" ? "bg-amber-100" : "bg-green-100"
                }`}>
                  {notif.status === "scheduled" ? (
                    <Clock className="w-4 h-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{notif.title}</p>
                    <Badge className={`text-[9px] flex-shrink-0 ${
                      notif.type === "broadcast" ? "bg-purple-100 text-purple-700" : "bg-indigo-100 text-indigo-700"
                    }`}>
                      {notif.type === "broadcast" ? "All" : "Targeted"}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                    {notif.sentAt && (
                      <span>Sent: {new Date(notif.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                    {notif.scheduledAt && notif.status === "scheduled" && (
                      <span className="text-amber-600 font-medium">
                        Scheduled: {new Date(notif.scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {notif.recipientCount != null && (
                      <span className="flex items-center gap-0.5">
                        <Users className="w-3 h-3" /> {notif.recipientCount}
                      </span>
                    )}
                    {notif.targetName && (
                      <span className="flex items-center gap-0.5">
                        <User className="w-3 h-3" /> {notif.targetName}
                      </span>
                    )}
                    {notif.url && (
                      <a href={notif.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5">
                        <Link2 className="w-3 h-3" /> Link
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(notif.id)}
                  className="p-1.5 hover:bg-red-100 rounded-lg transition-colors flex-shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}