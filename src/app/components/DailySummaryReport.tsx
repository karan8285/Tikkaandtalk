/**
 * DailySummaryReport — Consolidated daily view of sales, orders, key metrics.
 * Each row is one day showing: revenue, orders, avg order, paid/unpaid,
 * delivery/pickup split, unique customers, items sold, top item, peak hour.
 * Features: date range, search, pagination (10/page), Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  BarChart3, Search, Calendar,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Loader2,
  DollarSign, TrendingUp, Users, ShoppingBag,
  Clock, Truck, Store, UtensilsCrossed, Crown,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface DayRow {
  rank: number;
  date: string;
  dateLabel: string;
  dayOfWeek: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrder: number;
  paidOrders: number;
  unpaidOrders: number;
  paidAmount: number;
  unpaidAmount: number;
  deliveryOrders: number;
  pickupOrders: number;
  uniqueCustomers: number;
  itemsSold: number;
  topItem: string;
  topItemCount: number;
  peakHour: string;
  peakHourOrders: number;
}

interface ReportData {
  days: DayRow[];
  summary: {
    totalDays: number;
    grandTotalRevenue: number;
    grandTotalOrders: number;
    avgDailyRevenue: number;
    avgDailyOrders: number;
    bestDayDate: string;
    bestDayRevenue: number;
  };
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allDays?: DayRow[];
}

interface Props {
  customToken: string | null;
}

export function DailySummaryReport({ customToken }: Props) {
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
      const res = await fetch(`${API_BASE}/reports/daily-summary?${params}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": customToken },
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to fetch report"); }
      return await res.json() as ReportData;
    } catch (err: any) {
      console.error("Daily summary fetch error:", err);
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
      if (!result?.allDays) throw new Error("No data to export");
      const XLSX = await import("xlsx");
      const wsData = [
        [`${APP_CONFIG.restaurant.name} — Daily Summary Report`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        [],
        ["#", "Date", "Day", "Orders", "Revenue", "Avg Order", "Paid", "Unpaid", "Delivery", "Pickup", "Customers", "Items Sold", "Top Item", "Peak Hour"],
        ...result.allDays.map(d => [
          d.rank, d.dateLabel, d.dayOfWeek, d.totalOrders, d.totalRevenue, d.avgOrder,
          d.paidOrders, d.unpaidOrders, d.deliveryOrders, d.pickupOrders,
          d.uniqueCustomers, d.itemsSold, `${d.topItem} (${d.topItemCount})`, d.peakHour,
        ]),
        [],
        ["Summary"],
        ["Total Days", result.summary.totalDays],
        ["Grand Total Revenue", result.summary.grandTotalRevenue],
        ["Grand Total Orders", result.summary.grandTotalOrders],
        ["Avg Daily Revenue", result.summary.avgDailyRevenue],
        ["Avg Daily Orders", result.summary.avgDailyOrders],
        ["Best Day", `${result.summary.bestDayDate} (${result.summary.bestDayRevenue})`],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [{ wch: 5 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Daily Summary");
      XLSX.writeFile(wb, `Daily_Summary_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast.success("Excel exported!");
    } catch (err: any) { console.error("Excel export error:", err); toast.error("Failed to export Excel"); }
    finally { setExporting(null); }
  };

  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allDays) throw new Error("No data to export");
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(16); doc.setTextColor(40,40,40); doc.text(`${APP_CONFIG.restaurant.name}`, 14, 15);
      doc.setFontSize(11); doc.setTextColor(100,100,100); doc.text("Daily Summary Report", 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Days: ${result.summary.totalDays} | Avg Daily: ${formatCurrency(result.summary.avgDailyRevenue)}`, 14, 28);

      autoTable(doc, {
        startY: 34,
        head: [["#", "Date", "Orders", "Revenue", "Avg", "Paid", "Unpaid", "Del.", "Pick.", "Cust.", "Items", "Top Item", "Peak"]],
        body: result.allDays.map(d => [
          d.rank, d.dateLabel, d.totalOrders, formatCurrency(d.totalRevenue),
          formatCurrency(d.avgOrder), d.paidOrders, d.unpaidOrders,
          d.deliveryOrders, d.pickupOrders, d.uniqueCustomers, d.itemsSold,
          d.topItem.length > 18 ? d.topItem.substring(0, 18) + "..." : d.topItem,
          d.peakHour,
        ]),
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontSize: 7 },
        bodyStyles: { fontSize: 6.5 },
        alternateRowStyles: { fillColor: [239, 246, 255] },
        margin: { left: 10, right: 10 },
      });
      doc.save(`Daily_Summary_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
      toast.success("PDF exported!");
    } catch (err: any) { console.error("PDF export error:", err); toast.error("Failed to export PDF"); }
    finally { setExporting(null); }
  };

  const pagination = data?.pagination;
  const summary = data?.summary;
  const days = data?.days || [];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#3B82F6" }}>
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Daily Summary</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — Day-by-Day Breakdown</p>
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
            placeholder="Search by date, day, or item..."
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
        <>
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-3 border text-center">
              <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-blue-50">
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-lg font-bold text-gray-900">{summary.totalDays}</p>
              <p className="text-[10px] text-gray-500">Days Tracked</p>
            </Card>
            <Card className="p-3 border text-center">
              <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-green-50">
                <DollarSign className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-lg font-bold text-green-600">{formatCurrency(summary.grandTotalRevenue)}</p>
              <p className="text-[10px] text-gray-500">Total Revenue</p>
            </Card>
            <Card className="p-3 border text-center">
              <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-amber-50">
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-lg font-bold text-amber-600">{formatCurrency(summary.avgDailyRevenue)}</p>
              <p className="text-[10px] text-gray-500">Avg Daily Revenue</p>
            </Card>
            <Card className="p-3 border text-center">
              <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-purple-50">
                <Crown className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-sm font-bold text-purple-600 truncate">{summary.bestDayDate}</p>
              <p className="text-[10px] text-gray-500">Best Day ({formatCurrency(summary.bestDayRevenue)})</p>
            </Card>
          </div>
        </>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading daily data...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && days.length === 0 && data && (
        <Card className="p-8 text-center border">
          <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No daily data found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your date range.</p>
        </Card>
      )}

      {/* Day Cards */}
      {!loading && days.map((day) => {
        const isBestDay = summary && day.totalRevenue === summary.bestDayRevenue && day.dateLabel === summary.bestDayDate;
        return (
          <Card
            key={`day-${day.date}`}
            className="overflow-hidden"
            style={{
              borderLeftWidth: "4px",
              borderLeftColor: isBestDay ? "#F59E0B" : "#3B82F6",
              ...(isBestDay ? { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" } : {}),
            }}
          >
            <div className="p-3.5">
              {/* Day header */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{day.dateLabel}</h3>
                  <p className="text-[10px] text-gray-500">{day.dayOfWeek}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold" style={{ color: BRAND }}>{formatCurrency(day.totalRevenue)}</p>
                  <p className="text-[10px] text-gray-500">{day.totalOrders} orders</p>
                </div>
              </div>

              {/* Best day badge */}
              {isBestDay && (
                <Badge className="text-[9px] px-1.5 py-0 mb-2 bg-amber-100 text-amber-700 border border-amber-300 gap-0.5">
                  <Crown className="w-3 h-3" /> Best Revenue Day
                </Badge>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-2 mt-1">
                <div className="text-center p-1.5 bg-gray-50 rounded-lg">
                  <p className="text-[10px] text-gray-400">Avg Order</p>
                  <p className="text-xs font-bold text-gray-700">{formatCurrency(day.avgOrder)}</p>
                </div>
                <div className="text-center p-1.5 bg-gray-50 rounded-lg">
                  <p className="text-[10px] text-gray-400">Customers</p>
                  <p className="text-xs font-bold text-gray-700">
                    <Users className="w-3 h-3 inline mr-0.5" />{day.uniqueCustomers}
                  </p>
                </div>
                <div className="text-center p-1.5 bg-gray-50 rounded-lg">
                  <p className="text-[10px] text-gray-400">Items</p>
                  <p className="text-xs font-bold text-gray-700">
                    <Package className="w-3 h-3 inline mr-0.5" />{day.itemsSold}
                  </p>
                </div>
                <div className="text-center p-1.5 bg-gray-50 rounded-lg">
                  <p className="text-[10px] text-gray-400">Peak</p>
                  <p className="text-xs font-bold text-gray-700">
                    <Clock className="w-3 h-3 inline mr-0.5" />{day.peakHour}
                  </p>
                </div>
              </div>

              {/* Bottom row badges */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-green-200 text-green-600">
                  {day.paidOrders} paid
                </Badge>
                {day.unpaidOrders > 0 && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-200 text-red-500">
                    {day.unpaidOrders} unpaid
                  </Badge>
                )}
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-200 text-blue-600 gap-0.5">
                  <Truck className="w-2.5 h-2.5" /> {day.deliveryOrders}
                </Badge>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-gray-200 text-gray-600 gap-0.5">
                  <Store className="w-2.5 h-2.5" /> {day.pickupOrders}
                </Badge>
                {day.topItem !== "-" && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-200 text-amber-700 gap-0.5">
                    <UtensilsCrossed className="w-2.5 h-2.5" /> {day.topItem} ({day.topItemCount})
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} days)</p>
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
            onClick={handleExportExcel} disabled={!!exporting || loading || !data?.days?.length}>
            {exporting === "excel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Export Excel
          </Button>
          <Button className="flex-1 h-11 gap-2 text-white font-medium" style={{ backgroundColor: "#DC2626" }}
            onClick={handleExportPDF} disabled={!!exporting || loading || !data?.days?.length}>
            {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
