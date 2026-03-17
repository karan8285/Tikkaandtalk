import { formatIDR } from "../lib/currency";
import { APP_CONFIG } from "../lib/config";
import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { toast } from "sonner";
import { TrendingUp, DollarSign, ShoppingCart, XCircle, Clock, CheckCircle2, Package, Loader2 } from "lucide-react";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

/** Derive short order ID from orderNumber (e.g. TNT00000102 -> TNT-102) */
function getShortOrderId(orderNumber: string): string {
  if (!orderNumber) return "";
  const prefix = APP_CONFIG.restaurant?.orderPrefix || "TNT";
  const numPart = orderNumber.replace(prefix, "");
  const num = parseInt(numPart, 10);
  if (isNaN(num)) return orderNumber;
  return `${prefix}-${String(num).padStart(3, "0")}`;
}

interface SalesReport {
  period: string;
  summary: {
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    pendingOrders: number;
    paidOrders: number;
    unpaidOrders: number;
    totalRevenue: number;
    revenueRealized: number;
    averageOrderValue: number;
  };
  ordersByDay: Record<string, { count: number; revenue: number }>;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  orders?: any[]; // Full order details
}

type DetailDialogType = 'totalRevenue' | 'totalOrders' | 'avgOrder' | 'revenueRealized' | 'pendingPayment' | 'paymentRate' | null;

export function SalesReportsAdmin({ customToken }: { customToken: string | null }) {
  const [period, setPeriod] = useState("today");
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailDialog, setDetailDialog] = useState<DetailDialogType>(null);
  const [detailOrders, setDetailOrders] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [period]);

  const fetchReport = async () => {
    if (!customToken) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/reports/sales?period=${period}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Sales report API error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch report: ${response.status}`);
      }

      const data = await response.json();
      setReport(data);
    } catch (error: any) {
      console.error("Error fetching report:", error);
      toast.error(`Failed to load sales report: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedOrders = async (filterType: DetailDialogType) => {
    if (!customToken || !filterType) return;

    setLoadingDetail(true);
    try {
      const response = await fetch(`${API_BASE}/admin/orders`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Detail orders API error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }

      const data = await response.json();
      let filteredOrders = data.orders || [];
      console.log(`Detail dialog: fetched ${filteredOrders.length} total orders for filter "${filterType}", period "${period}"`);

      // Apply period filter
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      filteredOrders = filteredOrders.filter((order: any) => {
        const orderDate = new Date(order.createdAt);
        if (period === 'today') return orderDate >= startOfToday;
        if (period === 'week') return orderDate >= startOfWeek;
        if (period === 'month') return orderDate >= startOfMonth;
        return true; // all time
      });

      // Apply type-specific filter
      switch (filterType) {
        case 'totalRevenue':
          filteredOrders = filteredOrders.filter((o: any) => 
            o.status === 'delivered' || o.status === 'completed' || o.status === 'closed'
          );
          break;
        case 'totalOrders':
          // All orders
          break;
        case 'revenueRealized':
          filteredOrders = filteredOrders.filter((o: any) => 
            (o.status === 'delivered' || o.status === 'completed' || o.status === 'closed') && 
            (o.paymentStatus === 'paid' || (o.paymentStatus === undefined && o.paymentReceived === true))
          );
          break;
        case 'pendingPayment':
          filteredOrders = filteredOrders.filter((o: any) => 
            (o.status === 'delivered' || o.status === 'completed' || o.status === 'closed') && 
            (o.paymentStatus === 'unpaid' || o.paymentStatus === 'partial' || (o.paymentStatus === undefined && !o.paymentReceived))
          );
          break;
        case 'paymentRate':
          filteredOrders = filteredOrders.filter((o: any) => 
            o.status === 'delivered' || o.status === 'completed' || o.status === 'closed'
          );
          break;
      }

      console.log(`Detail dialog: ${filteredOrders.length} orders after period+type filter`);
      setDetailOrders(filteredOrders.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (error) {
      console.error("Error fetching detailed orders:", error);
      toast.error("Failed to load order details");
    } finally {
      setLoadingDetail(false);
    }
  };

  const openDetailDialog = async (type: DetailDialogType) => {
    setDetailOrders([]);
    setDetailDialog(type);
    await fetchDetailedOrders(type);
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      pending: "bg-orange-500",
      confirmed: "bg-teal-500",
      cooking: "bg-orange-600",
      ready: "bg-purple-500",
      out_for_delivery: "bg-orange-500",
      delivered: "bg-teal-500",
      closed: "bg-green-500",
      cancelled: "bg-red-500",
    };
    
    const statusLabels: Record<string, string> = {
      pending: "Pending",
      confirmed: "Confirmed",
      cooking: "Cooking",
      ready: "Ready",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      closed: "Closed",
      cancelled: "Cancelled",
    };

    return (
      <Badge className={`${statusColors[status]} text-white`}>
        {statusLabels[status] || status}
      </Badge>
    );
  };

  const getDialogTitle = (type: DetailDialogType): string => {
    switch (type) {
      case 'totalRevenue': return 'Total Revenue - Completed Orders';
      case 'totalOrders': return 'All Orders';
      case 'avgOrder': return 'Order Value Details';
      case 'revenueRealized': return 'Revenue Realized - Paid Orders';
      case 'pendingPayment': return 'Pending Payment - Unpaid Orders';
      case 'paymentRate': return 'Payment Rate - All Completed Orders';
      default: return 'Order Details';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading report...</div>;
  }

  if (!report) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sales Report</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => openDetailDialog('totalRevenue')}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">{formatIDR(report.summary.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">
                From completed orders
              </p>
            </div>
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => openDetailDialog('totalOrders')}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold">{report.summary.totalOrders}</p>
              <p className="text-xs text-muted-foreground">
                {report.summary.completedOrders} completed, {report.summary.cancelledOrders} cancelled
              </p>
            </div>
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => openDetailDialog('avgOrder')}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Order Value</p>
              <p className="text-2xl font-bold">{formatIDR(report.summary.averageOrderValue)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Payment Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow" 
          style={{ borderLeft: `4px solid ${APP_CONFIG.brand.primaryColor}` }}
          onClick={() => openDetailDialog('revenueRealized')}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#FCE4EC' }}>
              <CheckCircle2 className="w-6 h-6" style={{ color: APP_CONFIG.brand.primaryColor }} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenue Realized</p>
              <p className="text-2xl font-bold" style={{ color: APP_CONFIG.brand.primaryColor }}>
                {formatIDR(report.summary.revenueRealized)}
              </p>
              <p className="text-xs text-muted-foreground">
                From {report.summary.paidOrders} paid orders
              </p>
            </div>
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow" 
          style={{ borderLeft: `4px solid ${APP_CONFIG.brand.primaryColor}` }}
          onClick={() => openDetailDialog('pendingPayment')}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#FCE4EC' }}>
              <Clock className="w-6 h-6" style={{ color: APP_CONFIG.brand.primaryColor }} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Payment</p>
              <p className="text-2xl font-bold" style={{ color: APP_CONFIG.brand.primaryColor }}>
                {formatIDR(report.summary.totalRevenue - report.summary.revenueRealized)}
              </p>
              <p className="text-xs text-muted-foreground">
                From {report.summary.unpaidOrders} unpaid orders
              </p>
            </div>
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow" 
          style={{ borderLeft: '4px solid #6366f1' }}
          onClick={() => openDetailDialog('paymentRate')}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment Rate</p>
              <p className="text-2xl font-bold text-indigo-600">
                {report.summary.completedOrders > 0 
                  ? `${Math.round((report.summary.paidOrders / report.summary.completedOrders) * 100)}%`
                  : '0%'
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {report.summary.paidOrders} of {report.summary.completedOrders} orders paid
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Selling Items */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Top Selling Items</h3>
        <div className="space-y-3">
          {report.topItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed orders in this period</p>
          ) : (
            report.topItems.map((item, index) => (
              <div key={index} className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-lg text-muted-foreground">#{index + 1}</span>
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.quantity} sold</p>
                  </div>
                </div>
                <p className="font-semibold text-green-600">{formatIDR(item.revenue)}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Daily Breakdown */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Daily Breakdown</h3>
        <div className="space-y-2">
          {Object.entries(report.ordersByDay).length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders in this period</p>
          ) : (
            Object.entries(report.ordersByDay)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, data]) => (
                <div key={date} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium">{new Date(date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}</p>
                    <p className="text-sm text-muted-foreground">{data.count} orders</p>
                  </div>
                  <p className="font-semibold">{formatIDR(data.revenue)}</p>
                </div>
              ))
          )}
        </div>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailDialog !== null} onOpenChange={() => setDetailDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{getDialogTitle(detailDialog)}</DialogTitle>
            <DialogDescription>
              View detailed order information for the selected period
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {loadingDetail ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading orders...</p>
              </div>
            ) : detailOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No orders found</p>
            ) : (
              <div className="space-y-3">
                {detailOrders.map((order) => (
                  <Card key={order.id} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm text-primary">
                            {order.orderNumber ? getShortOrderId(order.orderNumber) : order.id.substring(0, 8)}
                          </p>
                          {getStatusBadge(order.status)}
                          {(() => {
                            const ps = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
                            if (ps === 'paid') return <Badge className="bg-green-500 text-white">Paid</Badge>;
                            if (ps === 'partial') return <Badge className="bg-amber-500 text-white">Partial</Badge>;
                            return null;
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatIDR(order.total)}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-2 mt-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {order.items?.map((item: any) => `${item.title} (${item.quantity})`).join(', ') || order.itemTitle}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        📞 {order.phone}
                      </p>
                      {order.paymentDetails && (
                        <p className="text-xs text-teal-600 mt-1">
                          💳 {order.paymentDetails}
                        </p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}