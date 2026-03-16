/**
 * CustomReportsAdmin — Super User exclusive tab for custom reports.
 * Each report is a card; clicking an active report expands it inline.
 */
import { useState } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  FileBarChart2, Lock, Construction, ChevronRight,
  ChevronLeft, Users, TrendingUp, BarChart3, UtensilsCrossed, UserCheck, UserX, Star,
  CreditCard,
} from "lucide-react";
import { APP_CONFIG } from "../lib/config";
import { CRMCustomerReport } from "./CRMCustomerReport";
import { ProductsSoldReport } from "./ProductsSoldReport";
import { CustomerChurnReport } from "./CustomerChurnReport";
import { RatingFeedbackReport } from "./RatingFeedbackReport";
import { CustomerOrderTrendsReport } from "./CustomerOrderTrendsReport";
import { CustomerPaymentReport } from "./CustomerPaymentReport";

const BRAND = APP_CONFIG.brand.primaryColor;

interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  status: "coming_soon" | "active";
}

/**
 * Report slots — add new entries here as reports are built.
 * Set status to "active" once the report is implemented.
 */
const REPORT_SLOTS: ReportDefinition[] = [
  {
    id: "crm-customer",
    title: "Customer Analytics (CRM)",
    description: "Top customers ranked by revenue, with tier badges, date filters, and export.",
    icon: Users,
    status: "active",
  },
  {
    id: "revenue-breakdown",
    title: "Revenue Breakdown",
    description: "Revenue split by payment method, delivery type, and category.",
    icon: TrendingUp,
    status: "coming_soon",
  },
  {
    id: "menu-performance",
    title: "Products Sold",
    description: "Best & worst sellers ranked by quantity, category filter, and item trends.",
    icon: UtensilsCrossed,
    status: "active",
  },
  {
    id: "staff-performance",
    title: "Staff Performance",
    description: "Order handling times, delivery metrics, and staff activity log.",
    icon: UserCheck,
    status: "coming_soon",
  },
  {
    id: "daily-summary",
    title: "Daily Summary Report",
    description: "Consolidated view of daily sales, orders, and key metrics.",
    icon: BarChart3,
    status: "coming_soon",
  },
  {
    id: "customer-churn",
    title: "Customer Churn",
    description: "At-risk customers who haven't ordered in 30+ days with 5+ past orders, with risk-level badges.",
    icon: UserX,
    status: "active",
  },
  {
    id: "rating-feedback",
    title: "Rating Feedback",
    description: "All order ratings with star display, comments, WhatsApp reply, and rating distribution.",
    icon: Star,
    status: "active",
  },
  {
    id: "customer-trends",
    title: "Customer Order Trends",
    description: "Per-customer order value line charts over time, top N by order frequency.",
    icon: TrendingUp,
    status: "active",
  },
  {
    id: "customer-payment",
    title: "Customer Payment",
    description: "Track paid & unpaid orders by customer, with status filter, search, and export.",
    icon: CreditCard,
    status: "active",
  },
];

interface Props {
  customToken: string | null;
}

export function CustomReportsAdmin({ customToken }: Props) {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  // If a report is selected, show its content
  if (selectedReport) {
    return (
      <div className="space-y-4">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-gray-600"
          onClick={() => setSelectedReport(null)}
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Reports
        </Button>

        {/* Render the selected report */}
        {selectedReport === "crm-customer" && (
          <CRMCustomerReport customToken={customToken} />
        )}
        {selectedReport === "menu-performance" && (
          <ProductsSoldReport customToken={customToken} />
        )}
        {selectedReport === "customer-churn" && (
          <CustomerChurnReport customToken={customToken} />
        )}
        {selectedReport === "rating-feedback" && (
          <RatingFeedbackReport customToken={customToken} />
        )}
        {selectedReport === "customer-trends" && (
          <CustomerOrderTrendsReport customToken={customToken} />
        )}
        {selectedReport === "customer-payment" && (
          <CustomerPaymentReport customToken={customToken} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: BRAND }}
        >
          <FileBarChart2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Custom Reports</h2>
          <p className="text-xs text-gray-500">
            Super User exclusive — detailed business reports
          </p>
        </div>
        <Badge className="ml-auto bg-red-100 text-red-700 text-[10px] gap-1">
          <Lock className="w-3 h-3" /> Super User Only
        </Badge>
      </div>

      {/* Report Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORT_SLOTS.map((report) => {
          const isActive = report.status === "active";
          const Icon = report.icon;
          return (
            <Card
              key={report.id}
              className={`p-4 border transition-all ${
                isActive
                  ? "hover:border-gray-400 hover:shadow-md cursor-pointer"
                  : "opacity-70"
              }`}
              onClick={() => {
                if (isActive) setSelectedReport(report.id);
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? "" : "bg-gray-100"
                  }`}
                  style={isActive ? { backgroundColor: BRAND + "15" } : undefined}
                >
                  {isActive ? (
                    <Icon className="w-4 h-4" style={{ color: BRAND }} />
                  ) : (
                    <Construction className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {report.title}
                    </h3>
                    {isActive && (
                      <Badge
                        className="text-[9px] px-1.5 py-0 shrink-0 text-white"
                        style={{ backgroundColor: "#16a34a" }}
                      >
                        Active
                      </Badge>
                    )}
                    {!isActive && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 border-amber-300 text-amber-600 shrink-0"
                      >
                        Coming Soon
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {report.description}
                  </p>
                </div>
                {isActive && (
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Info card */}
      {REPORT_SLOTS.filter(r => r.status === "coming_soon").length > 0 && (
        <Card className="p-4 bg-amber-50/50 border-amber-200">
          <div className="flex items-start gap-3">
            <Construction className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                More reports coming soon
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Additional reports will be added here progressively. Each report provides
                detailed, exportable insights accessible only to the Super User.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}