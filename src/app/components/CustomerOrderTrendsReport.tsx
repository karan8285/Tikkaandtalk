/**
 * CustomerOrderTrendsReport — Per-customer line charts showing order value over time.
 * Top N customers ranked by order count, each with their own mini chart.
 * Includes time period filters (7d/30d/60d/90d/custom), top N selector,
 * search, summary cards, and Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  TrendingUp, Search, Calendar, Phone,
  FileSpreadsheet, FileText, RefreshCw, Loader2,
  Users, ShoppingCart, DollarSign, BarChart3, Hash,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

const CHART_COLORS = [
  "#D91A60", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#EF4444",
  "#06B6D4", "#84CC16", "#A855F7", "#FB7185", "#2DD4BF",
  "#FBBF24", "#818CF8", "#F43F5E", "#34D399", "#FB923C",
];

/* ─── Lightweight Sparkline (replaces recharts to avoid internal duplicate-key warnings) ─── */
function MiniSparkline({
  data,
  color,
  height = 140,
}: {
  data: { dateLabel: string; total: number }[];
  color: string;
  height?: number;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number } | null>(null);

  if (data.length < 2) return null;

  const padL = 42;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const W = 320;

  const vals = data.map((d) => d.total);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const rangeV = maxV - minV || 1;

  const fmtAxis = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(Math.round(v));
  };

  const getX = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const getY = (total: number) => padT + ((maxV - total) / rangeV) * (height - padT - padB);

  const linePoints = data.map((d, i) => `${getX(i)},${getY(d.total)}`).join(" ");
  const areaPoints = linePoints + ` ${W - padR},${height - padB} ${padL},${height - padB}`;

  const xIndices =
    data.length <= 6
      ? data.map((_, i) => i)
      : [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padT + (1 - frac) * (height - padT - padB);
          return <line key={`g${frac}`} x1={padL} y1={y} x2={W - padR} y2={y} stroke="#F3F4F6" strokeDasharray="3 3" />;
        })}
        {/* Y labels */}
        {[0, 0.5, 1].map((frac) => {
          const y = padT + (1 - frac) * (height - padT - padB);
          return <text key={`y${frac}`} x={padL - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">{fmtAxis(minV + frac * rangeV)}</text>;
        })}
        {/* Area */}
        <polygon points={areaPoints} fill={color} fillOpacity={0.08} />
        {/* Line */}
        <polyline fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={linePoints} />
        {/* Dots */}
        {data.map((d, i) => {
          const cx = getX(i);
          const cy = getY(d.total);
          return (
            <g key={`d${i}`}>
              <circle cx={cx} cy={cy} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
              <circle cx={cx} cy={cy} r={12} fill="transparent"
                onMouseEnter={() => setTooltip({ x: cx, y: cy, label: d.dateLabel, value: d.total })}
                onMouseLeave={() => setTooltip(null)}
              />
            </g>
          );
        })}
        {/* X labels */}
        {xIndices.map((i) => (
          <text key={`x${i}`} x={getX(i)} y={height - 4} textAnchor="middle" fontSize={9} fill="#9CA3AF">{data[i]?.dateLabel ?? ""}</text>
        ))}
      </svg>
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-md z-10"
          style={{ left: `${(tooltip.x / W) * 100}%`, top: Math.max(0, tooltip.y - 48), transform: "translateX(-50%)", fontSize: 11 }}
        >
          <div className="text-gray-500">{tooltip.label}</div>
          <div className="font-semibold" style={{ color }}>{formatCurrency(tooltip.value)}</div>
        </div>
      )}
    </div>
  );
}

interface CustomerTrend {
  rank: number;
  userId: string | null;
  name: string;
  phone: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  orders: { date: string; dateLabel: string; total: number }[];
}

interface ReportData {
  customers: CustomerTrend[];
  summary: {
    totalCustomers: number;
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
  };
}

interface Props {
  customToken: string | null;
}

export function CustomerOrderTrendsReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const [search, setSearch] = useState("");
  const [topN, setTopN] = useState("5");
  const [period, setPeriod] = useState("30");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchReport = useCallback(async () => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        topN,
        period,
        ...(search && { search }),
        ...(period === "custom" && dateFrom && { dateFrom }),
        ...(period === "custom" && dateTo && { dateTo }),
      });
      const res = await fetchWithRetry(`${API_BASE}/reports/customer-trends?${params}`, {
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
      console.error("Trends report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, topN, period, dateFrom, dateTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const result = await fetchReport();
    if (result) setData(result);
    setLoading(false);
  }, [fetchReport]);

  useEffect(() => { loadData(); }, []);

  const handleApplyFilter = () => { loadData(); };

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      if (!data?.customers) throw new Error("No data to export");
      const XLSX = await import("xlsx");
      const wsData = [
        [`${APP_CONFIG.restaurant.name} — Customer Order Trends`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        [`Period: ${period === "custom" ? `${dateFrom || "?"} to ${dateTo || "?"}` : `Last ${period} days`} | Top ${topN}`],
        [],
        ["Rank", "Customer", "Phone", "Total Orders", "Total Revenue", "Avg Order Value"],
        ...data.customers.map(c => [
          c.rank, c.name, c.phone, c.totalOrders, c.totalRevenue, c.avgOrderValue,
        ]),
        [],
        ["Summary"],
        ["Total Customers", data.summary.totalCustomers],
        ["Total Orders", data.summary.totalOrders],
        ["Total Revenue", data.summary.totalRevenue],
        ["Avg Order Value", data.summary.avgOrderValue],
      ];

      // Add per-customer order details sheets
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [
        { wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customer Trends");

      // Individual order detail sheet
      const detailData = [
        ["Customer", "Date", "Order Value"],
        ...data.customers.flatMap(c =>
          c.orders.map(o => [c.name, o.dateLabel, o.total])
        ),
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(detailData);
      ws2["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Order Details");

      XLSX.writeFile(wb, `Customer_Trends_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast.success("Excel exported!");
    } catch (err: any) {
      console.error("Excel export error:", err);
      toast.error("Failed to export Excel");
    } finally { setExporting(null); }
  };

  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      if (!data?.customers) throw new Error("No data to export");
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text(`${APP_CONFIG.restaurant.name}`, 14, 15);
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text("Customer Order Trends Report", 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Top ${topN} by order count`, 14, 28);

      autoTable(doc, {
        startY: 34,
        head: [["#", "Customer", "Phone", "Orders", "Revenue", "Avg Value"]],
        body: data.customers.map(c => [
          c.rank, c.name, c.phone, c.totalOrders,
          formatCurrency(c.totalRevenue), formatCurrency(c.avgOrderValue),
        ]),
        theme: "grid",
        headStyles: { fillColor: [217, 26, 96], textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8.5 },
        alternateRowStyles: { fillColor: [254, 249, 243] },
        margin: { left: 14, right: 14 },
      });

      doc.save(`Customer_Trends_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
      toast.success("PDF exported!");
    } catch (err: any) {
      console.error("PDF export error:", err);
      toast.error("Failed to export PDF");
    } finally { setExporting(null); }
  };

  const summary = data?.summary;
  const customers = data?.customers || [];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#3B82F6" }}>
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Customer Trends</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — Order Value Over Time</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-3 border">
        <Label className="text-xs text-gray-500 mb-2 block font-medium">Time Period & Customers</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-gray-400 mb-0.5 block">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 text-sm">
                <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="60">Last 60 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
                <SelectItem value="180">Last 180 Days</SelectItem>
                <SelectItem value="365">Last 365 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-gray-400 mb-0.5 block">Top Customers</Label>
            <Select value={topN} onValueChange={setTopN}>
              <SelectTrigger className="h-9 text-sm">
                <Users className="w-3.5 h-3.5 mr-1 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Top 3</SelectItem>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="15">Top 15</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom date range */}
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label className="text-[10px] text-gray-400 mb-0.5 block">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-400 mb-0.5 block">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Button
          size="sm"
          className="h-9 text-white w-full mt-2"
          style={{ backgroundColor: BRAND }}
          onClick={handleApplyFilter}
          disabled={loading}
        >
          Apply Filters
        </Button>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-blue-50">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalCustomers}</p>
            <p className="text-[10px] text-gray-500">Active Customers</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-emerald-50">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalOrders}</p>
            <p className="text-[10px] text-gray-500">Total Orders</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-amber-50">
              <DollarSign className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-[15px] font-bold text-gray-900">{formatCurrency(summary.totalRevenue)}</p>
            <p className="text-[10px] text-gray-500">Total Revenue</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-purple-50">
              <BarChart3 className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-[15px] font-bold text-gray-900">{formatCurrency(summary.avgOrderValue)}</p>
            <p className="text-[10px] text-gray-500">Avg Order Value</p>
          </Card>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading trends...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && customers.length === 0 && data && (
        <Card className="p-8 text-center border">
          <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No customers found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting the time period or search query.</p>
        </Card>
      )}

      {/* Customer Trend Cards with Charts */}
      {!loading && customers.map((customer, idx) => {
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        const chartData = customer.orders.map((o, i) => ({
          dateLabel: o.dateLabel || `#${i + 1}`,
          total: o.total,
        }));

        return (
          <Card key={customer.userId || customer.phone || `rank-${customer.rank}`} className="overflow-hidden border">
            {/* Customer header */}
            <div className="p-3.5 pb-2">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0"
                  style={{ backgroundColor: color }}
                >
                  #{customer.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{customer.name}</h3>
                    <Badge className="text-[9px] px-1.5 py-0 text-white shrink-0" style={{ backgroundColor: color }}>
                      {customer.totalOrders} orders
                    </Badge>
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                      <Phone className="w-3 h-3" />
                      <span>{customer.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-2 mt-2.5">
                <div className="flex-1 text-center px-2 py-1.5 rounded-lg bg-gray-50">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Revenue</p>
                  <p className="text-xs font-bold" style={{ color }}>{formatCurrency(customer.totalRevenue)}</p>
                </div>
                <div className="flex-1 text-center px-2 py-1.5 rounded-lg bg-gray-50">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Avg Order</p>
                  <p className="text-xs font-bold text-gray-700">{formatCurrency(customer.avgOrderValue)}</p>
                </div>
                <div className="flex-1 text-center px-2 py-1.5 rounded-lg bg-gray-50">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Orders</p>
                  <p className="text-xs font-bold text-gray-700">{customer.totalOrders}</p>
                </div>
              </div>
            </div>

            {/* Chart */}
            {chartData.length >= 2 ? (
              <div className="px-2 pb-3 -mt-1">
                <MiniSparkline data={chartData} color={color} />
              </div>
            ) : chartData.length === 1 ? (
              <div className="px-3.5 pb-3">
                <div className="text-center py-4 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400">Single order on {chartData[0].dateLabel}</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color }}>{formatCurrency(chartData[0].total)}</p>
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}

      {/* Sticky Export Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button
            className="flex-1 h-11 gap-2 text-white font-medium"
            style={{ backgroundColor: "#217346" }}
            onClick={handleExportExcel}
            disabled={!!exporting || loading || !data?.customers?.length}
          >
            {exporting === "excel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Export Excel
          </Button>
          <Button
            className="flex-1 h-11 gap-2 text-white font-medium"
            style={{ backgroundColor: "#DC2626" }}
            onClick={handleExportPDF}
            disabled={!!exporting || loading || !data?.customers?.length}
          >
            {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}