/**
 * CustomerChurnReport — Customer Churn / At-Risk Analytics report.
 * Identifies high-value customers who haven't ordered in 30+ days
 * with 5+ completed orders, ranked by avg order value.
 * Includes risk-level badges, adjustable thresholds, pagination, and Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  UserX, TrendingDown, Clock, Search, Calendar,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Phone, MapPin,
  Loader2, ArrowUpDown, AlertTriangle, ShoppingCart,
  DollarSign, CalendarClock, AlertCircle, Award,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

// Risk level colors
const RISK_STYLES: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
  warning: {
    bg: "#FEF9C3",
    text: "#A16207",
    border: "#FACC15",
    label: "At Risk",
    icon: "#EAB308",
  },
  danger: {
    bg: "#FED7AA",
    text: "#C2410C",
    border: "#FB923C",
    label: "High Risk",
    icon: "#F97316",
  },
  critical: {
    bg: "#FECACA",
    text: "#B91C1C",
    border: "#F87171",
    label: "Critical",
    icon: "#EF4444",
  },
};

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

interface ChurnCustomer {
  rank: number;
  userId: string | null;
  name: string;
  phone: string;
  address: string;
  tier: string;
  totalOrders: number;
  totalRevenue: number;
  lastOrderDate: string;
  firstOrderDate: string;
  daysAgo: number;
  avgOrderValue: number;
  riskLevel: "warning" | "danger" | "critical";
  customerLifespanDays: number;
}

interface ReportData {
  customers: ChurnCustomer[];
  summary: {
    atRiskCustomers: number;
    lostRevenue: number;
    avgDaysInactive: number;
    avgOrderValue: number;
    warningCount: number;
    dangerCount: number;
    criticalCount: number;
  };
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allCustomers?: ChurnCustomer[];
}

interface Props {
  customToken: string | null;
}

export function CustomerChurnReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("avgOrderValue");
  const [minDays, setMinDays] = useState("30");
  const [minOrders, setMinOrders] = useState("5");
  const [riskLevel, setRiskLevel] = useState("all");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "10",
        sortBy,
        minDays,
        minOrders,
        riskLevel,
        ...(search && { search }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetchWithRetry(`${API_BASE}/reports/customer-churn?${params}`, {
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
      console.error("Churn report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, sortBy, minDays, minOrders, riskLevel]);

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
        [`${APP_CONFIG.restaurant.name} — Customer Churn Report`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        [`Criteria: ${minDays}+ days inactive, ${minOrders}+ past orders`],
        [],
        ["Rank", "Customer Name", "Phone", "Address", "Tier", "Risk Level", "Days Inactive", "Total Orders", "Avg Order Value", "Total Revenue", "Last Order"],
        ...result.allCustomers.map(c => [
          c.rank,
          c.name,
          c.phone,
          c.address,
          c.tier,
          RISK_STYLES[c.riskLevel]?.label || c.riskLevel,
          c.daysAgo,
          c.totalOrders,
          c.avgOrderValue,
          c.totalRevenue,
          c.lastOrderDate ? format(new Date(c.lastOrderDate), "dd MMM yyyy") : "-",
        ]),
        [],
        ["Summary"],
        ["At-Risk Customers", result.summary.atRiskCustomers],
        ["Total Revenue at Risk", result.summary.lostRevenue],
        ["Avg Days Inactive", result.summary.avgDaysInactive],
        ["Avg Order Value", result.summary.avgOrderValue],
        ["Warning (14-29 days)", result.summary.warningCount],
        ["High Risk (30-59 days)", result.summary.dangerCount],
        ["Critical (60+ days)", result.summary.criticalCount],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [
        { wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 30 },
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 15 }, { wch: 15 }, { wch: 14 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customer Churn");
      XLSX.writeFile(wb, `Customer_Churn_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
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
      doc.text("Customer Churn Report", 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);
      doc.text(`Criteria: ${minDays}+ days inactive, ${minOrders}+ past orders`, 14, 33);

      // Summary
      const summaryY = 38;
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(
        `At-Risk: ${result.summary.atRiskCustomers}  |  Revenue at Risk: ${formatCurrency(result.summary.lostRevenue)}  |  Avg Days Inactive: ${result.summary.avgDaysInactive}  |  Avg Order Value: ${formatCurrency(result.summary.avgOrderValue)}`,
        14, summaryY
      );

      // Table
      autoTable(doc, {
        startY: summaryY + 5,
        head: [["#", "Customer", "Phone", "Risk", "Days Ago", "Orders", "Avg Value", "Revenue", "Last Order"]],
        body: result.allCustomers.map(c => [
          c.rank,
          c.name,
          c.phone,
          RISK_STYLES[c.riskLevel]?.label || c.riskLevel,
          c.daysAgo,
          c.totalOrders,
          formatCurrency(c.avgOrderValue),
          formatCurrency(c.totalRevenue),
          c.lastOrderDate ? format(new Date(c.lastOrderDate), "dd MMM yyyy") : "-",
        ]),
        theme: "grid",
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [254, 249, 243] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 40 },
          2: { cellWidth: 30 },
          3: { cellWidth: 18, halign: "center" },
          4: { cellWidth: 18, halign: "center" },
          5: { cellWidth: 16, halign: "center" },
          6: { cellWidth: 25, halign: "right" },
          7: { cellWidth: 28, halign: "right" },
          8: { cellWidth: 25, halign: "center" },
        },
        margin: { left: 14, right: 14 },
      });

      doc.save(`Customer_Churn_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
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
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-600">
          <UserX className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Customer Churn</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — At-Risk Customers</p>
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

      {/* Threshold Controls */}
      <Card className="p-3 border">
        <Label className="text-xs text-gray-500 mb-2 block font-medium">Churn Criteria</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-gray-400 mb-0.5 block">Min Days Inactive</Label>
            <Select value={minDays} onValueChange={setMinDays}>
              <SelectTrigger className="h-9 text-sm">
                <Clock className="w-3.5 h-3.5 mr-1 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="21">21 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="45">45 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-gray-400 mb-0.5 block">Min Past Orders</Label>
            <Select value={minOrders} onValueChange={setMinOrders}>
              <SelectTrigger className="h-9 text-sm">
                <ShoppingCart className="w-3.5 h-3.5 mr-1 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2+ orders</SelectItem>
                <SelectItem value="3">3+ orders</SelectItem>
                <SelectItem value="5">5+ orders</SelectItem>
                <SelectItem value="10">10+ orders</SelectItem>
                <SelectItem value="15">15+ orders</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          className="h-9 px-4 text-white w-full mt-2"
          style={{ backgroundColor: BRAND }}
          onClick={handleApplyFilter}
          disabled={loading}
        >
          Apply Criteria
        </Button>
      </Card>

      {/* Search + Risk Filter + Sort */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, phone, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Select value={riskLevel} onValueChange={setRiskLevel}>
            <SelectTrigger className="flex-1 h-9 text-sm">
              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-gray-400" />
              <SelectValue placeholder="All Risk Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="warning">At Risk (14-29d)</SelectItem>
              <SelectItem value="danger">High Risk (30-59d)</SelectItem>
              <SelectItem value="critical">Critical (60d+)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v)}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-gray-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="avgOrderValue">Avg Value</SelectItem>
              <SelectItem value="daysAgo">Days Ago</SelectItem>
              <SelectItem value="totalOrders">Orders</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-red-50">
              <UserX className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.atRiskCustomers}</p>
            <p className="text-[10px] text-gray-500 leading-tight">At-Risk Customers</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-orange-50">
              <TrendingDown className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-[15px] font-bold text-gray-900">{formatCurrency(summary.lostRevenue)}</p>
            <p className="text-[10px] text-gray-500 leading-tight">Revenue at Risk</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-amber-50">
              <CalendarClock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.avgDaysInactive}</p>
            <p className="text-[10px] text-gray-500 leading-tight">Avg Days Inactive</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-emerald-50">
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-[15px] font-bold text-gray-900">{formatCurrency(summary.avgOrderValue)}</p>
            <p className="text-[10px] text-gray-500 leading-tight">Avg Order Value</p>
          </Card>
        </div>
      )}

      {/* Risk Breakdown Bar */}
      {summary && summary.atRiskCustomers > 0 && (
        <Card className="p-3 border">
          <p className="text-xs font-medium text-gray-600 mb-2">Risk Distribution</p>
          <div className="flex gap-1.5 h-3 rounded-full overflow-hidden bg-gray-100">
            {summary.warningCount > 0 && (
              <div
                className="h-full rounded-full transition-all"
                style={{
                  backgroundColor: RISK_STYLES.warning.icon,
                  width: `${(summary.warningCount / summary.atRiskCustomers) * 100}%`,
                }}
              />
            )}
            {summary.dangerCount > 0 && (
              <div
                className="h-full rounded-full transition-all"
                style={{
                  backgroundColor: RISK_STYLES.danger.icon,
                  width: `${(summary.dangerCount / summary.atRiskCustomers) * 100}%`,
                }}
              />
            )}
            {summary.criticalCount > 0 && (
              <div
                className="h-full rounded-full transition-all"
                style={{
                  backgroundColor: RISK_STYLES.critical.icon,
                  width: `${(summary.criticalCount / summary.atRiskCustomers) * 100}%`,
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {summary.warningCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_STYLES.warning.icon }} />
                <span className="text-[10px] text-gray-500">At Risk ({summary.warningCount})</span>
              </div>
            )}
            {summary.dangerCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_STYLES.danger.icon }} />
                <span className="text-[10px] text-gray-500">High Risk ({summary.dangerCount})</span>
              </div>
            )}
            {summary.criticalCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_STYLES.critical.icon }} />
                <span className="text-[10px] text-gray-500">Critical ({summary.criticalCount})</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading report...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && customers.length === 0 && data && (
        <Card className="p-8 text-center border">
          <UserX className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No at-risk customers found</p>
          <p className="text-xs text-gray-400 mt-1">
            Great news! No customers match the churn criteria ({minDays}+ days, {minOrders}+ orders).
          </p>
        </Card>
      )}

      {/* Customer Cards */}
      {!loading && customers.map((customer) => {
        const riskStyle = RISK_STYLES[customer.riskLevel] || RISK_STYLES.warning;
        const tierColor = TIER_COLORS[customer.tier] || "#9CA3AF";
        const tierBg = TIER_BG[customer.tier] || "#F3F4F6";

        return (
          <Card
            key={customer.userId || customer.phone || customer.rank}
            className="overflow-hidden"
            style={{
              borderColor: riskStyle.border,
              borderWidth: "1.5px",
              borderLeftWidth: "4px",
            }}
          >
            <div className="p-3.5">
              {/* Top row: Rank + Name + Risk Badge */}
              <div className="flex items-start gap-3">
                {/* Rank + Risk indicator */}
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                    style={{
                      backgroundColor: riskStyle.bg,
                      color: riskStyle.text,
                      border: `2px solid ${riskStyle.border}`,
                    }}
                  >
                    #{customer.rank}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">
                      {customer.name}
                    </h3>
                    {/* Risk badge */}
                    <Badge
                      className="text-[9px] px-1.5 py-0 font-semibold shrink-0"
                      style={{
                        backgroundColor: riskStyle.bg,
                        color: riskStyle.text,
                        borderColor: riskStyle.border,
                        borderWidth: "1px",
                      }}
                    >
                      <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                      {riskStyle.label}
                    </Badge>
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
                  </div>

                  {/* Days Ago - prominent */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Badge
                      className="text-xs px-2 py-0.5 font-bold"
                      style={{
                        backgroundColor: riskStyle.bg,
                        color: riskStyle.text,
                        borderColor: riskStyle.border,
                        borderWidth: "1px",
                      }}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      {customer.daysAgo} days ago
                    </Badge>
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
                  <p className="text-xs text-gray-400">Avg Order</p>
                  <p className="text-sm font-bold" style={{ color: BRAND }}>{formatCurrency(customer.avgOrderValue)}</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Orders</p>
                  <p className="text-sm font-bold text-gray-800">{customer.totalOrders}</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Total Spent</p>
                  <p className="text-sm font-bold text-gray-700">{formatCurrency(customer.totalRevenue)}</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Last Order</p>
                  <p className="text-[11px] font-semibold text-gray-700">
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