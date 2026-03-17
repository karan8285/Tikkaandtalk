import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { APP_CONFIG } from "../lib/config";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Textarea } from "../components/ui/textarea";
import { ShoppingBag, Truck, MapPin, Phone, MessageSquare, ChevronRight, CreditCard, Wallet, Navigation, Search, MapPinned, Loader2, AlertCircle, CheckCircle2, Building, ChevronDown, Plus, Trash2, Bookmark, Home, Briefcase, Tag, Ticket, X, Gift, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { JAKARTA_AREAS, getAreasByDistrict } from "../lib/delivery";
import type { DeliveryZone } from "../lib/delivery";
import { getMidtransConfig } from "../lib/midtrans";

const BRAND = APP_CONFIG.brand.primaryColor;

type OrderType = "pickup" | "delivery";

type PaymentMethod = "pay-now" | "pay-later";

interface GuestInfo {
  name: string;
  phone: string;
}

interface DeliveryFeeResult {
  available: boolean;
  distance?: number;
  zone?: DeliveryZone;
  fee?: number;
  maxDistance?: number;
  message?: string;
}

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  unitNumber: string;
  area: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

const LABEL_OPTIONS = [
  { value: "Home", icon: Home },
  { value: "Office", icon: Briefcase },
  { value: "Other", icon: Tag },
] as const;

export default function Order() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, accessToken, loading: authLoading } = useAuth();
  const { cartItems, totalPrice } = useCart();

  // CRITICAL: Save location.state to a ref on mount to prevent losing it during re-renders
  const savedStateRef = useRef(location.state);
  if (location.state && location.state !== savedStateRef.current) {
    savedStateRef.current = location.state;
  }

  // Extract guest info from SAVED ref (not current location.state which can become stale)
  const guestInfo: GuestInfo | null = savedStateRef.current?.guestInfo || null;

  const [orderStep, setOrderStep] = useState<1 | 2>(1);
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("" as PaymentMethod);
  const [address, setAddress] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [errors, setErrors] = useState<{ address?: string; paymentMethod?: string; unitNumber?: string }>({});

  // Delivery fee state
  const [deliveryFeeResult, setDeliveryFeeResult] = useState<DeliveryFeeResult | null>(null);
  const [calculatingFee, setCalculatingFee] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [selectedArea, setSelectedArea] = useState("");
  const [showAreaSelector, setShowAreaSelector] = useState(false);
  const [areaSearch, setAreaSearch] = useState("");
  const [unitNumber, setUnitNumber] = useState("");

  // Place search state (Nominatim live autocomplete)
  const [placeSearchResults, setPlaceSearchResults] = useState<any[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [showPlaceResults, setShowPlaceResults] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saved addresses state (logged-in users only)
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [loadingSavedAddresses, setLoadingSavedAddresses] = useState(false);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);
  const [showAddNewAddress, setShowAddNewAddress] = useState(false);
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("Home");
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);

  // Track lat/lng from GPS for saving
  const lastGpsCoords = useRef<{ lat: number; lng: number } | null>(null);

  // GPS accuracy tracking for progressive location refinement
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    userVoucherId: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    voucherTitle: string;
    freeDelivery: boolean;
    freeItem: string | null;
    applicableCategories?: string[];
    hasRestrictions?: boolean;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");

  // Available promo codes (claimed, not used)
  interface AvailablePromo {
    id: string;
    promoCode: string;
    voucher: {
      title: string;
      discountType?: string;
      discountValue?: number;
      expiryDate?: string;
      minOrderAmount?: number;
      applicableCategories?: string[];
      quantity?: number;
    };
    usedCount?: number;
  }
  interface UnclaimedVoucher {
    id: string;
    voucherId: string;
    voucher: {
      title: string;
      description?: string;
      discountType?: string;
      discountValue?: number;
      expiryDate?: string;
      minOrderAmount?: number;
      applicableCategories?: string[];
      quantity?: number;
    };
  }
  const [availablePromos, setAvailablePromos] = useState<AvailablePromo[]>([]);
  const [unclaimedVouchers, setUnclaimedVouchers] = useState<UnclaimedVoucher[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(false);
  const [claimingVoucherId, setClaimingVoucherId] = useState<string | null>(null);
  const [showUnclaimedSection, setShowUnclaimedSection] = useState(false);

  // Online payment availability
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState(true);

  // Tax rate state (admin-defined)
  const [taxRate, setTaxRate] = useState<number>(11); // Default 11% PPN

  const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

  // Fetch tax rate from restaurant settings
  useEffect(() => {
    const fetchTaxRate = async () => {
      try {
        const res = await fetchWithRetry(`${API_BASE}/restaurant-status`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        const data = await res.json();
        if (data.taxRate !== undefined) {
          setTaxRate(data.taxRate);
        }
      } catch (error) {
        console.error("Error fetching tax rate:", error);
      }
    };
    fetchTaxRate();
  }, []);

  // Fetch online payment availability from Midtrans config
  useEffect(() => {
    const checkOnlinePayment = async () => {
      try {
        const config = await getMidtransConfig();
        const enabled = config.enabled && !!config.clientKey;
        setOnlinePaymentEnabled(enabled);
        if (!enabled && paymentMethod === "pay-now") {
          setPaymentMethod("" as PaymentMethod);
        }
      } catch {
        setOnlinePaymentEnabled(false);
        if (paymentMethod === "pay-now") {
          setPaymentMethod("" as PaymentMethod);
        }
      }
    };
    checkOnlinePayment();
  }, []);

  // Fetch available promo codes for logged-in users
  const fetchAvailablePromos = async () => {
    if (!user?.id) return;
    setLoadingPromos(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/user-vouchers?userId=${user.id}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      const data = await res.json();
      const now = new Date();
      const allVouchers = data.vouchers || [];
      const notExpired = allVouchers.filter((v: any) => {
        if (v.voucher?.expiryDate) {
          return new Date(v.voucher.expiryDate) >= now;
        }
        return true;
      });

      const promos = notExpired.filter((v: any) => {
        if (!v.claimed || !v.promoCode) return false;
        const maxUses = v.voucher?.quantity || 1;
        const usedCount = v.usedCount || 0;
        if (v.used && usedCount >= maxUses) return false;
        return true;
      });
      setAvailablePromos(promos);

      // Unclaimed vouchers (not yet claimed, not used)
      const unclaimed = notExpired.filter((v: any) => !v.claimed && !v.used);
      setUnclaimedVouchers(unclaimed);
    } catch (error) {
      console.error("Error fetching available promos:", error);
    } finally {
      setLoadingPromos(false);
    }
  };

  useEffect(() => {
    if (user?.id) fetchAvailablePromos();
  }, [user?.id]);

  // Claim a voucher directly from Order page
  const handleClaimVoucher = async (userVoucherId: string) => {
    if (!user || !accessToken) {
      toast.error("Please sign in to claim vouchers");
      return;
    }
    setClaimingVoucherId(userVoucherId);
    try {
      const res = await fetchWithRetry(`${API_BASE}/claim-voucher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify({ userVoucherId }),
      });
      const data = await res.json();
      if (res.ok) {
        const promoCode = data.assignment?.promoCode;
        toast.success(
          promoCode
            ? `Voucher claimed! Code: ${promoCode}`
            : "Voucher claimed!"
        );
        // Refresh promos list so newly claimed voucher appears
        await fetchAvailablePromos();
      } else {
        toast.error(data.error || "Failed to claim voucher");
      }
    } catch (error) {
      console.error("Claim voucher error:", error);
      toast.error("Failed to claim voucher");
    } finally {
      setClaimingVoucherId(null);
    }
  };

  // Fetch saved addresses for logged-in users
  useEffect(() => {
    if (!user?.id) return;
    const fetchSavedAddresses = async () => {
      setLoadingSavedAddresses(true);
      try {
        const res = await fetchWithRetry(`${API_BASE}/user-addresses?userId=${user.id}`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        const data = await res.json();
        if (data.addresses) {
          setSavedAddresses(data.addresses);
          // If user has saved addresses, don't auto-show the new address form
          if (data.addresses.length > 0) {
            setShowAddNewAddress(false);
            // Auto-select the first saved address by default
            const first = data.addresses[0];
            setSelectedSavedAddressId(first.id);
            setAddress(first.address);
            setUnitNumber(first.unitNumber || "");
            setSelectedArea(first.area || "");
            setDeliveryFeeResult(null);
            if (first.lat && first.lng) {
              calculateDeliveryFee(first.lat, first.lng);
            } else if (first.area) {
              const areaMatch = JAKARTA_AREAS.find((a) => `${a.name}, ${a.district}` === first.area);
              if (areaMatch) {
                calculateDeliveryFee(areaMatch.lat, areaMatch.lng);
              }
            }
          } else {
            setShowAddNewAddress(true);
          }
        }
      } catch (err) {
        console.error("Failed to fetch saved addresses:", err);
      } finally {
        setLoadingSavedAddresses(false);
      }
    };
    fetchSavedAddresses();
  }, [user?.id]);

  // Select a saved address
  const handleSelectSavedAddress = async (addr: SavedAddress) => {
    setSelectedSavedAddressId(addr.id);
    setAddress(addr.address);
    setUnitNumber(addr.unitNumber || "");
    setSelectedArea(addr.area || "");
    setShowAddNewAddress(false);
    setErrors({});
    setDeliveryFeeResult(null);

    // Calculate delivery fee
    if (addr.lat && addr.lng) {
      await calculateDeliveryFee(addr.lat, addr.lng);
    } else if (addr.area) {
      const area = JAKARTA_AREAS.find((a) => `${a.name}, ${a.district}` === addr.area);
      if (area) {
        await calculateDeliveryFee(area.lat, area.lng);
      }
    } else if (addr.address) {
      // Try geocoding
      try {
        const res = await fetchWithRetry(`${API_BASE}/geocode-address`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ address: addr.address }),
        });
        const data = await res.json();
        if (data.found) {
          await calculateDeliveryFee(data.lat, data.lng);
        }
      } catch (err) {
        console.error("Failed to geocode saved address:", err);
      }
    }
  };

  // Delete a saved address
  const handleDeleteSavedAddress = async (addressId: string) => {
    if (!user?.id) return;
    setDeletingAddressId(addressId);
    try {
      const res = await fetchWithRetry(`${API_BASE}/user-addresses/${addressId}?userId=${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      const data = await res.json();
      if (data.success) {
        setSavedAddresses(data.addresses);
        if (selectedSavedAddressId === addressId) {
          setSelectedSavedAddressId(null);
          setAddress("");
          setUnitNumber("");
          setSelectedArea("");
          setDeliveryFeeResult(null);
        }
        if (data.addresses.length === 0) {
          setShowAddNewAddress(true);
        }
      }
    } catch (err) {
      console.error("Failed to delete address:", err);
    } finally {
      setDeletingAddressId(null);
    }
  };

  // Save the current new address
  const handleSaveNewAddress = async () => {
    if (!user?.id || !address.trim()) return;
    setSavingAddress(true);
    try {
      const res = await fetchWithRetry(`${API_BASE}/user-addresses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          userId: user.id,
          address: {
            label: newAddressLabel,
            address: address.trim(),
            unitNumber: unitNumber.trim(),
            area: selectedArea,
            lat: lastGpsCoords.current?.lat || null,
            lng: lastGpsCoords.current?.lng || null,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedAddresses(data.addresses);
        setSelectedSavedAddressId(data.address.id);
        setSaveNewAddress(false);
        setShowAddNewAddress(false);
      }
    } catch (err) {
      console.error("Failed to save address:", err);
    } finally {
      setSavingAddress(false);
    }
  };

  // Switch to "Add New" mode
  const handleStartAddNew = () => {
    setSelectedSavedAddressId(null);
    setShowAddNewAddress(true);
    setAddress("");
    setUnitNumber("");
    setSelectedArea("");
    setDeliveryFeeResult(null);
    setSaveNewAddress(false);
    setNewAddressLabel("Home");
    lastGpsCoords.current = null;
  };

  // Whether to show saved addresses UI (logged-in user with delivery)
  const isLoggedIn = !!user;
  const hasSavedAddresses = savedAddresses.length > 0;

  // Redirect if no cart items
  useEffect(() => {
    if (cartItems.length === 0) {
      navigate("/");
    }
  }, [cartItems.length, navigate]);

  // If not logged in and no guest info, redirect to checkout
  // Wait for auth to finish loading before making this decision
  useEffect(() => {
    if (authLoading) return; // Don't redirect while auth is still loading
    if (!user && !guestInfo) {
      navigate("/checkout");
    }
  }, [user, guestInfo, authLoading, navigate]);


  // Calculate delivery fee from lat/lng
  const calculateDeliveryFee = async (lat: number, lng: number) => {
    setCalculatingFee(true);
    setDeliveryFeeResult(null);
    try {
      const response = await fetchWithRetry(`${API_BASE}/calculate-delivery-fee`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ lat, lng }),
      });
      const data = await response.json();
      setDeliveryFeeResult(data);
    } catch (err) {
      console.error("Failed to calculate delivery fee:", err);
      setDeliveryFeeResult(null);
    } finally {
      setCalculatingFee(false);
    }
  };

  // Resolve GPS coordinates to address and calculate delivery fee
  const resolveLocationAndFinish = async (latitude: number, longitude: number) => {
    // Reverse geocode to get a real street address
    let resolvedAddress = "";
    try {
      // Call our server reverse-geocode endpoint
      const geoRes = await fetchWithRetry(`${API_BASE}/reverse-geocode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ lat: latitude, lng: longitude }),
      });
      const geoData = await geoRes.json();

      if (geoData.found && geoData.address) {
        resolvedAddress = geoData.address;
      }
    } catch (err) {
      console.warn("Server reverse geocode failed, trying Nominatim directly");
    }

    // Fallback: call Nominatim directly from frontend if server failed
    if (!resolvedAddress) {
      try {
        const directRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&zoom=18`,
          { headers: { "User-Agent": "RestaurantLoyaltyApp/1.0" } }
        );
        const directData = await directRes.json();

        if (directData && !directData.error && directData.display_name) {
          resolvedAddress = directData.display_name;
        }
      } catch (err2) {
        // Direct Nominatim also failed
      }
    }

    // Set the resolved address or fallback to coordinates
    if (resolvedAddress) {
      setAddress(resolvedAddress);
    } else {
      const fallback = `GPS Location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
      setAddress(fallback);
    }
    
    setGettingLocation(false);
    setGpsAccuracy(null);
    await calculateDeliveryFee(latitude, longitude);
    lastGpsCoords.current = { lat: latitude, lng: longitude };
  };

  // Use GPS location with progressive accuracy refinement via watchPosition
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setErrors({ address: "Geolocation is not supported by your browser" });
      return;
    }

    // Clean up any previous watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setGettingLocation(true);
    setGpsAccuracy(null);
    setDeliveryFeeResult(null);
    setErrors({});

    const ACCURACY_THRESHOLD = 30; // meters — good enough for street-level delivery
    const MAX_WAIT_MS = 15000; // max 15 seconds to get a good fix
    const MIN_READINGS = 2; // at least 2 readings before accepting

    let bestPosition: GeolocationPosition | null = null;
    let readingCount = 0;

    const finalize = () => {
      // Stop watching
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      clearTimeout(timeoutId);

      if (bestPosition) {
        const { latitude, longitude } = bestPosition.coords;
        console.log(`📍 GPS finalized: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (accuracy: ${bestPosition.coords.accuracy.toFixed(0)}m after ${readingCount} readings)`);
        resolveLocationAndFinish(latitude, longitude);
      } else {
        setGettingLocation(false);
        setGpsAccuracy(null);
        setErrors({ address: "Could not get an accurate location. Please select your area below." });
        setShowAreaSelector(true);
      }
    };

    // Timeout fallback — use best reading we have after MAX_WAIT_MS
    const timeoutId = setTimeout(() => {
      console.log(`⏱️ GPS timeout after ${MAX_WAIT_MS / 1000}s, using best position (accuracy: ${bestPosition ? bestPosition.coords.accuracy.toFixed(0) + 'm' : 'none'})`);
      finalize();
    }, MAX_WAIT_MS);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        readingCount++;
        const accuracy = position.coords.accuracy;
        console.log(`📡 GPS reading #${readingCount}: accuracy ${accuracy.toFixed(0)}m`);
        setGpsAccuracy(Math.round(accuracy));

        // Keep the most accurate reading
        if (!bestPosition || accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }

        // If we have a good enough reading and at least MIN_READINGS, use it immediately
        if (accuracy <= ACCURACY_THRESHOLD && readingCount >= MIN_READINGS) {
          console.log(`✅ GPS accuracy ${accuracy.toFixed(0)}m meets threshold of ${ACCURACY_THRESHOLD}m`);
          finalize();
        }
      },
      (error) => {
        clearTimeout(timeoutId);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        setGettingLocation(false);
        setGpsAccuracy(null);
        const errorMessages: Record<number, string> = {
          1: "Location access denied",
          2: "Location unavailable",
          3: "Location request timed out",
        };
        console.warn(`Geolocation error (code ${error?.code}): ${errorMessages[error?.code] || "Unknown error"} - ${error?.message || "No details"}`);
        if (error?.code === 1) {
          setErrors({ address: "Location access denied. Please select your area below." });
        } else {
          setErrors({ address: "Could not get your location. Please select your area below." });
        }
        setShowAreaSelector(true);
      },
      {
        enableHighAccuracy: true,
        timeout: MAX_WAIT_MS,
        maximumAge: 0, // Never use cached positions
      }
    );

    watchIdRef.current = watchId;
  };

  // Cleanup watchPosition on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Geocode typed address
  const handleGeocodeAddress = async () => {
    if (!address.trim()) return;
    
    setGeocoding(true);
    setDeliveryFeeResult(null);
    try {
      const response = await fetchWithRetry(`${API_BASE}/geocode-address`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = await response.json();

      if (data.found) {
        await calculateDeliveryFee(data.lat, data.lng);
      } else {
        // Geocoding failed, show area selector
        setShowAreaSelector(true);
        setDeliveryFeeResult(null);
      }
    } catch (err) {
      console.error("Geocoding failed:", err);
      setShowAreaSelector(true);
    } finally {
      setGeocoding(false);
    }
  };

  // Select a Jakarta area
  const handleSelectArea = async (areaName: string) => {
    const area = JAKARTA_AREAS.find((a) => `${a.name}, ${a.district}` === areaName);
    if (!area) return;

    setSelectedArea(areaName);
    if (!address.trim()) {
      setAddress(`${area.name}, ${area.district}`);
    }
    await calculateDeliveryFee(area.lat, area.lng);
    setShowAreaSelector(false);
    setAreaSearch("");
  };

  // Debounced place search via Nominatim
  const handlePlaceSearch = (query: string) => {
    setAreaSearch(query);
    setPlaceSearchResults([]);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (query.trim().length < 2) {
      setSearchingPlaces(false);
      setShowPlaceResults(false);
      return;
    }

    setSearchingPlaces(true);
    setShowPlaceResults(true);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetchWithRetry(
          `${API_BASE}/search-places?q=${encodeURIComponent(query.trim())}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        const data = await res.json();
        setPlaceSearchResults(data.results || []);
      } catch (err) {
        console.error("Place search failed:", err);
        setPlaceSearchResults([]);
      } finally {
        setSearchingPlaces(false);
      }
    }, 400);
  };

  // Select a place from Nominatim search results
  const handleSelectPlace = async (place: any) => {
    setSelectedArea(place.name);
    setAddress(place.fullAddress || place.name);
    setShowAreaSelector(false);
    setShowPlaceResults(false);
    setAreaSearch("");
    setPlaceSearchResults([]);
    lastGpsCoords.current = { lat: place.lat, lng: place.lng };
    setErrors({});
    setDeliveryFeeResult(null);
    await calculateDeliveryFee(place.lat, place.lng);
  };

  // Reset delivery fee when switching to pickup
  useEffect(() => {
    if (orderType === "pickup") {
      setDeliveryFeeResult(null);
      setShowAreaSelector(false);
      setSelectedArea("");
    }
  }, [orderType]);

  if (cartItems.length === 0) {
    return null;
  }

  const displayPhone = user?.phone || guestInfo?.phone || "";
  const displayName = user?.name || guestInfo?.name || "Guest";

  const subtotal = totalPrice;
  // Calculate promo discount
  let promoDiscount = 0;
  if (promoApplied) {
    if (promoApplied.hasRestrictions && promoApplied.applicableCategories && promoApplied.applicableCategories.length > 0) {
      // When category restrictions exist, calculate discount based on eligible cart items only
      const eligibleTotal = cartItems.reduce((sum, item) => {
        const cat = (item as any).category || "Uncategorized";
        if (promoApplied.applicableCategories!.includes(cat)) {
          return sum + (item.price * item.quantity);
        }
        return sum;
      }, 0);

      if (promoApplied.discountType === "percentage") {
        promoDiscount = Math.round(eligibleTotal * promoApplied.discountValue / 100);
      } else if (promoApplied.discountType === "fixed") {
        promoDiscount = Math.min(promoApplied.discountValue, eligibleTotal);
      }
    } else {
      if (promoApplied.discountType === "percentage") {
        promoDiscount = Math.round(subtotal * promoApplied.discountValue / 100);
      } else if (promoApplied.discountType === "fixed") {
        promoDiscount = promoApplied.discountValue;
      }
    }
    // Cap discount at subtotal
    promoDiscount = Math.min(promoDiscount, subtotal);
  }
  const discountedSubtotal = subtotal - promoDiscount;
  const tax = Math.round(discountedSubtotal * (taxRate / 100)); // Admin-defined PPN on discounted amount
  const rawDeliveryFee = (orderType === "delivery" && deliveryFeeResult?.available && deliveryFeeResult?.fee) ? deliveryFeeResult.fee : 0;
  const deliveryFee = promoApplied?.freeDelivery ? 0 : rawDeliveryFee;
  const estimatedTotal = discountedSubtotal + tax + deliveryFee;

  // Validate promo code
  const handleApplyPromo = async (codeOverride?: string) => {
    const code = (codeOverride || promoCode).trim().toUpperCase();
    if (!code) {
      setPromoError("Please enter a promo code");
      setPromoCode("");
      return;
    }
    if (codeOverride) setPromoCode(code);
    if (!user || !accessToken) {
      setPromoError("Please sign in to use promo codes");
      setPromoCode("");
      return;
    }
    setPromoLoading(true);
    setPromoError("");
    try {
      const cartPayload = cartItems.map(item => ({
        id: item.id,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
        category: (item as any).category || "Uncategorized",
      }));
      console.log("🔍 Applying promo code:", code, "Cart categories:", cartPayload.map(i => i.category));
      const response = await fetchWithRetry(`${API_BASE}/validate-promo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: JSON.stringify({ 
          promoCode: code, 
          subtotal,
          cartItems: cartPayload,
        }),
      });
      const data = await response.json();
      console.log("🔍 Promo validation response:", data);
      if (data.valid) {
        setPromoApplied({
          code,
          userVoucherId: data.userVoucherId,
          discountType: data.discountType,
          discountValue: data.discountValue,
          discountAmount: data.discountAmount,
          voucherTitle: data.voucherTitle,
          freeDelivery: data.freeDelivery,
          freeItem: data.freeItem,
          applicableCategories: data.applicableCategories || [],
          hasRestrictions: data.hasRestrictions || false,
        });
        setPromoError("");
        toast.success(`Promo "${data.voucherTitle}" applied!`);
      } else {
        setPromoError(data.error || "Invalid promo code");
        setPromoApplied(null);
        setPromoCode("");
      }
    } catch (error) {
      console.error("Failed to validate promo:", error);
      setPromoError("Failed to validate promo code");
      setPromoCode("");
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoApplied(null);
    setPromoCode("");
    setPromoError("");
    toast("Promo code removed");
  };

  const handleQuickApplyPromo = (code: string) => {
    handleApplyPromo(code);
  };

  const handleProceed = () => {
    const newErrors: { address?: string; paymentMethod?: string; unitNumber?: string } = {};

    if (orderType === "delivery" && !address.trim()) {
      newErrors.address = "Delivery address is required";
    }

    if (orderType === "delivery" && deliveryFeeResult && !deliveryFeeResult.available) {
      newErrors.address = "Delivery is not available to this location";
    }

    if (!paymentMethod) {
      newErrors.paymentMethod = "Please select a payment method";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Scroll to the first error field
      const firstErrorKey = Object.keys(newErrors)[0];
      const errorEl = document.getElementById(`field-${firstErrorKey}`);
      if (errorEl) {
        errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // Navigate to order confirmation with all details
    navigate("/order-confirmation", {
      state: {
        orderType,
        paymentMethod,
        address: orderType === "delivery" ? (address.trim() + (unitNumber.trim() ? `, ${unitNumber.trim()}` : "")) : "",
        phone: displayPhone,
        specialInstructions: specialInstructions.trim(),
        fromCart: true,
        cartItems: cartItems,
        guestInfo: guestInfo,
        deliveryFee: rawDeliveryFee,
        deliveryZone: deliveryFeeResult?.zone || null,
        deliveryDistance: deliveryFeeResult?.distance || null,
        promoApplied: promoApplied || null,
        promoDiscount,
        taxRate,
      },
    });
  };

  // Filtered areas for search
  const areasByDistrict = getAreasByDistrict();
  const filteredDistricts = Object.entries(areasByDistrict)
    .map(([district, areas]) => ({
      district,
      areas: areas.filter(
        (a) =>
          a.name.toLowerCase().includes(areaSearch.toLowerCase()) ||
          a.district.toLowerCase().includes(areaSearch.toLowerCase()) ||
          (a.type && a.type.toLowerCase().includes(areaSearch.toLowerCase()))
      ),
    }))
    .filter((d) => d.areas.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/50">
      <Header 
        showBack 
        title={orderStep === 1 ? "Order Details" : "Payment & Review"} 
        onBack={orderStep === 2 ? () => { setOrderStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); } : undefined}
      />

      <main className="max-w-md mx-auto px-4 py-6 pb-32">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${orderStep === 1 ? "text-white shadow-lg" : "text-white"}`}
              style={{ backgroundColor: orderStep === 1 ? BRAND : "#22C55E" }}>
              {orderStep > 1 ? <CheckCircle2 className="w-4.5 h-4.5" /> : "1"}
            </div>
            <span className={`text-xs font-semibold ${orderStep === 1 ? "text-[#1E1B4B]" : "text-green-600"}`}>
              {orderType === "delivery" ? "Delivery" : "Pickup"}
            </span>
          </div>
          <div className={`w-12 h-0.5 rounded-full transition-all ${orderStep >= 2 ? "" : "bg-gray-200"}`} style={orderStep >= 2 ? { backgroundColor: BRAND } : {}} />
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${orderStep === 2 ? "text-white shadow-lg" : "bg-gray-200 text-gray-400"}`}
              style={orderStep === 2 ? { backgroundColor: BRAND } : {}}>
              2
            </div>
            <span className={`text-xs font-semibold ${orderStep === 2 ? "text-[#1E1B4B]" : "text-gray-400"}`}>
              Payment
            </span>
          </div>
        </div>

        {/* ========== STEP 1: Delivery / Pickup Details ========== */}
        {orderStep === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
            {/* Customer Info */}
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-4 shadow-sm">
              <h2 className="text-base font-bold text-[#1E1B4B] mb-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-indigo-600" />
                </div>
                Customer
              </h2>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md" style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #FF4081 100%)` }}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-[#1E1B4B]">{displayName}</p>
                    {guestInfo && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Guest</span>
                    )}
                  </div>
                </div>
                {displayPhone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 ml-12">
                    <Phone className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{displayPhone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Order Type */}
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-4 shadow-sm">
              <h2 className="text-base font-bold text-[#1E1B4B] mb-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Truck className="w-4 h-4 text-indigo-600" />
                </div>
                Order Type
              </h2>
              <RadioGroup
                value={orderType}
                onValueChange={(val) => {
                  setOrderType(val as OrderType);
                  setErrors({});
                }}
                className="grid grid-cols-2 gap-3"
              >
                <label
                  htmlFor="delivery"
                  className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    orderType === "delivery"
                      ? "border-[#3B82F6] bg-blue-50/80 shadow-md"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <RadioGroupItem value="delivery" id="delivery" className="sr-only" />
                  {orderType === "delivery" && (
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <Truck
                    className="w-7 h-7"
                    style={{ color: orderType === "delivery" ? "#3B82F6" : "#9CA3AF" }}
                  />
                  <span
                    className={`text-sm font-bold ${
                      orderType === "delivery" ? "text-[#1E1B4B]" : "text-gray-500"
                    }`}
                  >
                    Delivery
                  </span>
                  <span className="text-[10px] text-gray-400">To your address</span>
                </label>

                <label
                  htmlFor="pickup"
                  className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    orderType === "pickup"
                      ? "border-[#3B82F6] bg-blue-50/80 shadow-md"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <RadioGroupItem value="pickup" id="pickup" className="sr-only" />
                  {orderType === "pickup" && (
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <ShoppingBag
                    className="w-7 h-7"
                    style={{ color: orderType === "pickup" ? "#3B82F6" : "#9CA3AF" }}
                  />
                  <span
                    className={`text-sm font-bold ${
                      orderType === "pickup" ? "text-[#1E1B4B]" : "text-gray-500"
                    }`}
                  >
                    Pickup
                  </span>
                  <span className="text-[10px] text-gray-400">Come to store</span>
                </label>
              </RadioGroup>
            </div>

            {/* Delivery Address (only for delivery) */}
            {orderType === "delivery" && (
              <div id="field-address" className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                <h2 className="text-base font-bold text-[#1E1B4B] mb-3 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-indigo-600" />
                  </div>
                  Delivery Address
                </h2>

            {/* Saved Addresses (logged-in users only) */}
            {isLoggedIn && (
              <div className="mb-3">
                {loadingSavedAddresses ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading saved addresses...
                  </div>
                ) : hasSavedAddresses ? (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
                      <Bookmark className="w-3 h-3" />
                      Saved Addresses
                    </Label>
                    {savedAddresses.map((addr) => {
                      const isSelected = selectedSavedAddressId === addr.id;
                      const LabelIcon = LABEL_OPTIONS.find((l) => l.value === addr.label)?.icon || Tag;
                      return (
                        <div
                          key={addr.id}
                          className={`relative rounded-lg border-2 transition-all ${
                            isSelected
                              ? "bg-pink-50/50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                          style={isSelected ? { borderColor: BRAND } : {}}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectSavedAddress(addr)}
                            className="w-full text-left p-3 pr-10"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <LabelIcon
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: isSelected ? BRAND : "#6B7280" }}
                              />
                              <span
                                className={`text-xs font-semibold uppercase tracking-wide ${
                                  isSelected ? "" : "text-gray-500"
                                }`}
                                style={isSelected ? { color: BRAND } : {}}
                              >
                                {addr.label}
                              </span>
                            </div>
                            <p className="text-sm text-gray-800 leading-snug line-clamp-2">
                              {addr.address}
                            </p>
                            {addr.unitNumber && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {addr.unitNumber}
                              </p>
                            )}
                          </button>
                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm("Delete this saved address?")) {
                                handleDeleteSavedAddress(addr.id);
                              }
                            }}
                            disabled={deletingAddressId === addr.id}
                            className="absolute top-3 right-3 p-1 rounded-md hover:bg-red-50 transition-colors group"
                          >
                            {deletingAddressId === addr.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-gray-300 group-hover:text-red-500 transition-colors" />
                            )}
                          </button>
                          {/* Selected indicator */}
                          {isSelected && (
                            <div className="absolute top-3 right-10">
                              <CheckCircle2 className="w-4 h-4" style={{ color: BRAND }} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add New Address button */}
                    {!showAddNewAddress && (
                      <button
                        type="button"
                        onClick={handleStartAddNew}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-xs font-medium text-gray-500 transition-colors"
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.color = BRAND; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.color = '#6B7280'; }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add New Address
                      </button>
                    )}
                  </div>
                ) : null}

                {/* Divider between saved and new */}
                {hasSavedAddresses && showAddNewAddress && (
                  <div className="flex items-center gap-2 mt-3 mb-1">
                    <div className="flex-1 border-t border-gray-200" />
                    <span className="text-[10px] text-gray-400 font-medium uppercase">New Address</span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>
                )}
              </div>
            )}

            {/* Address Form (shown always for guests, or when "Add New" for logged-in users) */}
            {(!isLoggedIn || showAddNewAddress || (!hasSavedAddresses && !loadingSavedAddresses)) && (
            <div className="space-y-3">
              {/* Place Search — Live Autocomplete */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  <Search className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                  Search Place, Apartment, Hotel, Street...
                </Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAreaSelector(!showAreaSelector);
                      setShowPlaceResults(false);
                      setPlaceSearchResults([]);
                    }}
                    className={`w-full flex items-center justify-between h-10 px-3 rounded-lg border-2 text-sm transition-colors ${
                      selectedArea
                        ? "bg-pink-50/40 text-gray-900"
                        : "border-amber-200 bg-amber-50/60 text-gray-400"
                    }`}
                    style={selectedArea ? { borderColor: BRAND } : {}}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <MapPinned className="w-4 h-4 shrink-0" style={{ color: selectedArea ? BRAND : "#9CA3AF" }} />
                      <span className={selectedArea ? "font-medium text-sm" : "text-sm"}>
                        {selectedArea || "Search or select location..."}
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${showAreaSelector ? "rotate-180" : ""}`} />
                  </button>

                  {/* Dropdown panel with live search */}
                  {showAreaSelector && (
                    <div className="absolute z-50 left-0 right-0 mt-1 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="p-2 border-b border-gray-100 bg-gray-50">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <Input
                            placeholder="Type apartment, hotel, mall, street name..."
                            value={areaSearch}
                            onChange={(e) => handlePlaceSearch(e.target.value)}
                            className="h-8 text-xs bg-white pl-8"
                            autoFocus
                          />
                          {searchingPlaces && (
                            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                          )}
                        </div>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {/* Live Nominatim search results */}
                        {showPlaceResults && areaSearch.trim().length >= 2 && (
                          <>
                            {searchingPlaces && placeSearchResults.length === 0 && (
                              <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Searching places...
                              </div>
                            )}
                            {!searchingPlaces && placeSearchResults.length === 0 && areaSearch.trim().length >= 2 && (
                              <div className="px-3 py-4 text-center">
                                <p className="text-xs text-gray-400">No places found for &quot;{areaSearch}&quot;</p>
                                <p className="text-[10px] text-gray-300 mt-1">Try a different name or check spelling</p>
                              </div>
                            )}
                            {placeSearchResults.length > 0 && (
                              <>
                                <div className="px-3 py-1.5 bg-blue-50 text-[10px] font-semibold text-blue-600 uppercase tracking-wider sticky top-0 z-10 flex items-center gap-1">
                                  <Search className="w-3 h-3" />
                                  Search Results
                                </div>
                                {placeSearchResults.map((place) => (
                                  <button
                                    key={place.id}
                                    type="button"
                                    onClick={() => handleSelectPlace(place)}
                                    className="w-full text-left px-3 py-2.5 hover:bg-pink-50 transition-colors border-b border-gray-50 last:border-0"
                                  >
                                    <div className="flex items-start gap-2">
                                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm font-medium text-gray-800 truncate">{place.name}</span>
                                          <span className="shrink-0 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                            {place.type}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{place.subtitle}</p>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </>
                            )}
                            {/* Divider before popular areas */}
                            {(placeSearchResults.length > 0 || (!searchingPlaces && areaSearch.trim().length >= 2)) && filteredDistricts.length > 0 && (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50">
                                <div className="flex-1 border-t border-gray-200" />
                                <span className="text-[9px] text-gray-400 font-medium uppercase">Popular Places & Areas</span>
                                <div className="flex-1 border-t border-gray-200" />
                              </div>
                            )}
                          </>
                        )}

                        {/* Static Jakarta areas (always shown, filtered by search) */}
                        {filteredDistricts.map(({ district, areas }) => (
                          <div key={district}>
                            <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wider sticky top-0 z-10">
                              {district}
                            </div>
                            {areas.map((area) => {
                              const areaKey = `${area.name}, ${area.district}`;
                              return (
                                <button
                                  key={areaKey}
                                  type="button"
                                  onClick={() => handleSelectArea(areaKey)}
                                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-pink-50 transition-colors flex items-center justify-between ${
                                    selectedArea === areaKey ? "bg-pink-50 font-medium" : "text-gray-700"
                                  }`}
                                  style={selectedArea === areaKey ? { color: BRAND } : {}}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="truncate">{area.name}</span>
                                    {area.type && area.type !== "Area" && (
                                      <span className={`shrink-0 text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
                                        area.type === "Apartment" ? "bg-blue-50 text-blue-600" :
                                        area.type === "Mall" ? "bg-purple-50 text-purple-600" :
                                        area.type === "Hotel" ? "bg-amber-50 text-amber-600" :
                                        area.type === "Hospital" ? "bg-red-50 text-red-600" :
                                        area.type === "University" || area.type === "School" ? "bg-green-50 text-green-600" :
                                        area.type === "Station" ? "bg-cyan-50 text-cyan-600" :
                                        area.type === "Landmark" ? "bg-orange-50 text-orange-600" :
                                        "bg-gray-100 text-gray-500"
                                      }`}>
                                        {area.type}
                                      </span>
                                    )}
                                  </div>
                                  {selectedArea === areaKey && (
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: BRAND }} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                        {filteredDistricts.length === 0 && !showPlaceResults && (
                          <p className="text-xs text-gray-400 text-center py-4">
                            No areas found for &quot;{areaSearch}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* OR divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-indigo-200/60" />
                <span className="text-[10px] text-indigo-400 font-semibold uppercase">or detect automatically</span>
                <div className="flex-1 border-t border-indigo-200/60" />
              </div>

              {/* GPS Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs h-10 border-2 border-green-200 bg-green-50/60 text-green-700 font-semibold hover:bg-green-100 hover:border-green-300 transition-all"
                onClick={handleUseMyLocation}
                disabled={gettingLocation}
              >
                {gettingLocation ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Navigation className="w-3.5 h-3.5 text-green-600" />
                )}
                {gettingLocation
                  ? gpsAccuracy
                    ? `Refining location... (±${gpsAccuracy}m)`
                    : "Acquiring GPS signal..."
                  : "Use My Current Location (GPS)"}
              </Button>

              {/* Room / Unit Number */}
              <div id="field-unitNumber">
                <Label className="text-xs text-gray-500 mb-1 block">
                  <Building className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                  Room / Unit / Floor Number
                  <span className="text-red-400 ml-0.5">*</span>
                </Label>
                <Input
                  placeholder="e.g. Room 301, Tower A, 3rd Floor"
                  value={unitNumber}
                  onChange={(e) => {
                    setUnitNumber(e.target.value);
                    if (errors.unitNumber) setErrors((prev: any) => ({ ...prev, unitNumber: undefined }));
                  }}
                  className={`h-10 text-sm bg-amber-50/70 border-amber-200 focus:border-amber-400 ${errors.unitNumber ? "border-red-400" : ""}`}
                />
                {errors.unitNumber && (
                  <p className="text-[10px] text-red-500 mt-0.5">{errors.unitNumber}</p>
                )}
              </div>

              {/* Full address textarea */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Full Address / Street Details</Label>
                <Textarea
                  placeholder="Use GPS or search an area above to fill this automatically"
                  value={address}
                  readOnly
                  rows={2}
                  className="resize-none bg-amber-50/50 border-amber-200 text-gray-700 cursor-not-allowed"
                />
              </div>

              {/* Detect fee from typed address (only if no area selected) */}
              {!selectedArea && address.trim() && !deliveryFeeResult && !calculatingFee && !geocoding && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs h-8"
                  onClick={handleGeocodeAddress}
                >
                  <Search className="w-3.5 h-3.5" />
                  Calculate delivery fee for this address
                </Button>
              )}

              {/* Loading states */}
              {(calculatingFee || geocoding) && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {geocoding ? "Finding your location..." : "Calculating delivery fee..."}
                </div>
              )}

              {/* Delivery fee result */}
              {deliveryFeeResult && deliveryFeeResult.available && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-800">
                        Delivery available!
                      </p>
                      <p className="text-xs text-green-700 mt-0.5">
                        Zone: <span className="font-medium">{deliveryFeeResult.zone?.name}</span>
                        {" "}&middot;{" "}
                        Distance: <span className="font-medium">{deliveryFeeResult.distance?.toFixed(1)} km</span>
                      </p>
                      <p className="text-sm font-bold mt-1" style={{ color: BRAND }}>
                        Delivery Fee: {formatIDR(deliveryFeeResult.fee || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {deliveryFeeResult && !deliveryFeeResult.available && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">
                        Delivery not available
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">
                        {deliveryFeeResult.message || `Your location is beyond our maximum delivery distance of ${deliveryFeeResult.maxDistance} km.`}
                      </p>
                      {deliveryFeeResult.distance && (
                        <p className="text-xs text-red-500 mt-0.5">
                          Your distance: {deliveryFeeResult.distance.toFixed(1)} km
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {errors.address && (
                <p className="text-xs text-red-500">{errors.address}</p>
              )}

              {!deliveryFeeResult && !calculatingFee && !geocoding && (
                <p className="text-[11px] text-gray-400">
                  Select an area, use GPS, or type your address to see the delivery fee
                </p>
              )}

              {/* Save Address option (logged-in users adding new address) */}
              {isLoggedIn && showAddNewAddress && address.trim() && (
                <div className="border-t border-gray-100 pt-3 mt-1">
                  {!saveNewAddress ? (
                    <button
                      type="button"
                      onClick={() => setSaveNewAddress(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200"
                      style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #FF4081 100%)` }}
                    >
                      <Bookmark className="w-4.5 h-4.5" />
                      Save This Address for Future Orders
                    </button>
                  ) : (
                    <div className="space-y-2 animate-in fade-in duration-150">
                      <Label className="text-xs text-gray-500 block">Label this address</Label>
                      <div className="flex gap-2">
                        {LABEL_OPTIONS.map(({ value, icon: Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setNewAddressLabel(value)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              newAddressLabel === value
                                ? "bg-pink-50"
                                : "border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                            style={newAddressLabel === value ? { borderColor: BRAND, color: BRAND } : {}}
                          >
                            <Icon className="w-3 h-3" />
                            {value}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 h-8 text-xs text-white"
                          style={{ backgroundColor: BRAND }}
                          onClick={handleSaveNewAddress}
                          disabled={savingAddress}
                        >
                          {savingAddress ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <Bookmark className="w-3 h-3 mr-1" />
                          )}
                          {savingAddress ? "Saving..." : "Save Address"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setSaveNewAddress(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Delivery fee result shown outside form when using saved address */}
            {isLoggedIn && !showAddNewAddress && selectedSavedAddressId && (
              <div className="mt-3 space-y-3">
                {(calculatingFee || geocoding) && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Calculating delivery fee...
                  </div>
                )}
                {deliveryFeeResult && deliveryFeeResult.available && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-green-800">Delivery available!</p>
                        <p className="text-xs text-green-700 mt-0.5">
                          Zone: <span className="font-medium">{deliveryFeeResult.zone?.name}</span>
                          {" "}&middot;{" "}
                          Distance: <span className="font-medium">{deliveryFeeResult.distance?.toFixed(1)} km</span>
                        </p>
                        <p className="text-sm font-bold mt-1" style={{ color: BRAND }}>
                          Delivery Fee: {formatIDR(deliveryFeeResult.fee || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {deliveryFeeResult && !deliveryFeeResult.available && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-red-800">Delivery not available</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          {deliveryFeeResult.message || `Beyond max delivery distance of ${deliveryFeeResult.maxDistance} km.`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {errors.address && (
                  <p className="text-xs text-red-500">{errors.address}</p>
                )}
              </div>
            )}
          </div>
        )}

            {/* Special Instructions */}
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/90 to-yellow-50/60 p-4 shadow-sm">
              <h2 className="text-base font-bold text-[#92400E] mb-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-amber-600" />
                </div>
                Special Instructions
              </h2>
              <Textarea
                placeholder="Any allergies, spice level preferences, or special requests..."
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={3}
                className="resize-none bg-amber-50/70 border-amber-200 focus:border-amber-400 placeholder:text-amber-300"
              />
            </div>
          </div>
        )}

        {/* ========== STEP 2: Payment & Review ========== */}
        {orderStep === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Delivery/Pickup Summary Mini Card */}
            <div className="rounded-xl border border-green-200 bg-green-50/60 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    {orderType === "delivery" ? (
                      <Truck className="w-4 h-4 text-green-600" />
                    ) : (
                      <ShoppingBag className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-green-800">
                      {orderType === "delivery" ? "Delivery" : "Pickup"}
                    </p>
                    {orderType === "delivery" && address && (
                      <p className="text-[11px] text-green-700 line-clamp-1 max-w-[200px]">
                        {unitNumber && `${unitNumber}, `}{selectedArea || address.slice(0, 40)}
                      </p>
                    )}
                    {orderType === "pickup" && (
                      <p className="text-[11px] text-green-700">Come to store</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setOrderStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-green-300 text-green-700 hover:bg-green-100 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Payment Method */}
            <div id="field-paymentMethod" className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-4 shadow-sm">
              <h2 className="text-base font-bold text-[#1E1B4B] mb-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                </div>
                Payment Method
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!onlinePaymentEnabled}
                  onClick={() => { if (!onlinePaymentEnabled) return; setPaymentMethod("pay-now"); if (errors.paymentMethod) setErrors((prev) => ({ ...prev, paymentMethod: undefined })); }}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    !onlinePaymentEnabled
                      ? "border-gray-200 bg-gray-100 cursor-not-allowed opacity-60"
                      : paymentMethod === "pay-now"
                        ? "border-[#3B82F6] bg-blue-50/80 shadow-md cursor-pointer"
                        : errors.paymentMethod ? "border-red-300 hover:border-red-400 cursor-pointer" : "border-gray-200 bg-white hover:border-gray-300 cursor-pointer"
                  }`}
                >
                  {paymentMethod === "pay-now" && onlinePaymentEnabled && (
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <CreditCard
                    className="w-7 h-7"
                    style={{ color: !onlinePaymentEnabled ? "#D1D5DB" : paymentMethod === "pay-now" ? "#3B82F6" : "#9CA3AF" }}
                  />
                  <span
                    className={`text-sm font-bold ${
                      !onlinePaymentEnabled ? "text-gray-400" : paymentMethod === "pay-now" ? "text-[#1E1B4B]" : "text-gray-500"
                    }`}
                  >
                    Pay Now
                  </span>
                  {!onlinePaymentEnabled ? (
                    <span className="text-[10px] text-red-400 text-center leading-tight font-medium">Currently not accepting online payment</span>
                  ) : (
                    <span className="text-[10px] text-gray-400 text-center leading-tight">GoPay, QRIS, Bank Transfer</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setPaymentMethod("pay-later"); if (errors.paymentMethod) setErrors((prev) => ({ ...prev, paymentMethod: undefined })); }}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    paymentMethod === "pay-later"
                      ? "border-[#3B82F6] bg-blue-50/80 shadow-md"
                      : errors.paymentMethod ? "border-red-300 hover:border-red-400" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {paymentMethod === "pay-later" && (
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <Wallet
                    className="w-7 h-7"
                    style={{ color: paymentMethod === "pay-later" ? "#3B82F6" : "#9CA3AF" }}
                  />
                  <span
                    className={`text-sm font-bold ${
                      paymentMethod === "pay-later" ? "text-[#1E1B4B]" : "text-gray-500"
                    }`}
                  >
                    {orderType === "delivery" ? "Pay on Delivery" : "Pay on Pickup"}
                  </span>
                  <span className="text-[10px] text-gray-400 text-center leading-tight">Cash / Bank Transfer on {orderType === "delivery" ? "delivery" : "pickup"}</span>
                </button>
              </div>

              {errors.paymentMethod && (
                <p className="text-xs text-red-500 mt-2">{errors.paymentMethod}</p>
              )}
            </div>

            {/* Promo Code Section */}
            {user && (
              <div className="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50/60 to-rose-50/40 p-4 shadow-sm">
                <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: BRAND }}>
                  <div className="w-7 h-7 rounded-lg bg-pink-100 flex items-center justify-center">
                    <Ticket className="w-4 h-4" style={{ color: BRAND }} />
                  </div>
                  Promo Code
                </h2>
            {promoApplied ? (
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: "#FFF0F4" }}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm tracking-wider" style={{ color: BRAND }}>
                      {promoApplied.code}
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {promoApplied.voucherTitle}
                    {promoApplied.discountType === "percentage" && ` - ${promoApplied.discountValue}% off`}
                    {promoApplied.discountType === "fixed" && ` - ${formatIDR(promoApplied.discountValue)} off`}
                    {promoApplied.freeDelivery && " - Free Delivery"}
                    {promoApplied.freeItem && ` - ${promoApplied.freeItem}`}
                  </p>
                  {promoApplied.hasRestrictions && promoApplied.applicableCategories && promoApplied.applicableCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="text-[10px] text-purple-600 font-medium">Applies to:</span>
                      {promoApplied.applicableCategories.map((cat) => (
                        <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleRemovePromo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-red-50 transition-colors border border-red-200 text-red-500 hover:text-red-600 hover:border-red-300 shrink-0"
                  title="Remove promo"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-semibold">Remove</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter promo code"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      setPromoError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                    className="flex-1 text-sm font-mono tracking-wider uppercase bg-pink-50/60 border-pink-200 focus:border-pink-400"
                    disabled={promoLoading}
                  />
                  <Button
                    onClick={() => handleApplyPromo()}
                    disabled={promoLoading || !promoCode.trim()}
                    className="px-5 text-sm font-bold text-white shrink-0 rounded-lg"
                    style={{ backgroundColor: "#10B981" }}
                  >
                    {promoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
                {promoError && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {promoError}
                  </p>
                )}

                {/* Available Promo Codes */}
                {loadingPromos ? (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                    <p className="text-xs text-gray-400">Loading your promos...</p>
                  </div>
                ) : availablePromos.length > 0 ? (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5" />
                      Your Available Promos ({availablePromos.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {availablePromos.map((promo) => {
                        const v = promo.voucher;
                        const getDiscountLabel = () => {
                          if (v.discountType === "percentage" && v.discountValue) return `${v.discountValue}% OFF`;
                          if (v.discountType === "fixed" && v.discountValue) return `${formatIDR(v.discountValue)} OFF`;
                          if (v.discountType === "free_delivery") return "FREE DELIVERY";
                          if (v.discountType === "freebie") return "FREE ITEM";
                          return "";
                        };
                        const meetsMinOrder = !v.minOrderAmount || subtotal >= v.minOrderAmount;
                        return (
                          <button
                            key={promo.id}
                            onClick={() => handleQuickApplyPromo(promo.promoCode)}
                            disabled={promoLoading || !meetsMinOrder}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border-2 text-left transition-all ${
                              !meetsMinOrder
                                ? "border-gray-200 opacity-50 cursor-not-allowed"
                                : "border-gray-200 hover:bg-pink-50 active:scale-[0.98]"
                            }`}
                          >
                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#FFF0F4" }}>
                              <Ticket className="w-5 h-5" style={{ color: BRAND }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold tracking-wider" style={{ color: BRAND }}>
                                  {promo.promoCode}
                                </span>
                                {getDiscountLabel() && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: BRAND }}>
                                    {getDiscountLabel()}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-600 truncate mt-0.5">{v.title}</p>
                              {!meetsMinOrder && v.minOrderAmount && (
                                <p className="text-[10px] text-amber-600 mt-0.5">
                                  Min. order {formatIDR(v.minOrderAmount)}
                                </p>
                              )}
                              {v.applicableCategories && v.applicableCategories.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {v.applicableCategories.slice(0, 3).map((cat) => (
                                    <span key={cat} className="text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-500">
                                      {cat}
                                    </span>
                                  ))}
                                  {v.applicableCategories.length > 3 && (
                                    <span className="text-[9px] text-purple-400">+{v.applicableCategories.length - 3}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : !unclaimedVouchers.length ? (
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    Claim vouchers from the Rewards page to get promo codes
                  </p>
                ) : null}

                {/* Unclaimed Vouchers - Claim directly from here */}
                {!loadingPromos && unclaimedVouchers.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => setShowUnclaimedSection(!showUnclaimedSection)}
                      className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 mb-2"
                    >
                      <span className="flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5" style={{ color: BRAND }} />
                        Vouchers to Claim ({unclaimedVouchers.length})
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUnclaimedSection ? "rotate-180" : ""}`} />
                    </button>
                    {showUnclaimedSection && (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {unclaimedVouchers.map((uv) => {
                          const v = uv.voucher;
                          const getLabel = () => {
                            if (v.discountType === "percentage" && v.discountValue) return `${v.discountValue}% OFF`;
                            if (v.discountType === "fixed" && v.discountValue) return `${formatIDR(v.discountValue)} OFF`;
                            if (v.discountType === "free_delivery") return "FREE DELIVERY";
                            if (v.discountType === "freebie") return "FREE ITEM";
                            return "";
                          };
                          const isClaiming = claimingVoucherId === uv.id;
                          return (
                            <div
                              key={uv.id}
                              className="flex items-center gap-3 p-2.5 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50"
                            >
                              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-pink-100 to-pink-50">
                                <Gift className="w-5 h-5" style={{ color: BRAND }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-[11px] font-semibold text-gray-800 truncate">{v.title}</p>
                                  {getLabel() && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border" style={{ borderColor: BRAND, color: BRAND }}>
                                      {getLabel()}
                                    </span>
                                  )}
                                </div>
                                {v.description && (
                                  <p className="text-[10px] text-gray-500 truncate mt-0.5">{v.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {v.expiryDate && (
                                    <span className="text-[9px] text-gray-400">Exp: {v.expiryDate}</span>
                                  )}
                                  {v.minOrderAmount ? (
                                    <span className="text-[9px] text-amber-600">Min. {formatIDR(v.minOrderAmount)}</span>
                                  ) : null}
                                  {(v.quantity || 1) > 1 && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-gray-200 text-gray-600 font-medium">x{v.quantity} uses</span>
                                  )}
                                </div>
                                {v.applicableCategories && v.applicableCategories.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {v.applicableCategories.slice(0, 3).map((cat) => (
                                      <span key={cat} className="text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-500">
                                        {cat}
                                      </span>
                                    ))}
                                    {v.applicableCategories.length > 3 && (
                                      <span className="text-[9px] text-purple-400">+{v.applicableCategories.length - 3}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleClaimVoucher(uv.id)}
                                disabled={isClaiming}
                                className="shrink-0 text-[11px] font-bold rounded-full px-3 py-1 h-auto text-white"
                                style={{ backgroundColor: BRAND }}
                              >
                                {isClaiming ? <Loader2 className="w-3 h-3 animate-spin" /> : "Claim"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

            {/* Order Summary */}
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/90 to-yellow-50/60 p-4 shadow-sm">
              <h2 className="text-base font-bold text-[#92400E] mb-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-amber-600" />
                </div>
                Order Summary
              </h2>
              <div className="space-y-2">
                {cartItems.map((item) => {
                  const itemKey = (item as any).cartItemKey || `${item.id}-${(item as any).category || "menu"}`;
                  return (
                    <div key={itemKey} className="flex justify-between text-sm">
                      <span className="text-[#1E1B4B] font-medium">
                        {item.quantity}x {item.title}
                      </span>
                      <span className="text-[#1E1B4B] font-bold tabular-nums">
                        {formatIDR(item.price * item.quantity)}
                      </span>
                    </div>
                  );
                })}
                <div className="border-t border-amber-200/60 pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatIDR(subtotal)}</span>
                  </div>
                  {promoDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600 flex items-center gap-1">
                        <Ticket className="w-3 h-3" />
                        Promo Discount
                      </span>
                      <span className="tabular-nums font-medium text-green-600">
                        -{formatIDR(promoDiscount)}
                      </span>
                    </div>
                  )}
                  {promoApplied?.freeDelivery && orderType === "delivery" && rawDeliveryFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600 flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        Free Delivery
                      </span>
                      <span className="tabular-nums font-medium text-green-600">
                        -{formatIDR(rawDeliveryFee)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Tax ({taxRate}% PPN)</span>
                    <span className="tabular-nums">{formatIDR(tax)}</span>
                  </div>
                  {orderType === "delivery" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Delivery Fee</span>
                      {deliveryFeeResult?.available ? (
                        <span className={`tabular-nums font-medium ${promoApplied?.freeDelivery ? "line-through text-gray-400" : ""}`} style={promoApplied?.freeDelivery ? {} : { color: BRAND }}>
                          {promoApplied?.freeDelivery ? formatIDR(rawDeliveryFee) : formatIDR(deliveryFee)}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">
                          {deliveryFeeResult && !deliveryFeeResult.available
                            ? "Not available"
                            : "Detect location first"}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-amber-200/60">
                    <span className="text-[#1E1B4B]">{orderType === "delivery" && !deliveryFeeResult?.available ? "Estimated Total" : "Total"}</span>
                    <span className="tabular-nums" style={{ color: BRAND }}>
                      {formatIDR(estimatedTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom CTA */}
      <div className="sticky bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 p-4 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto">
          {/* Mini cart summary on step 1 */}
          {orderStep === 1 && (
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-xs text-gray-500">{cartItems.reduce((sum, i) => sum + i.quantity, 0)} items</span>
              <span className="text-sm font-bold" style={{ color: BRAND }}>{formatIDR(subtotal)}</span>
            </div>
          )}
          {orderStep === 1 ? (
            <Button
              onClick={() => {
                // Validate step 1 before proceeding
                if (orderType === "delivery") {
                  const step1Errors: { address?: string; unitNumber?: string } = {};
                  if (!address.trim() && !selectedArea) {
                    step1Errors.address = "Please select a delivery area or use GPS";
                  }
                  if (!unitNumber.trim()) {
                    step1Errors.unitNumber = "Room / Unit / Floor number is required";
                  }
                  if (deliveryFeeResult && !deliveryFeeResult.available) {
                    step1Errors.address = "Delivery is not available to this location";
                  }
                  if (Object.keys(step1Errors).length > 0) {
                    setErrors(step1Errors);
                    toast.error("Please fill in all delivery details");
                    // Scroll to the first error field
                    const firstErrorKey = Object.keys(step1Errors)[0];
                    const errorEl = document.getElementById(`field-${firstErrorKey}`);
                    if (errorEl) {
                      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    return;
                  }
                }
                setErrors({});
                setOrderStep(2);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="w-full h-12 text-base font-bold text-white rounded-full flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
              style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #FF4081 100%)` }}
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </Button>
          ) : orderType === "delivery" && deliveryFeeResult && !deliveryFeeResult.available ? (
            <Button
              disabled
              className="w-full h-12 text-base font-semibold rounded-full flex items-center justify-center gap-2 bg-gray-300 text-gray-500 cursor-not-allowed"
            >
              <AlertCircle className="w-5 h-5" />
              Delivery not available to this location
            </Button>
          ) : (
            <Button
              onClick={handleProceed}
              className="w-full h-12 text-base font-bold text-white rounded-full flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
              style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #FF4081 100%)` }}
            >
              {paymentMethod === "pay-now" ? "Proceed to Payment" : paymentMethod === "pay-later" ? "Confirm & Place Order" : "Continue"}
              <ChevronRight className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}