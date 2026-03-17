/**
 * MenuCatalogReport — Full menu catalog report showing all menu items
 * across all menu types with price, category, active/inactive status.
 * Includes search, filters, pagination, and Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  ClipboardList, Search, RefreshCw, Package, Loader2,
  ArrowUpDown, CheckCircle2, XCircle, Tag, Layers,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { format } from "date-fns";
import { ImageWithFallback } from "./figma/ImageWithFallback";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  menuType: string;
  isActive: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface ReportData {
  items: MenuItem[];
  allItems?: MenuItem[];
  summary: {
    totalItems: number;
    activeItems: number;
    inactiveItems: number;
    totalCategories: number;
    filteredCount: number;
    menuTypeCounts: Record<string, number>;
  };
  categories: string[];
  menuTypes: string[];
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
}

interface Props {
  customToken: string | null;
}

// Menu type color badges
const MENU_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  "Regular Menu": { bg: "#EFF6FF", text: "#1D4ED8" },
  "Kids Menu": { bg: "#FFF7ED", text: "#C2410C" },
  "Today's Special": { bg: "#F0FDF4", text: "#15803D" },
  "Flash Sale": { bg: "#FEF2F2", text: "#DC2626" },
};

export function MenuCatalogReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [menuType, setMenuType] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "20",
        sortBy,
        menuType,
        category,
        status,
        ...(search && { search }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetchWithRetry(`${API_BASE}/reports/menu-catalog?${params}`, {
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
      console.error("Menu catalog report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, menuType, category, status, sortBy]);

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
      if (!result?.allItems) throw new Error("No data to export");

      const XLSX = await import("xlsx");
      const wsData = [
        [`Menu Catalog - ${APP_CONFIG.restaurant.name}`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        ...(menuType !== "all" ? [`Menu Type: ${menuType}`] : []),
        ...(category !== "all" ? [`Category: ${category}`] : []),
        ...(status !== "all" ? [`Status: ${status === "active" ? "Active" : "Inactive"}`] : []),
        [],
        ["#", "Item Name", "Category", "Menu Type", "Price", "Status", "Description"],
        ...result.allItems.map((item, idx) => [
          idx + 1,
          item.name,
          item.category,
          item.menuType,
          item.price,
          item.isActive ? "Active" : "Inactive",
          item.description || "-",
        ]),
        [],
        ["Summary"],
        ["Total Items", result.summary.totalItems],
        ["Active Items", result.summary.activeItems],
        ["Inactive Items", result.summary.inactiveItems],
        ["Total Categories", result.summary.totalCategories],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [
        { wch: 5 }, { wch: 35 }, { wch: 18 }, { wch: 16 },
        { wch: 14 }, { wch: 10 }, { wch: 40 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Menu Catalog");
      XLSX.writeFile(wb, `Menu_Catalog_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
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
      if (!result?.allItems) throw new Error("No data to export");

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text(`Menu Catalog - ${APP_CONFIG.restaurant.name}`, 14, 15);
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text("Complete Menu Item Listing", 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);
      let nextY = 33;
      doc.text(
        `Total: ${result.summary.totalItems} items  |  Active: ${result.summary.activeItems}  |  Inactive: ${result.summary.inactiveItems}  |  Categories: ${result.summary.totalCategories}`,
        14, nextY
      );

      autoTable(doc, {
        startY: nextY + 5,
        head: [["#", "Item Name", "Category", "Menu Type", "Price", "Status"]],
        body: result.allItems.map((item, idx) => [
          idx + 1,
          item.name,
          item.category,
          item.menuType,
          formatCurrency(item.price),
          item.isActive ? "Active" : "Inactive",
        ]),
        theme: "grid",
        headStyles: { fillColor: [217, 26, 96], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [252, 248, 250] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 60 },
          2: { cellWidth: 30 },
          3: { cellWidth: 28 },
          4: { cellWidth: 25, halign: "right" },
          5: { cellWidth: 20, halign: "center" },
        },
        margin: { left: 14, right: 14 },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 5) {
            if (data.cell.raw === "Inactive") {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            } else {
              data.cell.styles.textColor = [22, 163, 74];
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      });

      doc.save(`Menu_Catalog_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
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
  const items = data?.items || [];
  const categories = data?.categories || [];
  const menuTypes = data?.menuTypes || [];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: BRAND }}>
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Menu Catalog</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — All Menu Items</p>
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

      {/* Search + Filters */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by item name, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Select value={menuType} onValueChange={(v) => setMenuType(v)}>
            <SelectTrigger className="flex-1 h-9 text-sm">
              <Layers className="w-3.5 h-3.5 mr-1 text-gray-400" />
              <SelectValue placeholder="All Menu Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Menu Types</SelectItem>
              {menuTypes.map(mt => (
                <SelectItem key={mt} value={mt}>{mt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v)}>
            <SelectTrigger className="w-[120px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
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
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="price">Price (Low)</SelectItem>
              <SelectItem value="price_desc">Price (High)</SelectItem>
              <SelectItem value="category">Category</SelectItem>
              <SelectItem value="menuType">Menu Type</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className="h-9 px-4 text-white w-full"
          style={{ backgroundColor: BRAND }}
          onClick={handleApplyFilter}
          disabled={loading}
        >
          Apply Filters
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-2.5 border text-center">
            <div className="w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center" style={{ backgroundColor: BRAND + "15" }}>
              <Package className="w-3.5 h-3.5" style={{ color: BRAND }} />
            </div>
            <p className="text-base font-bold text-gray-900">{summary.totalItems}</p>
            <p className="text-[9px] text-gray-500 leading-tight">Total Items</p>
          </Card>
          <Card className="p-2.5 border text-center">
            <div className="w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center bg-emerald-50">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <p className="text-base font-bold text-emerald-700">{summary.activeItems}</p>
            <p className="text-[9px] text-gray-500 leading-tight">Active</p>
          </Card>
          <Card className="p-2.5 border text-center">
            <div className="w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center bg-red-50">
              <XCircle className="w-3.5 h-3.5 text-red-500" />
            </div>
            <p className="text-base font-bold text-red-600">{summary.inactiveItems}</p>
            <p className="text-[9px] text-gray-500 leading-tight">Inactive</p>
          </Card>
          <Card className="p-2.5 border text-center">
            <div className="w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center bg-blue-50">
              <Tag className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <p className="text-base font-bold text-gray-900">{summary.totalCategories}</p>
            <p className="text-[9px] text-gray-500 leading-tight">Categories</p>
          </Card>
        </div>
      )}

      {/* Menu Type Breakdown */}
      {summary && summary.menuTypeCounts && Object.keys(summary.menuTypeCounts).length > 0 && (
        <Card className="p-3 border">
          <p className="text-xs font-medium text-gray-500 mb-2">By Menu Type</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.menuTypeCounts).map(([type, count]) => {
              const colors = MENU_TYPE_COLORS[type] || { bg: "#F3F4F6", text: "#374151" };
              return (
                <Badge
                  key={type}
                  className="text-xs px-2.5 py-1 font-medium"
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                >
                  {type}: {count}
                </Badge>
              );
            })}
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
      {!loading && items.length === 0 && data && (
        <Card className="p-8 text-center border">
          <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No menu items found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
        </Card>
      )}

      {/* Filtered count */}
      {!loading && summary && summary.filteredCount !== summary.totalItems && (
        <p className="text-xs text-gray-500">
          Showing {summary.filteredCount} of {summary.totalItems} items (filtered)
        </p>
      )}

      {/* Item Cards */}
      {!loading && items.map((item) => {
        const typeColors = MENU_TYPE_COLORS[item.menuType] || { bg: "#F3F4F6", text: "#374151" };

        return (
          <Card
            key={item.id}
            className={`overflow-hidden border ${!item.isActive ? "opacity-70" : ""}`}
          >
            <div className="p-3.5">
              <div className="flex items-start gap-3">
                {/* Image */}
                <div
                  className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0"
                  style={{ border: "1px solid #E5E7EB" }}
                >
                  {item.image ? (
                    <ImageWithFallback
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UtensilsCrossed className="w-6 h-6 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Name */}
                  <h3 className="font-semibold text-gray-900 text-sm truncate">
                    {item.name}
                  </h3>

                  {/* Badges row */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {/* Category badge */}
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 border-gray-300 text-gray-500 font-medium"
                    >
                      <Tag className="w-2.5 h-2.5 mr-0.5" />
                      {item.category}
                    </Badge>
                    {/* Menu Type badge */}
                    <Badge
                      className="text-[9px] px-1.5 py-0 font-medium"
                      style={{ backgroundColor: typeColors.bg, color: typeColors.text }}
                    >
                      {item.menuType}
                    </Badge>
                    {/* Active/Inactive badge */}
                    {item.isActive ? (
                      <Badge className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                        Active
                      </Badge>
                    ) : (
                      <Badge className="text-[9px] px-1.5 py-0 bg-red-100 text-red-600 font-medium">
                        <XCircle className="w-2.5 h-2.5 mr-0.5" />
                        Inactive
                      </Badge>
                    )}
                  </div>

                  {/* Price */}
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-lg font-bold" style={{ color: BRAND }}>
                      {formatCurrency(item.price)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description if exists */}
              {item.description && (
                <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                  {item.description}
                </p>
              )}
            </div>
          </Card>
        );
      })}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} items)
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
            disabled={!!exporting || loading || !data?.items?.length}
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
            disabled={!!exporting || loading || !data?.items?.length}
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
