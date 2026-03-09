# Deployment Guide - Tikka N Talk Restaurant App

## Prerequisites
- Supabase account (free tier works fine)
- Vercel/Netlify account (for frontend hosting - free tier available)
- Node.js installed locally
- Supabase CLI installed

## Step 1: Set Up Supabase Project

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in project details:
   - **Project Name**: `tikka-n-talk` (or your choice)
   - **Database Password**: Create a strong password (SAVE THIS!)
   - **Region**: Choose closest to your target users
4. Click "Create new project" and wait 2-3 minutes

### 1.2 Get Project Credentials
1. Go to **Project Settings → API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Project ID**: The `xxxxx` part from the URL
   - **anon/public key**: The long JWT token under "Project API keys" → anon/public
   - **service_role key**: Click "Reveal" next to service_role and copy it

3. Go to **Project Settings → Database**
   - Scroll to "Connection string" section
   - Select "URI" tab
   - Copy the connection string (replace `[YOUR-PASSWORD]` with your actual database password)

## Step 2: Update Project Files

### 2.1 Update Supabase Info File
Edit `/utils/supabase/info.tsx`:

```typescript
export const projectId = "YOUR_PROJECT_ID"
export const publicAnonKey = "YOUR_ANON_PUBLIC_KEY"
```

Replace with your actual values from Step 1.2

## Step 3: Set Up Supabase Environment Variables

### 3.1 Install Supabase CLI
```bash
npm install -g supabase
```

### 3.2 Login to Supabase
```bash
supabase login
```

### 3.3 Link Your Project
```bash
supabase link --project-ref YOUR_PROJECT_ID
```

### 3.4 Set Secrets for Edge Functions
You need to set these environment variables in Supabase:

```bash
# Set Supabase URL
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co

# Set Anon Key
supabase secrets set SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY

# Set Service Role Key (use the one from Project Settings → API)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# Set Database URL
supabase secrets set SUPABASE_DB_URL=YOUR_DATABASE_CONNECTION_STRING
```

**Replace all placeholder values with your actual credentials!**

## Step 4: Deploy Supabase Edge Functions

### 4.1 Deploy the Server Function
From your project root directory:

```bash
supabase functions deploy make-server-e5e192fb
```

This will deploy the backend API that handles:
- Authentication
- Orders
- Cart management
- Menu items
- Admin operations
- Vouchers

### 4.2 Verify Deployment
1. Go to Supabase Dashboard → Edge Functions
2. You should see `make-server-e5e192fb` listed as "Active"
3. The function URL will be: `https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-e5e192fb`

## Step 5: Deploy Frontend

### Option A: Deploy to Vercel (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```
   - Follow the prompts
   - Select "yes" to default settings
   - The build command should be: `npm run build`
   - Output directory: `dist`

4. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

### Option B: Deploy to Netlify

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**:
   ```bash
   netlify login
   ```

3. **Deploy**:
   ```bash
   netlify deploy --prod
   ```
   - Build command: `npm run build`
   - Publish directory: `dist`

### Option C: Manual Build and Host

1. **Build the project**:
   ```bash
   npm install
   npm run build
   ```

2. **Upload the `dist` folder** to any static hosting service:
   - GitHub Pages
   - Firebase Hosting
   - Cloudflare Pages
   - AWS S3 + CloudFront

## Step 6: Configure Admin Access

The admin credentials are hardcoded in the app:
- **Phone**: `9999999999`
- **Password**: `admin123`

To change these, edit `/supabase/functions/server/index.tsx` and search for "9999999999".

## Step 7: Test Your Deployment

### 7.1 Test Customer Flow
1. Visit your deployed frontend URL
2. Sign up with a phone number (10-12 digits)
3. Create your password
4. Browse menu and add items to cart
5. Place an order
6. Check Order Tracking

### 7.2 Test Admin Flow
1. Logout from customer account
2. Login with admin credentials:
   - Phone: `9999999999`
   - Password: `admin123`
3. Access Admin Panel
4. View orders, users, manage menu

## Step 8: WhatsApp Integration Setup

The app sends orders to WhatsApp number: **0819-2515-550**

To change this:
1. Edit `/src/app/pages/OrderConfirmation.tsx`
2. Search for `628192515550` (the WhatsApp number in international format)
3. Replace with your WhatsApp Business number

## Troubleshooting

### Issue: "Failed to fetch" or CORS errors
**Solution**: Make sure your Edge Function is deployed and secrets are set correctly.

### Issue: "Unauthorized" errors
**Solution**: 
1. Verify your environment variables in Supabase
2. Check that `/utils/supabase/info.tsx` has correct values
3. Redeploy edge functions after setting secrets

### Issue: Database errors
**Solution**: The app uses a Key-Value store that's automatically created. No manual database setup needed!

### Issue: Orders not showing up
**Solution**: 
1. Check browser console for errors
2. Verify Edge Function logs in Supabase Dashboard → Edge Functions → Logs
3. Make sure you're logged in with a valid account

## Production Checklist

Before going live:

- [ ] Replace Supabase credentials in `/utils/supabase/info.tsx`
- [ ] Deploy Edge Functions with all secrets set
- [ ] Test signup and login flow
- [ ] Test order placement
- [ ] Test admin panel access
- [ ] Update WhatsApp number to your business number
- [ ] Test on mobile devices
- [ ] Change admin password (recommended)
- [ ] Set up custom domain (optional)

## Environment Variables Summary

**Supabase Secrets (set via CLI):**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

**Frontend (in `/utils/supabase/info.tsx`):**
- `projectId`
- `publicAnonKey`

## Support

If you encounter issues:
1. Check Supabase Edge Function logs
2. Check browser console for frontend errors
3. Verify all credentials are correct
4. Ensure Edge Functions are deployed and active

## Cost Estimates

**Free Tier Limits:**
- Supabase: 500 MB database, 2 GB bandwidth, Edge Functions included
- Vercel: 100 GB bandwidth, unlimited personal projects
- Netlify: 100 GB bandwidth, 300 build minutes

This app should run comfortably within free tiers for small to medium traffic.

---

**Your app is now live! 🎉**

Access your restaurant app and start taking orders!