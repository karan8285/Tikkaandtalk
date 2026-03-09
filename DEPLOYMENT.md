# Deployment Guide - Tikka N Talk

## 📋 Tech Stack

### Frontend
- **React 18.3.1** - UI library
- **TypeScript/TSX** - Type-safe JavaScript
- **React Router 7** - Client-side routing with data mode
- **Tailwind CSS v4** - Utility-first CSS framework
- **Vite 6.3.5** - Build tool and development server
- **Lucide React** - Beautiful icon library
- **Radix UI** - Accessible component primitives
- **Sonner** - Toast notifications
- **Motion** - Animation library

### Backend
- **Supabase** - Backend-as-a-Service
  - PostgreSQL Database (with KV store)
  - Edge Functions (Deno runtime with Hono framework)
  - Authentication (phone/email, social login)
  - Storage (file uploads)
- **Hono** - Fast web framework for Supabase Edge Functions

### State Management
- React Context API (Auth & Cart)
- localStorage (for persistence)

---

## 🚀 Deploy to Vercel

### Prerequisites
1. A Vercel account (sign up at https://vercel.com)
2. Git repository with your code
3. Supabase project (your backend is already running there)

### Step-by-Step Instructions

#### 1. Push Your Code to Git
```bash
# Initialize git if you haven't already
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Tikka N Talk app"

# Add remote (GitHub, GitLab, or Bitbucket)
git remote add origin YOUR_REPOSITORY_URL

# Push to main branch
git push -u origin main
```

#### 2. Import Project to Vercel

**Option A: Using Vercel Website**
1. Go to https://vercel.com/new
2. Import your Git repository
3. Configure project:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

**Option B: Using Vercel CLI**
```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# For production deployment
vercel --prod
```

#### 3. Environment Variables (Not Required)
Your app uses Supabase info from `/utils/supabase/info` which is already configured. No additional environment variables needed for the frontend.

#### 4. Deploy! 🎉
Click "Deploy" and wait for the build to complete.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Vercel                         │
│  ┌───────────────────────────────────────────┐  │
│  │   React Frontend (SPA)                    │  │
│  │   - React Router                          │  │
│  │   - Tailwind CSS                          │  │
│  │   - Auth Context                          │  │
│  │   - Cart Context                          │  │
│  └───────────────┬───────────────────────────┘  │
└──────────────────┼──────────────────────────────┘
                   │
                   │ API Calls
                   │
┌──────────────────▼──────────────────────────────┐
│              Supabase                            │
│  ┌─────────────────────────────────────────┐    │
│  │   Edge Functions (Deno + Hono)          │    │
│  │   /make-server-e5e192fb/*               │    │
│  │   - /signup, /signin                    │    │
│  │   - /orders, /rewards                   │    │
│  │   - /menu management                    │    │
│  │   - /admin endpoints                    │    │
│  └──────────────┬──────────────────────────┘    │
│                 │                                │
│  ┌──────────────▼──────────────────────────┐    │
│  │   PostgreSQL Database                   │    │
│  │   - kv_store_e5e192fb (main table)     │    │
│  │   - User data, orders, menu, etc.       │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │   Auth Service                          │    │
│  │   - Phone/email authentication          │    │
│  │   - Session management                  │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │   Storage                               │    │
│  │   - File uploads (if needed)            │    │
│  └─────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

---

## 🔧 Important Notes

### Backend Stays on Supabase
- The backend (Edge Functions) runs on Supabase, not Vercel
- This is by design - Supabase Edge Functions use Deno runtime
- Your frontend on Vercel will make API calls to Supabase endpoints
- URL format: `https://{projectId}.supabase.co/functions/v1/make-server-e5e192fb/*`

### CORS Configuration
- Your Supabase Edge Functions already include CORS headers
- Update CORS origin if needed to include your Vercel domain
- Example: `https://tikka-n-talk.vercel.app`

### Custom Domain (Optional)
1. In Vercel dashboard, go to your project
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

---

## 📊 Performance Optimizations

Already configured in the app:
- ✅ Route-based code splitting
- ✅ Lazy loading for routes
- ✅ Optimized bundle with Vite
- ✅ Image optimization with Unsplash
- ✅ localStorage caching for auth/cart
- ✅ Polling with 15s intervals (not too aggressive)
- ✅ Request timeouts (10s for non-critical APIs)

---

## 🐛 Troubleshooting

### Build Fails
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Runtime Errors
- Check browser console for errors
- Verify Supabase Edge Functions are running
- Check network tab for failed API calls

### Environment Issues
- Ensure `/utils/supabase/info` exists and has correct credentials
- Check Supabase project is active and not paused

---

## 📱 Post-Deployment Checklist

- [ ] Test user registration and login
- [ ] Test guest checkout flow
- [ ] Test order placement and tracking
- [ ] Test admin dashboard (phone: 9999999999, password: admin123)
- [ ] Test menu browsing (all categories)
- [ ] Test cart functionality
- [ ] Test WhatsApp integration
- [ ] Test on mobile devices
- [ ] Configure custom domain (optional)
- [ ] Set up monitoring/analytics (optional)

---

## 🔐 Security Notes

1. **Supabase Credentials**: Already secured in protected files
2. **Admin Access**: Hardcoded credentials should be changed for production
3. **API Keys**: Service role key stays on backend only
4. **HTTPS**: Automatically enabled by Vercel
5. **CORS**: Configured in Supabase Edge Functions

---

## 📈 Monitoring (Recommended)

Consider adding:
- **Vercel Analytics**: Built-in, free tier available
- **Sentry**: Error tracking
- **Google Analytics**: User behavior tracking
- **Supabase Logs**: Monitor backend performance

---

## 🆘 Support

For issues:
1. Check Vercel deployment logs
2. Check Supabase Edge Function logs
3. Review browser console errors
4. Verify network requests in DevTools

---

## 🎉 That's It!

Your app is now live on Vercel with the backend running on Supabase Edge Functions!
