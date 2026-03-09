# Tikka N Talk - Indian Restaurant Loyalty App

A complete mobile-first loyalty program application with mobile number authentication, order management, rewards system, and admin dashboard.

## Features

### User Features
- **Mobile Authentication**: Sign up and sign in with phone number + password
- **Browse Specials**: View today's special offers with discounts
- **Place Orders**: Select pickup, delivery, or dine-in options
- **Order History**: Track all your past orders
- **Loyalty Points**: Earn 50 points per order
- **Tier System**: Progress through Silver, Gold, and Diamond tiers
- **Rewards Redemption**: Redeem points for discounts and free items

### Admin Features
- **Dashboard Overview**: View total users, orders, and revenue
- **User Management**: See all registered users and their points
- **Order Management**: Track all orders across the platform

## Getting Started

### 1. Create an Account
- Go to `/signup`
- Enter your name, mobile number (10 digits), and password
- **For Admin Access**: Use a phone number starting with 9999 (e.g., 9999-123-4567)

### 2. Sign In
- Go to `/login`
- Enter your mobile number and password
- Phone numbers are automatically formatted as you type (XXX-XXX-XXXX)

### 3. Browse and Order
- View today's special offers on the home page
- Click "Unlock" to start an order
- Select order type (pickup, delivery, or dine-in)
- Confirm and place your order

### 4. Earn Points
- Each order earns you 50 loyalty points
- Track your progress in the tier system
- Silver: 0-499 points
- Gold: 500-999 points
- Diamond: 1000+ points

### 5. Redeem Rewards
- Visit `/rewards` to see available rewards
- Redeem points for:
  - Free Appetizer (100 points)
  - 10% Off Next Order (150 points)
  - Free Main Course (300 points)
  - 25% Off Entire Bill (500 points)

### 6. Admin Dashboard (Admin Only)
- Access at `/admin`
- View statistics and analytics
- Manage users and orders
- Track revenue and growth

## Technical Stack

### Frontend
- React with TypeScript
- React Router for navigation
- Tailwind CSS for styling
- Lucide React for icons

### Backend
- Supabase for authentication
- Hono web server (Deno Edge Functions)
- Key-Value store for data persistence

### Authentication Flow
- Sign up creates a new user account
- Sign in generates an access token
- Protected routes require authentication
- Admin routes check for admin privileges

## API Endpoints

### Public
- `POST /signup` - Create new user account
- `POST /signin` - Sign in and get access token

### Protected (Requires Authentication)
- `GET /profile` - Get user profile
- `POST /orders` - Create new order
- `GET /orders` - Get user's order history
- `POST /redeem-points` - Redeem loyalty points

### Admin (Requires Admin Access)
- `GET /admin/users` - Get all users
- `GET /admin/orders` - Get all orders

## Notes

- Phone number starting with 9999 automatically gets admin privileges
- Orders are automatically confirmed and award 50 points
- Points are immediately available for redemption
- All data is stored in Supabase KV store
- Authentication tokens are stored in localStorage