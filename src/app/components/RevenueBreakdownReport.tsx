/**
 * RevenueBreakdownReport — Revenue split by payment method, delivery type, or category.
 * Features: groupBy selector, date range, search, pagination (10/page),
 * summary cards, horizontal bar chart, Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  TrendingUp, Search, Calendar,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Loader2,
  DollarSign, BarChart3, PieChart, Layers, Hash,
  CreditCard, Truck, UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

const GROUP_COLORS = ["#6366F1", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#06B6D4", "#84CC16"];

interface RevenueRow {
  rank: number;
  label: string;
  orders: number;
  revenue: number;
  avgOrder: number;
  paidCount: number;
  unpaidCount: number;
}

interface ReportData {
  rows: RevenueRow[];
  summary: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    topGroup: string;
    groupCount: number;
  };
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allRows?: RevenueRow[];
}

interface Props {
  customToken: string | null;
}

function formatLabel(label: string): string {
  const map: Record<string, string> = {
    cash: "Cash", card: "Card", qris: "QRIS", transfer: "Transfer",
    midtrans: "Midtrans", pickup: "Pickup", delivery: "Delivery",
    "dine-in": "Dine-In", dinein: "Dine-In",
  };
  return map[label.toLowerCase()] || label.charAt(0).toUpperCase() + label.slice(1);
}

export function RevenueBreakdownReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("paymentMethod");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        page: String(pageNum), limit: "10", groupBy,
        ...(search && { search }), ...(dateFrom && { dateFrom }), ...(dateTo && { dateTo }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetch(`${API_BASE}/reports/revenue-breakdown?${params}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": customToken },
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to fetch report"); }
      return await res.json() as ReportData;
    } catch (err: any) {
      console.error("Revenue report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, groupBy, dateFrom, dateTo]);

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
      if (!result?.allRows) throw new Error("No data to export");
      const XLSX = await import("xlsx");
      const groupLabel = groupBy === "paymentMethod" ? "Payment Method" : groupBy === "orderType" ? "Order Type" : "Category";
      const wsData = [
        [`${APP_CONFIG.restaurant.name} — Revenue Breakdown Report`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        [`Grouped By: ${groupLabel}`],
        [],
        ["#", groupLabel, "Orders", "Revenue", "Avg Order", "Paid", "Unpaid"],
        ...result.allRows.map(r => [r.rank, formatLabel(r.label), r.orders, r.revenue, r.avgOrder, r.paidCount, r.unpaidCount]),
        [],
        ["Summary"],
        ["Total Revenue", result.summary.totalRevenue],
        ["Total Orders", result.summary.totalOrders],
        ["Avg Order Value", result.summary.avgOrderValue],
        ["Top Group", result.summary.topGroup],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [{ wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Revenue Breakdown");
      XLSX.writeFile(wb, `Revenue_Breakdown_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast.success("Excel exported!");
    } catch (err: any) { console.error("Excel export error:", err); toast.error("Failed to export Excel"); }
    finally { setExporting(null); }
  };

  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allRows) throw new Error("No data to export");
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const groupLabel = groupBy === "paymentMethod" ? "Payment Method" : groupBy === "orderType" ? "Order Type" : "Category";

      doc.setFontSize(16); doc.setTextColor(40,40,40); doc.text(`${APP_CONFIG.restaurant.name}`, 14, 15);
      doc.setFontSize(11); doc.setTextColor(100,100,100); doc.text(`Revenue Breakdown — by ${groupLabel}`, 14, 22);
      doc.setFontSize(9); doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Total: ${formatCurrency(result.summary.totalRevenue)}`, 14, 28);

      autoTable(doc, {
        startY: 34,
        head: [["#", groupLabel, "Orders", "Revenue", "Avg Order", "Paid", "Unpaid"]],
        body: result.allRows.map(r => [r.rank, formatLabel(r.label), r.orders, formatCurrency(r.revenue), formatCurrency(r.avgOrder), r.paidCount, r.unpaidCount]),
        theme: "grid",
        headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
      });
      doc.save(`Revenue_Breakdown_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
      toast.success("PDF exported!");
    } catch (err: any) { console.error("PDF export error:", err); toast.error("Failed to export PDF"); }
    finally { setExporting(null); }
  };

  const pagination = data?.pagination;
  const summary = data?.summary;
  const rows = data?.rows || [];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#6366F1" }}>
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Revenue Breakdown</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — Revenue by Dimension</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1" onClick={() => loadPage(page)} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Group By Selector */}
      <div className="flex gap-2">
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="flex-1 h-9 text-sm">
            <Layers className="w-3.5 h-3.5 mr-1 text-indigo-500" />
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paymentMethod">
              <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Payment Method</span>
            </SelectItem>
            <SelectItem value="orderType">
              <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Order Type</span>
            </SelectItem>
            <SelectItem value="category">
              <span className="flex items-center gap-1.5"><UtensilsCrossed className="w-3.5 h-3.5" /> Category</span>
            </SelectItem>
          </SelectContent>
        </Select>
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
            placeholder="Search group name..."
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
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-indigo-50">
              <DollarSign className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(summary.totalRevenue)}</p>
            <p className="text-[10px] text-gray-500">Total Revenue</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-amber-50">
              <BarChart3 className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalOrders}</p>
            <p className="text-[10px] text-gray-500">Total Orders</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-green-50">
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-lg font-bold text-green-600">{formatCurrency(summary.avgOrderValue)}</p>
            <p className="text-[10px] text-gray-500">Avg Order Value</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-purple-50">
              <PieChart className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-lg font-bold text-purple-600">{formatLabel(summary.topGroup)}</p>
            <p className="text-[10px] text-gray-500">Top Group</p>
          </Card>
        </div>
      )}

      {/* Horizontal Bar Chart */}
      {!loading && rows.length > 0 && summary && (
        <Card className="p-3 border">
          <p className="text-xs font-medium text-gray-600 mb-3">Revenue Distribution</p>
          <div className="space-y-2.5">
            {rows.map((row, idx) => {
              const pct = summary.totalRevenue > 0 ? (row.revenue / summary.totalRevenue) * 100 : 0;
              const color = GROUP_COLORS[idx % GROUP_COLORS.length];
              return (
                <div key={`bar-${row.rank}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-gray-700">{formatLabel(row.label)}</span>
                    <span className="text-[10px] text-gray-500">{formatCurrency(row.revenue)} ({Math.round(pct)}%)</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading revenue data...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && rows.length === 0 && data && (
        <Card className="p-8 text-center border">
          <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No revenue data found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or date range.</p>
        </Card>
      )}

      {/* Detail Cards */}
      {!loading && rows.map((row, idx) => {
        const color = GROUP_COLORS[idx % GROUP_COLORS.length];
        const pct = summary && summary.totalRevenue > 0 ? Math.round((row.revenue / summary.totalRevenue) * 100) : 0;
        return (
          <Card key={`detail-${row.rank}`} className="overflow-hidden" style={{ borderLeftWidth: "4px", borderLeftColor: color }}>
            <div className="p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 text-white" style={{ backgroundColor: color }}>
                  #{row.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm">{formatLabel(row.label)}</h3>
                    <Badge className="text-[9px] px-1.5 py-0 text-white shrink-0" style={{ backgroundColor: color }}>
                      {pct}%
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <p className="text-[10px] text-gray-400">Revenue</p>
                      <p className="text-xs font-bold" style={{ color }}>{formatCurrency(row.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Orders</p>
                      <p className="text-xs font-bold text-gray-700">{row.orders}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Avg Order</p>
                      <p className="text-xs font-bold text-gray-700">{formatCurrency(row.avgOrder)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-1.5">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-green-200 text-green-600">
                      {row.paidCount} paid
                    </Badge>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-200 text-red-500">
                      {row.unpaidCount} unpaid
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} groups)</p>
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
            onClick={handleExportExcel} disabled={!!exporting || loading || !data?.rows?.length}>
            {exporting === "excel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Export Excel
          </Button>
          <Button className="flex-1 h-11 gap-2 text-white font-medium" style={{ backgroundColor: "#DC2626" }}
            onClick={handleExportPDF} disabled={!!exporting || loading || !data?.rows?.length}>
            {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
