/**
 * ProductsSoldReport — Products Sold / Menu Performance report.
 * Aggregates product data from orders, ranked by quantity sold.
 * Includes date range filter, category filter, search, pagination, and Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  UtensilsCrossed, ShoppingCart, TrendingUp, Search, Calendar,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Package,
  Loader2, ArrowUpDown, Crown, Hash, DollarSign, Tag,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { format } from "date-fns";
import { ImageWithFallback } from "./figma/ImageWithFallback";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

// Medal colors for top 3
const MEDAL_STYLES: Record<number, { bg: string; border: string; text: string; icon: string }> = {
  1: { bg: "linear-gradient(135deg, #FFF9E6 0%, #FFE999 100%)", border: "#FFD700", text: "#92700C", icon: "#FFD700" },
  2: { bg: "linear-gradient(135deg, #F5F5F5 0%, #D4D4D4 100%)", border: "#C0C0C0", text: "#5A5A5A", icon: "#C0C0C0" },
  3: { bg: "linear-gradient(135deg, #FFF0E6 0%, #FFDAB9 100%)", border: "#CD7F32", text: "#7C4A1E", icon: "#CD7F32" },
};

interface ProductRow {
  rank: number;
  itemId: string;
  name: string;
  category: string;
  image: string;
  price: number;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
  lastSoldDate: string;
}

interface ReportData {
  products: ProductRow[];
  summary: {
    totalProducts: number;
    totalSold: number;
    totalRevenue: number;
    totalOrders: number;
  };
  categories: string[];
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allProducts?: ProductRow[];
}

interface Props {
  customToken: string | null;
}

export function ProductsSoldReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("quantity");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "10",
        sortBy,
        category,
        ...(search && { search }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetch(`${API_BASE}/reports/product-analytics?${params}`, {
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
      console.error("Products report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, startDate, endDate, sortBy, category]);

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
      if (!result?.allProducts) throw new Error("No data to export");

      const XLSX = await import("xlsx");
      const wsData = [
        [`Products Sold by ${APP_CONFIG.restaurant.name}`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        ...(startDate || endDate ? [`Period: ${startDate || "All"} to ${endDate || "All"}`] : []),
        ...(category !== "all" ? [`Category: ${category}`] : []),
        [],
        ["Rank", "Product Name", "Category", "Unit Price", "Qty Sold", "Total Revenue", "Orders", "Last Sold"],
        ...result.allProducts.map(p => [
          p.rank,
          p.name,
          p.category,
          p.price,
          p.totalQuantity,
          p.totalRevenue,
          p.orderCount,
          p.lastSoldDate ? format(new Date(p.lastSoldDate), "dd MMM yyyy") : "-",
        ]),
        [],
        ["Summary"],
        ["Total Products", result.summary.totalProducts],
        ["Total Items Sold", result.summary.totalSold],
        ["Total Revenue", result.summary.totalRevenue],
        ["Total Orders", result.summary.totalOrders],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [
        { wch: 6 }, { wch: 30 }, { wch: 18 }, { wch: 14 },
        { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 14 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products Sold");
      XLSX.writeFile(wb, `Products_Sold_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
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
      if (!result?.allProducts) throw new Error("No data to export");

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Title
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text(`Products Sold by ${APP_CONFIG.restaurant.name}`, 14, 15);
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text("Menu Performance Report", 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);
      let nextY = 33;
      if (startDate || endDate) {
        doc.text(`Period: ${startDate || "All"} to ${endDate || "All"}`, 14, nextY);
        nextY += 5;
      }
      if (category !== "all") {
        doc.text(`Category: ${category}`, 14, nextY);
        nextY += 5;
      }

      // Summary
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(
        `Total Products: ${result.summary.totalProducts}  |  Total Sold: ${result.summary.totalSold}  |  Total Revenue: ${formatCurrency(result.summary.totalRevenue)}`,
        14, nextY
      );

      // Table
      autoTable(doc, {
        startY: nextY + 5,
        head: [["#", "Product", "Category", "Unit Price", "Qty Sold", "Revenue", "Orders", "Last Sold"]],
        body: result.allProducts.map(p => [
          p.rank,
          p.name,
          p.category,
          formatCurrency(p.price),
          p.totalQuantity,
          formatCurrency(p.totalRevenue),
          p.orderCount,
          p.lastSoldDate ? format(new Date(p.lastSoldDate), "dd MMM yyyy") : "-",
        ]),
        theme: "grid",
        headStyles: { fillColor: [217, 26, 96], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [252, 248, 250] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 50 },
          2: { cellWidth: 28 },
          3: { cellWidth: 25, halign: "right" },
          4: { cellWidth: 18, halign: "center" },
          5: { cellWidth: 28, halign: "right" },
          6: { cellWidth: 18, halign: "center" },
          7: { cellWidth: 25, halign: "center" },
        },
        margin: { left: 14, right: 14 },
      });

      doc.save(`Products_Sold_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
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
  const products = data?.products || [];
  const categories = data?.categories || [];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: BRAND }}>
          <UtensilsCrossed className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Products Sold</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — Menu Performance</p>
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

      {/* Search + Category + Sort */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by product name or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Select value={category} onValueChange={(v) => setCategory(v)}>
            <SelectTrigger className="flex-1 h-9 text-sm">
              <Tag className="w-3.5 h-3.5 mr-1 text-gray-400" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v)}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-gray-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quantity">Qty Sold</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-2.5 border text-center">
            <div className="w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center" style={{ backgroundColor: BRAND + "15" }}>
              <Package className="w-3.5 h-3.5" style={{ color: BRAND }} />
            </div>
            <p className="text-base font-bold text-gray-900">{summary.totalProducts}</p>
            <p className="text-[9px] text-gray-500 leading-tight">Products</p>
          </Card>
          <Card className="p-2.5 border text-center">
            <div className="w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center bg-orange-50">
              <Hash className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <p className="text-base font-bold text-gray-900">{summary.totalSold}</p>
            <p className="text-[9px] text-gray-500 leading-tight">Items Sold</p>
          </Card>
          <Card className="p-2.5 border text-center">
            <div className="w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center bg-emerald-50">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <p className="text-[13px] font-bold text-gray-900">{formatCurrency(summary.totalRevenue)}</p>
            <p className="text-[9px] text-gray-500 leading-tight">Revenue</p>
          </Card>
          <Card className="p-2.5 border text-center">
            <div className="w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center bg-blue-50">
              <ShoppingCart className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <p className="text-base font-bold text-gray-900">{summary.totalOrders}</p>
            <p className="text-[9px] text-gray-500 leading-tight">Orders</p>
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

      {/* Empty state */}
      {!loading && products.length === 0 && data && (
        <Card className="p-8 text-center border">
          <UtensilsCrossed className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No products found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or date range</p>
        </Card>
      )}

      {/* Product Cards */}
      {!loading && products.map((product) => {
        const isTop3 = product.rank <= 3;
        const medalStyle = MEDAL_STYLES[product.rank];

        return (
          <Card
            key={product.itemId || product.rank}
            className="overflow-hidden border"
            style={isTop3 ? {
              background: medalStyle.bg,
              borderColor: medalStyle.border,
              borderWidth: "1.5px",
            } : undefined}
          >
            <div className="p-3.5">
              {/* Top row: Image + Name + Category */}
              <div className="flex items-start gap-3">
                {/* Rank badge */}
                <div className="relative shrink-0">
                  {/* Product image */}
                  <div
                    className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center"
                    style={isTop3 ? {
                      border: `2px solid ${medalStyle.icon}`,
                    } : {
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    {product.image ? (
                      <ImageWithFallback
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UtensilsCrossed className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  {/* Rank overlay */}
                  <div
                    className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm"
                    style={isTop3 ? {
                      backgroundColor: medalStyle.icon,
                      color: "#FFFFFF",
                    } : {
                      backgroundColor: "#F3F4F6",
                      color: "#6B7280",
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    {isTop3 ? (
                      <Crown className="w-3 h-3" />
                    ) : (
                      product.rank
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">
                      {isTop3 && <span className="mr-1">#{product.rank}</span>}
                      {product.name}
                    </h3>
                    {/* Top 3 badges */}
                    {isTop3 && (
                      <Badge
                        className="text-[9px] px-1.5 py-0 font-semibold shrink-0 text-white"
                        style={{ backgroundColor: medalStyle.icon }}
                      >
                        <Crown className="w-2.5 h-2.5 mr-0.5" />
                        {product.rank === 1 ? "Best Seller" : product.rank === 2 ? "2nd Best" : "3rd Best"}
                      </Badge>
                    )}
                  </div>

                  {/* Category badge */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 border-gray-300 text-gray-500 font-medium"
                    >
                      <Tag className="w-2.5 h-2.5 mr-0.5" />
                      {product.category}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {formatCurrency(product.price)}/pcs
                    </span>
                  </div>

                  {/* Quantity sold - prominent */}
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-lg font-bold" style={{ color: BRAND }}>
                      {product.totalQuantity}
                    </span>
                    <span className="text-xs text-gray-500">sold</span>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Revenue</p>
                  <p className="text-sm font-bold" style={{ color: BRAND }}>{formatCurrency(product.totalRevenue)}</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Orders</p>
                  <p className="text-sm font-bold text-gray-800">{product.orderCount}</p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">Last Sold</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {product.lastSoldDate
                      ? format(new Date(product.lastSoldDate), "dd MMM yy")
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
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} products)
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
            disabled={!!exporting || loading || !data?.products?.length}
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
            disabled={!!exporting || loading || !data?.products?.length}
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
