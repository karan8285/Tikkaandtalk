# Debugging: Guest Order to Account Linking

## Issue
Guest orders are not appearing in the Order History after a user creates an account from the OrderSuccess page.

## Changes Made

### 1. Backend Fixes (`/supabase/functions/server/index.tsx`)

**Key Fix:** Changed `orders:${user.id}` to `user_orders:${user.id}` for consistency (line ~1425)
- The system uses `user_orders:${userId}` everywhere else
- This was causing the order to be added to the wrong key

**Enhanced Logging:**
- Added JSON logging of order and user data
- Added phone number comparison logging
- Added step-by-step progress logging for the linking process
- All logs prefixed with 🔗 emoji for easy identification

**Link Endpoint Flow:**
1. Verify user is authenticated (access token)
2. Fetch order by ID
3. Verify order is not already linked
4. Fetch user data
5. Compare phone numbers (security check)
6. Update order with userId and linkedAt timestamp
7. Add order to `user_orders:${userId}` list
8. Remove order from `guest_orders:${phone}` list

### 2. Frontend Enhancements (`/src/app/pages/OrderSuccess.tsx`)

**Enhanced Debugging:**
- Added pre-link validation checks
- Added detailed logging of accessToken, order.id, and full order object
- Added API response status logging
- Added error stack trace logging
- Added loading toast notification ("Linking your order to your account...")

**Fixed Order Refresh:**
- Now correctly passes `userId` query parameter when refetching order
- Extracts userId from localStorage after account creation
- Properly handles the `{ order }` wrapper in response

**User Experience:**
- Shows loading toast during linking process
- Shows success toast with personalized message
- Gracefully handles errors without confusing the user

## Testing Checklist

When testing, check the browser console for these log messages:

### Expected Frontend Logs:
```
✅ Account created successfully, starting post-signup process...
📊 DEBUG - Pre-link check:
  - accessToken exists: true
  - order exists: true
  - order.id: <order-id>
  - Full order object: {...}
🔗 Attempting to link guest order to new user account...
🔗 Order ID: <order-id>
🔗 Access Token (first 30 chars): eyJhbGciOiJIUzI1NiIsInR5cCI...
🔗 API URL: https://...
🔗 Link API response status: 200
🔗 Link API response ok: true
✅ Guest order successfully linked to user account: {...}
🔄 Refreshing order data with userId: <user-id>
🔄 Order refresh response status: 200
✅ Order data refreshed with new user association: {...}
✅ Account creation process complete - user is now logged in!
```

### Expected Backend Logs:
```
🔗 Linking guest order <order-id> to user <user-id>
🔗 Order data: { ... }
🔗 User data: { ... }
🔗 Comparing phones - Order: 628XXXXXXXXX, User: 628XXXXXXXXX
✅ Phone numbers match! Proceeding with link...
🔗 Updating order <order-id> with userId <user-id>...
✅ Order updated in KV store
🔗 Current user orders: 0 orders
✅ Added order <order-id> to user's order list
✅ Updated guest orders list (0 remaining)
✅ Successfully linked order <order-id> to user <user-id>
```

## Common Issues

### Issue 1: Phone Number Mismatch
**Symptoms:** Log shows "Phone mismatch: order=XXX, user=YYY"
**Cause:** Guest used different phone format than account creation
**Solution:** Check both `order.phone` and `order.guestPhone` fields

### Issue 2: Access Token Not Available
**Symptoms:** Log shows "accessToken exists: false"
**Cause:** SignIn didn't complete or localStorage wasn't updated
**Solution:** Check auth flow and refreshProfile() completion

### Issue 3: Order ID Missing
**Symptoms:** Log shows "order.id: undefined"
**Cause:** Order wasn't fetched correctly or page state lost
**Solution:** Check order fetch logs earlier in the page load

### Issue 4: Wrong Key Prefix
**Symptoms:** Order linked successfully but doesn't show in Order History
**Cause:** Using `orders:${userId}` instead of `user_orders:${userId}`
**Solution:** ✅ FIXED - Now using consistent key prefix

## Verification Steps

After account creation from OrderSuccess page:

1. ✅ Check browser console for all expected frontend logs
2. ✅ Check backend logs (Supabase dashboard → Edge Functions → Logs)
3. ✅ Navigate to Order History page
4. ✅ Verify the guest order appears in the list
5. ✅ Check that order shows correct user association
6. ✅ Verify points will be awarded when order is delivered

## Key Files Modified

- `/supabase/functions/server/index.tsx` - Backend linking logic
- `/src/app/pages/OrderSuccess.tsx` - Frontend account creation and linking
- `/src/app/components/GuestAccountCreationDialog.tsx` - Account creation dialog

## Architecture

```
Guest Order Flow:
1. User places order as guest → order stored with guestPhone
2. Order stored in: order:${orderId}
3. Order ID added to: guest_orders:${phone}

Account Creation & Linking:
1. User creates account → stored in user:${userId}
2. Auto sign-in → accessToken stored in localStorage
3. Link API called with orderId and accessToken
4. Backend verifies phone matches
5. Order updated with userId field
6. Order ID moved from guest_orders:${phone} to user_orders:${userId}

Order History Display:
1. Fetches user_orders:${userId} to get order IDs
2. Fetches each order:${orderId}
3. Displays all orders for the user
```

## Notes

- The linking process is automatic - no user action required
- Phone numbers are normalized (only digits) for comparison
- Guest orders can still be tracked via guest tracking page until linked
- After linking, order can only be accessed through authenticated user account
