/**
 * StaffPerformanceReport — Staff activity & performance metrics.
 * Shows orders handled, status changes, avg handling time, deliveries,
 * payments, cancellations per staff member.
 * Features: date range, search, pagination (10/page), Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  UserCheck, Search,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Loader2,
  Clock, Truck, CreditCard, XCircle, Activity, Award,
  Users, Hash, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  superuser: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  admin: { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  cashier: { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  kitchen: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  driver: { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  staff: { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" },
};

interface StaffRow {
  rank: number;
  staffId: string;
  name: string;
  role: string;
  phone: string;
  ordersHandled: number;
  statusChanges: number;
  totalRevenueHandled: number;
  avgHandlingTimeMinutes: number;
  cancellations: number;
  deliveries: number;
  payments: number;
}

interface ReportData {
  staff: StaffRow[];
  summary: {
    totalStaff: number;
    totalStatusChanges: number;
    totalOrdersHandled: number;
    topPerformer: string;
  };
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allStaff?: StaffRow[];
}

interface Props {
  customToken: string | null;
}

function formatRole(role: string): string {
  const map: Record<string, string> = {
    superuser: "Super User", admin: "Admin", cashier: "Cashier",
    kitchen: "Kitchen", driver: "Driver", staff: "Staff",
  };
  return map[role] || role.charAt(0).toUpperCase() + role.slice(1);
}

export function StaffPerformanceReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        page: String(pageNum), limit: "10",
        ...(search && { search }), ...(dateFrom && { dateFrom }), ...(dateTo && { dateTo }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetchWithRetry(`${API_BASE}/reports/staff-performance?${params}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": customToken },
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to fetch report"); }
      return await res.json() as ReportData;
    } catch (err: any) {
      console.error("Staff report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, dateFrom, dateTo]);

  const loadPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    const result = await fetchReport(pageNum);
    if (result) { setData(result); setPage(result.pagination.page); }
    setLoading(false);
  }, [fetchReport]);

  useEffect(() => { loadPage(1); }, []);

  const handleApplyFilter = () => { setPage(1); loadPage(1); };

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allStaff) throw new Error("No data to export");
      const XLSX = await import("xlsx");
      const wsData = [
        [`${APP_CONFIG.restaurant.name} — Staff Performance Report`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        [],
        ["#", "Name", "Role", "Phone", "Orders Handled", "Status Changes", "Revenue Handled", "Avg Time (min)", "Deliveries", "Payments", "Cancellations"],
        ...result.allStaff.map(s => [
          s.rank, s.name, formatRole(s.role), s.phone, s.ordersHandled, s.statusChanges,
          s.totalRevenueHandled, s.avgHandlingTimeMinutes, s.deliveries, s.payments, s.cancellations,
        ]),
        [],
        ["Summary"],
        ["Total Staff", result.summary.totalStaff],
        ["Total Orders Handled", result.summary.totalOrdersHandled],
        ["Total Status Changes", result.summary.totalStatusChanges],
        ["Top Performer", result.summary.topPerformer],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [{ wch: 5 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Staff Performance");
      XLSX.writeFile(wb, `Staff_Performance_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast.success("Excel exported!");
    } catch (err: any) { console.error("Excel export error:", err); toast.error("Failed to export Excel"); }
    finally { setExporting(null); }
  };

  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allStaff) throw new Error("No data to export");
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(16); doc.setTextColor(40,40,40); doc.text(`${APP_CONFIG.restaurant.name}`, 14, 15);
      doc.setFontSize(11); doc.setTextColor(100,100,100); doc.text("Staff Performance Report", 14, 22);
      doc.setFontSize(9); doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Staff: ${result.summary.totalStaff} | Top: ${result.summary.topPerformer}`, 14, 28);

      autoTable(doc, {
        startY: 34,
        head: [["#", "Name", "Role", "Orders", "Changes", "Revenue", "Avg Min", "Deliveries", "Payments", "Cancel"]],
        body: result.allStaff.map(s => [
          s.rank, s.name, formatRole(s.role), s.ordersHandled, s.statusChanges,
          formatCurrency(s.totalRevenueHandled), s.avgHandlingTimeMinutes,
          s.deliveries, s.payments, s.cancellations,
        ]),
        theme: "grid",
        headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        margin: { left: 14, right: 14 },
      });
      doc.save(`Staff_Performance_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
      toast.success("PDF exported!");
    } catch (err: any) { console.error("PDF export error:", err); toast.error("Failed to export PDF"); }
    finally { setExporting(null); }
  };

  const pagination = data?.pagination;
  const summary = data?.summary;
  const staffList = data?.staff || [];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#16A34A" }}>
          <UserCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Staff Performance</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — Order Handling & Activity</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1" onClick={() => loadPage(page)} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Date Range */}
      <Card className="p-3 border">
        <Label className="text-xs text-gray-500 mb-2 block font-medium">Date Range</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-gray-400 mb-0.5 block">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-[10px] text-gray-400 mb-0.5 block">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
      </Card>

      {/* Search + Apply */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, role, phone..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button size="sm" className="h-9 text-white px-4" style={{ backgroundColor: BRAND }} onClick={handleApplyFilter} disabled={loading}>
          Apply
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-green-50">
              <Users className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalStaff}</p>
            <p className="text-[10px] text-gray-500">Active Staff</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-blue-50">
              <Activity className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalStatusChanges}</p>
            <p className="text-[10px] text-gray-500">Status Changes</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-amber-50">
              <Hash className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalOrdersHandled}</p>
            <p className="text-[10px] text-gray-500">Orders Handled</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-purple-50">
              <Award className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-lg font-bold text-purple-600 text-sm truncate">{summary.topPerformer}</p>
            <p className="text-[10px] text-gray-500">Top Performer</p>
          </Card>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading staff data...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && staffList.length === 0 && data && (
        <Card className="p-8 text-center border">
          <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No staff activity found</p>
          <p className="text-xs text-gray-400 mt-1">Staff actions appear when orders are processed.</p>
        </Card>
      )}

      {/* Staff Cards */}
      {!loading && staffList.map((staff) => {
        const rc = ROLE_COLORS[staff.role] || ROLE_COLORS.staff;
        return (
          <Card
            key={`staff-${staff.rank}-${staff.staffId}`}
            className="overflow-hidden"
            style={{ borderLeftWidth: "4px", borderLeftColor: rc.text }}
          >
            <div className="p-3.5">
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ backgroundColor: rc.bg, color: rc.text, border: `2px solid ${rc.border}` }}
                >
                  #{staff.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{staff.name}</h3>
                    <Badge className="text-[9px] px-1.5 py-0 shrink-0" style={{ backgroundColor: rc.bg, color: rc.text, borderColor: rc.border, borderWidth: "1px" }}>
                      {formatRole(staff.role)}
                    </Badge>
                  </div>

                  {staff.phone && (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                      <Phone className="w-3 h-3" /> {staff.phone}
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-2">
                    <div>
                      <p className="text-[10px] text-gray-400">Orders</p>
                      <p className="text-xs font-bold text-gray-800">{staff.ordersHandled}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Changes</p>
                      <p className="text-xs font-bold text-gray-800">{staff.statusChanges}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Revenue</p>
                      <p className="text-xs font-bold" style={{ color: BRAND }}>{formatCurrency(staff.totalRevenueHandled)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Avg Time</p>
                      <p className="text-xs font-bold text-gray-800">
                        <Clock className="w-3 h-3 inline mr-0.5 text-gray-400" />
                        {staff.avgHandlingTimeMinutes}m
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Deliveries</p>
                      <p className="text-xs font-bold text-blue-600">
                        <Truck className="w-3 h-3 inline mr-0.5" />
                        {staff.deliveries}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Payments</p>
                      <p className="text-xs font-bold text-green-600">
                        <CreditCard className="w-3 h-3 inline mr-0.5" />
                        {staff.payments}
                      </p>
                    </div>
                  </div>

                  {/* Cancellations warning */}
                  {staff.cancellations > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-200 text-red-500 gap-0.5">
                        <XCircle className="w-3 h-3" /> {staff.cancellations} cancellation{staff.cancellations > 1 ? "s" : ""}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} staff)</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page <= 1 || loading} onClick={() => loadPage(1)}><ChevronsLeft className="w-3.5 h-3.5" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page <= 1 || loading} onClick={() => loadPage(pagination.page - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
            <span className="text-sm font-medium px-2 text-gray-700">{pagination.page}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => loadPage(pagination.page + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => loadPage(pagination.totalPages)}><ChevronsRight className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}

      {/* Sticky Export Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button className="flex-1 h-11 gap-2 text-white font-medium" style={{ backgroundColor: "#217346" }}
            onClick={handleExportExcel} disabled={!!exporting || loading || !data?.staff?.length}>
            {exporting === "excel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Export Excel
          </Button>
          <Button className="flex-1 h-11 gap-2 text-white font-medium" style={{ backgroundColor: "#DC2626" }}
            onClick={handleExportPDF} disabled={!!exporting || loading || !data?.staff?.length}>
            {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}