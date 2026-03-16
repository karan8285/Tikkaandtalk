/**
 * CustomerPaymentReport — Customer Payment Report with payment status filter.
 * Shows orders with name, phone, order ID, date, amount, payment status.
 * Features: status filter (All/Paid/Not Paid), search by name & phone,
 * date range, server-side pagination, Excel/PDF export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  CreditCard, Search, Calendar, Phone, User,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Loader2,
  DollarSign, AlertCircle, CheckCircle2, Hash,
  Filter, Banknote, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface PaymentOrder {
  rank: number;
  orderId: string;
  orderNumber: string;
  name: string;
  phone: string;
  total: number;
  orderDate: string;
  paymentStatus: string;
  paymentMethod: string;
  paymentReceived: boolean;
  orderType: string;
}

interface ReportData {
  orders: PaymentOrder[];
  summary: {
    totalOrders: number;
    totalPaid: number;
    totalUnpaid: number;
    totalRevenue: number;
    totalUnpaidAmount: number;
    totalPaidAmount: number;
  };
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allOrders?: PaymentOrder[];
}

interface Props {
  customToken: string | null;
}

/** Derive short order ID from orderNumber (e.g. TNT00000102 -> TNT-102) */
function getShortOrderId(orderNumber: string): string {
  if (!orderNumber) return "";
  const prefix = APP_CONFIG.restaurant.orderPrefix || "TNT";
  const numPart = orderNumber.replace(prefix, "");
  const num = parseInt(numPart, 10);
  if (isNaN(num)) return orderNumber;
  return `${prefix}-${String(num).padStart(3, "0")}`;
}

export function CustomerPaymentReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState("unpaid");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const combinedSearch = [searchName, searchPhone].filter(Boolean).join(" ");
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "10",
        statusFilter,
        ...(combinedSearch && { search: combinedSearch }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetch(`${API_BASE}/reports/customer-payment?${params}`, {
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
      console.error("Payment report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, searchName, searchPhone, statusFilter, dateFrom, dateTo]);

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

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allOrders) throw new Error("No data to export");
      const XLSX = await import("xlsx");
      const wsData = [
        [`${APP_CONFIG.restaurant.name} — Customer Payment Report`],
        [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
        [`Filter: ${statusFilter === "all" ? "All" : statusFilter === "paid" ? "Paid" : "Not Paid"}`],
        [],
        ["#", "Name", "Phone", "Order ID", "Order Date", "Amount", "Payment Status", "Payment Method"],
        ...result.allOrders.map(o => [
          o.rank,
          o.name,
          o.phone,
          o.orderNumber ? getShortOrderId(o.orderNumber) : o.orderId.slice(-8),
          o.orderDate ? format(new Date(o.orderDate), "dd/MM/yyyy") : "-",
          o.total,
          o.paymentStatus === "paid" ? "Paid" : "Not Paid",
          o.paymentMethod,
        ]),
        [],
        ["Summary"],
        ["Total Orders", result.summary.totalOrders],
        ["Total Paid", result.summary.totalPaid],
        ["Total Unpaid", result.summary.totalUnpaid],
        ["Total Revenue", result.summary.totalRevenue],
        ["Unpaid Amount", result.summary.totalUnpaidAmount],
        ["Paid Amount", result.summary.totalPaidAmount],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [
        { wch: 5 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
        { wch: 15 }, { wch: 14 }, { wch: 14 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payment Report");
      XLSX.writeFile(wb, `Customer_Payment_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
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
      doc.text("Customer Payment Report", 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Paid: ${result.summary.totalPaid} | Unpaid: ${result.summary.totalUnpaid}`, 14, 28);

      autoTable(doc, {
        startY: 34,
        head: [["#", "Name", "Phone", "Order ID", "Order Date", "Amount", "Status", "Method"]],
        body: result.allOrders.map(o => [
          o.rank,
          o.name,
          o.phone,
          o.orderNumber ? getShortOrderId(o.orderNumber) : o.orderId.slice(-8),
          o.orderDate ? format(new Date(o.orderDate), "dd/MM/yyyy") : "-",
          formatCurrency(o.total),
          o.paymentStatus === "paid" ? "Paid" : "Not Paid",
          o.paymentMethod,
        ]),
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
        didParseCell: (data: any) => {
          // Color the Status column
          if (data.section === "body" && data.column.index === 6) {
            if (data.cell.raw === "Not Paid") {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            } else {
              data.cell.styles.textColor = [22, 163, 74];
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      });

      doc.save(`Customer_Payment_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
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
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#1E293B" }}>
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Customer Payment Report</h2>
          <p className="text-xs text-gray-500">{APP_CONFIG.restaurant.name} — Payment Status Tracking</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1" onClick={() => loadPage(page)} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Status Filter Pill */}
      <div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); }}>
          <SelectTrigger className="w-auto h-9 text-sm font-medium text-white gap-1 border-0" style={{ backgroundColor: "#1E293B" }}>
            <Filter className="w-3.5 h-3.5" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Not Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Search by Name & Phone */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            placeholder="Search by Name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="h-9 text-sm"
          />
        </div>
        <div className="flex-1 relative">
          <Input
            placeholder="Search by Phone"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
            className="h-9 text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleApplyFilter}
          disabled={loading}
        >
          <Search className="w-4 h-4" />
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
              <Receipt className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{summary.totalOrders}</p>
            <p className="text-[10px] text-gray-500">Total Orders</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-red-50">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-lg font-bold text-red-600">{summary.totalUnpaid}</p>
            <p className="text-[10px] text-gray-500">Unpaid Orders</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-green-50">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-lg font-bold text-green-600">{formatCurrency(summary.totalPaidAmount)}</p>
            <p className="text-[10px] text-gray-500">Paid Amount</p>
          </Card>
          <Card className="p-3 border text-center">
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-amber-50">
              <Banknote className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-lg font-bold text-amber-600">{formatCurrency(summary.totalUnpaidAmount)}</p>
            <p className="text-[10px] text-gray-500">Unpaid Amount</p>
          </Card>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading payment data...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && orders.length === 0 && data && (
        <Card className="p-8 text-center border">
          <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No orders found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or date range.</p>
        </Card>
      )}

      {/* Table View — matching the image design */}
      {!loading && orders.length > 0 && (
        <Card className="border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-700">Name</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-700">Phone Number</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-700">Order ID</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-700">Order Date</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-700">Amount</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isPaid = order.paymentStatus === "paid";
                  const displayOrderId = order.orderNumber
                    ? getShortOrderId(order.orderNumber)
                    : order.orderId.slice(-8);

                  return (
                    <tr key={order.orderId || order.rank} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">{order.name}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{order.phone || "-"}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap font-mono">{displayOrderId}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                        {order.orderDate ? format(new Date(order.orderDate), "dd/MM/yyyy") : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-gray-900 text-right whitespace-nowrap">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className={`text-xs font-semibold ${isPaid ? "text-green-600" : "text-red-600"}`}>
                          {isPaid ? "Paid" : "Not Paid"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-gray-500 text-xs"
            disabled={pagination.page <= 1 || loading}
            onClick={() => loadPage(pagination.page - 1)}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </Button>

          <div className="flex items-center gap-1">
            <Select
              value={String(pagination.page)}
              onValueChange={(v) => loadPage(parseInt(v, 10))}
            >
              <SelectTrigger className="h-8 text-xs w-auto min-w-[120px] border-gray-300">
                <SelectValue>Page {pagination.page} of {pagination.totalPages}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                  <SelectItem key={p} value={String(p)}>Page {p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-gray-500 text-xs"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => loadPage(pagination.page + 1)}
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
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
