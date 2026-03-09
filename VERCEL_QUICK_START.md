# 🚀 Vercel Deployment - Quick Start

## Option 1: Deploy via Vercel Website (Easiest)

### Step 1: Push to GitHub
```bash
# If not already using git
git init
git add .
git commit -m "Ready for Vercel deployment"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/tikka-n-talk.git
git branch -M main
git push -u origin main
```

### Step 2: Import to Vercel
1. Go to https://vercel.com
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Vercel will auto-detect Vite configuration
5. Click "Deploy"

**That's it!** ✨ Your app will be live in ~2 minutes.

---

## Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy (first time - will ask questions)
vercel

# Deploy to production
vercel --prod
```

---

## 📋 Configuration (Auto-Detected)

Vercel will automatically detect:
- ✅ **Framework**: Vite
- ✅ **Build Command**: `npm run build`
- ✅ **Output Directory**: `dist`
- ✅ **Install Command**: `npm install`

No manual configuration needed! The `vercel.json` file is already set up.

---

## 🔗 After Deployment

Your app will be available at:
```
https://your-project-name.vercel.app
```

### Test These Features:
1. ✅ Browse menu categories
2. ✅ Add items to cart
3. ✅ Guest checkout
4. ✅ User registration/login
5. ✅ Order tracking
6. ✅ Admin dashboard (9999999999 / admin123)

---

## ⚙️ Important: Backend Configuration

Your **backend stays on Supabase** (already configured):
- Edge Functions: `https://{projectId}.supabase.co/functions/v1/make-server-e5e192fb/*`
- Database: Supabase PostgreSQL
- Auth: Supabase Auth
- Storage: Supabase Storage

**No additional backend setup needed!** 🎉

---

## 🌐 Custom Domain (Optional)

1. In Vercel dashboard → Your Project
2. Go to "Settings" → "Domains"
3. Add your domain (e.g., `tikkantalк.com`)
4. Update DNS records as instructed
5. SSL certificate is automatic

---

## 📊 Monitoring

Vercel provides:
- Real-time deployment logs
- Function logs (if you add any)
- Analytics (free tier available)
- Performance insights

Access via: Dashboard → Your Project → Analytics

---

## 🐛 Troubleshooting

### Build Failed?
```bash
# Test build locally first
npm run build

# If successful, push and redeploy
git add .
git commit -m "Fix build"
git push
```

### App Not Loading?
1. Check Vercel deployment logs
2. Check browser console (F12)
3. Verify Supabase is active
4. Check network requests

### Need to Redeploy?
```bash
# Via CLI
vercel --prod

# Via GitHub
# Just push to main branch - auto-deploys!
git push
```

---

## 💡 Pro Tips

1. **Auto-Deploy**: Every push to `main` branch auto-deploys
2. **Preview Deployments**: Every PR gets a preview URL
3. **Rollback**: Can rollback to any previous deployment
4. **Environment**: Already configured, no env vars needed
5. **Free Tier**: Perfect for this app's traffic

---

## 📞 Support

- Vercel Docs: https://vercel.com/docs
- Supabase Docs: https://supabase.com/docs
- This project uses: React Router v7 + Vite + Tailwind CSS v4

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Imported to Vercel
- [ ] Deployment successful
- [ ] Test app functionality
- [ ] (Optional) Add custom domain
- [ ] (Optional) Enable analytics

**You're ready to go live!** 🎊
