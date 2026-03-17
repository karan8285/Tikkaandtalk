/**
 * RatingFeedbackReport — Low Rating / All Rating Feedback report.
 * Shows rated orders with star display, customer info, comments,
 * WhatsApp reply button, rating distribution bar, date & rating filters,
 * search, pagination, and Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Star, MessageSquare, Search, Calendar, Phone,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Loader2,
  ArrowUpDown, MessageCircle, ThumbsDown, ThumbsUp,
  BarChart3, Hash,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

const STAR_COLORS: Record<number, string> = {
  1: "#EF4444",
  2: "#F97316",
  3: "#EAB308",
  4: "#84CC16",
  5: "#22C55E",
};

const STAR_BG: Record<number, string> = {
  1: "#FEF2F2",
  2: "#FFF7ED",
  3: "#FEFCE8",
  4: "#F7FEE7",
  5: "#F0FDF4",
};

const STAR_BORDER: Record<number, string> = {
  1: "#FECACA",
  2: "#FED7AA",
  3: "#FDE68A",
  4: "#BEF264",
  5: "#BBF7D0",
};

/** Derive short order ID from orderNumber (e.g. TNT00000102 -> TNT-102) */
function getShortOrderId(orderNumber: string): string {
  if (!orderNumber) return "";
  const prefix = APP_CONFIG.restaurant.orderPrefix || "TNT";
  const numPart = orderNumber.replace(prefix, "");
  const num = parseInt(numPart, 10);
  if (isNaN(num)) return orderNumber;
  return `${prefix}-${String(num).padStart(3, "0")}`;
}

interface RatedOrder {
  rank: number;
  orderId: string;
  orderNumber: string;
  userId: string | null;
  name: string;
  phone: string;
  rating: number;
  comment: string;
  ratingAt: string;
  orderDate: string;
  total: number;
  items: string[];
  status: string;
  orderType: string;
}

interface ReportData {
  orders: RatedOrder[];
  summary: {
    totalRated: number;
    avgRating: number;
    ratingDistribution: Record<number, number>;
    withComments: number;
  };
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allOrders?: RatedOrder[];
}

interface Props {
  customToken: string | null;
}

function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={s <= rating ? "fill-current" : ""}
          style={{
            width: size,
            height: size,
            color: s <= rating ? (STAR_COLORS[rating] || "#EAB308") : "#D1D5DB",
          }}
        />
      ))}
    </div>
  );
}

export function RatingFeedbackReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "10",
        sortBy,
        ratingFilter,
        ...(search && { search }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetch(`${API_BASE}/reports/rating-feedback?${params}`, {
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
      console.error("Rating report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, sortBy, ratingFilter, dateFrom, dateTo]);

  const loadPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    const result = await fetchReport(pageNum);
    if (result) {
      setData(result);
      setPage(result.pagination.page);
    }
    setLoading(false);
  }, [fetchReport]);

  useEffect(() => { loadPage(1); }, []);

  const handleApplyFilter = () => { setPage(1); loadPage(1); };

  const openWhatsApp = (phone: string, name: string, orderNumber: string) => {
    const cleanPhone = phone.replace(/[^0-9+]/g, "");
    const waNumber = cleanPhone.startsWith("+") ? cleanPhone.substring(1) : cleanPhone;
    const displayOrder = orderNumber || "N/A";
    const message = encodeURIComponent(
      `Hi ${name}, thank you for your recent order (${displayOrder}) at ${APP_CONFIG.restaurant.name}. We noticed your feedback and would love to hear more about how we can improve your experience. Is there anything we can help with?`
    );
    window.open(`https://wa.me/${waNumber}?text=${message}`, "_blank");
  };

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allOrders) throw new Error("No data to export");
      const XLSX = await import("xlsx");
      const wsData = [
        [`${APP_CONFIG.restaurant.name} — Rating Feedback Report`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        [`Filter: ${ratingFilter === "all" ? "All Ratings" : ratingFilter}`],
        [],
        ["#", "Customer", "Phone", "Rating", "Comment", "Order Total", "Order Date", "Order ID", "Items"],
        ...result.allOrders.map(o => [
          o.rank,
          o.name,
          o.phone,
          `${o.rating}/5`,
          o.comment || "-",
          o.total,
          o.orderDate ? format(new Date(o.orderDate), "dd MMM yyyy HH:mm") : "-",
          o.orderNumber ? getShortOrderId(o.orderNumber) : o.orderId.slice(-8),
          o.items.join(", "),
        ]),
        [],
        ["Summary"],
        ["Total Rated Orders", result.summary.totalRated],
        ["Average Rating", result.summary.avgRating],
        ["With Comments", result.summary.withComments],
        ...Object.entries(result.summary.ratingDistribution).map(([k, v]) => [`${k} Star`, v]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [
        { wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 8 }, { wch: 40 },
        { wch: 15 }, { wch: 20 }, { wch: 16 }, { wch: 40 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rating Feedback");
      XLSX.writeFile(wb, `Rating_Feedback_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast.success("Excel exported!");
    } catch (err: any) {
      console.error("Excel export error:", err);
      toast.error("Failed to export Excel");
    } finally { setExporting(null); }
  };

  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allOrders) throw new Error("No data to export");
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text(`${APP_CONFIG.restaurant.name}`, 14, 15);
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text("Rating Feedback Report", 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Avg: ${result.summary.avgRating}/5 | Total: ${result.summary.totalRated} ratings`, 14, 28);

      autoTable(doc, {
        startY: 34,
        head: [["#", "Customer", "Phone", "Rating", "Comment", "Total", "Date", "Order ID"]],
        body: result.allOrders.map(o => [
          o.rank,
          o.name,
          o.phone,
          `${o.rating}/5`,
          (o.comment || "-").substring(0, 60),
          formatCurrency(o.total),
          o.orderDate ? format(new Date(o.orderDate), "dd MMM yy") : "-",
          o.orderNumber ? getShortOrderId(o.orderNumber) : o.orderId.slice(-8),
        ]),
        theme: "grid",
        headStyles: { fillColor: [217, 26, 96], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [254, 249, 243] },
        margin: { left: 14, right: 14 },
      });

      doc.save(`Rating_Feedback_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
      toast.success("PDF exported!");
    } catch (err: any) {
      console.error("PDF export error:", err);
      toast.error("Failed to export PDF");
    } finally { setExporting(null); }
  };

  const pagination = data?.pagination;
  const summary = data?.summary;
  const orders = data?.orders || [];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#EAB308" }}>
          <Star className="w-5 h-5 text-white fill-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Rating Feedback</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — Order Ratings & Reviews</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1" onClick={() => loadPage(page)} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Date Range */}
      <Card className="p-3 border">
        <Label className="text-xs text-gray-500 mb-2 block font-medium">Date Range</Label>
        <div className="grid grid-cols-2 gap-2">
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
      </Card>

      {/* Search + Filters */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search name, phone, comment, order ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="flex-1 h-9 text-sm">
              <Star className="w-3.5 h-3.5 mr-1 text-yellow-500 fill-yellow-500" />
              <SelectValue placeholder="All Ratings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ratings</SelectItem>
              <SelectItem value="5">5 Stars Only</SelectItem>
              <SelectItem value="4">4 Stars Only</SelectItem>
              <SelectItem value="3">3 Stars Only</SelectItem>
              <SelectItem value="2">2 Stars Only</SelectItem>
              <SelectItem value="1">1 Star Only</SelectItem>
              <SelectItem value="lt4">Less than 4</SelectItem>
              <SelectItem value="lt3">Less than 3</SelectItem>
              <SelectItem value="lt2">Less than 2</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-gray-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Newest</SelectItem>
              <SelectItem value="rating">Lowest First</SelectItem>
              <SelectItem value="total">Highest Total</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className="h-9 text-white w-full"
          style={{ backgroundColor: BRAND }}
          onClick={handleApplyFilter}
          disabled={loading}
        >
          Apply Filters
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-yellow-50">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalRated}</p>
            <p className="text-[10px] text-gray-500">Total Ratings</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-amber-50">
              <BarChart3 className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-lg font-bold" style={{ color: STAR_COLORS[Math.round(summary.avgRating)] || "#EAB308" }}>
              {summary.avgRating}/5
            </p>
            <p className="text-[10px] text-gray-500">Average Rating</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-blue-50">
              <MessageSquare className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.withComments}</p>
            <p className="text-[10px] text-gray-500">With Comments</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-red-50">
              <ThumbsDown className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-lg font-bold text-red-600">
              {(summary.ratingDistribution[1] || 0) + (summary.ratingDistribution[2] || 0)}
            </p>
            <p className="text-[10px] text-gray-500">Low Ratings (1-2)</p>
          </Card>
        </div>
      )}

      {/* Rating Distribution Bar */}
      {summary && summary.totalRated > 0 && (
        <Card className="p-3 border">
          <p className="text-xs font-medium text-gray-600 mb-2">Rating Distribution</p>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map(star => {
              const count = summary.ratingDistribution[star] || 0;
              const pct = summary.totalRated > 0 ? (count / summary.totalRated) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 w-10 shrink-0">
                    <span className="text-xs font-medium text-gray-600">{star}</span>
                    <Star className="w-3 h-3 fill-current" style={{ color: STAR_COLORS[star] }} />
                  </div>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: STAR_COLORS[star] }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-10 text-right">{count} ({Math.round(pct)}%)</span>
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
          <span className="ml-2 text-sm text-gray-500">Loading ratings...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && orders.length === 0 && data && (
        <Card className="p-8 text-center border">
          <Star className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No rated orders found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or date range.</p>
        </Card>
      )}

      {/* Order Cards */}
      {!loading && orders.map((order) => {
        const starColor = STAR_COLORS[order.rating] || "#EAB308";
        const starBg = STAR_BG[order.rating] || "#FEFCE8";
        const starBorder = STAR_BORDER[order.rating] || "#FDE68A";

        return (
          <Card
            key={order.orderId || order.rank}
            className="overflow-hidden"
            style={{
              borderColor: starBorder,
              borderWidth: "1.5px",
              borderLeftWidth: "4px",
              borderLeftColor: starColor,
            }}
          >
            <div className="p-3.5">
              {/* Top: rank + name + stars + badge */}
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ backgroundColor: starBg, color: starColor, border: `2px solid ${starBorder}` }}
                >
                  #{order.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{order.name}</h3>
                    <Badge
                      className="text-[9px] px-1.5 py-0 font-bold shrink-0"
                      style={{ backgroundColor: starBg, color: starColor, borderColor: starBorder, borderWidth: "1px" }}
                    >
                      {order.rating}/5
                    </Badge>
                  </div>

                  {/* Stars */}
                  <div className="mt-1">
                    <StarDisplay rating={order.rating} size={16} />
                  </div>

                  {/* Phone */}
                  {order.phone && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <Phone className="w-3 h-3" />
                      <span>{order.phone}</span>
                    </div>
                  )}

                  {/* Comment */}
                  {order.comment && (
                    <div
                      className="mt-2 p-2 rounded-lg text-xs text-gray-700 italic leading-relaxed"
                      style={{ backgroundColor: starBg }}
                    >
                      <MessageSquare className="w-3 h-3 inline mr-1 opacity-50" />
                      "{order.comment}"
                    </div>
                  )}

                  {/* Items ordered */}
                  {order.items.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {order.items.slice(0, 4).map((item, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 text-gray-500 border-gray-200">
                          {item}
                        </Badge>
                      ))}
                      {order.items.length > 4 && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-gray-400 border-gray-200">
                          +{order.items.length - 4} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats + WhatsApp */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-gray-400">Order Total</p>
                  <p className="text-sm font-bold" style={{ color: BRAND }}>{formatCurrency(order.total)}</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-gray-400">Date</p>
                  <p className="text-[11px] font-semibold text-gray-700">
                    {order.orderDate ? format(new Date(order.orderDate), "dd MMM yy") : "-"}
                  </p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1">
                  {order.phone ? (
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs font-medium text-white gap-1"
                      style={{ backgroundColor: "#25D366" }}
                      onClick={() => openWhatsApp(order.phone, order.name, order.orderNumber)}
                    >
                      <MessageCircle className="w-3 h-3" />
                      WhatsApp
                    </Button>
                  ) : (
                    <p className="text-[10px] text-gray-400 text-center">No phone</p>
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
          <p className="text-xs text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} ratings)
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page <= 1 || loading} onClick={() => loadPage(1)}>
              <ChevronsLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page <= 1 || loading} onClick={() => loadPage(pagination.page - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-medium px-2 text-gray-700">{pagination.page}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => loadPage(pagination.page + 1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => loadPage(pagination.totalPages)}>
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
            disabled={!!exporting || loading || !data?.orders?.length}
          >
            {exporting === "excel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Export Excel
          </Button>
          <Button
            className="flex-1 h-11 gap-2 text-white font-medium"
            style={{ backgroundColor: "#DC2626" }}
            onClick={handleExportPDF}
            disabled={!!exporting || loading || !data?.orders?.length}
          >
            {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}