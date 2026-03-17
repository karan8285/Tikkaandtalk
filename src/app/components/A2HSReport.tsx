/**
 * A2HSReport — Add to Home Screen installation tracking report.
 * Shows how many customers have installed the app via A2HS,
 * with platform breakdown, install method, date filters, search, pagination, and export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Download, Search, Calendar,
  FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Loader2,
  Smartphone, Monitor, Phone, Zap, Hand,
} from "lucide-react";
import { toast } from "sonner";
import { APP_CONFIG } from "../lib/config";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { format } from "date-fns";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const BRAND = APP_CONFIG.brand.primaryColor;

interface A2HSInstall {
  userId: string;
  phone: string;
  name: string;
  method: "native" | "manual_standalone" | string;
  platform: string;
  installedAt: string;
}

interface ReportData {
  installs: A2HSInstall[];
  summary: {
    totalInstalls: number;
    nativeInstalls: number;
    manualInstalls: number;
    platformBreakdown: {
      iOS: number;
      Android: number;
      Desktop: number;
      Other: number;
    };
  };
  pagination: { page: number; limit: number; totalPages: number; totalItems: number };
  allInstalls?: A2HSInstall[];
}

interface Props {
  customToken: string | null;
}

export function A2HSReport({ customToken }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchReport = useCallback(async (pageNum = 1, isExport = false) => {
    if (!customToken) return null;
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "10",
        ...(search && { search }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(isExport && { export: "true" }),
      });
      const res = await fetchWithRetry(`${API_BASE}/reports/a2hs?${params}`, {
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
      console.error("A2HS report fetch error:", err);
      toast.error(err.message || "Failed to load report");
      return null;
    }
  }, [customToken, search, startDate, endDate]);

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

  // Export to Excel
  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      const result = await fetchReport(1, true);
      if (!result?.allInstalls?.length) {
        toast.error("No data to export");
        return;
      }

      const rows = result.allInstalls;
      const csvHeader = ["#", "Customer Name", "Phone", "Platform", "Install Method", "Installed At"];
      const csvRows = rows.map((r, i) => [
        i + 1,
        r.name || "Unknown",
        r.phone || "-",
        r.platform || "-",
        r.method === "native" ? "Native Install" : "Manual (Standalone)",
        r.installedAt ? format(new Date(r.installedAt), "dd MMM yyyy HH:mm") : "-",
      ]);

      const csvContent = [csvHeader, ...csvRows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `a2hs-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Excel/CSV exported successfully!");
    } catch (err: any) {
      toast.error("Export failed: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  // Export to PDF
  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const result = await fetchReport(1, true);
      if (!result?.allInstalls?.length) {
        toast.error("No data to export");
        return;
      }

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Add to Home Screen Report", 14, 20);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 28);
      doc.text(`Total Installs: ${result.summary.totalInstalls}`, 14, 34);
      doc.text(
        `Native: ${result.summary.nativeInstalls} | Manual: ${result.summary.manualInstalls}`,
        14, 40
      );
      doc.text(
        `iOS: ${result.summary.platformBreakdown.iOS} | Android: ${result.summary.platformBreakdown.Android} | Desktop: ${result.summary.platformBreakdown.Desktop}`,
        14, 46
      );

      autoTable(doc, {
        startY: 52,
        head: [["#", "Customer", "Phone", "Platform", "Method", "Installed At"]],
        body: result.allInstalls.map((r, i) => [
          i + 1,
          r.name || "Unknown",
          r.phone || "-",
          r.platform || "-",
          r.method === "native" ? "Native" : "Manual",
          r.installedAt ? format(new Date(r.installedAt), "dd MMM yyyy HH:mm") : "-",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [99, 102, 241] },
      });

      doc.save(`a2hs-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF exported successfully!");
    } catch (err: any) {
      toast.error("PDF export failed: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  const summary = data?.summary;
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: BRAND }}
        >
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900">Add to Home Screen Report</h2>
          <p className="text-xs text-gray-500">Track PWA installation adoption</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadPage(page)}
          disabled={loading}
          className="gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Download className="w-4 h-4" style={{ color: BRAND }} />
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Total Installs</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: BRAND }}>
              {summary.totalInstalls}
            </p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-green-600" />
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Native</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{summary.nativeInstalls}</p>
            <p className="text-[10px] text-gray-400">
              Manual: {summary.manualInstalls}
            </p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Mobile</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-blue-600">
                {summary.platformBreakdown.iOS + summary.platformBreakdown.Android}
              </span>
            </div>
            <div className="flex gap-2 mt-0.5">
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                iOS {summary.platformBreakdown.iOS}
              </Badge>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                Android {summary.platformBreakdown.Android}
              </Badge>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Monitor className="w-4 h-4 text-purple-600" />
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Desktop</span>
            </div>
            <p className="text-lg font-bold text-purple-600">{summary.platformBreakdown.Desktop}</p>
            {summary.platformBreakdown.Other > 0 && (
              <p className="text-[10px] text-gray-400">
                Other: {summary.platformBreakdown.Other}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, phone, platform..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && loadPage(1)}
          />
          <Button size="sm" className="h-8" onClick={() => loadPage(1)} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </Button>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <Label className="text-[10px] text-gray-500">
              <Calendar className="w-3 h-3 inline mr-1" />
              From
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <Label className="text-[10px] text-gray-500">
              <Calendar className="w-3 h-3 inline mr-1" />
              To
            </Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setSearch("");
              setTimeout(() => loadPage(1), 100);
            }}
          >
            Clear
          </Button>
        </div>
        {/* Export Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={handleExportExcel}
            disabled={!!exporting}
          >
            {exporting === "excel" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
            )}
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={handleExportPDF}
            disabled={!!exporting}
          >
            {exporting === "pdf" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-red-600" />
            )}
            PDF
          </Button>
        </div>
      </Card>

      {/* Results */}
      {loading && !data ? (
        <Card className="p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: BRAND }} />
          <p className="text-sm text-gray-500">Loading report...</p>
        </Card>
      ) : data?.installs.length === 0 ? (
        <Card className="p-8 text-center">
          <Download className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No A2HS installs found</p>
          <p className="text-xs text-gray-400 mt-1">
            Installs are tracked when customers add the app to their home screen
          </p>
        </Card>
      ) : (
        <>
          {/* Install Cards */}
          <div className="space-y-3">
            {data?.installs.map((install, idx) => {
              const rank = ((pagination?.page || 1) - 1) * (pagination?.limit || 10) + idx + 1;
              const isNative = install.method === "native";
              const platformLower = (install.platform || "").toLowerCase();
              const isIOS = platformLower.includes("ios");
              const isAndroid = platformLower.includes("android");
              
              return (
                <Card key={install.userId || idx} className="overflow-hidden border">
                  <div className="p-3">
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: BRAND + "CC" }}
                      >
                        {rank}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {install.name || "Unknown Customer"}
                        </p>
                        {install.phone && (
                          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                            <Phone className="w-3 h-3" />
                            <span>{install.phone}</span>
                          </div>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <Badge
                          className="text-[9px] px-1.5 py-0"
                          style={{
                            backgroundColor: isNative ? "#dcfce7" : "#dbeafe",
                            color: isNative ? "#166534" : "#1e40af",
                          }}
                        >
                          {isNative ? (
                            <><Zap className="w-2.5 h-2.5 mr-0.5" /> Native</>
                          ) : (
                            <><Hand className="w-2.5 h-2.5 mr-0.5" /> Manual</>
                          )}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0"
                        >
                          {isIOS ? (
                            <><Smartphone className="w-2.5 h-2.5 mr-0.5" /> iOS</>
                          ) : isAndroid ? (
                            <><Smartphone className="w-2.5 h-2.5 mr-0.5" /> Android</>
                          ) : (
                            <><Monitor className="w-2.5 h-2.5 mr-0.5" /> {install.platform}</>
                          )}
                        </Badge>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="mt-2 text-[10px] text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Installed: {install.installedAt
                        ? format(new Date(install.installedAt), "dd MMM yyyy, HH:mm")
                        : "Unknown"
                      }
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} total)
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={pagination.page <= 1}
                  onClick={() => loadPage(1)}
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={pagination.page <= 1}
                  onClick={() => loadPage(pagination.page - 1)}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadPage(pagination.page + 1)}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadPage(pagination.totalPages)}
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}