/**
 * Bluetooth Thermal Printer Utility for EPPOS POS58L (58mm, ESC/POS)
 * Uses Web Bluetooth API to connect and send ESC/POS commands.
 * Paper width: 58mm = 384 dots = 32 chars per line (Font A)
 *
 * BLE reliability notes for cheap thermal printers:
 *  - Use small chunks (20 bytes) to stay within minimum ATT MTU
 *  - Use longer inter-chunk delays (50ms+) for buffer processing
 *  - Prefer writeValue (with response) over writeWithoutResponse for flow control
 *  - Retry failed chunk writes with exponential backoff
 *  - Skip raster logo printing (too much data for small BLE buffers)
 */

const CHARS_PER_LINE = 32;
const DOTS_PER_LINE = 384;

// Common BLE service/characteristic UUIDs for thermal printers
const PRINTER_SERVICE_UUIDS = [
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000fee7-0000-1000-8000-00805f9b34fb",
];

const PRINTER_CHAR_UUIDS = [
  "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  "00002af1-0000-1000-8000-00805f9b34fb",
  "0000ff01-0000-1000-8000-00805f9b34fb",
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
  "0000fee8-0000-1000-8000-00805f9b34fb",
];

// ESC/POS Commands
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT: new Uint8Array([ESC, 0x40]),                       // Initialize printer
  ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),           // Left align
  ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),         // Center align
  ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),          // Right align
  BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),              // Bold on
  BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),             // Bold off
  DOUBLE_HEIGHT: new Uint8Array([ESC, 0x21, 0x10]),        // Double height
  DOUBLE_WIDTH: new Uint8Array([ESC, 0x21, 0x20]),         // Double width
  DOUBLE_SIZE: new Uint8Array([ESC, 0x21, 0x30]),          // Double height + width
  NORMAL_SIZE: new Uint8Array([ESC, 0x21, 0x00]),          // Normal size
  UNDERLINE_ON: new Uint8Array([ESC, 0x2d, 0x01]),         // Underline on
  UNDERLINE_OFF: new Uint8Array([ESC, 0x2d, 0x00]),        // Underline off
  CUT: new Uint8Array([GS, 0x56, 0x00]),                   // Full cut
  PARTIAL_CUT: new Uint8Array([GS, 0x56, 0x01]),           // Partial cut
  FEED_3: new Uint8Array([ESC, 0x64, 0x03]),               // Feed 3 lines
  FEED_5: new Uint8Array([ESC, 0x64, 0x05]),               // Feed 5 lines
};

// ─── BLE Write Configuration ────────────────────────────────────
/**
 * Chunk size must be <= (ATT_MTU - 3). Default ATT_MTU is 23, so safe minimum is 20.
 * Cheap BLE printers often don't negotiate a higher MTU.
 */
const BLE_CHUNK_SIZE = 20;
/** Delay between chunks in ms. Gives the printer time to process each chunk. */
const BLE_CHUNK_DELAY_MS = 50;
/** Max retries per chunk if write fails */
const BLE_CHUNK_MAX_RETRIES = 3;
/** Base delay for retry backoff (doubles each retry) */
const BLE_RETRY_BASE_DELAY_MS = 200;

// ─── LocalStorage keys ───────────────────────────────────────────
const LS_PRINTER_KEY = "tikka_thermal_printer";

interface PrinterInfo {
  name: string;
  id: string;
  connectedAt: string;
}

// ─── State ───────────────────────────────────────────────────────
let device: BluetoothDevice | null = null;
let server: BluetoothRemoteGATTServer | null = null;
let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
/** Whether the characteristic supports write-with-response (better flow control) */
let canWriteWithResponse = false;
/** Cached service UUID that worked last time — speeds up reconnect */
let lastServiceUuid: string | null = null;
/** Cached characteristic UUID that worked last time */
let lastCharUuid: string | null = null;

/** Check if Web Bluetooth or native Bluetooth is available */
export function isBluetoothAvailable(): boolean {
  // navigator.bluetooth: available in Chrome/Edge desktop, Chrome Android (with HTTPS)
  if ((navigator as any).bluetooth) return true;
  // On Android WebView, navigator.bluetooth may not exist even with permissions.
  // If the native BluetoothPermissions plugin exists, we can use getPairedDevices
  // via BluetoothPrinterPlugin instead, so consider it available.
  try {
    const plugin = (window as any).Capacitor?.Plugins?.BluetoothPermissions;
    if (plugin) return true;
  } catch {}
  return false;
}

/**
 * Request Android Bluetooth runtime permissions via the native plugin.
 * On Android 12+ (API 31+), Web Bluetooth requires BLUETOOTH_SCAN and
 * BLUETOOTH_CONNECT permissions to be granted before navigator.bluetooth
 * becomes available.
 */
export async function requestBluetoothPermission(): Promise<{ granted: boolean }> {
  try {
    const plugin = (window as any).Capacitor?.Plugins?.BluetoothPermissions;
    if (!plugin) return { granted: false };

    // Check current permission state first
    const hasResult = await plugin.hasPermission();
    if (hasResult?.granted) {
      return { granted: true };
    }

    // Request permission
    const result = await plugin.requestPermission();
    return { granted: result?.granted ?? false };
  } catch {
    return { granted: false };
  }
}

/** Get saved printer info */
export function getSavedPrinter(): PrinterInfo | null {
  try {
    const raw = localStorage.getItem(LS_PRINTER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Save printer info */
function savePrinterInfo(info: PrinterInfo): void {
  try {
    localStorage.setItem(LS_PRINTER_KEY, JSON.stringify(info));
  } catch { /* ignore */ }
}

/** Clear saved printer */
export function clearSavedPrinter(): void {
  try {
    localStorage.removeItem(LS_PRINTER_KEY);
  } catch { /* ignore */ }
}

/** Check if printer is connected */
export async function isPrinterConnected(): Promise<boolean> {
  const native = getNativePlugin();
  if (native) {
    try {
      const status = await native.getStatus();
      return !!status.connected;
    } catch { return false; }
  }
  return !!(device && server?.connected && writeCharacteristic);
}

/** Check if we have a device reference (paired but maybe disconnected) */
export function hasDeviceReference(): boolean {
  return !!device;
}

/** Get current connection status */
export async function getPrinterStatus(): Promise<{ connected: boolean; name: string | null }> {
  return {
    connected: await isPrinterConnected(),
    name: device?.name || getSavedPrinter()?.name || null,
  };
}

/**
 * Store the characteristic and determine write method.
 * Prefers writeValue (with response) for flow control — the BLE stack
 * waits for the printer to ACK before resolving, preventing buffer overflow.
 */
function setCharacteristic(char: BluetoothRemoteGATTCharacteristic): void {
  writeCharacteristic = char;
  canWriteWithResponse = !!char.properties.write;
}

/**
 * Try to re-establish a GATT connection to an already-paired device.
 * This works without a user gesture because the device was previously selected via requestDevice.
 */
async function reconnectToDevice(): Promise<boolean> {
  if (!device || !device.gatt) return false;

  try {
    server = await device.gatt.connect();
    writeCharacteristic = null;

    if (lastServiceUuid && lastCharUuid) {
      try {
        const svc = await server.getPrimaryService(lastServiceUuid);
        const char = await svc.getCharacteristic(lastCharUuid);
        if (char.properties.write || char.properties.writeWithoutResponse) {
          setCharacteristic(char);
          return true;
        }
      } catch {}
    }

    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            setCharacteristic(char);
            lastServiceUuid = service.uuid;
            lastCharUuid = char.uuid;
            return true;
          }
        }
      } catch { continue; }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Ensure the printer is connected and ready to receive data.
 * Attempts silent reconnection if the device was previously paired.
 * Returns true if the printer is ready.
 */
export async function ensureConnected(): Promise<boolean> {
  const native = getNativePlugin();

  if (native) {
    // ── Native path: check status, reconnect if needed ──
    try {
      const status = await native.getStatus();
      if (status.connected) return true;
    } catch {}

    const saved = getSavedPrinter();
    if (saved?.address) {
      try {
        const result = await native.connectDevice({ address: saved.address });
        if (result.connected) return true;
      } catch {}
    }
    return false;
  }

  // ── Web Bluetooth path ──
  if (await isPrinterConnected()) {
    return true;
  }

  if (device) {
    const ok = await reconnectToDevice();
    if (ok) {
      await delay(300);
      return true;
    }
  }

  return false;
}

/** Reconnect to previously paired printer (native) */
export async function reconnectPrinter(): Promise<boolean> {
  const native = getNativePlugin();
  if (native) {
    try {
      const status = await native.getStatus();
      if (status.connected) return true;
      const saved = getSavedPrinter();
      if (saved?.address) {
        const result = await native.connectDevice({ address: saved.address });
        return !!result.connected;
      }
    } catch {}
    return false;
  }
  if (await isPrinterConnected()) return true;
  if (device) return reconnectToDevice();
  return false;
}

/** Get native BluetoothPrinter plugin if available */
function getNativePlugin() {
  try {
    return (window as any).Capacitor?.Plugins?.BluetoothPrinter || null;
  } catch { return null; }
}

/** Scan and connect to a Bluetooth thermal printer */
export async function connectPrinter(): Promise<{ success: boolean; name: string; error?: string }> {
  const native = getNativePlugin();

  if (native) {
    // ── Android native path (RFCOMM/Bluetooth Classic) ──
    try {
      const status = await native.getStatus();
      if (status.connected) {
        return { success: true, name: status.deviceName || "Thermal Printer" };
      }
    } catch {}

    const result = await native.getPairedDevices();

    // Native plugin may double-encode: result.devices is a stringified JSON string
    let devices: any[] = [];
    const raw = result.devices;
    if (Array.isArray(raw)) {
      devices = raw;
    } else if (typeof raw === "string") {
      try { devices = JSON.parse(raw); } catch { devices = []; }
    }
    if (!devices || devices.length === 0) {
      return { success: false, name: "", error: "No paired Bluetooth devices found. Please pair your printer in Android Settings first." };
    }

    // Auto-connect to first paired device
    const printer = devices[0];
    try {
      const status = await native.connectDevice({ address: printer.address });
      if (status.connected) {
        savePrinterInfo({ name: printer.name, id: printer.address, connectedAt: new Date().toISOString() });
        return { success: true, name: printer.name };
      } else {
        return { success: false, name: printer.name, error: "Connection failed — make sure the printer is turned on." };
      }
    } catch (err: any) {
      return { success: false, name: printer.name, error: err.message || "Failed to connect" };
    }
  }

  // ── Web Bluetooth path (Chrome/Edge desktop) ──
  if (!(navigator as any).bluetooth) {
    return { success: false, name: "", error: "Bluetooth not available on this browser." };
  }

  try {
    device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICE_UUIDS,
    });

    if (!device) {
      return { success: false, name: "", error: "No device selected" };
    }

    device.addEventListener("gattserverdisconnected", () => {
      server = null;
      writeCharacteristic = null;
    });

    // Connect to GATT server
    server = await device.gatt!.connect();

    // Try to find a writable characteristic
    writeCharacteristic = null;
    const services = await server.getPrimaryServices();
    
    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            setCharacteristic(char);
            lastServiceUuid = service.uuid;
            lastCharUuid = char.uuid;
            break;
          }
        }
        if (writeCharacteristic) break;
      } catch {
        continue;
      }
    }

    if (!writeCharacteristic) {
      // Fallback: try known UUIDs
      for (const svcUuid of PRINTER_SERVICE_UUIDS) {
        try {
          const svc = await server.getPrimaryService(svcUuid);
          for (const charUuid of PRINTER_CHAR_UUIDS) {
            try {
              const char = await svc.getCharacteristic(charUuid);
              if (char.properties.write || char.properties.writeWithoutResponse) {
                setCharacteristic(char);
                lastServiceUuid = svc.uuid;
                lastCharUuid = char.uuid;
                break;
              }
            } catch { continue; }
          }
          if (writeCharacteristic) break;
        } catch { continue; }
      }
    }

    if (!writeCharacteristic) {
      return { success: false, name: device.name || "Unknown", error: "Could not find a writable characteristic on this device. Make sure it is a supported thermal printer." };
    }

    const printerName = device.name || "Thermal Printer";
    savePrinterInfo({
      name: printerName,
      id: device.id,
      connectedAt: new Date().toISOString(),
    });

    return { success: true, name: printerName };
  } catch (err: any) {
    return { success: false, name: "", error: err.message || "Failed to connect" };
  }
}

/** Disconnect printer */
export function disconnectPrinter(): void {
  const native = getNativePlugin();
  if (native) {
    try { native.disconnectDevice(); } catch {}
    return;
  }
  if (server?.connected) {
    server.disconnect();
  }
  server = null;
  writeCharacteristic = null;
}

/** Fully forget the printer (clears everything including device ref) */
export function forgetPrinter(): void {
  if (server?.connected) {
    server.disconnect();
  }
  device = null;
  server = null;
  writeCharacteristic = null;
  canWriteWithResponse = false;
  lastServiceUuid = null;
  lastCharUuid = null;
  clearSavedPrinter();
}

// ─── BLE Write Layer ─────────────────────────────────────────────

/** Simple delay helper */
function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Write a single chunk to the printer with retry logic.
 * Uses writeValue (with response) when available for flow control.
 * Falls back to writeValueWithoutResponse.
 */
async function writeChunk(chunk: Uint8Array): Promise<void> {
  if (!writeCharacteristic) throw new Error("Printer not connected");

  for (let attempt = 1; attempt <= BLE_CHUNK_MAX_RETRIES; attempt++) {
    try {
      if (canWriteWithResponse) {
        // writeValue waits for printer ACK — prevents buffer overflow
        await writeCharacteristic.writeValue(chunk);
      } else {
        await writeCharacteristic.writeValueWithoutResponse(chunk);
      }
      return; // success
    } catch {
      if (attempt < BLE_CHUNK_MAX_RETRIES) {
        const backoff = BLE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await delay(backoff);
        if (!server?.connected && device) {
          const reconnected = await reconnectToDevice();
          if (!reconnected) {
            throw new Error("Printer disconnected during print and reconnect failed");
          }
          await delay(300);
        }
      } else {
        throw new Error(`BLE write failed after ${BLE_CHUNK_MAX_RETRIES} retries`);
      }
    }
  }
}

/**
 * Write data to printer in small chunks with delays.
 * Uses 20-byte chunks (safe for all BLE devices) with 50ms inter-chunk delay.
 */
async function writeData(data: Uint8Array): Promise<void> {
  const native = getNativePlugin();

  if (native) {
    // ── Android native path: encode to base64 and use BluetoothPrinterPlugin.writeBytes ──
    const base64 = btoa(String.fromCharCode(...data));
    const result = await native.writeBytes({ data: base64 });
    if (!result.ok) throw new Error("Native write failed");
    return;
  }

  if (!writeCharacteristic) throw new Error("Printer not connected");

  const totalChunks = Math.ceil(data.length / BLE_CHUNK_SIZE);

  for (let i = 0; i < data.length; i += BLE_CHUNK_SIZE) {
    const chunk = data.slice(i, i + BLE_CHUNK_SIZE);
    await writeChunk(chunk);
    if (i + BLE_CHUNK_SIZE < data.length) {
      await delay(BLE_CHUNK_DELAY_MS);
    }
  }
}

/**
 * Write data in logical segments with longer pauses between segments.
 * This prevents overwhelming the printer's processing pipeline.
 */
async function writeSegments(segments: Uint8Array[]): Promise<void> {
  for (let i = 0; i < segments.length; i++) {
    await writeData(segments[i]);
    // Longer pause between logical segments (header, items, totals, etc.)
    if (i < segments.length - 1) {
      await delay(150);
    }
  }
}

// ─── Text Helpers ────────────────────────────────────────────────

/** Encode text to bytes */
function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Combine multiple Uint8Arrays */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Create a line of text */
function line(text: string): Uint8Array {
  return concatBytes(textToBytes(text), new Uint8Array([LF]));
}

/** Create a dashed separator line */
function separator(): Uint8Array {
  return line("-".repeat(CHARS_PER_LINE));
}

/** Create a double-line separator */
function doubleSeparator(): Uint8Array {
  return line("=".repeat(CHARS_PER_LINE));
}

/** Pad text to fit two columns (left + right) */
function twoColumns(left: string, right: string): Uint8Array {
  const maxLeft = CHARS_PER_LINE - right.length - 1;
  const paddedLeft = left.length > maxLeft ? left.substring(0, maxLeft) : left;
  const spaces = CHARS_PER_LINE - paddedLeft.length - right.length;
  return line(paddedLeft + " ".repeat(Math.max(1, spaces)) + right);
}

/** Three columns for item lines: qty, name, price */
function threeColumns(qty: string, name: string, price: string): Uint8Array {
  const qtyWidth = 4;   // "2x  "
  const priceWidth = price.length;
  const nameWidth = CHARS_PER_LINE - qtyWidth - priceWidth - 1;
  const paddedQty = qty.padEnd(qtyWidth);
  const paddedName = name.length > nameWidth ? name.substring(0, nameWidth) : name.padEnd(nameWidth);
  return line(paddedQty + paddedName + " " + price);
}

/** Format currency for receipt (no symbol, just number) */
function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return dateStr; }
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

// ─── Public Print Functions ──────────────────────────────────────

/** Send a test print */
export async function testPrint(): Promise<void> {
  if (!isPrinterConnected()) throw new Error("Printer not connected");

  const data = concatBytes(
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.DOUBLE_SIZE,
    line("TEST PRINT"),
    CMD.NORMAL_SIZE,
    new Uint8Array([LF]),
    line("Printer is working!"),
    separator(),
    line(new Date().toLocaleString()),
    line("EPPOS POS58L"),
    CMD.FEED_5,
  );

  await writeData(data);
}

/** Print an invoice/receipt from order data */
export async function printInvoice(order: {
  orderNumber?: string;
  id: string;
  createdAt: string;
  customerName?: string;
  phone: string;
  deliveryMethod: string;
  address?: string;
  items?: Array<{ name?: string; title?: string; quantity: number; price: number; addons?: any[] }>;
  itemTitle?: string;
  subtotal: number;
  tax: number;
  taxRate?: number;
  deliveryFee: number;
  promoDiscount?: number;
  promoCode?: string;
  customCharges?: Array<{ name: string; amount: number }>;
  total: number;
  paymentStatus?: string;
  paidAmount?: number;
  paymentHistory?: Array<{ amount: number; method?: string; date: string }>;
  paymentMethod?: string;
  specialInstructions?: string;
}, restaurantInfo: {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  logoUrl?: string;
}, printedBy?: string): Promise<void> {
  if (!isPrinterConnected()) throw new Error("Printer not connected");

  // ─── Build receipt in logical segments ───
  // Each segment is sent separately with a pause between them
  // to prevent overwhelming the printer's BLE buffer.

  // ── Segment 1: Header ──
  const headerParts: Uint8Array[] = [CMD.INIT];
  // NOTE: Logo bitmap printing is disabled for BLE reliability.
  // Raster image data (3000+ bytes) overwhelms cheap BLE printer buffers.
  // Using text-only header instead.
  headerParts.push(CMD.ALIGN_CENTER);
  headerParts.push(CMD.BOLD_ON, CMD.DOUBLE_SIZE);
  headerParts.push(line(restaurantInfo.name.toUpperCase()));
  headerParts.push(CMD.NORMAL_SIZE, CMD.BOLD_OFF);
  if (restaurantInfo.tagline) {
    headerParts.push(line(restaurantInfo.tagline));
  }
  if (restaurantInfo.address) {
    const addrLines = wrapText(restaurantInfo.address, CHARS_PER_LINE);
    addrLines.forEach(l => headerParts.push(line(l)));
  }
  if (restaurantInfo.phone) {
    headerParts.push(line(`Tel: ${restaurantInfo.phone}`));
  }
  headerParts.push(new Uint8Array([LF]));
  headerParts.push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  headerParts.push(line("INVOICE"));
  headerParts.push(CMD.NORMAL_SIZE, CMD.BOLD_OFF);
  headerParts.push(doubleSeparator());

  // ── Segment 2: Order Info ──
  const infoParts: Uint8Array[] = [];
  infoParts.push(CMD.ALIGN_LEFT);
  infoParts.push(twoColumns("Order #:", order.orderNumber || order.id.substring(0, 8).toUpperCase()));
  infoParts.push(twoColumns("Date:", formatDate(order.createdAt)));
  infoParts.push(twoColumns("Time:", formatTime(order.createdAt)));
  if (order.customerName) {
    infoParts.push(twoColumns("Customer:", order.customerName));
  }
  infoParts.push(twoColumns("Phone:", order.phone));
  const deliveryLabel = order.deliveryMethod === "delivery" ? "Delivery" : order.deliveryMethod === "dine_in" ? "Dine In" : "Pickup";
  infoParts.push(twoColumns("Type:", deliveryLabel));
  if (order.address && order.deliveryMethod === "delivery") {
    infoParts.push(line("Address:"));
    const addrLines = wrapText(order.address, CHARS_PER_LINE - 2);
    addrLines.forEach(l => infoParts.push(line("  " + l)));
  }
  infoParts.push(separator());

  // ── Segment 3: Items ──
  const itemParts: Uint8Array[] = [];
  itemParts.push(CMD.BOLD_ON);
  itemParts.push(threeColumns("Qty", "Item", "Amount"));
  itemParts.push(CMD.BOLD_OFF);
  itemParts.push(separator());

  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      const qty = `${item.quantity}x`;
      const price = fmtCurrency(item.price * item.quantity);
      const name = item.name || item.title || "Item";

      const maxNameWidth = CHARS_PER_LINE - 4 - price.length - 1;
      if (name.length > maxNameWidth) {
        itemParts.push(line(qty.padEnd(4) + name));
        itemParts.push(line(" ".repeat(CHARS_PER_LINE - price.length) + price));
      } else {
        itemParts.push(threeColumns(qty, name, price));
      }

      if (item.addons && item.addons.length > 0) {
        for (const addon of item.addons) {
          const addonName = `  + ${addon.name || addon}`;
          const addonPrice = addon.price ? fmtCurrency(addon.price) : "";
          if (addonPrice) {
            itemParts.push(twoColumns(addonName, addonPrice));
          } else {
            itemParts.push(line(addonName));
          }
        }
      }
    }
  } else if (order.itemTitle) {
    const titleLines = wrapText(order.itemTitle, CHARS_PER_LINE);
    titleLines.forEach(l => itemParts.push(line(l)));
  }
  itemParts.push(separator());

  // ── Segment 4: Totals ──
  const totalParts: Uint8Array[] = [];
  totalParts.push(twoColumns("Subtotal", `Rp ${fmtCurrency(order.subtotal)}`));
  
  if (order.tax > 0) {
    const taxLabel = order.taxRate ? `Tax (${order.taxRate}%)` : "Tax";
    totalParts.push(twoColumns(taxLabel, `Rp ${fmtCurrency(order.tax)}`));
  }
  if (order.deliveryFee > 0) {
    totalParts.push(twoColumns("Delivery Fee", `Rp ${fmtCurrency(order.deliveryFee)}`));
  }
  if (order.customCharges && order.customCharges.length > 0) {
    for (const charge of order.customCharges) {
      totalParts.push(twoColumns(charge.name, `Rp ${fmtCurrency(charge.amount)}`));
    }
  }
  if (order.promoDiscount && order.promoDiscount > 0) {
    const promoLabel = order.promoCode ? `Promo (${order.promoCode})` : "Promo Discount";
    totalParts.push(twoColumns(promoLabel, `-Rp ${fmtCurrency(order.promoDiscount)}`));
  }

  totalParts.push(doubleSeparator());
  totalParts.push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  totalParts.push(twoColumns("TOTAL", `Rp ${fmtCurrency(order.total)}`));
  totalParts.push(CMD.NORMAL_SIZE, CMD.BOLD_OFF);
  totalParts.push(doubleSeparator());

  // ── Segment 5: Payment + Footer ──
  const footerParts: Uint8Array[] = [];
  const payStatus = order.paymentStatus || (order.paidAmount && order.paidAmount >= order.total ? "paid" : "unpaid");
  footerParts.push(twoColumns("Payment:", payStatus === "paid" ? "PAID" : payStatus === "partial" ? "PARTIAL" : "UNPAID"));
  
  if (order.paidAmount && order.paidAmount > 0) {
    footerParts.push(twoColumns("Paid:", `Rp ${fmtCurrency(order.paidAmount)}`));
    const remaining = order.total - order.paidAmount;
    if (remaining > 0) {
      footerParts.push(CMD.BOLD_ON);
      footerParts.push(twoColumns("Remaining:", `Rp ${fmtCurrency(remaining)}`));
      footerParts.push(CMD.BOLD_OFF);
    }
  }

  if (order.paymentMethod) {
    footerParts.push(twoColumns("Method:", order.paymentMethod.toUpperCase()));
  }

  if (order.paymentHistory && order.paymentHistory.length > 0) {
    footerParts.push(separator());
    footerParts.push(CMD.BOLD_ON);
    footerParts.push(line("Payment History:"));
    footerParts.push(CMD.BOLD_OFF);
    for (const ph of order.paymentHistory) {
      const method = ph.method ? ` (${ph.method})` : "";
      const dateStr = ph.date && !isNaN(new Date(ph.date).getTime())
        ? new Date(ph.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "";
      footerParts.push(twoColumns(`Rp ${fmtCurrency(ph.amount)}${method}`, dateStr));
    }
  }

  if (order.specialInstructions) {
    footerParts.push(separator());
    footerParts.push(CMD.BOLD_ON);
    footerParts.push(line("Special Instructions:"));
    footerParts.push(CMD.BOLD_OFF);
    const instrLines = wrapText(order.specialInstructions, CHARS_PER_LINE);
    instrLines.forEach(l => footerParts.push(line(l)));
  }

  if (printedBy) {
    footerParts.push(separator());
    footerParts.push(twoColumns("Printed by:", printedBy));
  }

  footerParts.push(new Uint8Array([LF]));
  footerParts.push(CMD.ALIGN_CENTER);
  footerParts.push(separator());
  footerParts.push(CMD.BOLD_ON);
  footerParts.push(line("Thank you for your order!"));
  footerParts.push(CMD.BOLD_OFF);
  footerParts.push(line("We appreciate your business."));
  footerParts.push(new Uint8Array([LF]));
  footerParts.push(line(new Date().toLocaleString()));
  footerParts.push(CMD.FEED_5);

  // ── Segment 6: Kitchen Copy ──
  const kitchenParts: Uint8Array[] = [];
  kitchenParts.push(new Uint8Array([LF, LF, LF]));
  kitchenParts.push(doubleSeparator());
  kitchenParts.push(CMD.BOLD_ON, CMD.ALIGN_CENTER);
  kitchenParts.push(line("KITCHEN COPY"));
  kitchenParts.push(CMD.ALIGN_LEFT, CMD.BOLD_OFF);
  kitchenParts.push(separator());
  const shortId = order.orderNumber || order.id.substring(0, 8).toUpperCase();
  kitchenParts.push(twoColumns("Order #:", shortId));
  kitchenParts.push(twoColumns("Date:", formatDate(order.createdAt)));
  kitchenParts.push(twoColumns("Time:", formatTime(order.createdAt)));
  const deliveryType = order.deliveryMethod === "delivery" ? "DELIVERY" : order.deliveryMethod === "dine_in" ? "DINE IN" : "PICKUP";
  kitchenParts.push(twoColumns("Type:", deliveryType));
  kitchenParts.push(separator());

  if (order.items && order.items.length > 0) {
    kitchenParts.push(CMD.BOLD_ON);
    for (const item of order.items) {
      const name = item.name || item.title || "Item";
      kitchenParts.push(line(`${item.quantity}x  ${name}`));
    }
    kitchenParts.push(CMD.BOLD_OFF);
  } else if (order.itemTitle) {
    kitchenParts.push(CMD.BOLD_ON);
    kitchenParts.push(line(order.itemTitle));
    kitchenParts.push(CMD.BOLD_OFF);
  }

  if (order.specialInstructions) {
    kitchenParts.push(separator());
    kitchenParts.push(CMD.BOLD_ON);
    kitchenParts.push(line("NOTES:"));
    kitchenParts.push(CMD.BOLD_OFF);
    const instrLines = wrapText(order.specialInstructions, CHARS_PER_LINE);
    instrLines.forEach(l => kitchenParts.push(line(l)));
  }

  kitchenParts.push(CMD.ALIGN_CENTER);
  kitchenParts.push(doubleSeparator());
  kitchenParts.push(CMD.FEED_5);

  // ── Send all segments with pauses between them ──
  const segments = [
    concatBytes(...headerParts),
    concatBytes(...infoParts),
    concatBytes(...itemParts),
    concatBytes(...totalParts),
    concatBytes(...footerParts),
    concatBytes(...kitchenParts),
  ];

  await writeSegments(segments);
}