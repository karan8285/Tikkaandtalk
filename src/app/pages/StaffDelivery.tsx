/**
 * StaffDelivery — Simplified delivery dashboard.
 * Shows orders ready for pickup and out for delivery.
 * Includes Proof of Delivery (POD) photo upload when marking as delivered.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { useStaffAuth, ROLE_LABELS } from "../lib/staff-auth";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { Truck, Clock, Phone, MapPin, LogOut, RefreshCw, Package, CheckCircle2, Navigation, Camera, X, ImageIcon, Upload, Loader2, MessageSquare, ChevronLeft, ChevronRight, Volume2, VolumeX, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { getShortOrderId } from "../lib/orderUtils";
import { APP_CONFIG, BRAND_COLOR } from "../lib/config";
import { useNewOrderAlert } from "../lib/useNewOrderAlert";
import { StaffAddToHomeScreen } from "../components/StaffAddToHomeScreen";
import { StaffPushToggle } from "../components/StaffPushToggle";
import { ChangePinDialog } from "../components/ChangePinDialog";
import { openNativeCamera, hasCameraPermission, requestCameraPermission } from "../lib/camera";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface Order {
  id: string;
  itemTitle: string;
  total: number;
  deliveryMethod: string;
  status: string;
  createdAt: string;
  phone: string;
  address?: string;
  items?: any[];
  orderNumber?: string;
  specialInstructions?: string;
  customerName?: string;
  deliveryNote?: string;
  deliveryNoteAt?: string;
  deliveryNoteBy?: string;
}

export default function StaffDelivery() {
  const navigate = useNavigate();
  const { staff, accessToken, loading: authLoading, signOut } = useStaffAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ready" | "delivering">("ready");
  const [changePinOpen, setChangePinOpen] = useState(false);
  const { checkForNewOrders, soundEnabled, enableSound } = useNewOrderAlert({ label: "Delivery" });
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ORDERS_PER_PAGE = 10;

  // POD (Proof of Delivery) state
  const [podModalOrder, setPodModalOrder] = useState<Order | null>(null);
  const [podImage, setPodImage] = useState<File | null>(null);
  const [podPreview, setPodPreview] = useState<string | null>(null);
  const [podUploading, setPodUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchOrders = useCallback(async (signal?: AbortSignal) => {
    const token = accessTokenRef.current;
    console.log("fetchOrders called, token exists:", !!token);
    if (!token) return;
    try {
      console.log("Fetching from:", `${API_BASE}/admin/orders?page=1&limit=100&status=all&payment=all&delivery=delivery&date=all&tab=active`);
      const response = await fetchWithRetry(`${API_BASE}/admin/orders?page=1&limit=100&status=all&payment=all&delivery=delivery&date=all&tab=active`, {
        headers: { Authorization: `Bearer ${publicAnonKey}`, "X-Custom-Auth": token },
        signal,
      });
      console.log("Response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("API response orders count:", (data.orders || []).length);
        const deliveryOrders = (data.orders || []).filter((o: Order) => {
          const match = o.deliveryMethod === 'delivery' && ['ready', 'out_for_delivery'].includes(o.status);
          console.log(`Order ${o.id}: deliveryMethod=${o.deliveryMethod}, status=${o.status}, matches=${match}`);
          return match;
        });
        console.log("Filtered delivery orders:", deliveryOrders.length);

        // Check for new delivery orders and play sound alert
        checkForNewOrders(deliveryOrders.map((o: Order) => o.id));

        setOrders(deliveryOrders);
      } else {
        const errText = await response.text();
        console.error("API error:", response.status, errText);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error("Failed to fetch delivery orders:", error);
    } finally {
      setLoading(false);
    }
  }, [checkForNewOrders]);

  useEffect(() => {
    if (authLoading) return;
    if (!staff) { navigate("/staff"); return; }
    if (staff.role !== 'delivery' && staff.role !== 'superuser' && staff.role !== 'manager') {
      toast.error("Delivery access required");
      navigate("/staff");
      return;
    }
    const controller = new AbortController();
    fetchOrders(controller.signal);
    const interval = setInterval(() => fetchOrders(), 15000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [staff, authLoading, navigate, fetchOrders]);

  const updateStatus = async (orderId: string, newStatus: string, proofOfDeliveryUrl?: string) => {
    try {
      setUpdatingStatus(orderId);
      const body: any = { status: newStatus };
      if (proofOfDeliveryUrl) {
        body.proofOfDeliveryUrl = proofOfDeliveryUrl;
      }
      const response = await fetchWithRetry(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken || "",
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        toast.success(`Order marked as ${newStatus === 'out_for_delivery' ? 'Picked Up' : 'Delivered'}`);
        fetchOrders();
      } else {
        const err = await response.json().catch(() => null);
        toast.error(err?.error || "Failed to update order");
      }
    } catch (error) {
      toast.error("Failed to update order");
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Open the POD modal for a specific order
  const openPodModal = (order: Order) => {
    setPodModalOrder(order);
    setPodImage(null);
    setPodPreview(null);
  };

  // Close the POD modal
  const closePodModal = () => {
    setPodModalOrder(null);
    setPodImage(null);
    setPodPreview(null);
    setPodUploading(false);
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      toast.error("Please select a JPG, PNG, or WebP image");
      return;
    }
    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large. Maximum 10MB.");
      return;
    }

    setPodImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setPodPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Upload POD image and mark as delivered
  const handleDeliverWithPod = async () => {
    if (!podModalOrder) return;

    setPodUploading(true);
    let podUrl: string | undefined;

    try {
      // Step 1: Upload POD image if provided
      if (podImage) {
        const formData = new FormData();
        formData.append("image", podImage);
        formData.append("orderId", podModalOrder.id);

        const uploadRes = await fetchWithRetry(`${API_BASE}/delivery/upload-pod`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": accessToken || "",
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => null);
          toast.error(err?.error || "Failed to upload delivery photo");
          setPodUploading(false);
          return;
        }

        const uploadData = await uploadRes.json();
        podUrl = uploadData.imageUrl;
        console.log("POD uploaded:", podUrl?.substring(0, 80));
      }

      // Step 2: Mark as delivered (with POD URL if available)
      await updateStatus(podModalOrder.id, "delivered", podUrl);
      closePodModal();
    } catch (error) {
      console.error("POD delivery error:", error);
      toast.error("Failed to complete delivery");
      setPodUploading(false);
    }
  };

  const handleSignOut = () => { signOut(); navigate("/staff"); };

  const readyOrders = orders.filter(o => o.status === 'ready');
  const deliveringOrders = orders.filter(o => o.status === 'out_for_delivery');

  if (authLoading || !staff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const displayOrders = activeTab === "ready" ? readyOrders : deliveringOrders;
  const totalDisplayPages = Math.max(1, Math.ceil(displayOrders.length / ORDERS_PER_PAGE));
  const paginatedDisplayOrders = displayOrders.slice((currentPage - 1) * ORDERS_PER_PAGE, currentPage * ORDERS_PER_PAGE);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6" style={{ color: BRAND_COLOR }} />
            <div>
              <h1 className="text-lg font-bold">Deliveries</h1>
              <p className="text-xs text-gray-500">{staff.name} • {orders.length} orders</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchOrders}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setChangePinOpen(true)} title="Change PIN">
              <KeyRound className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Staff Add to Home Screen Banner */}
      <StaffAddToHomeScreen variant="banner" />
      <StaffPushToggle variant="banner" />

      {/* Sound alert prompt */}
      {!soundEnabled && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <button
            onClick={enableSound}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 active:bg-amber-200 transition-colors"
          >
            <VolumeX className="w-5 h-5 text-amber-600" />
            <span>Tap here to enable new order sound alerts</span>
            <Volume2 className="w-5 h-5 text-amber-600" />
          </button>
        </div>
      )}

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Tabs */}
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => { setActiveTab("ready"); setCurrentPage(1); }}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${activeTab === "ready" ? "text-white" : "bg-white text-gray-600"}`}
            style={activeTab === "ready" ? { backgroundColor: BRAND_COLOR } : {}}
          >
            <Package className="w-4 h-4 inline mr-1" /> Ready ({readyOrders.length})
          </button>
          <button
            onClick={() => { setActiveTab("delivering"); setCurrentPage(1); }}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${activeTab === "delivering" ? "text-white" : "bg-white text-gray-600"}`}
            style={activeTab === "delivering" ? { backgroundColor: BRAND_COLOR } : {}}
          >
            <Navigation className="w-4 h-4 inline mr-1" /> Delivering ({deliveringOrders.length})
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
          </div>
        ) : displayOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-600">
              {activeTab === "ready" ? "No orders ready for pickup" : "No active deliveries"}
            </p>
            <p className="text-sm">Orders will appear here automatically</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedDisplayOrders.map(order => (
              <Card key={order.id} className="p-4 shadow-sm" style={order.status === 'ready' ? { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' } : { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-extrabold text-2xl tracking-tight text-gray-900">
                    {getShortOrderId(order.orderNumber || order.id)}
                  </span>
                  <Badge className={`text-xs text-white ${order.status === 'ready' ? 'bg-purple-500' : 'bg-orange-500'}`}>
                    {order.status === 'ready' ? 'Ready' : 'Delivering'}
                  </Badge>
                </div>

                {/* Customer name */}
                {order.customerName && (
                  <p className="text-base font-semibold text-gray-800 mb-1">{order.customerName}</p>
                )}

                <p className="text-sm font-medium mb-1 text-gray-800">{order.itemTitle}</p>
                <p className="text-lg font-bold mb-2" style={{ color: BRAND_COLOR }}>{formatIDR(order.total)}</p>

                {/* Customer Info */}
                <div className="space-y-1 mb-3 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${order.phone}`} className="underline">{order.phone}</a>
                  </div>
                  {order.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>{order.address}</p>
                    </div>
                  )}
                </div>

                {order.specialInstructions && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-3">
                    <p className="text-xs text-yellow-800">{order.specialInstructions}</p>
                  </div>
                )}

                {/* Delivery Note from Admin */}
                {order.deliveryNote && (
                  <div className="bg-blue-50 border border-blue-300 rounded-lg px-3 py-2.5 mb-3">
                    <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5 mb-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Note from Admin
                      {order.deliveryNoteBy && <span className="font-normal text-blue-600">— {order.deliveryNoteBy}</span>}
                    </p>
                    <p className="text-sm text-blue-900 font-medium">{order.deliveryNote}</p>
                    {order.deliveryNoteAt && (
                      <p className="text-[10px] text-blue-500 mt-1">
                        {new Date(order.deliveryNoteAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                )}

                {/* Items */}
                {order.items && order.items.length > 0 && (
                  <div className="bg-gray-50 rounded p-2 mb-3">
                    {order.items.map((item: any, idx: number) => (
                      <p key={idx} className="text-xs text-gray-600">
                        {item.quantity}x {item.title || item.name}
                      </p>
                    ))}
                  </div>
                )}

                <div className="text-xs text-gray-400 mb-3">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {new Date(order.createdAt).toLocaleString()}
                </div>

                {/* Action Buttons */}
                {order.status === 'ready' && (
                  <Button
                    className="w-full text-white font-semibold"
                    style={{ backgroundColor: BRAND_COLOR }}
                    onClick={() => updateStatus(order.id, 'out_for_delivery')}
                    disabled={updatingStatus === order.id}
                  >
                    {updatingStatus === order.id ? "Updating..." : "Pick Up for Delivery"}
                  </Button>
                )}
                {order.status === 'out_for_delivery' && (
                  <Button
                    className="w-full text-white font-semibold bg-green-600 hover:bg-green-700"
                    onClick={() => openPodModal(order)}
                    disabled={updatingStatus === order.id}
                  >
                    {updatingStatus === order.id ? "Updating..." : (
                      <span className="flex items-center justify-center gap-2">
                        <Camera className="w-5 h-5" />
                        Mark as Delivered
                      </span>
                    )}
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalDisplayPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              Page {currentPage} of {totalDisplayPages} ({displayOrders.length} orders)
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={currentPage === totalDisplayPages} onClick={() => setCurrentPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Proof of Delivery Modal ===== */}
      {podModalOrder && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" onClick={closePodModal}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 pt-5 pb-3 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Confirm Delivery</h3>
                <p className="text-sm text-gray-500">
                  Order {getShortOrderId(podModalOrder.orderNumber || podModalOrder.id)}
                  {podModalOrder.customerName && <> &middot; {podModalOrder.customerName}</>}
                </p>
              </div>
              <button onClick={closePodModal} className="p-2 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* POD Info */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Upload Proof of Delivery
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Take a photo of the delivered order at the customer's location. This will be visible to the customer.
                </p>
              </div>

              {/* Image Upload Area */}
              <div>
                {!podPreview ? (
                  <div className="flex gap-2">
                    {/* Native Camera Button */}
                    <button
                      onClick={async () => {
                        try {
                          const perm = await hasCameraPermission();
                          if (!perm) {
                            const granted = await requestCameraPermission();
                            if (!granted) {
                              toast.error("Camera permission required");
                              return;
                            }
                          }
                          const result = await openNativeCamera();
                          if (result?.uri) {
                            // Convert file:// URI to file object for upload
                            const response = await fetch(result.uri);
                            const blob = await response.blob();
                            const fileName = result.uri.split("/").pop() || "photo.jpg";
                            const file = new File([blob], fileName, { type: "image/jpeg" });
                            setPodImage(file);
                            const reader = new FileReader();
                            reader.onloadend = () => setPodPreview(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        } catch (err: any) {
                          console.error("Camera error:", err);
                          // Fallback to file input
                          fileInputRef.current?.click();
                        }
                      }}
                      className="flex-1 border-2 border-dashed border-green-300 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-green-500 hover:bg-green-50/50 transition-all active:scale-[0.98]"
                    >
                      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                        <Camera className="w-7 h-7 text-green-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-700">Open Camera</p>
                      <p className="text-xs text-gray-400">Take live photo</p>
                    </button>

                    {/* File Picker Button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-gray-400 hover:bg-gray-50/50 transition-all active:scale-[0.98]"
                    >
                      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                        <ImageIcon className="w-7 h-7 text-gray-500" />
                      </div>
                      <p className="text-sm font-semibold text-gray-700">Choose File</p>
                      <p className="text-xs text-gray-400">From gallery</p>
                    </button>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border-2 border-green-300">
                    <img
                      src={podPreview}
                      alt="Proof of delivery preview"
                      className="w-full h-64 object-cover"
                    />
                    <div className="absolute top-2 right-2 flex gap-2">
                      <button
                        onClick={() => {
                          setPodImage(null);
                          setPodPreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
                      <p className="text-xs text-white font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Photo ready &middot; {(podImage!.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    {/* Retake button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-2 right-2 bg-white/90 text-gray-700 text-xs font-semibold rounded-full px-3 py-1.5 shadow-md flex items-center gap-1 hover:bg-white"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Retake
                    </button>
                  </div>
                )}

                {/* Hidden file input — capture=environment opens rear camera on mobile */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Order Summary */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Order</span>
                  <span className="font-semibold">{getShortOrderId(podModalOrder.orderNumber || podModalOrder.id)}</span>
                </div>
                {podModalOrder.customerName && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Customer</span>
                    <span className="font-medium">{podModalOrder.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-bold" style={{ color: BRAND_COLOR }}>{formatIDR(podModalOrder.total)}</span>
                </div>
                {podModalOrder.address && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 shrink-0">Address</span>
                    <span className="text-right ml-2 text-gray-700 text-xs">{podModalOrder.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t bg-white space-y-2">
              <Button
                className="w-full h-12 text-base font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
                onClick={handleDeliverWithPod}
                disabled={podUploading}
              >
                {podUploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Uploading & Confirming...
                  </span>
                ) : podImage ? (
                  <span className="flex items-center justify-center gap-2">
                    <Upload className="w-5 h-5" />
                    Confirm Delivery with Photo
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Confirm Delivery without Photo
                  </span>
                )}
              </Button>
              {!podImage && (
                <p className="text-[11px] text-center text-amber-600 font-medium">
                  We recommend uploading a photo as proof of delivery
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change PIN Dialog */}
      {staff && accessToken && (
        <ChangePinDialog
          open={changePinOpen}
          onOpenChange={setChangePinOpen}
          variant="staff"
          accessToken={accessToken}
          userId={staff.id}
        />
      )}
    </div>
  );
}