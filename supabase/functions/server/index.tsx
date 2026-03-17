import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";
import { create, verify } from "jsr:@zaubrik/djwt@3.0.2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { getImageForDish } from "./menu_images.tsx";
import { SERVER_CONFIG } from "./config.ts";

// Retry helper for transient connection errors (e.g. connection reset)
async function kvRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 300): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const msg = String(error?.message || error);
      const isTransient = msg.includes('connection reset') || msg.includes('connection error')
        || msg.includes('SendRequest') || msg.includes('broken pipe') || msg.includes('ECONNRESET');
      if (!isTransient || attempt >= maxRetries) throw error;
      console.log(`⚠️ KV transient error (attempt ${attempt}/${maxRetries}): ${msg.substring(0, 120)}. Retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastError;
}

const app = new Hono();

// Custom JWT secret for our own token system (bypasses Supabase Auth mismatch)
// PRODUCTION: Set JWT_SECRET in Supabase Dashboard -> Edge Functions -> Secrets
const JWT_SECRET = Deno.env.get('JWT_SECRET') || (() => {
  console.warn('JWT_SECRET env var not set! Using insecure default. Set JWT_SECRET in Supabase Dashboard before go-live.');
  return SERVER_CONFIG.defaultJwtSecret;
})();

// Helper: Create our own JWT key
async function getJwtKey() {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(JWT_SECRET);
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// Helper: Sign our own JWT token
async function signToken(payload: any): Promise<string> {
  try {
    console.log(`🔐 Creating custom JWT token with payload:`, payload);
    const key = await getJwtKey();
    console.log(`🔐 JWT key created successfully`);
    const token = await create({ alg: "HS256", typ: "JWT" }, payload, key);
    console.log(`✅ Custom JWT token created (first 30 chars): ${token.substring(0, 30)}...`);
    console.log(`✅ Token length: ${token.length}`);
    return token;
  } catch (error) {
    console.log(`❌ JWT signing failed: ${error.message}`);
    console.log(`❌ Error stack:`, error.stack);
    throw error;
  }
}

// Helper: Verify our own JWT token  
async function verifyToken(token: string): Promise<any> {
  try {
    console.log(`🔍 Verifying custom JWT token (first 30 chars): ${token.substring(0, 30)}...`);
    const key = await getJwtKey();
    console.log(`🔍 JWT key created successfully`);
    const payload = await verify(token, key);
    console.log(`✅ JWT verification successful. Payload:`, payload);
    return payload;
  } catch (error) {
    console.log(`❌ JWT verification failed: ${error.message}`);
    console.log(`❌ Error stack:`, error.stack);
    return null;
  }
}

// Helper: Extract custom JWT from request (checks X-Custom-Auth header)
function getCustomToken(c: any): string | null {
  // First try X-Custom-Auth header (our custom JWT)
  const customAuth = c.req.header('X-Custom-Auth');
  if (customAuth) {
    console.log(`🔑 Found custom token in X-Custom-Auth header`);
    return customAuth;
  }
  
  // Fallback: try Authorization header (for backward compatibility)
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1];
  if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
    console.log(`🔑 Found custom token in Authorization header`);
    return token;
  }
  
  console.log(`❌ No custom token found`);
  return null;
}

// Helper: Verify admin access using our custom JWT
// Now also accepts staff tokens (any active staff member)
async function verifyAdminAccess(token: string): Promise<{ userId: string; isAdmin: boolean } | null> {
  console.log(`🔐 verifyAdminAccess - Starting verification`);
  console.log(`🔐 Token (first 50 chars): ${token?.substring(0, 50)}...`);
  
  const payload = await verifyToken(token);
  
  if (!payload) {
    console.log(`❌ verifyAdminAccess - verifyToken returned null`);
    return null;
  }
  
  if (!payload.userId) {
    console.log(`❌ verifyAdminAccess - No userId in payload. Payload keys: ${Object.keys(payload).join(', ')}`);
    return null;
  }
  
  console.log(`✅ JWT validated - userId: ${payload.userId}, isAdmin: ${payload.isAdmin}, staffRole: ${payload.staffRole}`);
  
  // Path 1: Any active staff member with a valid staff token
  if (payload.staffRole) {
    const staffData = await kv.get(`staff:${payload.userId}`);
    if (staffData && staffData.active) {
      console.log(`✅ Staff access verified for ${payload.userId} (role: ${staffData.role})`);
      return { userId: payload.userId, isAdmin: true };
    }
    console.log(`❌ Staff ${payload.userId} not found or inactive`);
    return null;
  }
  
  // Path 2: Legacy customer admin token
  console.log(`🔍 Checking KV store for user: ${payload.userId}`);
  const userData = await kv.get(`user:${payload.userId}`);
  
  if (!userData) {
    console.log(`❌ User ${payload.userId} not found in KV store`);
    return null;
  }
  
  console.log(`🔍 User found - isAdmin: ${userData.isAdmin}`);
  
  if (!userData?.isAdmin) {
    console.log(`❌ User ${payload.userId} is not an admin in KV store`);
    return null;
  }
  
  console.log(`✅ Admin access verified for user ${payload.userId}`);
  return { userId: payload.userId, isAdmin: true };
}

// Helper: Verify regular user access using our custom JWT
async function verifyUserAccess(token: string): Promise<{ userId: string; phone?: string } | null> {
  console.log(`🔍 verifyUserAccess - Starting verification`);
  console.log(`🔍 Token (first 50 chars): ${token?.substring(0, 50)}...`);
  console.log(`🔍 Token length: ${token?.length}`);
  
  const payload = await verifyToken(token);
  console.log(`🔍 verifyToken returned:`, payload);
  
  if (!payload || !payload.userId) {
    console.log(`❌ Invalid JWT payload - payload:`, payload);
    console.log(`❌ Has payload: ${!!payload}, Has userId: ${payload?.userId}`);
    return null;
  }
  
  console.log(`✅ JWT validated - userId: ${payload.userId}`);
  
  return { userId: payload.userId, phone: payload.phone };
}

// CORS must come first - allow all origins and disable JWT validation
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Custom-Auth'],
  exposeHeaders: ['Content-Type', 'Authorization', 'X-Custom-Auth'],
}));

// Logger
app.use('*', logger(console.log));

// Admin credentials — configurable via env vars or KV store
// ⚠️ PRODUCTION: Set ADMIN_PHONE and ADMIN_PIN in Supabase Dashboard → Edge Functions → Secrets
const ADMIN_PHONE = Deno.env.get('ADMIN_PHONE') || "+629999999999";
const ADMIN_PHONE_LEGACY = (() => {
  const phone = ADMIN_PHONE.replace(/\D/g, '');
  // If starts with 62, also keep the version without country code
  return phone.startsWith('62') ? phone.slice(2) : phone;
})();
const ADMIN_PIN = Deno.env.get('ADMIN_PIN') || "999999";

if (!Deno.env.get('ADMIN_PHONE') || !Deno.env.get('ADMIN_PIN')) {
  console.warn('⚠️ ADMIN_PHONE and/or ADMIN_PIN env vars not set! Using insecure defaults. Set them in Supabase Dashboard before go-live.');
}

// Helper: Validate 6-digit PIN format
function isValidPin(input: string): boolean {
  return /^\d{6}$/.test(input);
}

// Helper: Extract digits from phone (strips +, spaces, dashes)
function phoneToDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Helper: Normalize a phone for email format — returns email string
function phoneToEmail(phone: string): string {
  return `${phoneToDigits(phone)}@${SERVER_CONFIG.emailDomain}`;
}

// Helper: Check if a phone matches the admin phone (handles both old and new format)
function isAdminPhone(phone: string): boolean {
  const digits = phoneToDigits(phone);
  return digits === phoneToDigits(ADMIN_PHONE) || digits === ADMIN_PHONE_LEGACY;
}

// Helper: Normalize phone for storage — ensure it has a + prefix with country code
// Legacy phones without + prefix get +62 (Indonesia) prepended
function normalizePhoneForStorage(phone: string): string {
  if (phone.startsWith('+')) return phone;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.startsWith('62')) {
    return `+${digits}`;
  }
  return `+62${digits}`;
}

// Default special offers (initialize if not exist) - IDR prices
const DEFAULT_SPECIAL_OFFERS = [
  {
    id: 1,
    title: "Chicken Tikka Masala",
    description: "Tender chicken in creamy tomato-based sauce with aromatic spices",
    originalPrice: 285000, // Rp 285.000
    discountedPrice: 210000, // Rp 210.000
    image: "https://images.unsplash.com/photo-1652545296821-09a023a9fd08?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0aWtrYSUyMG1hc2FsYSUyMGluZGlhbiUyMGZvb2R8ZW58MXx8fHwxNzcyMTA0ODgwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: 2,
    title: "Butter Chicken with Rice",
    description: "Rich and creamy butter chicken served with fragrant basmati rice",
    originalPrice: 255000, // Rp 255.000
    discountedPrice: 180000, // Rp 180.000
    image: "https://images.unsplash.com/photo-1707448829764-9474458021ed?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXR0ZXIlMjBjaGlja2VuJTIwY3VycnklMjByaWNlfGVufDF8fHx8MTc3MjEwNDg4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: 3,
    title: "Samosa Platter",
    description: "Crispy pastry filled with spiced potatoes and peas, served with chutneys",
    originalPrice: 135000, // Rp 135.000
    discountedPrice: 90000, // Rp 90.000
    image: "https://images.unsplash.com/photo-1697155836252-d7f969108b5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzYW1vc2ElMjBpbmRpYW4lMjBhcHBldGl6ZXJ8ZW58MXx8fHwxNzcyMDYxMTIyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
];

// Helper: Truncate error messages to avoid dumping huge HTML responses in logs
function truncateError(err: any): string {
  const msg = err?.message || String(err);
  if (msg.includes('<!DOCTYPE') || msg.includes('<html')) return '[502 Bad Gateway - Supabase temporarily unavailable]';
  if (msg.length > 200) return msg.substring(0, 200) + '... [truncated]';
  return msg;
}

// Helper: KV set with retry logic for cold-start resilience
async function kvSetWithRetry(key: string, value: any, maxRetries = 4): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await kv.set(key, value);
      return;
    } catch (err) {
      const msg = truncateError(err);
      console.warn(`⚠️ kvSetWithRetry attempt ${attempt}/${maxRetries} for key "${key}" failed: ${msg}`);
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`⏳ Retrying KV set in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

// Helper: KV get with retry logic for cold-start resilience
async function kvGetWithRetry(key: string, maxRetries = 4): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await kv.get(key);
    } catch (err) {
      const msg = truncateError(err);
      console.warn(`⚠️ kvGetWithRetry attempt ${attempt}/${maxRetries} for key "${key}" failed: ${msg}`);
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`⏳ Retrying KV get in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

// Helper: KV getByPrefix with retry logic for cold-start resilience
async function kvGetByPrefixWithRetry(prefix: string, maxRetries = 4): Promise<any[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await kv.getByPrefix(prefix);
    } catch (err) {
      const msg = truncateError(err);
      console.warn(`⚠️ kvGetByPrefixWithRetry attempt ${attempt}/${maxRetries} for prefix "${prefix}" failed: ${msg}`);
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`⏳ Retrying KV getByPrefix in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  return [];
}

// Helper: Ensure admin KV data exists without resetting points
async function ensureAdminKVData(userId: string, createdAt: string, phone: string) {
  try {
    const existing = await kvGetWithRetry(`user:${userId}`);
    if (existing && existing.isAdmin) {
      console.log("✅ Admin user KV data already exists, preserving current data");
      return;
    }
    // Only write if no existing data or not marked as admin
    await kvSetWithRetry(`user:${userId}`, {
      id: userId,
      phone,
      name: existing?.name || "Admin",
      points: existing?.points || 0,
      createdAt: existing?.createdAt || createdAt,
      isAdmin: true,
    });
    console.log("✅ Admin user KV data updated");
  } catch (kvError) {
    console.error("⚠️ Failed to update admin user KV data:", truncateError(kvError));
    console.log("⚠️ Not critical - KV will be updated on next login.");
  }
}

// Initialize default data on server start (with retry)
async function initializeDefaultData(attempt = 1) {
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 3000 * attempt; // Exponential backoff: 3s, 6s, 9s, 12s, 15s

  // On first attempt, wait for Supabase to warm up before hitting the database
  if (attempt === 1) {
    console.log("⏳ Waiting 3s for Supabase cold-start warm-up...");
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  try {
    console.log(`🚀 Starting default data initialization (attempt ${attempt}/${MAX_RETRIES})...`);
    
    // Check if special offers exist (uses retry wrapper for cold-start resilience)
    const existingOffers = await kvGetByPrefixWithRetry("todays_special:");
    
    // If no offers exist, create the default ones
    if (!existingOffers || existingOffers.length === 0) {
      console.log("Initializing default today's special items...");
      for (const offer of DEFAULT_SPECIAL_OFFERS) {
        try {
          await kvSetWithRetry(`todays_special:${offer.id}`, offer);
        } catch (error) {
          console.error(`⚠️ Failed to initialize offer ${offer.id}:`, truncateError(error));
        }
      }
      console.log("Default today's special items initialization attempted");
    } else {
      console.log(`Found ${existingOffers.length} existing today's special items`);
    }
    
    // Initialize admin user if it doesn't exist
    console.log("🔧 Checking for admin user...");
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    
    // Admin email: try new format first, fallback to legacy
    const adminEmailNew = phoneToEmail(ADMIN_PHONE); // 629999999999@tikka.app
    const adminEmailLegacy = `${ADMIN_PHONE_LEGACY}@${SERVER_CONFIG.emailDomain}`;
    
    // Try to find existing admin user
    let existingUsers;
    try {
      const response = await supabase.auth.admin.listUsers();
      existingUsers = response.data;
    } catch (error) {
      console.error("⚠️ Failed to list users:", truncateError(error));
      if (attempt < MAX_RETRIES) {
        console.log(`⏳ Retrying initialization in ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return initializeDefaultData(attempt + 1);
      }
      console.log("⚠️ Skipping admin user initialization after all retries");
      return;
    }
    
    // Check for admin user under both new and legacy email formats
    const adminExistsNew = existingUsers?.users?.find(u => u.email === adminEmailNew);
    const adminExistsLegacy = existingUsers?.users?.find(u => u.email === adminEmailLegacy);
    const existingAdmin = adminExistsNew || adminExistsLegacy;
    
    if (!existingAdmin) {
      console.log("🔧 Creating admin user with new international format...");
      const { data, error } = await supabase.auth.admin.createUser({
        email: adminEmailNew,
        password: ADMIN_PIN,
        user_metadata: { name: "Admin", phone: ADMIN_PHONE },
        email_confirm: true,
      });
      
      if (error) {
        if (error.message?.includes("already been registered") || error.message?.includes("already exists")) {
          console.log("ℹ️ Admin user already exists (found via error), skipping creation");
          const { data: allUsers } = await supabase.auth.admin.listUsers();
          const foundAdmin = allUsers?.users?.find(u => u.email === adminEmailNew || u.email === adminEmailLegacy);
          if (foundAdmin) {
            await ensureAdminKVData(foundAdmin.id, foundAdmin.created_at, ADMIN_PHONE);
          }
        } else {
          console.error("❌ Failed to create admin user:", error.message);
        }
      } else {
        console.log("✅ Admin user created successfully:", data.user.id);
        await ensureAdminKVData(data.user.id, new Date().toISOString(), ADMIN_PHONE);
      }
    } else {
      console.log("✅ Admin user already exists:", existingAdmin.id);
      // Skip password update on startup to avoid transient broken pipe errors.
      // Password is set correctly during initial creation.
      console.log("🔧 Ensuring admin user data in KV...");
      try {
        await ensureAdminKVData(existingAdmin.id, existingAdmin.created_at, ADMIN_PHONE);
      } catch (kvErr: any) {
        console.log("⚠️ ensureAdminKVData failed (non-critical):", kvErr?.message);
      }
    }
    
    console.log("✅ Default data initialization completed");
  } catch (error) {
    console.error("❌ Failed to initialize default data:", truncateError(error));
    if (attempt < MAX_RETRIES) {
      console.log(`⏳ Retrying initialization in ${RETRY_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return initializeDefaultData(attempt + 1);
    }
    console.error("⚠️ All retries exhausted. App will still function - data will be initialized on first use.");
  }
}

// Call initialization (don't await - let it run in background)
initializeDefaultData();

// ==================== LOGO STORAGE BUCKET ====================
const LOGO_BUCKET = "make-e5e192fb-logos";
const LOGO_FILE_PATH = "restaurant-logo";
const MASCOT_FILE_PATH = "mascot-image";
const FAVICON_FILE_PATH = "favicon-image";
let logoBucketReady = false;

async function ensureLogoBucket() {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((bucket: any) => bucket.name === LOGO_BUCKET);
    if (!bucketExists) {
      const { error } = await supabase.storage.createBucket(LOGO_BUCKET, { public: false });
      if (error) {
        if (error.message?.includes('already exists')) {
          console.log(`✅ Logo storage bucket already exists: ${LOGO_BUCKET}`);
        } else {
          console.error(`❌ Failed to create bucket ${LOGO_BUCKET}:`, error.message);
          return;
        }
      } else {
        console.log(`✅ Created storage bucket: ${LOGO_BUCKET}`);
      }
    } else {
      console.log(`✅ Logo storage bucket already exists: ${LOGO_BUCKET}`);
    }
    logoBucketReady = true;
  } catch (error) {
    console.error("⚠️ Failed to ensure logo bucket:", error);
  }
}
// Initialize bucket in background
ensureLogoBucket();

// Business configuration
const RESTAURANT_LOCATION = {
  lat: 40.7580,
  lng: -73.9855,
  address: "123 Main St, New York, NY 10001"
};

const DELIVERY_RADIUS_MILES = 5; // Maximum delivery distance
const MIN_ORDER_DELIVERY = 15; // Minimum order for delivery
const MIN_ORDER_PICKUP = 10; // Minimum order for pickup

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3959; // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Helper function to decode JWT and extract user ID
function decodeJWT(token: string): { sub: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('JWT has invalid number of parts:', parts.length);
      return null;
    }
    
    // Use base64url decoding (JWT uses base64url, not standard base64)
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    
    // Decode using Deno's atob (if available) or manual decoding
    let decoded: string;
    try {
      // Try using atob
      decoded = atob(padded);
    } catch (e) {
      console.error('atob failed, trying alternative decoding:', e);
      // Fallback: just try to decode without padding manipulation
      try {
        decoded = atob(base64);
      } catch (e2) {
        console.error('Alternative decoding also failed:', e2);
        return null;
      }
    }
    
    const payload = JSON.parse(decoded);
    console.log('Successfully decoded JWT payload:', payload);
    return payload;
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    console.error('Error details:', error?.message, error?.stack);
    return null;
  }
}

// Health check endpoint
app.get("/make-server-e5e192fb/health", (c) => {
  return c.json({ status: "ok" });
});

// Debug endpoint to check special offers in database
app.get("/make-server-e5e192fb/debug/special-offers", async (c) => {
  try {
    const offers = await kv.getByPrefix("special_offer:");
    return c.json({ 
      count: offers.length,
      offers: offers,
      message: "Special offers from database"
    });
  } catch (error) {
    return c.json({ error: error.message, stack: error.stack }, 500);
  }
});

// Debug endpoint to check user data in KV store
app.get("/make-server-e5e192fb/debug/user-data", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: "No token provided" }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !user) {
      return c.json({ 
        error: "Failed to validate token",
        details: error?.message 
      }, 401);
    }

    // Get user data from KV
    const userData = await kv.get(`user:${user.id}`);
    
    return c.json({ 
      supabaseUser: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
      },
      kvUserData: userData,
      message: "User data from both Supabase and KV store"
    });
  } catch (error) {
    return c.json({ error: error.message, stack: error.stack }, 500);
  }
});

// Force re-initialize admin user in KV store
app.post("/make-server-e5e192fb/debug/force-init-admin", async (c) => {
  try {
    const { phone, pin, password } = await c.req.json();
    const credential = pin || password; // Accept both field names
    
    // Validate admin credentials (accept both old and new phone formats)
    if (!isAdminPhone(phone) || credential !== ADMIN_PIN) {
      return c.json({ error: "Invalid admin credentials" }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Try both new and legacy email formats
    const emailNew = phoneToEmail(ADMIN_PHONE);
    const emailLegacy = `${ADMIN_PHONE_LEGACY}@${SERVER_CONFIG.emailDomain}`;
    
    // Get the admin user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error("Error listing users:", listError);
      return c.json({ error: "Failed to list users", details: listError.message }, 500);
    }
    
    const adminUser = users.find(u => u.email === emailNew || u.email === emailLegacy);
    
    if (!adminUser) {
      return c.json({ error: "Admin user not found in Supabase Auth" }, 404);
    }

    // Force update admin password to ADMIN_PIN (handles migration from old passwords)
    const { error: updatePwError } = await supabase.auth.admin.updateUserById(adminUser.id, {
      password: ADMIN_PIN,
    });
    if (updatePwError) {
      console.error("⚠️ Failed to update admin password:", updatePwError.message);
    } else {
      console.log("✅ Admin password updated to ADMIN_PIN");
    }

    // Force update KV store with admin flag (use international phone format)
    const userData = {
      id: adminUser.id,
      phone: ADMIN_PHONE,
      name: adminUser.user_metadata?.name || "Admin",
      points: 0,
      createdAt: adminUser.created_at,
      isAdmin: true, // Force set admin flag
    };

    await kv.set(`user:${adminUser.id}`, userData);
    
    console.log(`✅ Force initialized admin user in KV: ${adminUser.id}`);
    
    return c.json({ 
      success: true,
      message: "Admin user data updated in KV store",
      userData: userData
    });
  } catch (error) {
    console.error("Force init admin error:", error);
    return c.json({ error: error.message, stack: error.stack }, 500);
  }
});

// User Signup
app.post("/make-server-e5e192fb/signup", async (c) => {
  try {
    const { phone, pin, password, name } = await c.req.json();
    const credential = pin || password; // Accept both field names, prefer pin
    
    console.log(`📝 SIGNUP: Starting signup for phone: ${phone}`);
    
    if (!phone || !credential || !name) {
      return c.json({ error: "Phone number, 6-digit PIN, and name are required" }, 400);
    }

    // Validate PIN format (must be exactly 6 digits)
    if (!isValidPin(credential)) {
      return c.json({ error: "PIN must be exactly 6 digits" }, 400);
    }

    // Normalize phone to international format for storage
    const normalizedPhone = normalizePhoneForStorage(phone);
    const phoneDigits = phoneToDigits(normalizedPhone);
    console.log(`📝 SIGNUP: Normalized phone: ${normalizedPhone}, digits: ${phoneDigits}`);
    
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return c.json({ error: "Phone number must be 10-15 digits (with country code)" }, 400);
    }

    console.log(`📝 SIGNUP: PIN format validated (6 digits)`);
    
    // Check if phone already exists (check both normalized and legacy formats)
    const existingUsers = await kv.getByPrefix("user:");
    const phoneExists = existingUsers.some((user: any) => {
      const existingDigits = phoneToDigits(user.phone || '');
      return existingDigits === phoneDigits || user.phone === phone;
    });
    if (phoneExists) {
      return c.json({ error: "Phone number already registered" }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Use phone digits as email format for Supabase auth
    const email = phoneToEmail(normalizedPhone);
    console.log(`📝 SIGNUP: Using email: ${email}`);

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: credential,
      user_metadata: { name, phone: normalizedPhone },
      email_confirm: true, // Automatically confirm since email server not configured
    });

    if (error) {
      console.log(`❌ SIGNUP: Supabase auth error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    // Store user data in KV store
    const userId = data.user.id;
    const adminFlag = isAdminPhone(normalizedPhone);
    await kv.set(`user:${userId}`, {
      id: userId,
      phone: normalizedPhone,
      name,
      points: 0,
      createdAt: new Date().toISOString(),
      isAdmin: adminFlag,
    });

    console.log(`✅ SIGNUP: User created successfully - ID: ${userId}, Phone: ${normalizedPhone}`);

    // Auto-assign eligible vouchers to the new user (all-customer vouchers + matching tier)
    if (!adminFlag) {
      const vouchersAssigned = await autoAssignVouchersToUser(userId, "Silver", normalizedPhone);
      if (vouchersAssigned > 0) {
        console.log(`🎟️ SIGNUP: Auto-assigned ${vouchersAssigned} voucher(s) to new user ${userId}`);
      }
    }

    return c.json({ 
      success: true, 
      user: { id: userId, phone: normalizedPhone, name, points: 0, isAdmin: adminFlag }
    });
  } catch (error) {
    console.log(`❌ SIGNUP exception: ${error}`);
    return c.json({ error: "Signup failed" }, 500);
  }
});

// User Signin
app.post("/make-server-e5e192fb/signin", async (c) => {
  try {
    const { phone, pin, password } = await c.req.json();
    const credential = pin || password; // Accept both field names, prefer pin
    
    console.log(`🔐 SIGNIN: Starting signin for phone: ${phone}`);
    
    if (!phone || !credential) {
      return c.json({ error: "Phone number and 6-digit PIN are required" }, 400);
    }

    console.log(`🔐 SIGNIN: PIN-based authentication`);

    // Normalize phone to international format
    const normalizedPhone = normalizePhoneForStorage(phone);
    const newEmail = phoneToEmail(normalizedPhone);
    console.log(`🔐 SIGNIN: Normalized phone: ${normalizedPhone}, new email: ${newEmail}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Try new international format first
    console.log(`🔐 SIGNIN: Trying new format email=${newEmail}`);
    let { data, error } = await supabase.auth.signInWithPassword({
      email: newEmail,
      password: credential,
    });

    // If new format fails, try legacy format (phone digits without country code)
    // This handles existing users who registered before country code was added
    if (error) {
      // Extract just the local digits (strip country code prefix)
      const rawDigits = phone.replace(/\D/g, '');
      // Build possible legacy emails: the raw digits as-is, or without leading 0
      const legacyEmails = new Set<string>();
      legacyEmails.add(`${rawDigits}@${SERVER_CONFIG.emailDomain}`);
      // If phone was like +628123456789, rawDigits = 628123456789
      // Legacy user might have registered as 8123456789 or 08123456789
      // Try stripping the country code prefix to get local number
      if (normalizedPhone.startsWith('+62') && rawDigits.startsWith('62')) {
        legacyEmails.add(`${rawDigits.slice(2)}@${SERVER_CONFIG.emailDomain}`); // 8123456789
        legacyEmails.add(`0${rawDigits.slice(2)}@${SERVER_CONFIG.emailDomain}`); // 08123456789
      }
      // Remove the already-tried email
      legacyEmails.delete(newEmail);

      console.log(`🔐 SIGNIN: New format failed, trying legacy emails:`, [...legacyEmails]);

      for (const legacyEmail of legacyEmails) {
        const legacyResult = await supabase.auth.signInWithPassword({
          email: legacyEmail,
          password: credential,
        });
        if (!legacyResult.error && legacyResult.data?.session) {
          console.log(`✅ SIGNIN: Legacy format matched with email=${legacyEmail}`);
          data = legacyResult.data;
          error = null;
          
          // Migrate: update the user's KV phone to international format
          try {
            const kvData = await kv.get(`user:${data.user.id}`);
            if (kvData && !kvData.phone?.startsWith('+')) {
              console.log(`🔄 SIGNIN: Migrating KV phone from "${kvData.phone}" to "${normalizedPhone}"`);
              await kv.set(`user:${data.user.id}`, { ...kvData, phone: normalizedPhone });
            }
          } catch (migrateErr) {
            console.warn(`⚠️ SIGNIN: Failed to migrate phone in KV:`, truncateError(migrateErr));
          }
          break;
        }
      }
    }

    // If all formats failed and this is the admin user, force-update their password and retry
    if (error && isAdminPhone(phone) && credential === ADMIN_PIN) {
      console.log(`🔧 SIGNIN: Admin login failed, force-updating admin password to ADMIN_PIN...`);
      try {
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const adminEmailNew = phoneToEmail(normalizedPhone);
        const adminEmailLegacy = `${ADMIN_PHONE_LEGACY}@${SERVER_CONFIG.emailDomain}`;
        const adminUser = users?.find((u: any) => u.email === adminEmailNew || u.email === adminEmailLegacy);
        if (adminUser) {
          await supabase.auth.admin.updateUserById(adminUser.id, { password: ADMIN_PIN });
          console.log(`✅ SIGNIN: Admin password force-updated, retrying signin...`);
          const retryResult = await supabase.auth.signInWithPassword({
            email: adminUser.email!,
            password: ADMIN_PIN,
          });
          if (!retryResult.error && retryResult.data?.session) {
            data = retryResult.data;
            error = null;
            console.log(`✅ SIGNIN: Admin signin succeeded after password reset`);
          } else {
            console.log(`❌ SIGNIN: Admin signin still failed after password reset: ${retryResult.error?.message}`);
          }
        }
      } catch (adminFixErr) {
        console.error(`❌ SIGNIN: Failed to fix admin password:`, adminFixErr);
      }
    }

    if (error) {
      console.log(`❌ SIGNIN: All email formats failed - ${error.message}`);
      return c.json({ error: "Invalid phone number or PIN" }, 400);
    }

    if (!data || !data.session || !data.user) {
      console.log(`❌ SIGNIN: Missing data, session, or user in response`);
      return c.json({ error: "Authentication failed - invalid response" }, 500);
    }

    console.log(`✅ SIGNIN: Success! User ID: ${data.user.id}`);

    // Get user data from KV store
    const userData = await kv.get(`user:${data.user.id}`);
    console.log(`👤 SIGNIN: User data from KV:`, userData);

    // Check if user is blocked
    if (userData?.blocked) {
      console.log(`🚫 SIGNIN: User ${data.user.id} is blocked. Reason: ${userData.blockedReason}`);
      return c.json({ error: "Your account has been blocked. Please contact the restaurant for assistance." }, 403);
    }

    // Ensure phone is in international format in response
    const responseUser = userData 
      ? { ...userData, phone: normalizePhoneForStorage(userData.phone || phone) }
      : { id: data.user.id, phone: normalizedPhone, points: 0 };
    
    // Create our own custom JWT token (bypasses Supabase Auth credential mismatch)
    const customToken = await signToken({
      userId: data.user.id,
      phone: responseUser.phone,
      isAdmin: responseUser.isAdmin || false,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
    });
    
    console.log(`🔑 SIGNIN: Generated custom JWT token (first 30 chars): ${customToken.substring(0, 30)}...`);
    console.log(`📤 SIGNIN: Sending response with user:`, responseUser);

    return c.json({
      success: true,
      accessToken: customToken, // Using our custom JWT instead of Supabase's
      user: responseUser
    });
  } catch (error) {
    console.log(`❌ SIGNIN EXCEPTION: ${error}`);
    console.log(`❌ Exception stack:`, error?.stack);
    return c.json({ error: "Signin failed" }, 500);
  }
});

// Get User Profile (requires auth)
app.get("/make-server-e5e192fb/profile", async (c) => {
  try {
    // Get custom JWT token
    const customToken = getCustomToken(c);
    if (!customToken) {
      console.log(`❌ Profile GET - No custom token provided`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Verify custom JWT
    const payload = await verifyToken(customToken);
    if (!payload || !payload.userId) {
      console.log(`❌ Profile GET - Invalid token`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`✅ Profile GET - Fetching profile for user: ${payload.userId}`);

    const userData = await kvGetWithRetry(`user:${payload.userId}`);
    if (!userData) {
      console.log(`❌ Profile GET - User not found: ${payload.userId}`);
      return c.json({ error: "User not found" }, 404);
    }

    // Normalize phone to international format if legacy
    try {
      if (userData.phone && !userData.phone.startsWith('+')) {
        userData.phone = normalizePhoneForStorage(userData.phone);
        // Persist the migration
        await kvRetry(() => kv.set(`user:${payload.userId}`, userData));
        console.log(`🔄 Profile GET - Migrated phone to international format: ${userData.phone}`);
      }
    } catch (migrationErr) {
      console.warn(`⚠️ Profile GET - Phone migration failed (non-fatal): ${migrationErr}`);
    }

    console.log(`✅ Profile GET - User data:`, { id: userData.id, name: userData.name, points: userData.points });
    return c.json({ user: userData });
  } catch (error) {
    console.log(`❌ Profile error: ${error?.message || error}`);
    return c.json({ error: `Failed to get profile: ${error?.message || error}` }, 500);
  }
});

// (switch-to-pin endpoint removed — PIN is now the only auth method)

// ========================================
// CART ENDPOINTS (User-Specific Carts)
// ========================================

// Get User's Cart (requires auth)
app.get("/make-server-e5e192fb/cart", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    
    if (!accessToken) {
      console.log(`❌ Cart GET - No access token provided`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Use custom JWT verification
    const userAuth = await verifyUserAccess(accessToken);
    if (!userAuth) {
      console.log(`❌ Cart GET - Invalid JWT token`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`✅ Cart GET - Fetching cart for user: ${userAuth.userId}`);

    // Get cart from KV store (with retry for transient connection errors)
    const cart = await kvRetry(() => kv.get(`cart:${userAuth.userId}`)) || [];
    
    console.log(`📥 Retrieved cart for user ${userAuth.userId}:`, cart);
    
    return c.json({ cart });
  } catch (error) {
    console.error(`Cart retrieval error: ${error}`);
    return c.json({ error: "Failed to get cart" }, 500);
  }
});

// Add Item to Cart (requires auth)
app.post("/make-server-e5e192fb/cart/add", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Use custom JWT verification
    const userAuth = await verifyUserAccess(accessToken);
    if (!userAuth) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { item } = await c.req.json();
    
    if (!item || !item.id) {
      return c.json({ error: "Invalid item" }, 400);
    }

    // Get current cart
    const cart = await kv.get(`cart:${userAuth.userId}`) || [];
    
    // Check if item already exists
    const existingIndex = cart.findIndex((i: any) => i.id === item.id);
    
    if (existingIndex >= 0) {
      // Update quantity
      cart[existingIndex].quantity = (cart[existingIndex].quantity || 1) + (item.quantity || 1);
    } else {
      // Add new item
      cart.push({ ...item, quantity: item.quantity || 1 });
    }
    
    // Save cart
    await kv.set(`cart:${userAuth.userId}`, cart);
    
    console.log(`🛒 Added item to cart for user ${userAuth.userId}:`, item.title);
    
    return c.json({ cart, message: "Item added to cart" });
  } catch (error) {
    console.error(`Add to cart error: ${error}`);
    return c.json({ error: "Failed to add item to cart" }, 500);
  }
});

// Update Cart Item Quantity (requires auth)
app.put("/make-server-e5e192fb/cart/update", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Use custom JWT verification
    const userAuth = await verifyUserAccess(accessToken);
    if (!userAuth) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { itemId, quantity } = await c.req.json();
    
    if (!itemId || quantity === undefined) {
      return c.json({ error: "Item ID and quantity are required" }, 400);
    }

    // Get current cart
    const cart = await kv.get(`cart:${userAuth.userId}`) || [];
    
    // Find item
    const itemIndex = cart.findIndex((i: any) => i.id === itemId);
    
    if (itemIndex === -1) {
      return c.json({ error: "Item not found in cart" }, 404);
    }
    
    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
      cart.splice(itemIndex, 1);
    } else {
      // Update quantity
      cart[itemIndex].quantity = quantity;
    }
    
    // Save cart
    await kv.set(`cart:${userAuth.userId}`, cart);
    
    console.log(`🔄 Updated cart for user ${userAuth.userId}`);
    
    return c.json({ cart, message: "Cart updated" });
  } catch (error) {
    console.error(`Update cart error: ${error}`);
    return c.json({ error: "Failed to update cart" }, 500);
  }
});

// Remove Item from Cart (requires auth)
app.delete("/make-server-e5e192fb/cart/remove/:itemId", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Use custom JWT verification
    const userAuth = await verifyUserAccess(accessToken);
    if (!userAuth) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const itemId = c.req.param('itemId');
    
    if (!itemId) {
      return c.json({ error: "Item ID is required" }, 400);
    }

    // Get current cart
    const cart = await kv.get(`cart:${userAuth.userId}`) || [];
    
    // Remove item
    const updatedCart = cart.filter((i: any) => i.id.toString() !== itemId);
    
    // Save cart
    await kv.set(`cart:${userAuth.userId}`, updatedCart);
    
    console.log(`🗑️  Removed item ${itemId} from cart for user ${userAuth.userId}`);
    
    return c.json({ cart: updatedCart, message: "Item removed from cart" });
  } catch (error) {
    console.error(`Remove from cart error: ${error}`);
    return c.json({ error: "Failed to remove item from cart" }, 500);
  }
});

// Clear Cart (requires auth)
app.delete("/make-server-e5e192fb/cart/clear", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Use custom JWT verification
    const userAuth = await verifyUserAccess(accessToken);
    if (!userAuth) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Clear cart
    await kv.set(`cart:${userAuth.userId}`, []);
    
    console.log(`🧹 Cleared cart for user ${userAuth.userId}`);
    
    return c.json({ cart: [], message: "Cart cleared" });
  } catch (error) {
    console.error(`Clear cart error: ${error}`);
    return c.json({ error: "Failed to clear cart" }, 500);
  }
});

// Sync Cart (replace entire cart) (requires auth)
app.post("/make-server-e5e192fb/cart/sync", async (c) => {
  console.log("🔵 Cart SYNC endpoint hit");
  console.log("📋 Request headers:", Object.fromEntries(c.req.raw.headers.entries()));
  
  try {
    const bodyText = await c.req.text();
    console.log("📦 Raw request body:", bodyText);
    
    const { cart, userId } = JSON.parse(bodyText);
    console.log("🔑 Parsed userId:", userId);
    console.log("🛒 Parsed cart length:", Array.isArray(cart) ? cart.length : "not an array");
    
    if (!userId) {
      console.log(`❌ Cart SYNC - No userId provided`);
      return c.json({ error: "User ID required" }, 400);
    }
    
    if (!Array.isArray(cart)) {
      return c.json({ error: "Cart must be an array" }, 400);
    }

    // Save cart (with retry for transient connection errors)
    await kvRetry(() => kv.set(`cart:${userId}`, cart));
    
    console.log(`🔄 Synced cart for user ${userId} with ${cart.length} items`);
    
    return c.json({ cart, message: "Cart synced" });
  } catch (error) {
    console.error(`Sync cart error: ${error}`);
    return c.json({ error: "Failed to sync cart" }, 500);
  }
});

// Create Order (supports both authenticated and guest orders)
app.post("/make-server-e5e192fb/orders", async (c) => {
  try {
    const orderData = await c.req.json();
    const userId = orderData.userId;
    const isGuestOrder = !userId;
    
    // For guest orders, require guestName and guestPhone
    if (isGuestOrder) {
      const { guestName, guestPhone } = orderData;
      
      if (!guestName || !guestPhone) {
        return c.json({ error: "Guest name and phone number are required" }, 400);
      }
      
      // Validate phone number (10-12 digits)
      const phoneDigits = guestPhone.replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 12) {
        return c.json({ error: "Phone number must be 10-12 digits" }, 400);
      }
      
      // RATE LIMITING: Check guest order count in last hour
      const rateLimitKey = `guest_rate_limit:${phoneDigits}`;
      const guestOrders = await kv.get(rateLimitKey) || [];
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const recentOrders = guestOrders.filter((timestamp: number) => timestamp > oneHourAgo);
      
      if (recentOrders.length >= 3) {
        return c.json({ 
          error: "Too many orders. Please wait before placing another order or create an account.",
          code: "RATE_LIMIT_EXCEEDED"
        }, 429);
      }
      
      // Update rate limit
      await kv.set(rateLimitKey, [...recentOrders, Date.now()]);
      
      console.log(`=== BACKEND: Creating GUEST order for ${guestName} (${guestPhone}) ===`);
    } else {
      console.log("=== BACKEND: Creating order ===");
      console.log("User ID:", userId);
    }
    
    console.log("Order Data:", JSON.stringify(orderData, null, 2));
    
    // ✅ CHECK RESTAURANT STATUS BEFORE ACCEPTING ORDER
    const settings = await kvGetWithRetry("restaurant_settings");
    if (settings) {
      // Check maintenance mode
      if (settings.maintenanceMode) {
        console.log("❌ Order rejected - maintenance mode");
        return c.json({ 
          error: "Restaurant is temporarily closed for maintenance",
          code: "MAINTENANCE_MODE"
        }, 400);
      }

      // Check if manually accepting orders
      if (!settings.acceptingOrders) {
        console.log("❌ Order rejected - not accepting orders");
        return c.json({ 
          error: "Restaurant is not accepting orders at this time",
          code: "NOT_ACCEPTING_ORDERS"
        }, 400);
      }
    }
    
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Generate sequential order number
    const counterKey = "order_counter";
    let currentCounter = await kv.get(counterKey);
    if (!currentCounter) {
      currentCounter = 0;
    }
    const newCounter = currentCounter + 1;
    await kv.set(counterKey, newCounter);
    
    // Format as PREFIX00000001, PREFIX00000002, etc.
    const orderNumber = `${SERVER_CONFIG.orderPrefix}${String(newCounter).padStart(8, '0')}`;
    
    const isMidtransPayment = orderData.paymentMethod === "midtrans";
    const isAlreadyPaid = orderData.paymentReceived === true;

    // Resolve customer name for the order
    let customerName = orderData.guestName || "";
    if (!customerName && userId) {
      try {
        const userData = await kv.get(`user:${userId}`);
        if (userData?.name) customerName = userData.name;
      } catch (_) { /* ignore */ }
    }
    
    const order = {
      id: orderId,
      orderNumber: orderNumber,
      userId: userId,
      customerName,
      ...orderData,
      status: isAlreadyPaid ? "confirmed" : "pending",
      paymentReceived: isAlreadyPaid,
      paymentStatus: isAlreadyPaid ? "paid" : (isMidtransPayment ? "awaiting_payment" : "unpaid"),
      paymentMethod: orderData.paymentMethod || "cash",
      paidAmount: isAlreadyPaid ? (orderData.total || 0) : 0,
      paymentHistory: isAlreadyPaid ? [{
        method: "midtrans",
        amount: orderData.total || 0,
        timestamp: now,
        status: "settlement",
        note: "Online payment via Midtrans (confirmed at order creation)",
      }] : [],
      pointsAwarded: false,
      statusHistory: isAlreadyPaid ? [
        { status: "pending", timestamp: now, label: "Order Created", actor: { name: "Customer", role: "customer" } },
        { status: "payment_received", timestamp: now, label: "Payment received via Midtrans", actor: { name: "System", role: "system" } },
        { status: "confirmed", timestamp: now, label: "Order auto-confirmed (payment received)", actor: { name: "System", role: "system" } },
      ] : [
        { status: "pending", timestamp: now, label: "Order Created", actor: { name: "Customer", role: "customer" } }
      ],
      createdAt: now,
      updatedAt: now,
    };

    console.log("Storing order with ID:", orderId, "Order Number:", orderNumber);
    
    // Store order (with retry for transient connection errors)
    await kvRetry(() => kv.set(`order:${orderId}`, order));

    // Add to user's orders list (skip for guest orders)
    if (!isGuestOrder) {
      const userOrdersKey = `user_orders:${userId}`;
      const existingOrders: string[] = (await kvRetry(() => kv.get(userOrdersKey))) || [];
      // Deduplicate before appending to guard against race conditions
      if (!existingOrders.includes(orderId)) {
        await kv.set(userOrdersKey, [...existingOrders, orderId]);
      }
    } else {
      // For guest orders, also store by phone for lookup
      const guestPhoneKey = `guest_orders:${orderData.guestPhone.replace(/\D/g, '')}`;
      const existingGuestOrders = await kv.get(guestPhoneKey) || [];
      await kv.set(guestPhoneKey, [...existingGuestOrders, orderId]);
    }

    console.log("Order stored successfully");
    
    // Note: Points will be awarded when order is closed AND payment is received

    // Notify staff about new order (non-blocking)
    const shortON = getShortOrderIdServer(orderNumber);
    const deliveryLabel = orderData.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup';
    notifyStaffByRole(['manager', 'cashier', 'kitchen'], {
      title: `New Order ${shortON}`,
      body: `${deliveryLabel} order — ${orderData.itemTitle || 'New order'}`,
      url: '/staff/admin',
      tag: `staff-new-order-${orderId}`,
    }).catch(() => {});

    console.log("✅ Order creation complete");
    return c.json({ success: true, order });
  } catch (error) {
    console.log(`Create order error: ${error}`);
    console.log(`Error stack: ${error?.stack}`);
    return c.json({ error: `Failed to create order: ${error?.message}` }, 500);
  }
});

// Get User Orders (requires auth) — with server-side pagination
app.get("/make-server-e5e192fb/orders", async (c) => {
  try {
    // Auto-activate any scheduled orders whose time has arrived
    await activateScheduledOrders();

    const userId = c.req.query('userId');
    
    if (!userId) {
      console.log("GET orders - No userId provided");
      return c.json({ error: "User ID is required" }, 400);
    }

    // Pagination params
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const filterStatus = c.req.query('filter') || 'all'; // 'all', 'active', 'closed', 'unpaid'

    console.log(`GET orders - user: ${userId}, page=${page}, limit=${limit}, filter=${filterStatus}`);

    const userOrdersKey = `user_orders:${userId}`;
    const orderIds = await kvRetry(() => kv.get(userOrdersKey)) || [];
    
    const orders = await Promise.all(
      orderIds.map((id: string) => kvRetry(() => kv.get(`order:${id}`)))
    );

    // Filter out null orders and draft orders awaiting online payment
    let filteredOrders = orders.filter(o => o !== null && o.paymentStatus !== "awaiting_payment");

    // Apply status filter
    if (filterStatus === 'active') {
      filteredOrders = filteredOrders.filter((o: any) => !['closed', 'cancelled'].includes(o.status));
    } else if (filterStatus === 'closed') {
      filteredOrders = filteredOrders.filter((o: any) => ['closed', 'cancelled'].includes(o.status));
    } else if (filterStatus === 'unpaid') {
      filteredOrders = filteredOrders.filter((o: any) => o.paymentStatus !== 'paid' && o.status !== 'cancelled');
    }

    // Sort by creation date (newest first)
    filteredOrders.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalOrders = filteredOrders.length;
    const totalPages = Math.max(1, Math.ceil(totalOrders / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const paginatedOrders = filteredOrders.slice(start, start + limit);

    console.log(`Returning ${paginatedOrders.length} of ${totalOrders} orders (page ${safePage}/${totalPages})`);
    
    return c.json({ 
      orders: paginatedOrders,
      totalOrders,
      totalPages,
      page: safePage,
      limit,
    });
  } catch (error) {
    console.log(`Get orders error: ${error}`);
    return c.json({ error: "Failed to get orders" }, 500);
  }
});

// Get Single Order (supports guest orders)
app.get("/make-server-e5e192fb/orders/:id", async (c) => {
  try {
    const orderId = c.req.param('id');
    const userId = c.req.query('userId');
    
    console.log(`📦 GET /orders/${orderId} - userId: ${userId}`);
    
    if (!userId) {
      console.log(`❌ No userId provided`);
      return c.json({ error: "User ID is required" }, 400);
    }

    console.log(`🔍 Fetching order from KV: order:${orderId}`);
    const order = await kvRetry(() => kv.get(`order:${orderId}`));
    
    if (!order) {
      console.log(`❌ Order not found in KV store`);
      return c.json({ error: "Order not found" }, 404);
    }
    
    console.log(`✅ Order found. Order userId: ${order.userId}, Request userId: ${userId}`);
    
    // For guest orders (userId === null), allow anyone to view if they have the order ID
    // For user orders, verify it belongs to the requesting user
    if (order.userId && order.userId !== userId && userId !== 'guest') {
      console.log(`❌ Unauthorized - order belongs to different user`);
      return c.json({ error: "Unauthorized to view this order" }, 403);
    }
    
    console.log(`✅ Returning order data`);
    return c.json({ order });
  } catch (error) {
    console.log(`❌ Get order error: ${error}`);
    console.log(`Error stack: ${error?.stack}`);
    return c.json({ error: "Failed to get order" }, 500);
  }
});

// Track Orders by Phone (for guest orders)
app.get("/make-server-e5e192fb/orders/track/:phone", async (c) => {
  try {
    const phone = c.req.param('phone');
    
    if (!phone) {
      return c.json({ error: "Phone number is required" }, 400);
    }
    
    // Normalize phone number (remove non-digits)
    const phoneDigits = phone.replace(/\D/g, '');
    
    if (phoneDigits.length < 10 || phoneDigits.length > 12) {
      return c.json({ error: "Invalid phone number" }, 400);
    }
    
    console.log(`Tracking orders for phone: ${phoneDigits}`);
    
    // Get guest orders by phone
    const guestPhoneKey = `guest_orders:${phoneDigits}`;
    const orderIds = await kv.get(guestPhoneKey) || [];
    
    console.log(`Found ${orderIds.length} guest order IDs for phone ${phoneDigits}`);
    
    const orders = await Promise.all(
      orderIds.map((id: string) => kv.get(`order:${id}`))
    );
    
    const filteredOrders = orders.filter(o => o !== null);
    
    // Sort by creation date (newest first)
    filteredOrders.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    console.log(`Returning ${filteredOrders.length} guest orders`);
    
    return c.json({ orders: filteredOrders });
  } catch (error) {
    console.log(`Track orders error: ${error}`);
    return c.json({ error: "Failed to track orders" }, 500);
  }
});

// Link Guest Order to User Account (requires auth)
app.post("/make-server-e5e192fb/link-guest-order", async (c) => {
  try {
    console.log("🔗 ========== LINK GUEST ORDER REQUEST ==========");
    
    // Use getCustomToken helper which checks both X-Custom-Auth and Authorization headers
    const accessToken = getCustomToken(c);
    
    console.log(`🔗 Custom token extracted: ${accessToken ? 'Yes' : 'No'}`);
    if (accessToken) {
      console.log(`🔗 Token (first 50 chars): ${accessToken.substring(0, 50)}...`);
      console.log(`🔗 Token length: ${accessToken.length}`);
      console.log(`🔗 Token parts count: ${accessToken.split('.').length}`);
    }
    
    if (!accessToken) {
      console.error("❌ Link guest order: No access token provided");
      const authHeader = c.req.header('Authorization');
      const customAuthHeader = c.req.header('X-Custom-Auth');
      console.error(`❌ Authorization header: ${authHeader}`);
      console.error(`❌ X-Custom-Auth header: ${customAuthHeader}`);
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        details: "No access token provided"
      }, 401);
    }
    
    // Use custom JWT verification instead of Supabase auth
    console.log(`🔗 About to call verifyUserAccess...`);
    const userAuth = await verifyUserAccess(accessToken);
    console.log(`🔗 verifyUserAccess returned:`, userAuth);
    
    if (!userAuth || !userAuth.userId) {
      console.error("❌ Link guest order: Invalid JWT token");
      console.error(`❌ userAuth was: ${JSON.stringify(userAuth)}`);
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        details: "Custom JWT verification failed"
      }, 401);
    }
    
    console.log(`✅ Link guest order: JWT verified for user ${userAuth.userId}`);
    
    const { orderId } = await c.req.json();
    
    if (!orderId) {
      return c.json({ error: "Order ID is required" }, 400);
    }
    
    console.log(`🔗 Linking guest order ${orderId} to user ${userAuth.userId}`);
    
    // Get the order
    const order = await kv.get(`order:${orderId}`);
    console.log(`🔗 Order data:`, JSON.stringify(order, null, 2));
    
    if (!order) {
      console.error(`❌ Order not found: ${orderId}`);
      return c.json({ error: "Order not found" }, 404);
    }
    
    // Check if order is already linked to a user
    if (order.userId) {
      console.log(`⚠️ Order ${orderId} is already linked to user ${order.userId}`);
      return c.json({ error: "Order is already linked to a user account" }, 400);
    }
    
    // Get user data to verify phone matches
    const userData = await kv.get(`user:${userAuth.userId}`);
    console.log(`🔗 User data:`, JSON.stringify(userData, null, 2));
    
    if (!userData) {
      console.error(`❌ User data not found for user: ${userAuth.userId}`);
      return c.json({ error: "User data not found" }, 404);
    }
    
    // Verify phone number matches (security check)
    const orderPhone = (order.phone || order.guestPhone || "").replace(/\D/g, '');
    const userPhone = userData.phone.replace(/\D/g, '');
    
    console.log(`🔗 Comparing phones - Order: ${orderPhone}, User: ${userPhone}`);
    
    if (orderPhone !== userPhone) {
      console.log(`⚠️ Phone mismatch: order=${orderPhone}, user=${userPhone}`);
      return c.json({ error: "Phone number does not match" }, 403);
    }
    
    console.log(`✅ Phone numbers match! Proceeding with link...`);
    
    // Update order with userId
    const updatedOrder = {
      ...order,
      userId: userAuth.userId,
      linkedAt: new Date().toISOString(),
    };
    
    console.log(`🔗 Updating order ${orderId} with userId ${userAuth.userId}...`);
    await kv.set(`order:${orderId}`, updatedOrder);
    console.log(`✅ Order updated in KV store`);
    
    // Award points retroactively if the order is already delivered/closed
    let pointsAwarded = 0;
    const isTerminal = ['delivered', 'closed'].includes(updatedOrder.status);
    if (isTerminal && !updatedOrder.pointsAwarded) {
      const pointsToAward = Math.floor(updatedOrder.total / 1000);
      console.log(`🎁 Order is already ${updatedOrder.status} — retroactively awarding ${pointsToAward} points to user ${userAuth.userId}`);
      
      if (pointsToAward > 0) {
        const oldPoints = userData.points || 0;
        const oldTotal = userData.totalPointsEarned || 0;
        const oldTier = userData.tier || getUserTier(oldTotal);
        userData.points = oldPoints + pointsToAward;
        userData.totalPointsEarned = oldTotal + pointsToAward;
        
        // Update tier based on total points
        if (userData.totalPointsEarned >= 10000) {
          userData.tier = "Platinum";
        } else if (userData.totalPointsEarned >= 5000) {
          userData.tier = "Diamond";
        } else if (userData.totalPointsEarned >= 2000) {
          userData.tier = "Gold";
        } else {
          userData.tier = "Silver";
        }
        
        await kv.set(`user:${userAuth.userId}`, userData);
        
        updatedOrder.pointsAwarded = true;
        updatedOrder.pointsEarned = pointsToAward;
        await kv.set(`order:${orderId}`, updatedOrder);
        
        pointsAwarded = pointsToAward;
        console.log(`✅ Retroactively awarded ${pointsToAward} points (${oldPoints} -> ${userData.points}), tier: ${userData.tier}`);

        // Auto-assign vouchers if tier changed after retroactive points
        if (userData.tier !== oldTier) {
          console.log(`🎉 Tier promotion (retroactive): ${oldTier} -> ${userData.tier} for user ${userAuth.userId}`);
          const vouchersAssigned = await autoAssignVouchersToUser(userAuth.userId, userData.tier, userData.phone);
          if (vouchersAssigned > 0) {
            console.log(`🎟️ Auto-assigned ${vouchersAssigned} voucher(s) after retroactive tier promotion`);
          }
        }
      }
    } else if (!isTerminal) {
      console.log(`ℹ️ Order status is "${updatedOrder.status}" — points will be awarded when delivered/closed`);
    }
    
    // Add order to user's order list (use user_orders prefix for consistency)
    const userOrdersKey = `user_orders:${userAuth.userId}`;
    const existingOrders = await kv.get(userOrdersKey) || [];
    console.log(`🔗 Current user orders: ${existingOrders.length} orders`);
    
    if (!existingOrders.includes(orderId)) {
      await kv.set(userOrdersKey, [...existingOrders, orderId]);
      console.log(`✅ Added order ${orderId} to user's order list`);
    } else {
      console.log(`ℹ️ Order ${orderId} already in user's order list`);
    }
    
    // Remove from guest orders list (optional cleanup)
    const guestPhoneKey = `guest_orders:${orderPhone}`;
    const guestOrders = await kv.get(guestPhoneKey) || [];
    const updatedGuestOrders = guestOrders.filter((id: string) => id !== orderId);
    
    if (updatedGuestOrders.length > 0) {
      await kv.set(guestPhoneKey, updatedGuestOrders);
      console.log(`✅ Updated guest orders list (${updatedGuestOrders.length} remaining)`);
    } else {
      await kv.del(guestPhoneKey);
      console.log(`✅ Removed guest orders list (was empty)`);
    }
    
    console.log(`✅ Successfully linked order ${orderId} to user ${userAuth.userId}`);
    
    return c.json({ 
      success: true, 
      message: "Order linked successfully",
      order: updatedOrder,
      pointsAwarded,
    });
  } catch (error) {
    console.error(`❌ Link guest order error:`, error);
    return c.json({ error: "Failed to link order" }, 500);
  }
});

// Redeem Points (requires auth)
app.post("/make-server-e5e192fb/redeem-points", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { rewardId, pointsCost } = await c.req.json();

    const userData = await kv.get(`user:${user.id}`);
    if (!userData || userData.points < pointsCost) {
      return c.json({ error: "Insufficient points" }, 400);
    }

    // Deduct points
    userData.points -= pointsCost;
    await kv.set(`user:${user.id}`, userData);

    return c.json({ 
      success: true, 
      remainingPoints: userData.points,
      message: "Reward redeemed successfully"
    });
  } catch (error) {
    console.log(`Redeem points error: ${error}`);
    return c.json({ error: "Failed to redeem points" }, 500);
  }
});

// SIMPLE TEST: No auth required
app.get("/make-server-e5e192fb/debug/ping", async (c) => {
  console.log("🎯🎯🎯 PING ENDPOINT CALLED");
  return c.json({ 
    success: true, 
    message: "Pong! Debug endpoint is working!",
    timestamp: new Date().toISOString()
  });
});

// DEBUG: Force initialize admin user in KV store
app.post("/make-server-e5e192fb/debug/force-init-admin", async (c) => {
  console.log("🔧🔧🔧 FORCE INIT ADMIN ENDPOINT CALLED");
  try {
    const body = await c.req.json();
    const { phone, pin, password } = body;
    const credential = pin || password; // Accept both field names
    
    console.log(`Attempting to force-init admin for phone: ${phone}`);
    
    // Accept both old and new admin phone formats
    if (!isAdminPhone(phone) || credential !== ADMIN_PIN) {
      return c.json({ error: "Invalid admin credentials" }, 403);
    }
    
    // Try both new and legacy email formats
    const emailNew = phoneToEmail(ADMIN_PHONE);
    const emailLegacy = `${ADMIN_PHONE_LEGACY}@${SERVER_CONFIG.emailDomain}`;
    
    // Create Supabase service client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    
    // Check if user exists in Supabase Auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    console.log(`Found ${users?.length || 0} total users in Supabase Auth`);
    
    let userId;
    const existingUser = users?.find(u => u.email === emailNew || u.email === emailLegacy);
    
    if (existingUser) {
      console.log(`Admin user already exists in Supabase: ${existingUser.id}`);
      userId = existingUser.id;
    } else {
      // Create admin user in Supabase with new format
      console.log(`Creating new admin user in Supabase...`);
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: emailNew,
        password: credential,
        email_confirm: true,
        user_metadata: { name: "Admin User", phone: ADMIN_PHONE }
      });
      
      if (createError) {
        console.error("Failed to create admin user:", createError);
        return c.json({ error: "Failed to create admin user", details: createError.message }, 500);
      }
      
      userId = newUser.user.id;
      console.log(`✅ Created admin user: ${userId}`);
    }
    
    // Force set isAdmin flag in KV store
    const adminUserData = {
      id: userId,
      phone: ADMIN_PHONE,
      name: "Admin User",
      email: emailNew,
      points: 0,
      tier: "Silver",
      isAdmin: true,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(`user:${userId}`, adminUserData);
    console.log(`✅ Force-set isAdmin flag in KV store for user: ${userId}`);
    
    // Return success with user data
    return c.json({ 
      success: true, 
      message: "Admin user initialized with isAdmin flag",
      userId,
      userData: adminUserData
    });
    
  } catch (error) {
    console.error("Force init admin error:", error);
    return c.json({ error: "Failed to force init admin", details: String(error) }, 500);
  }
});

// DEBUG: Test JWT validation (temporary endpoint for debugging)
app.get("/make-server-e5e192fb/debug/validate-jwt", async (c) => {
  console.log("🚀🚀🚀 DEBUG ENDPOINT CALLED - /debug/validate-jwt");
  const logs: string[] = [];
  
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    
    logs.push(`Auth header received: ${authHeader ? 'Yes' : 'No'}`);
    logs.push(`Token (first 30 chars): ${accessToken?.substring(0, 30)}...`);
    
    if (!accessToken) {
      logs.push("No access token provided");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        details: "No access token provided",
        logs 
      }, 401);
    }

    // Use our custom JWT verification with detailed error capture
    let payload;
    let verifyError;
    try {
      logs.push("Attempting to verify custom JWT...");
      payload = await verifyToken(accessToken);
      logs.push(`Verify result: ${payload ? 'Success' : 'Failed (null payload)'}`);
      if (payload) {
        logs.push(`Payload keys: ${Object.keys(payload).join(', ')}`);
      }
    } catch (err) {
      verifyError = err;
      logs.push(`Verify threw error: ${err.message}`);
    }
    
    if (!payload || !payload.userId) {
      logs.push("Custom JWT verification failed - no valid payload or userId");
      return c.json({
        code: 401,
        message: "Invalid JWT",
        details: "Custom JWT verification failed",
        verifyError: verifyError ? String(verifyError) : null,
        logs
      }, 401);
    }

    // Get user data from KV
    const kvData = await kv.get(`user:${payload.userId}`);
    logs.push(`KV data found: ${kvData ? 'Yes' : 'No'}`);

    return c.json({
      success: true,
      tokenReceived: accessToken.substring(0, 50) + "...",
      customJwtValidation: {
        success: true,
        userId: payload.userId,
        phone: payload.phone,
        isAdmin: payload.isAdmin,
        iat: payload.iat,
        exp: payload.exp,
      },
      kvData: kvData,
      logs
    });
  } catch (error) {
    logs.push(`Outer catch: ${error.message}`);
    return c.json({ 
      success: false,
      error: String(error),
      stack: error?.stack,
      logs 
    });
  }
});

// DEBUG: Show environment info (without exposing full keys)
app.get("/make-server-e5e192fb/debug/env-info", async (c) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    return c.json({
      success: true,
      supabaseUrl: supabaseUrl,
      anonKeyPrefix: anonKey.substring(0, 50) + '...',
      anonKeyLength: anonKey.length,
      serviceKeyPrefix: serviceKey.substring(0, 50) + '...',
      serviceKeyLength: serviceKey.length,
    });
  } catch (error) {
    return c.json({ 
      success: false,
      error: String(error)
    });
  }
});

// DEBUG: Test custom JWT in custom header (bypass platform validation)
app.post("/make-server-e5e192fb/debug/test-custom-jwt", async (c) => {
  console.log("🧪🧪🧪 CUSTOM JWT TEST ENDPOINT CALLED");
  const logs: string[] = [];
  
  try {
    const body = await c.req.json();
    const customToken = body.token;
    
    logs.push(`Custom token received: ${customToken ? 'Yes' : 'No'}`);
    logs.push(`Token (first 30 chars): ${customToken?.substring(0, 30)}...`);
    
    if (!customToken) {
      logs.push("No token provided in body");
      return c.json({ 
        success: false,
        message: "No token provided",
        logs 
      });
    }

    // Try to verify the custom JWT
    let payload;
    let verifyError;
    try {
      logs.push("Attempting to verify custom JWT...");
      payload = await verifyToken(customToken);
      logs.push(`Verify result: ${payload ? 'Success' : 'Failed (null payload)'}`);
      if (payload) {
        logs.push(`Payload: ${JSON.stringify(payload)}`);
      }
    } catch (err) {
      verifyError = err;
      logs.push(`Verify threw error: ${err.message}`);
    }
    
    if (!payload || !payload.userId) {
      logs.push("Custom JWT verification failed - no valid payload or userId");
      return c.json({
        success: false,
        message: "Custom JWT verification failed",
        verifyError: verifyError ? String(verifyError) : null,
        logs
      });
    }

    // Get user data from KV
    const kvData = await kv.get(`user:${payload.userId}`);
    logs.push(`KV data found: ${kvData ? 'Yes' : 'No'}`);

    return c.json({
      success: true,
      message: "Custom JWT validated successfully!",
      payload: payload,
      kvData: kvData,
      logs
    });
  } catch (error) {
    logs.push(`Outer catch: ${error.message}`);
    return c.json({ 
      success: false,
      error: String(error),
      stack: error?.stack,
      logs 
    });
  }
});

// Admin: Get All Users (requires auth + admin)
app.get("/make-server-e5e192fb/admin/users", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    
    console.log(`🔍 Admin users request - Token found: ${accessToken ? 'Yes' : 'No'}`);
    
    if (!accessToken) {
      console.log(`❌ No access token provided`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Use our custom JWT verification
    console.log(`🔍 Validating custom JWT token...`);
    const adminAuth = await verifyAdminAccess(accessToken);
    
    if (!adminAuth) {
      console.log(`❌ Admin verification failed`);
      return c.json({ error: "Admin access required" }, 403);
    }

    // Get all users
    console.log(`✅ Admin user ${adminAuth.userId} authorized, fetching all users`);
    const allUsers = await kv.getByPrefix("user:");
    return c.json({ users: allUsers });
  } catch (error) {
    console.log(`Admin get users error: ${error}`);
    return c.json({ error: "Failed to get users" }, 500);
  }
});

// Helper: derive short order ID on server (e.g. TNT00000102 -> TNT-102)
function getShortOrderIdServer(orderId: string): string {
  if (!orderId) return "";
  const prefix = SERVER_CONFIG.orderPrefix;
  const re = new RegExp(`^${prefix}0*(\\d+)$`, "i");
  const match = orderId.match(re);
  if (match) return `${prefix}-${match[1]}`;
  return orderId;
}

// Helper: Auto-activate scheduled orders whose scheduledAt time has passed
async function activateScheduledOrders(): Promise<number> {
  try {
    const allOrders = await kv.getByPrefix("order:");
    const now = new Date();
    let activatedCount = 0;

    for (const order of allOrders) {
      if (order && order.status === "scheduled" && order.scheduledAt) {
        const scheduledTime = new Date(order.scheduledAt);
        if (scheduledTime <= now) {
          const updatedOrder = {
            ...order,
            status: "pending",
            updatedAt: now.toISOString(),
            statusHistory: [
              ...(order.statusHistory || []),
              {
                status: "pending",
                timestamp: now.toISOString(),
                label: "Scheduled order activated",
                actor: { name: "System", role: "system" }
              }
            ],
            auditLog: [
              ...(order.auditLog || []),
              {
                timestamp: now.toISOString(),
                action: "SCHEDULED_ACTIVATED",
                performedBy: "system",
                details: `Scheduled order auto-activated (was scheduled for ${scheduledTime.toISOString()})`
              }
            ]
          };
          await kv.set(`order:${order.id}`, updatedOrder);
          activatedCount++;
          console.log(`⏰ Activated scheduled order ${order.orderNumber || order.id} (was scheduled for ${order.scheduledAt})`);
        }
      }
    }

    if (activatedCount > 0) {
      console.log(`✅ Activated ${activatedCount} scheduled order(s)`);
    }
    return activatedCount;
  } catch (error) {
    console.log(`⚠️ Error activating scheduled orders: ${error}`);
    return 0;
  }
}

// Admin: Get Orders with server-side filtering, pagination & stats
app.get("/make-server-e5e192fb/admin/orders", async (c) => {
  try {
    // Auto-activate any scheduled orders whose time has arrived
    await activateScheduledOrders();

    const accessToken = getCustomToken(c);
    if (!accessToken) {
      return c.json({ code: 401, message: "Invalid JWT" }, 401);
    }

    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Parse query params
    const page = Math.max(1, parseInt(c.req.query("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "10")));
    const statusFilter = c.req.query("status") || "all";
    const paymentFilter = c.req.query("payment") || "all";
    const deliveryFilter = c.req.query("delivery") || "all";
    const dateFilter = c.req.query("date") || "all";
    const searchQuery = (c.req.query("search") || "").toLowerCase().trim();
    const tabFilter = c.req.query("tab") || "all"; // "active" | "closed" | "all"

    console.log(`Admin orders: page=${page} limit=${limit} status=${statusFilter} payment=${paymentFilter} delivery=${deliveryFilter} date=${dateFilter} tab=${tabFilter} search="${searchQuery}"`);

    // Get all orders from KV (exclude drafts) — with retry for transient errors
    const allOrders = await kvRetry(() => kv.getByPrefix("order:"));
    const visibleOrders = allOrders.filter((entry: any) => {
      const order = entry.value || entry;
      return order.paymentStatus !== "awaiting_payment";
    });

    // Sort by createdAt desc
    visibleOrders.sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Compute stats from ALL visible orders (before filtering)
    const today = new Date();
    const todayStr = today.toDateString();
    let unpaidCount = 0, unpaidTotal = 0;
    let partialCount = 0, partialTotal = 0;
    let paidCount = 0, paidTotal = 0;
    let todayCount = 0, todayRevenue = 0;
    let activeCount = 0;
    let closedCount = 0, cancelledCount = 0;
    let scheduledCount = 0;

    for (const order of visibleOrders) {
      const eps = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
      if (eps === 'unpaid' && order.status !== 'cancelled') {
        unpaidCount++;
        unpaidTotal += order.total || 0;
      } else if (eps === 'partial' && order.status !== 'cancelled') {
        partialCount++;
        partialTotal += (order.total || 0) - (order.paidAmount || 0);
      } else if (eps === 'paid') {
        paidCount++;
        paidTotal += order.total || 0;
      }
      if (new Date(order.createdAt).toDateString() === todayStr) {
        todayCount++;
        todayRevenue += order.total || 0;
      }
      if (!["delivered", "closed", "cancelled"].includes(order.status)) {
        activeCount++;
      }
      if (order.status === "closed") closedCount++;
      if (order.status === "cancelled") cancelledCount++;
      if (order.status === "scheduled") scheduledCount++;
    }

    // Preload user map for customer name search and enrichment
    let userMap: Record<string, any> = {};
    try {
      const allUsers = await kv.getByPrefix("user:");
      for (const u of allUsers) {
        if (u.id) userMap[u.id] = u;
      }
    } catch (e) {
      console.log(`Warning: could not load users: ${e}`);
    }

    // Apply filters
    const filtered = visibleOrders.filter((order: any) => {
      // Tab filter (top-level split between active vs closed/cancelled)
      if (tabFilter === "active") {
        if (["closed", "cancelled"].includes(order.status)) return false;
      } else if (tabFilter === "closed") {
        if (!["closed", "cancelled"].includes(order.status)) return false;
      }
      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "active_group") {
          if (["delivered", "closed", "cancelled"].includes(order.status)) return false;
        } else {
          if (order.status !== statusFilter) return false;
        }
      }
      // Payment filter
      if (paymentFilter !== "all") {
        const eps = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
        if (paymentFilter === "paid" && eps !== 'paid') return false;
        if (paymentFilter === "partial" && eps !== 'partial') return false;
        if (paymentFilter === "unpaid" && (eps !== 'unpaid' || order.status === 'cancelled')) return false;
      }
      // Delivery filter
      if (deliveryFilter !== "all") {
        if (order.deliveryMethod !== deliveryFilter) return false;
      }
      // Date filter
      if (dateFilter === "today") {
        if (new Date(order.createdAt).toDateString() !== todayStr) return false;
      }
      // Search
      if (searchQuery) {
        const shortId = getShortOrderIdServer(order.orderNumber || order.id).toLowerCase();
        const orderNum = (order.orderNumber || "").toLowerCase();
        const itemTitle = (order.itemTitle || "").toLowerCase();
        const phone = order.phone || "";
        const orderId = (order.id || "").toLowerCase();
        const itemsMatch = order.items?.some((item: any) =>
          item.title?.toLowerCase().includes(searchQuery)
        );
        const customerName = userMap[order.userId]?.name?.toLowerCase() || "";
        if (
          !shortId.includes(searchQuery) &&
          !orderNum.includes(searchQuery) &&
          !itemTitle.includes(searchQuery) &&
          !phone.includes(searchQuery) &&
          !orderId.includes(searchQuery) &&
          !itemsMatch &&
          !customerName.includes(searchQuery)
        ) {
          return false;
        }
      }
      return true;
    });

    // Paginate
    const totalFiltered = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * limit;
    const pageOrders = filtered.slice(startIdx, startIdx + limit);

    // Enrich orders with customer name from user map
    const enrichedOrders = pageOrders.map((order: any) => ({
      ...order,
      customerName: order.customerName || userMap[order.userId]?.name || "",
    }));

    return c.json({
      orders: enrichedOrders,
      page: safePage,
      limit,
      totalFiltered,
      totalPages,
      stats: {
        totalOrders: visibleOrders.length,
        unpaidCount,
        unpaidTotal,
        partialCount,
        partialTotal,
        paidCount,
        paidTotal,
        todayCount,
        todayRevenue,
        activeCount,
        closedCount,
        cancelledCount,
        scheduledCount,
      },
    });
  } catch (error) {
    console.log(`Admin get orders error: ${error}`);
    return c.json({ error: "Failed to get orders" }, 500);
  }
});

// Admin: Lightweight order count for polling
app.get("/make-server-e5e192fb/admin/orders/count", async (c) => {
  try {
    // Auto-activate any scheduled orders whose time has arrived
    await activateScheduledOrders();

    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ code: 401, message: "Invalid JWT" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    const allOrders = await kvRetry(() => kv.getByPrefix("order:"));
    const visibleOrders = allOrders.filter((entry: any) => {
      const order = entry.value || entry;
      return order.paymentStatus !== "awaiting_payment";
    });
    const count = visibleOrders.length;
    const scheduledCount = visibleOrders.filter((entry: any) => {
      const order = entry.value || entry;
      return order.status === "scheduled";
    }).length;

    return c.json({ count, scheduledCount });
  } catch (error) {
    console.log(`Admin order count error: ${error}`);
    return c.json({ error: "Failed to get order count" }, 500);
  }
});

// Admin: Get All Categories
app.get("/make-server-e5e192fb/admin/categories", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check for admin token or regular admin user
    if (accessToken !== "admin-token") {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const userData = await kv.get(`user:${user.id}`);
      if (!userData?.isAdmin) {
        return c.json({ error: "Admin access required" }, 403);
      }
    }

    const categories = await kv.getByPrefix("category:");
    return c.json({ categories });
  } catch (error) {
    console.log(`Admin get categories error: ${error}`);
    return c.json({ error: "Failed to get categories" }, 500);
  }
});

// Admin: Add Category
app.post("/make-server-e5e192fb/admin/categories", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check for admin token or regular admin user
    if (accessToken !== "admin-token") {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const userData = await kv.get(`user:${user.id}`);
      if (!userData?.isAdmin) {
        return c.json({ error: "Admin access required" }, 403);
      }
    }

    const { name } = await c.req.json();
    if (!name) {
      return c.json({ error: "Category name is required" }, 400);
    }

    const categoryId = crypto.randomUUID();
    const category = { id: categoryId, name };
    await kv.set(`category:${categoryId}`, category);

    return c.json({ success: true, category });
  } catch (error) {
    console.log(`Admin add category error: ${error}`);
    return c.json({ error: "Failed to add category" }, 500);
  }
});

// Admin: Delete Category
app.delete("/make-server-e5e192fb/admin/categories/:id", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check for admin token or regular admin user
    if (accessToken !== "admin-token") {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const userData = await kv.get(`user:${user.id}`);
      if (!userData?.isAdmin) {
        return c.json({ error: "Admin access required" }, 403);
      }
    }

    const categoryId = c.req.param('id');
    await kv.del(`category:${categoryId}`);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Admin delete category error: ${error}`);
    return c.json({ error: "Failed to delete category" }, 500);
  }
});

// Admin: Get All Special Offers
app.get("/make-server-e5e192fb/admin/special-offers", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check for admin token or regular admin user
    if (accessToken !== "admin-token") {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const userData = await kv.get(`user:${user.id}`);
      if (!userData?.isAdmin) {
        return c.json({ error: "Admin access required" }, 403);
      }
    }

    const offers = await kv.getByPrefix("special_offer:");
    return c.json({ offers });
  } catch (error) {
    console.log(`Admin get special offers error: ${error}`);
    return c.json({ error: "Failed to get special offers" }, 500);
  }
});

// Admin: Add Special Offer
app.post("/make-server-e5e192fb/admin/special-offers", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check for admin token or regular admin user
    if (accessToken !== "admin-token") {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const userData = await kv.get(`user:${user.id}`);
      if (!userData?.isAdmin) {
        return c.json({ error: "Admin access required" }, 403);
      }
    }

    const { title, description, originalPrice, discountedPrice, image } = await c.req.json();
    if (!title || !originalPrice || !discountedPrice) {
      return c.json({ error: "Title, original price, and discounted price are required" }, 400);
    }

    // Get the next available offer ID
    const existingOffers = await kv.getByPrefix("special_offer:");
    const maxId = existingOffers.length > 0 
      ? Math.max(...existingOffers.map(o => o.id)) 
      : 0;
    const newId = maxId + 1;

    const offer = {
      id: newId,
      title,
      description: description || "",
      originalPrice: parseFloat(originalPrice),
      discountedPrice: parseFloat(discountedPrice),
      image: image || "",
    };

    await kv.set(`special_offer:${newId}`, offer);

    return c.json({ success: true, offer });
  } catch (error) {
    console.log(`Admin add special offer error: ${error}`);
    return c.json({ error: "Failed to add special offer" }, 500);
  }
});

// Admin: Update Special Offer
app.put("/make-server-e5e192fb/admin/special-offers/:id", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check for admin token or regular admin user
    if (accessToken !== "admin-token") {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const userData = await kv.get(`user:${user.id}`);
      if (!userData?.isAdmin) {
        return c.json({ error: "Admin access required" }, 403);
      }
    }

    const offerId = parseInt(c.req.param('id'));
    const { title, description, originalPrice, discountedPrice, image } = await c.req.json();

    if (!title || !originalPrice || !discountedPrice) {
      return c.json({ error: "Title, original price, and discounted price are required" }, 400);
    }

    const offer = {
      id: offerId,
      title,
      description: description || "",
      originalPrice: parseFloat(originalPrice),
      discountedPrice: parseFloat(discountedPrice),
      image: image || "",
    };

    await kv.set(`special_offer:${offerId}`, offer);

    return c.json({ success: true, offer });
  } catch (error) {
    console.log(`Admin update special offer error: ${error}`);
    return c.json({ error: "Failed to update special offer" }, 500);
  }
});

// Admin: Delete Special Offer
app.delete("/make-server-e5e192fb/admin/special-offers/:id", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check for admin token or regular admin user
    if (accessToken !== "admin-token") {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const userData = await kv.get(`user:${user.id}`);
      if (!userData?.isAdmin) {
        return c.json({ error: "Admin access required" }, 403);
      }
    }

    const offerId = c.req.param('id');
    await kv.del(`special_offer:${offerId}`);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Admin delete special offer error: ${error}`);
    return c.json({ error: "Failed to delete special offer" }, 500);
  }
});

// ==================== TODAY'S SPECIAL ROUTES ====================

// Public: Get All Active Today's Special Items
app.get("/make-server-e5e192fb/todays-special", async (c) => {
  try {
    const items = await kv.getByPrefix("todays_special:");
    
    // Filter only enabled items and sort by displayOrder
    const activeItems = items
      .filter((item: any) => item.enabled !== false)
      .sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    
    return c.json({ items: activeItems });
  } catch (error) {
    console.log(`Get today's special error: ${error}`);
    return c.json({ error: "Failed to get today's special items" }, 500);
  }
});

// Admin: Seed Today's Special with Default Items (one-time initialization)
app.post("/make-server-e5e192fb/admin/todays-special/seed", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Check if items already exist
    const existingItems = await kv.getByPrefix("todays_special:");
    if (existingItems.length > 0) {
      return c.json({ error: "Items already seeded. Delete existing items first if you want to re-seed." }, 400);
    }

    // Default menu items to seed
    const defaultItems = [
      {
        id: 1,
        name: "Chicken Tikka Masala",
        subtitle: "Tender chicken in creamy tomato sauce",
        description: "Marinated chicken pieces cooked in a rich, creamy tomato-based curry sauce with aromatic spices. Served with fragrant basmati rice.",
        image: "https://images.unsplash.com/photo-1652545296821-09a023a9fd08?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0aWtrYSUyMG1hc2FsYSUyMGluZGlhbiUyMGZvb2R8ZW58MXx8fHwxNzcyMTA0ODgwfDA&ixlib=rb-4.1.0&q=80&w=1080",
        originalPrice: 285000,
        discountPercentage: 26,
        finalPrice: 210000,
        badgeText: "SPECIAL 26% OFF",
        enabled: true,
        displayOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 2,
        name: "Butter Chicken with Rice",
        subtitle: "Classic creamy curry with basmati rice",
        description: "Succulent chicken pieces simmered in a velvety butter and tomato gravy, perfectly spiced and served with steamed basmati rice.",
        image: "https://images.unsplash.com/photo-1707448829764-9474458021ed?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXR0ZXIlMjBjaGlja2VuJTIwY3VycnklMjByaWNlfGVufDF8fHx8MTc3MjEwNDg4MHww&ixlib=rb-4.1.0&q=80&w=1080",
        originalPrice: 255000,
        discountPercentage: 29,
        finalPrice: 180000,
        badgeText: "SPECIAL 29% OFF",
        enabled: true,
        displayOrder: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 3,
        name: "Samosa Platter",
        subtitle: "Crispy vegetable samosas with chutneys",
        description: "Golden fried pastry pockets filled with spiced potatoes and peas. Served with tangy tamarind and mint chutneys. Perfect as an appetizer!",
        image: "https://images.unsplash.com/photo-1697155836252-d7f969108b5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzYW1vc2ElMjBpbmRpYW4lMjBhcHBldGl6ZXJ8ZW58MXx8fHwxNzcyMDYxMTIyfDA&ixlib=rb-4.1.0&q=80&w=1080",
        originalPrice: 135000,
        discountPercentage: 33,
        finalPrice: 90000,
        badgeText: "SPECIAL 33% OFF",
        enabled: true,
        displayOrder: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Save all items
    for (const item of defaultItems) {
      await kv.set(`todays_special:${item.id}`, item);
    }

    return c.json({ success: true, message: "Seeded 3 menu items successfully", items: defaultItems });
  } catch (error) {
    console.log(`Seed today's special error: ${error}`);
    return c.json({ error: "Failed to seed items" }, 500);
  }
});

// Admin: Get All Today's Special Items (including disabled)
app.get("/make-server-e5e192fb/admin/todays-special", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const items = await kv.getByPrefix("todays_special:");
    
    // Sort by displayOrder
    const sortedItems = items.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    
    return c.json({ items: sortedItems });
  } catch (error) {
    console.log(`Admin get today's special error: ${error}`);
    return c.json({ error: "Failed to get today's special items" }, 500);
  }
});

// Admin: Create Today's Special Item
app.post("/make-server-e5e192fb/admin/todays-special", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    const { name, subtitle, description, image, video, originalPrice, discountPercentage, badgeText, enabled, displayOrder } = body;

    if (!name || !originalPrice) {
      return c.json({ error: "Name and original price are required" }, 400);
    }

    // Calculate discounted price
    const finalPrice = discountPercentage 
      ? originalPrice - (originalPrice * (discountPercentage / 100))
      : originalPrice;

    // Generate new ID
    const existingItems = await kv.getByPrefix("todays_special:");
    const newId = existingItems.length > 0 
      ? Math.max(...existingItems.map((item: any) => item.id || 0)) + 1 
      : 1;

    const item = {
      id: newId,
      name,
      subtitle: subtitle || "",
      description: description || "",
      image: image || "",
      video: video || "",
      originalPrice,
      discountPercentage: discountPercentage || 0,
      finalPrice,
      badgeText: badgeText || `SPECIAL ${discountPercentage}% OFF`,
      enabled: enabled !== false,
      displayOrder: displayOrder || newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`todays_special:${newId}`, item);

    return c.json({ success: true, item });
  } catch (error) {
    console.log(`Admin create today's special error: ${error}`);
    return c.json({ error: "Failed to create today's special item" }, 500);
  }
});

// Admin: Update Today's Special Item
app.put("/make-server-e5e192fb/admin/todays-special/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const itemId = c.req.param('id');
    const body = await c.req.json();
    const { name, subtitle, description, image, video, originalPrice, discountPercentage, badgeText, enabled, displayOrder } = body;

    const existingItem = await kv.get(`todays_special:${itemId}`);
    if (!existingItem) {
      return c.json({ error: "Item not found" }, 404);
    }

    // Use provided values or fall back to existing values
    const updatedOriginalPrice = originalPrice !== undefined ? originalPrice : existingItem.originalPrice;
    const updatedDiscountPercentage = discountPercentage !== undefined ? discountPercentage : existingItem.discountPercentage;

    // Calculate discounted price using the final values
    const finalPrice = updatedDiscountPercentage 
      ? updatedOriginalPrice - (updatedOriginalPrice * (updatedDiscountPercentage / 100))
      : updatedOriginalPrice;

    const item = {
      ...existingItem,
      name: name || existingItem.name,
      subtitle: subtitle !== undefined ? subtitle : existingItem.subtitle,
      description: description !== undefined ? description : existingItem.description,
      image: image !== undefined ? image : existingItem.image,
      video: video !== undefined ? video : (existingItem.video || ""),
      originalPrice: updatedOriginalPrice,
      discountPercentage: updatedDiscountPercentage,
      finalPrice,
      badgeText: badgeText !== undefined ? badgeText : existingItem.badgeText,
      enabled: enabled !== undefined ? enabled : existingItem.enabled,
      displayOrder: displayOrder !== undefined ? displayOrder : existingItem.displayOrder,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`todays_special:${itemId}`, item);

    return c.json({ success: true, item });
  } catch (error) {
    console.log(`Admin update today's special error: ${error}`);
    return c.json({ error: "Failed to update today's special item" }, 500);
  }
});

// Admin: Delete Today's Special Item
app.delete("/make-server-e5e192fb/admin/todays-special/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const itemId = c.req.param('id');
    await kv.del(`todays_special:${itemId}`);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Admin delete today's special error: ${error}`);
    return c.json({ error: "Failed to delete today's special item" }, 500);
  }
});

// ==================== END TODAY'S SPECIAL ROUTES ====================

// ==================== KIDS MENU ROUTES ====================

// Public: Get All Active Kids Menu Items
app.get("/make-server-e5e192fb/kids-menu", async (c) => {
  try {
    const items = await kv.getByPrefix("kids_menu:");
    
    // Filter only enabled items and sort by displayOrder
    const activeItems = items
      .filter((item: any) => item.enabled !== false)
      .sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    
    return c.json({ items: activeItems });
  } catch (error) {
    console.log(`Get kids menu error: ${error}`);
    return c.json({ error: "Failed to get kids menu items" }, 500);
  }
});

// Admin: Get All Kids Menu Items (including disabled)
app.get("/make-server-e5e192fb/admin/kids-menu", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const items = await kv.getByPrefix("kids_menu:");
    
    // Sort by displayOrder
    const sortedItems = items.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    
    return c.json({ items: sortedItems });
  } catch (error) {
    console.log(`Admin get kids menu error: ${error}`);
    return c.json({ error: "Failed to get kids menu items" }, 500);
  }
});

// Admin: Create Kids Menu Item
app.post("/make-server-e5e192fb/admin/kids-menu", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    const { name, subtitle, description, image, originalPrice, discountPercentage, badgeText, enabled, displayOrder } = body;

    if (!name || !description || !image || originalPrice === undefined || discountPercentage === undefined) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Generate new ID
    const existingItems = await kv.getByPrefix("kids_menu:");
    const newId = existingItems.length > 0 
      ? Math.max(...existingItems.map((item: any) => item.id)) + 1 
      : 1;

    const finalPrice = originalPrice * (1 - discountPercentage / 100);

    const item = {
      id: newId,
      name,
      subtitle: subtitle || "",
      description,
      image,
      originalPrice,
      discountPercentage,
      finalPrice,
      badgeText: badgeText || "",
      enabled: enabled !== false,
      displayOrder: displayOrder || newId,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`kids_menu:${newId}`, item);

    return c.json({ success: true, item });
  } catch (error) {
    console.log(`Admin create kids menu error: ${error}`);
    return c.json({ error: "Failed to create kids menu item" }, 500);
  }
});

// Admin: Update Kids Menu Item
app.put("/make-server-e5e192fb/admin/kids-menu/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const itemId = c.req.param('id');
    const body = await c.req.json();
    const { name, subtitle, description, image, originalPrice, discountPercentage, badgeText, enabled, displayOrder } = body;

    const existingItem = await kv.get(`kids_menu:${itemId}`);
    if (!existingItem) {
      return c.json({ error: "Item not found" }, 404);
    }

    const finalPrice = originalPrice * (1 - discountPercentage / 100);

    const item = {
      ...existingItem,
      name,
      subtitle: subtitle || "",
      description,
      image,
      originalPrice,
      discountPercentage,
      finalPrice,
      badgeText: badgeText || "",
      enabled: enabled !== false,
      displayOrder: displayOrder !== undefined ? displayOrder : existingItem.displayOrder,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`kids_menu:${itemId}`, item);

    return c.json({ success: true, item });
  } catch (error) {
    console.log(`Admin update kids menu error: ${error}`);
    return c.json({ error: "Failed to update kids menu item" }, 500);
  }
});

// Admin: Delete Kids Menu Item
app.delete("/make-server-e5e192fb/admin/kids-menu/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const itemId = c.req.param('id');
    await kv.del(`kids_menu:${itemId}`);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Admin delete kids menu error: ${error}`);
    return c.json({ error: "Failed to delete kids menu item" }, 500);
  }
});

// ==================== END KIDS MENU ROUTES ====================

// ==================== FLASH SALE ROUTES ====================

// Public: Get All Active Flash Sale Items
app.get("/make-server-e5e192fb/flash-sale", async (c) => {
  try {
    const items = await kv.getByPrefix("flash_sale:");
    
    // Filter only enabled items, non-expired, and sort by displayOrder
    const now = new Date().getTime();
    const activeItems = items
      .filter((item: any) => {
        // Check if item is enabled
        if (item.enabled === false) return false;
        
        // Check if item has expired (if endTime is set)
        if (item.endTime) {
          const endTime = new Date(item.endTime).getTime();
          if (endTime <= now) return false;
        }
        
        return true;
      })
      .sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    
    return c.json({ items: activeItems });
  } catch (error) {
    console.log(`Get flash sale error: ${error}`);
    return c.json({ error: "Failed to get flash sale items" }, 500);
  }
});

// Admin: Get All Flash Sale Items (including disabled)
app.get("/make-server-e5e192fb/admin/flash-sale", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const items = await kv.getByPrefix("flash_sale:");
    
    // Sort by displayOrder
    const sortedItems = items.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    
    return c.json({ items: sortedItems });
  } catch (error) {
    console.log(`Admin get flash sale error: ${error}`);
    return c.json({ error: "Failed to get flash sale items" }, 500);
  }
});

// Admin: Create Flash Sale Item
app.post("/make-server-e5e192fb/admin/flash-sale", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    const { name, subtitle, description, image, video, originalPrice, discountPercentage, badgeText, enabled, displayOrder, endTime } = body;

    if (!name || !description || !image || originalPrice === undefined || discountPercentage === undefined) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Generate new ID
    const existingItems = await kv.getByPrefix("flash_sale:");
    const newId = existingItems.length > 0 
      ? Math.max(...existingItems.map((item: any) => item.id)) + 1 
      : 1;

    const finalPrice = originalPrice * (1 - discountPercentage / 100);

    const item = {
      id: newId,
      name,
      subtitle: subtitle || "",
      description,
      image,
      video: video || "",
      originalPrice,
      discountPercentage,
      finalPrice,
      badgeText: badgeText || "",
      enabled: enabled !== false,
      displayOrder: displayOrder || newId,
      endTime: endTime || null,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`flash_sale:${newId}`, item);

    return c.json({ success: true, item });
  } catch (error) {
    console.log(`Admin create flash sale error: ${error}`);
    return c.json({ error: "Failed to create flash sale item" }, 500);
  }
});

// Admin: Update Flash Sale Item
app.put("/make-server-e5e192fb/admin/flash-sale/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const itemId = c.req.param('id');
    const body = await c.req.json();
    const { name, subtitle, description, image, video, originalPrice, discountPercentage, badgeText, enabled, displayOrder, endTime } = body;

    const existingItem = await kv.get(`flash_sale:${itemId}`);
    if (!existingItem) {
      return c.json({ error: "Item not found" }, 404);
    }

    const finalPrice = originalPrice * (1 - discountPercentage / 100);

    const item = {
      ...existingItem,
      name,
      subtitle: subtitle || "",
      description,
      image,
      video: video !== undefined ? video : (existingItem.video || ""),
      originalPrice,
      discountPercentage,
      finalPrice,
      badgeText: badgeText || "",
      enabled: enabled !== false,
      displayOrder: displayOrder !== undefined ? displayOrder : existingItem.displayOrder,
      endTime: endTime !== undefined ? endTime : existingItem.endTime,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`flash_sale:${itemId}`, item);

    return c.json({ success: true, item });
  } catch (error) {
    console.log(`Admin update flash sale error: ${error}`);
    return c.json({ error: "Failed to update flash sale item" }, 500);
  }
});

// Admin: Delete Flash Sale Item
app.delete("/make-server-e5e192fb/admin/flash-sale/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const itemId = c.req.param('id');
    await kv.del(`flash_sale:${itemId}`);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Admin delete flash sale error: ${error}`);
    return c.json({ error: "Failed to delete flash sale item" }, 500);
  }
});

// ==================== END FLASH SALE ROUTES ====================

// ==================== REGULAR MENU ROUTES ====================

// Public: Get All Active Regular Menu Items
app.get("/make-server-e5e192fb/regular-menu", async (c) => {
  try {
    const items = await kv.getByPrefix("regular_menu:");
    
    // Filter only available items and sort by category then name
    const activeItems = items
      .filter((item: any) => item.isAvailable !== false)
      .sort((a: any, b: any) => {
        // Sort by category first, then by name
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.name.localeCompare(b.name);
      });
    
    return c.json({ items: activeItems });
  } catch (error) {
    console.log(`Get regular menu error: ${error}`);
    return c.json({ error: "Failed to get regular menu items" }, 500);
  }
});

// Public: Get Regular Menu Categories
app.get("/make-server-e5e192fb/regular-menu/categories", async (c) => {
  try {
    const items = await kv.getByPrefix("regular_menu:");
    
    // Extract unique categories from available items
    const categories = [...new Set(items
      .filter((item: any) => item.isAvailable !== false)
      .map((item: any) => item.category)
    )].sort();
    
    return c.json({ categories });
  } catch (error) {
    console.log(`Get regular menu categories error: ${error}`);
    return c.json({ error: "Failed to get categories" }, 500);
  }
});

// Admin: Get All Regular Menu Items (including unavailable)
app.get("/make-server-e5e192fb/admin/regular-menu", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const items = await kv.getByPrefix("regular_menu:");
    
    // Sort by category then name
    const sortedItems = items.sort((a: any, b: any) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
    
    return c.json({ items: sortedItems });
  } catch (error) {
    console.log(`Admin get regular menu error: ${error}`);
    return c.json({ error: "Failed to get regular menu items" }, 500);
  }
});

// Admin: Seed Regular Menu Items from JSON
app.post("/make-server-e5e192fb/admin/regular-menu/seed", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Check if items already exist
    const existingItems = await kv.getByPrefix("regular_menu:");
    if (existingItems.length > 0) {
      return c.json({ error: "Menu items already seeded. Delete existing items first if you want to re-seed." }, 400);
    }

    // Menu items from the provided JSON
    const menuItems = [
      { category: "Soup", name: "Chicken Manchow Soup", price: 49000 },
      { category: "Soup", name: "Sweet Corn Soup Chicken", price: 49000 },
      { category: "Soup", name: "Chicken Hot And Sour Soup", price: 49000 },
      { category: "Soup", name: "Hot And Sour Soup Veg", price: 45000 },
      { category: "Soup", name: "Veg Manchow Soup", price: 39000 },
      { category: "Soup", name: "Tomato Soup", price: 39000 },
      { category: "Soup", name: "Sweet Corn Soup Veg", price: 39000 },
      { category: "Appetizer Veg", name: "Onion/Mix Veg Pakora", price: 63000 },
      { category: "Appetizer Veg", name: "French Fries", price: 45000 },
      { category: "Appetizer Veg", name: "Veg Samosa (4pcs Medium)", price: 52000 },
      { category: "Appetizer Veg", name: "Corn Salt & Paper", price: 60000 },
      { category: "Appetizer Veg", name: "Mushroom Duplex", price: 85000 },
      { category: "Appetizer Veg", name: "Veg Momos", price: 55000 },
      { category: "Appetizer Veg", name: "Veg Seekh Kabab", price: 69000 },
      { category: "Appetizer Veg", name: "Veg Manchurian Dry", price: 72000 },
      { category: "Appetizer Veg", name: "Harabhara Kabab", price: 59000 },
      { category: "Appetizer Veg", name: "Panipori", price: 59000 },
      { category: "Appetizer Veg", name: "Tandoori Gobhi", price: 65000 },
      { category: "Appetizer Veg", name: "Chilli Mushroom Dry/Gravy", price: 79000 },
      { category: "Appetizer Veg", name: "Paneer Ajwain Tikka", price: 85000 },
      { category: "Appetizer Veg", name: "Paneer Kurkure", price: 85000 },
      { category: "Appetizer Veg", name: "Paneer Pudina Tikka", price: 85000 },
      { category: "Appetizer Veg", name: "Papri Chat", price: 57000 },
      { category: "Appetizer Veg", name: "Aloo Tikki Chat", price: 65000 },
      { category: "Appetizer Veg", name: "Paneer 65", price: 65000 },
      { category: "Appetizer Veg", name: "Tandoori Mushroom", price: 84000 },
      { category: "Appetizer Veg", name: "Paneer Pakora", price: 83000 },
      { category: "Appetizer Veg", name: "Paneer Malai Tikka", price: 89000 },
      { category: "Appetizer Veg", name: "Chana Chat", price: 68000 },
      { category: "Appetizer Veg", name: "Paneer Tikka", price: 89000 },
      { category: "Appetizer Veg", name: "Tandoori Veg Momos", price: 72000 },
      { category: "Appetizer Veg", name: "Chilli Paneer", price: 86000 },
      { category: "Appetizer Veg", name: "Paneer Achari Tikka", price: 89000 },
      { category: "Appetizer Veg", name: "Peanut Masala", price: 49000 },
      { category: "Appetizer Veg", name: "Tandoori Veg Platter", price: 175000 },
      { category: "Appetizer Veg", name: "Paneer Chatpati", price: 86000 },
      { category: "Appetizer Veg", name: "Plain Papad", price: 36000 },
      { category: "Appetizer Veg", name: "Masala Papad", price: 45000 },
      { category: "Appetizer Non-Veg", name: "Chicken Garlic Tikka", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Chicken Malai Tikka", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Chicken Kalimirch Tikka", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Chicken Tangdi Kabab", price: 105000 },
      { category: "Appetizer Non-Veg", name: "Chicken Methi Kabab", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Chicken Seekh Kabab", price: 95000 },
      { category: "Appetizer Non-Veg", name: "Chicken Kalmi Kabab", price: 105000 },
      { category: "Appetizer Non-Veg", name: "Chicken Gilafi Kabab", price: 105000 },
      { category: "Appetizer Non-Veg", name: "Chicken Pudina Tikka", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Chicken 65", price: 85000 },
      { category: "Appetizer Non-Veg", name: "Chicken Lollipop", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Chicken Pakora", price: 79000 },
      { category: "Appetizer Non-Veg", name: "Chicken Manchurian Dry", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Chicken Bhuna", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Chilli Chicken", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Fish Amritsari", price: 89000 },
      { category: "Appetizer Non-Veg", name: "Tandoori Pomfret Fish", price: 175000 },
      { category: "Appetizer Non-Veg", name: "Tandoori Prawn", price: 149000 },
      { category: "Appetizer Non-Veg", name: "Chicken Momos", price: 69000 },
      { category: "Appetizer Non-Veg", name: "Afghani Chicken Half", price: 105000 },
      { category: "Appetizer Non-Veg", name: "Afghani Chicken Full", price: 179000 },
      { category: "Appetizer Non-Veg", name: "Tandoori Chicken Half", price: 105000 },
      { category: "Appetizer Non-Veg", name: "Tandoori Chicken Full", price: 179000 },
      { category: "Appetizer Non-Veg", name: "Tandoori Non-Veg Platter", price: 215000 },
      { category: "Appetizer Non-Veg", name: "Mutton Varuval", price: 139000 },
      { category: "Appetizer Non-Veg", name: "Mutton Seekh Kabab", price: 149000 },
      { category: "Appetizer Non-Veg", name: "Dragon Chicken", price: 105000 },
      { category: "Appetizer Non-Veg", name: "Garlic Prawn", price: 145000 },
      { category: "Appetizer Non-Veg", name: "Egg Bhurji", price: 69000 },
      { category: "Appetizer Non-Veg", name: "Egg Boils (4 Pcs)", price: 69000 },
      { category: "Appetizer Non-Veg", name: "Egg Pakoda", price: 65000 },
      { category: "Set Thali", name: "Veg Set Thali", price: 98000 },
      { category: "Set Thali", name: "Veg Set Thali Special", price: 119000 },
      { category: "Set Thali", name: "Chicken Set Thali", price: 115000 },
      { category: "Set Thali", name: "Mutton Set Thali", price: 149000 },
    ];

    // Store each item with unique ID and image
    for (let i = 0; i < menuItems.length; i++) {
      const menuItem = menuItems[i];
      const item = {
        id: `menu_${Date.now()}_${i}`,
        ...menuItem,
        image: getImageForDish(menuItem.name, menuItem.category),
        isAvailable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`regular_menu:${item.id}`, item);
    }

    return c.json({ success: true, message: `Seeded ${menuItems.length} menu items with images` });
  } catch (error) {
    console.log(`Admin seed regular menu error: ${error}`);
    return c.json({ error: "Failed to seed regular menu items" }, 500);
  }
});

// Admin: Update All Regular Menu Items with Images
app.post("/make-server-e5e192fb/admin/regular-menu/update-images", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Get all existing menu items
    const allItems = await kv.getByPrefix("regular_menu:");
    
    if (allItems.length === 0) {
      return c.json({ error: "No menu items found to update" }, 400);
    }

    let updatedCount = 0;
    
    // Update each item with appropriate image
    for (const item of allItems) {
      if (item && item.name && item.category) {
        // Only update if no custom image exists, or force update
        const newImage = getImageForDish(item.name, item.category);
        const updatedItem = {
          ...item,
          image: newImage,
          updatedAt: new Date().toISOString(),
        };
        await kv.set(`regular_menu:${item.id}`, updatedItem);
        updatedCount++;
      }
    }

    return c.json({ 
      success: true, 
      message: `Updated ${updatedCount} menu items with images`,
      updatedCount 
    });
  } catch (error) {
    console.log(`Admin update menu images error: ${error}`);
    return c.json({ error: "Failed to update menu images" }, 500);
  }
});

// Admin: Add Regular Menu Item
app.post("/make-server-e5e192fb/admin/regular-menu", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    const { category, name, price, image, isBestSeller, isChefSpecial } = body;

    if (!category || !name || !price) {
      return c.json({ error: "Category, name, and price are required" }, 400);
    }

    const newId = `menu_${Date.now()}`;
    const item = {
      id: newId,
      category,
      name,
      price: parseFloat(price),
      image: image || undefined,
      isAvailable: true,
      isBestSeller: isBestSeller || false,
      isChefSpecial: isChefSpecial || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`regular_menu:${newId}`, item);

    return c.json({ success: true, item });
  } catch (error) {
    console.log(`Admin create regular menu item error: ${error}`);
    return c.json({ error: "Failed to create menu item" }, 500);
  }
});

// Admin: Update Regular Menu Item
app.put("/make-server-e5e192fb/admin/regular-menu/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const itemId = c.req.param('id');
    const body = await c.req.json();
    const { category, name, price, image, isAvailable, isBestSeller, isChefSpecial } = body;

    const existingItem = await kv.get(`regular_menu:${itemId}`);
    if (!existingItem) {
      return c.json({ error: "Item not found" }, 404);
    }

    const updatedItem = {
      ...existingItem,
      category: category !== undefined ? category : existingItem.category,
      name: name !== undefined ? name : existingItem.name,
      price: price !== undefined ? parseFloat(price) : existingItem.price,
      image: image !== undefined ? image : existingItem.image,
      isAvailable: isAvailable !== undefined ? isAvailable : existingItem.isAvailable,
      isBestSeller: isBestSeller !== undefined ? isBestSeller : existingItem.isBestSeller || false,
      isChefSpecial: isChefSpecial !== undefined ? isChefSpecial : existingItem.isChefSpecial || false,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`regular_menu:${itemId}`, updatedItem);

    return c.json({ success: true, item: updatedItem });
  } catch (error) {
    console.log(`Admin update regular menu item error: ${error}`);
    return c.json({ error: "Failed to update menu item" }, 500);
  }
});

// Admin: Delete Regular Menu Item
app.delete("/make-server-e5e192fb/admin/regular-menu/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const itemId = c.req.param('id');
    
    const existingItem = await kv.get(`regular_menu:${itemId}`);
    if (!existingItem) {
      return c.json({ error: "Item not found" }, 404);
    }

    await kv.del(`regular_menu:${itemId}`);

    return c.json({ success: true, message: "Menu item deleted" });
  } catch (error) {
    console.log(`Admin delete regular menu item error: ${error}`);
    return c.json({ error: "Failed to delete menu item" }, 500);
  }
});

// ==================== END REGULAR MENU ROUTES ====================

// ==================== USER FAVORITES ROUTES ====================

// Get user favorites + frequently ordered items
app.get("/make-server-e5e192fb/user-favorites", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ error: "User ID required" }, 400);

    // Get manually favorited item IDs
    const favKey = `user_favorites:${userId}`;
    const favoriteIds: string[] = (await kv.get(favKey)) || [];

    // Get user's order history to compute frequency
    const userOrdersKey = `user_orders:${userId}`;
    const orderIds: string[] = (await kv.get(userOrdersKey)) || [];

    const itemFrequency: Record<string, number> = {};
    if (orderIds.length > 0) {
      // Deduplicate order IDs in case of race conditions during concurrent appends
      const uniqueOrderIds = [...new Set(orderIds)];
      const orders = await Promise.all(
        uniqueOrderIds.map((id: string) => kv.get(`order:${id}`))
      );
      for (const order of orders) {
        if (!order || !order.items) continue;
        // Count all non-cancelled orders (pending, confirmed, cooking, ready, delivered, closed, completed)
        // Skip only cancelled orders and unpaid draft orders still awaiting payment
        if (order.status === "cancelled") continue;
        if (order.paymentStatus === "awaiting_payment" && order.status === "pending") continue;
        for (const item of order.items) {
          // Match by id first, then fallback to title (cart items use 'title'), then name
          const itemId = item.id || item.title || item.name;
          if (itemId) {
            itemFrequency[itemId] = (itemFrequency[itemId] || 0) + (item.quantity || 1);
          }
        }
      }
    }

    return c.json({ favorites: favoriteIds, itemFrequency });
  } catch (error) {
    console.log(`Get user favorites error: ${error}`);
    return c.json({ error: "Failed to get favorites" }, 500);
  }
});

// Toggle a favorite item
app.post("/make-server-e5e192fb/user-favorites/toggle", async (c) => {
  try {
    const { userId, itemId } = await c.req.json();
    if (!userId || !itemId) return c.json({ error: "userId and itemId required" }, 400);

    const favKey = `user_favorites:${userId}`;
    const favorites: string[] = (await kv.get(favKey)) || [];

    let isFavorited: boolean;
    if (favorites.includes(itemId)) {
      // Remove
      const updated = favorites.filter((id: string) => id !== itemId);
      await kv.set(favKey, updated);
      isFavorited = false;
    } else {
      // Add
      favorites.push(itemId);
      await kv.set(favKey, favorites);
      isFavorited = true;
    }

    return c.json({ success: true, isFavorited, favorites: isFavorited ? favorites : favorites });
  } catch (error) {
    console.log(`Toggle favorite error: ${error}`);
    return c.json({ error: "Failed to toggle favorite" }, 500);
  }
});

// ==================== END USER FAVORITES ROUTES ====================

// Get User Points Summary (requires auth)
app.get("/make-server-e5e192fb/points/summary", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      console.log(`❌ Points summary - No custom token provided`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Verify custom JWT
    const userAuth = await verifyUserAccess(customToken);
    if (!userAuth) {
      console.log(`❌ Points summary - Invalid JWT token`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`✅ Points summary - Fetching points for user: ${userAuth.userId}`);

    const userData = await kv.get(`user:${userAuth.userId}`);
    if (!userData) {
      console.log(`❌ Points summary - User not found: ${userAuth.userId}`);
      return c.json({ error: "User not found" }, 404);
    }

    const totalPoints = userData.points || 0;
    
    console.log(`✅ Points summary - User ${userAuth.userId} has ${totalPoints} points`);
    return c.json({ totalPoints, user: userData });
  } catch (error) {
    console.log(`❌ Points summary error: ${error}`);
    return c.json({ error: "Failed to get points summary" }, 500);
  }
});

// Admin: Adjust Customer Points
app.post("/make-server-e5e192fb/admin/users/:id/points", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check for admin token or regular admin user
    if (accessToken !== "admin-token") {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const userData = await kv.get(`user:${user.id}`);
      if (!userData?.isAdmin) {
        return c.json({ error: "Admin access required" }, 403);
      }
    }

    const userId = c.req.param('id');
    const { points, reason } = await c.req.json();

    if (points === undefined || !reason) {
      return c.json({ error: "Points amount and reason are required" }, 400);
    }

    const user = await kv.get(`user:${userId}`);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Update user points
    const oldPoints = user.points || 0;
    user.points = Math.max(0, oldPoints + points); // Ensure points don't go negative

    // Save updated user
    await kv.set(`user:${userId}`, user);

    // Log the transaction
    const transactionId = crypto.randomUUID();
    await kv.set(`points_transaction:${transactionId}`, {
      id: transactionId,
      userId: userId,
      pointsChange: points,
      oldBalance: oldPoints,
      newBalance: user.points,
      reason: reason,
      type: 'admin_adjustment',
      createdAt: new Date().toISOString(),
    });

    console.log(`✅ Admin adjusted points for user ${userId}: ${points} points (Reason: ${reason})`);

    return c.json({ success: true, user, transaction: { pointsChange: points, newBalance: user.points } });
  } catch (error) {
    console.log(`Admin adjust points error: ${error}`);
    return c.json({ error: "Failed to adjust points" }, 500);
  }
});

// Admin: Reset User PIN
app.post("/make-server-e5e192fb/admin/users/:id/reset-pin", async (c) => {
  try {
    console.log(`🔑 PIN reset request received`);
    
    const token = getCustomToken(c);
    if (!token) {
      console.log(`❌ No token provided`);
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    console.log(`🔑 Custom token found, verifying admin access...`);

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      console.log(`❌ Admin verification failed`);
      return c.json({ error: "Admin access required" }, 403);
    }

    console.log(`✅ Admin access verified for user ${adminAuth.userId}`);

    const userId = c.req.param('id');
    const { pin, password } = await c.req.json();
    const newPin = pin || password; // Accept both field names

    console.log(`🔑 Resetting PIN for user: ${userId}, PIN length: ${newPin?.length}`);

    if (!newPin || !isValidPin(newPin)) {
      console.log(`❌ PIN validation failed`);
      return c.json({ error: "PIN must be exactly 6 digits" }, 400);
    }

    console.log(`🔑 Fetching user from KV store...`);
    const user = await kv.get(`user:${userId}`);
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return c.json({ error: "User not found" }, 404);
    }

    console.log(`✅ User found: ${user.name}, updating PIN in Supabase Auth...`);

    // Update PIN in Supabase Auth system (stored as password internally)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPin }
    );

    if (updateError) {
      console.log(`❌ Failed to update PIN in Supabase: ${updateError.message}`);
      return c.json({ error: `Failed to update PIN: ${updateError.message}` }, 500);
    }

    console.log(`✅ PIN updated successfully in Supabase Auth`);

    // Update KV store
    await kv.set(`user:${userId}`, user);

    console.log(`✅ Admin reset PIN for user ${userId} (${user.name})`);

    return c.json({ success: true, message: "PIN reset successfully" });
  } catch (error) {
    console.log(`❌ Admin reset PIN error: ${error}`);
    console.log(`❌ Error message: ${error.message}`);
    console.log(`❌ Error stack: ${error.stack}`);
    return c.json({ error: `Failed to reset PIN: ${error.message}` }, 500);
  }
});

// Admin: Block/Unblock User
app.post("/make-server-e5e192fb/admin/users/:id/block", async (c) => {
  try {
    console.log(`🚫 Block/unblock user request received`);

    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const userId = c.req.param('id');
    const { blocked, reason } = await c.req.json();

    console.log(`🚫 ${blocked ? 'Blocking' : 'Unblocking'} user: ${userId}`);

    const user = await kv.get(`user:${userId}`);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (user.isAdmin) {
      return c.json({ error: "Cannot block an admin user" }, 400);
    }

    user.blocked = !!blocked;
    user.blockedAt = blocked ? new Date().toISOString() : null;
    user.blockedReason = blocked ? (reason || "Blocked by admin") : null;
    user.blockedBy = blocked ? adminAuth.userId : null;
    await kv.set(`user:${userId}`, user);

    // Also ban/unban in Supabase Auth to prevent login
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (blocked) {
      await supabase.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
      });
    } else {
      await supabase.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
      });
    }

    console.log(`✅ User ${userId} (${user.name}) ${blocked ? 'blocked' : 'unblocked'}`);
    return c.json({ success: true, message: `User ${blocked ? 'blocked' : 'unblocked'} successfully`, user });
  } catch (error) {
    console.log(`❌ Block/unblock user error: ${error}`);
    return c.json({ error: `Failed to update user: ${error.message}` }, 500);
  }
});

// Admin: Delete User
app.delete("/make-server-e5e192fb/admin/users/:id", async (c) => {
  try {
    console.log(`🗑️ Delete user request received`);

    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const userId = c.req.param('id');
    console.log(`🗑️ Deleting user: ${userId}`);

    const user = await kv.get(`user:${userId}`);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (user.isAdmin) {
      return c.json({ error: "Cannot delete an admin user" }, 400);
    }

    // Delete from Supabase Auth
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.log(`⚠️ Failed to delete user from Supabase Auth (may not exist): ${authError.message}`);
    }

    // Delete user from KV store
    await kv.del(`user:${userId}`);

    // Also remove phone lookup key if it exists
    if (user.phone) {
      const phoneEmail = `${user.phone.replace(/[^0-9]/g, '')}@phone.tikka.app`;
      await kv.del(`phone:${phoneEmail}`);
    }

    console.log(`✅ User ${userId} (${user.name}) deleted successfully`);
    return c.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.log(`❌ Delete user error: ${error}`);
    return c.json({ error: `Failed to delete user: ${error.message}` }, 500);
  }
});

// ==================== VOUCHERS ROUTES ====================

// Helper: Get user tier from points
function getUserTier(points: number): string {
  if (points >= 20000) return "Platinum";
  if (points >= 10000) return "Diamond";
  if (points >= 5000) return "Gold";
  return "Silver";
}

// Helper: Auto-assign eligible vouchers to a user
// Called on signup (for "all" + matching tier vouchers) and on tier promotion (for newly eligible tier vouchers)
async function autoAssignVouchersToUser(userId: string, userTier: string, userPhone?: string) {
  try {
    const allVouchers = await kvGetByPrefixWithRetry("voucher:");
    if (!allVouchers || allVouchers.length === 0) return 0;

    // Get user's existing voucher assignments
    const allAssignments = await kvGetByPrefixWithRetry("user_voucher:");
    const userAssignments = (allAssignments || []).filter((a: any) => a.userId === userId);
    const assignedVoucherIds = new Set(userAssignments.map((a: any) => a.voucherId));

    let assignedCount = 0;
    const now = new Date();

    for (const voucher of allVouchers) {
      // Skip if already assigned
      if (assignedVoucherIds.has(voucher.id)) continue;

      // Skip inactive vouchers
      if (voucher.isActive === false) continue;

      // Skip expired vouchers
      if (voucher.expiryDate) {
        const expiry = new Date(voucher.expiryDate);
        expiry.setHours(23, 59, 59, 999);
        if (expiry < now) continue;
      }

      let eligible = false;

      if (voucher.targetType === "all") {
        eligible = true;
      } else if (voucher.targetType === "tier" && voucher.targetTier === userTier) {
        eligible = true;
      } else if (voucher.targetType === "specific" && userPhone && voucher.targetPhones?.length > 0) {
        const normalizedUserPhone = userPhone.replace(/^\+62/, "0");
        eligible = voucher.targetPhones.some((tp: string) => {
          const normalizedTp = tp.replace(/^\+62/, "0");
          return tp === userPhone || normalizedTp === normalizedUserPhone || normalizedTp === userPhone || tp === normalizedUserPhone;
        });
      }

      if (eligible) {
        const assignmentId = crypto.randomUUID();
        await kv.set(`user_voucher:${assignmentId}`, {
          id: assignmentId,
          userId,
          voucherId: voucher.id,
          voucher,
          assignedAt: now.toISOString(),
          claimed: false,
          used: false,
        });
        assignedCount++;
      }
    }

    if (assignedCount > 0) {
      console.log(`🎟️ Auto-assigned ${assignedCount} voucher(s) to user ${userId} (tier: ${userTier})`);
    }
    return assignedCount;
  } catch (error) {
    console.log(`⚠️ Auto-assign vouchers error for user ${userId}: ${error}`);
    return 0;
  }
}

// Admin: Get All Vouchers (with assignment counts)
app.get("/make-server-e5e192fb/admin/vouchers", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck?.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const vouchers = await kvGetByPrefixWithRetry("voucher:");
    const assignments = await kvGetByPrefixWithRetry("user_voucher:");
    
    const enriched = (vouchers || []).map((v: any) => {
      const vAssigns = (assignments || []).filter((a: any) => a.voucherId === v.id);
      const totalIndividualUses = vAssigns.reduce((sum: number, a: any) => sum + (a.usedCount || 0), 0);
      return {
        ...v,
        assignedCount: vAssigns.length,
        usedCount: vAssigns.filter((a: any) => a.used).length, // fully exhausted assignments
        claimedCount: vAssigns.filter((a: any) => a.claimed).length,
        totalIndividualUses, // total individual uses across all users
      };
    });
    
    return c.json({ vouchers: enriched });
  } catch (error) {
    console.log(`Get vouchers error: ${error?.message || error}`);
    return c.json({ error: `Failed to get vouchers: ${error?.message || error}` }, 500);
  }
});

// Admin: Create Voucher
app.post("/make-server-e5e192fb/admin/vouchers", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck?.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const voucherData = await c.req.json();
    const voucherId = crypto.randomUUID();
    
    const voucher = {
      id: voucherId,
      ...voucherData,
      targetType: voucherData.targetType || "all",
      targetTier: voucherData.targetTier || null,
      targetPhones: voucherData.targetPhones || [],
      discountType: voucherData.discountType || "percentage",
      discountValue: voucherData.discountValue || 0,
      minOrderAmount: voucherData.minOrderAmount || 0,
      // Menu/category restrictions: empty array = applies to all menu items
      applicableCategories: voucherData.applicableCategories || [],
      applicableItemIds: voucherData.applicableItemIds || [],
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`voucher:${voucherId}`, voucher);
    
    // Auto-assign based on targeting
    let assignedCount = 0;
    if (voucher.targetType === "all" || voucher.targetType === "tier") {
      const allUsers = await kvGetByPrefixWithRetry("user:");
      for (const user of (allUsers || [])) {
        if (user.isAdmin) continue;
        if (voucher.targetType === "tier") {
          const userTier = user.tier || getUserTier(user.totalPointsEarned || user.points || 0);
          if (userTier !== voucher.targetTier) continue;
        }
        const assignmentId = crypto.randomUUID();
        await kv.set(`user_voucher:${assignmentId}`, {
          id: assignmentId, userId: user.id, voucherId,
          voucher, assignedAt: new Date().toISOString(), claimed: false, used: false,
        });
        assignedCount++;
      }
    } else if (voucher.targetType === "specific" && voucher.targetPhones?.length > 0) {
      const allUsers = await kvGetByPrefixWithRetry("user:");
      for (const phone of voucher.targetPhones) {
        const user = (allUsers || []).find((u: any) => u.phone === phone || u.phone?.replace(/^\+62/, "0") === phone || u.phone === phone.replace(/^0/, "+62"));
        if (user) {
          const assignmentId = crypto.randomUUID();
          await kv.set(`user_voucher:${assignmentId}`, {
            id: assignmentId, userId: user.id, voucherId,
            voucher, assignedAt: new Date().toISOString(), claimed: false, used: false,
          });
          assignedCount++;
        }
      }
    }
    
    console.log(`✅ Voucher created: ${voucher.title} (assigned to ${assignedCount} users)`);
    return c.json({ success: true, voucher, assignedCount });
  } catch (error) {
    console.log(`Create voucher error: ${error}`);
    return c.json({ error: "Failed to create voucher" }, 500);
  }
});

// Admin: Update Voucher
app.put("/make-server-e5e192fb/admin/vouchers/:id", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck?.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const voucherId = c.req.param('id');
    const existingVoucher = await kv.get(`voucher:${voucherId}`);
    
    if (!existingVoucher) {
      return c.json({ error: "Voucher not found" }, 404);
    }

    const updates = await c.req.json();
    const updatedVoucher = {
      ...existingVoucher,
      ...updates,
      id: voucherId,
    };

    await kv.set(`voucher:${voucherId}`, updatedVoucher);
    
    // Sync embedded voucher data in all assignments
    const assignments = await kvGetByPrefixWithRetry("user_voucher:");
    for (const assign of (assignments || [])) {
      if (assign.voucherId === voucherId) {
        assign.voucher = updatedVoucher;
        await kv.set(`user_voucher:${assign.id}`, assign);
      }
    }
    
    console.log(`✅ Voucher updated: ${updatedVoucher.title}`);
    return c.json({ success: true, voucher: updatedVoucher });
  } catch (error) {
    console.log(`Update voucher error: ${error}`);
    return c.json({ error: "Failed to update voucher" }, 500);
  }
});

// Admin: Delete Voucher
app.delete("/make-server-e5e192fb/admin/vouchers/:id", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck?.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const voucherId = c.req.param('id');
    await kv.del(`voucher:${voucherId}`);
    
    // Also delete all assignments for this voucher
    const delAssignments = await kvGetByPrefixWithRetry("user_voucher:");
    for (const assign of (delAssignments || [])) {
      if (assign.voucherId === voucherId) {
        await kv.del(`user_voucher:${assign.id}`);
      }
    }
    
    console.log(`✅ Voucher deleted (with assignments): ${voucherId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`Delete voucher error: ${error}`);
    return c.json({ error: "Failed to delete voucher" }, 500);
  }
});

// Admin: Assign Voucher to User
app.post("/make-server-e5e192fb/admin/vouchers/:id/assign", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck?.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const voucherId = c.req.param('id');
    const { phoneNumber } = await c.req.json();

    if (!phoneNumber) {
      return c.json({ error: "Phone number is required" }, 400);
    }

    // Find user by phone (flexible matching)
    const allUsers = await kvGetByPrefixWithRetry("user:");
    const user = (allUsers || []).find((u: any) => u.phone === phoneNumber || u.phone?.replace(/^\+62/, "0") === phoneNumber || u.phone === phoneNumber.replace(/^0/, "+62"));

    if (!user) {
      return c.json({ error: "User not found with this phone number" }, 404);
    }

    const voucher = await kv.get(`voucher:${voucherId}`);
    if (!voucher) {
      return c.json({ error: "Voucher not found" }, 404);
    }

    // Check if already assigned
    const existing = await kvGetByPrefixWithRetry("user_voucher:");
    const alreadyAssigned = (existing || []).find((a: any) => a.voucherId === voucherId && a.userId === user.id);
    if (alreadyAssigned) {
      return c.json({ error: "Voucher already assigned to this user" }, 400);
    }

    // Create user voucher assignment
    const assignmentId = crypto.randomUUID();
    const assignment = {
      id: assignmentId,
      userId: user.id,
      voucherId: voucherId,
      voucher: voucher,
      assignedAt: new Date().toISOString(),
      claimed: false,
      used: false,
    };

    await kv.set(`user_voucher:${assignmentId}`, assignment);

    console.log(`✅ Voucher assigned to user ${user.name} (${phoneNumber})`);
    return c.json({ success: true, assignment });
  } catch (error) {
    console.log(`Assign voucher error: ${error}`);
    return c.json({ error: "Failed to assign voucher" }, 500);
  }
});

// Admin: Bulk assign voucher to tier
app.post("/make-server-e5e192fb/admin/vouchers/:id/assign-tier", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) return c.json({ error: "Unauthorized" }, 401);
    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const voucherId = c.req.param('id');
    const { tier } = await c.req.json();
    if (!tier) return c.json({ error: "Tier is required" }, 400);

    const voucher = await kv.get(`voucher:${voucherId}`);
    if (!voucher) return c.json({ error: "Voucher not found" }, 404);

    const allUsers = await kvGetByPrefixWithRetry("user:");
    const existing = await kvGetByPrefixWithRetry("user_voucher:");
    let assignedCount = 0;

    for (const user of (allUsers || [])) {
      if (user.isAdmin) continue;
      const userTier = user.tier || getUserTier(user.totalPointsEarned || user.points || 0);
      if (userTier !== tier) continue;
      const already = (existing || []).find((a: any) => a.voucherId === voucherId && a.userId === user.id);
      if (already) continue;

      const assignmentId = crypto.randomUUID();
      await kv.set(`user_voucher:${assignmentId}`, {
        id: assignmentId, userId: user.id, voucherId,
        voucher, assignedAt: new Date().toISOString(), claimed: false, used: false,
      });
      assignedCount++;
    }

    console.log(`✅ Voucher bulk-assigned to ${assignedCount} ${tier} users`);
    return c.json({ success: true, assignedCount });
  } catch (error) {
    console.log(`Bulk assign voucher error: ${error}`);
    return c.json({ error: "Failed to bulk assign voucher" }, 500);
  }
});

// Admin: Get voucher assignments
app.get("/make-server-e5e192fb/admin/vouchers/:id/assignments", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) return c.json({ error: "Unauthorized" }, 401);
    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const voucherId = c.req.param('id');
    const assignments = await kvGetByPrefixWithRetry("user_voucher:");
    const voucherAssignments = (assignments || []).filter((a: any) => a.voucherId === voucherId);
    
    const allUsers = await kvGetByPrefixWithRetry("user:");
    const enriched = voucherAssignments.map((a: any) => {
      const user = (allUsers || []).find((u: any) => u.id === a.userId);
      return {
        ...a,
        userName: user?.name || "Unknown",
        userPhone: user?.phone || "Unknown",
        userTier: user?.tier || getUserTier(user?.totalPointsEarned || user?.points || 0),
      };
    });

    return c.json({ assignments: enriched });
  } catch (error) {
    console.log(`Get assignments error: ${error}`);
    return c.json({ error: "Failed to get assignments" }, 500);
  }
});

// Customer: Get vouchers for a user
app.get("/make-server-e5e192fb/user-vouchers", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ error: "userId is required" }, 400);

    const userData = await kv.get(`user:${userId}`);
    if (!userData) return c.json({ vouchers: [] });

    // Lazy auto-assign: check if there are any eligible vouchers this user is missing
    // This catches vouchers created after signup or after tier promotion
    const userTier = userData.tier || getUserTier(userData.totalPointsEarned || userData.points || 0);
    await autoAssignVouchersToUser(userId, userTier, userData.phone);

    const allAssignments = await kvGetByPrefixWithRetry("user_voucher:");
    const userAssignments = (allAssignments || []).filter((a: any) => a.userId === userId);

    return c.json({ vouchers: userAssignments });
  } catch (error) {
    console.log(`Get user vouchers error: ${error}`);
    return c.json({ error: "Failed to get user vouchers" }, 500);
  }
});

// Customer: Claim a voucher
// Helper: Generate a short promo code like "TIKKA-A3X9ZP"
function generatePromoCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TIKKA-${code}`;
}

app.post("/make-server-e5e192fb/claim-voucher", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) return c.json({ error: "Unauthorized" }, 401);
    const payload = await verifyToken(customToken);
    if (!payload) return c.json({ error: "Invalid token" }, 401);

    const { userVoucherId } = await c.req.json();
    if (!userVoucherId) return c.json({ error: "userVoucherId is required" }, 400);

    const assignment = await kv.get(`user_voucher:${userVoucherId}`);
    if (!assignment) return c.json({ error: "Voucher assignment not found" }, 404);
    if (assignment.userId !== payload.userId) return c.json({ error: "Not your voucher" }, 403);
    if (assignment.claimed) return c.json({ error: "Voucher already claimed" }, 400);

    // Generate a unique promo code
    const promoCode = generatePromoCode();

    assignment.claimed = true;
    assignment.claimedAt = new Date().toISOString();
    assignment.promoCode = promoCode;
    await kv.set(`user_voucher:${userVoucherId}`, assignment);

    // Store a reverse lookup: promoCode -> userVoucherId for fast validation
    await kv.set(`promo:${promoCode}`, { userVoucherId, userId: payload.userId });

    console.log(`✅ Voucher claimed: ${assignment.voucher?.title} by user ${payload.userId}, promoCode: ${promoCode}`);
    return c.json({ success: true, assignment });
  } catch (error) {
    console.log(`Claim voucher error: ${error}`);
    return c.json({ error: "Failed to claim voucher" }, 500);
  }
});

// Customer: Validate a promo code at checkout
app.post("/make-server-e5e192fb/validate-promo", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) return c.json({ error: "Unauthorized" }, 401);
    const payload = await verifyToken(customToken);
    if (!payload) return c.json({ error: "Invalid token" }, 401);

    const { promoCode, subtotal, cartItems } = await c.req.json();
    if (!promoCode) return c.json({ error: "Promo code is required" }, 400);

    const code = promoCode.trim().toUpperCase();

    // Look up the promo code
    const promoLookup = await kv.get(`promo:${code}`);
    if (!promoLookup) {
      return c.json({ valid: false, error: "Invalid promo code" });
    }

    const assignment = await kv.get(`user_voucher:${promoLookup.userVoucherId}`);
    if (!assignment) {
      return c.json({ valid: false, error: "Voucher not found" });
    }
    if (assignment.userId !== payload.userId) {
      return c.json({ valid: false, error: "This promo code doesn't belong to you" });
    }
    if (!assignment.claimed) {
      return c.json({ valid: false, error: "Voucher has not been claimed yet" });
    }

    // Support multi-use vouchers: check usedCount vs quantity
    const vMaxUses = assignment.voucher?.quantity || 1;
    const vUsedCount = assignment.usedCount || 0;
    if (assignment.used && vUsedCount >= vMaxUses) {
      return c.json({ valid: false, error: "This promo code has been fully used" });
    }

    // Check expiry
    const voucher = assignment.voucher;
    if (voucher?.expiryDate) {
      const expiry = new Date(voucher.expiryDate);
      if (expiry < new Date()) {
        return c.json({ valid: false, error: "This promo code has expired" });
      }
    }

    // Check minimum order amount
    if (voucher?.minOrderAmount && subtotal && subtotal < voucher.minOrderAmount) {
      return c.json({ 
        valid: false, 
        error: `Minimum order of Rp ${Number(voucher.minOrderAmount).toLocaleString("id-ID")} required` 
      });
    }

    // Check menu/category restrictions
    const applicableCategories: string[] = voucher?.applicableCategories || [];
    const applicableItemIds: string[] = voucher?.applicableItemIds || [];
    const hasRestrictions = applicableCategories.length > 0 || applicableItemIds.length > 0;

    let eligibleItems: any[] = [];
    let eligibleSubtotal = 0;

    if (hasRestrictions && cartItems && Array.isArray(cartItems) && cartItems.length > 0) {
      // Resolve actual menu categories for cart items that have stale/broad category names
      // (e.g. "Regular Menu" instead of "Biryani"). Look up the real category from menu data.
      const broadCategories = ["Regular Menu", "Today's Special", "Kids Menu", "Flash Sale", "Uncategorized"];
      const needsResolution = cartItems.some((i: any) => broadCategories.includes(i.category));
      let menuLookup: Record<string, string> = {};
      if (needsResolution) {
        try {
          const allMenuItems = await kv.getByPrefix("regular_menu:");
          for (const mi of (allMenuItems || [])) {
            if (mi.id !== undefined) menuLookup[String(mi.id)] = mi.category || "";
            if (mi.name) menuLookup[mi.name.toLowerCase().trim()] = mi.category || "";
          }
          console.log(`🔍 Built menu lookup with ${Object.keys(menuLookup).length} entries for category resolution`);
        } catch (e) {
          console.log(`⚠️ Failed to build menu lookup: ${e}`);
        }
      }

      // Enrich cart items with resolved categories
      const enrichedCartItems = cartItems.map((item: any) => {
        if (broadCategories.includes(item.category) && Object.keys(menuLookup).length > 0) {
          const resolvedById = menuLookup[String(item.id)];
          const resolvedByName = menuLookup[(item.title || '').toLowerCase().trim()];
          const resolved = resolvedById || resolvedByName || item.category;
          if (resolved !== item.category) {
            console.log(`🔄 Resolved category for "${item.title}" (id=${item.id}): "${item.category}" → "${resolved}"`);
          }
          return { ...item, category: resolved };
        }
        return item;
      });

      console.log(`🔍 Promo validation - applicableCategories: [${applicableCategories.join(', ')}], enriched cart categories: [${enrichedCartItems.map((i: any) => i.category).join(', ')}]`);
      for (const item of enrichedCartItems) {
        const categoryMatch = applicableCategories.length === 0 || applicableCategories.some((ac: string) => ac.toLowerCase().trim() === (item.category || '').toLowerCase().trim());
        const itemMatch = applicableItemIds.length === 0 || applicableItemIds.includes(item.id);
        // If both restrictions are set, item must match either category OR specific item
        if (applicableCategories.length > 0 && applicableItemIds.length > 0) {
          if (categoryMatch || itemMatch) {
            eligibleItems.push(item);
            eligibleSubtotal += (item.price || 0) * (item.quantity || 1);
          }
        } else if (applicableCategories.length > 0) {
          if (categoryMatch) {
            eligibleItems.push(item);
            eligibleSubtotal += (item.price || 0) * (item.quantity || 1);
          }
        } else if (applicableItemIds.length > 0) {
          if (itemMatch) {
            eligibleItems.push(item);
            eligibleSubtotal += (item.price || 0) * (item.quantity || 1);
          }
        }
      }

      if (eligibleItems.length === 0) {
        const catNames = applicableCategories.join(", ");
        return c.json({
          valid: false,
          error: `This voucher only applies to: ${catNames || "specific items"}. Add eligible items to your cart.`,
          applicableCategories,
          applicableItemIds,
        });
      }
    } else if (hasRestrictions && (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0)) {
      // Cart items not sent — return restriction info so frontend knows
      // Still mark as valid but include restriction data
    }

    // Use eligible subtotal for discount calculation if restrictions exist
    const discountBase = hasRestrictions && eligibleSubtotal > 0 ? eligibleSubtotal : (subtotal || 0);

    // Calculate discount
    let discountAmount = 0;
    const discountType = voucher?.discountType || "percentage";
    const discountValue = voucher?.discountValue || 0;

    if (discountType === "percentage") {
      discountAmount = Math.round(discountBase * discountValue / 100);
    } else if (discountType === "fixed") {
      discountAmount = Math.min(discountValue, discountBase);
    } else if (discountType === "free_delivery") {
      discountAmount = 0; // handled in frontend by zeroing delivery fee
    }

    console.log(`✅ Promo validated: ${code} => ${discountType} ${discountValue}, discount=${discountAmount}, restrictions=${hasRestrictions}, eligibleItems=${eligibleItems.length}`);
    return c.json({
      valid: true,
      userVoucherId: promoLookup.userVoucherId,
      discountType,
      discountValue,
      discountAmount,
      voucherTitle: voucher?.title || "Promo",
      freeDelivery: discountType === "free_delivery",
      freeItem: discountType === "freebie" ? (voucher?.description || "Free item") : null,
      // Category/item restriction info
      applicableCategories,
      applicableItemIds,
      hasRestrictions,
      eligibleItemCount: eligibleItems.length,
      eligibleSubtotal,
    });
  } catch (error) {
    console.log(`Validate promo error: ${error}`);
    return c.json({ error: "Failed to validate promo code" }, 500);
  }
});

// Customer: Use/redeem a voucher (mark as used after successful order)
app.post("/make-server-e5e192fb/use-voucher", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) return c.json({ error: "Unauthorized" }, 401);
    const payload = await verifyToken(customToken);
    if (!payload) return c.json({ error: "Invalid token" }, 401);

    const { userVoucherId } = await c.req.json();
    if (!userVoucherId) return c.json({ error: "userVoucherId is required" }, 400);

    const assignment = await kv.get(`user_voucher:${userVoucherId}`);
    if (!assignment) return c.json({ error: "Voucher assignment not found" }, 404);
    if (assignment.userId !== payload.userId) return c.json({ error: "Not your voucher" }, 403);

    // Support multi-use vouchers via quantity field (default 1)
    const maxUses = assignment.voucher?.quantity || 1;
    const currentUsedCount = assignment.usedCount || 0;

    if (assignment.used && currentUsedCount >= maxUses) {
      return c.json({ error: "Voucher already fully used" }, 400);
    }

    const newUsedCount = currentUsedCount + 1;
    assignment.usedCount = newUsedCount;
    assignment.lastUsedAt = new Date().toISOString();

    // Only mark as fully "used" when all uses are exhausted
    if (newUsedCount >= maxUses) {
      assignment.used = true;
      assignment.usedAt = new Date().toISOString();
    }

    await kv.set(`user_voucher:${userVoucherId}`, assignment);

    console.log(`✅ Voucher used: ${assignment.voucher?.title} by user ${payload.userId} (${newUsedCount}/${maxUses} uses)`);
    return c.json({ success: true, assignment, usedCount: newUsedCount, maxUses });
  } catch (error) {
    console.log(`Use voucher error: ${error}`);
    return c.json({ error: "Failed to use voucher" }, 500);
  }
});

// Admin: Get all registered users (for voucher targeting)
app.get("/make-server-e5e192fb/admin/users-list", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) return c.json({ error: "Unauthorized" }, 401);
    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const allUsers = await kvGetByPrefixWithRetry("user:");
    const users = (allUsers || [])
      .filter((u: any) => !u.isAdmin)
      .map((u: any) => ({
        id: u.id, name: u.name, phone: u.phone,
        points: u.points || 0,
        tier: u.tier || getUserTier(u.totalPointsEarned || u.points || 0),
      }));

    return c.json({ users });
  } catch (error) {
    console.log(`Get users list error: ${error}`);
    return c.json({ error: "Failed to get users list" }, 500);
  }
});

// ==================== END VOUCHERS ROUTES ====================

// Public: Get Categories (for customer page)
app.get("/make-server-e5e192fb/categories", async (c) => {
  try {
    const categories = await kv.getByPrefix("category:");
    return c.json({ categories });
  } catch (error) {
    console.log(`Get categories error: ${error}`);
    return c.json({ error: "Failed to get categories" }, 500);
  }
});

// Public: Get Special Offers (for customer page)
app.get("/make-server-e5e192fb/special-offers", async (c) => {
  try {
    const offers = await kv.getByPrefix("special_offer:");
    return c.json({ offers });
  } catch (error) {
    console.log(`Get special offers error: ${error}`);
    return c.json({ error: "Failed to get special offers" }, 500);
  }
});

// Validate Order (check hours, minimums, delivery zone)
app.post("/make-server-e5e192fb/validate-order", async (c) => {
  try {
    const { orderType, subtotal, lat, lng } = await c.req.json();
    
    // Check minimum order amounts (warning only, not blocking)
    if (orderType === "delivery" && subtotal < MIN_ORDER_DELIVERY) {
      console.log(`Order below minimum delivery amount: $${subtotal.toFixed(2)} (minimum: $${MIN_ORDER_DELIVERY})`);
      // Allow order to proceed for demo purposes
    }
    
    if (orderType === "pickup" && subtotal < MIN_ORDER_PICKUP) {
      console.log(`Order below minimum pickup amount: $${subtotal.toFixed(2)} (minimum: $${MIN_ORDER_PICKUP})`);
      // Allow order to proceed for demo purposes
    }
    
    // Check delivery zone if it's a delivery order (warning only)
    if (orderType === "delivery" && lat && lng) {
      const distance = calculateDistance(
        RESTAURANT_LOCATION.lat, 
        RESTAURANT_LOCATION.lng, 
        lat, 
        lng
      );
      
      if (distance > DELIVERY_RADIUS_MILES) {
        console.log(`Order outside delivery radius: ${distance.toFixed(1)} miles (maximum: ${DELIVERY_RADIUS_MILES} miles)`);
        // Allow order to proceed for demo purposes
      }
    }
    
    return c.json({ valid: true, message: "Order is valid" });
  } catch (error) {
    console.log(`Validate order error: ${error}`);
    return c.json({ error: "Failed to validate order" }, 500);
  }
});

// Get Business Info (location, minimums)
app.get("/make-server-e5e192fb/business-info", (c) => {
  return c.json({
    location: RESTAURANT_LOCATION,
    deliveryRadius: DELIVERY_RADIUS_MILES,
    minimums: {
      delivery: MIN_ORDER_DELIVERY,
      pickup: MIN_ORDER_PICKUP
    }
  });
});

// Validate Cart Items (check if items still exist and prices are current)
app.post("/make-server-e5e192fb/validate-cart", async (c) => {
  console.log("=== VALIDATE CART REQUEST RECEIVED ===");
  
  try {
    let requestBody;
    try {
      requestBody = await c.req.json();
    } catch (jsonError) {
      console.error("Failed to parse request JSON:", jsonError);
      return c.json({ error: "Invalid JSON in request body" }, 400);
    }
    
    const { items } = requestBody;
    
    console.log("Received items:", JSON.stringify(items, null, 2));
    
    if (!items || !Array.isArray(items)) {
      console.error("Invalid cart items - not an array");
      return c.json({ error: "Invalid cart items" }, 400);
    }
    
    // Get all current menu items and special offers
    let categories = [];
    let specialOffers = [];
    let regularMenuItems = [];
    let kidsMenuItems = [];
    let flashSaleItems = [];
    
    try {
      [categories, specialOffers, regularMenuItems, kidsMenuItems, flashSaleItems] = await Promise.all([
        kv.getByPrefix("category:"),
        kv.getByPrefix("todays_special:"),
        kv.getByPrefix("regular_menu:"),
        kv.getByPrefix("kids_menu:"),
        kv.getByPrefix("flash_sale:")
      ]);
    } catch (kvError) {
      console.error("Failed to fetch from KV store:", kvError);
      return c.json({ error: "Database error" }, 500);
    }
    
    console.log(`Found ${specialOffers.length} today's special, ${regularMenuItems.length} regular, ${kidsMenuItems.length} kids, ${flashSaleItems.length} flash sale items`);
    console.log("Today's special items:", JSON.stringify(specialOffers, null, 2));
    
    // Build a map of all available items using composite keys (id-category) to avoid collisions
    // Different menu sources (Today's Special, Kids Menu, Flash Sale, Regular) can have overlapping numeric IDs
    const allAvailableItems = new Map();
    
    const addToMap = (id: any, category: string, data: any) => {
      // Add with composite key (primary lookup)
      allAvailableItems.set(`${id}-${category}`, data);
      // Also add with plain id as fallback (for items without category in cart)
      if (!allAvailableItems.has(id)) {
        allAvailableItems.set(id, data);
      }
    };
    
    // Add today's special items to the map
    specialOffers.forEach(offer => {
      if (offer && offer.id) {
        const data = {
          id: offer.id,
          title: offer.name || offer.title,
          price: offer.finalPrice || offer.discountedPrice || offer.price,
          isAvailable: offer.enabled !== false
        };
        addToMap(offer.id, "Today's Special", data);
      }
    });
    
    // Add regular menu items to the map
    regularMenuItems.forEach(item => {
      if (item && item.id) {
        const data = {
          id: item.id,
          title: item.name || item.title,
          price: item.price,
          isAvailable: item.isAvailable !== false
        };
        addToMap(item.id, "Regular Menu", data);
        addToMap(item.id, "regular", data);
      }
    });
    
    // Add menu items from categories
    categories.forEach(category => {
      if (category && category.items && Array.isArray(category.items)) {
        category.items.forEach(item => {
          if (item && item.id) {
            const data = {
              id: item.id,
              title: item.title,
              price: item.price,
              isAvailable: item.isAvailable !== false
            };
            const catName = category.name || category.title || "regular";
            addToMap(item.id, catName, data);
          }
        });
      }
    });

    // Add kids menu items to the map
    kidsMenuItems.forEach(item => {
      if (item && item.id) {
        const data = {
          id: item.id,
          title: item.name || item.title,
          price: item.finalPrice || item.price,
          isAvailable: item.enabled !== false
        };
        addToMap(item.id, "Kids Menu", data);
      }
    });

    // Add flash sale items to the map
    flashSaleItems.forEach(item => {
      if (item && item.id) {
        const data = {
          id: item.id,
          title: item.name || item.title,
          price: item.finalPrice || item.price,
          isAvailable: item.enabled !== false
        };
        addToMap(item.id, "Flash Sale", data);
      }
    });

    console.log(`Total available items in map: ${allAvailableItems.size}`);
    console.log("Available item keys:", Array.from(allAvailableItems.keys()));
    
    const validatedItems = [];
    const errors = [];
    
    for (const cartItem of items) {
      const cartCategory = cartItem.category || "regular";
      const compositeKey = `${cartItem.id}-${cartCategory}`;
      console.log(`Validating cart item ID: ${cartItem.id}, category: ${cartCategory}, compositeKey: ${compositeKey}`);
      // Try composite key first, then fall back to plain id
      const currentItem = allAvailableItems.get(compositeKey) || allAvailableItems.get(cartItem.id);
      
      // Check if item exists and is available
      if (!currentItem || !currentItem.isAvailable) {
        console.error(`Item ${cartItem.id} (${cartItem.title}) not found or unavailable`);
        errors.push({
          itemId: cartItem.id,
          itemTitle: cartItem.title,
          error: "Item no longer available"
        });
        continue;
      }
      
      console.log(`Item ${cartItem.id} found! Current price: ${currentItem.price}, Cart price: ${cartItem.price}`);
      
      // Check if price has changed
      if (currentItem.price !== cartItem.price) {
        validatedItems.push({
          ...cartItem,
          id: currentItem.id,
          title: currentItem.title,
          price: currentItem.price,
          priceChanged: true,
          oldPrice: cartItem.price
        });
      } else {
        validatedItems.push({
          ...cartItem,
          priceChanged: false
        });
      }
    }
    
    console.log(`Validation complete. Valid items: ${validatedItems.length}, Errors: ${errors.length}`);
    
    return c.json({ 
      validatedItems, 
      errors,
      hasErrors: errors.length > 0
    });
  } catch (error) {
    console.error(`Validate cart error: ${error}`);
    console.error("Error message:", error?.message);
    console.error("Stack trace:", error?.stack);
    return c.json({ error: "Failed to validate cart", details: error?.message }, 500);
  }
});

// Rate Order (customer submits rating after delivery)
app.post("/make-server-e5e192fb/orders/:id/rate", async (c) => {
  try {
    const orderId = c.req.param('id');
    const body = await c.req.json();
    const { userId, rating, comment } = body;

    if (!userId) {
      return c.json({ error: "User ID is required" }, 400);
    }
    if (!rating || rating < 1 || rating > 5) {
      return c.json({ error: "Rating must be between 1 and 5" }, 400);
    }

    const order = await kv.get(`order:${orderId}`);
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    // Verify ownership
    if (order.userId && order.userId !== userId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    // Only allow rating on delivered/closed orders
    if (!['delivered', 'closed'].includes(order.status)) {
      return c.json({ error: "Order must be delivered or closed to rate" }, 400);
    }

    // Prevent re-rating
    if (order.rating) {
      return c.json({ error: "Order has already been rated" }, 400);
    }

    // Save rating
    order.rating = Math.round(rating);
    order.ratingComment = comment ? comment.trim() : '';
    order.ratingAt = new Date().toISOString();

    await kvRetry(() => kv.set(`order:${orderId}`, order));

    console.log(`⭐ Order ${orderId} rated ${rating}/5 by user ${userId}`);
    return c.json({ success: true, rating: order.rating, ratingComment: order.ratingComment });
  } catch (error) {
    console.log(`❌ Rate order error: ${error}`);
    return c.json({ error: "Failed to rate order" }, 500);
  }
});

// Cancel Order (only pending orders)
app.post("/make-server-e5e192fb/orders/:id/cancel", async (c) => {
  try {
    // Get custom JWT token
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    // Verify custom JWT
    const payload = await verifyToken(customToken);
    if (!payload || !payload.userId) {
      return c.json({ error: "Unauthorized - Invalid token" }, 401);
    }

    const userId = payload.userId;
    const orderId = c.req.param('id');
    const order = await kvRetry(() => kv.get(`order:${orderId}`));
    
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }
    
    if (order.userId !== userId) {
      return c.json({ error: "Unauthorized to cancel this order" }, 403);
    }
    
    // Only allow cancellation of pending orders (before admin confirms)
    if (order.status !== "pending") {
      if (order.status === "confirmed" || order.status === "cooking" || order.status === "ready") {
        return c.json({ error: "This order has been confirmed by the restaurant and cannot be cancelled. Please contact us directly." }, 400);
      }
      return c.json({ error: "Order cannot be cancelled at this stage" }, 400);
    }
    
    // Update order status
    order.status = "cancelled";
    order.cancelledAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    order.statusHistory.push({ 
      status: 'cancelled', 
      timestamp: order.cancelledAt, 
      label: 'Cancelled by Customer',
      actor: { name: 'Customer', role: 'customer' }
    });
    await kvRetry(() => kv.set(`order:${orderId}`, order));
    
    // Refund points if they were awarded
    const userData = await kvRetry(() => kv.get(`user:${userId}`));
    if (userData && order.pointsAwarded && order.pointsEarned) {
      userData.points = Math.max(0, (userData.points || 0) - order.pointsEarned);
      await kvRetry(() => kv.set(`user:${userId}`, userData));
      console.log(`Refunded ${order.pointsEarned} points to user ${userId}`);
    }
    
    return c.json({ 
      success: true, 
      order,
      message: "Order cancelled successfully"
    });
  } catch (error) {
    console.log(`Cancel order error: ${error}`);
    return c.json({ error: "Failed to cancel order" }, 500);
  }
});

// Request PIN Reset
app.post("/make-server-e5e192fb/forgot-pin", async (c) => {
  try {
    const { phone } = await c.req.json();
    
    if (!phone) {
      return c.json({ error: "Phone number is required" }, 400);
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return c.json({ error: "Phone number must be 10-15 digits" }, 400);
    }

    // Check if user exists
    const existingUsers = await kv.getByPrefix("user:");
    const user = existingUsers.find((u: any) => u.phone === phone || u.phone === phoneDigits);
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return c.json({ 
        success: true, 
        message: "If this phone number is registered, you will receive a PIN reset code" 
      });
    }

    // Generate a reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetToken = crypto.randomUUID();
    
    // Store reset token with expiration (15 minutes)
    await kv.set(`pin_reset:${resetToken}`, {
      userId: user.id,
      phone: user.phone,
      code: resetCode,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
    
    // In production, you would send SMS here
    console.log(`PIN reset code for ${phone}: ${resetCode}`);
    
    return c.json({ 
      success: true, 
      message: "PIN reset code sent",
      // DEVELOPMENT ONLY - remove in production
      resetCode, 
      resetToken
    });
  } catch (error) {
    console.log(`Forgot PIN error: ${error}`);
    return c.json({ error: "Failed to process PIN reset" }, 500);
  }
});

// Also keep old route for backward compatibility
app.post("/make-server-e5e192fb/forgot-password", async (c) => {
  // Redirect to forgot-pin handler
  const { phone } = await c.req.json();
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-e5e192fb/forgot-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
});

// Reset PIN with Code
app.post("/make-server-e5e192fb/reset-pin", async (c) => {
  try {
    const { resetToken, code, newPin, newPassword } = await c.req.json();
    const newCredential = newPin || newPassword; // Accept both field names
    
    if (!resetToken || !code || !newCredential) {
      return c.json({ error: "Reset token, code, and new PIN are required" }, 400);
    }

    if (!isValidPin(newCredential)) {
      return c.json({ error: "PIN must be exactly 6 digits" }, 400);
    }

    // Check both old and new KV key formats
    let resetData = await kv.get(`pin_reset:${resetToken}`);
    let resetKey = `pin_reset:${resetToken}`;
    if (!resetData) {
      resetData = await kv.get(`password_reset:${resetToken}`);
      resetKey = `password_reset:${resetToken}`;
    }
    
    if (!resetData) {
      return c.json({ error: "Invalid or expired reset token" }, 400);
    }
    
    // Check expiration
    if (new Date() > new Date(resetData.expiresAt)) {
      await kv.del(resetKey);
      return c.json({ error: "Reset code has expired" }, 400);
    }
    
    // Verify code
    if (resetData.code !== code) {
      return c.json({ error: "Invalid reset code" }, 400);
    }
    
    // Update PIN in Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    
    const { error } = await supabase.auth.admin.updateUserById(
      resetData.userId,
      { password: newCredential }
    );
    
    if (error) {
      console.log(`Reset PIN error: ${error.message}`);
      return c.json({ error: "Failed to reset PIN" }, 500);
    }
    
    // Delete used reset token
    await kv.del(resetKey);
    
    return c.json({ 
      success: true, 
      message: "PIN reset successfully" 
    });
  } catch (error) {
    console.log(`Reset PIN error: ${error}`);
    return c.json({ error: "Failed to reset PIN" }, 500);
  }
});

// Helper function to get status labels
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'pending': 'Order Created',
    'confirmed': 'Confirmed',
    'cooking': 'Cooking',
    'ready': 'Ready',
    'out_for_delivery': 'Out for Delivery',
    'delivered': 'Delivered',
    'closed': 'Order Closed',
    'cancelled': 'Cancelled',
  };
  return labels[status] || status;
}

// Admin: Update Order Status
app.post("/make-server-e5e192fb/admin/orders/:id/status", async (c) => {
  try {
    // Get access token from X-Custom-Auth header (frontend uses this pattern)
    const accessToken = c.req.header('X-Custom-Auth') || c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Use our custom JWT verification
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Resolve actor info (who is performing this action)
    let actorName = "Admin";
    let actorRole = "admin";
    const tokenPayload = await verifyToken(accessToken);
    if (tokenPayload?.staffRole) {
      const staffData = await kv.get(`staff:${tokenPayload.userId}`);
      if (staffData) {
        actorName = staffData.name || "Staff";
        actorRole = staffData.role || "staff";
      }
    } else if (tokenPayload?.userId) {
      const userData = await kv.get(`user:${tokenPayload.userId}`);
      if (userData) {
        actorName = userData.name || "Admin";
        actorRole = userData.isAdmin ? "admin" : "user";
      }
    }
    const actor = { name: actorName, role: actorRole };

    const orderId = c.req.param('id');
    const { status, paymentReceived, paymentDetails, cancellationReason, paymentStatus, addPayment, deliveryFee: newDeliveryFee, proofOfDeliveryUrl, adminMessage, deliveryNote } = await c.req.json();

    if (!status && paymentReceived === undefined && paymentStatus === undefined && !addPayment && newDeliveryFee === undefined && adminMessage === undefined && deliveryNote === undefined) {
      return c.json({ error: "Status, paymentStatus, addPayment, deliveryFee, adminMessage, or deliveryNote is required" }, 400);
    }

    const order = await kvRetry(() => kv.get(`order:${orderId}`));
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    const now = new Date().toISOString();
    const isDelivery = order.deliveryMethod === "delivery";
    
    // Initialize statusHistory if it doesn't exist (for old orders)
    if (!order.statusHistory) {
      order.statusHistory = [];
    }
    
    // Handle admin cancellation with reason
    if (status === "cancelled") {
      // Server-side guard: cannot cancel if payment received or order is closed
      const currentPS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
      if (currentPS === 'paid' || currentPS === 'partial') {
        return c.json({ error: `Cannot cancel order with ${currentPS === 'paid' ? 'full' : 'partial'} payment received. Refund the payment first.` }, 400);
      }
      if (order.status === 'closed') {
        return c.json({ error: "Cannot cancel a closed order." }, 400);
      }
      order.status = "cancelled";
      order.cancelledAt = now;
      order.cancelledBy = "admin";
      if (cancellationReason) {
        order.cancellationReason = cancellationReason;
      }
      order.statusHistory.push({ 
        status: 'cancelled', 
        timestamp: now, 
        label: `Cancelled by ${actorName}`,
        actor 
      });
      order.updatedAt = now;
      
      // Refund points if they were awarded
      const userData = await kv.get(`user:${order.userId}`);
      if (userData && order.pointsAwarded && order.pointsEarned) {
        userData.points = Math.max(0, (userData.points || 0) - order.pointsEarned);
        await kv.set(`user:${order.userId}`, userData);
        console.log(`Admin cancelled order: Refunded ${order.pointsEarned} points to user ${order.userId}`);
      }
      
      await kv.set(`order:${orderId}`, order);
      
      return c.json({ 
        success: true, 
        order,
        message: `Order cancelled by admin${cancellationReason ? `: ${cancellationReason}` : ''}` 
      });
    }
    
    // Initialize payment fields for old orders that don't have them
    if (order.paymentStatus === undefined) {
      order.paymentStatus = order.paymentReceived ? "paid" : "unpaid";
      order.paidAmount = order.paymentReceived ? (order.total || 0) : 0;
      order.paymentHistory = order.paymentHistory || [];
    }

    // Handle addPayment: admin is adding a partial/full payment entry
    if (addPayment && typeof addPayment.amount === 'number' && addPayment.amount > 0) {
      // Server-side guard: cannot add payment exceeding remaining balance
      const remaining = (order.total || 0) - (order.paidAmount || 0);
      if (addPayment.amount > remaining) {
        return c.json({ 
          error: `Payment amount (Rp ${addPayment.amount.toLocaleString()}) exceeds remaining balance (Rp ${remaining.toLocaleString()}). Maximum allowed: Rp ${remaining.toLocaleString()}.` 
        }, 400);
      }
      const entry: any = {
        amount: addPayment.amount,
        date: now,
        method: addPayment.method || undefined,
        note: addPayment.note || undefined,
      };
      if (addPayment.receiptUrl) {
        entry.receiptUrl = addPayment.receiptUrl;
      }
      if (!order.paymentHistory) order.paymentHistory = [];
      order.paymentHistory.push(entry);
      order.paidAmount = (order.paidAmount || 0) + addPayment.amount;

      // Auto-determine paymentStatus
      if (order.paidAmount >= (order.total || 0)) {
        order.paymentStatus = "paid";
        order.paymentReceived = true;
        if (!order.statusHistory.find((h: any) => h.status === 'payment_received')) {
          order.statusHistory.push({ status: 'payment_received', timestamp: now, label: 'Payment Received', actor });
        }
      } else {
        order.paymentStatus = "partial";
        order.paymentReceived = false;
      }

      console.log(`💰 Payment added for order ${orderId}: Rp ${addPayment.amount}. Total paid: Rp ${order.paidAmount} of Rp ${order.total}. Status: ${order.paymentStatus}`);
    }

    // Handle explicit paymentStatus change (admin selecting from dropdown)
    if (paymentStatus !== undefined && !addPayment) {
      // Server-side guard: cannot mark as "paid" unless paidAmount covers total
      if (paymentStatus === "paid" && (order.paidAmount || 0) < (order.total || 0)) {
        return c.json({ 
          error: `Cannot mark as paid. Recorded payments (Rp ${(order.paidAmount || 0).toLocaleString()}) do not cover the order total (Rp ${(order.total || 0).toLocaleString()}). Please add payment entries first.` 
        }, 400);
      }
      // Server-side guard: once fully paid, cannot revert to unpaid or partial
      const currentPS = order.paymentStatus || (order.paymentReceived ? 'paid' : 'unpaid');
      if (currentPS === 'paid' && (paymentStatus === 'unpaid' || paymentStatus === 'partial')) {
        return c.json({ 
          error: `Payment status is locked. Once an order is fully paid, it cannot be reverted to "${paymentStatus}".` 
        }, 400);
      }
      order.paymentStatus = paymentStatus;
      if (paymentStatus === "paid") {
        order.paymentReceived = true;
        order.paidAmount = order.total || 0;
        if (!order.statusHistory.find((h: any) => h.status === 'payment_received')) {
          order.statusHistory.push({ status: 'payment_received', timestamp: now, label: 'Payment Received', actor });
        }
      } else if (paymentStatus === "unpaid") {
        order.paymentReceived = false;
        order.paidAmount = 0;
        order.paymentHistory = [];
      } else if (paymentStatus === "partial") {
        order.paymentReceived = false;
      }
    }

    // Legacy: handle old boolean paymentReceived flag (backward compat)
    if (paymentReceived !== undefined && paymentStatus === undefined && !addPayment) {
      order.paymentReceived = paymentReceived;
      order.paymentStatus = paymentReceived ? "paid" : "unpaid";
      order.paidAmount = paymentReceived ? (order.total || 0) : 0;
      if (paymentReceived && !order.statusHistory.find((h: any) => h.status === 'payment_received')) {
        order.statusHistory.push({ 
          status: 'payment_received', 
          timestamp: now, 
          label: 'Payment Received',
          actor 
        });
      }
    }
    
    // Update payment details if provided
    if (paymentDetails !== undefined) {
      order.paymentDetails = paymentDetails;
    }
    
    // Update status with smart logic
    if (status && status !== order.status) {
      const currentStatus = order.status;
      
      // Define status hierarchy
      const statusOrder = ['pending', 'confirmed', 'cooking', 'ready', 'out_for_delivery', 'delivered', 'closed'];
      const currentIndex = statusOrder.indexOf(currentStatus);
      const newIndex = statusOrder.indexOf(status);
      
      // Auto-complete intermediate steps if jumping ahead
      if (newIndex > currentIndex) {
        // Add all intermediate statuses
        for (let i = currentIndex + 1; i <= newIndex; i++) {
          const intermediateStatus = statusOrder[i];
          
          // Skip 'out_for_delivery' for pickup orders
          if (intermediateStatus === 'out_for_delivery' && !isDelivery) {
            continue;
          }
          
          // Check if this status is already in history
          if (!order.statusHistory.find(h => h.status === intermediateStatus)) {
            const label = getStatusLabel(intermediateStatus);
            order.statusHistory.push({ 
              status: intermediateStatus, 
              timestamp: now, 
              label,
              actor 
            });
          }
        }
      } else {
        // Normal status update
        if (!order.statusHistory.find(h => h.status === status)) {
          const label = getStatusLabel(status);
          order.statusHistory.push({ 
            status, 
            timestamp: now, 
            label,
            actor 
          });
        }
      }
      
      // Set order status
      // Kitchen staff will manually update confirmed -> cooking -> ready
      order.status = status;
    }
    
    // Handle delivery fee update
    if (newDeliveryFee !== undefined && typeof newDeliveryFee === 'number' && newDeliveryFee >= 0) {
      if (order.deliveryMethod !== 'delivery') {
        return c.json({ error: "Cannot set delivery fee on a non-delivery order." }, 400);
      }
      const oldDeliveryFee = order.deliveryFee || 0;
      order.deliveryFee = newDeliveryFee;
      // Recalculate total: subtotal + tax + deliveryFee
      order.total = (order.subtotal || 0) + (order.tax || 0) + newDeliveryFee;
      order.total = parseFloat(order.total.toFixed(2));
      console.log(`📦 Delivery fee updated for order ${orderId}: Rp ${oldDeliveryFee} -> Rp ${newDeliveryFee}, new total: Rp ${order.total}`);
      if (!order.statusHistory.find((h: any) => h.status === 'delivery_fee_set')) {
        order.statusHistory.push({ status: 'delivery_fee_set', timestamp: now, label: `Delivery Fee: Rp ${newDeliveryFee.toLocaleString()}`, actor });
      }
    }

    // Store proof of delivery URL if provided
    if (proofOfDeliveryUrl && typeof proofOfDeliveryUrl === 'string') {
      order.proofOfDeliveryUrl = proofOfDeliveryUrl;
      order.proofOfDeliveryAt = now;
      console.log(`📸 Proof of delivery stored for order ${orderId}: ${proofOfDeliveryUrl.substring(0, 80)}...`);
    }

    // Store admin message (visible to customer) if provided
    if (adminMessage !== undefined) {
      if (typeof adminMessage === 'string' && adminMessage.trim()) {
        order.adminMessage = adminMessage.trim();
        order.adminMessageAt = now;
        console.log(`💬 Admin message set for order ${orderId}: "${adminMessage.trim().substring(0, 60)}..."`);
      } else {
        // Allow clearing the message by sending empty string
        delete order.adminMessage;
        delete order.adminMessageAt;
        console.log(`💬 Admin message cleared for order ${orderId}`);
      }
    }

    // Store delivery note (visible to delivery staff) if provided
    if (deliveryNote !== undefined) {
      if (typeof deliveryNote === 'string' && deliveryNote.trim()) {
        order.deliveryNote = deliveryNote.trim();
        order.deliveryNoteAt = now;
        order.deliveryNoteBy = actor.name || 'Admin';
        console.log(`🚚 Delivery note set for order ${orderId}: "${deliveryNote.trim().substring(0, 60)}..."`);
      } else {
        // Allow clearing the note by sending empty string
        delete order.deliveryNote;
        delete order.deliveryNoteAt;
        delete order.deliveryNoteBy;
        console.log(`🚚 Delivery note cleared for order ${orderId}`);
      }
    }

    order.updatedAt = now;
    
    // Award points if order is closed and payment received
    console.log(`🎁 Points check for order ${orderId}:`, {
      status: order.status,
      paymentReceived: order.paymentReceived,
      pointsAwarded: order.pointsAwarded,
      total: order.total
    });
    
    // Award points for registered users on delivered or closed status (only when fully paid)
    const isFullyPaid = order.paymentStatus === 'paid' || order.paymentReceived;
    const shouldAwardPoints = (order.status === 'delivered' || (order.status === 'closed' && isFullyPaid)) && !order.pointsAwarded && order.userId;
    if (shouldAwardPoints) {
      const pointsToAward = Math.floor(order.total / 1000);
      console.log(`🎁 Attempting to award ${pointsToAward} points to user ${order.userId} (status: ${order.status})`);
      
      if (pointsToAward > 0) {
        const userData = await kv.get(`user:${order.userId}`);
        
        if (userData) {
          const oldPoints = userData.points || 0;
          const oldTier = userData.tier || getUserTier(userData.totalPointsEarned || oldPoints);
          userData.points = oldPoints + pointsToAward;
          userData.totalPointsEarned = (userData.totalPointsEarned || 0) + pointsToAward;
          
          // Update tier based on total points
          if (userData.totalPointsEarned >= 10000) {
            userData.tier = "Platinum";
          } else if (userData.totalPointsEarned >= 5000) {
            userData.tier = "Diamond";
          } else if (userData.totalPointsEarned >= 2000) {
            userData.tier = "Gold";
          } else {
            userData.tier = "Silver";
          }
          
          await kv.set(`user:${order.userId}`, userData);
          order.pointsAwarded = true;
          order.pointsEarned = pointsToAward;
          console.log(`✅ Successfully awarded ${pointsToAward} points to user ${order.userId} (${oldPoints} -> ${userData.points}), tier: ${userData.tier}`);

          // Auto-assign vouchers if tier changed (e.g., Silver -> Gold unlocks Gold-tier vouchers)
          if (userData.tier !== oldTier) {
            console.log(`🎉 Tier promotion: ${oldTier} -> ${userData.tier} for user ${order.userId}`);
            const vouchersAssigned = await autoAssignVouchersToUser(order.userId, userData.tier, userData.phone);
            if (vouchersAssigned > 0) {
              console.log(`🎟️ Auto-assigned ${vouchersAssigned} voucher(s) after tier promotion`);
            }
          }
        } else {
          console.error(`❌ Failed to find user ${order.userId} for points award`);
        }
      }
    } else {
      console.log(`⏭️ Skipping points award - conditions not met`);
    }
    
    await kvRetry(() => kv.set(`order:${orderId}`, order));

    // Push notification to customer for relevant events (non-blocking)
    try {
      if (status) {
        await pushOrderNotification(order, 'status_change');
      }
      if (adminMessage && typeof adminMessage === 'string' && adminMessage.trim()) {
        await pushOrderNotification(order, 'admin_message', adminMessage.trim());
      }
      if ((addPayment || paymentStatus === 'paid' || paymentReceived === true) && order.paymentStatus === 'paid' && !status) {
        await pushOrderNotification(order, 'payment_received');
      }
    } catch (notifErr: any) {
      console.log(`⚠️ Non-critical: notification push failed: ${notifErr?.message}`);
    }

    // Push staff notifications for key status changes (non-blocking)
    if (status) {
      const sON = getShortOrderIdServer(order.orderNumber || order.id);
      const statusMap: Record<string, { roles: StaffRole[]; title: string; body: string; url: string }> = {
        confirmed: { roles: ['kitchen'], title: `Order ${sON} Confirmed`, body: 'New order ready to be prepared', url: '/staff/kitchen' },
        cooking: { roles: ['manager'], title: `Order ${sON} Cooking`, body: 'Kitchen has started preparing this order', url: '/staff/admin' },
        ready: { roles: ['delivery', 'cashier'], title: `Order ${sON} Ready`, body: order.deliveryMethod === 'delivery' ? 'Ready for delivery pickup' : 'Ready for customer pickup', url: order.deliveryMethod === 'delivery' ? '/staff/delivery' : '/staff/cashier' },
        out_for_delivery: { roles: ['manager', 'cashier'], title: `Order ${sON} Out for Delivery`, body: 'Delivery is on the way', url: '/staff/admin' },
        delivered: { roles: ['manager', 'cashier'], title: `Order ${sON} Delivered`, body: 'Order has been delivered successfully', url: '/staff/admin' },
        cancelled: { roles: ['manager', 'cashier', 'kitchen'], title: `Order ${sON} Cancelled`, body: order.cancellationReason || 'Order has been cancelled', url: '/staff/admin' },
      };
      const staffNotif = statusMap[status];
      if (staffNotif) {
        notifyStaffByRole(staffNotif.roles, {
          title: staffNotif.title,
          body: staffNotif.body,
          url: staffNotif.url,
          tag: `staff-status-${orderId}-${status}`,
        }).catch(() => {});
      }
    }

    return c.json({ success: true, order });
  } catch (error) {
    console.error(`❌ Update order status error:`, error);
    console.error(`Error message: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
    return c.json({ error: `Failed to update order status: ${error.message}` }, 500);
  }
});

// ==================== TIER BENEFITS ENDPOINTS ====================

// Get all tier benefits (public)
app.get("/make-server-e5e192fb/tier-benefits", async (c) => {
  try {
    const benefits = await kvGetByPrefixWithRetry("tier_benefit:");
    return c.json({ benefits: benefits || [] });
  } catch (error) {
    console.error("Get tier benefits error:", error);
    return c.json({ error: "Failed to get tier benefits" }, 500);
  }
});

// Admin: Get all tier benefits
app.get("/make-server-e5e192fb/admin/tier-benefits", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const benefits = await kv.getByPrefix("tier_benefit:");
    return c.json({ benefits });
  } catch (error) {
    console.error("Admin get tier benefits error:", error);
    return c.json({ error: "Failed to get tier benefits" }, 500);
  }
});

// Admin: Create tier benefit
app.post("/make-server-e5e192fb/admin/tier-benefits", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { tier, icon, title, description, quantity, expiryDate, conditions } = await c.req.json();

    if (!tier || !title) {
      return c.json({ error: "Tier and title are required" }, 400);
    }

    // Generate unique ID
    const id = crypto.randomUUID();
    const benefit = {
      id,
      tier,
      icon: icon || "award",
      title,
      description: description || "",
      quantity: quantity || "",
      expiryDate: expiryDate || "",
      conditions: conditions || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`tier_benefit:${id}`, benefit);
    return c.json({ success: true, benefit });
  } catch (error) {
    console.error("Create tier benefit error:", error);
    return c.json({ error: "Failed to create tier benefit" }, 500);
  }
});

// Admin: Update tier benefit
app.put("/make-server-e5e192fb/admin/tier-benefits/:id", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const id = c.req.param("id");
    const existingBenefit = await kv.get(`tier_benefit:${id}`);

    if (!existingBenefit) {
      return c.json({ error: "Tier benefit not found" }, 404);
    }

    const { tier, icon, title, description, quantity, expiryDate, conditions } = await c.req.json();

    if (!tier || !title) {
      return c.json({ error: "Tier and title are required" }, 400);
    }

    const benefit = {
      ...existingBenefit,
      tier,
      icon: icon || "award",
      title,
      description: description || "",
      quantity: quantity || "",
      expiryDate: expiryDate || "",
      conditions: conditions || "",
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`tier_benefit:${id}`, benefit);
    return c.json({ success: true, benefit });
  } catch (error) {
    console.error("Update tier benefit error:", error);
    return c.json({ error: "Failed to update tier benefit" }, 500);
  }
});

// Admin: Delete tier benefit
app.delete("/make-server-e5e192fb/admin/tier-benefits/:id", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const adminCheck = await verifyAdminAccess(customToken);
    if (!adminCheck) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const id = c.req.param("id");
    const existingBenefit = await kv.get(`tier_benefit:${id}`);

    if (!existingBenefit) {
      return c.json({ error: "Tier benefit not found" }, 404);
    }

    await kv.del(`tier_benefit:${id}`);
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete tier benefit error:", error);
    return c.json({ error: "Failed to delete tier benefit" }, 500);
  }
});

// ==================== MENU OUT OF STOCK ====================
// Toggle menu item stock status
app.patch("/make-server-e5e192fb/admin/menu/:id/stock", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const id = c.req.param("id");
    const { outOfStock } = await c.req.json();
    
    // Determine which menu type this item belongs to
    const regularItem = await kv.get(`menu:regular:${id}`);
    const kidsItem = await kv.get(`menu:kids:${id}`);
    const specialItem = await kv.get(`menu:special:${id}`);
    
    let item = null;
    let key = "";
    
    if (regularItem) {
      item = regularItem;
      key = `menu:regular:${id}`;
    } else if (kidsItem) {
      item = kidsItem;
      key = `menu:kids:${id}`;
    } else if (specialItem) {
      item = specialItem;
      key = `menu:special:${id}`;
    }
    
    if (!item) {
      return c.json({ error: "Menu item not found" }, 404);
    }
    
    item.outOfStock = outOfStock;
    item.updatedAt = new Date().toISOString();
    
    await kv.set(key, item);
    
    return c.json({ success: true, item });
  } catch (error) {
    console.error("Update menu stock error:", error);
    return c.json({ error: "Failed to update stock status" }, 500);
  }
});

// ==================== RESTAURANT SETTINGS ====================
// Get restaurant settings
app.get("/make-server-e5e192fb/admin/settings", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      console.log("❌ Settings - No token provided");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Authentication required - no token provided" 
      }, 401);
    }

    console.log("🔍 Settings - Verifying admin access...");
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      console.log("❌ Settings - Admin verification failed");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Admin access required - verification failed" 
      }, 401);
    }
    console.log("✅ Settings - Admin verified");

    const settings = await kvGetWithRetry("restaurant_settings") || {
      acceptingOrders: true,
      maintenanceMode: false,
    };
    
    // Ensure defaults
    if (settings.taxRate === undefined) settings.taxRate = 11;
    if (settings.whatsappNumber === undefined) settings.whatsappNumber = "";
    if (settings.whatsappDisplay === undefined) settings.whatsappDisplay = "";
    if (settings.restaurantName === undefined) settings.restaurantName = "";
    if (settings.restaurantTagline === undefined) settings.restaurantTagline = "";
    if (settings.restaurantAddress === undefined) settings.restaurantAddress = "";
    if (settings.restaurantLogoUrl === undefined) settings.restaurantLogoUrl = "";
    if (settings.mascotImageUrl === undefined) settings.mascotImageUrl = "";
    if (settings.siteTitle === undefined) settings.siteTitle = "";
    if (settings.appShortName === undefined) settings.appShortName = "";

    return c.json(settings);
  } catch (error) {
    console.error("Get settings error:", error);
    return c.json({ error: "Failed to get settings" }, 500);
  }
});

// Update restaurant settings
app.put("/make-server-e5e192fb/admin/settings", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      console.log("❌ Update Settings - No token provided");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Authentication required - no token provided" 
      }, 401);
    }

    console.log("🔍 Update Settings - Verifying admin access...");
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      console.log("❌ Update Settings - Admin verification failed");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Admin access required - verification failed" 
      }, 401);
    }
    console.log("✅ Update Settings - Admin verified");

    const settings = await c.req.json();
    await kv.set("restaurant_settings", settings);
    
    return c.json({ success: true, settings });
  } catch (error) {
    console.error("Update settings error:", error);
    return c.json({ error: "Failed to update settings" }, 500);
  }
});

// ==================== LOGO UPLOAD & SERVE ====================

// Upload logo (admin only) - accepts multipart form data
app.post("/make-server-e5e192fb/admin/upload-logo", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required - no token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get("logo") as File | null;
    if (!file) {
      return c.json({ error: "No file provided. Send a 'logo' field in multipart form data." }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: `Invalid file type: ${file.type}. Allowed: PNG, JPG, SVG, WebP, GIF.` }, 400);
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: "File too large. Maximum size is 5MB." }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Ensure bucket exists before uploading (handles cold start race condition)
    if (!logoBucketReady) {
      console.log("📦 Logo bucket not ready yet, creating inline...");
      await ensureLogoBucket();
      if (!logoBucketReady) {
        return c.json({ error: "Storage bucket could not be created. Please try again in a moment." }, 500);
      }
    }

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/svg+xml": "svg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[file.type] || "png";
    const filePath = `${LOGO_FILE_PATH}.${ext}`;

    // Delete any existing logo files first (all extensions at once)
    const removeFiles = ["png", "jpg", "svg", "webp", "gif"].map(e => `${LOGO_FILE_PATH}.${e}`);
    try {
      await supabase.storage.from(LOGO_BUCKET).remove(removeFiles);
      console.log("🗑️ Cleaned up old logo files");
    } catch (cleanupErr) {
      console.log("⚠️ Cleanup of old logos failed (non-critical):", cleanupErr);
    }

    // Upload the new file — use Uint8Array for Supabase compatibility
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    console.log(`📤 Uploading logo: ${filePath}, size: ${uint8.length} bytes, type: ${file.type}`);

    const { data, error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, uint8, {
      contentType: file.type,
      upsert: true,
    });

    if (error) {
      console.error("❌ Logo upload to storage failed:", JSON.stringify(error));
      return c.json({ error: `Failed to upload logo to storage: ${error.message}` }, 500);
    }

    console.log("✅ Logo uploaded to storage:", data.path);

    // Generate a signed URL with very long expiry (10 years ≈ 315360000 seconds)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(filePath, 315360000);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("❌ Failed to create signed URL:", signedUrlError);
      return c.json({ error: "Logo uploaded but failed to generate access URL. Please try again." }, 500);
    }

    const logoUrl = signedUrlData.signedUrl;
    console.log("✅ Logo signed URL generated:", logoUrl.substring(0, 100) + "...");

    // Store logo metadata in KV
    await kv.set("restaurant_logo_meta", {
      path: filePath,
      contentType: file.type,
      uploadedAt: new Date().toISOString(),
      size: file.size,
      signedUrl: logoUrl,
    });

    // Also update restaurant_settings with the signed logo URL
    const settings = await kvGetWithRetry("restaurant_settings") || {};
    settings.restaurantLogoUrl = logoUrl;
    await kv.set("restaurant_settings", settings);

    return c.json({ success: true, logoUrl, size: file.size });
  } catch (error) {
    console.error("Upload logo error:", error);
    return c.json({ error: `Failed to upload logo: ${error}` }, 500);
  }
});

// ── Public logo proxy ─────────────────────────────────────────────────
// Serves the restaurant logo at a permanent, public URL so WhatsApp OG previews,
// PWA manifest icons, and apple-touch-icon can reference it without auth.
// Falls back to the inline SVG icon if no logo has been uploaded.
app.get("/make-server-e5e192fb/public/logo", async (c) => {
  try {
    // Check KV for the stored logo metadata
    const meta = await kvGetWithRetry("restaurant_logo_meta");
    const settings = await kvGetWithRetry("restaurant_settings");
    const logoUrl = meta?.signedUrl || settings?.restaurantLogoUrl;

    if (logoUrl) {
      // Fetch the image from Supabase Storage signed URL and proxy it
      const imgRes = await fetch(logoUrl);
      if (imgRes.ok) {
        const contentType = imgRes.headers.get("content-type") || "image/png";
        const body = await imgRes.arrayBuffer();
        return new Response(body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // Fallback: serve the default SVG icon
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#E91E63"/><stop offset="100%" stop-color="#C2185B"/></linearGradient></defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <text x="256" y="220" font-family="Arial,sans-serif" font-size="96" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">TIKKA</text>
  <text x="256" y="290" font-family="Arial,sans-serif" font-size="48" font-weight="bold" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="middle">N TALK</text>
  <text x="256" y="400" font-family="Arial,sans-serif" font-size="28" fill="rgba(255,255,255,0.7)" text-anchor="middle" letter-spacing="6">AN INDIAN KITCHEN</text>
</svg>`;
    return new Response(fallbackSvg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Public logo proxy error:", error);
    return new Response("Logo unavailable", { status: 500 });
  }
});

// Delete logo (admin only)
app.delete("/make-server-e5e192fb/admin/delete-logo", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Delete all logo files (all extensions at once)
    const removeFiles = ["png", "jpg", "svg", "webp", "gif"].map(e => `${LOGO_FILE_PATH}.${e}`);
    try {
      await supabase.storage.from(LOGO_BUCKET).remove(removeFiles);
    } catch (_) { /* ignore */ }

    // Clear logo metadata
    await kv.del("restaurant_logo_meta");

    // Clear logo URL from settings
    const settings = await kvGetWithRetry("restaurant_settings") || {};
    settings.restaurantLogoUrl = "";
    await kv.set("restaurant_settings", settings);

    console.log("✅ Logo deleted from storage");
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete logo error:", error);
    return c.json({ error: `Failed to delete logo: ${error}` }, 500);
  }
});

// ==================== FAVICON IMAGE UPLOAD & DELETE ====================

// Upload favicon (admin only) - accepts multipart form data
app.post("/make-server-e5e192fb/admin/upload-favicon", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required - no token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get("favicon") as File | null;
    if (!file) {
      return c.json({ error: "No file provided. Send a 'favicon' field in multipart form data." }, 400);
    }

    // Validate file type - favicons should be PNG or ICO ideally
    const allowedTypes = ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", "image/webp", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: `Invalid file type: ${file.type}. Allowed: PNG (recommended), ICO, SVG, WebP, JPG.` }, 400);
    }

    // Validate file size (max 1MB for favicons)
    if (file.size > 1 * 1024 * 1024) {
      return c.json({ error: "File too large. Maximum size for favicon is 1MB." }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!logoBucketReady) {
      await ensureLogoBucket();
      if (!logoBucketReady) {
        return c.json({ error: "Storage bucket could not be created. Please try again in a moment." }, 500);
      }
    }

    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/x-icon": "ico",
      "image/vnd.microsoft.icon": "ico",
      "image/svg+xml": "svg",
      "image/webp": "webp",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
    };
    const ext = extMap[file.type] || "png";
    const filePath = `${FAVICON_FILE_PATH}.${ext}`;

    // Delete any existing favicon files first
    const removeFiles = ["png", "ico", "svg", "webp", "jpg"].map(e => `${FAVICON_FILE_PATH}.${e}`);
    try {
      await supabase.storage.from(LOGO_BUCKET).remove(removeFiles);
    } catch (cleanupErr) {
      console.log("⚠️ Cleanup of old favicons failed (non-critical):", cleanupErr);
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    console.log(`📤 Uploading favicon: ${filePath}, size: ${uint8.length} bytes, type: ${file.type}`);

    const { data, error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, uint8, {
      contentType: file.type,
      upsert: true,
    });

    if (error) {
      console.error("❌ Favicon upload to storage failed:", JSON.stringify(error));
      return c.json({ error: `Failed to upload favicon to storage: ${error.message}` }, 500);
    }

    console.log("✅ Favicon uploaded to storage:", data.path);

    // Generate a signed URL with very long expiry (10 years)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(filePath, 315360000);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("❌ Failed to create favicon signed URL:", signedUrlError);
      return c.json({ error: "Favicon uploaded but failed to generate access URL. Please try again." }, 500);
    }

    const faviconUrl = signedUrlData.signedUrl;

    // Store favicon metadata in KV
    await kv.set("restaurant_favicon_meta", {
      path: filePath,
      contentType: file.type,
      uploadedAt: new Date().toISOString(),
      size: file.size,
      signedUrl: faviconUrl,
    });

    // Also update restaurant_settings with the signed favicon URL
    const settings = await kvGetWithRetry("restaurant_settings") || {};
    settings.faviconUrl = faviconUrl;
    await kv.set("restaurant_settings", settings);

    return c.json({ success: true, faviconUrl, size: file.size });
  } catch (error) {
    console.error("Upload favicon error:", error);
    return c.json({ error: `Failed to upload favicon: ${error}` }, 500);
  }
});

// Delete favicon (admin only)
app.delete("/make-server-e5e192fb/admin/delete-favicon", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const removeFiles = ["png", "ico", "svg", "webp", "jpg"].map(e => `${FAVICON_FILE_PATH}.${e}`);
    try {
      await supabase.storage.from(LOGO_BUCKET).remove(removeFiles);
    } catch (_) { /* ignore */ }

    await kv.del("restaurant_favicon_meta");

    const settings = await kvGetWithRetry("restaurant_settings") || {};
    settings.faviconUrl = "";
    await kv.set("restaurant_settings", settings);

    console.log("✅ Favicon deleted from storage");
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete favicon error:", error);
    return c.json({ error: `Failed to delete favicon: ${error}` }, 500);
  }
});

// ── Public favicon proxy ─────────────────────────────────────────────
// Serves the favicon at a permanent public URL without auth.
// Falls back to the logo proxy or a default icon.
app.get("/make-server-e5e192fb/public/favicon", async (c) => {
  try {
    const meta = await kvGetWithRetry("restaurant_favicon_meta");
    const settings = await kvGetWithRetry("restaurant_settings");
    const faviconUrl = meta?.signedUrl || settings?.faviconUrl;

    if (faviconUrl) {
      const imgRes = await fetch(faviconUrl);
      if (imgRes.ok) {
        const contentType = imgRes.headers.get("content-type") || "image/png";
        const body = await imgRes.arrayBuffer();
        return new Response(body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // Fallback: redirect to public logo proxy
    return c.redirect(`/make-server-e5e192fb/public/logo`);
  } catch (error) {
    console.error("Public favicon proxy error:", error);
    return c.redirect(`/make-server-e5e192fb/public/logo`);
  }
});

// ==================== MASCOT IMAGE UPLOAD & DELETE ====================

// Upload mascot image (admin only) - accepts multipart form data
app.post("/make-server-e5e192fb/admin/upload-mascot", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required - no token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get("mascot") as File | null;
    if (!file) {
      return c.json({ error: "No file provided. Send a 'mascot' field in multipart form data." }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: `Invalid file type: ${file.type}. Allowed: PNG, JPG, SVG, WebP, GIF.` }, 400);
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: "File too large. Maximum size is 5MB." }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Ensure bucket exists (reuse logo bucket)
    if (!logoBucketReady) {
      console.log("📦 Logo bucket not ready yet, creating inline for mascot...");
      await ensureLogoBucket();
      if (!logoBucketReady) {
        return c.json({ error: "Storage bucket could not be created. Please try again in a moment." }, 500);
      }
    }

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/svg+xml": "svg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[file.type] || "png";
    const filePath = `${MASCOT_FILE_PATH}.${ext}`;

    // Delete any existing mascot files first (all extensions at once)
    const removeFiles = ["png", "jpg", "svg", "webp", "gif"].map(e => `${MASCOT_FILE_PATH}.${e}`);
    try {
      await supabase.storage.from(LOGO_BUCKET).remove(removeFiles);
      console.log("🗑️ Cleaned up old mascot files");
    } catch (cleanupErr) {
      console.log("⚠️ Cleanup of old mascot files failed (non-critical):", cleanupErr);
    }

    // Upload the new file
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    console.log(`📤 Uploading mascot: ${filePath}, size: ${uint8.length} bytes, type: ${file.type}`);

    const { data, error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, uint8, {
      contentType: file.type,
      upsert: true,
    });

    if (error) {
      console.error("❌ Mascot upload to storage failed:", JSON.stringify(error));
      return c.json({ error: `Failed to upload mascot to storage: ${error.message}` }, 500);
    }

    console.log("✅ Mascot uploaded to storage:", data.path);

    // Generate a signed URL with very long expiry (10 years)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(filePath, 315360000);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("❌ Failed to create signed URL for mascot:", signedUrlError);
      return c.json({ error: "Mascot uploaded but failed to generate access URL. Please try again." }, 500);
    }

    const mascotUrl = signedUrlData.signedUrl;
    console.log("✅ Mascot signed URL generated:", mascotUrl.substring(0, 100) + "...");

    // Store mascot metadata in KV
    await kv.set("restaurant_mascot_meta", {
      path: filePath,
      contentType: file.type,
      uploadedAt: new Date().toISOString(),
      size: file.size,
      signedUrl: mascotUrl,
    });

    // Also update restaurant_settings with the signed mascot URL
    const settings = await kvGetWithRetry("restaurant_settings") || {};
    settings.mascotImageUrl = mascotUrl;
    await kv.set("restaurant_settings", settings);

    return c.json({ success: true, mascotUrl, size: file.size });
  } catch (error) {
    console.error("Upload mascot error:", error);
    return c.json({ error: `Failed to upload mascot: ${error}` }, 500);
  }
});

// Delete mascot image (admin only)
app.delete("/make-server-e5e192fb/admin/delete-mascot", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Delete all mascot files (all extensions at once)
    const removeFiles = ["png", "jpg", "svg", "webp", "gif"].map(e => `${MASCOT_FILE_PATH}.${e}`);
    try {
      await supabase.storage.from(LOGO_BUCKET).remove(removeFiles);
    } catch (_) { /* ignore */ }

    // Clear mascot metadata
    await kv.del("restaurant_mascot_meta");

    // Clear mascot URL from settings
    const settings = await kvGetWithRetry("restaurant_settings") || {};
    settings.mascotImageUrl = "";
    await kv.set("restaurant_settings", settings);

    console.log("✅ Mascot image deleted from storage");
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete mascot error:", error);
    return c.json({ error: `Failed to delete mascot: ${error}` }, 500);
  }
});

// ==================== MENU IMAGE UPLOAD & DELETE ====================

// Upload menu image (admin only) - generic endpoint for all menu items
app.post("/make-server-e5e192fb/admin/upload-menu-image", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required - no token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return c.json({ error: "No file provided. Send an 'image' field in multipart form data." }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: `Invalid file type: ${file.type}. Allowed: PNG, JPG, WebP, GIF.` }, 400);
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: "File too large. Maximum size is 5MB." }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Ensure bucket exists
    if (!logoBucketReady) {
      console.log("📦 Logo bucket not ready yet, creating inline for menu image...");
      await ensureLogoBucket();
      if (!logoBucketReady) {
        return c.json({ error: "Storage bucket could not be created. Please try again in a moment." }, 500);
      }
    }

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[file.type] || "png";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `menu-images/${timestamp}-${random}.${ext}`;

    // Upload the file
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    console.log(`📤 Uploading menu image: ${filePath}, size: ${uint8.length} bytes, type: ${file.type}`);

    const { data, error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, uint8, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      console.error("❌ Menu image upload to storage failed:", JSON.stringify(error));
      return c.json({ error: `Failed to upload menu image to storage: ${error.message}` }, 500);
    }

    console.log("✅ Menu image uploaded to storage:", data.path);

    // Generate a signed URL with very long expiry (10 years)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(filePath, 315360000);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("❌ Failed to create signed URL for menu image:", signedUrlError);
      return c.json({ error: "Image uploaded but failed to generate access URL. Please try again." }, 500);
    }

    const imageUrl = signedUrlData.signedUrl;
    console.log("✅ Menu image signed URL generated:", imageUrl.substring(0, 100) + "...");

    return c.json({ success: true, imageUrl, path: filePath, size: file.size });
  } catch (error) {
    console.error("Upload menu image error:", error);
    return c.json({ error: `Failed to upload menu image: ${error}` }, 500);
  }
});

// Delete menu image from storage (admin only) - cleanup when image is replaced
app.post("/make-server-e5e192fb/admin/delete-menu-image", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const { path: filePath } = await c.req.json();
    if (!filePath || !filePath.startsWith("menu-images/")) {
      return c.json({ error: "Invalid file path. Must start with 'menu-images/'." }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase.storage.from(LOGO_BUCKET).remove([filePath]);
    if (error) {
      console.error("❌ Failed to delete menu image:", error);
      return c.json({ error: `Failed to delete menu image: ${error.message}` }, 500);
    }

    console.log("✅ Menu image deleted from storage:", filePath);
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete menu image error:", error);
    return c.json({ error: `Failed to delete menu image: ${error}` }, 500);
  }
});

// ==================== END MENU IMAGE UPLOAD & DELETE ====================

// ==================== MENU VIDEO UPLOAD & DELETE ====================

// Upload menu video (admin only) - for Today's Special & Flash Sale
app.post("/make-server-e5e192fb/admin/upload-menu-video", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required - no token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get("video") as File | null;
    if (!file) {
      return c.json({ error: "No file provided. Send a 'video' field in multipart form data." }, 400);
    }

    // Validate file type
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/mpeg"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: `Invalid file type: ${file.type}. Allowed: MP4, WebM, MOV.` }, 400);
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return c.json({ error: "File too large. Maximum size is 50MB." }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Ensure bucket exists
    if (!logoBucketReady) {
      console.log("📦 Logo bucket not ready yet, creating inline for menu video...");
      await ensureLogoBucket();
      if (!logoBucketReady) {
        return c.json({ error: "Storage bucket could not be created. Please try again in a moment." }, 500);
      }
    }

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
      "video/x-m4v": "m4v",
      "video/mpeg": "mpeg",
    };
    const ext = extMap[file.type] || "mp4";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `menu-videos/${timestamp}-${random}.${ext}`;

    // Upload the file
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    console.log(`📤 Uploading menu video: ${filePath}, size: ${uint8.length} bytes, type: ${file.type}`);

    const { data, error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, uint8, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      console.error("❌ Menu video upload to storage failed:", JSON.stringify(error));
      return c.json({ error: `Failed to upload menu video to storage: ${error.message}` }, 500);
    }

    console.log("✅ Menu video uploaded to storage:", data.path);

    // Generate a signed URL with very long expiry (10 years)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(filePath, 315360000);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("❌ Failed to create signed URL for menu video:", signedUrlError);
      return c.json({ error: "Video uploaded but failed to generate access URL. Please try again." }, 500);
    }

    const videoUrl = signedUrlData.signedUrl;
    console.log("✅ Menu video signed URL generated:", videoUrl.substring(0, 100) + "...");

    return c.json({ success: true, videoUrl, path: filePath, size: file.size });
  } catch (error) {
    console.error("Upload menu video error:", error);
    return c.json({ error: `Failed to upload menu video: ${error}` }, 500);
  }
});

// Delete menu video from storage (admin only)
app.post("/make-server-e5e192fb/admin/delete-menu-video", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const { path: filePath } = await c.req.json();
    if (!filePath || !filePath.startsWith("menu-videos/")) {
      return c.json({ error: "Invalid file path. Must start with 'menu-videos/'." }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase.storage.from(LOGO_BUCKET).remove([filePath]);
    if (error) {
      console.error("❌ Failed to delete menu video:", error);
      return c.json({ error: `Failed to delete menu video: ${error.message}` }, 500);
    }

    console.log("✅ Menu video deleted from storage:", filePath);
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete menu video error:", error);
    return c.json({ error: `Failed to delete menu video: ${error}` }, 500);
  }
});

// ==================== END MENU VIDEO UPLOAD & DELETE ====================

// ==================== PROOF OF DELIVERY UPLOAD ====================

// Upload payment receipt image (admin/cashier/manager/superuser)
app.post("/make-server-e5e192fb/admin/upload-payment-receipt", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required - no token provided" }, 401);
    }

    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Staff access required" }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get("image") as File | null;
    const orderId = formData.get("orderId") as string | null;

    if (!file) {
      return c.json({ error: "No file provided. Send an 'image' field in multipart form data." }, 400);
    }
    if (!orderId) {
      return c.json({ error: "No orderId provided." }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: `Invalid file type: ${file.type}. Allowed: PNG, JPG, WebP, PDF.` }, 400);
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: "File too large. Maximum size is 10MB." }, 400);
    }

    // Verify order exists
    const order = await kv.get(`order:${orderId}`);
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!logoBucketReady) {
      await ensureLogoBucket();
      if (!logoBucketReady) {
        return c.json({ error: "Storage bucket could not be created. Please try again." }, 500);
      }
    }

    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "application/pdf": "pdf",
    };
    const ext = extMap[file.type] || "jpg";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `payment-receipts/${orderId}-${timestamp}-${random}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    console.log(`🧾 Uploading payment receipt for order ${orderId}: ${filePath}, size: ${uint8.length} bytes`);

    const { data, error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, uint8, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      console.error("❌ Payment receipt upload failed:", JSON.stringify(error));
      return c.json({ error: `Failed to upload payment receipt: ${error.message}` }, 500);
    }

    console.log("✅ Payment receipt uploaded:", data.path);

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(filePath, 315360000);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("❌ Failed to create signed URL for receipt:", signedUrlError);
      return c.json({ error: "Receipt uploaded but failed to generate URL." }, 500);
    }

    const imageUrl = signedUrlData.signedUrl;
    console.log("✅ Payment receipt signed URL generated:", imageUrl.substring(0, 100) + "...");

    return c.json({ success: true, imageUrl, path: filePath, size: file.size });
  } catch (error) {
    console.error("Upload payment receipt error:", error);
    return c.json({ error: `Failed to upload payment receipt: ${error}` }, 500);
  }
});

// Upload proof of delivery image (delivery staff only)
app.post("/make-server-e5e192fb/delivery/upload-pod", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required - no token provided" }, 401);
    }

    // Verify staff access
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Staff access required" }, 401);
    }

    // Verify it's delivery staff (or superuser/manager)
    const tokenPayload = await verifyToken(token);
    if (tokenPayload?.staffRole) {
      const allowedRoles = ['delivery', 'superuser', 'manager'];
      if (!allowedRoles.includes(tokenPayload.staffRole)) {
        return c.json({ error: "Delivery role required to upload proof of delivery" }, 403);
      }
    }

    const formData = await c.req.formData();
    const file = formData.get("image") as File | null;
    const orderId = formData.get("orderId") as string | null;

    if (!file) {
      return c.json({ error: "No file provided. Send an 'image' field in multipart form data." }, 400);
    }
    if (!orderId) {
      return c.json({ error: "No orderId provided." }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: `Invalid file type: ${file.type}. Allowed: PNG, JPG, WebP.` }, 400);
    }

    // Validate file size (max 10MB for POD photos)
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: "File too large. Maximum size is 10MB." }, 400);
    }

    // Verify order exists and is out_for_delivery
    const order = await kv.get(`order:${orderId}`);
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }
    if (order.status !== 'out_for_delivery') {
      return c.json({ error: `Cannot upload POD for order with status '${order.status}'. Order must be 'out_for_delivery'.` }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Ensure bucket exists
    if (!logoBucketReady) {
      await ensureLogoBucket();
      if (!logoBucketReady) {
        return c.json({ error: "Storage bucket could not be created. Please try again." }, 500);
      }
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
    };
    const ext = extMap[file.type] || "jpg";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `pod-images/${orderId}-${timestamp}-${random}.${ext}`;

    // Upload the file
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    console.log(`📸 Uploading POD image for order ${orderId}: ${filePath}, size: ${uint8.length} bytes`);

    const { data, error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, uint8, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      console.error("❌ POD image upload failed:", JSON.stringify(error));
      return c.json({ error: `Failed to upload POD image: ${error.message}` }, 500);
    }

    console.log("✅ POD image uploaded:", data.path);

    // Generate a signed URL with long expiry (10 years)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(filePath, 315360000);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("❌ Failed to create signed URL for POD:", signedUrlError);
      return c.json({ error: "Image uploaded but failed to generate URL." }, 500);
    }

    const imageUrl = signedUrlData.signedUrl;
    console.log("✅ POD signed URL generated:", imageUrl.substring(0, 100) + "...");

    return c.json({ success: true, imageUrl, path: filePath, size: file.size });
  } catch (error) {
    console.error("Upload POD error:", error);
    return c.json({ error: `Failed to upload proof of delivery: ${error}` }, 500);
  }
});

// ==================== END PROOF OF DELIVERY UPLOAD ====================

// Serve logo (public fallback — redirects to signed URL)
app.get("/make-server-e5e192fb/logo", async (c) => {
  try {
    const meta = await kvGetWithRetry("restaurant_logo_meta");
    if (!meta?.path) {
      return c.json({ error: "No logo uploaded" }, 404);
    }

    // If we have a cached signed URL, redirect to it
    if (meta.signedUrl) {
      return c.redirect(meta.signedUrl, 302);
    }

    // Fallback: generate a fresh signed URL and redirect
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(meta.path, 315360000);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Logo signed URL error:", signedUrlError);
      return c.json({ error: "Logo file not accessible" }, 404);
    }

    // Cache the signed URL for future requests
    meta.signedUrl = signedUrlData.signedUrl;
    await kv.set("restaurant_logo_meta", meta);

    return c.redirect(signedUrlData.signedUrl, 302);
  } catch (error) {
    console.error("Serve logo error:", error);
    return c.json({ error: "Failed to serve logo" }, 500);
  }
});

// ==================== PAYMENT GATEWAY SETTINGS ====================
// Get payment gateway config (admin only)
app.get("/make-server-e5e192fb/admin/payment-gateway", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const pgConfig = await kvGetWithRetry("payment_gateway_settings") || {};
    
    // Merge with env var fallbacks for backward compatibility
    const envServerKey = Deno.env.get('MIDTRANS_SERVER_KEY') || '';
    const envClientKey = Deno.env.get('MIDTRANS_CLIENT_KEY') || '';
    const envIsProduction = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';

    return c.json({
      enabled: pgConfig.enabled ?? true,
      isProduction: pgConfig.isProduction ?? envIsProduction,
      clientKey: pgConfig.clientKey || envClientKey,
      serverKey: pgConfig.serverKey || envServerKey,
      merchantId: pgConfig.merchantId || '',
    });
  } catch (error) {
    console.error("Get payment gateway config error:", error);
    return c.json({ error: "Failed to get payment gateway config" }, 500);
  }
});

// Update payment gateway config (admin only)
app.put("/make-server-e5e192fb/admin/payment-gateway", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    const body = await c.req.json();
    const pgConfig = {
      enabled: body.enabled ?? true,
      isProduction: body.isProduction ?? false,
      clientKey: body.clientKey || '',
      serverKey: body.serverKey || '',
      merchantId: body.merchantId || '',
      updatedAt: new Date().toISOString(),
    };

    await kv.set("payment_gateway_settings", pgConfig);
    console.log(`✅ Payment gateway config updated. Mode: ${pgConfig.isProduction ? 'PRODUCTION' : 'SANDBOX'}, Enabled: ${pgConfig.enabled}`);

    return c.json({ success: true, config: { ...pgConfig, serverKey: '***hidden***' } });
  } catch (error) {
    console.error("Update payment gateway config error:", error);
    return c.json({ error: "Failed to update payment gateway config" }, 500);
  }
});

// Test payment gateway connection (admin only)
app.post("/make-server-e5e192fb/admin/payment-gateway/test", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Invalid JWT", error: "Admin access required" }, 401);
    }

    // Read config from KV (or fallback to env)
    const { serverKey, snapApiUrl, isProduction } = await getMidtransConfig();
    if (!serverKey) {
      return c.json({ success: false, error: "Server Key is not configured. Please save your credentials first." }, 400);
    }

    // Test by trying to create a minimal Snap token (Midtrans validates the key)
    const authString = btoa(serverKey + ":");
    const testPayload = {
      transaction_details: {
        order_id: `TEST-${Date.now()}`,
        gross_amount: 10000,
      },
      customer_details: {
        first_name: "Test",
        phone: "08123456789",
      },
      item_details: [{
        id: "test-item",
        price: 10000,
        quantity: 1,
        name: "Connection Test",
      }],
    };

    const snapResponse = await fetch(snapApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${authString}`,
        "Accept": "application/json",
      },
      body: JSON.stringify(testPayload),
    });

    const snapData = await snapResponse.json();

    if (snapResponse.ok && snapData.token) {
      return c.json({
        success: true,
        message: `Connection successful! Midtrans ${isProduction ? 'Production' : 'Sandbox'} API is reachable and credentials are valid.`,
      });
    } else {
      const errorMsg = snapData.error_messages?.join(', ') || JSON.stringify(snapData);
      return c.json({
        success: false,
        error: `Midtrans API returned an error: ${errorMsg}`,
      }, 400);
    }
  } catch (error) {
    console.error("Payment gateway test error:", error);
    return c.json({ success: false, error: `Connection test failed: ${error?.message}` }, 500);
  }
});

// Check if restaurant is accepting orders (public endpoint)
app.get("/make-server-e5e192fb/restaurant-status", async (c) => {
  try {
    const settings = await kvGetWithRetry("restaurant_settings");
    const taxRate = settings?.taxRate ?? 11;
    const whatsappNumber = settings?.whatsappNumber || "";
    const whatsappDisplay = settings?.whatsappDisplay || "";
    const restaurantName = settings?.restaurantName || "";
    const restaurantTagline = settings?.restaurantTagline || "";
    const restaurantAddress = settings?.restaurantAddress || "";
    const restaurantLogoUrl = settings?.restaurantLogoUrl || "";
    const mascotImageUrl = settings?.mascotImageUrl || "";
    const siteTitle = settings?.siteTitle || "";
    const appShortName = settings?.appShortName || "";
    const faviconUrl = settings?.faviconUrl || "";
    
    // Fetch payment gateway enabled status
    const pgConfig = await kvGetWithRetry("payment_gateway_settings");
    const onlinePaymentsEnabled = pgConfig?.enabled ?? true;

    const baseInfo = { taxRate, onlinePaymentsEnabled, whatsappNumber, whatsappDisplay, restaurantName, restaurantTagline, restaurantAddress, restaurantLogoUrl, mascotImageUrl, siteTitle, appShortName, faviconUrl };
    
    if (!settings) {
      return c.json({ isOpen: true, acceptingOrders: true, ...baseInfo });
    }

    // Check maintenance mode
    if (settings.maintenanceMode) {
      return c.json({ 
        isOpen: false, 
        acceptingOrders: false,
        reason: "Restaurant is temporarily closed for maintenance",
        ...baseInfo,
      });
    }

    // Check if manually accepting orders
    if (!settings.acceptingOrders) {
      return c.json({ 
        isOpen: false, 
        acceptingOrders: false,
        reason: "Restaurant is not accepting orders at this time",
        ...baseInfo,
      });
    }

    return c.json({ isOpen: true, acceptingOrders: true, ...baseInfo });
  } catch (error) {
    console.error("Get restaurant status error:", error);
    return c.json({ isOpen: true, acceptingOrders: true, taxRate: 11, onlinePaymentsEnabled: true, whatsappNumber: "", whatsappDisplay: "", restaurantName: "", restaurantTagline: "", restaurantAddress: "", restaurantLogoUrl: "", mascotImageUrl: "", siteTitle: "", appShortName: "" });
  }
});

// ==================== ANALYTICS & REPORTS ====================
// Get sales reports
app.get("/make-server-e5e192fb/admin/reports/sales", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      console.log("❌ Sales Report - No token provided");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Authentication required - no token provided" 
      }, 401);
    }

    console.log("🔍 Sales Report - Verifying admin access...");
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      console.log("❌ Sales Report - Admin verification failed");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Admin access required - verification failed" 
      }, 401);
    }
    console.log("✅ Sales Report - Admin verified");

    const period = c.req.query("period") || "today"; // today, week, month, all
    
    // Get all orders (exclude draft orders awaiting online payment)
    const rawOrders = (await kv.getByPrefix("order:")) || [];
    const allOrders = rawOrders.filter((o: any) => (o.value || o).paymentStatus !== "awaiting_payment");
    
    const now = new Date();
    let startDate: Date;
    
    switch(period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(0); // All time
    }
    
    const filteredOrders = (allOrders || []).filter((order: any) => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= startDate;
    });
    
    // Calculate metrics
    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter((o: any) => 
      o.status === "delivered" || o.status === "completed" || o.status === "closed"
    );
    const cancelledOrders = filteredOrders.filter((o: any) => o.status === "cancelled");
    const pendingOrders = filteredOrders.filter((o: any) => 
      o.status === "pending" || o.status === "confirmed" || o.status === "cooking"
    );
    
    // Payment tracking - only count completed orders (support new paymentStatus + legacy paymentReceived)
    const paidOrders = completedOrders.filter((o: any) => o.paymentStatus === 'paid' || (o.paymentStatus === undefined && o.paymentReceived === true));
    const partialPaidOrders = completedOrders.filter((o: any) => o.paymentStatus === 'partial');
    const unpaidOrders = completedOrders.filter((o: any) => o.paymentStatus === 'unpaid' || (o.paymentStatus === undefined && !o.paymentReceived));
    
    // Total revenue from all completed orders (potential revenue)
    const totalRevenue = completedOrders.reduce((sum: number, order: any) => 
      sum + (order.total || 0), 0
    );
    
    // Revenue realized - only from paid orders
    const revenueRealized = paidOrders.reduce((sum: number, order: any) => 
      sum + (order.total || 0), 0
    );
    
    const averageOrderValue = completedOrders.length > 0 
      ? totalRevenue / completedOrders.length 
      : 0;
    
    // Group by day
    const ordersByDay: any = {};
    filteredOrders.forEach((order: any) => {
      const day = new Date(order.createdAt).toISOString().split('T')[0];
      if (!ordersByDay[day]) {
        ordersByDay[day] = { count: 0, revenue: 0 };
      }
      ordersByDay[day].count++;
      if (order.status === "delivered" || order.status === "completed") {
        ordersByDay[day].revenue += order.total || 0;
      }
    });
    
    // Top items
    const itemSales: any = {};
    completedOrders.forEach((order: any) => {
      order.items?.forEach((item: any) => {
        if (!itemSales[item.name]) {
          itemSales[item.name] = { quantity: 0, revenue: 0 };
        }
        itemSales[item.name].quantity += item.quantity;
        itemSales[item.name].revenue += item.price * item.quantity;
      });
    });
    
    const topItems = Object.entries(itemSales)
      .map(([name, data]: [string, any]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    return c.json({
      period,
      summary: {
        totalOrders,
        completedOrders: completedOrders.length,
        cancelledOrders: cancelledOrders.length,
        pendingOrders: pendingOrders.length,
        paidOrders: paidOrders.length,
        unpaidOrders: unpaidOrders.length,
        totalRevenue,
        revenueRealized,
        averageOrderValue,
      },
      ordersByDay,
      topItems,
    });
  } catch (error) {
    console.error("Get sales report error:", error);
    return c.json({ error: "Failed to get sales report" }, 500);
  }
});

// Get advanced analytics
app.get("/make-server-e5e192fb/admin/analytics", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      console.log("❌ Analytics - No token provided");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Authentication required - no token provided" 
      }, 401);
    }

    console.log("🔍 Analytics - Verifying admin access...");
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      console.log("❌ Analytics - Admin verification failed");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Admin access required - verification failed" 
      }, 401);
    }
    console.log("✅ Analytics - Admin verified");

    // Get all data (exclude draft orders awaiting online payment)
    const rawOrders = (await kv.getByPrefix("order:")) || [];
    const allOrders = rawOrders.filter((o: any) => (o.value || o).paymentStatus !== "awaiting_payment");
    const allUsers = (await kv.getByPrefix("user:")) || [];
    
    // Customer analytics - exclude admin users
    const customers = allUsers.filter((u: any) => !u.isAdmin);
    const totalCustomers = customers.length;
    const customersWithOrders = new Set(
      allOrders.map((o: any) => o.userId).filter((userId: string) => {
        const user = allUsers.find((u: any) => u.id === userId);
        return user && !user.isAdmin;
      })
    ).size;
    
    // Tier distribution based on points (not a stored tier field)
    // Silver: 0-1999, Gold: 2000-4999, Diamond: 5000+
    const tierDistribution = {
      silver: 0,
      gold: 0,
      diamond: 0,
    };
    
    customers.forEach((user: any) => {
      const points = user.points || 0;
      if (points >= 5000) {
        tierDistribution.diamond++;
      } else if (points >= 2000) {
        tierDistribution.gold++;
      } else {
        tierDistribution.silver++;
      }
    });
    
    // Order type breakdown
    const orderTypes = {
      pickup: 0,
      delivery: 0,
    };
    
    allOrders.forEach((order: any) => {
      if (order.orderType) {
        orderTypes[order.orderType]++;
      }
    });
    
    // Peak hours (group by hour)
    const hourlyOrders: any = {};
    allOrders.forEach((order: any) => {
      const hour = new Date(order.createdAt).getHours();
      hourlyOrders[hour] = (hourlyOrders[hour] || 0) + 1;
    });
    
    const peakHours = Object.entries(hourlyOrders)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 5);
    
    // Points analytics
    let totalPointsIssued = 0;
    let totalPointsRedeemed = 0;
    
    allUsers.forEach((user: any) => {
      totalPointsIssued += user.totalPointsEarned || 0;
      totalPointsRedeemed += (user.totalPointsEarned || 0) - (user.points || 0);
    });
    
    // Payment analytics for completed orders (support new paymentStatus + legacy)
    const completedOrders = allOrders.filter((o: any) => 
      o.status === "delivered" || o.status === "completed" || o.status === "closed"
    );
    const paidOrders = completedOrders.filter((o: any) => o.paymentStatus === 'paid' || (o.paymentStatus === undefined && o.paymentReceived === true));
    const partialPaidOrders = completedOrders.filter((o: any) => o.paymentStatus === 'partial');
    const unpaidOrders = completedOrders.filter((o: any) => o.paymentStatus === 'unpaid' || (o.paymentStatus === undefined && !o.paymentReceived));
    
    const totalRevenueRealized = paidOrders.reduce((sum: number, order: any) => 
      sum + (order.total || 0), 0
    );
    const totalPartialCollected = partialPaidOrders.reduce((sum: number, order: any) => 
      sum + (order.paidAmount || 0), 0
    );
    const totalRevenuePending = unpaidOrders.reduce((sum: number, order: any) => 
      sum + (order.total || 0), 0
    ) + partialPaidOrders.reduce((sum: number, order: any) => 
      sum + ((order.total || 0) - (order.paidAmount || 0)), 0
    );
    
    // Revenue by day of week
    const dayOfWeekRevenue = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
    };
    const dayOfWeekCounts = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
    };
    
    allOrders.forEach((order: any) => {
      const isPaid = order.paymentStatus === 'paid' || (order.paymentStatus === undefined && order.paymentReceived);
      if ((order.status === "delivered" || order.status === "completed" || order.status === "closed") && isPaid) {
        const day = new Date(order.createdAt).getDay();
        dayOfWeekRevenue[day] += order.total || 0;
        dayOfWeekCounts[day]++;
      }
    });
    
    const revenueByDayOfWeek = Object.entries(dayOfWeekRevenue).map(([day, revenue]) => ({
      day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][parseInt(day)],
      revenue,
      orders: dayOfWeekCounts[parseInt(day)],
    }));
    
    return c.json({
      customers: {
        total: totalCustomers,
        withOrders: customersWithOrders,
        tierDistribution,
      },
      orders: {
        total: allOrders.length,
        completed: completedOrders.length,
        paid: paidOrders.length,
        unpaid: unpaidOrders.length,
        typeBreakdown: orderTypes,
      },
      revenue: {
        realized: totalRevenueRealized,
        pending: totalRevenuePending,
        total: totalRevenueRealized + totalRevenuePending,
      },
      peakHours,
      points: {
        totalIssued: totalPointsIssued,
        totalRedeemed: totalPointsRedeemed,
        currentlyHeld: totalPointsIssued - totalPointsRedeemed,
      },
      revenueByDayOfWeek,
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    return c.json({ error: "Failed to get analytics" }, 500);
  }
});

// ==================== BULK ORDER ACTIONS ====================
// Bulk update order status
app.post("/make-server-e5e192fb/admin/orders/bulk-update", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      console.log("❌ Bulk Update - No token provided");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Authentication required - no token provided" 
      }, 401);
    }

    console.log("🔍 Bulk Update - Verifying admin access...");
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      console.log("❌ Bulk Update - Admin verification failed");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Admin access required - verification failed" 
      }, 401);
    }
    console.log("✅ Bulk Update - Admin verified");

    const { orderIds, status } = await c.req.json();
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return c.json({ error: "Order IDs array is required" }, 400);
    }
    
    if (!status) {
      return c.json({ error: "Status is required" }, 400);
    }
    
    const validStatuses = ["pending", "confirmed", "cooking", "ready", "delivering", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return c.json({ error: "Invalid status" }, 400);
    }
    
    const results = [];
    const now = new Date().toISOString();
    
    for (const orderId of orderIds) {
      try {
        const order = await kv.get(`order:${orderId}`);
        if (!order) {
          results.push({ orderId, success: false, error: "Order not found" });
          continue;
        }
        
        const oldStatus = order.status;
        order.status = status;
        order.updatedAt = now;
        
        // Add to status history
        if (!order.statusHistory) {
          order.statusHistory = [];
        }
        order.statusHistory.push({
          status: status,
          timestamp: now,
          label: `Bulk Updated to ${status}`,
        });
        
        // Award points if status is delivered and not already awarded (only for registered users)
        if (status === "delivered" && !order.pointsAwarded && order.userId) {
          const pointsEarned = Math.floor(order.total / 1000);
          
          if (pointsEarned > 0) {
            const user = await kv.get(`user:${order.userId}`);
            if (user) {
              user.points = (user.points || 0) + pointsEarned;
              user.totalPointsEarned = (user.totalPointsEarned || 0) + pointsEarned;
              
              // Update tier based on total points
              if (user.totalPointsEarned >= 10000) {
                user.tier = "Platinum";
              } else if (user.totalPointsEarned >= 5000) {
                user.tier = "Diamond";
              } else if (user.totalPointsEarned >= 2000) {
                user.tier = "Gold";
              } else {
                user.tier = "Silver";
              }
              
              await kv.set(`user:${order.userId}`, user);
            }
          }
          
          order.pointsAwarded = true;
          order.pointsEarned = pointsEarned;
        }
        
        await kv.set(`order:${orderId}`, order);
        // Push notification for bulk status change (non-blocking)
        try { await pushOrderNotification(order, 'status_change'); } catch {}
        results.push({ orderId, success: true, oldStatus, newStatus: status });
      } catch (err) {
        results.push({ orderId, success: false, error: err.message });
      }
    }
    
    return c.json({ success: true, results });
  } catch (error) {
    console.error("Bulk update error:", error);
    return c.json({ error: "Failed to bulk update orders" }, 500);
  }
});

// ==================== SYSTEM HEALTH ====================
// Get system health metrics
app.get("/make-server-e5e192fb/admin/health", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      console.log("❌ Health - No token provided");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Authentication required - no token provided" 
      }, 401);
    }

    console.log("🔍 Health - Verifying admin access...");
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      console.log("❌ Health - Admin verification failed");
      return c.json({ 
        code: 401,
        message: "Invalid JWT",
        error: "Admin access required - verification failed" 
      }, 401);
    }
    console.log("✅ Health - Admin verified");

    // Get database stats
    const allOrders = (await kv.getByPrefix("order:")) || [];
    const allUsers = (await kv.getByPrefix("user:")) || [];
    const allMenuRegular = (await kv.getByPrefix("menu:regular:")) || [];
    const allMenuKids = (await kv.getByPrefix("menu:kids:")) || [];
    const allMenuSpecial = (await kv.getByPrefix("menu:special:")) || [];
    const allVouchers = (await kv.getByPrefix("voucher:")) || [];
    
    // Calculate storage estimate (rough)
    const estimateSize = (data: any) => JSON.stringify(data).length;
    const totalSize = 
      (allOrders || []).reduce((sum, o) => sum + estimateSize(o), 0) +
      (allUsers || []).reduce((sum, u) => sum + estimateSize(u), 0) +
      (allMenuRegular || []).reduce((sum, m) => sum + estimateSize(m), 0) +
      (allMenuKids || []).reduce((sum, m) => sum + estimateSize(m), 0) +
      (allMenuSpecial || []).reduce((sum, m) => sum + estimateSize(m), 0) +
      (allVouchers || []).reduce((sum, v) => sum + estimateSize(v), 0);
    
    // Active orders
    const activeOrders = (allOrders || []).filter((o: any) => 
      ["pending", "confirmed", "cooking", "ready", "delivering"].includes(o.status)
    ).length;
    
    // Recent errors (would need error logging system)
    const recentErrors = [];
    
    // Server uptime
    const uptime = performance.now() / 1000; // seconds since server start
    
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: {
        orders: allOrders.length,
        users: allUsers.length,
        menuItems: allMenuRegular.length + allMenuKids.length + allMenuSpecial.length,
        vouchers: allVouchers.length,
        estimatedSize: `${(totalSize / 1024).toFixed(2)} KB`,
      },
      activeOrders,
      serverUptime: `${Math.floor(uptime / 60)} minutes`,
      recentErrors,
    });
  } catch (error) {
    console.error("Get health metrics error:", error);
    return c.json({ 
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// ==================== PRESENCE / HEARTBEAT ====================
// Heartbeat endpoint - called by all clients every 30s (no user auth required)
app.post("/make-server-e5e192fb/heartbeat", async (c) => {
  try {
    const body = await c.req.json();
    const { sessionId, page, userId, userName, userPhone, isGuest } = body;
    
    if (!sessionId) {
      return c.json({ error: "sessionId required" }, 400);
    }

    const now = new Date().toISOString();
    
    await kvSetWithRetry(`presence:${sessionId}`, {
      sessionId,
      page: page || "/",
      userId: userId || null,
      userName: userName || null,
      userPhone: userPhone || null,
      isGuest: isGuest ?? true,
      lastSeen: now,
      ua: c.req.header("User-Agent")?.substring(0, 100) || "",
    });

    return c.json({ ok: true });
  } catch (error) {
    // Heartbeat should never break the app - fail silently
    console.error("Heartbeat error:", error);
    return c.json({ ok: false }, 200); // Still return 200 to not trigger retries
  }
});

// Admin: Get active users (presence within last 90 seconds)
app.get("/make-server-e5e192fb/admin/active-users", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Admin access required" }, 401);
    }

    const allPresence = (await kv.getByPrefix("presence:")) || [];
    const now = Date.now();
    const ACTIVE_THRESHOLD_MS = 90 * 1000; // 90 seconds
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes - clean up old entries

    const activeUsers: any[] = [];
    const staleKeys: string[] = [];

    for (const p of allPresence) {
      if (!p || !p.lastSeen) continue;
      const lastSeenMs = new Date(p.lastSeen).getTime();
      const ageMs = now - lastSeenMs;

      if (ageMs <= ACTIVE_THRESHOLD_MS) {
        activeUsers.push({
          ...p,
          secondsAgo: Math.round(ageMs / 1000),
        });
      } else if (ageMs > STALE_THRESHOLD_MS) {
        staleKeys.push(`presence:${p.sessionId}`);
      }
    }

    // Clean up stale entries (fire and forget)
    if (staleKeys.length > 0) {
      try {
        await kv.mdel(staleKeys);
        console.log(`Cleaned up ${staleKeys.length} stale presence entries`);
      } catch (e) {
        console.error("Failed to clean up stale presence:", e);
      }
    }

    // Aggregate stats
    const loggedInUsers = activeUsers.filter((u: any) => u.userId && !u.isGuest);
    const guestUsers = activeUsers.filter((u: any) => !u.userId || u.isGuest);
    
    // Page distribution
    const pageDistribution: Record<string, number> = {};
    activeUsers.forEach((u: any) => {
      const page = u.page || "/";
      pageDistribution[page] = (pageDistribution[page] || 0) + 1;
    });

    return c.json({
      totalActive: activeUsers.length,
      loggedIn: loggedInUsers.length,
      guests: guestUsers.length,
      users: activeUsers.sort((a: any, b: any) => a.secondsAgo - b.secondsAgo),
      pageDistribution,
      staleCleanedUp: staleKeys.length,
    });
  } catch (error) {
    console.error("Active users error:", error);
    return c.json({ error: "Failed to get active users" }, 500);
  }
});

// ==================== ADMIN: BUSINESS INSIGHTS ====================
app.get("/make-server-e5e192fb/admin/business-insights", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ code: 401, message: "Invalid JWT" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ code: 401, message: "Admin access required" }, 401);
    }

    const allOrders = (await kv.getByPrefix("order:")) || [];
    const allUsers = (await kv.getByPrefix("user:")) || [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const customers = allUsers.filter((u: any) => !u.isAdmin);

    // ========== ACTIVE & ABANDONED CARTS ==========
    const activeCarts: any[] = [];
    const abandonedCarts: any[] = [];

    for (const user of customers) {
      try {
        const cart = await kv.get(`cart:${user.id}`);
        if (!Array.isArray(cart) || cart.length === 0) continue;
        
        const cartValue = cart.reduce((sum: number, item: any) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
        const itemCount = cart.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
        
        const userOrders = allOrders.filter((o: any) => o.userId === user.id);
        const lastOrder = userOrders.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        const lastOrderTime = lastOrder ? new Date(lastOrder.createdAt).getTime() : 0;
        const hoursSinceLastOrder = lastOrder ? (now.getTime() - lastOrderTime) / (1000 * 60 * 60) : 999;
        
        const cartInfo = {
          userId: user.id,
          userName: user.name || "Unknown",
          phone: user.phone || "",
          itemCount,
          cartValue,
          items: cart.map((item: any) => ({ title: item.title, quantity: item.quantity, price: item.price })),
          hoursSinceLastOrder: Math.round(hoursSinceLastOrder),
        };
        
        if (hoursSinceLastOrder > 24) {
          abandonedCarts.push(cartInfo);
        } else {
          activeCarts.push(cartInfo);
        }
      } catch (e) {
        // Skip if cart fetch fails
      }
    }

    const totalActiveCartValue = activeCarts.reduce((s: number, ci: any) => s + ci.cartValue, 0);
    const totalAbandonedCartValue = abandonedCarts.reduce((s: number, ci: any) => s + ci.cartValue, 0);

    // ========== ORDER FUNNEL & CONVERSION ==========
    const guestOrders = allOrders.filter((o: any) => o.isGuestOrder || o.guestPhone);
    const registeredOrders = allOrders.filter((o: any) => !o.isGuestOrder && !o.guestPhone && o.userId);
    
    const uniqueOrderingCustomers = new Set(
      registeredOrders.map((o: any) => o.userId).filter(Boolean)
    );
    const repeatCustomers = [...uniqueOrderingCustomers].filter(userId => {
      const count = registeredOrders.filter((o: any) => o.userId === userId).length;
      return count >= 2;
    });

    const cancelledOrders = allOrders.filter((o: any) => o.status === "cancelled");
    const cancellationRate = allOrders.length > 0 ? (cancelledOrders.length / allOrders.length) * 100 : 0;

    const statusPipeline: Record<string, number> = {};
    allOrders.forEach((o: any) => {
      statusPipeline[o.status] = (statusPipeline[o.status] || 0) + 1;
    });

    // ========== CUSTOMER INSIGHTS ==========
    const customerSpend: Record<string, { name: string; phone: string; totalSpent: number; orderCount: number; lastOrderDate: string }> = {};
    
    allOrders.forEach((o: any) => {
      if (!o.userId || o.status === "cancelled") return;
      if (!customerSpend[o.userId]) {
        const user = customers.find((u: any) => u.id === o.userId);
        customerSpend[o.userId] = {
          name: user?.name || "Unknown",
          phone: user?.phone || o.phone || "",
          totalSpent: 0,
          orderCount: 0,
          lastOrderDate: "",
        };
      }
      customerSpend[o.userId].totalSpent += o.total || 0;
      customerSpend[o.userId].orderCount += 1;
      if (!customerSpend[o.userId].lastOrderDate || o.createdAt > customerSpend[o.userId].lastOrderDate) {
        customerSpend[o.userId].lastOrderDate = o.createdAt;
      }
    });

    const topCustomersBySpend = Object.entries(customerSpend)
      .sort(([, a], [, b]) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map(([userId, data]) => ({ userId, ...data }));

    const topCustomersByFrequency = Object.entries(customerSpend)
      .sort(([, a], [, b]) => b.orderCount - a.orderCount)
      .slice(0, 10)
      .map(([userId, data]) => ({ userId, ...data }));

    const atRiskCustomers = Object.entries(customerSpend)
      .filter(([, data]) => {
        if (!data.lastOrderDate) return false;
        const daysSince = (now.getTime() - new Date(data.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince >= 14;
      })
      .sort(([, a], [, b]) => new Date(a.lastOrderDate).getTime() - new Date(b.lastOrderDate).getTime())
      .slice(0, 15)
      .map(([userId, data]) => ({
        userId,
        ...data,
        daysSinceLastOrder: Math.round((now.getTime() - new Date(data.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)),
      }));

    const blockedUsers = customers.filter((u: any) => u.blocked);

    // ========== OPERATIONAL METRICS ==========
    let totalPrepTime = 0;
    let prepTimeCount = 0;
    let totalDeliveryTime = 0;
    let deliveryTimeCount = 0;
    let totalOrderTime = 0;
    let orderTimeCount = 0;

    allOrders.forEach((o: any) => {
      if (!o.statusHistory || !Array.isArray(o.statusHistory)) return;
      
      const findTime = (status: string) => {
        const entry = o.statusHistory.find((h: any) => h.status === status);
        return entry ? new Date(entry.timestamp).getTime() : null;
      };
      
      const confirmedTime = findTime("confirmed");
      const readyTime = findTime("ready");
      const closedTime = findTime("closed") || findTime("delivered");
      const pendingTime = findTime("pending");
      
      if (confirmedTime && readyTime) {
        const prepMin = (readyTime - confirmedTime) / (1000 * 60);
        if (prepMin > 0 && prepMin < 300) {
          totalPrepTime += prepMin;
          prepTimeCount++;
        }
      }
      
      if (o.deliveryMethod === "delivery" && readyTime && closedTime) {
        const delMin = (closedTime - readyTime) / (1000 * 60);
        if (delMin > 0 && delMin < 300) {
          totalDeliveryTime += delMin;
          deliveryTimeCount++;
        }
      }
      
      if (pendingTime && closedTime) {
        const totalMin = (closedTime - pendingTime) / (1000 * 60);
        if (totalMin > 0 && totalMin < 1440) {
          totalOrderTime += totalMin;
          orderTimeCount++;
        }
      }
    });

    // ========== REVENUE TRENDS ==========
    const todayOrders = allOrders.filter((o: any) => new Date(o.createdAt) >= todayStart);
    const yesterdayOrders = allOrders.filter((o: any) => {
      const d = new Date(o.createdAt);
      return d >= yesterdayStart && d < todayStart;
    });

    const todayRevenue = todayOrders
      .filter((o: any) => o.status !== "cancelled")
      .reduce((s: number, o: any) => s + (o.total || 0), 0);
    const yesterdayRevenue = yesterdayOrders
      .filter((o: any) => o.status !== "cancelled")
      .reduce((s: number, o: any) => s + (o.total || 0), 0);

    const thisWeekOrders = allOrders.filter((o: any) => new Date(o.createdAt) >= weekAgo && o.status !== "cancelled");
    const lastWeekOrders = allOrders.filter((o: any) => {
      const d = new Date(o.createdAt);
      return d >= new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000) && d < weekAgo && o.status !== "cancelled";
    });

    const thisWeekRevenue = thisWeekOrders.reduce((s: number, o: any) => s + (o.total || 0), 0);
    const lastWeekRevenue = lastWeekOrders.reduce((s: number, o: any) => s + (o.total || 0), 0);

    const completedOrders = allOrders.filter((o: any) => 
      ["delivered", "completed", "closed"].includes(o.status)
    );
    const paidCompletedOrders = completedOrders.filter((o: any) => o.paymentStatus === 'paid' || (o.paymentStatus === undefined && o.paymentReceived));
    const collectionRate = completedOrders.length > 0 
      ? (paidCompletedOrders.length / completedOrders.length) * 100 : 0;
    const outstandingDebt = completedOrders
      .filter((o: any) => o.paymentStatus !== 'paid' && !(o.paymentStatus === undefined && o.paymentReceived))
      .reduce((s: number, o: any) => s + ((o.total || 0) - (o.paidAmount || 0)), 0);

    const nonCancelledOrders = allOrders.filter((o: any) => o.status !== "cancelled");
    const avgOrderValue = nonCancelledOrders.length > 0 
      ? nonCancelledOrders.reduce((s: number, o: any) => s + (o.total || 0), 0) / nonCancelledOrders.length : 0;

    const ordersPerHourToday: Record<number, number> = {};
    for (let h = 0; h < 24; h++) ordersPerHourToday[h] = 0;
    todayOrders.forEach((o: any) => {
      const hour = new Date(o.createdAt).getHours();
      ordersPerHourToday[hour]++;
    });

    const newCustomersThisWeek = customers.filter((u: any) => 
      u.createdAt && new Date(u.createdAt) >= weekAgo
    ).length;

    return c.json({
      carts: {
        active: activeCarts,
        abandoned: abandonedCarts,
        activeCount: activeCarts.length,
        abandonedCount: abandonedCarts.length,
        totalActiveValue: totalActiveCartValue,
        totalAbandonedValue: totalAbandonedCartValue,
      },
      funnel: {
        totalOrders: allOrders.length,
        guestOrders: guestOrders.length,
        registeredOrders: registeredOrders.length,
        uniqueCustomers: uniqueOrderingCustomers.size,
        repeatCustomers: repeatCustomers.length,
        repeatRate: uniqueOrderingCustomers.size > 0 
          ? (repeatCustomers.length / uniqueOrderingCustomers.size) * 100 : 0,
        cancelledOrders: cancelledOrders.length,
        cancellationRate,
        statusPipeline,
        avgOrdersPerCustomer: uniqueOrderingCustomers.size > 0 
          ? registeredOrders.length / uniqueOrderingCustomers.size : 0,
      },
      customers: {
        total: customers.length,
        withOrders: uniqueOrderingCustomers.size,
        withoutOrders: customers.length - uniqueOrderingCustomers.size,
        blocked: blockedUsers.length,
        newThisWeek: newCustomersThisWeek,
        topBySpend: topCustomersBySpend,
        topByFrequency: topCustomersByFrequency,
        atRisk: atRiskCustomers,
      },
      operations: {
        avgPrepTimeMin: prepTimeCount > 0 ? Math.round(totalPrepTime / prepTimeCount) : null,
        avgDeliveryTimeMin: deliveryTimeCount > 0 ? Math.round(totalDeliveryTime / deliveryTimeCount) : null,
        avgTotalOrderTimeMin: orderTimeCount > 0 ? Math.round(totalOrderTime / orderTimeCount) : null,
        prepTimeSamples: prepTimeCount,
        deliveryTimeSamples: deliveryTimeCount,
        totalTimeSamples: orderTimeCount,
        ordersPerHourToday: Object.entries(ordersPerHourToday).map(([h, count]) => ({ hour: parseInt(h), count })),
      },
      revenue: {
        todayRevenue,
        yesterdayRevenue,
        todayVsYesterday: yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0,
        thisWeekRevenue,
        lastWeekRevenue,
        weekOverWeek: lastWeekRevenue > 0 ? ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100 : 0,
        todayOrders: todayOrders.length,
        yesterdayOrders: yesterdayOrders.length,
        collectionRate,
        outstandingDebt,
        avgOrderValue: Math.round(avgOrderValue),
      },
    });
  } catch (error) {
    console.error("Business insights error:", error);
    return c.json({ error: "Failed to get business insights" }, 500);
  }
});

// ==================== ADMIN: CREATE CUSTOM ORDER ====================
app.post("/make-server-e5e192fb/admin/create-custom-order", async (c) => {
  try {
    // Verify admin access
    const accessToken = getCustomToken(c);
    
    console.log(`🔍 Admin create custom order - Token found: ${accessToken ? 'Yes' : 'No'}`);
    
    if (!accessToken) {
      console.log(`❌ No access token provided`);
      return c.json({ error: "Unauthorized" }, 401);
    }

    const adminAuth = await verifyAdminAccess(accessToken);
    
    if (!adminAuth) {
      console.log(`❌ Admin verification failed`);
      return c.json({ error: "Admin access required" }, 403);
    }

    console.log(`✅ Admin user ${adminAuth.userId} authorized to create custom order`);

    // Parse request body
    const orderData = await c.req.json();
    
    console.log(`📦 Creating custom order for customer: ${orderData.customerName} (${orderData.customerPhone})`);
    console.log(`📦 Order data:`, JSON.stringify(orderData, null, 2));
    
    // Validate required fields
    if (!orderData.userId || !orderData.items || orderData.items.length === 0) {
      return c.json({ error: "Customer and items are required" }, 400);
    }
    
    if (orderData.orderType === "delivery" && !orderData.deliveryAddress) {
      return c.json({ error: "Delivery address is required for delivery orders" }, 400);
    }
    
    // Validate stock availability for all items
    const [regularMenuItems, todaysSpecialItems, kidsMenuItems, flashSaleItems] = await Promise.all([
      kv.getByPrefix("regular_menu:"),
      kv.getByPrefix("todays_special:"),
      kv.getByPrefix("kids_menu:"),
      kv.getByPrefix("flash_sale:")
    ]);
    
    // Build map of all available items
    const allAvailableItems = new Map();
    
    [...regularMenuItems, ...todaysSpecialItems, ...kidsMenuItems, ...flashSaleItems].forEach(item => {
      if (item && item.id) {
        allAvailableItems.set(item.id, {
          id: item.id,
          name: item.name || item.title,
          price: item.finalPrice || item.discountedPrice || item.price,
          originalPrice: item.originalPrice || item.price,
          discountPercentage: item.discountPercentage || 0,
          stock: item.stock,
          isAvailable: item.isAvailable !== false && item.enabled !== false
        });
      }
    });
    
    // Validate each item in the order (skip validation for custom items)
    for (const orderItem of orderData.items) {
      // Skip validation for custom items
      if (orderItem.isCustom) {
        console.log(`⏭️ Skipping validation for custom item: ${orderItem.name}`);
        continue;
      }
      
      const menuItem = allAvailableItems.get(orderItem.id);
      
      if (!menuItem) {
        return c.json({ 
          error: `Item "${orderItem.name}" not found in menu`,
          itemId: orderItem.id 
        }, 400);
      }
      
      if (!menuItem.isAvailable) {
        return c.json({ 
          error: `Item "${menuItem.name}" is currently unavailable`,
          itemId: orderItem.id 
        }, 400);
      }
      
      if (menuItem.stock !== undefined && orderItem.quantity > menuItem.stock) {
        return c.json({ 
          error: `Insufficient stock for "${menuItem.name}". Available: ${menuItem.stock}, Requested: ${orderItem.quantity}`,
          itemId: orderItem.id 
        }, 400);
      }
    }
    
    // Generate order ID and number
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Generate sequential order number
    const counterKey = "order_counter";
    let currentCounter = await kv.get(counterKey);
    if (!currentCounter) {
      currentCounter = 0;
    }
    const newCounter = currentCounter + 1;
    await kv.set(counterKey, newCounter);
    
    const orderNumber = `${SERVER_CONFIG.orderPrefix}${String(newCounter).padStart(8, '0')}`;
    
    // Get admin user data for audit trail
    const adminUser = await kv.get(`user:${adminAuth.userId}`);
    
    // Build order items with detailed information
    const orderItems = orderData.items.map((item: any) => {
      const menuItem = allAvailableItems.get(item.id);
      const originalPrice = menuItem?.originalPrice || item.price;
      const discountPercentage = menuItem?.discountPercentage || 0;
      
      return {
        id: item.id,
        name: item.name,
        price: item.price, // Lock the price at order creation time
        originalPrice: originalPrice,
        discountPercentage: discountPercentage,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
        isCustom: item.isCustom || false,
        notes: item.notes || undefined
      };
    });
    
    // Calculate item title for backward compatibility
    const itemTitle = orderItems.length === 1 
      ? orderItems[0].name
      : `${orderItems[0].name} and ${orderItems.length - 1} more`;
    
    // Build complete order object
    const order = {
      // Basic order info
      id: orderId,
      orderNumber: orderNumber,
      userId: orderData.userId,
      
      // Customer info
      customerName: orderData.customerName,
      phone: orderData.customerPhone,
      
      // Order details
      items: orderItems,
      itemTitle: itemTitle,
      
      // Pricing
      subtotal: orderData.subtotal,
      tax: orderData.tax,
      deliveryFee: orderData.deliveryFee,
      total: orderData.total,
      
      // Fulfillment
      deliveryMethod: orderData.orderType,
      address: orderData.deliveryAddress || undefined,
      specialInstructions: orderData.specialInstructions || undefined,
      
      // Scheduling
      scheduledAt: orderData.scheduledAt || undefined,
      
      // Status
      status: orderData.scheduledAt ? "scheduled" : "confirmed",
      
      // Payment
      paymentReceived: orderData.paymentReceived || false,
      paymentStatus: orderData.paymentReceived ? "paid" : "unpaid",
      paidAmount: orderData.paymentReceived ? (orderData.total || 0) : 0,
      paymentHistory: orderData.paymentReceived ? [{ amount: orderData.total || 0, date: now, method: "admin", note: "Paid via admin at order creation" }] : [],
      paymentDetails: orderData.paymentReceived ? "Paid via admin" : undefined,
      
      // Points
      pointsAwarded: false,
      pointsEarned: orderData.paymentReceived ? Math.floor(orderData.total / 1000) : 0,
      
      // Admin info (MVP: Basic audit trail)
      createdByAdmin: true,
      createdBy: {
        adminId: adminAuth.userId,
        adminName: adminUser?.name || "Admin",
        adminPhone: adminUser?.phone || "Unknown"
      },
      adminNotes: orderData.adminNotes || undefined,
      
      // Audit trail
      auditLog: orderData.scheduledAt ? [
        {
          timestamp: now,
          action: "ORDER_CREATED",
          performedBy: adminAuth.userId,
          adminName: adminUser?.name || "Admin",
          details: `Scheduled order created by admin (scheduled for ${orderData.scheduledAt})`
        }
      ] : [
        {
          timestamp: now,
          action: "ORDER_CREATED",
          performedBy: adminAuth.userId,
          adminName: adminUser?.name || "Admin",
          details: "Order created by admin via custom order feature"
        },
        {
          timestamp: now,
          action: "STATUS_CHANGED",
          performedBy: adminAuth.userId,
          from: "pending",
          to: "confirmed",
          details: "Auto-confirmed (admin created order)"
        }
      ],
      
      // Status history
      statusHistory: orderData.scheduledAt ? [
        { 
          status: "scheduled", 
          timestamp: now, 
          label: `Scheduled for ${new Date(orderData.scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` 
        }
      ] : [
        { 
          status: "pending", 
          timestamp: now, 
          label: "Order Created (Admin)" 
        },
        { 
          status: "confirmed", 
          timestamp: now, 
          label: "Confirmed" 
        }
      ],
      
      // Timestamps
      createdAt: now,
      updatedAt: now,
    };
    
    console.log(`💾 Storing custom order with ID: ${orderId}, Order Number: ${orderNumber}`);
    
    // Store order
    await kv.set(`order:${orderId}`, order);
    
    // Add to user's orders list
    const userOrdersKey = `user_orders:${orderData.userId}`;
    const existingOrders = await kv.get(userOrdersKey) || [];
    await kv.set(userOrdersKey, [...existingOrders, orderId]);
    
    console.log(`✅ Custom order created successfully: ${orderNumber}`);
    
    return c.json({ 
      success: true,
      order: {
        id: orderId,
        orderNumber: orderNumber,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt
      }
    });
    
  } catch (error) {
    console.error(`❌ Admin create custom order error:`, error);
    return c.json({ 
      error: error.message || "Failed to create custom order" 
    }, 500);
  }
});

// ==================== PUBLIC: TRACK ORDER ====================
app.get("/make-server-e5e192fb/track/:orderNumber", async (c) => {
  try {
    const orderNumber = c.req.param("orderNumber");
    
    console.log(`🔍 Public tracking request for order: ${orderNumber}`);
    
    if (!orderNumber) {
      return c.json({ error: "Order number is required" }, 400);
    }
    
    // Find order by order number
    const allOrders = await kv.getByPrefix("order:");
    const order = allOrders.find((o: any) => o.orderNumber === orderNumber);
    
    if (!order) {
      console.log(`❌ Order not found: ${orderNumber}`);
      return c.json({ error: "Order not found" }, 404);
    }
    
    console.log(`✅ Order found: ${orderNumber}, Status: ${order.status}`);
    
    // Return public order information (sanitize sensitive data)
    const publicOrderData = {
      orderNumber: order.orderNumber,
      status: order.status,
      statusHistory: order.statusHistory || [],
      items: order.items || [],
      itemTitle: order.itemTitle,
      subtotal: order.subtotal,
      tax: order.tax,
      taxRate: order.taxRate,
      deliveryFee: order.deliveryFee,
      total: order.total,
      deliveryMethod: order.deliveryMethod,
      address: order.address,
      specialInstructions: order.specialInstructions,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      estimatedDelivery: order.estimatedDelivery,
      // Promo info
      promoCode: order.promoCode,
      promoDiscount: order.promoDiscount,
      promoVoucherTitle: order.promoVoucherTitle,
      // Custom charges from admin modifications
      customCharges: order.customCharges,
      lastModifiedAt: order.lastModifiedAt,
      lastModifiedBy: order.lastModifiedBy,
      // Payment info (safe to expose to order holder)
      paymentStatus: order.paymentStatus,
      paymentReceived: order.paymentReceived,
      paidAmount: order.paidAmount,
      remainingBalance: order.remainingBalance,
      paymentDetails: order.paymentDetails,
      paymentMethod: order.paymentMethod,
      paymentHistory: order.paymentHistory,
      // Cancellation info
      cancellationReason: order.cancellationReason,
      cancelledBy: order.cancelledBy,
      // Admin message
      adminMessage: order.adminMessage,
      adminMessageAt: order.adminMessageAt,
      // Points
      pointsAwarded: order.pointsAwarded,
      pointsEarned: order.pointsEarned,
      // Rating
      rating: order.rating,
      ratingComment: order.ratingComment,
      ratingAt: order.ratingAt,
      // Admin-created flag
      createdByAdmin: order.createdByAdmin,
      // Delivery note
      noteToDelivery: order.noteToDelivery,
      // Scheduled
      scheduledFor: order.scheduledFor,
      // Don't expose: phone, customerName, userId, internal admin notes
    };
    
    return c.json({ order: publicOrderData });
    
  } catch (error) {
    console.error(`❌ Track order error:`, error);
    return c.json({ error: "Failed to retrieve order" }, 500);
  }
});

// Admin: Fresh Start - Delete all customers (except admin) and all orders
app.post("/make-server-e5e192fb/admin/fresh-start", async (c) => {
  try {
    console.log(`🔄 FRESH START: Request received`);

    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    console.log(`✅ FRESH START: Admin ${adminAuth.userId} authorized`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Delete all non-admin users
    const allUsers = await kv.getByPrefix("user:");
    let deletedUsers = 0;
    let skippedAdmin = 0;

    for (const user of allUsers) {
      if (user.isAdmin) {
        console.log(`⏭️ FRESH START: Skipping admin user ${user.id} (${user.name})`);
        skippedAdmin++;
        continue;
      }

      // Delete from Supabase Auth
      try {
        const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
        if (authError) {
          console.log(`⚠️ FRESH START: Failed to delete user ${user.id} from Auth: ${authError.message}`);
        }
      } catch (authErr) {
        console.log(`⚠️ FRESH START: Auth delete exception for ${user.id}: ${truncateError(authErr)}`);
      }

      // Delete user KV entry
      await kv.del(`user:${user.id}`);

      // Delete user's cart
      try { await kv.del(`cart:${user.id}`); } catch (_e) { /* ignore */ }

      // Delete phone lookup key if exists
      if (user.phone) {
        try {
          const phoneEmail = `${(user.phone || '').replace(/[^0-9]/g, '')}@phone.tikka.app`;
          await kv.del(`phone:${phoneEmail}`);
        } catch (_e) { /* ignore */ }
      }

      deletedUsers++;
      console.log(`🗑️ FRESH START: Deleted user ${user.id} (${user.name || user.phone})`);
    }

    // 2. Delete all orders
    const allOrders = await kv.getByPrefix("order:");
    let deletedOrders = 0;

    for (const order of allOrders) {
      const orderId = order.id || order.orderId;
      if (orderId) {
        await kv.del(`order:${orderId}`);
        deletedOrders++;
      }
    }

    console.log(`✅ FRESH START COMPLETE: Deleted ${deletedUsers} customers, ${deletedOrders} orders. Kept ${skippedAdmin} admin(s).`);

    return c.json({
      success: true,
      message: `Fresh start complete! Deleted ${deletedUsers} customers and ${deletedOrders} orders. Admin account preserved.`,
      deletedUsers,
      deletedOrders,
      skippedAdmin,
    });
  } catch (error) {
    console.log(`❌ FRESH START error: ${error}`);
    return c.json({ error: `Fresh start failed: ${error.message}` }, 500);
  }
});

// ===================================================================
// MIDTRANS PAYMENT INTEGRATION
// ===================================================================

// Midtrans config helper — reads from KV (admin-configured) first, falls back to env vars
async function getMidtransConfig() {
  const pgConfig = await kvGetWithRetry("payment_gateway_settings");
  
  const isProduction = pgConfig?.isProduction ?? (Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true');
  const serverKey = pgConfig?.serverKey || Deno.env.get('MIDTRANS_SERVER_KEY') || '';
  const clientKey = pgConfig?.clientKey || Deno.env.get('MIDTRANS_CLIENT_KEY') || '';
  const merchantId = pgConfig?.merchantId || '';
  const enabled = pgConfig?.enabled ?? true;
  const snapApiUrl = isProduction
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
  return { isProduction, serverKey, clientKey, merchantId, enabled, snapApiUrl };
}

// GET /midtrans-config — Frontend fetches client key + mode
app.get("/make-server-e5e192fb/midtrans-config", async (c) => {
  try {
    const { isProduction, clientKey, enabled } = await getMidtransConfig();
    return c.json({ clientKey, isProduction, enabled });
  } catch (error) {
    console.log(`❌ midtrans-config error: ${error}`);
    return c.json({ error: `Failed to get Midtrans config: ${error.message}` }, 500);
  }
});

// POST /create-payment-intent — Create a Midtrans Snap token WITHOUT creating an order in KV.
// The real order is only created AFTER payment succeeds. This prevents phantom "placed" orders.
app.post("/make-server-e5e192fb/create-payment-intent", async (c) => {
  try {
    const body = await c.req.json();
    console.log(`💳 [PAYMENT-INTENT] Creating payment intent (no order yet)`);

    const { total, items, guestName, guestPhone, phone, customerName } = body;

    if (!total || total <= 0) {
      return c.json({ error: "total is required and must be > 0" }, 400);
    }

    const { serverKey, snapApiUrl, enabled } = await getMidtransConfig();
    if (!enabled) {
      return c.json({ error: "Online payments are currently disabled" }, 400);
    }
    if (!serverKey) {
      return c.json({ error: "Payment gateway not configured" }, 500);
    }

    // Generate a temporary order number for Midtrans (unique per attempt)
    const counterKey = "order_counter";
    let currentCounter = await kv.get(counterKey);
    if (!currentCounter) { currentCounter = 0; }
    const tempOrderNumber = `${SERVER_CONFIG.orderPrefix}${String(currentCounter + 1).padStart(8, '0')}`;
    const midtransOrderId = `${tempOrderNumber}-${Date.now()}`;

    const grossAmount = Math.round(total);

    const snapPayload: any = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: guestName || customerName || "Customer",
        phone: guestPhone || phone || "",
      },
      item_details: (items || []).map((item: any) => ({
        id: String(item.id || "item"),
        price: Math.round(item.price),
        quantity: item.quantity || 1,
        name: (item.title || item.name || "Item").substring(0, 50),
      })),
    };

    const itemsSubtotal = snapPayload.item_details.reduce(
      (sum: number, item: any) => sum + item.price * item.quantity, 0
    );
    const taxAmount = grossAmount - itemsSubtotal;
    if (taxAmount > 0) {
      snapPayload.item_details.push({
        id: "tax",
        price: taxAmount,
        quantity: 1,
        name: "Tax (PPN)",
      });
    }

    console.log(`💳 [PAYMENT-INTENT] Snap payload:`, JSON.stringify(snapPayload, null, 2));

    const authString = btoa(serverKey + ":");
    const snapResponse = await fetch(snapApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${authString}`,
        "Accept": "application/json",
      },
      body: JSON.stringify(snapPayload),
    });

    const snapData = await snapResponse.json();
    console.log(`💳 [PAYMENT-INTENT] Snap response status: ${snapResponse.status}`);

    if (!snapResponse.ok) {
      console.log(`❌ [PAYMENT-INTENT] Midtrans Snap API error:`, snapData);
      return c.json({ error: "Failed to create payment", details: snapData.error_messages || snapData }, 500);
    }

    console.log(`✅ [PAYMENT-INTENT] Snap token created: ${snapData.token?.substring(0, 20)}...`);

    return c.json({
      success: true,
      snapToken: snapData.token,
      midtransOrderId,
    });
  } catch (error) {
    console.log(`❌ [PAYMENT-INTENT] Error: ${error}`);
    return c.json({ error: `Payment intent creation failed: ${error?.message}` }, 500);
  }
});

// POST /create-payment — Create Midtrans Snap token for an order
app.post("/make-server-e5e192fb/create-payment", async (c) => {
  try {
    const { orderId } = await c.req.json();
    console.log(`💳 [CREATE-PAYMENT] Creating payment for order: ${orderId}`);

    if (!orderId) {
      return c.json({ error: "orderId is required" }, 400);
    }

    // Fetch order from KV
    const order = await kvGetWithRetry(`order:${orderId}`);
    if (!order) {
      console.log(`❌ [CREATE-PAYMENT] Order not found: ${orderId}`);
      return c.json({ error: "Order not found" }, 404);
    }

    // Don't create payment if already paid
    if (order.paymentStatus === 'paid') {
      console.log(`❌ [CREATE-PAYMENT] Order already paid: ${orderId}`);
      return c.json({ error: "Order is already paid" }, 400);
    }

    const { serverKey, snapApiUrl, enabled } = await getMidtransConfig();
    if (!enabled) {
      return c.json({ error: "Online payments are currently disabled" }, 400);
    }
    if (!serverKey) {
      console.log(`❌ [CREATE-PAYMENT] MIDTRANS_SERVER_KEY not configured`);
      return c.json({ error: "Payment gateway not configured" }, 500);
    }

    console.log(`💳 [CREATE-PAYMENT] Server key prefix: ${serverKey.substring(0, 15)}...`);
    console.log(`💳 [CREATE-PAYMENT] Server key length: ${serverKey.length}`);

    // Build Midtrans order ID (unique per attempt to avoid duplicate transaction errors)
    const midtransOrderId = `${order.orderNumber}-${Date.now()}`;
    
    // gross_amount must be an integer for Midtrans
    const grossAmount = Math.round(order.total);

    // Build Snap API payload
    const snapPayload: any = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: order.guestName || order.customerName || "Customer",
        phone: order.guestPhone || order.phone || "",
      },
      item_details: (order.items || []).map((item: any) => ({
        id: String(item.id || "item"),
        price: Math.round(item.price),
        quantity: item.quantity || 1,
        name: (item.title || item.name || "Item").substring(0, 50),
      })),
    };

    // Add tax as a line item so item_details sum matches gross_amount
    const itemsSubtotal = snapPayload.item_details.reduce(
      (sum: number, item: any) => sum + item.price * item.quantity, 0
    );
    const taxAmount = grossAmount - itemsSubtotal;
    if (taxAmount > 0) {
      snapPayload.item_details.push({
        id: "tax",
        price: taxAmount,
        quantity: 1,
        name: "Tax (PPN)",
      });
    }

    console.log(`💳 [CREATE-PAYMENT] Snap payload:`, JSON.stringify(snapPayload, null, 2));
    console.log(`💳 [CREATE-PAYMENT] Snap API URL: ${snapApiUrl}`);

    // Call Midtrans Snap API
    const authString = btoa(serverKey + ":");
    const snapResponse = await fetch(snapApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${authString}`,
        "Accept": "application/json",
      },
      body: JSON.stringify(snapPayload),
    });

    const snapData = await snapResponse.json();
    console.log(`💳 [CREATE-PAYMENT] Snap response status: ${snapResponse.status}`);
    console.log(`💳 [CREATE-PAYMENT] Snap response:`, JSON.stringify(snapData, null, 2));

    if (!snapResponse.ok) {
      console.log(`❌ [CREATE-PAYMENT] Midtrans Snap API error:`, snapData);
      return c.json({ 
        error: "Failed to create payment", 
        details: snapData.error_messages || snapData 
      }, 500);
    }

    // Store Midtrans details on the order
    order.paymentMethod = "midtrans";
    order.midtransOrderId = midtransOrderId;
    order.snapToken = snapData.token;
    order.updatedAt = new Date().toISOString();
    await kvSetWithRetry(`order:${orderId}`, order);

    console.log(`✅ [CREATE-PAYMENT] Snap token created for order ${orderId}: ${snapData.token?.substring(0, 20)}...`);

    return c.json({
      success: true,
      snapToken: snapData.token,
      redirectUrl: snapData.redirect_url,
      midtransOrderId,
    });
  } catch (error) {
    console.log(`❌ [CREATE-PAYMENT] Error: ${error}`);
    console.log(`❌ [CREATE-PAYMENT] Stack: ${error?.stack}`);
    return c.json({ error: `Payment creation failed: ${error?.message}` }, 500);
  }
});

// POST /midtrans-notification — Webhook called by Midtrans when payment status changes
app.post("/make-server-e5e192fb/midtrans-notification", async (c) => {
  try {
    const notification = await c.req.json();
    console.log(`🔔 [MIDTRANS-WEBHOOK] Received notification:`, JSON.stringify(notification, null, 2));

    const {
      order_id: midtransOrderId,
      transaction_status: transactionStatus,
      fraud_status: fraudStatus,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_id: transactionId,
      payment_type: paymentType,
    } = notification;

    // Verify signature: SHA512(order_id + status_code + gross_amount + server_key)
    const { serverKey } = await getMidtransConfig();
    const signatureInput = midtransOrderId + statusCode + grossAmount + serverKey;
    const encoder = new TextEncoder();
    const sigData = encoder.encode(signatureInput);
    const hashBuffer = await crypto.subtle.digest("SHA-512", sigData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedSignature = hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join('');

    if (expectedSignature !== signatureKey) {
      console.log(`❌ [MIDTRANS-WEBHOOK] Signature mismatch!`);
      console.log(`  Expected: ${expectedSignature}`);
      console.log(`  Received: ${signatureKey}`);
      return c.json({ error: "Invalid signature" }, 403);
    }

    console.log(`✅ [MIDTRANS-WEBHOOK] Signature verified for: ${midtransOrderId}`);

    // Find the order by midtransOrderId
    // midtransOrderId format: PREFIX00000XXX-timestamp
    const prefixPattern = new RegExp(`^(${SERVER_CONFIG.orderPrefix}\\d+)-(\\d+)$`);
    const orderNumberMatch = midtransOrderId.match(prefixPattern);
    if (!orderNumberMatch) {
      console.log(`❌ [MIDTRANS-WEBHOOK] Cannot parse order number from: ${midtransOrderId}`);
      return c.json({ error: "Invalid order ID format" }, 400);
    }

    const orderNumber = orderNumberMatch[1];
    console.log(`🔍 [MIDTRANS-WEBHOOK] Looking for order with number: ${orderNumber}`);

    // Search for the order in KV using getByPrefix
    const allOrders = await kv.getByPrefix("order:");
    let order: any = null;
    
    for (const entry of allOrders) {
      if (entry.value && entry.value.orderNumber === orderNumber && entry.value.midtransOrderId === midtransOrderId) {
        order = entry.value;
        break;
      }
    }

    if (!order) {
      console.log(`❌ [MIDTRANS-WEBHOOK] Order not found for midtransOrderId: ${midtransOrderId}`);
      return c.json({ error: "Order not found" }, 404);
    }

    console.log(`✅ [MIDTRANS-WEBHOOK] Found order: ${order.id} (${order.orderNumber})`);

    const now = new Date().toISOString();
    const paidAmount = parseFloat(grossAmount) || 0;

    // Handle transaction status
    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      // Payment successful
      if (transactionStatus === 'capture' && fraudStatus !== 'accept') {
        console.log(`⚠️ [MIDTRANS-WEBHOOK] Capture with fraud_status: ${fraudStatus} - skipping`);
        return c.json({ received: true });
      }

      console.log(`✅ [MIDTRANS-WEBHOOK] Payment SUCCESS for order ${order.id}`);
      
      order.paymentStatus = "paid";
      order.paymentReceived = true;
      order.paidAmount = paidAmount;
      order.status = "confirmed"; // Auto-confirm on successful payment
      
      // Add to payment history
      order.paymentHistory = order.paymentHistory || [];
      order.paymentHistory.push({
        method: paymentType || "midtrans",
        amount: paidAmount,
        transactionId: transactionId,
        midtransOrderId: midtransOrderId,
        timestamp: now,
        status: "settlement",
        note: `Online payment via ${paymentType || 'Midtrans'}`,
      });

      // Add status history entries
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({ 
        status: 'payment_received', 
        timestamp: now, 
        label: `Payment received via ${paymentType || 'Midtrans'}` 
      });
      order.statusHistory.push({ 
        status: 'confirmed', 
        timestamp: now, 
        label: 'Order auto-confirmed (payment received)' 
      });

    } else if (transactionStatus === 'pending') {
      console.log(`⏳ [MIDTRANS-WEBHOOK] Payment PENDING for order ${order.id}`);
      order.paymentStatus = "pending";
      
    } else if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
      console.log(`❌ [MIDTRANS-WEBHOOK] Payment ${transactionStatus.toUpperCase()} for order ${order.id}`);
      order.paymentStatus = "unpaid";
      
      // Add to payment history for tracking
      order.paymentHistory = order.paymentHistory || [];
      order.paymentHistory.push({
        method: paymentType || "midtrans",
        amount: 0,
        transactionId: transactionId,
        midtransOrderId: midtransOrderId,
        timestamp: now,
        status: transactionStatus,
        note: `Payment ${transactionStatus}`,
      });
    }

    order.updatedAt = now;
    await kvSetWithRetry(`order:${order.id}`, order);

    console.log(`✅ [MIDTRANS-WEBHOOK] Order ${order.id} updated: status=${order.status}, paymentStatus=${order.paymentStatus}`);

    // Return 200 to acknowledge receipt (Midtrans requires this)
    return c.json({ received: true });
  } catch (error) {
    console.log(`❌ [MIDTRANS-WEBHOOK] Error: ${error}`);
    console.log(`❌ [MIDTRANS-WEBHOOK] Stack: ${error?.stack}`);
    // Still return 200 to prevent Midtrans from retrying endlessly
    return c.json({ received: true, error: error?.message });
  }
});

// GET /payment-status/:orderId — Frontend polls for payment status
app.get("/make-server-e5e192fb/payment-status/:orderId", async (c) => {
  try {
    const orderId = c.req.param('orderId');
    console.log(`🔍 [PAYMENT-STATUS] Checking payment status for: ${orderId}`);

    const order = await kvGetWithRetry(`order:${orderId}`);
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    return c.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus || "unpaid",
      paymentMethod: order.paymentMethod || "cash",
      paymentReceived: order.paymentReceived || false,
      paidAmount: order.paidAmount || 0,
      total: order.total,
      snapToken: order.snapToken, // For retry payment
    });
  } catch (error) {
    console.log(`❌ [PAYMENT-STATUS] Error: ${error}`);
    return c.json({ error: `Failed to get payment status: ${error?.message}` }, 500);
  }
});

// POST /confirm-payment-frontend — Frontend calls after Snap popup returns success
// This ensures order is marked paid+confirmed immediately (webhook may have latency)
app.post("/make-server-e5e192fb/confirm-payment-frontend", async (c) => {
  try {
    const { orderId, transactionData } = await c.req.json();
    console.log(`💳 [CONFIRM-PAYMENT-FE] Confirming payment for order: ${orderId}`);
    console.log(`💳 [CONFIRM-PAYMENT-FE] Transaction data:`, JSON.stringify(transactionData, null, 2));

    if (!orderId) {
      return c.json({ error: "orderId is required" }, 400);
    }

    const order = await kvGetWithRetry(`order:${orderId}`);
    if (!order) {
      console.log(`❌ [CONFIRM-PAYMENT-FE] Order not found: ${orderId}`);
      return c.json({ error: "Order not found" }, 404);
    }

    // Already paid? Skip
    if (order.paymentStatus === "paid") {
      console.log(`ℹ️ [CONFIRM-PAYMENT-FE] Order already paid: ${orderId}`);
      return c.json({ success: true, message: "Already paid", order });
    }

    const now = new Date().toISOString();

    // Mark as paid + confirmed
    order.paymentStatus = "paid";
    order.paymentReceived = true;
    order.paidAmount = order.total || 0;
    order.status = "confirmed";
    order.paymentMethod = "midtrans";

    // Add to payment history
    order.paymentHistory = order.paymentHistory || [];
    order.paymentHistory.push({
      method: transactionData?.payment_type || "midtrans",
      amount: order.total || 0,
      transactionId: transactionData?.transaction_id || "snap-success",
      timestamp: now,
      status: "settlement",
      note: `Online payment confirmed via Snap popup`,
    });

    // Add status history
    order.statusHistory = order.statusHistory || [];
    if (!order.statusHistory.find((h: any) => h.status === 'payment_received')) {
      order.statusHistory.push({ 
        status: 'payment_received', 
        timestamp: now, 
        label: 'Payment received via Midtrans' 
      });
    }
    if (!order.statusHistory.find((h: any) => h.status === 'confirmed')) {
      order.statusHistory.push({ 
        status: 'confirmed', 
        timestamp: now, 
        label: 'Order auto-confirmed (payment received)' 
      });
    }

    order.updatedAt = now;
    await kvSetWithRetry(`order:${orderId}`, order);

    console.log(`✅ [CONFIRM-PAYMENT-FE] Order ${orderId} marked as paid+confirmed`);
    return c.json({ success: true, order });
  } catch (error) {
    console.log(`❌ [CONFIRM-PAYMENT-FE] Error: ${error}`);
    return c.json({ error: `Failed to confirm payment: ${error?.message}` }, 500);
  }
});

// POST /switch-to-cash — Switch an unpaid midtrans order to cash/pay-on-delivery
app.post("/make-server-e5e192fb/switch-to-cash", async (c) => {
  try {
    const { orderId } = await c.req.json();
    console.log(`💰 [SWITCH-TO-CASH] Switching order ${orderId} to cash payment`);

    if (!orderId) {
      return c.json({ error: "orderId is required" }, 400);
    }

    const order = await kvGetWithRetry(`order:${orderId}`);
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    if (order.paymentStatus === "paid") {
      return c.json({ error: "Cannot switch - order is already paid" }, 400);
    }

    const now = new Date().toISOString();

    // Switch to cash payment
    order.paymentMethod = "cash";
    order.paymentStatus = "unpaid";
    order.midtransOrderId = null;
    order.snapToken = null;

    // Switch to cash payment — this makes it a real "placed" order
    order.paymentMethod = "cash";
    order.paymentStatus = "unpaid";
    order.status = "pending";
    order.midtransOrderId = null;
    order.snapToken = null;

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: "payment_method_changed",
      timestamp: now,
      label: "Switched from online payment to Pay on Delivery",
    });

    order.updatedAt = now;
    await kvSetWithRetry(`order:${order.id}`, order);

    console.log(`✅ [SWITCH-TO-CASH] Order ${orderId} switched to cash`);
    return c.json({ success: true, order });
  } catch (error) {
    console.log(`❌ [SWITCH-TO-CASH] Error: ${error}`);
    return c.json({ error: `Failed to switch payment: ${error?.message}` }, 500);
  }
});

// POST /cancel-draft-order — Delete a draft order that was never paid (awaiting_payment)
app.post("/make-server-e5e192fb/cancel-draft-order", async (c) => {
  try {
    const { orderId } = await c.req.json();
    console.log(`🗑️ [CANCEL-DRAFT] Cancelling draft order: ${orderId}`);

    if (!orderId) {
      return c.json({ error: "orderId is required" }, 400);
    }

    const order = await kvGetWithRetry(`order:${orderId}`);
    if (!order) {
      console.log(`ℹ️ [CANCEL-DRAFT] Order not found (already deleted?): ${orderId}`);
      return c.json({ success: true, message: "Order not found or already deleted" });
    }

    // Safety: only delete orders that are still in awaiting_payment state
    if (order.paymentStatus !== "awaiting_payment") {
      console.log(`❌ [CANCEL-DRAFT] Order ${orderId} is not a draft (paymentStatus: ${order.paymentStatus})`);
      return c.json({ error: "Cannot cancel - order is not in draft/awaiting_payment state" }, 400);
    }

    // Remove from user's order list (key is user_orders:userId)
    if (order.userId) {
      try {
        const userOrdersKey = `user_orders:${order.userId}`;
        const userOrders = await kvGetWithRetry(userOrdersKey) || [];
        const updatedOrders = userOrders.filter((id: string) => id !== orderId);
        await kvSetWithRetry(userOrdersKey, updatedOrders);
        console.log(`✅ [CANCEL-DRAFT] Removed from user ${order.userId} orders list`);
      } catch (e) {
        console.log(`⚠️ [CANCEL-DRAFT] Failed to remove from user orders list: ${e}`);
      }
    }
    
    // Remove from guest orders list if applicable
    if (order.guestPhone) {
      try {
        const guestPhoneKey = `guest_orders:${order.guestPhone.replace(/\\D/g, '')}`;
        const guestOrders = await kvGetWithRetry(guestPhoneKey) || [];
        const updatedGuestOrders = guestOrders.filter((id: string) => id !== orderId);
        await kvSetWithRetry(guestPhoneKey, updatedGuestOrders);
        console.log(`✅ [CANCEL-DRAFT] Removed from guest orders list`);
      } catch (e) {
        console.log(`⚠️ [CANCEL-DRAFT] Failed to remove from guest orders list: ${e}`);
      }
    }

    // Delete the order from KV
    await kv.del(`order:${orderId}`);
    console.log(`✅ [CANCEL-DRAFT] Draft order ${orderId} deleted`);

    return c.json({ success: true, message: "Draft order cancelled and deleted" });
  } catch (error) {
    console.log(`❌ [CANCEL-DRAFT] Error: ${error}`);
    return c.json({ error: `Failed to cancel draft order: ${error?.message}` }, 500);
  }
});

// ==================== DELIVERY ZONES ====================

// Haversine formula
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const DEFAULT_DELIVERY_CONFIG = {
  restaurantLocation: { lat: -6.2088, lng: 106.8456 },
  maxDistance: 15,
  zones: [
    { id: "1", name: "Nearby", minKm: 0, maxKm: 3, fee: 8000 },
    { id: "2", name: "Medium", minKm: 3, maxKm: 7, fee: 15000 },
    { id: "3", name: "Far", minKm: 7, maxKm: 12, fee: 25000 },
    { id: "4", name: "Very Far", minKm: 12, maxKm: 15, fee: 40000 },
  ],
};

// Get delivery zones config (public)
app.get("/make-server-e5e192fb/delivery-zones", async (c) => {
  try {
    const config = await kvGetWithRetry("delivery_zones_config") || DEFAULT_DELIVERY_CONFIG;
    return c.json(config);
  } catch (error) {
    console.error("Get delivery zones error:", error);
    return c.json(DEFAULT_DELIVERY_CONFIG);
  }
});

// Update delivery zones config (admin only)
app.put("/make-server-e5e192fb/admin/delivery-zones", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const adminCheck = await verifyAdminAccess(token);
    if (!adminCheck?.isAdmin) {
      return c.json({ error: "Admin access required" }, 401);
    }

    const config = await c.req.json();
    
    // Validate
    if (!config.restaurantLocation?.lat || !config.restaurantLocation?.lng) {
      return c.json({ error: "Restaurant location (lat/lng) is required" }, 400);
    }
    if (!config.maxDistance || config.maxDistance <= 0) {
      return c.json({ error: "Max distance must be positive" }, 400);
    }
    if (!config.zones || !Array.isArray(config.zones) || config.zones.length === 0) {
      return c.json({ error: "At least one delivery zone is required" }, 400);
    }

    await kvSetWithRetry("delivery_zones_config", config);
    console.log(`✅ Delivery zones config updated: ${config.zones.length} zones, max ${config.maxDistance}km`);
    
    return c.json({ success: true, config });
  } catch (error) {
    console.error("Update delivery zones error:", error);
    return c.json({ error: `Failed to update delivery zones: ${error?.message}` }, 500);
  }
});

// Calculate delivery fee from coordinates (public)
app.post("/make-server-e5e192fb/calculate-delivery-fee", async (c) => {
  try {
    const { lat, lng } = await c.req.json();
    
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return c.json({ error: "lat and lng are required as numbers" }, 400);
    }

    const config = await kvGetWithRetry("delivery_zones_config") || DEFAULT_DELIVERY_CONFIG;
    const distance = haversineDistance(
      config.restaurantLocation.lat,
      config.restaurantLocation.lng,
      lat,
      lng
    );
    const distanceKm = parseFloat(distance.toFixed(2));

    if (distanceKm > config.maxDistance) {
      return c.json({
        available: false,
        distance: distanceKm,
        maxDistance: config.maxDistance,
        message: `Delivery not available beyond ${config.maxDistance} km. Your distance: ${distanceKm} km.`,
      });
    }

    // Find matching zone
    const sortedZones = [...config.zones].sort((a: any, b: any) => a.minKm - b.minKm);
    let matchedZone = null;
    for (const zone of sortedZones) {
      if (distanceKm >= zone.minKm && distanceKm < zone.maxKm) {
        matchedZone = zone;
        break;
      }
    }
    // Edge case: exactly at maxKm of last zone
    if (!matchedZone && sortedZones.length > 0) {
      const lastZone = sortedZones[sortedZones.length - 1];
      if (distanceKm <= lastZone.maxKm) {
        matchedZone = lastZone;
      }
    }

    if (!matchedZone) {
      return c.json({
        available: false,
        distance: distanceKm,
        message: `No delivery zone configured for ${distanceKm} km distance.`,
      });
    }

    return c.json({
      available: true,
      distance: distanceKm,
      zone: matchedZone,
      fee: matchedZone.fee,
    });
  } catch (error) {
    console.error("Calculate delivery fee error:", error);
    return c.json({ error: `Failed to calculate delivery fee: ${error?.message}` }, 500);
  }
});

// Search places via Nominatim — returns multiple results for autocomplete
app.get("/make-server-e5e192fb/search-places", async (c) => {
  try {
    const q = c.req.query("q");
    if (!q || q.trim().length < 2) {
      return c.json({ results: [] });
    }

    const query = encodeURIComponent(`${q.trim()}, Jakarta, Indonesia`);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=8&countrycodes=id&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'TikkaNTalk-Restaurant-App/1.0',
        },
      }
    );

    if (!response.ok) {
      console.error(`Nominatim search error: ${response.status}`);
      return c.json({ results: [] });
    }

    const data = await response.json();
    
    const results = (data || []).map((item: any) => {
      const addr = item.address || {};
      let name = item.name || "";
      let subtitle = "";
      
      const parts: string[] = [];
      if (addr.road) parts.push(addr.road);
      if (addr.suburb) parts.push(addr.suburb);
      if (addr.city_district) parts.push(addr.city_district);
      if (addr.city) parts.push(addr.city);
      subtitle = parts.filter((p: string) => p && p !== name).join(", ");
      
      const type = item.type || item.class || "place";
      const typeLabels: Record<string, string> = {
        apartment: "Apartment", apartments: "Apartment", residential: "Residential",
        hotel: "Hotel", mall: "Mall", shop: "Shop", restaurant: "Restaurant",
        cafe: "Cafe", office: "Office", hospital: "Hospital", school: "School",
        university: "University", mosque: "Mosque", church: "Church",
        station: "Station", bus_station: "Bus Station", park: "Park",
        building: "Building", house: "House", suburb: "Area", village: "Village",
        neighbourhood: "Neighborhood", administrative: "District", city: "City",
        road: "Street", highway: "Road", tertiary: "Street", secondary: "Street",
        primary: "Road", bank: "Bank", marketplace: "Market", supermarket: "Supermarket",
        fuel: "Gas Station", pharmacy: "Pharmacy", clinic: "Clinic",
        cinema: "Cinema", museum: "Museum", library: "Library",
      };
      
      const typeLabel = typeLabels[type] || (item.class === "building" ? "Building" : 
                         item.class === "amenity" ? "Place" : 
                         item.class === "shop" ? "Shop" :
                         item.class === "tourism" ? "Tourism" :
                         item.class === "highway" ? "Street" : "Place");

      return {
        id: item.place_id?.toString() || `${item.lat}-${item.lon}`,
        name: name || subtitle.split(",")[0] || item.display_name?.split(",")[0] || "Unknown",
        subtitle: subtitle || item.display_name || "",
        fullAddress: item.display_name || "",
        type: typeLabel,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      };
    });

    return c.json({ results });
  } catch (error) {
    console.error(`Search places error: ${error?.message}`);
    return c.json({ results: [] });
  }
});

// Geocode address via Nominatim (public)
app.post("/make-server-e5e192fb/geocode-address", async (c) => {
  try {
    const { address } = await c.req.json();
    
    if (!address || typeof address !== 'string') {
      return c.json({ error: "Address string is required" }, 400);
    }

    // Call Nominatim (OpenStreetMap) geocoding API
    const query = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=id`,
      {
        headers: {
          'User-Agent': 'TikkaNTalk-Restaurant-App/1.0',
        },
      }
    );

    if (!response.ok) {
      console.error(`Nominatim API error: ${response.status}`);
      return c.json({ error: "Geocoding service temporarily unavailable" }, 503);
    }

    const results = await response.json();
    
    if (!results || results.length === 0) {
      return c.json({
        found: false,
        message: "Could not find coordinates for this address. Try using GPS or selecting an area.",
      });
    }

    const result = results[0];
    return c.json({
      found: true,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name,
    });
  } catch (error) {
    console.error("Geocode address error:", error);
    return c.json({ error: `Geocoding failed: ${error?.message}` }, 500);
  }
});

// Reverse geocode lat/lng to human-readable address via Nominatim (public)
app.post("/make-server-e5e192fb/reverse-geocode", async (c) => {
  try {
    const { lat, lng } = await c.req.json();
    
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return c.json({ error: "lat and lng are required as numbers" }, 400);
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`,
      {
        headers: {
          'User-Agent': 'TikkaNTalk-Restaurant-App/1.0',
        },
      }
    );

    if (!response.ok) {
      console.error(`Nominatim reverse geocode error: ${response.status}`);
      return c.json({ found: false, message: "Reverse geocoding service temporarily unavailable" });
    }

    const result = await response.json();
    
    if (!result || result.error) {
      return c.json({ found: false, message: "Could not resolve this location to an address." });
    }

    // Build a clean, short address from the address components
    const addr = result.address || {};
    const parts: string[] = [];
    
    // Building / house / amenity
    if (addr.building || addr.amenity || addr.shop) {
      parts.push(addr.building || addr.amenity || addr.shop);
    }
    // House number + road
    if (addr.road) {
      const road = addr.house_number ? `${addr.road} No. ${addr.house_number}` : addr.road;
      parts.push(road);
    }
    // Neighbourhood / suburb / village
    if (addr.neighbourhood) parts.push(addr.neighbourhood);
    else if (addr.suburb) parts.push(addr.suburb);
    else if (addr.village) parts.push(addr.village);
    // Sub-district / city district
    if (addr.city_district) parts.push(addr.city_district);
    // City
    if (addr.city || addr.town || addr.municipality) {
      parts.push(addr.city || addr.town || addr.municipality);
    }
    // Postcode
    if (addr.postcode) parts.push(addr.postcode);

    const shortAddress = parts.length > 0 ? parts.join(", ") : result.display_name;

    console.log(`📍 Reverse geocode: (${lat}, ${lng}) -> ${shortAddress}`);

    return c.json({
      found: true,
      address: shortAddress,
      fullAddress: result.display_name,
      components: addr,
    });
  } catch (error) {
    console.error("Reverse geocode error:", error);
    return c.json({ found: false, message: `Reverse geocoding failed: ${error?.message}` });
  }
});

// ==================== SAVED ADDRESSES ====================

// GET saved addresses for a user
app.get("/make-server-e5e192fb/user-addresses", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ error: "userId is required" }, 400);
    }

    const addresses = await kv.get(`user_addresses:${userId}`);
    return c.json({ addresses: addresses || [] });
  } catch (error) {
    console.log(`Error fetching user addresses: ${error?.message}`);
    return c.json({ error: `Failed to fetch addresses: ${error?.message}` }, 500);
  }
});

// POST save a new address
app.post("/make-server-e5e192fb/user-addresses", async (c) => {
  try {
    const { userId, address } = await c.req.json();
    if (!userId || !address) {
      return c.json({ error: "userId and address are required" }, 400);
    }

    const existing = (await kv.get(`user_addresses:${userId}`)) || [];

    const newAddress = {
      id: `addr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      label: address.label || "Home",
      address: address.address || "",
      unitNumber: address.unitNumber || "",
      area: address.area || "",
      lat: address.lat || null,
      lng: address.lng || null,
      createdAt: new Date().toISOString(),
    };

    existing.push(newAddress);

    // Limit to 10 saved addresses per user
    if (existing.length > 10) {
      existing.splice(0, existing.length - 10);
    }

    await kv.set(`user_addresses:${userId}`, existing);
    console.log(`📍 Saved new address for user ${userId}: ${newAddress.label} - ${newAddress.address}`);
    return c.json({ success: true, address: newAddress, addresses: existing });
  } catch (error) {
    console.log(`Error saving address: ${error?.message}`);
    return c.json({ error: `Failed to save address: ${error?.message}` }, 500);
  }
});

// DELETE a saved address
app.delete("/make-server-e5e192fb/user-addresses/:addressId", async (c) => {
  try {
    const addressId = c.req.param("addressId");
    const userId = c.req.query("userId");
    if (!userId || !addressId) {
      return c.json({ error: "userId and addressId are required" }, 400);
    }

    const existing = (await kv.get(`user_addresses:${userId}`)) || [];
    const filtered = existing.filter((a: any) => a.id !== addressId);

    if (filtered.length === existing.length) {
      return c.json({ error: "Address not found" }, 404);
    }

    await kv.set(`user_addresses:${userId}`, filtered);
    console.log(`🗑️ Deleted address ${addressId} for user ${userId}`);
    return c.json({ success: true, addresses: filtered });
  } catch (error) {
    console.log(`Error deleting address: ${error?.message}`);
    return c.json({ error: `Failed to delete address: ${error?.message}` }, 500);
  }
});

// ==================== CELEBRATIONS & PARTY PACKAGES ====================

// ---- CELEBRATION CATEGORIES (Hub Page) ----

const DEFAULT_CELEBRATION_CATEGORIES = [
  {
    id: 1,
    title: "Birthday Party Menu",
    subtitle: "Explore food options for kids and family celebrations",
    buttonText: "View Menu",
    image: "https://images.unsplash.com/photo-1756621716318-9eec89d42715?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxraWRzJTIwYmlydGhkYXklMjBwYXJ0eSUyMGNlbGVicmF0aW9uJTIwZm9vZHxlbnwxfHx8fDE3NzM0NzAwMTd8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    gradientStart: "#FF8C00",
    gradientEnd: "#FF6B00",
    enabled: true,
    displayOrder: 1,
  },
  {
    id: 2,
    title: "Birthday Party Packages",
    subtitle: "Complete party bundles with food, decor, and setup",
    buttonText: "View Packages",
    image: "https://images.unsplash.com/photo-1772683530277-60c2c9ede7ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiaXJ0aGRheSUyMHBhcnR5JTIwZGVjb3JhdGlvbiUyMGJhbGxvb25zJTIwc2V0dXB8ZW58MXx8fHwxNzczNDcwMDE4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    gradientStart: "#E91E63",
    gradientEnd: "#C2185B",
    enabled: true,
    displayOrder: 2,
  },
  {
    id: 3,
    title: "Catering Packages",
    subtitle: "Ideal for gatherings, events and special occasions",
    buttonText: "View Options",
    image: "https://images.unsplash.com/photo-1718114243715-8252d5382319?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxJbmRpYW4lMjBjYXRlcmluZyUyMGJ1ZmZldCUyMGZvb2QlMjBzcHJlYWR8ZW58MXx8fHwxNzczNDcwMDE4fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    gradientStart: "#4CAF50",
    gradientEnd: "#388E3C",
    enabled: true,
    displayOrder: 3,
  },
  {
    id: 4,
    title: "Office Party / Custom Packages",
    subtitle: "Flexible packages for teams, meetings, and custom needs",
    buttonText: "View Details",
    image: "https://images.unsplash.com/photo-1758520144651-47ef3d2b3acf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvZmZpY2UlMjBwYXJ0eSUyMGNlbGVicmF0aW9uJTIwZ3JvdXB8ZW58MXx8fHwxNzczNDcwMDI0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    gradientStart: "#1976D2",
    gradientEnd: "#0D47A1",
    enabled: true,
    displayOrder: 4,
  },
];

// Public: Get celebration categories
app.get("/make-server-e5e192fb/celebration-categories", async (c) => {
  try {
    let data = await kv.get("celebration_categories");
    if (!data) {
      data = { items: DEFAULT_CELEBRATION_CATEGORIES };
      await kv.set("celebration_categories", data);
      console.log("Auto-seeded celebration categories with defaults");
    }
    const items = (data.items || []).filter((cat: any) => cat.enabled !== false);
    items.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return c.json({ items });
  } catch (error) {
    console.log(`Error fetching celebration categories: ${error?.message}`);
    return c.json({ error: `Failed to fetch celebration categories: ${error?.message}` }, 500);
  }
});

// Admin: Get all celebration categories (including disabled)
app.get("/make-server-e5e192fb/admin/celebration-categories", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    let data = await kv.get("celebration_categories");
    if (!data) {
      data = { items: DEFAULT_CELEBRATION_CATEGORIES };
      await kv.set("celebration_categories", data);
    }
    const items = data.items || [];
    items.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return c.json({ items });
  } catch (error) {
    console.log(`Error fetching admin celebration categories: ${error?.message}`);
    return c.json({ error: `Failed to fetch celebration categories: ${error?.message}` }, 500);
  }
});

// Admin: Create celebration category
app.post("/make-server-e5e192fb/admin/celebration-categories", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const body = await c.req.json();
    let data = await kv.get("celebration_categories");
    if (!data) data = { items: [] };
    const items = data.items || [];
    const newId = items.length > 0 ? Math.max(...items.map((i: any) => i.id)) + 1 : 1;
    const newItem = { ...body, id: newId };
    items.push(newItem);
    await kv.set("celebration_categories", { items });
    console.log(`Created celebration category: ${newItem.title}`);
    return c.json({ success: true, item: newItem });
  } catch (error) {
    console.log(`Error creating celebration category: ${error?.message}`);
    return c.json({ error: `Failed to create celebration category: ${error?.message}` }, 500);
  }
});

// Admin: Update celebration category
app.put("/make-server-e5e192fb/admin/celebration-categories/:id", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    let data = await kv.get("celebration_categories");
    if (!data) return c.json({ error: "No categories found" }, 404);
    const items = data.items || [];
    const idx = items.findIndex((i: any) => i.id === id);
    if (idx === -1) return c.json({ error: "Category not found" }, 404);
    items[idx] = { ...items[idx], ...body, id };
    await kv.set("celebration_categories", { items });
    console.log(`Updated celebration category: ${items[idx].title}`);
    return c.json({ success: true, item: items[idx] });
  } catch (error) {
    console.log(`Error updating celebration category: ${error?.message}`);
    return c.json({ error: `Failed to update celebration category: ${error?.message}` }, 500);
  }
});

// Admin: Delete celebration category
app.delete("/make-server-e5e192fb/admin/celebration-categories/:id", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const id = parseInt(c.req.param("id"));
    let data = await kv.get("celebration_categories");
    if (!data) return c.json({ error: "No categories found" }, 404);
    const items = data.items || [];
    const filtered = items.filter((i: any) => i.id !== id);
    if (filtered.length === items.length) return c.json({ error: "Category not found" }, 404);
    await kv.set("celebration_categories", { items: filtered });
    console.log(`Deleted celebration category id: ${id}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting celebration category: ${error?.message}`);
    return c.json({ error: `Failed to delete celebration category: ${error?.message}` }, 500);
  }
});

// Public: Get celebrations hub settings
app.get("/make-server-e5e192fb/celebrations-hub-settings", async (c) => {
  try {
    let settings = await kv.get("celebrations_hub_settings");
    if (!settings) {
      settings = {
        pageTitle: "Choose Your",
        pageTitleHighlight: "Party & Catering Package",
        pageSubtitle: "Select an option for your next event",
        enabled: true,
      };
      await kv.set("celebrations_hub_settings", settings);
    }
    return c.json(settings);
  } catch (error) {
    console.log(`Error fetching celebrations hub settings: ${error?.message}`);
    return c.json({ error: `Failed to fetch settings: ${error?.message}` }, 500);
  }
});

// Admin: Update celebrations hub settings
app.put("/make-server-e5e192fb/admin/celebrations-hub-settings", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const body = await c.req.json();
    await kv.set("celebrations_hub_settings", body);
    console.log("Updated celebrations hub settings");
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error updating celebrations hub settings: ${error?.message}`);
    return c.json({ error: `Failed to update settings: ${error?.message}` }, 500);
  }
});

// ---- PARTY PACKAGES (Per-Category) ----

// Default party packages seed data — covers all 4 celebration categories
const DEFAULT_PARTY_PACKAGES = [
  // ── Category 1: Birthday Party Menu ──
  {
    id: 1,
    categoryId: 1,
    name: "Kids Finger Food Platter",
    price: 1500000,
    priceNote: "serves 20-25 kids",
    description: "Fun-sized bites kids love — perfect for birthday tables",
    features: [
      { emoji: "🍗", text: "Mini chicken nuggets & fish fingers" },
      { emoji: "🍕", text: "Mini pizza slices (cheese & veggie)" },
      { emoji: "🍟", text: "French fries with ketchup dip" },
      { emoji: "🧃", text: "Juice boxes for each child" },
      { emoji: "🍫", text: "Chocolate fountain with fruits" },
    ],
    tierColor: "#FF8C00",
    tierGradient: "linear-gradient(135deg, #FFE0B2 0%, #FF8C00 50%, #E65100 100%)",
    enabled: true,
    displayOrder: 1,
  },
  {
    id: 2,
    categoryId: 1,
    name: "Family Feast Buffet",
    price: 3500000,
    priceNote: "serves 40-50 guests",
    description: "A full Indian spread for the whole family to enjoy",
    features: [
      { emoji: "🍛", text: "Butter Chicken, Dal Makhani, Paneer Tikka" },
      { emoji: "🍚", text: "Jeera Rice & Garlic Naan" },
      { emoji: "🥗", text: "Fresh salad bar with raita" },
      { emoji: "🍰", text: "Gulab Jamun & Ice Cream dessert station" },
      { emoji: "🥤", text: "Soft drinks & lassi bar" },
    ],
    tierColor: "#FF6D00",
    tierGradient: "linear-gradient(135deg, #FFCC80 0%, #FF6D00 50%, #BF360C 100%)",
    enabled: true,
    displayOrder: 2,
  },
  {
    id: 3,
    categoryId: 1,
    name: "Premium Celebration Spread",
    price: 6000000,
    priceNote: "serves 60-80 guests",
    description: "Grand menu for milestone birthdays & big celebrations",
    features: [
      { emoji: "🍢", text: "Live tandoor counter with kebabs & tikka" },
      { emoji: "🍲", text: "5 main courses (veg & non-veg)" },
      { emoji: "🧁", text: "Custom birthday cake (2 kg) included" },
      { emoji: "🍹", text: "Welcome mocktails & refreshments" },
      { emoji: "👨‍🍳", text: "Dedicated chef & service staff" },
    ],
    tierColor: "#E65100",
    tierGradient: "linear-gradient(135deg, #FFB74D 0%, #E65100 50%, #BF360C 100%)",
    enabled: true,
    displayOrder: 3,
  },

  // ── Category 2: Birthday Party Packages ──
  {
    id: 4,
    categoryId: 2,
    name: "Package Silver",
    price: 3500000,
    priceNote: "before tax",
    description: "Perfect starter package for intimate birthday celebrations",
    features: [
      { emoji: "🎈", text: "Standard balloon decoration (100 balloons)" },
      { emoji: "🎂", text: "Basic birthday stage setup" },
      { emoji: "🎤", text: "Karaoke system + microphone" },
      { emoji: "👥", text: "Chairs for up to 50 kids" },
      { emoji: "🎙️", text: "Professional MC to anchor" },
    ],
    tierColor: "#C0C0C0",
    tierGradient: "linear-gradient(135deg, #E8E8E8 0%, #C0C0C0 50%, #A8A8A8 100%)",
    enabled: true,
    displayOrder: 1,
  },
  {
    id: 5,
    categoryId: 2,
    name: "Package Gold",
    price: 5500000,
    priceNote: "before tax",
    description: "Everything in Silver plus premium upgrades",
    features: [
      { emoji: "🎈", text: "Upgraded balloon decoration (200 balloons)" },
      { emoji: "📍", text: "Welcome arch at entrance" },
      { emoji: "🎭", text: "Exclusive birthday stage design" },
      { emoji: "🤹", text: "Acrobat, magician + MC" },
      { emoji: "🍰", text: "Kids buffet with great dessert corner" },
    ],
    tierColor: "#DAA520",
    tierGradient: "linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #B8860B 100%)",
    enabled: true,
    displayOrder: 2,
  },
  {
    id: 6,
    categoryId: 2,
    name: "Package Diamond",
    price: 8500000,
    priceNote: "before tax",
    description: "Everything in Silver + Gold, plus exclusive luxuries",
    features: [
      { emoji: "✨", text: "Exclusive decoration with entrance welcome gate" },
      { emoji: "🪧", text: "Standee banners + 4 for display" },
      { emoji: "💌", text: "Invitation cards for guests" },
      { emoji: "🥤", text: "Welcome drinks served to parents" },
      { emoji: "🎁", text: "Return gifts for kids" },
    ],
    tierColor: "#B9F2FF",
    tierGradient: "linear-gradient(135deg, #E0F7FA 0%, #B9F2FF 50%, #81D4FA 100%)",
    enabled: true,
    displayOrder: 3,
  },
  {
    id: 7,
    categoryId: 2,
    name: "Custom Birthday Package",
    price: 0,
    priceNote: "Contact us for pricing",
    description: "Build your own birthday package — tell us your dream celebration!",
    features: [
      { emoji: "🎯", text: "Fully customizable to your needs" },
      { emoji: "🎨", text: "Themed decoration of your choice" },
      { emoji: "🍽️", text: "Custom catering menu selection" },
      { emoji: "🎭", text: "Choose your own entertainment acts" },
      { emoji: "📞", text: "Dedicated event coordinator" },
    ],
    tierColor: "#E91E63",
    tierGradient: "linear-gradient(135deg, #FCE4EC 0%, #F48FB1 50%, #E91E63 100%)",
    enabled: true,
    displayOrder: 4,
  },

  // ── Category 3: Catering Packages ──
  {
    id: 8,
    categoryId: 3,
    name: "Starter Catering",
    price: 2500000,
    priceNote: "for 30-40 guests",
    description: "Simple yet delicious catering for small gatherings",
    features: [
      { emoji: "🍛", text: "3 main course options (veg + non-veg)" },
      { emoji: "🍚", text: "Steamed rice & fresh naan bread" },
      { emoji: "🥗", text: "Garden salad & condiments" },
      { emoji: "🍮", text: "1 dessert option" },
      { emoji: "🚚", text: "Delivery & basic setup included" },
    ],
    tierColor: "#4CAF50",
    tierGradient: "linear-gradient(135deg, #C8E6C9 0%, #4CAF50 50%, #2E7D32 100%)",
    enabled: true,
    displayOrder: 1,
  },
  {
    id: 9,
    categoryId: 3,
    name: "Grand Catering",
    price: 5000000,
    priceNote: "for 60-80 guests",
    description: "Full-service catering for weddings, receptions & large events",
    features: [
      { emoji: "🍢", text: "Live counter with tandoor kebabs & chaat" },
      { emoji: "🍲", text: "6 main courses with regional specialties" },
      { emoji: "🧁", text: "Dessert station (Gulab Jamun, Kheer, Pastries)" },
      { emoji: "👨‍🍳", text: "Professional chef team on-site" },
      { emoji: "🍽️", text: "Crockery, cutlery & serving staff included" },
    ],
    tierColor: "#2E7D32",
    tierGradient: "linear-gradient(135deg, #A5D6A7 0%, #2E7D32 50%, #1B5E20 100%)",
    enabled: true,
    displayOrder: 2,
  },
  {
    id: 10,
    categoryId: 3,
    name: "Premium Banquet Catering",
    price: 9000000,
    priceNote: "for 100+ guests",
    description: "Luxury banquet experience with premium menu & service",
    features: [
      { emoji: "✨", text: "Welcome drinks & appetizer station" },
      { emoji: "🥘", text: "8+ courses including chef's special" },
      { emoji: "🍰", text: "Custom multi-tier cake & dessert table" },
      { emoji: "🎪", text: "Full event setup with table decorations" },
      { emoji: "👔", text: "Dedicated event manager & premium staff" },
    ],
    tierColor: "#1B5E20",
    tierGradient: "linear-gradient(135deg, #81C784 0%, #388E3C 50%, #1B5E20 100%)",
    enabled: true,
    displayOrder: 3,
  },

  // ── Category 4: Office Party / Custom Packages ──
  {
    id: 11,
    categoryId: 4,
    name: "Team Lunch Package",
    price: 1800000,
    priceNote: "for 15-25 people",
    description: "Quick team lunch with variety — great for office meetings",
    features: [
      { emoji: "🍱", text: "Individual meal boxes with 3 options" },
      { emoji: "🥤", text: "Beverages included (water, juice, soft drinks)" },
      { emoji: "🍪", text: "Cookies & brownies dessert box" },
      { emoji: "📦", text: "Delivered to your office" },
      { emoji: "⏰", text: "On-time delivery guaranteed" },
    ],
    tierColor: "#1976D2",
    tierGradient: "linear-gradient(135deg, #BBDEFB 0%, #1976D2 50%, #0D47A1 100%)",
    enabled: true,
    displayOrder: 1,
  },
  {
    id: 12,
    categoryId: 4,
    name: "Corporate Event Package",
    price: 4500000,
    priceNote: "for 30-50 people",
    description: "Impress clients & colleagues with a premium spread",
    features: [
      { emoji: "🍽️", text: "Buffet setup with 5 main courses" },
      { emoji: "☕", text: "Tea/coffee station with snacks" },
      { emoji: "🎤", text: "PA system & microphone for speeches" },
      { emoji: "🎊", text: "Basic corporate decoration" },
      { emoji: "👨‍🍳", text: "Service staff for 3 hours" },
    ],
    tierColor: "#0D47A1",
    tierGradient: "linear-gradient(135deg, #90CAF9 0%, #1565C0 50%, #0D47A1 100%)",
    enabled: true,
    displayOrder: 2,
  },
  {
    id: 13,
    categoryId: 4,
    name: "Custom Event Package",
    price: 0,
    priceNote: "Contact us for pricing",
    description: "Tell us what you need — we'll create the perfect package",
    features: [
      { emoji: "🎯", text: "Fully tailored to your event type" },
      { emoji: "🏢", text: "Office parties, farewells, annual days" },
      { emoji: "🍽️", text: "Choose your own menu & cuisine" },
      { emoji: "🎨", text: "Custom theme & branding options" },
      { emoji: "📞", text: "Dedicated coordinator assigned" },
    ],
    tierColor: "#283593",
    tierGradient: "linear-gradient(135deg, #C5CAE9 0%, #3F51B5 50%, #1A237E 100%)",
    enabled: true,
    displayOrder: 3,
  },
];

// Helper: ensures packages for all default categories exist in KV
// Handles migration when new categories are added after initial seed
async function ensureAllCategoryPackagesSeeded(existingItems: any[]): Promise<any[]> {
  const defaultCategoryIds = [1, 2, 3, 4];
  const existingCategoryIds = new Set(existingItems.map((p: any) => p.categoryId).filter(Boolean));
  const missingCategoryIds = defaultCategoryIds.filter(id => !existingCategoryIds.has(id));

  if (missingCategoryIds.length === 0) return existingItems;

  const maxId = existingItems.length > 0 ? Math.max(...existingItems.map((p: any) => p.id)) : 0;
  let nextId = maxId + 1;

  const newItems = [...existingItems];
  for (const catId of missingCategoryIds) {
    const defaults = DEFAULT_PARTY_PACKAGES.filter((p: any) => p.categoryId === catId);
    for (const def of defaults) {
      newItems.push({ ...def, id: nextId++ });
    }
  }

  await kv.set("party_packages", { items: newItems });
  console.log(`Auto-seeded packages for missing categories: ${missingCategoryIds.join(", ")}`);
  return newItems;
}

// Public: Get party packages (optionally filtered by categoryId)
app.get("/make-server-e5e192fb/party-packages", async (c) => {
  try {
    let packages = await kv.get("party_packages");
    if (!packages) {
      await kv.set("party_packages", { items: DEFAULT_PARTY_PACKAGES });
      packages = { items: DEFAULT_PARTY_PACKAGES };
      console.log("Auto-seeded party packages with defaults");
    } else {
      // Migration: add packages for any new categories that don't have items yet
      packages.items = await ensureAllCategoryPackagesSeeded(packages.items || []);
    }
    let items = (packages.items || []).filter((p: any) => p.enabled !== false);
    const categoryId = c.req.query("categoryId");
    if (categoryId) {
      items = items.filter((p: any) => p.categoryId === parseInt(categoryId));
    }
    items.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return c.json({ items });
  } catch (error) {
    console.log(`Error fetching party packages: ${error?.message}`);
    return c.json({ error: `Failed to fetch party packages: ${error?.message}` }, 500);
  }
});

// Admin: Get all party packages (including disabled)
app.get("/make-server-e5e192fb/admin/party-packages", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    let packages = await kv.get("party_packages");
    if (!packages) {
      await kv.set("party_packages", { items: DEFAULT_PARTY_PACKAGES });
      packages = { items: DEFAULT_PARTY_PACKAGES };
    } else {
      // Migration: add packages for any new categories that don't have items yet
      packages.items = await ensureAllCategoryPackagesSeeded(packages.items || []);
    }
    const items = packages.items || [];
    items.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return c.json({ items });
  } catch (error) {
    console.log(`Error fetching admin party packages: ${error?.message}`);
    return c.json({ error: `Failed to fetch party packages: ${error?.message}` }, 500);
  }
});

// Admin: Create party package
app.post("/make-server-e5e192fb/admin/party-packages", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const body = await c.req.json();
    let packages = await kv.get("party_packages");
    if (!packages) packages = { items: [] };
    const items = packages.items || [];
    const newId = items.length > 0 ? Math.max(...items.map((i: any) => i.id)) + 1 : 1;
    const newItem = { ...body, id: newId };
    items.push(newItem);
    await kv.set("party_packages", { items });
    console.log(`✅ Created party package: ${newItem.name}`);
    return c.json({ success: true, item: newItem });
  } catch (error) {
    console.log(`Error creating party package: ${error?.message}`);
    return c.json({ error: `Failed to create party package: ${error?.message}` }, 500);
  }
});

// Admin: Update party package
app.put("/make-server-e5e192fb/admin/party-packages/:id", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    let packages = await kv.get("party_packages");
    if (!packages) return c.json({ error: "No packages found" }, 404);
    const items = packages.items || [];
    const idx = items.findIndex((i: any) => i.id === id);
    if (idx === -1) return c.json({ error: "Package not found" }, 404);
    items[idx] = { ...items[idx], ...body, id };
    await kv.set("party_packages", { items });
    console.log(`✅ Updated party package: ${items[idx].name}`);
    return c.json({ success: true, item: items[idx] });
  } catch (error) {
    console.log(`Error updating party package: ${error?.message}`);
    return c.json({ error: `Failed to update party package: ${error?.message}` }, 500);
  }
});

// Admin: Delete party package
app.delete("/make-server-e5e192fb/admin/party-packages/:id", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const id = parseInt(c.req.param("id"));
    let packages = await kv.get("party_packages");
    if (!packages) return c.json({ error: "No packages found" }, 404);
    const items = packages.items || [];
    const filtered = items.filter((i: any) => i.id !== id);
    if (filtered.length === items.length) return c.json({ error: "Package not found" }, 404);
    await kv.set("party_packages", { items: filtered });
    console.log(`🗑️ Deleted party package id: ${id}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting party package: ${error?.message}`);
    return c.json({ error: `Failed to delete party package: ${error?.message}` }, 500);
  }
});

// Public: Get party packages page settings
app.get("/make-server-e5e192fb/party-packages-settings", async (c) => {
  try {
    let settings = await kv.get("party_packages_settings");
    if (!settings) {
      settings = {
        pageTitle: "Celebrate Your Special Moments",
        pageSubtitle: "Customizable packages for every occasion",
        bannerImage: "https://images.unsplash.com/photo-1761253298457-d98f628e1b1f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiaXJ0aGRheSUyMHBhcnR5JTIwY2VsZWJyYXRpb24lMjBiYWxsb29ucyUyMGNvbG9yZnVsfGVufDF8fHx8MTc3MzQ2ODg1MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        bookingWhatsAppMessage: "Hi! I'd like to book a party package.",
        enabled: true,
      };
      await kv.set("party_packages_settings", settings);
    }
    return c.json(settings);
  } catch (error) {
    console.log(`Error fetching party packages settings: ${error?.message}`);
    return c.json({ error: `Failed to fetch settings: ${error?.message}` }, 500);
  }
});

// Admin: Update party packages page settings
app.put("/make-server-e5e192fb/admin/party-packages-settings", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const key = await getJwtKey();
    const payload = await verify(authHeader, key);
    if (!payload?.isAdmin) return c.json({ error: "Admin access required" }, 403);

    const body = await c.req.json();
    await kv.set("party_packages_settings", body);
    console.log("✅ Updated party packages settings");
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error updating party packages settings: ${error?.message}`);
    return c.json({ error: `Failed to update settings: ${error?.message}` }, 500);
  }
});

// ==================== HOME LAYOUT CONFIG ====================

// Default home layout categories
const DEFAULT_HOME_LAYOUT = [
  { id: "todays-special", title: "Today's Special", icon: "ChefHat", route: "/todays-special", visible: true, order: 0, countKey: "todaysSpecial", isBuiltIn: true },
  { id: "kids-menu", title: "Kids Menu", icon: "Baby", route: "/kids-menu", visible: true, order: 1, countKey: "kidsMenu", isBuiltIn: true },
  { id: "flash-sale", title: "Flash Sale", icon: "Zap", route: "/flash-sale", visible: true, order: 2, countKey: "flashSale", isBuiltIn: true },
  { id: "regular-menu", title: "Regular Menu", icon: "UtensilsCrossed", route: "/regular-menu", visible: true, order: 3, countKey: "regularMenu", isBuiltIn: true },
  { id: "celebrations", title: "Celebrations", icon: "PartyPopper", route: "/celebrations", visible: true, order: 4, countKey: null, isBuiltIn: true },
];

// Public: Get home layout config (returns only visible categories, sorted by order)
app.get("/make-server-e5e192fb/home-layout", async (c) => {
  try {
    let layout = await kvGetWithRetry("home_layout_config");
    if (!layout || !Array.isArray(layout)) {
      layout = [...DEFAULT_HOME_LAYOUT];
    }
    // Merge with defaults to ensure new built-in categories are always included
    const existingIds = new Set(layout.map((cat: any) => cat.id));
    for (const def of DEFAULT_HOME_LAYOUT) {
      if (!existingIds.has(def.id)) {
        layout.push(def);
      }
    }
    // Return only visible ones, sorted by order
    const visible = layout
      .filter((cat: any) => cat.visible !== false)
      .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999));
    return c.json({ categories: visible });
  } catch (error) {
    console.log(`Error getting home layout: ${error?.message}`);
    return c.json({ categories: DEFAULT_HOME_LAYOUT });
  }
});

// Admin: Get full home layout config (including hidden categories)
app.get("/make-server-e5e192fb/admin/home-layout", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const admin = await verifyAdminAccess(authHeader);
    if (!admin) return c.json({ error: "Admin access required" }, 403);

    let layout = await kvGetWithRetry("home_layout_config");
    if (!layout || !Array.isArray(layout)) {
      layout = [...DEFAULT_HOME_LAYOUT];
    }
    // Merge with defaults
    const existingIds = new Set(layout.map((cat: any) => cat.id));
    for (const def of DEFAULT_HOME_LAYOUT) {
      if (!existingIds.has(def.id)) {
        layout.push(def);
      }
    }
    layout.sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999));
    return c.json({ categories: layout, defaults: DEFAULT_HOME_LAYOUT });
  } catch (error) {
    console.log(`Error getting admin home layout: ${error?.message}`);
    return c.json({ error: `Failed to get layout: ${error?.message}` }, 500);
  }
});

// Admin: Save full home layout config
app.put("/make-server-e5e192fb/admin/home-layout", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const admin = await verifyAdminAccess(authHeader);
    if (!admin) return c.json({ error: "Admin access required" }, 403);

    const { categories } = await c.req.json();
    if (!Array.isArray(categories)) {
      return c.json({ error: "categories must be an array" }, 400);
    }
    for (const cat of categories) {
      if (!cat.id || !cat.title || !cat.icon || !cat.route) {
        return c.json({ error: "Invalid category: missing required fields (id, title, icon, route)" }, 400);
      }
    }
    // Re-assign order based on array index
    const ordered = categories.map((cat: any, idx: number) => ({
      ...cat,
      order: idx,
    }));
    await kv.set("home_layout_config", ordered);
    console.log(`✅ Home layout config updated by admin ${admin.userId} (${ordered.length} categories)`);
    return c.json({ success: true, categories: ordered });
  } catch (error) {
    console.log(`Error updating home layout: ${error?.message}`);
    return c.json({ error: `Failed to update layout: ${error?.message}` }, 500);
  }
});

// Admin: Reset home layout to defaults
app.post("/make-server-e5e192fb/admin/home-layout/reset", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const admin = await verifyAdminAccess(authHeader);
    if (!admin) return c.json({ error: "Admin access required" }, 403);

    await kv.set("home_layout_config", DEFAULT_HOME_LAYOUT);
    console.log(`✅ Home layout config reset to defaults by admin ${admin.userId}`);
    return c.json({ success: true, categories: DEFAULT_HOME_LAYOUT });
  } catch (error) {
    console.log(`Error resetting home layout: ${error?.message}`);
    return c.json({ error: `Failed to reset layout: ${error?.message}` }, 500);
  }
});

// ==================== CUSTOM MENU CATEGORIES (GENERIC) ====================

// Helper: Get KV key for a custom menu slug
function customMenuKey(slug: string): string {
  return `custom_menu_${slug}`;
}

// Public: Get items for a custom menu category (only enabled items)
app.get("/make-server-e5e192fb/custom-menu/:slug", async (c) => {
  try {
    const slug = c.req.param("slug");
    if (!slug || slug.length > 100) {
      return c.json({ error: "Invalid slug" }, 400);
    }
    const data = await kvGetWithRetry(customMenuKey(slug));
    const items = Array.isArray(data?.items) ? data.items : [];
    // Return only enabled items, sorted by displayOrder
    const visibleItems = items
      .filter((item: any) => item.enabled !== false)
      .sort((a: any, b: any) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
    return c.json({ items: visibleItems, slug });
  } catch (error) {
    console.log(`Error fetching custom menu ${c.req.param("slug")}: ${error?.message}`);
    return c.json({ error: `Failed to fetch custom menu: ${error?.message}` }, 500);
  }
});

// Admin: Get ALL items for a custom menu category (including disabled)
app.get("/make-server-e5e192fb/admin/custom-menu/:slug", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const admin = await verifyAdminAccess(authHeader);
    if (!admin) return c.json({ error: "Admin access required" }, 403);

    const slug = c.req.param("slug");
    if (!slug || slug.length > 100) {
      return c.json({ error: "Invalid slug" }, 400);
    }
    const data = await kvGetWithRetry(customMenuKey(slug));
    const items = Array.isArray(data?.items) ? data.items : [];
    items.sort((a: any, b: any) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
    return c.json({ items, slug });
  } catch (error) {
    console.log(`Error fetching admin custom menu ${c.req.param("slug")}: ${error?.message}`);
    return c.json({ error: `Failed to fetch custom menu: ${error?.message}` }, 500);
  }
});

// Admin: Add or update an item in a custom menu category
app.put("/make-server-e5e192fb/admin/custom-menu/:slug/item", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const admin = await verifyAdminAccess(authHeader);
    if (!admin) return c.json({ error: "Admin access required" }, 403);

    const slug = c.req.param("slug");
    if (!slug || slug.length > 100) {
      return c.json({ error: "Invalid slug" }, 400);
    }

    const body = await c.req.json();
    const { item } = body;
    if (!item || !item.name) {
      return c.json({ error: "Item name is required" }, 400);
    }

    const data = await kvGetWithRetry(customMenuKey(slug));
    let items: any[] = Array.isArray(data?.items) ? data.items : [];

    if (item.id) {
      // Update existing item
      const idx = items.findIndex((i: any) => i.id === item.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...item, updatedAt: new Date().toISOString() };
      } else {
        return c.json({ error: "Item not found" }, 404);
      }
    } else {
      // Add new item
      const newItem = {
        id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: item.name,
        description: item.description || "",
        price: Number(item.price) || 0,
        originalPrice: item.originalPrice ? Number(item.originalPrice) : undefined,
        image: item.image || "",
        enabled: item.enabled !== false,
        displayOrder: items.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      items.push(newItem);
    }

    await kvSetWithRetry(customMenuKey(slug), { items });
    console.log(`✅ Custom menu "${slug}" updated by admin ${admin.userId} — now has ${items.length} items`);
    return c.json({ success: true, items });
  } catch (error) {
    console.log(`Error updating custom menu item ${c.req.param("slug")}: ${error?.message}`);
    return c.json({ error: `Failed to update item: ${error?.message}` }, 500);
  }
});

// Admin: Delete an item from a custom menu category
app.delete("/make-server-e5e192fb/admin/custom-menu/:slug/item/:itemId", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const admin = await verifyAdminAccess(authHeader);
    if (!admin) return c.json({ error: "Admin access required" }, 403);

    const slug = c.req.param("slug");
    const itemId = c.req.param("itemId");
    if (!slug || !itemId) {
      return c.json({ error: "Slug and itemId are required" }, 400);
    }

    const data = await kvGetWithRetry(customMenuKey(slug));
    let items: any[] = Array.isArray(data?.items) ? data.items : [];
    const before = items.length;
    items = items.filter((i: any) => i.id !== itemId);
    if (items.length === before) {
      return c.json({ error: "Item not found" }, 404);
    }

    // Reindex display order
    items.forEach((item: any, idx: number) => { item.displayOrder = idx; });
    await kvSetWithRetry(customMenuKey(slug), { items });

    console.log(`✅ Deleted item ${itemId} from custom menu "${slug}" — ${items.length} items remain`);
    return c.json({ success: true, items });
  } catch (error) {
    console.log(`Error deleting custom menu item: ${error?.message}`);
    return c.json({ error: `Failed to delete item: ${error?.message}` }, 500);
  }
});

// Admin: Reorder items in a custom menu category
app.put("/make-server-e5e192fb/admin/custom-menu/:slug/reorder", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const admin = await verifyAdminAccess(authHeader);
    if (!admin) return c.json({ error: "Admin access required" }, 403);

    const slug = c.req.param("slug");
    const body = await c.req.json();
    const { itemIds } = body;
    if (!Array.isArray(itemIds)) {
      return c.json({ error: "itemIds array is required" }, 400);
    }

    const data = await kvGetWithRetry(customMenuKey(slug));
    let items: any[] = Array.isArray(data?.items) ? data.items : [];

    // Reorder: build a map, then reorder based on provided IDs
    const itemMap = new Map(items.map((i: any) => [i.id, i]));
    const reordered: any[] = [];
    for (const id of itemIds) {
      const item = itemMap.get(id);
      if (item) {
        item.displayOrder = reordered.length;
        reordered.push(item);
        itemMap.delete(id);
      }
    }
    // Append any items not in the reorder list (safety)
    for (const item of itemMap.values()) {
      item.displayOrder = reordered.length;
      reordered.push(item);
    }

    await kvSetWithRetry(customMenuKey(slug), { items: reordered });
    console.log(`✅ Reordered custom menu "${slug}" — ${reordered.length} items`);
    return c.json({ success: true, items: reordered });
  } catch (error) {
    console.log(`Error reordering custom menu: ${error?.message}`);
    return c.json({ error: `Failed to reorder: ${error?.message}` }, 500);
  }
});

// Admin: Import items from Regular Menu into a custom menu category
app.post("/make-server-e5e192fb/admin/custom-menu/:slug/import-regular", async (c) => {
  try {
    const authHeader = c.req.header("X-Custom-Auth");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const admin = await verifyAdminAccess(authHeader);
    if (!admin) return c.json({ error: "Admin access required" }, 403);

    const slug = c.req.param("slug");
    if (!slug || slug.length > 100) {
      return c.json({ error: "Invalid slug" }, 400);
    }

    const body = await c.req.json();
    const { itemIds } = body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return c.json({ error: "itemIds array is required and must not be empty" }, 400);
    }

    // Fetch all regular menu items
    const regularItems = await kvGetByPrefixWithRetry("regular_menu:");

    // Filter to only the selected IDs
    const selectedRegular = regularItems.filter((item: any) => itemIds.includes(item.id));
    if (selectedRegular.length === 0) {
      return c.json({ error: "None of the specified items were found in the Regular Menu" }, 404);
    }

    // Get existing custom menu items
    const data = await kvGetWithRetry(customMenuKey(slug));
    let existingItems: any[] = Array.isArray(data?.items) ? data.items : [];

    // Track existing item names (lowercase) to skip duplicates
    const existingNames = new Set(existingItems.map((i: any) => i.name?.toLowerCase()));

    let importedCount = 0;
    let skippedCount = 0;

    for (const regItem of selectedRegular) {
      if (existingNames.has(regItem.name?.toLowerCase())) {
        skippedCount++;
        continue;
      }

      const newItem = {
        id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: regItem.name,
        description: regItem.category ? `From ${regItem.category}` : "",
        price: regItem.price || 0,
        originalPrice: undefined,
        image: regItem.image || "",
        enabled: true,
        displayOrder: existingItems.length,
        sourceMenu: "regular",
        sourceId: regItem.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      existingItems.push(newItem);
      existingNames.add(regItem.name?.toLowerCase());
      importedCount++;
    }

    await kvSetWithRetry(customMenuKey(slug), { items: existingItems });
    console.log(`✅ Imported ${importedCount} items from Regular Menu into custom menu "${slug}" (skipped ${skippedCount} duplicates) — admin ${admin.userId}`);
    return c.json({ success: true, items: existingItems, importedCount, skippedCount });
  } catch (error) {
    console.log(`Error importing regular menu items to custom menu: ${error?.message}`);
    return c.json({ error: `Failed to import: ${error?.message}` }, 500);
  }
});

// ==================== STAFF / ROLE MANAGEMENT ====================
// Roles: superuser, manager, cashier, kitchen, delivery
const VALID_STAFF_ROLES = ['superuser', 'manager', 'cashier', 'kitchen', 'delivery'] as const;
type StaffRole = typeof VALID_STAFF_ROLES[number];

// Helper: Verify staff access from JWT
async function verifyStaffAccess(token: string): Promise<{ userId: string; role: StaffRole; phone: string } | null> {
  const payload = await verifyToken(token);
  if (!payload || !payload.userId || !payload.staffRole) return null;
  const staffData = await kv.get(`staff:${payload.userId}`);
  if (!staffData || !staffData.active) {
    console.log(`❌ Staff access denied - inactive or missing: ${payload.userId}`);
    return null;
  }
  return { userId: payload.userId, role: staffData.role, phone: staffData.phone };
}

// Initialize Super User from ADMIN_PHONE on startup
async function initializeSuperUser() {
  try {
    console.log('🔧 Checking for super user staff record...');
    const allStaff = await kvGetByPrefixWithRetry('staff:');
    const existingSU = allStaff.find((s: any) => s.role === 'superuser' && isAdminPhone(s.phone));
    if (existingSU) { console.log(`✅ Super user already exists: ${existingSU.id}`); return; }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const aNew = phoneToEmail(ADMIN_PHONE);
    const aLeg = `${ADMIN_PHONE_LEGACY}@${SERVER_CONFIG.emailDomain}`;
    const adminUser = users?.find((u: any) => u.email === aNew || u.email === aLeg);
    if (adminUser) {
      await kvSetWithRetry(`staff:${adminUser.id}`, { id: adminUser.id, phone: ADMIN_PHONE, name: 'Super Admin', role: 'superuser', active: true, createdAt: new Date().toISOString() });
      console.log(`✅ Super user staff record created for ${adminUser.id}`);
    } else {
      console.log('⚠️ Admin auth user not found yet, super user will be created on first staff login');
    }
  } catch (error) { console.error('⚠️ Failed to init super user:', truncateError(error)); }
}
setTimeout(() => initializeSuperUser(), 8000);

// Staff Sign In
app.post("/make-server-e5e192fb/staff/signin", async (c) => {
  try {
    const { phone, pin } = await c.req.json();
    console.log(`🔐 STAFF SIGNIN: Starting for phone: ${phone}`);
    if (!phone || !pin) return c.json({ error: "Phone number and PIN are required" }, 400);

    const normalizedPhone = normalizePhoneForStorage(phone);
    const email = phoneToEmail(normalizedPhone);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let { data, error } = await supabase.auth.signInWithPassword({ email, password: pin });

    if (error) {
      const rawDigits = phone.replace(/\D/g, '');
      const legacyEmails = new Set<string>();
      legacyEmails.add(`${rawDigits}@${SERVER_CONFIG.emailDomain}`);
      if (normalizedPhone.startsWith('+62') && rawDigits.startsWith('62')) {
        legacyEmails.add(`${rawDigits.slice(2)}@${SERVER_CONFIG.emailDomain}`);
        legacyEmails.add(`0${rawDigits.slice(2)}@${SERVER_CONFIG.emailDomain}`);
      }
      legacyEmails.delete(email);
      for (const le of legacyEmails) {
        const r = await supabase.auth.signInWithPassword({ email: le, password: pin });
        if (!r.error && r.data?.session) { data = r.data; error = null; break; }
      }
    }

    if (error && isAdminPhone(phone) && pin === ADMIN_PIN) {
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const aNew = phoneToEmail(normalizedPhone);
      const aLeg = `${ADMIN_PHONE_LEGACY}@${SERVER_CONFIG.emailDomain}`;
      const au = users?.find((u: any) => u.email === aNew || u.email === aLeg);
      if (au) {
        await supabase.auth.admin.updateUserById(au.id, { password: ADMIN_PIN });
        const retry = await supabase.auth.signInWithPassword({ email: au.email!, password: ADMIN_PIN });
        if (!retry.error && retry.data?.session) { data = retry.data; error = null; }
      }
    }

    if (error || !data?.user) {
      console.log(`❌ STAFF SIGNIN: Auth failed - ${error?.message}`);
      return c.json({ error: "Invalid phone number or PIN" }, 400);
    }

    const userId = data.user.id;
    let staffData = await kv.get(`staff:${userId}`);

    // Auto-create superuser for ADMIN_PHONE
    if (!staffData && isAdminPhone(normalizedPhone)) {
      staffData = { id: userId, phone: normalizedPhone, name: 'Super Admin', role: 'superuser', active: true, createdAt: new Date().toISOString() };
      await kvSetWithRetry(`staff:${userId}`, staffData);
      console.log(`✅ Auto-created super user staff record for ${userId}`);
    }

    if (!staffData) return c.json({ error: "You are not a staff member. Please use the customer login." }, 403);
    if (!staffData.active) return c.json({ error: "Your staff account has been deactivated. Contact your supervisor." }, 403);

    const staffToken = await signToken({
      userId,
      phone: staffData.phone,
      staffRole: staffData.role,
      isAdmin: staffData.role === 'superuser' || staffData.role === 'manager',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
    });

    console.log(`✅ STAFF SIGNIN: Success - ${staffData.name} (${staffData.role})`);
    return c.json({ success: true, accessToken: staffToken, staff: { id: staffData.id, phone: staffData.phone, name: staffData.name, role: staffData.role } });
  } catch (error) {
    console.log(`❌ STAFF SIGNIN EXCEPTION: ${error}`);
    return c.json({ error: "Staff sign-in failed" }, 500);
  }
});

// Get current staff profile
app.get("/make-server-e5e192fb/staff/me", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const staff = await verifyStaffAccess(token);
    if (!staff) return c.json({ error: "Unauthorized" }, 401);
    const staffData = await kv.get(`staff:${staff.userId}`);
    if (!staffData) return c.json({ error: "Staff not found" }, 404);
    return c.json({ staff: staffData });
  } catch (error) {
    return c.json({ error: `Failed to get staff profile: ${error?.message}` }, 500);
  }
});

// List all staff (superuser only)
app.get("/make-server-e5e192fb/admin/staff", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const staff = await verifyStaffAccess(token);
    if (!staff || staff.role !== 'superuser') return c.json({ error: "Only Super User can manage staff" }, 403);
    const allStaff = await kvGetByPrefixWithRetry('staff:');
    const sorted = allStaff.sort((a: any, b: any) => {
      if (a.role === 'superuser' && b.role !== 'superuser') return -1;
      if (a.role !== 'superuser' && b.role === 'superuser') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return c.json({ staff: sorted });
  } catch (error) {
    return c.json({ error: `Failed to list staff: ${error?.message}` }, 500);
  }
});

// Create staff member (superuser only)
app.post("/make-server-e5e192fb/admin/staff", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const superUser = await verifyStaffAccess(token);
    if (!superUser || superUser.role !== 'superuser') return c.json({ error: "Only Super User can create staff" }, 403);

    const { phone, pin, name, role } = await c.req.json();
    if (!phone || !pin || !name || !role) return c.json({ error: "Phone, PIN, name, and role are required" }, 400);
    if (!isValidPin(pin)) return c.json({ error: "PIN must be exactly 6 digits" }, 400);
    if (!VALID_STAFF_ROLES.includes(role)) return c.json({ error: `Invalid role. Must be one of: ${VALID_STAFF_ROLES.join(', ')}` }, 400);
    if (role === 'superuser') return c.json({ error: "Cannot create another Super User account" }, 400);

    const normalizedPhone = normalizePhoneForStorage(phone);
    const emailAddr = phoneToEmail(normalizedPhone);
    const allStaff = await kvGetByPrefixWithRetry('staff:');
    const phoneDigitsNorm = phoneToDigits(normalizedPhone);
    if (allStaff.find((s: any) => phoneToDigits(s.phone) === phoneDigitsNorm)) {
      return c.json({ error: "A staff member with this phone number already exists" }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { users } } = await supabase.auth.admin.listUsers();
    let authUser = users?.find((u: any) => u.email === emailAddr);

    if (authUser) {
      await supabase.auth.admin.updateUserById(authUser.id, { password: pin });
    } else {
      const { data: cd, error: ce } = await supabase.auth.admin.createUser({
        email: emailAddr, password: pin, user_metadata: { name, phone: normalizedPhone }, email_confirm: true,
      });
      if (ce) return c.json({ error: `Failed to create staff account: ${ce.message}` }, 500);
      authUser = cd.user;
    }

    const staffRecord = { id: authUser!.id, phone: normalizedPhone, name, role, active: true, createdAt: new Date().toISOString() };
    await kvSetWithRetry(`staff:${authUser!.id}`, staffRecord);
    console.log(`✅ Staff created: ${name} (${role}) - ${authUser!.id}`);
    return c.json({ success: true, staff: staffRecord });
  } catch (error) {
    console.log(`❌ Create staff error: ${error?.message}`);
    return c.json({ error: `Failed to create staff: ${error?.message}` }, 500);
  }
});

// Deactivate staff (superuser only)
app.put("/make-server-e5e192fb/admin/staff/:id/deactivate", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const su = await verifyStaffAccess(token);
    if (!su || su.role !== 'superuser') return c.json({ error: "Only Super User can deactivate staff" }, 403);
    const sid = c.req.param('id');
    if (sid === su.userId) return c.json({ error: "Cannot deactivate yourself" }, 400);
    const sd = await kv.get(`staff:${sid}`);
    if (!sd) return c.json({ error: "Staff not found" }, 404);
    if (sd.role === 'superuser') return c.json({ error: "Cannot deactivate a Super User" }, 400);
    await kvSetWithRetry(`staff:${sid}`, { ...sd, active: false, deactivatedAt: new Date().toISOString() });
    console.log(`✅ Staff deactivated: ${sd.name} by ${su.userId}`);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: `Failed to deactivate staff: ${error?.message}` }, 500);
  }
});

// Activate staff (superuser only)
app.put("/make-server-e5e192fb/admin/staff/:id/activate", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const su = await verifyStaffAccess(token);
    if (!su || su.role !== 'superuser') return c.json({ error: "Only Super User can activate staff" }, 403);
    const sid = c.req.param('id');
    const sd = await kv.get(`staff:${sid}`);
    if (!sd) return c.json({ error: "Staff not found" }, 404);
    await kvSetWithRetry(`staff:${sid}`, { ...sd, active: true, deactivatedAt: undefined });
    console.log(`✅ Staff activated: ${sd.name} by ${su.userId}`);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: `Failed to activate staff: ${error?.message}` }, 500);
  }
});

// Delete staff (superuser only)
app.delete("/make-server-e5e192fb/admin/staff/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const su = await verifyStaffAccess(token);
    if (!su || su.role !== 'superuser') return c.json({ error: "Only Super User can delete staff" }, 403);
    const sid = c.req.param('id');
    if (sid === su.userId) return c.json({ error: "Cannot delete yourself" }, 400);
    const sd = await kv.get(`staff:${sid}`);
    if (!sd) return c.json({ error: "Staff not found" }, 404);
    if (sd.role === 'superuser') return c.json({ error: "Cannot delete a Super User" }, 400);
    await kv.del(`staff:${sid}`);
    console.log(`✅ Staff deleted: ${sd.name} by ${su.userId}`);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: `Failed to delete staff: ${error?.message}` }, 500);
  }
});

// ==================== CUSTOM REPORTS ====================

// GET /reports/customer-analytics — aggregated customer analytics report (superuser only)
app.get("/make-server-e5e192fb/reports/customer-analytics", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    // Verify superuser role
    const staffData = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffData || staffData.role !== "superuser") {
      return c.json({ error: "Super User access required" }, 403);
    }

    // Parse query params
    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const search = (c.req.query("search") || "").toLowerCase().trim();
    const startDate = c.req.query("startDate") || "";
    const endDate = c.req.query("endDate") || "";
    const sortBy = c.req.query("sortBy") || "revenue"; // revenue | orders | name

    console.log(`📊 [CRM Report] page=${page} limit=${limit} search="${search}" dates=${startDate}→${endDate} sort=${sortBy}`);

    // Fetch all orders and users with retry
    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    const allUsers = await kvRetry(() => kv.getByPrefix("user:")) || [];

    // Filter out draft/awaiting payment orders and cancelled orders
    const validOrders = rawOrders.filter((o: any) => {
      const order = o.value || o;
      return order.paymentStatus !== "awaiting_payment" && order.status !== "cancelled";
    });

    // Apply date filter on orders
    let filteredOrders = validOrders;
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filteredOrders = filteredOrders.filter((o: any) => new Date(o.createdAt) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filteredOrders = filteredOrders.filter((o: any) => new Date(o.createdAt) <= end);
    }

    // Build user map for quick lookup
    const userMap: Record<string, any> = {};
    allUsers.forEach((u: any) => { userMap[u.id] = u; });

    // Aggregate orders by customer (userId or phone for guest orders)
    const customerAgg: Record<string, {
      userId: string | null;
      name: string;
      phone: string;
      address: string;
      tier: string;
      totalOrders: number;
      totalRevenue: number;
      lastOrderDate: string;
      totalPointsEarned: number;
      points: number;
    }> = {};

    filteredOrders.forEach((order: any) => {
      const key = order.userId || `guest:${order.phone || order.guestPhone || "unknown"}`;
      if (!customerAgg[key]) {
        const user = order.userId ? userMap[order.userId] : null;
        const phone = order.phone || order.guestPhone || user?.phone || "";
        const name = order.customerName || user?.name || order.guestName || "Guest";
        const addr = order.deliveryAddress || order.address || user?.address || "";
        const tier = user?.tier || getUserTier(user?.totalPointsEarned || 0);
        customerAgg[key] = {
          userId: order.userId || null,
          name,
          phone,
          address: addr,
          tier,
          totalOrders: 0,
          totalRevenue: 0,
          lastOrderDate: "",
          totalPointsEarned: user?.totalPointsEarned || 0,
          points: user?.points || 0,
        };
      }
      customerAgg[key].totalOrders += 1;
      customerAgg[key].totalRevenue += (order.total || 0);
      const orderDate = order.createdAt || "";
      if (!customerAgg[key].lastOrderDate || orderDate > customerAgg[key].lastOrderDate) {
        customerAgg[key].lastOrderDate = orderDate;
      }
      // Update address if this order has a more recent one
      if (order.deliveryAddress && order.deliveryAddress.length > 5) {
        customerAgg[key].address = order.deliveryAddress;
      }
    });

    // Convert to array
    let customers = Object.values(customerAgg);

    // Apply search filter
    if (search) {
      customers = customers.filter(cust =>
        cust.name.toLowerCase().includes(search) ||
        cust.phone.toLowerCase().includes(search) ||
        cust.address.toLowerCase().includes(search)
      );
    }

    // Sort
    if (sortBy === "orders") {
      customers.sort((a, b) => b.totalOrders - a.totalOrders);
    } else if (sortBy === "name") {
      customers.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Default: revenue descending
      customers.sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    // Summary stats
    const summaryTotalCustomers = customers.length;
    const summaryTotalOrders = customers.reduce((s, cust) => s + cust.totalOrders, 0);
    const summaryTotalRevenue = customers.reduce((s, cust) => s + cust.totalRevenue, 0);

    // Paginate
    const totalPages = Math.max(1, Math.ceil(customers.length / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (safePage - 1) * limit;
    const pageCustomers = customers.slice(startIdx, startIdx + limit);

    // Add rank (1-based across full list, not just page)
    const rankedCustomers = pageCustomers.map((cust, i) => ({
      ...cust,
      rank: startIdx + i + 1,
    }));

    console.log(`📊 [CRM Report] Found ${summaryTotalCustomers} customers, page ${safePage}/${totalPages}`);

    return c.json({
      customers: rankedCustomers,
      summary: {
        totalCustomers: summaryTotalCustomers,
        totalOrders: summaryTotalOrders,
        totalRevenue: summaryTotalRevenue,
      },
      pagination: {
        page: safePage,
        limit,
        totalPages,
        totalItems: summaryTotalCustomers,
      },
      // For export: send all customers (unpaginated) when export=true
      ...(c.req.query("export") === "true" ? {
        allCustomers: customers.map((cust, i) => ({ ...cust, rank: i + 1 })),
      } : {}),
    });
  } catch (error: any) {
    console.log(`❌ [CRM Report] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate CRM report: ${error?.message}` }, 500);
  }
});

// GET /reports/product-analytics — products sold report (superuser only)
app.get("/make-server-e5e192fb/reports/product-analytics", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    // Verify superuser role
    const staffData = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffData || staffData.role !== "superuser") {
      return c.json({ error: "Super User access required" }, 403);
    }

    // Parse query params
    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const search = (c.req.query("search") || "").toLowerCase().trim();
    const startDate = c.req.query("startDate") || "";
    const endDate = c.req.query("endDate") || "";
    const sortBy = c.req.query("sortBy") || "quantity"; // quantity | revenue | name
    const category = c.req.query("category") || "all";
    const isExport = c.req.query("export") === "true";

    console.log(`📊 [Products Report] page=${page} limit=${limit} search="${search}" dates=${startDate}→${endDate} sort=${sortBy} category=${category}`);

    // Fetch all orders and menu items with retry
    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    const allMenuRegular = await kvRetry(() => kv.getByPrefix("menu:regular:")) || [];
    const allMenuKids = await kvRetry(() => kv.getByPrefix("menu:kids:")) || [];
    const allMenuSpecial = await kvRetry(() => kv.getByPrefix("menu:special:")) || [];

    // Build menu lookup (by id and by name for matching)
    const menuById: Record<string, any> = {};
    const menuByName: Record<string, any> = {};
    const allMenuItems = [...allMenuRegular, ...allMenuKids, ...allMenuSpecial];
    allMenuItems.forEach((item: any) => {
      const menuItem = item.value || item;
      if (menuItem.id) menuById[menuItem.id] = menuItem;
      if (menuItem.name) menuByName[menuItem.name.toLowerCase()] = menuItem;
      if (menuItem.title) menuByName[menuItem.title.toLowerCase()] = menuItem;
    });

    // Extract all unique categories from menu items
    const categoriesSet = new Set<string>();
    allMenuItems.forEach((item: any) => {
      const menuItem = item.value || item;
      if (menuItem.category) categoriesSet.add(menuItem.category);
    });
    const availableCategories = Array.from(categoriesSet).sort();

    // Filter out draft/cancelled orders
    const validOrders = rawOrders.filter((o: any) => {
      const order = o.value || o;
      return order.paymentStatus !== "awaiting_payment" && order.status !== "cancelled";
    });

    // Apply date filter on orders
    let filteredOrders = validOrders;
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filteredOrders = filteredOrders.filter((o: any) => new Date(o.createdAt) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filteredOrders = filteredOrders.filter((o: any) => new Date(o.createdAt) <= end);
    }

    // Aggregate items from orders
    const productAgg: Record<string, {
      itemId: string;
      name: string;
      category: string;
      image: string;
      price: number;
      totalQuantity: number;
      totalRevenue: number;
      orderCount: number;
      lastSoldDate: string;
    }> = {};

    filteredOrders.forEach((order: any) => {
      const items = order.items || [];
      items.forEach((item: any) => {
        const itemName = item.title || item.name || "Unknown Item";
        const itemKey = (item.id || itemName).toString().toLowerCase();
        
        // Try to match with menu item to get category and image
        const menuMatch = (item.id && menuById[item.id]) || menuByName[itemName.toLowerCase()];
        
        if (!productAgg[itemKey]) {
          productAgg[itemKey] = {
            itemId: item.id || itemName,
            name: itemName,
            category: menuMatch?.category || item.category || "Uncategorized",
            image: menuMatch?.image || menuMatch?.imageUrl || item.image || "",
            price: item.price || menuMatch?.price || 0,
            totalQuantity: 0,
            totalRevenue: 0,
            orderCount: 0,
            lastSoldDate: "",
          };
        }
        
        const qty = item.quantity || 1;
        productAgg[itemKey].totalQuantity += qty;
        productAgg[itemKey].totalRevenue += (item.price || 0) * qty;
        productAgg[itemKey].orderCount += 1;
        
        const orderDate = order.createdAt || "";
        if (!productAgg[itemKey].lastSoldDate || orderDate > productAgg[itemKey].lastSoldDate) {
          productAgg[itemKey].lastSoldDate = orderDate;
        }
        
        // Update price to latest if available
        if (item.price) {
          productAgg[itemKey].price = item.price;
        }
      });
    });

    // Convert to array
    let products = Object.values(productAgg);

    // Apply category filter
    if (category && category !== "all") {
      products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }

    // Apply search filter
    if (search) {
      products = products.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
      );
    }

    // Sort
    if (sortBy === "revenue") {
      products.sort((a, b) => b.totalRevenue - a.totalRevenue);
    } else if (sortBy === "name") {
      products.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Default: quantity descending
      products.sort((a, b) => b.totalQuantity - a.totalQuantity);
    }

    // Summary stats
    const summaryTotalProducts = products.length;
    const summaryTotalSold = products.reduce((s, p) => s + p.totalQuantity, 0);
    const summaryTotalRevenue = products.reduce((s, p) => s + p.totalRevenue, 0);
    const summaryTotalOrders = filteredOrders.length;

    // Paginate
    const totalPages = Math.max(1, Math.ceil(products.length / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (safePage - 1) * limit;
    const pageProducts = products.slice(startIdx, startIdx + limit);

    // Add rank
    const rankedProducts = pageProducts.map((p, i) => ({
      ...p,
      rank: startIdx + i + 1,
    }));

    console.log(`📊 [Products Report] Found ${summaryTotalProducts} products, ${summaryTotalSold} sold, page ${safePage}/${totalPages}`);

    return c.json({
      products: rankedProducts,
      summary: {
        totalProducts: summaryTotalProducts,
        totalSold: summaryTotalSold,
        totalRevenue: summaryTotalRevenue,
        totalOrders: summaryTotalOrders,
      },
      categories: availableCategories,
      pagination: {
        page: safePage,
        limit,
        totalPages,
        totalItems: summaryTotalProducts,
      },
      // For export: send all products (unpaginated) when export=true
      ...(isExport ? {
        allProducts: products.map((p, i) => ({ ...p, rank: i + 1 })),
      } : {}),
    });
  } catch (error: any) {
    console.log(`❌ [Products Report] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate Products report: ${error?.message}` }, 500);
  }
});

// GET /reports/customer-churn — customer churn / at-risk report (superuser only)
app.get("/make-server-e5e192fb/reports/customer-churn", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    // Verify superuser role
    const staffData = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffData || staffData.role !== "superuser") {
      return c.json({ error: "Super User access required" }, 403);
    }

    // Parse query params
    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const search = (c.req.query("search") || "").toLowerCase().trim();
    const sortBy = c.req.query("sortBy") || "avgOrderValue"; // avgOrderValue | daysAgo | totalOrders | name
    const minDays = parseInt(c.req.query("minDays") || "30", 10);
    const minOrders = parseInt(c.req.query("minOrders") || "5", 10);
    const riskLevel = c.req.query("riskLevel") || "all"; // all | warning | danger | critical
    const isExport = c.req.query("export") === "true";

    console.log(`📊 [Churn Report] page=${page} limit=${limit} search="${search}" sort=${sortBy} minDays=${minDays} minOrders=${minOrders} risk=${riskLevel}`);

    // Fetch all orders and users with retry
    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    const allUsers = await kvRetry(() => kv.getByPrefix("user:")) || [];

    // Filter valid completed orders (not cancelled, not drafts)
    const validOrders = rawOrders.filter((o: any) => {
      const order = o.value || o;
      return order.paymentStatus !== "awaiting_payment" && order.status !== "cancelled";
    });

    // Build user map
    const userMap: Record<string, any> = {};
    allUsers.forEach((u: any) => { userMap[u.id] = u; });

    // Aggregate orders by customer
    const now = new Date();
    const customerAgg: Record<string, {
      userId: string | null;
      name: string;
      phone: string;
      address: string;
      tier: string;
      totalOrders: number;
      totalRevenue: number;
      lastOrderDate: string;
      firstOrderDate: string;
    }> = {};

    validOrders.forEach((order: any) => {
      const key = order.userId || `guest:${order.phone || order.guestPhone || "unknown"}`;
      if (!customerAgg[key]) {
        const user = order.userId ? userMap[order.userId] : null;
        const phone = order.phone || order.guestPhone || user?.phone || "";
        const name = order.customerName || user?.name || order.guestName || "Guest";
        const addr = order.deliveryAddress || order.address || user?.address || "";
        const tier = user?.tier || getUserTier(user?.totalPointsEarned || 0);
        customerAgg[key] = {
          userId: order.userId || null,
          name,
          phone,
          address: addr,
          tier,
          totalOrders: 0,
          totalRevenue: 0,
          lastOrderDate: "",
          firstOrderDate: "",
        };
      }
      customerAgg[key].totalOrders += 1;
      customerAgg[key].totalRevenue += (order.total || 0);
      const orderDate = order.createdAt || "";
      if (!customerAgg[key].lastOrderDate || orderDate > customerAgg[key].lastOrderDate) {
        customerAgg[key].lastOrderDate = orderDate;
      }
      if (!customerAgg[key].firstOrderDate || orderDate < customerAgg[key].firstOrderDate) {
        customerAgg[key].firstOrderDate = orderDate;
      }
      if (order.deliveryAddress && order.deliveryAddress.length > 5) {
        customerAgg[key].address = order.deliveryAddress;
      }
    });

    // Convert to churn candidates: filter by minOrders and minDays since last order
    let churnCustomers = Object.values(customerAgg)
      .filter(c => c.totalOrders >= minOrders)
      .map(c => {
        const lastDate = c.lastOrderDate ? new Date(c.lastOrderDate) : new Date(0);
        const daysAgo = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        const avgOrderValue = c.totalOrders > 0 ? c.totalRevenue / c.totalOrders : 0;
        const firstDate = c.firstOrderDate ? new Date(c.firstOrderDate) : lastDate;
        const customerLifespanDays = Math.max(1, Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
        // Determine risk level based on days since last order
        let risk: string = "warning";
        if (daysAgo >= 60) risk = "critical";
        else if (daysAgo >= 30) risk = "danger";
        else risk = "warning";
        return {
          ...c,
          daysAgo,
          avgOrderValue: Math.round(avgOrderValue),
          riskLevel: risk,
          customerLifespanDays,
        };
      })
      .filter(c => c.daysAgo >= minDays);

    // Apply risk level filter
    if (riskLevel && riskLevel !== "all") {
      churnCustomers = churnCustomers.filter(c => c.riskLevel === riskLevel);
    }

    // Apply search filter
    if (search) {
      churnCustomers = churnCustomers.filter(c =>
        c.name.toLowerCase().includes(search) ||
        c.phone.toLowerCase().includes(search) ||
        c.address.toLowerCase().includes(search)
      );
    }

    // Sort
    if (sortBy === "daysAgo") {
      churnCustomers.sort((a, b) => b.daysAgo - a.daysAgo);
    } else if (sortBy === "totalOrders") {
      churnCustomers.sort((a, b) => b.totalOrders - a.totalOrders);
    } else if (sortBy === "name") {
      churnCustomers.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Default: avgOrderValue descending
      churnCustomers.sort((a, b) => b.avgOrderValue - a.avgOrderValue);
    }

    // Summary stats
    const summaryAtRisk = churnCustomers.length;
    const summaryLostRevenue = churnCustomers.reduce((s, c) => s + c.totalRevenue, 0);
    const summaryAvgDaysInactive = churnCustomers.length > 0
      ? Math.round(churnCustomers.reduce((s, c) => s + c.daysAgo, 0) / churnCustomers.length)
      : 0;
    const summaryAvgOrderValue = churnCustomers.length > 0
      ? Math.round(churnCustomers.reduce((s, c) => s + c.avgOrderValue, 0) / churnCustomers.length)
      : 0;
    const summaryWarning = churnCustomers.filter(c => c.riskLevel === "warning").length;
    const summaryDanger = churnCustomers.filter(c => c.riskLevel === "danger").length;
    const summaryCritical = churnCustomers.filter(c => c.riskLevel === "critical").length;

    // Paginate
    const totalPages = Math.max(1, Math.ceil(churnCustomers.length / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (safePage - 1) * limit;
    const pageCustomers = churnCustomers.slice(startIdx, startIdx + limit);

    // Add rank
    const rankedCustomers = pageCustomers.map((c, i) => ({
      ...c,
      rank: startIdx + i + 1,
    }));

    console.log(`📊 [Churn Report] Found ${summaryAtRisk} at-risk customers, page ${safePage}/${totalPages}`);

    return c.json({
      customers: rankedCustomers,
      summary: {
        atRiskCustomers: summaryAtRisk,
        lostRevenue: summaryLostRevenue,
        avgDaysInactive: summaryAvgDaysInactive,
        avgOrderValue: summaryAvgOrderValue,
        warningCount: summaryWarning,
        dangerCount: summaryDanger,
        criticalCount: summaryCritical,
      },
      pagination: {
        page: safePage,
        limit,
        totalPages,
        totalItems: summaryAtRisk,
      },
      ...(isExport ? {
        allCustomers: churnCustomers.map((c, i) => ({ ...c, rank: i + 1 })),
      } : {}),
    });
  } catch (error: any) {
    console.log(`❌ [Churn Report] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate Churn report: ${error?.message}` }, 500);
  }
});

// GET /reports/rating-feedback — Low Rating Feedback report (superuser only)
app.get("/make-server-e5e192fb/reports/rating-feedback", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    const staffData = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffData || staffData.role !== "superuser") {
      return c.json({ error: "Super User access required" }, 403);
    }

    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const search = (c.req.query("search") || "").toLowerCase().trim();
    const sortBy = c.req.query("sortBy") || "date";
    const ratingFilter = c.req.query("ratingFilter") || "all";
    const dateFrom = c.req.query("dateFrom") || "";
    const dateTo = c.req.query("dateTo") || "";
    const isExport = c.req.query("export") === "true";

    console.log(`📊 [Rating Report] page=${page} ratingFilter=${ratingFilter} sort=${sortBy} search="${search}"`);

    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    const allUsers = await kvRetry(() => kv.getByPrefix("user:")) || [];

    const userMap: Record<string, any> = {};
    allUsers.forEach((u: any) => { userMap[u.id] = u; });

    let ratedOrders = rawOrders
      .filter((o: any) => o.rating && typeof o.rating === "number")
      .map((order: any) => {
        const user = order.userId ? userMap[order.userId] : null;
        const name = order.customerName || user?.name || order.guestName || "Guest";
        const phone = order.phone || order.guestPhone || user?.phone || "";
        return {
          orderId: order.id || order.orderId || "",
          orderNumber: order.orderNumber || "",
          userId: order.userId || null,
          name,
          phone,
          rating: order.rating,
          comment: order.ratingComment || "",
          ratingAt: order.ratingAt || order.createdAt || "",
          orderDate: order.createdAt || "",
          total: order.total || 0,
          items: (order.items || []).map((i: any) => i.name || i.itemName || "").filter(Boolean),
          status: order.status || "",
          orderType: order.orderType || order.type || "",
        };
      });

    if (ratingFilter === "lt2") {
      ratedOrders = ratedOrders.filter(o => o.rating < 2);
    } else if (ratingFilter === "lt3") {
      ratedOrders = ratedOrders.filter(o => o.rating < 3);
    } else if (ratingFilter === "lt4") {
      ratedOrders = ratedOrders.filter(o => o.rating < 4);
    } else if (["1", "2", "3", "4", "5"].includes(ratingFilter)) {
      ratedOrders = ratedOrders.filter(o => o.rating === parseInt(ratingFilter));
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      ratedOrders = ratedOrders.filter(o => new Date(o.orderDate) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      ratedOrders = ratedOrders.filter(o => new Date(o.orderDate) <= toDate);
    }

    if (search) {
      ratedOrders = ratedOrders.filter(o =>
        o.name.toLowerCase().includes(search) ||
        o.phone.toLowerCase().includes(search) ||
        o.comment.toLowerCase().includes(search) ||
        o.orderId.toLowerCase().includes(search)
      );
    }

    if (sortBy === "rating") {
      ratedOrders.sort((a, b) => a.rating - b.rating);
    } else if (sortBy === "total") {
      ratedOrders.sort((a, b) => b.total - a.total);
    } else if (sortBy === "name") {
      ratedOrders.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      ratedOrders.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
    }

    const totalRated = ratedOrders.length;
    const avgRating = totalRated > 0
      ? Math.round((ratedOrders.reduce((s, o) => s + o.rating, 0) / totalRated) * 10) / 10
      : 0;
    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratedOrders.forEach(o => { if (ratingDist[o.rating] !== undefined) ratingDist[o.rating]++; });
    const withComments = ratedOrders.filter(o => o.comment && o.comment.trim().length > 0).length;

    const totalPages = Math.max(1, Math.ceil(totalRated / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (safePage - 1) * limit;
    const pageOrders = ratedOrders.slice(startIdx, startIdx + limit);
    const rankedOrders = pageOrders.map((o, i) => ({ ...o, rank: startIdx + i + 1 }));

    console.log(`📊 [Rating Report] Found ${totalRated} rated orders, avg ${avgRating}, page ${safePage}/${totalPages}`);

    return c.json({
      orders: rankedOrders,
      summary: { totalRated, avgRating, ratingDistribution: ratingDist, withComments },
      pagination: { page: safePage, limit, totalPages, totalItems: totalRated },
      ...(isExport ? { allOrders: ratedOrders.map((o, i) => ({ ...o, rank: i + 1 })) } : {}),
    });
  } catch (error: any) {
    console.log(`❌ [Rating Report] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate Rating report: ${error?.message}` }, 500);
  }
});

// GET /reports/customer-trends — Customer Order Trends report (superuser only)
app.get("/make-server-e5e192fb/reports/customer-trends", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    const staffData = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffData || staffData.role !== "superuser") {
      return c.json({ error: "Super User access required" }, 403);
    }

    const topN = parseInt(c.req.query("topN") || "5", 10);
    const period = c.req.query("period") || "30";
    const dateFrom = c.req.query("dateFrom") || "";
    const dateTo = c.req.query("dateTo") || "";
    const search = (c.req.query("search") || "").toLowerCase().trim();

    console.log(`📊 [Trends Report] topN=${topN} period=${period} search="${search}"`);

    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    const allUsers = await kvRetry(() => kv.getByPrefix("user:")) || [];

    const userMap: Record<string, any> = {};
    allUsers.forEach((u: any) => { userMap[u.id] = u; });

    let validOrders = rawOrders.filter((o: any) => {
      return o.paymentStatus !== "awaiting_payment" && o.status !== "cancelled" && o.createdAt;
    });

    const now = new Date();
    if (period !== "custom") {
      const daysBack = parseInt(period, 10) || 30;
      const cutoff = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      validOrders = validOrders.filter(o => new Date(o.createdAt) >= cutoff);
    } else {
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        validOrders = validOrders.filter(o => new Date(o.createdAt) >= fromDate);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        validOrders = validOrders.filter(o => new Date(o.createdAt) <= toDate);
      }
    }

    const customerAgg: Record<string, {
      userId: string | null;
      name: string;
      phone: string;
      totalOrders: number;
      totalRevenue: number;
      orders: { date: string; total: number }[];
    }> = {};

    validOrders.forEach((order: any) => {
      const key = order.userId || `guest:${order.phone || order.guestPhone || "unknown"}`;
      if (!customerAgg[key]) {
        const user = order.userId ? userMap[order.userId] : null;
        const name = order.customerName || user?.name || order.guestName || "Guest";
        const phone = order.phone || order.guestPhone || user?.phone || "";
        customerAgg[key] = { userId: order.userId || null, name, phone, totalOrders: 0, totalRevenue: 0, orders: [] };
      }
      customerAgg[key].totalOrders += 1;
      customerAgg[key].totalRevenue += (order.total || 0);
      customerAgg[key].orders.push({ date: order.createdAt, total: order.total || 0 });
    });

    let customers = Object.values(customerAgg).filter(c => c.totalOrders >= 1);

    if (search) {
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(search) || c.phone.toLowerCase().includes(search)
      );
    }

    customers.sort((a, b) => b.totalOrders - a.totalOrders);
    const topCustomers = customers.slice(0, Math.min(topN, 50));

    const chartData = topCustomers.map((c, i) => {
      const sortedOrders = [...c.orders].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const avgOrderValue = c.totalOrders > 0 ? Math.round(c.totalRevenue / c.totalOrders) : 0;
      return {
        rank: i + 1,
        userId: c.userId,
        name: c.name,
        phone: c.phone,
        totalOrders: c.totalOrders,
        totalRevenue: c.totalRevenue,
        avgOrderValue,
        orders: (() => {
          // Aggregate orders on the same day to avoid duplicate recharts keys
          const dayMap: Record<string, { date: string; total: number }> = {};
          sortedOrders.forEach(o => {
            const dayKey = new Date(o.date).toISOString().slice(0, 10);
            if (!dayMap[dayKey]) {
              dayMap[dayKey] = { date: o.date, total: 0 };
            }
            dayMap[dayKey].total += o.total;
          });
          return Object.entries(dayMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dayKey, v]) => ({
              date: v.date,
              dateLabel: new Date(dayKey + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }),
              total: v.total,
            }));
        })(),
      };
    });

    const totalCustomers = customers.length;
    const totalOrders = validOrders.length;
    const totalRevenue = validOrders.reduce((s: number, o: any) => s + (o.total || 0), 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    console.log(`📊 [Trends Report] Found ${totalCustomers} customers, showing top ${topCustomers.length}`);

    return c.json({
      customers: chartData,
      summary: { totalCustomers, totalOrders, totalRevenue, avgOrderValue },
    });
  } catch (error: any) {
    console.log(`❌ [Trends Report] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate Trends report: ${error?.message}` }, 500);
  }
});

// GET /reports/customer-payment — Customer Payment Report (superuser only)
app.get("/make-server-e5e192fb/reports/customer-payment", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    const staffData = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffData || staffData.role !== "superuser") {
      return c.json({ error: "Super User access required" }, 403);
    }

    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const search = (c.req.query("search") || "").toLowerCase().trim();
    const statusFilter = c.req.query("statusFilter") || "unpaid";
    const dateFrom = c.req.query("dateFrom") || "";
    const dateTo = c.req.query("dateTo") || "";
    const isExport = c.req.query("export") === "true";

    console.log(`📊 [Payment Report] page=${page} limit=${limit} status=${statusFilter} search="${search}"`);

    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    const allUsers = await kvRetry(() => kv.getByPrefix("user:")) || [];

    const userMap: Record<string, any> = {};
    allUsers.forEach((u: any) => { userMap[u.id] = u; });

    let validOrders = rawOrders.filter((o: any) => {
      return o.paymentStatus !== "awaiting_payment" && o.status !== "cancelled" && o.createdAt;
    });

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      validOrders = validOrders.filter((o: any) => new Date(o.createdAt) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      validOrders = validOrders.filter((o: any) => new Date(o.createdAt) <= toDate);
    }

    let rows = validOrders.map((order: any) => {
      const user = order.userId ? userMap[order.userId] : null;
      const name = order.customerName || user?.name || order.guestName || "Guest";
      const phone = order.phone || order.guestPhone || user?.phone || "";
      const effectivePaymentStatus = order.paymentStatus || (order.paymentReceived ? "paid" : "unpaid");
      const paymentMethod = order.paymentMethod || "cash";

      return {
        orderId: order.id,
        orderNumber: order.orderNumber || "",
        name,
        phone,
        total: order.total || 0,
        orderDate: order.createdAt,
        paymentStatus: effectivePaymentStatus,
        paymentMethod,
        paymentReceived: !!order.paymentReceived,
        orderType: order.orderType || "pickup",
      };
    });

    if (statusFilter === "paid") {
      rows = rows.filter((r: any) => r.paymentStatus === "paid");
    } else if (statusFilter === "unpaid") {
      rows = rows.filter((r: any) => r.paymentStatus !== "paid");
    }

    if (search) {
      rows = rows.filter((r: any) =>
        r.name.toLowerCase().includes(search)
        || r.phone.toLowerCase().includes(search)
        || (r.orderNumber || "").toLowerCase().includes(search)
        || r.orderId.toLowerCase().includes(search)
      );
    }

    rows.sort((a: any, b: any) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

    const allValid = rawOrders.filter((o: any) => o.paymentStatus !== "awaiting_payment" && o.status !== "cancelled");
    const totalOrders = allValid.length;
    const totalPaid = allValid.filter((o: any) => (o.paymentStatus || (o.paymentReceived ? "paid" : "unpaid")) === "paid").length;
    const totalUnpaid = totalOrders - totalPaid;
    const totalRevenue = allValid.reduce((s: number, o: any) => s + (o.total || 0), 0);
    const totalUnpaidAmount = allValid
      .filter((o: any) => (o.paymentStatus || (o.paymentReceived ? "paid" : "unpaid")) !== "paid")
      .reduce((s: number, o: any) => s + (o.total || 0), 0);
    const totalPaidAmount = totalRevenue - totalUnpaidAmount;

    const summary = { totalOrders, totalPaid, totalUnpaid, totalRevenue, totalUnpaidAmount, totalPaidAmount };

    const rankedRows = rows.map((r: any, i: number) => ({ ...r, rank: i + 1 }));

    if (isExport) {
      return c.json({ orders: rankedRows, summary, allOrders: rankedRows, pagination: { page: 1, limit: rankedRows.length, totalPages: 1, totalItems: rankedRows.length } });
    }

    const totalItems = rankedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * limit;
    const paged = rankedRows.slice(start, start + limit);

    console.log(`📊 [Payment Report] Found ${totalItems} orders, page ${safePage}/${totalPages}`);

    return c.json({
      orders: paged,
      summary,
      pagination: { page: safePage, limit, totalPages, totalItems },
    });
  } catch (error: any) {
    console.log(`❌ [Payment Report] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate Payment report: ${error?.message}` }, 500);
  }
});

// GET /reports/revenue-breakdown — Revenue Breakdown report (superuser only)
app.get("/make-server-e5e192fb/reports/revenue-breakdown", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const staffData = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffData || staffData.role !== "superuser") return c.json({ error: "Super User access required" }, 403);

    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const search = (c.req.query("search") || "").toLowerCase().trim();
    const groupBy = c.req.query("groupBy") || "paymentMethod";
    const dateFrom = c.req.query("dateFrom") || "";
    const dateTo = c.req.query("dateTo") || "";
    const isExport = c.req.query("export") === "true";

    console.log(`📊 [Revenue Report] groupBy=${groupBy} search="${search}"`);

    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    let validOrders = rawOrders.filter((o: any) => o.paymentStatus !== "awaiting_payment" && o.status !== "cancelled" && o.createdAt);
    if (dateFrom) { const fd = new Date(dateFrom); fd.setHours(0,0,0,0); validOrders = validOrders.filter((o: any) => new Date(o.createdAt) >= fd); }
    if (dateTo) { const td = new Date(dateTo); td.setHours(23,59,59,999); validOrders = validOrders.filter((o: any) => new Date(o.createdAt) <= td); }

    const agg: Record<string, { label: string; orders: number; revenue: number; avgOrder: number; paidCount: number; unpaidCount: number }> = {};
    validOrders.forEach((order: any) => {
      let key = "";
      if (groupBy === "paymentMethod") { key = order.paymentMethod || "cash"; }
      else if (groupBy === "orderType") { key = order.orderType || order.deliveryMethod || "pickup"; }
      else if (groupBy === "category") {
        const items = order.items || []; const cats = new Set<string>();
        items.forEach((item: any) => { cats.add(item.category || "Uncategorized"); });
        if (cats.size === 0) cats.add("Uncategorized");
        const perCat = (order.total || 0) / cats.size;
        const ps = order.paymentStatus || (order.paymentReceived ? "paid" : "unpaid");
        cats.forEach(cat => {
          if (!agg[cat]) agg[cat] = { label: cat, orders: 0, revenue: 0, avgOrder: 0, paidCount: 0, unpaidCount: 0 };
          agg[cat].orders += 1; agg[cat].revenue += perCat;
          if (ps === "paid") agg[cat].paidCount += 1; else agg[cat].unpaidCount += 1;
        });
        return;
      }
      if (!key) key = "unknown";
      if (!agg[key]) agg[key] = { label: key, orders: 0, revenue: 0, avgOrder: 0, paidCount: 0, unpaidCount: 0 };
      agg[key].orders += 1; agg[key].revenue += (order.total || 0);
      const ps = order.paymentStatus || (order.paymentReceived ? "paid" : "unpaid");
      if (ps === "paid") agg[key].paidCount += 1; else agg[key].unpaidCount += 1;
    });

    let rows = Object.values(agg).map(r => ({ ...r, avgOrder: r.orders > 0 ? Math.round(r.revenue / r.orders) : 0 }));
    rows.sort((a, b) => b.revenue - a.revenue);
    if (search) rows = rows.filter(r => r.label.toLowerCase().includes(search));
    const rankedRows = rows.map((r, i) => ({ ...r, rank: i + 1 }));

    const totalRevenue = validOrders.reduce((s: number, o: any) => s + (o.total || 0), 0);
    const totalOrders = validOrders.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const topGroup = rankedRows.length > 0 ? rankedRows[0].label : "-";
    const summary = { totalRevenue, totalOrders, avgOrderValue, topGroup, groupCount: rankedRows.length };

    if (isExport) return c.json({ rows: rankedRows, summary, allRows: rankedRows, pagination: { page: 1, limit: rankedRows.length, totalPages: 1, totalItems: rankedRows.length } });

    const totalItems = rankedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const paged = rankedRows.slice((safePage - 1) * limit, (safePage - 1) * limit + limit);
    return c.json({ rows: paged, summary, pagination: { page: safePage, limit, totalPages, totalItems } });
  } catch (error: any) {
    console.log(`❌ [Revenue Report] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate Revenue report: ${error?.message}` }, 500);
  }
});

// GET /reports/staff-performance — Staff Performance report (superuser only)
app.get("/make-server-e5e192fb/reports/staff-performance", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const staffCheck = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffCheck || staffCheck.role !== "superuser") return c.json({ error: "Super User access required" }, 403);

    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const search = (c.req.query("search") || "").toLowerCase().trim();
    const dateFrom = c.req.query("dateFrom") || "";
    const dateTo = c.req.query("dateTo") || "";
    const isExport = c.req.query("export") === "true";

    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    const allStaffList = await kvRetry(() => kv.getByPrefix("staff:")) || [];

    let validOrders = rawOrders.filter((o: any) => o.paymentStatus !== "awaiting_payment" && o.createdAt);
    if (dateFrom) { const fd = new Date(dateFrom); fd.setHours(0,0,0,0); validOrders = validOrders.filter((o: any) => new Date(o.createdAt) >= fd); }
    if (dateTo) { const td = new Date(dateTo); td.setHours(23,59,59,999); validOrders = validOrders.filter((o: any) => new Date(o.createdAt) <= td); }

    const staffAgg: Record<string, { staffId: string; name: string; role: string; phone: string; ordersHandled: number; statusChanges: number; totalRevenueHandled: number; avgHandlingTimeMinutes: number; handlingTimes: number[]; cancellations: number; deliveries: number; payments: number; }> = {};

    validOrders.forEach((order: any) => {
      const history = order.statusHistory || [];
      const orderCreatedAt = new Date(order.createdAt).getTime();
      const staffNames = new Set<string>();

      history.forEach((entry: any) => {
        if (!entry.actor || !entry.actor.name || entry.actor.role === "customer" || entry.actor.role === "system") return;
        const actorName = entry.actor.name;
        const matchingStaff = allStaffList.find((s: any) => s.name === actorName);
        if (!staffAgg[actorName]) {
          staffAgg[actorName] = { staffId: matchingStaff?.id || "unknown", name: actorName, role: matchingStaff?.role || entry.actor.role || "staff", phone: matchingStaff?.phone || "", ordersHandled: 0, statusChanges: 0, totalRevenueHandled: 0, avgHandlingTimeMinutes: 0, handlingTimes: [], cancellations: 0, deliveries: 0, payments: 0 };
        }
        staffAgg[actorName].statusChanges += 1;
        if (entry.status === "cancelled") staffAgg[actorName].cancellations += 1;
        if (entry.status === "delivered" || entry.status === "out_for_delivery") staffAgg[actorName].deliveries += 1;
        if (entry.status === "payment_received") staffAgg[actorName].payments += 1;
        if (entry.timestamp) {
          const diffMins = Math.round((new Date(entry.timestamp).getTime() - orderCreatedAt) / 60000);
          if (diffMins >= 0 && diffMins < 1440) staffAgg[actorName].handlingTimes.push(diffMins);
        }
        staffNames.add(actorName);
      });
      staffNames.forEach(name => { if (staffAgg[name]) { staffAgg[name].ordersHandled += 1; staffAgg[name].totalRevenueHandled += (order.total || 0); } });
    });

    let rows = Object.values(staffAgg).map(s => {
      const avgTime = s.handlingTimes.length > 0 ? Math.round(s.handlingTimes.reduce((a, b) => a + b, 0) / s.handlingTimes.length) : 0;
      return { ...s, avgHandlingTimeMinutes: avgTime, handlingTimes: undefined };
    });
    rows.sort((a, b) => b.ordersHandled - a.ordersHandled);
    if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search) || r.role.toLowerCase().includes(search) || r.phone.includes(search));
    const rankedRows = rows.map((r, i) => ({ ...r, rank: i + 1 }));

    const totalStaff = rankedRows.length;
    const totalStatusChanges = rankedRows.reduce((s, r) => s + r.statusChanges, 0);
    const totalOrdersHandled = rankedRows.reduce((s, r) => s + r.ordersHandled, 0);
    const topPerformer = rankedRows.length > 0 ? rankedRows[0].name : "-";
    const summary = { totalStaff, totalStatusChanges, totalOrdersHandled, topPerformer };

    if (isExport) return c.json({ staff: rankedRows, summary, allStaff: rankedRows, pagination: { page: 1, limit: rankedRows.length, totalPages: 1, totalItems: rankedRows.length } });

    const totalItems = rankedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const paged = rankedRows.slice((safePage - 1) * limit, (safePage - 1) * limit + limit);
    return c.json({ staff: paged, summary, pagination: { page: safePage, limit, totalPages, totalItems } });
  } catch (error: any) {
    console.log(`❌ [Staff Report] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate Staff report: ${error?.message}` }, 500);
  }
});

// GET /reports/daily-summary — Daily Summary report (superuser only)
app.get("/make-server-e5e192fb/reports/daily-summary", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const staffCheck2 = await kv.get(`staff:${adminAuth.userId}`);
    if (!staffCheck2 || staffCheck2.role !== "superuser") return c.json({ error: "Super User access required" }, 403);

    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const search = (c.req.query("search") || "").toLowerCase().trim();
    const dateFrom = c.req.query("dateFrom") || "";
    const dateTo = c.req.query("dateTo") || "";
    const isExport = c.req.query("export") === "true";

    const rawOrders = await kvRetry(() => kv.getByPrefix("order:")) || [];
    let validOrders = rawOrders.filter((o: any) => o.paymentStatus !== "awaiting_payment" && o.status !== "cancelled" && o.createdAt);
    if (dateFrom) { const fd = new Date(dateFrom); fd.setHours(0,0,0,0); validOrders = validOrders.filter((o: any) => new Date(o.createdAt) >= fd); }
    if (dateTo) { const td = new Date(dateTo); td.setHours(23,59,59,999); validOrders = validOrders.filter((o: any) => new Date(o.createdAt) <= td); }

    const dayAgg: Record<string, { date: string; totalOrders: number; totalRevenue: number; paidOrders: number; unpaidOrders: number; paidAmount: number; unpaidAmount: number; deliveryOrders: number; pickupOrders: number; uniqueCustomers: Set<string>; itemsSold: number; itemCounts: Record<string, number>; hourCounts: Record<number, number>; }> = {};

    validOrders.forEach((order: any) => {
      const d = new Date(order.createdAt);
      const dayKey = d.toISOString().slice(0, 10);
      if (!dayAgg[dayKey]) dayAgg[dayKey] = { date: dayKey, totalOrders: 0, totalRevenue: 0, paidOrders: 0, unpaidOrders: 0, paidAmount: 0, unpaidAmount: 0, deliveryOrders: 0, pickupOrders: 0, uniqueCustomers: new Set(), itemsSold: 0, itemCounts: {}, hourCounts: {} };
      const day = dayAgg[dayKey];
      day.totalOrders += 1; day.totalRevenue += (order.total || 0);
      const ps = order.paymentStatus || (order.paymentReceived ? "paid" : "unpaid");
      if (ps === "paid") { day.paidOrders += 1; day.paidAmount += (order.total || 0); } else { day.unpaidOrders += 1; day.unpaidAmount += (order.total || 0); }
      const ot = order.orderType || order.deliveryMethod || "pickup";
      if (ot === "delivery") day.deliveryOrders += 1; else day.pickupOrders += 1;
      day.uniqueCustomers.add(order.userId || order.phone || order.guestPhone || "guest");
      (order.items || []).forEach((item: any) => { const qty = item.quantity || 1; day.itemsSold += qty; const n = item.name || "Unknown"; day.itemCounts[n] = (day.itemCounts[n] || 0) + qty; });
      day.hourCounts[d.getHours()] = (day.hourCounts[d.getHours()] || 0) + 1;
    });

    let rows = Object.values(dayAgg).map(day => {
      let topItem = "-"; let topItemCount = 0;
      Object.entries(day.itemCounts).forEach(([name, count]) => { if (count > topItemCount) { topItem = name; topItemCount = count; } });
      let peakHour = 0; let peakHourCount = 0;
      Object.entries(day.hourCounts).forEach(([h, count]) => { if (count > peakHourCount) { peakHour = parseInt(h); peakHourCount = count; } });
      const dateObj = new Date(day.date + "T00:00:00");
      return {
        date: day.date,
        dateLabel: dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
        dayOfWeek: dateObj.toLocaleDateString("en-US", { weekday: "long" }),
        totalOrders: day.totalOrders, totalRevenue: Math.round(day.totalRevenue),
        avgOrder: day.totalOrders > 0 ? Math.round(day.totalRevenue / day.totalOrders) : 0,
        paidOrders: day.paidOrders, unpaidOrders: day.unpaidOrders,
        paidAmount: Math.round(day.paidAmount), unpaidAmount: Math.round(day.unpaidAmount),
        deliveryOrders: day.deliveryOrders, pickupOrders: day.pickupOrders,
        uniqueCustomers: day.uniqueCustomers.size, itemsSold: day.itemsSold,
        topItem, topItemCount,
        peakHour: `${String(peakHour).padStart(2, "0")}:00`, peakHourOrders: peakHourCount,
      };
    });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    if (search) rows = rows.filter(r => r.dateLabel.toLowerCase().includes(search) || r.dayOfWeek.toLowerCase().includes(search) || r.topItem.toLowerCase().includes(search));
    const rankedRows = rows.map((r, i) => ({ ...r, rank: i + 1 }));

    const totalDays = rankedRows.length;
    const grandTotalRevenue = rankedRows.reduce((s, r) => s + r.totalRevenue, 0);
    const grandTotalOrders = rankedRows.reduce((s, r) => s + r.totalOrders, 0);
    const avgDailyRevenue = totalDays > 0 ? Math.round(grandTotalRevenue / totalDays) : 0;
    const avgDailyOrders = totalDays > 0 ? Math.round(grandTotalOrders / totalDays) : 0;
    const bestDay = rankedRows.length > 0 ? [...rankedRows].sort((a, b) => b.totalRevenue - a.totalRevenue)[0] : null;
    const summary = { totalDays, grandTotalRevenue, grandTotalOrders, avgDailyRevenue, avgDailyOrders, bestDayDate: bestDay?.dateLabel || "-", bestDayRevenue: bestDay?.totalRevenue || 0 };

    if (isExport) return c.json({ days: rankedRows, summary, allDays: rankedRows, pagination: { page: 1, limit: rankedRows.length, totalPages: 1, totalItems: rankedRows.length } });

    const totalItems = rankedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const paged = rankedRows.slice((safePage - 1) * limit, (safePage - 1) * limit + limit);
    return c.json({ days: paged, summary, pagination: { page: safePage, limit, totalPages, totalItems } });
  } catch (error: any) {
    console.log(`❌ [Daily Summary] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to generate Daily Summary: ${error?.message}` }, 500);
  }
});

// ==================== ADMIN: MODIFY ORDER (Add/Remove/Edit Items & Custom Charges) ====================
app.post("/make-server-e5e192fb/admin/orders/:id/modify", async (c) => {
  try {
    const accessToken = c.req.header('X-Custom-Auth') || c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Check role: only superuser, manager, cashier can modify
    const tokenPayload = await verifyToken(accessToken);
    let actorName = "Admin";
    let actorRole = "admin";
    if (tokenPayload?.staffRole) {
      const staffData = await kv.get(`staff:${tokenPayload.userId}`);
      if (staffData) {
        actorName = staffData.name || "Staff";
        actorRole = staffData.role || "staff";
        if (!['superuser', 'manager', 'cashier'].includes(staffData.role)) {
          return c.json({ error: "Only Super User, Manager, or Cashier can modify orders" }, 403);
        }
      }
    } else if (tokenPayload?.userId) {
      const userData = await kv.get(`user:${tokenPayload.userId}`);
      if (userData) {
        actorName = userData.name || "Admin";
        actorRole = userData.isAdmin ? "admin" : "user";
      }
    }
    const actor = { name: actorName, role: actorRole };

    const orderId = c.req.param('id');
    const { items, customCharges, removedItems, modifiedItems, addedItems } = await c.req.json();

    const order = await kvRetry(() => kv.get(`order:${orderId}`));
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    if (order.status === 'closed' || order.status === 'cancelled') {
      return c.json({ error: `Cannot modify a ${order.status} order` }, 400);
    }

    const now = new Date().toISOString();
    if (!order.statusHistory) order.statusHistory = [];
    if (!order.modificationHistory) order.modificationHistory = [];

    const oldTotal = order.total || 0;

    // Update items array (full replacement from frontend)
    if (items && Array.isArray(items)) {
      order.items = items;
    }

    // Update custom charges
    if (customCharges && Array.isArray(customCharges)) {
      order.customCharges = customCharges;
    }

    // Recalculate totals
    const newSubtotal = (order.items || []).reduce((sum: number, item: any) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);

    const chargesTotal = (order.customCharges || []).reduce((sum: number, ch: any) => {
      return sum + (ch.amount || 0);
    }, 0);

    const taxRate = order.taxRate || (order.subtotal > 0 ? ((order.tax || 0) / order.subtotal) * 100 : 0);
    const newTax = Math.round(newSubtotal * (taxRate / 100));
    const promoDiscount = order.promoDiscount || 0;
    const deliveryFee = order.deliveryFee || 0;
    const newTotal = Math.round(newSubtotal - promoDiscount + newTax + deliveryFee + chargesTotal);

    order.subtotal = newSubtotal;
    order.tax = newTax;
    order.total = newTotal;

    // Update itemTitle
    const itemNames = (order.items || []).map((item: any) => {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      return `${item.title || item.name}${qty}`;
    });
    if ((order.customCharges || []).length > 0) {
      itemNames.push(`+${order.customCharges.length} charge(s)`);
    }
    order.itemTitle = itemNames.join(', ');

    // Build modification record
    const modRecord: any = {
      id: crypto.randomUUID(),
      timestamp: now,
      actor,
      previousTotal: oldTotal,
      newTotal: newTotal,
      difference: newTotal - oldTotal,
      changes: [],
    };

    if (removedItems && Array.isArray(removedItems)) {
      removedItems.forEach((ri: any) => {
        modRecord.changes.push({ type: 'removed', name: ri.title || ri.name, price: ri.price, quantity: ri.quantity });
      });
    }
    if (addedItems && Array.isArray(addedItems)) {
      addedItems.forEach((ai: any) => {
        modRecord.changes.push({ type: 'added', name: ai.title || ai.name, price: ai.price, quantity: ai.quantity, isCustom: ai.addedByAdmin || false });
      });
    }
    if (modifiedItems && Array.isArray(modifiedItems)) {
      modifiedItems.forEach((mi: any) => {
        modRecord.changes.push({ type: 'modified', name: mi.title || mi.name, details: mi.details || 'Quantity or price changed' });
      });
    }

    order.modificationHistory.push(modRecord);

    // Add timeline entry
    const diffAmt = newTotal - oldTotal;
    const diffStr = diffAmt > 0
      ? `+Rp ${diffAmt.toLocaleString()}`
      : diffAmt < 0
        ? `-Rp ${Math.abs(diffAmt).toLocaleString()}`
        : 'no change';
    order.statusHistory.push({
      status: 'order_modified',
      timestamp: now,
      label: `Order modified by ${actorName} (${diffStr})`,
      actor,
    });

    // Handle payment impact
    const paidAmount = order.paidAmount || 0;
    if (paidAmount > 0 && newTotal > paidAmount) {
      order.paymentStatus = 'partial';
      order.paymentReceived = false;
      order.remainingBalance = newTotal - paidAmount;
      order.statusHistory.push({
        status: 'payment_adjustment',
        timestamp: now,
        label: `Remaining balance: Rp ${(newTotal - paidAmount).toLocaleString()} (order modified)`,
        actor,
      });
    } else if (paidAmount > 0 && paidAmount >= newTotal) {
      order.paymentStatus = 'paid';
      order.paymentReceived = true;
      order.remainingBalance = 0;
    }

    order.lastModifiedAt = now;
    order.lastModifiedBy = actorName;
    order.updatedAt = now;

    await kvSetWithRetry(`order:${orderId}`, order);

    console.log(`✏️ Order ${orderId} modified by ${actorName}. Old: Rp ${oldTotal}, New: Rp ${newTotal}, Diff: ${diffStr}`);

    // Push modification notification to customer (non-blocking)
    try {
      await pushOrderNotification(order, 'order_modified',
        `Your order has been modified by ${actorName}. Total changed: ${diffStr}. Please check the updated details.`
      );
    } catch (notifErr: any) {
      console.log(`⚠️ Non-critical: modification notification push failed: ${notifErr?.message}`);
    }

    return c.json({
      success: true,
      order,
      modification: modRecord,
      message: `Order modified successfully. Total changed by ${diffStr}.`,
    });
  } catch (error: any) {
    console.log(`❌ [ORDER-MODIFY] Error: ${error?.message}`, error?.stack);
    return c.json({ error: `Failed to modify order: ${error?.message}` }, 500);
  }
});

// ==================== ADMIN: SEARCH MENU ITEMS (for order modification) ====================
app.get("/make-server-e5e192fb/admin/menu-search", async (c) => {
  try {
    const accessToken = c.req.header('X-Custom-Auth') || c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    const query = (c.req.query('q') || '').toLowerCase().trim();

    const [regularItems, specialItems, kidsItems, flashItems] = await Promise.all([
      kvGetByPrefixWithRetry("regular_menu:"),
      kvGetByPrefixWithRetry("todays_special:"),
      kvGetByPrefixWithRetry("kids_menu:"),
      kvGetByPrefixWithRetry("flash_sale:"),
    ]);

    const allItems: any[] = [];

    regularItems.forEach((item: any) => {
      if (item.isAvailable !== false) {
        allItems.push({
          id: item.id,
          title: item.name || item.title,
          price: item.price,
          category: item.category || 'Regular Menu',
          image: item.image,
          source: 'regular',
        });
      }
    });

    specialItems.forEach((item: any) => {
      allItems.push({
        id: `special-${item.id}`,
        title: item.title || item.name,
        price: item.discountedPrice || item.price,
        category: "Today's Special",
        image: item.image,
        source: 'special',
      });
    });

    kidsItems.forEach((item: any) => {
      if (item.available !== false) {
        allItems.push({
          id: `kids-${item.id}`,
          title: item.name || item.title,
          price: item.price,
          category: 'Kids Menu',
          image: item.image,
          source: 'kids',
        });
      }
    });

    flashItems.forEach((item: any) => {
      if (item.active) {
        allItems.push({
          id: `flash-${item.id}`,
          title: item.title || item.name,
          price: item.salePrice || item.price,
          category: 'Flash Sale',
          image: item.image,
          source: 'flash',
        });
      }
    });

    const filtered = query
      ? allItems.filter(item =>
          (item.title || '').toLowerCase().includes(query) ||
          (item.category || '').toLowerCase().includes(query)
        )
      : allItems;

    return c.json({ items: filtered.slice(0, 50), total: filtered.length });
  } catch (error: any) {
    console.log(`❌ [MENU-SEARCH] Error: ${error?.message}`);
    return c.json({ error: `Menu search failed: ${error?.message}` }, 500);
  }
});

// ==================== NOTIFICATION SYSTEM ====================

// ---- Browser Push Notification Helper ----
// web-push is loaded dynamically to prevent server crash if Node.js built-ins aren't available
const VAPID_PUBLIC_KEY = (Deno.env.get('VAPID_PUBLIC_KEY') || '').trim().replace(/^["']+|["']+$/g, '').trim();
const VAPID_PRIVATE_KEY = (Deno.env.get('VAPID_PRIVATE_KEY') || '').trim().replace(/^["']+|["']+$/g, '').trim();

let webPushModule: any = null;
let vapidConfigured = false;

// Lazy-load web-push on first use
async function getWebPush(): Promise<any> {
  if (webPushModule) return webPushModule;
  try {
    const mod = await import("npm:web-push@3.6.7");
    webPushModule = mod.default || mod;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && !vapidConfigured) {
      webPushModule.setVapidDetails(
        'mailto:admin@tikka-n-talk.app',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
      );
      vapidConfigured = true;
      console.log('✅ VAPID keys configured for browser push notifications');
    }
    return webPushModule;
  } catch (err: any) {
    console.log(`⚠️ web-push module failed to load: ${err?.message?.substring(0, 200)}. Browser push disabled.`);
    return null;
  }
}

/**
 * Send browser push notification to all registered devices of a user.
 * Non-blocking — failures are logged but do not throw.
 */
async function sendBrowserPush(userId: string, payload: {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  try {
    const wp = await getWebPush();
    if (!wp || !vapidConfigured) return;

    const subsKey = `push_subs:${userId}`;
    const subscriptions: any[] = (await kvRetry(() => kv.get(subsKey))) || [];
    if (subscriptions.length === 0) return;

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      icon: payload.icon,
      tag: payload.tag || `tikka-${Date.now()}`,
    });

    const failedEndpoints: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        try {
          await wp.sendNotification(sub, pushPayload);
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            failedEndpoints.push(sub.endpoint);
            console.log(`🗑️ Removing expired push subscription for user ${userId}`);
          } else {
            console.log(`⚠️ Browser push failed for user ${userId}: ${err?.message?.substring(0, 120)}`);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (failedEndpoints.length > 0) {
      const cleaned = subscriptions.filter((s: any) => !failedEndpoints.includes(s.endpoint));
      await kvRetry(() => kv.set(subsKey, cleaned));
    }

    console.log(`📲 Browser push sent to ${subscriptions.length - failedEndpoints.length}/${subscriptions.length} device(s) for user ${userId}`);
  } catch (err: any) {
    console.log(`⚠️ sendBrowserPush error for ${userId}: ${err?.message?.substring(0, 150)}`);
  }
}

// ── Staff Push Notifications ──
// Staff push subscriptions use push_subs:staff_<staffId> to avoid collision with customer IDs.
// This helper sends browser push to all active staff matching given roles.
type StaffRole = 'superuser' | 'manager' | 'cashier' | 'kitchen' | 'delivery';

async function notifyStaffByRole(roles: StaffRole[], payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  try {
    const allStaff: any[] = await kvRetry(() => kv.getByPrefix('staff:'));
    if (!allStaff || allStaff.length === 0) return;

    // Always include superuser in notifications + any explicitly requested roles
    const targetStaff = allStaff.filter((s: any) =>
      s.active && (roles.includes(s.role) || s.role === 'superuser')
    );

    if (targetStaff.length === 0) return;

    console.log(`📢 Notifying ${targetStaff.length} staff (roles: ${roles.join(', ')}) — "${payload.title}"`);

    await Promise.allSettled(
      targetStaff.map((s: any) =>
        sendBrowserPush(`staff_${s.id}`, {
          title: payload.title,
          body: payload.body,
          url: payload.url || '/staff',
          tag: payload.tag || `staff-${Date.now()}`,
        })
      )
    );
  } catch (err: any) {
    console.log(`⚠️ notifyStaffByRole error: ${err?.message?.substring(0, 150)}`);
  }
}

// Helper: Push a notification to a user's notification list (max 100, FIFO)
async function pushNotification(userId: string, notif: {
  type: string;
  title: string;
  message: string;
  url?: string;
  orderId?: string;
  orderNumber?: string;
}): Promise<void> {
  try {
    const key = `notifications:${userId}`;
    const existing = (await kvRetry(() => kv.get(key))) || [];
    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      ...notif,
      read: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [newNotif, ...existing].slice(0, 100);
    await kvRetry(() => kv.set(key, updated));
    console.log(`🔔 Pushed notification to user ${userId}: "${notif.title}" (type: ${notif.type})`);

    // Also send browser push notification (non-blocking)
    const pushUrl = notif.orderId ? `/orders/${notif.orderId}` : (notif.url || '/notifications');
    sendBrowserPush(userId, {
      title: notif.title,
      body: notif.message,
      url: pushUrl,
      tag: `tikka-${notif.type}-${Date.now()}`,
    }).catch(() => {});
  } catch (err: any) {
    console.log(`⚠️ Failed to push notification to ${userId}: ${err?.message}`);
  }
}

// Helper: Push notification for order events
async function pushOrderNotification(order: any, eventType: string, extraMessage?: string): Promise<void> {
  if (!order?.userId) return;
  const shortId = getShortOrderIdServer(order.orderNumber || order.id);
  let title = '';
  let message = '';
  let type = 'order_update';

  switch (eventType) {
    case 'status_change': {
      const statusLabels: Record<string, string> = {
        pending: 'Order Received', confirmed: 'Order Confirmed', cooking: 'Being Prepared',
        ready: 'Ready for Pickup', out_for_delivery: 'Out for Delivery', delivered: 'Order Delivered',
        closed: 'Order Completed', cancelled: 'Order Cancelled',
      };
      const label = statusLabels[order.status] || order.status;
      title = `Order ${shortId} — ${label}`;
      if (order.status === 'confirmed') message = 'Your order has been confirmed and will be prepared soon!';
      else if (order.status === 'cooking') message = 'Our chef is now preparing your delicious meal!';
      else if (order.status === 'ready') message = order.deliveryMethod === 'delivery' ? 'Your order is ready and waiting for delivery pickup!' : 'Your order is ready! Please come to collect it.';
      else if (order.status === 'out_for_delivery') message = 'Your order is on its way to you!';
      else if (order.status === 'delivered') message = 'Your order has been delivered. Enjoy your meal!';
      else if (order.status === 'closed') message = 'Your order is complete. Thank you for ordering!';
      else if (order.status === 'cancelled') { message = order.cancellationReason ? `Your order has been cancelled. Reason: ${order.cancellationReason}` : 'Your order has been cancelled.'; type = 'order_cancelled'; }
      else message = `Your order status has been updated to: ${label}`;
      break;
    }
    case 'admin_message':
      title = `Message for Order ${shortId}`; message = extraMessage || 'You have a new message from the restaurant.'; type = 'admin_message'; break;
    case 'order_modified':
      title = `Order ${shortId} Modified`; message = extraMessage || 'Your order has been modified by the restaurant. Please check the updated details.'; type = 'order_modified'; break;
    case 'payment_received':
      title = `Payment Received — ${shortId}`; message = 'Your payment has been received. Thank you!'; break;
    default:
      title = `Order ${shortId} Updated`; message = extraMessage || 'Your order has been updated.';
  }

  await pushNotification(order.userId, { type, title, message, orderId: order.id, orderNumber: shortId });
}

// GET: Fetch notifications for a user
app.get("/make-server-e5e192fb/notifications/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');
    if (!userId) return c.json({ error: "userId required" }, 400);
    await processScheduledNotifications();
    const notifs = (await kvRetry(() => kv.get(`notifications:${userId}`))) || [];
    return c.json({ notifications: notifs });
  } catch (error: any) {
    console.log(`❌ Get notifications error: ${error?.message}`);
    return c.json({ error: `Failed to get notifications: ${error?.message}` }, 500);
  }
});

// POST: Mark a specific notification as read
app.post("/make-server-e5e192fb/notifications/:userId/read", async (c) => {
  try {
    const userId = c.req.param('userId');
    const { notificationId } = await c.req.json();
    if (!userId || !notificationId) return c.json({ error: "userId and notificationId required" }, 400);
    const key = `notifications:${userId}`;
    const notifs = (await kvRetry(() => kv.get(key))) || [];
    const updated = notifs.map((n: any) => n.id === notificationId ? { ...n, read: true } : n);
    await kvRetry(() => kv.set(key, updated));
    return c.json({ success: true });
  } catch (error: any) {
    console.log(`❌ Mark notification read error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// POST: Mark all notifications as read
app.post("/make-server-e5e192fb/notifications/:userId/read-all", async (c) => {
  try {
    const userId = c.req.param('userId');
    if (!userId) return c.json({ error: "userId required" }, 400);
    const key = `notifications:${userId}`;
    const notifs = (await kvRetry(() => kv.get(key))) || [];
    const updated = notifs.map((n: any) => ({ ...n, read: true }));
    await kvRetry(() => kv.set(key, updated));
    return c.json({ success: true });
  } catch (error: any) {
    console.log(`❌ Mark all read error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// POST: Clear all notifications
app.post("/make-server-e5e192fb/notifications/:userId/clear", async (c) => {
  try {
    const userId = c.req.param('userId');
    if (!userId) return c.json({ error: "userId required" }, 400);
    await kvRetry(() => kv.set(`notifications:${userId}`, []));
    return c.json({ success: true });
  } catch (error: any) {
    console.log(`❌ Clear notifications error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// Helper: Process scheduled notifications whose time has come
async function processScheduledNotifications(): Promise<void> {
  try {
    const scheduled = (await kvRetry(() => kv.get('scheduled_notifications'))) || [];
    if (scheduled.length === 0) return;
    const now = new Date();
    const remaining: any[] = [];
    let processedCount = 0;
    for (const sn of scheduled) {
      if (new Date(sn.scheduledAt) <= now) {
        await deliverAdminNotification(sn);
        const adminLog = (await kvRetry(() => kv.get('admin_notification_log'))) || [];
        const updatedLog = adminLog.map((l: any) => l.id === sn.logId ? { ...l, status: 'sent', sentAt: now.toISOString() } : l);
        await kvRetry(() => kv.set('admin_notification_log', updatedLog));
        processedCount++;
      } else {
        remaining.push(sn);
      }
    }
    if (processedCount > 0) {
      await kvRetry(() => kv.set('scheduled_notifications', remaining));
      console.log(`⏰ Processed ${processedCount} scheduled notification(s)`);
    }
  } catch (err: any) {
    console.log(`⚠️ processScheduledNotifications error: ${err?.message}`);
  }
}

// Helper: Deliver an admin notification (broadcast or targeted)
async function deliverAdminNotification(notifData: any): Promise<number> {
  const { type, title, message, url, targetPhone } = notifData;
  let recipientCount = 0;
  if (type === 'broadcast') {
    const allUsers = await kvRetry(() => kv.getByPrefix("user:"));
    for (const user of (allUsers || [])) {
      if (!user.id || user.isAdmin) continue;
      await pushNotification(user.id, { type: 'admin_broadcast', title, message, url });
      recipientCount++;
    }
    console.log(`📢 Broadcast notification sent to ${recipientCount} user(s)`);
  } else if (type === 'targeted' && targetPhone) {
    const allUsers = await kvRetry(() => kv.getByPrefix("user:"));
    const targetDigits = phoneToDigits(targetPhone);
    const targetUser = (allUsers || []).find((u: any) => {
      const uDigits = phoneToDigits(u.phone || '');
      return uDigits === targetDigits || uDigits.endsWith(targetDigits) || targetDigits.endsWith(uDigits);
    });
    if (targetUser) {
      await pushNotification(targetUser.id, { type: 'admin_targeted', title, message, url });
      recipientCount = 1;
      console.log(`📨 Targeted notification sent to ${targetUser.name || targetUser.phone}`);
    } else {
      console.log(`⚠️ Target user not found for phone: ${targetPhone}`);
    }
  }
  return recipientCount;
}

// Admin: GET sent notification history
app.get("/make-server-e5e192fb/admin/notifications", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const log = (await kvRetry(() => kv.get('admin_notification_log'))) || [];
    log.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ notifications: log });
  } catch (error: any) {
    console.log(`❌ Get admin notifications error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// Admin: POST create and send a notification
app.post("/make-server-e5e192fb/admin/notifications", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const { type, title, message, url, targetPhone, scheduledAt } = await c.req.json();
    if (!type || !title || !message) return c.json({ error: "type, title, and message are required" }, 400);
    if (type === 'targeted' && !targetPhone) return c.json({ error: "targetPhone is required for targeted notifications" }, 400);

    const now = new Date().toISOString();
    const logId = `adminnotif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const logEntry: any = { id: logId, type, title, message, url: url || undefined, targetPhone: targetPhone || undefined, createdAt: now, status: 'sent' };

    // If scheduled for the future
    if (scheduledAt) {
      const schedTime = new Date(scheduledAt);
      if (schedTime > new Date()) {
        logEntry.status = 'scheduled';
        logEntry.scheduledAt = scheduledAt;
        const scheduled = (await kvRetry(() => kv.get('scheduled_notifications'))) || [];
        scheduled.push({ logId, type, title, message, url, targetPhone, scheduledAt });
        await kvRetry(() => kv.set('scheduled_notifications', scheduled));
        const log = (await kvRetry(() => kv.get('admin_notification_log'))) || [];
        log.unshift(logEntry);
        await kvRetry(() => kv.set('admin_notification_log', log.slice(0, 200)));
        console.log(`⏰ Notification scheduled for ${scheduledAt}`);
        return c.json({ success: true, status: 'scheduled', scheduledAt });
      }
    }

    // Send immediately
    const recipientCount = await deliverAdminNotification({ type, title, message, url, targetPhone });
    logEntry.sentAt = now;
    logEntry.recipientCount = recipientCount;

    if (type === 'targeted' && targetPhone) {
      const allUsers = await kvRetry(() => kv.getByPrefix("user:"));
      const targetDigits = phoneToDigits(targetPhone);
      const targetUser = (allUsers || []).find((u: any) => {
        const uDigits = phoneToDigits(u.phone || '');
        return uDigits === targetDigits || uDigits.endsWith(targetDigits) || targetDigits.endsWith(uDigits);
      });
      if (targetUser) logEntry.targetName = targetUser.name || targetUser.phone;
    }

    const log = (await kvRetry(() => kv.get('admin_notification_log'))) || [];
    log.unshift(logEntry);
    await kvRetry(() => kv.set('admin_notification_log', log.slice(0, 200)));
    return c.json({ success: true, recipientCount });
  } catch (error: any) {
    console.log(`❌ Create admin notification error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// Admin: DELETE a notification log entry
app.delete("/make-server-e5e192fb/admin/notifications/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const notifId = c.req.param('id');
    const log = (await kvRetry(() => kv.get('admin_notification_log'))) || [];
    await kvRetry(() => kv.set('admin_notification_log', log.filter((l: any) => l.id !== notifId)));
    const scheduled = (await kvRetry(() => kv.get('scheduled_notifications'))) || [];
    const updatedScheduled = scheduled.filter((s: any) => s.logId !== notifId);
    if (updatedScheduled.length !== scheduled.length) {
      await kvRetry(() => kv.set('scheduled_notifications', updatedScheduled));
    }
    return c.json({ success: true });
  } catch (error: any) {
    console.log(`❌ Delete admin notification error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// ==================== PUSH NOTIFICATION ENDPOINTS ====================

// GET: Diagnose VAPID key configuration
app.get("/make-server-e5e192fb/push/vapid-diagnose", async (c) => {
  try {
    // Generate fresh VAPID keys using Web Crypto API
    let freshKeys: { publicKey: string; privateKey: string } | null = null;
    try {
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
      );
      const publicRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
      const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
      const toBase64Url = (buf: ArrayBuffer) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      };
      freshKeys = {
        publicKey: toBase64Url(publicRaw),
        privateKey: privateJwk.d!,
      };
    } catch (genErr: any) {
      console.log("Failed to generate VAPID keys via Web Crypto:", genErr?.message);
    }

    return c.json({
      currentPublicKey: {
        value: VAPID_PUBLIC_KEY,
        length: VAPID_PUBLIC_KEY.length,
        hasInvalidChars: /[^A-Za-z0-9_-]/.test(VAPID_PUBLIC_KEY),
        isValid: VAPID_PUBLIC_KEY.length === 87 && !/[^A-Za-z0-9_-]/.test(VAPID_PUBLIC_KEY),
      },
      currentPrivateKey: {
        length: VAPID_PRIVATE_KEY.length,
        hasInvalidChars: /[^A-Za-z0-9_-]/.test(VAPID_PRIVATE_KEY),
        isValid: VAPID_PRIVATE_KEY.length === 43 && !/[^A-Za-z0-9_-]/.test(VAPID_PRIVATE_KEY),
      },
      freshGeneratedKeys: freshKeys ? {
        publicKey: freshKeys.publicKey,
        privateKey: freshKeys.privateKey,
        publicKeyLength: freshKeys.publicKey.length,
        privateKeyLength: freshKeys.privateKey.length,
        note: "UPDATE your Supabase secrets: set VAPID_PUBLIC_KEY to publicKey and VAPID_PRIVATE_KEY to privateKey"
      } : { error: "Could not generate keys" },
    });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to diagnose" }, 500);
  }
});

// GET: Return the VAPID public key so the frontend can subscribe
app.get("/make-server-e5e192fb/push/vapid-key", (c) => {
  if (!VAPID_PUBLIC_KEY) {
    return c.json({ error: "VAPID keys not configured" }, 500);
  }
  console.log("[VAPID] Returning public key, length:", VAPID_PUBLIC_KEY.length, "first 10:", VAPID_PUBLIC_KEY.substring(0, 10));
  return c.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
});

// POST: Store a push subscription for a user (multi-device support)
app.post("/make-server-e5e192fb/push/subscribe", async (c) => {
  try {
    const { userId, subscription } = await c.req.json();
    if (!userId || !subscription?.endpoint) {
      return c.json({ error: "userId and subscription with endpoint required" }, 400);
    }

    const subsKey = `push_subs:${userId}`;
    const existing: any[] = (await kvRetry(() => kv.get(subsKey))) || [];

    // Avoid duplicates by endpoint
    const alreadyExists = existing.some((s: any) => s.endpoint === subscription.endpoint);
    if (alreadyExists) {
      console.log(`📲 Push subscription already exists for user ${userId}, updating...`);
      const updated = existing.map((s: any) =>
        s.endpoint === subscription.endpoint ? subscription : s
      );
      await kvRetry(() => kv.set(subsKey, updated));
    } else {
      // Max 10 devices per user
      const updated = [subscription, ...existing].slice(0, 10);
      await kvRetry(() => kv.set(subsKey, updated));
      console.log(`📲 New push subscription added for user ${userId} (total: ${updated.length} device(s))`);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.log(`❌ Push subscribe error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// POST: Remove a push subscription for a user
app.post("/make-server-e5e192fb/push/unsubscribe", async (c) => {
  try {
    const { userId, endpoint } = await c.req.json();
    if (!userId || !endpoint) {
      return c.json({ error: "userId and endpoint required" }, 400);
    }

    const subsKey = `push_subs:${userId}`;
    const existing: any[] = (await kvRetry(() => kv.get(subsKey))) || [];
    const updated = existing.filter((s: any) => s.endpoint !== endpoint);
    await kvRetry(() => kv.set(subsKey, updated));

    console.log(`📲 Push subscription removed for user ${userId} (remaining: ${updated.length})`);
    return c.json({ success: true });
  } catch (error: any) {
    console.log(`❌ Push unsubscribe error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// ─── Broadcast Messages (Home Page Banners) ─────────────────────────────────

// Public: GET active broadcasts (no auth required)
app.get("/make-server-e5e192fb/broadcasts/active", async (c) => {
  try {
    const broadcasts: any[] = (await kvRetry(() => kv.get('broadcasts'))) || [];
    const now = new Date();
    const active = broadcasts.filter((b: any) => {
      if (!b.active) return false;
      if (b.startAt && new Date(b.startAt) > now) return false;
      if (b.endAt && new Date(b.endAt) < now) return false;
      return true;
    });
    active.sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99));
    const settings = (await kvRetry(() => kv.get('broadcast_settings'))) || {};
    return c.json({ broadcasts: active, scrollInterval: settings.scrollInterval || 7 });
  } catch (error: any) {
    console.log(`❌ Get active broadcasts error: ${error?.message}`);
    return c.json({ broadcasts: [], scrollInterval: 7 });
  }
});

// Admin: GET all broadcasts
app.get("/make-server-e5e192fb/admin/broadcasts", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const broadcasts: any[] = (await kvRetry(() => kv.get('broadcasts'))) || [];
    broadcasts.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const settings = (await kvRetry(() => kv.get('broadcast_settings'))) || {};
    return c.json({ broadcasts, settings });
  } catch (error: any) {
    console.log(`❌ Get admin broadcasts error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// Admin: POST create broadcast
app.post("/make-server-e5e192fb/admin/broadcasts", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const body = await c.req.json();
    const { message, icon, bgColor, textColor, url, startAt, endAt, priority, active } = body;
    if (!message) return c.json({ error: "Message is required" }, 400);

    const broadcast = {
      id: `bc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      message,
      icon: icon || '📢',
      bgColor: bgColor || '#FFF0F5',
      textColor: textColor || '#9B1B5A',
      url: url || '',
      startAt: startAt || new Date().toISOString(),
      endAt: endAt || '',
      priority: priority ?? 0,
      active: active !== false,
      createdAt: new Date().toISOString(),
      createdBy: adminAuth.userId,
    };

    const broadcasts: any[] = (await kvRetry(() => kv.get('broadcasts'))) || [];
    broadcasts.push(broadcast);
    await kvRetry(() => kv.set('broadcasts', broadcasts));
    console.log(`📢 Broadcast created: ${broadcast.id}`);
    return c.json({ success: true, broadcast });
  } catch (error: any) {
    console.log(`❌ Create broadcast error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// Admin: PUT update broadcast
app.put("/make-server-e5e192fb/admin/broadcasts/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const id = c.req.param('id');
    const body = await c.req.json();

    const broadcasts: any[] = (await kvRetry(() => kv.get('broadcasts'))) || [];
    const idx = broadcasts.findIndex((b: any) => b.id === id);
    if (idx === -1) return c.json({ error: "Broadcast not found" }, 404);

    broadcasts[idx] = { ...broadcasts[idx], ...body, updatedAt: new Date().toISOString() };
    await kvRetry(() => kv.set('broadcasts', broadcasts));
    console.log(`📢 Broadcast updated: ${id}`);
    return c.json({ success: true, broadcast: broadcasts[idx] });
  } catch (error: any) {
    console.log(`❌ Update broadcast error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// Admin: DELETE broadcast
app.delete("/make-server-e5e192fb/admin/broadcasts/:id", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const id = c.req.param('id');

    const broadcasts: any[] = (await kvRetry(() => kv.get('broadcasts'))) || [];
    const updated = broadcasts.filter((b: any) => b.id !== id);
    await kvRetry(() => kv.set('broadcasts', updated));
    console.log(`📢 Broadcast deleted: ${id}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.log(`❌ Delete broadcast error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// Admin: PUT update broadcast settings (scroll interval, etc.)
app.put("/make-server-e5e192fb/admin/broadcast-settings", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(token);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);
    const body = await c.req.json();
    const existing = (await kvRetry(() => kv.get('broadcast_settings'))) || {};
    const updated = { ...existing, ...body, updatedAt: new Date().toISOString() };
    await kvRetry(() => kv.set('broadcast_settings', updated));
    return c.json({ success: true, settings: updated });
  } catch (error: any) {
    console.log(`❌ Update broadcast settings error: ${error?.message}`);
    return c.json({ error: `Failed: ${error?.message}` }, 500);
  }
});

// ==================== CHANGE PIN ENDPOINTS ====================

// Customer: Change own PIN
app.post("/make-server-e5e192fb/change-pin", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const userAccess = await verifyUserAccess(token);
    if (!userAccess) return c.json({ error: "Unauthorized" }, 401);

    const { currentPin, newPin } = await c.req.json();
    if (!currentPin || !newPin) return c.json({ error: "Current PIN and new PIN are required" }, 400);
    if (!isValidPin(newPin)) return c.json({ error: "New PIN must be exactly 6 digits" }, 400);
    if (currentPin === newPin) return c.json({ error: "New PIN must be different from current PIN" }, 400);

    const userId = userAccess.userId;
    console.log(`🔑 CHANGE PIN (Customer): User ${userId} requesting PIN change`);

    const userData = await kvRetry(() => kv.get(`user:${userId}`));
    if (!userData) return c.json({ error: "User not found" }, 404);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const authUser = users?.find((u: any) => u.id === userId);
    if (!authUser?.email) return c.json({ error: "Auth user not found" }, 404);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: currentPin,
    });

    if (signInError) {
      console.log(`❌ CHANGE PIN (Customer): Current PIN incorrect for user ${userId}`);
      return c.json({ error: "Incorrect current PIN" }, 401);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password: newPin });
    if (updateError) {
      console.log(`❌ CHANGE PIN (Customer): Failed to update - ${updateError.message}`);
      return c.json({ error: `Failed to update PIN: ${updateError.message}` }, 500);
    }

    console.log(`✅ CHANGE PIN (Customer): PIN changed successfully for user ${userId} (${userData.name})`);

    await pushNotification(userId, {
      type: 'security',
      title: 'PIN Changed',
      message: 'Your login PIN was changed successfully. If you did not make this change, contact support immediately.',
    });

    return c.json({ success: true, message: "PIN changed successfully" });
  } catch (error: any) {
    console.log(`❌ CHANGE PIN (Customer) ERROR: ${error?.message}`);
    return c.json({ error: `Failed to change PIN: ${error?.message}` }, 500);
  }
});

// Staff: Change own PIN
app.post("/make-server-e5e192fb/staff/change-pin", async (c) => {
  try {
    const token = getCustomToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const staffAccess = await verifyStaffAccess(token);
    if (!staffAccess) return c.json({ error: "Unauthorized" }, 401);

    const { currentPin, newPin } = await c.req.json();
    if (!currentPin || !newPin) return c.json({ error: "Current PIN and new PIN are required" }, 400);
    if (!isValidPin(newPin)) return c.json({ error: "New PIN must be exactly 6 digits" }, 400);
    if (currentPin === newPin) return c.json({ error: "New PIN must be different from current PIN" }, 400);

    const userId = staffAccess.userId;
    console.log(`🔑 CHANGE PIN (Staff): User ${userId} (${staffAccess.role}) requesting PIN change`);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const authUser = users?.find((u: any) => u.id === userId);
    if (!authUser?.email) return c.json({ error: "Auth user not found" }, 404);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: currentPin,
    });

    if (signInError) {
      console.log(`❌ CHANGE PIN (Staff): Current PIN incorrect for user ${userId}`);
      return c.json({ error: "Incorrect current PIN" }, 401);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password: newPin });
    if (updateError) {
      console.log(`❌ CHANGE PIN (Staff): Failed to update - ${updateError.message}`);
      return c.json({ error: `Failed to update PIN: ${updateError.message}` }, 500);
    }

    const staffData = await kvRetry(() => kv.get(`staff:${userId}`));
    console.log(`✅ CHANGE PIN (Staff): PIN changed for ${staffData?.name || userId} (${staffAccess.role})`);

    await pushNotification(userId, {
      type: 'security',
      title: 'Staff PIN Changed',
      message: 'Your staff login PIN was changed successfully. If you did not make this change, contact your supervisor immediately.',
    });

    return c.json({ success: true, message: "PIN changed successfully" });
  } catch (error: any) {
    console.log(`❌ CHANGE PIN (Staff) ERROR: ${error?.message}`);
    return c.json({ error: `Failed to change PIN: ${error?.message}` }, 500);
  }
});

// ==================== A2HS TRACKING ====================

// POST /track-a2hs — Track "Add to Home Screen" install events
app.post("/make-server-e5e192fb/track-a2hs", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const userAuth = await verifyUserAccess(accessToken);
    if (!userAuth) return c.json({ error: "Unauthorized" }, 401);

    const { method, platform } = await c.req.json();
    const userId = userAuth.userId;
    const phone = userAuth.phone || "";

    // Get user name from profile
    let userName = "";
    try {
      const profile = await kvRetry(() => kv.get(`user:${userId}`));
      if (profile) {
        const parsed = typeof profile === "string" ? JSON.parse(profile) : profile;
        userName = parsed.name || "";
      }
    } catch {}

    // Check if already tracked for this user
    const existing = await kvRetry(() => kv.get(`a2hs_install:${userId}`));
    if (existing) {
      console.log(`[A2HS] Already tracked for user ${userId}`);
      return c.json({ success: true, alreadyTracked: true });
    }

    // Store the install event
    const installData = {
      userId,
      phone,
      name: userName,
      method: method || "unknown",
      platform: platform || "unknown",
      installedAt: new Date().toISOString(),
    };

    await kvRetry(() => kv.set(`a2hs_install:${userId}`, JSON.stringify(installData)));
    console.log(`✅ [A2HS] Tracked install for user ${userId}: ${method} on ${platform}`);

    return c.json({ success: true });
  } catch (error: any) {
    console.log(`❌ [A2HS] Track error: ${error?.message}`);
    return c.json({ error: `Failed to track A2HS install: ${error?.message}` }, 500);
  }
});

// GET /reports/a2hs — A2HS Install report (superuser only)
app.get("/make-server-e5e192fb/reports/a2hs", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const adminAuth = await verifyAdminAccess(accessToken);
    if (!adminAuth) return c.json({ error: "Admin access required" }, 403);

    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "10");
    const search = c.req.query("search") || "";
    const startDate = c.req.query("startDate") || "";
    const endDate = c.req.query("endDate") || "";
    const isExport = c.req.query("export") === "true";

    // Fetch all A2HS install records
    const allRecords = await kvRetry(() => kv.getByPrefix("a2hs_install:"));
    const installs: any[] = [];

    for (const record of allRecords) {
      try {
        const val = typeof record.value === "string" ? JSON.parse(record.value) : record.value;
        installs.push(val);
      } catch {}
    }

    // Sort by installedAt desc
    installs.sort((a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime());

    // Apply filters
    let filtered = installs;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          (i.name || "").toLowerCase().includes(s) ||
          (i.phone || "").toLowerCase().includes(s) ||
          (i.platform || "").toLowerCase().includes(s) ||
          (i.method || "").toLowerCase().includes(s)
      );
    }

    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter((i) => new Date(i.installedAt) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((i) => new Date(i.installedAt) <= end);
    }

    // Summary stats
    const summary = {
      totalInstalls: filtered.length,
      nativeInstalls: filtered.filter((i) => i.method === "native").length,
      manualInstalls: filtered.filter((i) => i.method === "manual_standalone").length,
      platformBreakdown: {
        iOS: filtered.filter((i) => (i.platform || "").toLowerCase().includes("ios")).length,
        Android: filtered.filter((i) => (i.platform || "").toLowerCase().includes("android")).length,
        Desktop: filtered.filter((i) => (i.platform || "").toLowerCase().includes("desktop")).length,
        Other: filtered.filter((i) => {
          const p = (i.platform || "").toLowerCase();
          return !p.includes("ios") && !p.includes("android") && !p.includes("desktop");
        }).length,
      },
    };

    // If export, return all filtered records
    if (isExport) {
      return c.json({
        installs: filtered,
        summary,
        pagination: { page: 1, limit: filtered.length, totalPages: 1, totalItems: filtered.length },
        allInstalls: filtered,
      });
    }

    // Paginate
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * limit;
    const paginated = filtered.slice(startIdx, startIdx + limit);

    return c.json({
      installs: paginated,
      summary,
      pagination: { page: safePage, limit, totalPages, totalItems },
    });
  } catch (error: any) {
    console.log(`❌ [A2HS Report] Error: ${error?.message}`);
    return c.json({ error: `Failed to generate A2HS report: ${error?.message}` }, 500);
  }
});

// Start the server
Deno.serve(app.fetch);