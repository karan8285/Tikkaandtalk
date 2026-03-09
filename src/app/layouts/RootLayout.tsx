import { Outlet } from "react-router";
import { AuthProvider } from "../lib/auth";
import { CartProvider } from "../lib/cart";

function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
        <Outlet />
      </CartProvider>
    </AuthProvider>
  );
}

RootLayout.displayName = 'RootLayout';

export default RootLayout;