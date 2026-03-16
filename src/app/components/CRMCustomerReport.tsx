/**
 * CRMCustomerReport — CRM Customer Analytics report.
 * Aggregates customer data from orders, ranked by total revenue.
 * Includes date range filter, search, pagination, and Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Users, ShoppingCart, TrendingUp, Search, Calendar,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Award, Phone, MapPin,
  Crown, Loader2, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

const TIER_COLORS: Record<string, string> = {
  Silver: "#9CA3AF",
  Gold: "#FFC107",
  Diamond: "#00BCD4",
  Platinum: "#9C27B0",
};

const TIER_BG: Record<string, string> = {
  Silver: "#F3F4F6",
  Gold: "#FFFBEB",
  Diamond: "#ECFEFF",
  Platinum: "#FAF5FF",
};

// Medal colors for top 3
const MEDAL_STYLES: Record<number, { bg: string; border: string; text: string; icon: string }> = {
  1: { bg: "linear-gradient(135deg, #FFF9E6 0%, #FFE999 100%)", border: "#FFD700", text: "#92700C", icon: "#FFD700" },
  2: { bg: "linear-gradient(135deg, #F5F5F5 0%, #D4D4D4 100%)", border: "#C0C0C0", text: "#5A5A5A", icon: "#C0C0C0" },
  3: { bg: "linear-gradient(135deg, #FFF0E6 0%, #FFDAB9 100%)", border: "#CD7F32", text: "#7C4A1E", icon: "#CD7F32" },
};

interface CustomerRow {
  rank: number;
  userId: string | null;
  name: string;
  phone: string;
  address: string;
  tier: string;
  totalOrders: number;
  totalRevenue: number;
  lastOrderDate: string;
  totalPointsEarned: number;
  points: number;
}

interface ReportData {
  customers: CustomerRow[];
  summary: { totalCustomers: number; totalOrders: number; totalRevenue: number };
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allCustomers?: CustomerRow[];
}

interface Props {
  customToken: string | null;
}

export function CRMCustomerReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("revenue");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "10",
        sortBy,
        ...(search && { search }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetch(`${API_BASE}/reports/customer-analytics?${params}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch report");
      }
      return await res.json() as ReportData;
    } catch (err: any) {
      console.error("CRM report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, startDate, endDate, sortBy]);

  const loadPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    const result = await fetchReport(pageNum);
    if (result) {
      setData(result);
      setPage(result.pagination.page);
    }
    setLoading(false);
  }, [fetchReport]);

  // Initial load
  useEffect(() => {
    loadPage(1);
  }, []);

  const handleApplyFilter = () => {
    setPage(1);
    loadPage(1);
  };

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allCustomers) throw new Error("No data to export");

      const XLSX = await import("xlsx");
      const wsData = [
        [`${APP_CONFIG.restaurant.name} — Customer Analytics Report`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        ...(startDate || endDate ? [`Period: ${startDate || "All"} to ${endDate || "All"}`] : []),
        [],
        ["Rank", "Customer Name", "Phone", "Address", "Tier", "Orders", "Total Revenue", "Last Order", "Points"],
        ...result.allCustomers.map(c => [
          c.rank,
          c.name,
          c.phone,
          c.address,
          c.tier,
          c.totalOrders,
          c.totalRevenue,
          c.lastOrderDate ? format(new Date(c.lastOrderDate), "dd MMM yyyy") : "-",
          c.totalPointsEarned,
        ]),
        [],
        ["Summary"],
        ["Total Customers", result.summary.totalCustomers],
        ["Total Orders", result.summary.totalOrders],
        ["Total Revenue", result.summary.totalRevenue],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Set column widths
      ws["!cols"] = [
        { wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 35 },
        { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 10 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customer Analytics");
      XLSX.writeFile(wb, `Customer_Analytics_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast.success("Excel report exported!");
    } catch (err: any) {
      console.error("Excel export error:", err);
      toast.error("Failed to export Excel");
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allCustomers) throw new Error("No data to export");

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Title
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text(`${APP_CONFIG.restaurant.name}`, 14, 15);
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text("Customer Analytics Report", 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);
      if (startDate || endDate) {
        doc.text(`Period: ${startDate || "All"} to ${endDate || "All"}`, 14, 33);
      }

      // Summary boxes
      const summaryY = startDate || endDate ? 38 : 33;
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(`Total Customers: ${result.summary.totalCustomers}  |  Total Orders: ${result.summary.totalOrders}  |  Total Revenue: ${formatCurrency(result.summary.totalRevenue)}`, 14, summaryY);

      // Table
      autoTable(doc, {
        startY: summaryY + 5,
        head: [["#", "Customer", "Phone", "Tier", "Orders", "Revenue", "Last Order"]],
        body: result.allCustomers.map(c => [
          c.rank,
          c.name,
          c.phone,
          c.tier,
          c.totalOrders,
          formatCurrency(c.totalRevenue),
          c.lastOrderDate ? format(new Date(c.lastOrderDate), "dd MMM yyyy") : "-",
        ]),
        theme: "grid",
        headStyles: { fillColor: [217, 26, 96], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [252, 248, 250] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 50 },
          2: { cellWidth: 35 },
          3: { cellWidth: 20, halign: "center" },
          4: { cellWidth: 18, halign: "center" },
          5: { cellWidth: 30, halign: "right" },
          6: { cellWidth: 28, halign: "center" },
        },
        margin: { left: 14, right: 14 },
      });

      doc.save(`Customer_Analytics_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
      toast.success("PDF report exported!");
    } catch (err: any) {
      console.error("PDF export error:", err);
      toast.error("Failed to export PDF");
    } finally {
      setExporting(null);
    }
  };

  const pagination = data?.pagination;
  const summary = data?.summary;
  const customers = data?.customers || [];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: BRAND }}>
          <Users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Customer Analytics</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — CRM Report</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1"
          onClick={() => loadPage(page)}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Date Filter Bar */}
      <Card className="p-3 border">
        <div className="flex flex-col sm:flex-row gap-2 items-end">
          <div className="flex-1 min-w-0">
            <Label className="text-xs text-gray-500 mb-1 block">Start Date</Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Label className="text-xs text-gray-500 mb-1 block">End Date</Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="h-9 px-4 text-white shrink-0"
            style={{ backgroundColor: BRAND }}
            onClick={handleApplyFilter}
            disabled={loading}
          >
            Apply Filter
          </Button>
        </div>
      </Card>

      {/* Search + Sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, phone, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => { setSortBy(v); }}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-gray-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="orders">Orders</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center" style={{ backgroundColor: BRAND + "15" }}>
              <Users className="w-4 h-4" style={{ color: BRAND }} />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalCustomers}</p>
            <p className="text-[10px] text-gray-500 leading-tight">Total Customers</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-blue-50">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalOrders}</p>
            <p className="text-[10px] text-gray-500 leading-tight">Total Orders</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-emerald-50">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-gray-900 text-[15px]">{formatCurrency(summary.totalRevenue)}</p>
            <p className="text-[10px] text-gray-500 leading-tight">Total Revenue</p>
          </Card>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading report...</span>
        </div>
      )}

      {/* Customer Cards */}
      {!loading && customers.length === 0 && data && (
        <Card className="p-8 text-center border">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No customers found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or date range</p>
        </Card>
      )}

      {!loading && customers.map((customer) => {
        const isTop3 = customer.rank <= 3;
        const medalStyle = MEDAL_STYLES[customer.rank];
        const tierColor = TIER_COLORS[customer.tier] || "#9CA3AF";
        const tierBg = TIER_BG[customer.tier] || "#F3F4F6";

        return (
          <Card
            key={customer.userId || customer.phone || customer.rank}
            className="overflow-hidden border"
            style={isTop3 ? {
              background: medalStyle.bg,
              borderColor: medalStyle.border,
              borderWidth: "1.5px",
            } : undefined}
          >
            <div className="p-3.5">
              {/* Top row: Rank + Name + Tier */}
              <div className="flex items-start gap-3">
                {/* Rank badge */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
                  style={isTop3 ? {
                    backgroundColor: medalStyle.icon + "25",
                    color: medalStyle.text,
                    border: `2px solid ${medalStyle.icon}`,
                  } : {
                    backgroundColor: "#F3F4F6",
                    color: "#6B7280",
                  }}
                >
                  {isTop3 ? (
                    <Crown className="w-5 h-5" style={{ color: medalStyle.icon }} />
                  ) : (
                    `#${customer.rank}`
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">
                      {isTop3 && <span className="mr-1">#{customer.rank}</span>}
                      {customer.name}
                    </h3>
                    {/* Tier badge */}
                    <Badge
                      className="text-[9px] px-1.5 py-0 border font-semibold shrink-0"
                      style={{
                        backgroundColor: tierBg,
                        color: tierColor,
                        borderColor: tierColor + "40",
                      }}
                    >
                      <Award className="w-2.5 h-2.5 mr-0.5" />
                      {customer.tier}
                    </Badge>
                    {/* VIP badge for top 3 */}
                    {isTop3 && (
                      <Badge
                        className="text-[9px] px-1.5 py-0 font-semibold shrink-0 text-white"
                        style={{ backgroundColor: medalStyle.icon }}
                      >
                        <Crown className="w-2.5 h-2.5 mr-0.5" />
                        {customer.rank === 1 ? "Top Customer" : customer.rank === 2 ? "Runner Up" : "3rd Place"}
                      </Badge>
                    )}
                  </div>

                  {/* Phone */}
                  {customer.phone && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <Phone className="w-3 h-3" />
                      <span>{customer.phone}</span>
                    </div>
                  )}

                  {/* Address */}
                  {customer.address && (
                    <div className="flex items-start gap-1 mt-0.5 text-xs text-gray-400">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{customer.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Orders</p>
                  <p className="text-sm font-bold text-gray-800">{customer.totalOrders}</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Revenue</p>
                  <p className="text-sm font-bold" style={{ color: BRAND }}>{formatCurrency(customer.totalRevenue)}</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Last Order</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {customer.lastOrderDate
                      ? format(new Date(customer.lastOrderDate), "dd MMM yy")
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} customers)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadPage(1)}
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadPage(pagination.page - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-medium px-2 text-gray-700">
              {pagination.page}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadPage(pagination.page + 1)}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadPage(pagination.totalPages)}
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Sticky Export Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button
            className="flex-1 h-11 gap-2 text-white font-medium"
            style={{ backgroundColor: "#217346" }}
            onClick={handleExportExcel}
            disabled={!!exporting || loading || !data?.customers?.length}
          >
            {exporting === "excel" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            Export Excel
          </Button>
          <Button
            className="flex-1 h-11 gap-2 text-white font-medium"
            style={{ backgroundColor: "#DC2626" }}
            onClick={handleExportPDF}
            disabled={!!exporting || loading || !data?.customers?.length}
          >
            {exporting === "pdf" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}