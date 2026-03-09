# ✅ Pre-Deployment Checklist

Before deploying to Vercel, make sure you've completed these steps:

---

## 📋 Code Preparation

- [ ] All features tested locally
- [ ] No console errors in browser
- [ ] App builds successfully (`npm run build`)
- [ ] All TypeScript errors resolved
- [ ] No broken links or routes

---

## 🔐 Security & Configuration

- [ ] Admin credentials reviewed (currently: 9999999999 / admin123)
  - ⚠️ Consider changing for production
- [ ] Supabase project is active and accessible
- [ ] Edge Functions deployed and working
- [ ] CORS headers configured correctly
- [ ] No sensitive data in client-side code

---

## 🧪 Testing Checklist

### Guest Flow
- [ ] Browse all menu categories
- [ ] Add items to cart
- [ ] Update cart quantities
- [ ] Complete checkout as guest
- [ ] Receive order confirmation
- [ ] Track order without login
- [ ] WhatsApp link works

### Registered User Flow
- [ ] Sign up with phone number
- [ ] Sign in with credentials
- [ ] View profile
- [ ] Place order
- [ ] View order history
- [ ] Track active orders
- [ ] View rewards
- [ ] Earn points (after delivery)
- [ ] Sign out (test 2x to verify fix)

### Admin Flow
- [ ] Login with admin credentials (9999999999 / admin123)
- [ ] View all orders
- [ ] Confirm orders (auto-progress to cooking)
- [ ] Update order status
- [ ] Add menu items
- [ ] Edit menu items
- [ ] Enable/disable items
- [ ] Create rewards
- [ ] Toggle restaurant status
- [ ] View analytics

### Mobile Testing
- [ ] Test on mobile device (or DevTools mobile view)
- [ ] All buttons tappable (44px minimum)
- [ ] Scrolling works smoothly
- [ ] Forms work on mobile keyboard
- [ ] WhatsApp integration works on mobile

---

## 📦 Git & Repository

- [ ] Initialize git repository (`git init`)
- [ ] Add all files (`git add .`)
- [ ] Create initial commit (`git commit -m "Initial commit"`)
- [ ] Create GitHub/GitLab repository
- [ ] Add remote origin
- [ ] Push to main branch

```bash
git init
git add .
git commit -m "Initial commit - Tikka N Talk loyalty app"
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

---

## 🚀 Vercel Setup

- [ ] Vercel account created
- [ ] Repository imported to Vercel
- [ ] Build settings verified:
  - Framework: Vite (auto-detected)
  - Build Command: `npm run build`
  - Output Directory: `dist`
- [ ] No environment variables needed (already configured)

---

## 🌐 Backend Verification (Supabase)

- [ ] Supabase project active
- [ ] Edge Functions deployed
- [ ] Database accessible
- [ ] Auth service working
- [ ] Test API endpoints:
  - `/regular-menu` - Returns menu items
  - `/todays-special` - Returns specials
  - `/restaurant-status` - Returns open/closed status
  - `/signin` - Authentication works
  - `/orders` - Can create/fetch orders

Test with:
```bash
curl https://{projectId}.supabase.co/functions/v1/make-server-e5e192fb/restaurant-status \
  -H "Authorization: Bearer {publicAnonKey}"
```

---

## 📊 Performance Checks

- [ ] Build size acceptable (<5MB)
- [ ] No unused dependencies
- [ ] Images optimized
- [ ] No memory leaks in components
- [ ] Polling intervals reasonable (15s, 30s)

Check build size:
```bash
npm run build
# Check dist/ folder size
```

---

## 📱 Content Verification

- [ ] All text/copy is correct
- [ ] Restaurant info accurate:
  - Name: Tikka N Talk - AN INDIAN KITCHEN
  - Phone: 0819-2515-550
  - Address: Jl. Epicentrum Tengah No.3...
- [ ] WhatsApp link correct (628192515550)
- [ ] Menu items populated
- [ ] Rewards configured
- [ ] Loyalty tiers set up

---

## 🔄 Post-Deployment Testing

After deploying, test on the live URL:

- [ ] Visit production URL
- [ ] Test as guest (full flow)
- [ ] Test as registered user (full flow)
- [ ] Test as admin (full flow)
- [ ] Test on real mobile device
- [ ] Test WhatsApp integration
- [ ] Monitor Vercel logs
- [ ] Monitor Supabase logs
- [ ] Check for any console errors

---

## 📝 Documentation

- [ ] README.md reviewed
- [ ] TECH_STACK.md accurate
- [ ] DEPLOYMENT.md instructions clear
- [ ] VERCEL_QUICK_START.md tested

---

## 🎯 Optional Enhancements

- [ ] Add custom domain
- [ ] Enable Vercel Analytics
- [ ] Set up error monitoring (Sentry)
- [ ] Configure Google Analytics
- [ ] Add favicon
- [ ] Add Open Graph meta tags
- [ ] Set up monitoring alerts

---

## ⚠️ Common Issues to Check

### Build Fails
- Check for TypeScript errors
- Verify all imports are correct
- Ensure all dependencies installed

### Runtime Errors
- Check browser console
- Verify Supabase credentials
- Check network tab for failed requests

### Styling Issues
- Verify Tailwind CSS config
- Check theme.css loaded
- Test on different screen sizes

### Auth Issues
- Verify Supabase Auth enabled
- Check token storage in localStorage
- Test sign out (should work first time now!)

---

## 🎉 Ready to Deploy?

If all checkboxes are ✅, you're ready!

### Deploy Command
```bash
# Via Vercel CLI
vercel --prod

# Or just push to GitHub
git push origin main
# (Vercel will auto-deploy)
```

---

## 📞 Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **React Router**: https://reactrouter.com/en/main
- **Tailwind CSS**: https://tailwindcss.com/docs

---

## 🚨 Emergency Rollback

If something goes wrong after deployment:

1. Go to Vercel dashboard
2. Select your project
3. Click "Deployments"
4. Find previous working deployment
5. Click "..." → "Promote to Production"

---

**Good luck with your deployment!** 🚀
