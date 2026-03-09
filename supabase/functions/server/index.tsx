import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";
import { create, verify } from "jsr:@zaubrik/djwt@3.0.2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { getImageForDish } from "./menu_images.tsx";

const app = new Hono();

// Custom JWT secret for our own token system (bypasses Supabase Auth mismatch)
const JWT_SECRET = Deno.env.get('JWT_SECRET') || 'tikka-n-talk-secret-key-change-in-production';

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
  
  console.log(`✅ JWT validated - userId: ${payload.userId}, isAdmin: ${payload.isAdmin}`);
  
  // Double-check admin status in KV store
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

// Default admin credentials
const ADMIN_PHONE = "9999999999";
const ADMIN_PASSWORD = "admin123";

// Helper: Check if string is a 6-digit PIN
function isPinFormat(input: string): boolean {
  return /^\d{6}$/.test(input);
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

// Initialize default data on server start
async function initializeDefaultData() {
  try {
    console.log("🚀 Starting default data initialization...");
    
    // Check if special offers exist
    let existingOffers;
    try {
      existingOffers = await kv.getByPrefix("todays_special:");
    } catch (error) {
      console.error("⚠️ Failed to check existing offers (database might be warming up):", error.message);
      existingOffers = null;
    }
    
    // If no offers exist, create the default ones
    if (!existingOffers || existingOffers.length === 0) {
      console.log("Initializing default today's special items...");
      for (const offer of DEFAULT_SPECIAL_OFFERS) {
        try {
          await kv.set(`todays_special:${offer.id}`, offer);
        } catch (error) {
          console.error(`⚠️ Failed to initialize offer ${offer.id}:`, error.message);
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
    
    const adminEmail = `${ADMIN_PHONE}@tikka.app`;
    
    // Try to find existing admin user
    let existingUsers;
    try {
      const response = await supabase.auth.admin.listUsers();
      existingUsers = response.data;
    } catch (error) {
      console.error("⚠️ Failed to list users (auth service might be warming up):", error.message);
      console.log("⚠️ Skipping admin user initialization, will retry on next deployment");
      return;
    }
    
    const adminExists = existingUsers?.users?.some(u => u.email === adminEmail);
    
    if (!adminExists) {
      console.log("🔧 Creating admin user...");
      const { data, error } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: ADMIN_PASSWORD,
        user_metadata: { name: "Admin", phone: ADMIN_PHONE },
        email_confirm: true,
      });
      
      if (error) {
        // If user already exists (race condition or previous creation), just log it
        if (error.message?.includes("already been registered") || error.message?.includes("already exists")) {
          console.log("ℹ️ Admin user already exists (found via error), skipping creation");
          // Try to find and update KV store anyway
          const { data: allUsers } = await supabase.auth.admin.listUsers();
          const existingAdmin = allUsers?.users?.find(u => u.email === adminEmail);
          if (existingAdmin) {
            try {
              await new Promise(resolve => setTimeout(resolve, 500));
              
              await kv.set(`user:${existingAdmin.id}`, {
                id: existingAdmin.id,
                phone: ADMIN_PHONE,
                name: "Admin",
                points: 0,
                createdAt: existingAdmin.created_at,
                isAdmin: true,
              });
              console.log("✅ Admin user KV data updated");
            } catch (kvError) {
              console.error("⚠️ Failed to update admin KV data:", kvError?.message || kvError);
              console.log("⚠️ This is not critical - admin login will still work. KV will be updated on next login.");
            }
          }
        } else {
          console.error("❌ Failed to create admin user:", error.message);
        }
      } else {
        console.log("✅ Admin user created successfully:", data.user.id);
        
        // Store admin user data in KV
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await kv.set(`user:${data.user.id}`, {
            id: data.user.id,
            phone: ADMIN_PHONE,
            name: "Admin",
            points: 0,
            createdAt: new Date().toISOString(),
            isAdmin: true,
          });
        } catch (kvError) {
          console.error("⚠️ Failed to store admin user in KV:", kvError?.message || kvError);
          console.log("⚠️ This is not critical - admin login will still work. KV will be updated on next login.");
        }
      }
    } else {
      console.log("✅ Admin user already exists");
      
      // Get the admin user and ensure KV has the correct data
      const adminUser = existingUsers?.users?.find(u => u.email === adminEmail);
      if (adminUser) {
        console.log("🔧 Ensuring admin user data in KV...");
        try {
          // Add a small delay to let connections stabilize
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await kv.set(`user:${adminUser.id}`, {
            id: adminUser.id,
            phone: ADMIN_PHONE,
            name: "Admin",
            points: 0,
            createdAt: adminUser.created_at,
            isAdmin: true,
          });
          console.log("✅ Admin user KV data updated");
        } catch (kvError) {
          console.error("⚠️ Failed to update admin user KV data:", kvError?.message || kvError);
          console.log("⚠️ This is not critical - admin login will still work. KV will be updated on next login.");
        }
      }
    }
    
    console.log("✅ Default data initialization completed");
  } catch (error) {
    console.error("❌ Failed to initialize default data:", error);
    console.error("⚠️ This is not critical - the app will still function. Data will be initialized on first use.");
  }
}

// Call initialization (don't await - let it run in background)
initializeDefaultData();

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
    const { phone, password } = await c.req.json();
    
    // Validate admin credentials
    if (phone !== "9999999999" || password !== "admin123") {
      return c.json({ error: "Invalid admin credentials" }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Convert phone to email format
    const email = `${phone}@tikka.app`;
    
    // Get the admin user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error("Error listing users:", listError);
      return c.json({ error: "Failed to list users", details: listError.message }, 500);
    }
    
    const adminUser = users.find(u => u.email === email);
    
    if (!adminUser) {
      return c.json({ error: "Admin user not found in Supabase Auth" }, 404);
    }

    // Force update KV store with admin flag
    const userData = {
      id: adminUser.id,
      phone: phone,
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
    const { phone, password, name } = await c.req.json();
    
    console.log(`📝 SIGNUP: Starting signup for phone: ${phone}`);
    
    if (!phone || !password || !name) {
      return c.json({ error: "Phone number, password/PIN, and name are required" }, 400);
    }

    // Validate phone number format (10-12 digits)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 12) {
      return c.json({ error: "Phone number must be 10-12 digits" }, 400);
    }

    // Check if this is a PIN (6 digits) and validate it
    const isPin = isPinFormat(password);
    console.log(`📝 SIGNUP: Password format - ${isPin ? 'PIN (6 digits)' : 'Password (legacy)'}`);
    
    // Check if phone already exists
    const existingUsers = await kv.getByPrefix("user:");
    const phoneExists = existingUsers.some((user: any) => user.phone === phone);
    if (phoneExists) {
      return c.json({ error: "Phone number already registered" }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Use phone as email format for Supabase auth
    const email = `${phoneDigits}@tikka.app`;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, phone, usesPin: isPin },
      email_confirm: true, // Automatically confirm since email server not configured
    });

    if (error) {
      console.log(`❌ SIGNUP: Supabase auth error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    // Store user data in KV store
    const userId = data.user.id;
    const isAdmin = phone.startsWith('9999'); // Admin if phone starts with 9999
    await kv.set(`user:${userId}`, {
      id: userId,
      phone,
      name,
      points: 0,
      createdAt: new Date().toISOString(),
      isAdmin,
      usesPin: isPin, // Track if user uses PIN
    });

    console.log(`✅ SIGNUP: User created successfully - ID: ${userId}, Uses PIN: ${isPin}`);

    return c.json({ 
      success: true, 
      user: { id: userId, phone, name, points: 0, isAdmin, usesPin: isPin }
    });
  } catch (error) {
    console.log(`❌ SIGNUP exception: ${error}`);
    return c.json({ error: "Signup failed" }, 500);
  }
});

// User Signin
app.post("/make-server-e5e192fb/signin", async (c) => {
  try {
    const { phone, password } = await c.req.json();
    
    console.log(`🔐 SIGNIN: Starting signin for phone: ${phone}`);
    
    if (!phone || !password) {
      return c.json({ error: "Phone number and PIN/password are required" }, 400);
    }

    // Detect if input is PIN (6 digits) or password
    const isPin = isPinFormat(password);
    console.log(`🔐 SIGNIN: Auth type - ${isPin ? 'PIN (6 digits)' : 'Password (legacy)'}`);

    // Convert phone to email format
    const phoneDigits = phone.replace(/\D/g, '');
    const email = `${phoneDigits}@tikka.app`;
    console.log(`🔐 SIGNIN: Phone digits extracted: ${phoneDigits}`);
    console.log(`🔐 SIGNIN: Using email format: ${email}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    console.log(`🔐 SIGNIN: Calling signInWithPassword with email=${email}`);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log(`🔐 SIGNIN: Supabase response - error:`, error);
    console.log(`🔐 SIGNIN: Supabase response - data:`, data);

    if (error) {
      console.log(`❌ SIGNIN: Supabase error - ${error.message}`);
      console.log(`❌ SIGNIN: Error name: ${error.name}`);
      console.log(`❌ SIGNIN: Error status: ${error.status}`);
      return c.json({ error: "Invalid phone number or password" }, 400);
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

    const responseUser = userData || { id: data.user.id, phone, points: 0 };
    
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

    const userData = await kv.get(`user:${payload.userId}`);
    if (!userData) {
      console.log(`❌ Profile GET - User not found: ${payload.userId}`);
      return c.json({ error: "User not found" }, 404);
    }

    console.log(`✅ Profile GET - User data:`, { id: userData.id, name: userData.name, points: userData.points });
    return c.json({ user: userData });
  } catch (error) {
    console.log(`❌ Profile error: ${error}`);
    return c.json({ error: "Failed to get profile" }, 500);
  }
});

// Switch from Password to PIN (requires auth)
app.post("/make-server-e5e192fb/switch-to-pin", async (c) => {
  try {
    const { currentPassword, newPin } = await c.req.json();
    
    // Get custom JWT token
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Verify custom JWT
    const payload = await verifyToken(customToken);
    if (!payload || !payload.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`🔄 SWITCH-TO-PIN: User ${payload.userId} switching to PIN`);

    // Validate new PIN
    if (!isPinFormat(newPin)) {
      return c.json({ error: "PIN must be exactly 6 digits" }, 400);
    }

    // Get user data
    const userData = await kv.get(`user:${payload.userId}`);
    if (!userData) {
      return c.json({ error: "User not found" }, 404);
    }

    // Verify current password with Supabase
    const phoneDigits = userData.phone.replace(/\D/g, '');
    const email = `${phoneDigits}@tikka.app`;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify current password
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError || !signInData.user) {
      console.log(`❌ SWITCH-TO-PIN: Current password verification failed`);
      return c.json({ error: "Current password is incorrect" }, 400);
    }

    // Update password to PIN in Supabase Auth
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      payload.userId,
      {
        password: newPin,
        user_metadata: { ...signInData.user.user_metadata, usesPin: true }
      }
    );

    if (updateError) {
      console.log(`❌ SWITCH-TO-PIN: Failed to update password: ${updateError.message}`);
      return c.json({ error: "Failed to update to PIN" }, 500);
    }

    // Update user data in KV store
    await kv.set(`user:${payload.userId}`, {
      ...userData,
      usesPin: true,
    });

    console.log(`✅ SWITCH-TO-PIN: Successfully switched user ${payload.userId} to PIN`);

    return c.json({ 
      success: true,
      message: "Successfully switched to PIN login"
    });
  } catch (error) {
    console.log(`❌ SWITCH-TO-PIN exception: ${error}`);
    return c.json({ error: "Failed to switch to PIN" }, 500);
  }
});

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

    // Get cart from KV store
    const cart = await kv.get(`cart:${userAuth.userId}`) || [];
    
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

    // Save cart
    await kv.set(`cart:${userId}`, cart);
    
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
    const settings = await kv.get("restaurant_settings");
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
    
    // Format as TNT00000001, TNT00000002, etc.
    const orderNumber = `TNT${String(newCounter).padStart(8, '0')}`;
    
    const order = {
      id: orderId,
      orderNumber: orderNumber,
      userId: userId,
      ...orderData,
      status: "pending",
      paymentReceived: false,
      pointsAwarded: false,
      statusHistory: [
        { status: "pending", timestamp: now, label: "Order Created" }
      ],
      createdAt: now,
      updatedAt: now,
    };

    console.log("Storing order with ID:", orderId, "Order Number:", orderNumber);
    
    // Store order
    await kv.set(`order:${orderId}`, order);

    // Add to user's orders list (skip for guest orders)
    if (!isGuestOrder) {
      const userOrdersKey = `user_orders:${userId}`;
      const existingOrders = await kv.get(userOrdersKey) || [];
      await kv.set(userOrdersKey, [...existingOrders, orderId]);
    } else {
      // For guest orders, also store by phone for lookup
      const guestPhoneKey = `guest_orders:${orderData.guestPhone.replace(/\D/g, '')}`;
      const existingGuestOrders = await kv.get(guestPhoneKey) || [];
      await kv.set(guestPhoneKey, [...existingGuestOrders, orderId]);
    }

    console.log("Order stored successfully");
    
    // Note: Points will be awarded when order is closed AND payment is received

    console.log("✅ Order creation complete");
    return c.json({ success: true, order });
  } catch (error) {
    console.log(`Create order error: ${error}`);
    console.log(`Error stack: ${error?.stack}`);
    return c.json({ error: `Failed to create order: ${error?.message}` }, 500);
  }
});

// Get User Orders (requires auth)
app.get("/make-server-e5e192fb/orders", async (c) => {
  try {
    const userId = c.req.query('userId');
    
    if (!userId) {
      console.log("GET orders - No userId provided");
      return c.json({ error: "User ID is required" }, 400);
    }

    console.log(`GET orders - Fetching orders for user: ${userId}`);

    const userOrdersKey = `user_orders:${userId}`;
    const orderIds = await kv.get(userOrdersKey) || [];
    
    console.log(`Fetching orders for user ${userId}, found ${orderIds.length} order IDs`);
    
    const orders = await Promise.all(
      orderIds.map((id: string) => kv.get(`order:${id}`))
    );

    const filteredOrders = orders.filter(o => o !== null);
    console.log(`Returning ${filteredOrders.length} orders`);
    
    return c.json({ orders: filteredOrders });
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
    const order = await kv.get(`order:${orderId}`);
    
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
    const { phone, password } = body;
    
    console.log(`Attempting to force-init admin for phone: ${phone}`);
    
    if (phone !== ADMIN_PHONE || password !== ADMIN_PASSWORD) {
      return c.json({ error: "Invalid admin credentials" }, 403);
    }
    
    // Convert phone to email for Supabase
    const email = `${phone}@tikka.app`;
    
    // Create Supabase service client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    
    // Check if user exists in Supabase Auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    console.log(`Found ${users?.length || 0} total users in Supabase Auth`);
    
    let userId;
    const existingUser = users?.find(u => u.email === email);
    
    if (existingUser) {
      console.log(`Admin user already exists in Supabase: ${existingUser.id}`);
      userId = existingUser.id;
    } else {
      // Create admin user in Supabase
      console.log(`Creating new admin user in Supabase...`);
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: "Admin User", phone }
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
      phone,
      name: "Admin User",
      email,
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

// Admin: Get All Orders (requires auth + admin)
app.get("/make-server-e5e192fb/admin/orders", async (c) => {
  try {
    const accessToken = getCustomToken(c);
    
    console.log(`🔍 Admin orders request - Token found: ${accessToken ? 'Yes' : 'No'}`);
    
    if (!accessToken) {
      console.log(`❌ No access token provided`);
      return c.json({ code: 401, message: "Invalid JWT" }, 401);
    }

    // Use our custom JWT verification
    console.log(`🔍 Validating custom JWT token...`);
    const adminAuth = await verifyAdminAccess(accessToken);
    
    if (!adminAuth) {
      console.log(`❌ Admin verification failed`);
      return c.json({ error: "Admin access required" }, 403);
    }

    // Get all orders
    console.log(`✅ Admin user ${adminAuth.userId} authorized, fetching all orders`);
    const allOrders = await kv.getByPrefix("order:");
    return c.json({ orders: allOrders });
  } catch (error) {
    console.log(`Admin get orders error: ${error}`);
    return c.json({ error: "Failed to get orders" }, 500);
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
    const { name, subtitle, description, image, originalPrice, discountPercentage, badgeText, enabled, displayOrder } = body;

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
    const { name, subtitle, description, image, originalPrice, discountPercentage, badgeText, enabled, displayOrder } = body;

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
    const { name, subtitle, description, image, originalPrice, discountPercentage, badgeText, enabled, displayOrder, endTime } = body;

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
    const { name, subtitle, description, image, originalPrice, discountPercentage, badgeText, enabled, displayOrder, endTime } = body;

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
    const { category, name, price, image } = body;

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
    const { category, name, price, image, isAvailable } = body;

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
app.post("/make-server-e5e192fb/admin/users/:id/password", async (c) => {
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
    const { password } = await c.req.json();

    console.log(`🔑 Resetting PIN for user: ${userId}, PIN length: ${password?.length}`);

    if (!password || password.length < 6) {
      console.log(`❌ PIN validation failed`);
      return c.json({ error: "PIN must be at least 6 digits" }, 400);
    }

    console.log(`🔑 Fetching user from KV store...`);
    const user = await kv.get(`user:${userId}`);
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return c.json({ error: "User not found" }, 404);
    }

    console.log(`✅ User found: ${user.name}, updating PIN in Supabase Auth...`);

    // Update password in Supabase Auth system (this is where actual authentication happens)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password: password }
    );

    if (updateError) {
      console.log(`❌ Failed to update PIN in Supabase: ${updateError.message}`);
      return c.json({ error: `Failed to update PIN: ${updateError.message}` }, 500);
    }

    console.log(`✅ PIN updated successfully in Supabase Auth`);

    // Also update the passwordHash in KV store for consistency (though login uses Supabase)
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    user.passwordHash = passwordHash;
    user.usesPin = true;
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

// Admin: Get All Vouchers
app.get("/make-server-e5e192fb/admin/vouchers", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminCheck = await checkAdminAccess(customToken);
    if (!adminCheck.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const vouchers = await kv.getByPrefix("voucher:");
    return c.json({ vouchers });
  } catch (error) {
    console.log(`Get vouchers error: ${error}`);
    return c.json({ error: "Failed to get vouchers" }, 500);
  }
});

// Admin: Create Voucher
app.post("/make-server-e5e192fb/admin/vouchers", async (c) => {
  try {
    const customToken = getCustomToken(c);
    if (!customToken) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    const adminCheck = await checkAdminAccess(customToken);
    if (!adminCheck.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const voucherData = await c.req.json();
    const voucherId = crypto.randomUUID();
    
    const voucher = {
      id: voucherId,
      ...voucherData,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`voucher:${voucherId}`, voucher);
    
    console.log(`✅ Voucher created: ${voucher.title}`);
    return c.json({ success: true, voucher });
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

    const adminCheck = await checkAdminAccess(customToken);
    if (!adminCheck.isAdmin) {
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

    const adminCheck = await checkAdminAccess(customToken);
    if (!adminCheck.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const voucherId = c.req.param('id');
    await kv.del(`voucher:${voucherId}`);
    
    console.log(`✅ Voucher deleted: ${voucherId}`);
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

    const adminCheck = await checkAdminAccess(customToken);
    if (!adminCheck.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const voucherId = c.req.param('id');
    const { phoneNumber } = await c.req.json();

    if (!phoneNumber) {
      return c.json({ error: "Phone number is required" }, 400);
    }

    // Find user by phone
    const allUsers = await kv.getByPrefix("user:");
    const user = allUsers.find(u => u.phone === phoneNumber);

    if (!user) {
      return c.json({ error: "User not found with this phone number" }, 404);
    }

    const voucher = await kv.get(`voucher:${voucherId}`);
    if (!voucher) {
      return c.json({ error: "Voucher not found" }, 404);
    }

    // Create user voucher assignment
    const assignmentId = crypto.randomUUID();
    const assignment = {
      id: assignmentId,
      userId: user.id,
      voucherId: voucherId,
      voucher: voucher,
      assignedAt: new Date().toISOString(),
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
    
    try {
      [categories, specialOffers, regularMenuItems] = await Promise.all([
        kv.getByPrefix("category:"),
        kv.getByPrefix("todays_special:"),
        kv.getByPrefix("regular_menu:")
      ]);
    } catch (kvError) {
      console.error("Failed to fetch from KV store:", kvError);
      return c.json({ error: "Database error" }, 500);
    }
    
    console.log(`Found ${specialOffers.length} today's special items in database`);
    console.log(`Found ${regularMenuItems.length} regular menu items in database`);
    console.log("Today's special items:", JSON.stringify(specialOffers, null, 2));
    
    // Build a map of all available items (from both menu and special offers)
    const allAvailableItems = new Map();
    
    // Add today's special items to the map
    specialOffers.forEach(offer => {
      if (offer && offer.id) {
        allAvailableItems.set(offer.id, {
          id: offer.id,
          title: offer.name || offer.title, // Today's special uses 'name' field
          price: offer.finalPrice || offer.discountedPrice || offer.price,
          isAvailable: offer.enabled !== false
        });
      }
    });
    
    // Add regular menu items to the map
    regularMenuItems.forEach(item => {
      if (item && item.id) {
        allAvailableItems.set(item.id, {
          id: item.id,
          title: item.name || item.title, // Regular menu uses 'name' field
          price: item.price,
          isAvailable: item.isAvailable !== false
        });
      }
    });
    
    console.log(`Total available items in map: ${allAvailableItems.size}`);
    console.log("Available item IDs:", Array.from(allAvailableItems.keys()));
    
    // Add menu items to the map
    categories.forEach(category => {
      if (category && category.items && Array.isArray(category.items)) {
        category.items.forEach(item => {
          if (item && item.id && !allAvailableItems.has(item.id)) {
            allAvailableItems.set(item.id, {
              id: item.id,
              title: item.title,
              price: item.price,
              isAvailable: item.isAvailable !== false
            });
          }
        });
      }
    });
    
    const validatedItems = [];
    const errors = [];
    
    for (const cartItem of items) {
      console.log(`Validating cart item ID: ${cartItem.id}, looking for match...`);
      const currentItem = allAvailableItems.get(cartItem.id);
      
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
    const order = await kv.get(`order:${orderId}`);
    
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
      label: 'Cancelled' 
    });
    await kv.set(`order:${orderId}`, order);
    
    // Refund points if they were awarded
    const userData = await kv.get(`user:${userId}`);
    if (userData && order.pointsAwarded && order.pointsEarned) {
      userData.points = Math.max(0, (userData.points || 0) - order.pointsEarned);
      await kv.set(`user:${userId}`, userData);
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

// Request Password Reset
app.post("/make-server-e5e192fb/forgot-password", async (c) => {
  try {
    const { phone } = await c.req.json();
    
    if (!phone) {
      return c.json({ error: "Phone number is required" }, 400);
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 12) {
      return c.json({ error: "Phone number must be 10-12 digits" }, 400);
    }

    // Check if user exists
    const existingUsers = await kv.getByPrefix("user:");
    const user = existingUsers.find((u: any) => u.phone === phone || u.phone === phoneDigits);
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return c.json({ 
        success: true, 
        message: "If this phone number is registered, you will receive a password reset code" 
      });
    }

    // Generate a reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetToken = crypto.randomUUID();
    
    // Store reset token with expiration (15 minutes)
    await kv.set(`password_reset:${resetToken}`, {
      userId: user.id,
      phone: user.phone,
      code: resetCode,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
    
    // In production, you would send SMS here
    // For now, we'll return the code in the response (development only)
    console.log(`Password reset code for ${phone}: ${resetCode}`);
    
    return c.json({ 
      success: true, 
      message: "Password reset code sent",
      // DEVELOPMENT ONLY - remove in production
      resetCode, 
      resetToken
    });
  } catch (error) {
    console.log(`Forgot password error: ${error}`);
    return c.json({ error: "Failed to process password reset" }, 500);
  }
});

// Reset Password with Code
app.post("/make-server-e5e192fb/reset-password", async (c) => {
  try {
    const { resetToken, code, newPassword } = await c.req.json();
    
    if (!resetToken || !code || !newPassword) {
      return c.json({ error: "Reset token, code, and new password are required" }, 400);
    }

    const resetData = await kv.get(`password_reset:${resetToken}`);
    
    if (!resetData) {
      return c.json({ error: "Invalid or expired reset token" }, 400);
    }
    
    // Check expiration
    if (new Date() > new Date(resetData.expiresAt)) {
      await kv.del(`password_reset:${resetToken}`);
      return c.json({ error: "Reset code has expired" }, 400);
    }
    
    // Verify code
    if (resetData.code !== code) {
      return c.json({ error: "Invalid reset code" }, 400);
    }
    
    // Update password in Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    
    const { error } = await supabase.auth.admin.updateUserById(
      resetData.userId,
      { password: newPassword }
    );
    
    if (error) {
      console.log(`Reset password error: ${error.message}`);
      return c.json({ error: "Failed to reset password" }, 500);
    }
    
    // Delete used reset token
    await kv.del(`password_reset:${resetToken}`);
    
    return c.json({ 
      success: true, 
      message: "Password reset successfully" 
    });
  } catch (error) {
    console.log(`Reset password error: ${error}`);
    return c.json({ error: "Failed to reset password" }, 500);
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

    const orderId = c.req.param('id');
    const { status, paymentReceived, paymentDetails, cancellationReason } = await c.req.json();

    if (!status && paymentReceived === undefined) {
      return c.json({ error: "Status or paymentReceived is required" }, 400);
    }

    const order = await kv.get(`order:${orderId}`);
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
      order.status = "cancelled";
      order.cancelledAt = now;
      order.cancelledBy = "admin";
      if (cancellationReason) {
        order.cancellationReason = cancellationReason;
      }
      order.statusHistory.push({ 
        status: 'cancelled', 
        timestamp: now, 
        label: 'Cancelled by Admin' 
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
    
    // Update payment status if provided
    if (paymentReceived !== undefined) {
      order.paymentReceived = paymentReceived;
      if (paymentReceived && !order.statusHistory.find(h => h.status === 'payment_received')) {
        order.statusHistory.push({ 
          status: 'payment_received', 
          timestamp: now, 
          label: 'Payment Received' 
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
              label 
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
            label 
          });
        }
      }
      
      // Set order status
      // Kitchen staff will manually update confirmed -> cooking -> ready
      order.status = status;
    }
    
    order.updatedAt = now;
    
    // Award points if order is closed and payment received
    console.log(`🎁 Points check for order ${orderId}:`, {
      status: order.status,
      paymentReceived: order.paymentReceived,
      pointsAwarded: order.pointsAwarded,
      total: order.total
    });
    
    // Award points for registered users on delivered or closed status
    const shouldAwardPoints = (order.status === 'delivered' || (order.status === 'closed' && order.paymentReceived)) && !order.pointsAwarded && order.userId;
    if (shouldAwardPoints) {
      const pointsToAward = Math.floor(order.total / 1000);
      console.log(`🎁 Attempting to award ${pointsToAward} points to user ${order.userId} (status: ${order.status})`);
      
      if (pointsToAward > 0) {
        const userData = await kv.get(`user:${order.userId}`);
        
        if (userData) {
          const oldPoints = userData.points || 0;
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
        } else {
          console.error(`❌ Failed to find user ${order.userId} for points award`);
        }
      }
    } else {
      console.log(`⏭️ Skipping points award - conditions not met`);
    }
    
    await kv.set(`order:${orderId}`, order);

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
    const benefits = await kv.getByPrefix("tier_benefit:");
    return c.json({ benefits });
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

    const settings = await kv.get("restaurant_settings") || {
      acceptingOrders: true,
      maintenanceMode: false,
    };
    
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

// Check if restaurant is accepting orders (public endpoint)
app.get("/make-server-e5e192fb/restaurant-status", async (c) => {
  try {
    const settings = await kv.get("restaurant_settings");
    if (!settings) {
      return c.json({ isOpen: true, acceptingOrders: true });
    }

    // Check maintenance mode
    if (settings.maintenanceMode) {
      return c.json({ 
        isOpen: false, 
        acceptingOrders: false,
        reason: "Restaurant is temporarily closed for maintenance" 
      });
    }

    // Check if manually accepting orders
    if (!settings.acceptingOrders) {
      return c.json({ 
        isOpen: false, 
        acceptingOrders: false,
        reason: "Restaurant is not accepting orders at this time" 
      });
    }

    return c.json({ isOpen: true, acceptingOrders: true });
  } catch (error) {
    console.error("Get restaurant status error:", error);
    return c.json({ isOpen: true, acceptingOrders: true });
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
    
    // Get all orders
    const allOrders = (await kv.getByPrefix("order:")) || [];
    
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
    
    // Payment tracking - only count completed orders
    const paidOrders = completedOrders.filter((o: any) => o.paymentReceived === true);
    const unpaidOrders = completedOrders.filter((o: any) => !o.paymentReceived);
    
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

    // Get all data
    const allOrders = (await kv.getByPrefix("order:")) || [];
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
    
    // Payment analytics for completed orders
    const completedOrders = allOrders.filter((o: any) => 
      o.status === "delivered" || o.status === "completed" || o.status === "closed"
    );
    const paidOrders = completedOrders.filter((o: any) => o.paymentReceived === true);
    const unpaidOrders = completedOrders.filter((o: any) => !o.paymentReceived);
    
    const totalRevenueRealized = paidOrders.reduce((sum: number, order: any) => 
      sum + (order.total || 0), 0
    );
    const totalRevenuePending = unpaidOrders.reduce((sum: number, order: any) => 
      sum + (order.total || 0), 0
    );
    
    // Revenue by day of week
    const dayOfWeekRevenue = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
    };
    const dayOfWeekCounts = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
    };
    
    allOrders.forEach((order: any) => {
      if ((order.status === "delivered" || order.status === "completed" || order.status === "closed") && order.paymentReceived) {
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
    
    const orderNumber = `TNT${String(newCounter).padStart(8, '0')}`;
    
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
      
      // Status
      status: "confirmed", // Start at confirmed as per requirement
      
      // Payment
      paymentReceived: orderData.paymentReceived || false,
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
      auditLog: [
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
      statusHistory: [
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
      deliveryFee: order.deliveryFee,
      total: order.total,
      deliveryMethod: order.deliveryMethod,
      address: order.address,
      specialInstructions: order.specialInstructions,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      estimatedDelivery: order.estimatedDelivery,
      // Don't expose: phone, customerName, userId, admin notes, payment details
    };
    
    return c.json({ order: publicOrderData });
    
  } catch (error) {
    console.error(`❌ Track order error:`, error);
    return c.json({ error: "Failed to retrieve order" }, 500);
  }
});

// Start the server
Deno.serve(app.fetch);