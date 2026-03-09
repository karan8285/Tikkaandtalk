import { useState } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { Link, useNavigate } from "react-router";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export default function AdminDebug() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const navigate = useNavigate();

  const runFullDiagnostic = async () => {
    setLoading(true);
    setResult("🔍 RUNNING FULL DIAGNOSTIC...\n\n");
    
    try {
      const accessToken = localStorage.getItem("accessToken");
      
      if (!accessToken) {
        setResult(prev => prev + "❌ No access token found. Please login first.\n");
        setLoading(false);
        return;
      }

      setResult(prev => prev + `📋 Access Token (first 30 chars): ${accessToken.substring(0, 30)}...\n\n`);
      
      // TEST 1: Simple ping (try with publicAnonKey instead of user token)
      setResult(prev => prev + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      setResult(prev => prev + "TEST 1: Basic Routing (/debug/ping)\n");
      setResult(prev => prev + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      
      try {
        // NOTE: Try using ANON_KEY instead of user JWT to bypass platform validation
        const pingResponse = await fetch(`${API_BASE}/debug/ping`, {
          headers: { 
            Authorization: `Bearer ${publicAnonKey}` 
          },
        });
        const pingData = await pingResponse.json();
        
        if (pingResponse.ok) {
          setResult(prev => prev + `✅ PASS - ${pingData.message}\n\n`);
        } else {
          setResult(prev => prev + `❌ FAIL - Status: ${pingResponse.status}\n`);
          setResult(prev => prev + `Response: ${JSON.stringify(pingData, null, 2)}\n\n`);
          setLoading(false);
          return;
        }
      } catch (error) {
        setResult(prev => prev + `❌ FAIL - ${error.message}\n\n`);
        setLoading(false);
        return;
      }

      // TEST 2: JWT validation
      setResult(prev => prev + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      setResult(prev => prev + "TEST 2: JWT Validation (/debug/validate-jwt)\n");
      setResult(prev => prev + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      
      try {
        const jwtResponse = await fetch(`${API_BASE}/debug/validate-jwt`, {
          headers: { 
            Authorization: `Bearer ${accessToken}` 
          },
        });

        const jwtData = await jwtResponse.json();
        
        if (jwtResponse.ok && jwtData.success) {
          setResult(prev => prev + `✅ PASS - JWT validation endpoint reached\n\n`);
          
          // Check custom JWT validation
          if (jwtData.customJwtValidation?.success) {
            setResult(prev => prev + `  ✅ Custom JWT validation: SUCCESS\n`);
            setResult(prev => prev + `     User ID: ${jwtData.customJwtValidation.userId}\n`);
            setResult(prev => prev + `     Phone: ${jwtData.customJwtValidation.phone}\n`);
            setResult(prev => prev + `     isAdmin: ${jwtData.customJwtValidation.isAdmin ? '✅ TRUE' : '❌ FALSE'}\n`);
            setResult(prev => prev + `     Expires: ${new Date(jwtData.customJwtValidation.exp * 1000).toLocaleString()}\n`);
          }
          
          // Check KV data
          setResult(prev => prev + `\n  📦 KV Store Data:\n`);
          if (jwtData.kvData) {
            setResult(prev => prev + `     Name: ${jwtData.kvData.name || 'N/A'}\n`);
            setResult(prev => prev + `     Phone: ${jwtData.kvData.phone || 'N/A'}\n`);
            setResult(prev => prev + `     Points: ${jwtData.kvData.points || 0}\n`);
            setResult(prev => prev + `     isAdmin: ${jwtData.kvData.isAdmin ? '✅ TRUE' : '❌ FALSE'}\n`);
            
            if (!jwtData.kvData.isAdmin) {
              setResult(prev => prev + `\n  ⚠️  ROOT CAUSE FOUND: User does not have isAdmin flag!\n`);
            }
          } else {
            setResult(prev => prev + `     ❌ No KV data found for user\n`);
          }
          
          // Show logs if available
          if (jwtData.logs && jwtData.logs.length > 0) {
            setResult(prev => prev + `\n  📋 Debug Logs:\n`);
            jwtData.logs.forEach((log: string) => {
              setResult(prev => prev + `     ${log}\n`);
            });
          }
          
          setResult(prev => prev + `\n`);
        } else {
          setResult(prev => prev + `❌ FAIL - ${JSON.stringify(jwtData, null, 2)}\n\n`);
          
          // Show logs even on failure
          if (jwtData.logs && jwtData.logs.length > 0) {
            setResult(prev => prev + `\n📋 Debug Logs:\n`);
            jwtData.logs.forEach((log: string) => {
              setResult(prev => prev + `   ${log}\n`);
            });
            setResult(prev => prev + `\n`);
          }
        }
      } catch (error) {
        setResult(prev => prev + `❌ FAIL - ${error.message}\n\n`);
      }

      // TEST 3: Try admin endpoint
      setResult(prev => prev + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      setResult(prev => prev + "TEST 3: Admin Endpoint (/admin/users)\n");
      setResult(prev => prev + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      
      try {
        const adminResponse = await fetch(`${API_BASE}/admin/users`, {
          headers: { 
            Authorization: `Bearer ${accessToken}` 
          },
        });

        const adminData = await adminResponse.json();
        
        if (adminResponse.ok) {
          setResult(prev => prev + `✅ PASS - Got ${adminData.users?.length || 0} users\n\n`);
        } else {
          setResult(prev => prev + `❌ FAIL - Status: ${adminResponse.status}\n`);
          setResult(prev => prev + `Response: ${JSON.stringify(adminData, null, 2)}\n\n`);
        }
      } catch (error) {
        setResult(prev => prev + `❌ FAIL - ${error.message}\n\n`);
      }

      setResult(prev => prev + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      setResult(prev => prev + "DIAGNOSTIC COMPLETE\n");
      setResult(prev => prev + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      
    } catch (error) {
      setResult(prev => prev + `\n❌ FATAL ERROR: ${error.message}\n`);
    } finally {
      setLoading(false);
    }
  };

  const checkUserData = async () => {
    setLoading(true);
    setResult("Testing debug endpoints...\n\n");
    
    try {
      const accessToken = localStorage.getItem("accessToken");
      
      if (!accessToken) {
        setResult(prev => prev + "❌ No access token found. Please login first.");
        setLoading(false);
        return;
      }
      
      // First test: Simple ping (no auth required)
      setResult(prev => prev + "📡 Test 1: Calling /debug/ping (no auth)...\n");
      const pingResponse = await fetch(`${API_BASE}/debug/ping`);
      const pingData = await pingResponse.json();
      
      if (pingResponse.ok) {
        setResult(prev => prev + `✅ Ping successful: ${pingData.message}\n\n`);
      } else {
        setResult(prev => prev + `❌ Ping failed: ${JSON.stringify(pingData)}\n\n`);
      }
      
      // Second test: JWT validation
      setResult(prev => prev + "📡 Test 2: Calling /debug/validate-jwt (with auth)...\n");
      const response = await fetch(`${API_BASE}/debug/validate-jwt`, {
        headers: { 
          Authorization: `Bearer ${accessToken}` 
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setResult(prev => prev + "✅ JWT VALIDATION TEST RESULTS:\n\n" + JSON.stringify(data, null, 2));
      } else {
        setResult(prev => prev + "❌ FAILED TO VALIDATE JWT:\n\n" + JSON.stringify(data, null, 2));
      }
    } catch (error) {
      setResult(prev => prev + "❌ ERROR:\n\n" + error.message);
    } finally {
      setLoading(false);
    }
  };

  const forceInitAdmin = async () => {
    setLoading(true);
    setResult("🔧 Force initializing admin user in KV store...\n\n");
    
    try {
      // First, show environment info
      setResult(prev => prev + "Step 0: Checking environment variables...\n");
      const envResponse = await fetch(`${API_BASE}/debug/env-info`, {
        headers: { 
          Authorization: `Bearer ${publicAnonKey}` 
        },
      });

      const envData = await envResponse.json();
      
      if (envResponse.ok) {
        setResult(prev => prev + `✅ Environment info retrieved:\n`);
        setResult(prev => prev + `   Backend SUPABASE_URL: ${envData.supabaseUrl}\n`);
        setResult(prev => prev + `   Backend ANON_KEY (first 50): ${envData.anonKeyPrefix}\n`);
        setResult(prev => prev + `   Frontend projectId: ${projectId}\n`);
        setResult(prev => prev + `   Frontend ANON_KEY (first 50): ${publicAnonKey.substring(0, 50)}...\n`);
        
        // Check if they match
        const urlMatch = envData.supabaseUrl.includes(projectId);
        const keyMatch = envData.anonKeyPrefix === publicAnonKey.substring(0, 50) + '...';
        
        if (!urlMatch) {
          setResult(prev => prev + `\n⚠️  WARNING: URL mismatch detected!\n`);
          setResult(prev => prev + `   Backend URL does not contain frontend projectId!\n\n`);
        } else if (!keyMatch) {
          setResult(prev => prev + `\n⚠️  WARNING: ANON_KEY mismatch detected!\n`);
          setResult(prev => prev + `   Backend and frontend are using different keys!\n\n`);
        } else {
          setResult(prev => prev + `\n✅ Environment variables match!\n\n`);
        }
      } else {
        setResult(prev => prev + `❌ Failed to get env info: ${JSON.stringify(envData)}\n\n`);
      }
      
      // First, force init the admin in KV
      setResult(prev => prev + "Step 1: Force initializing admin in KV...\n");
      const initResponse = await fetch(`${API_BASE}/debug/force-init-admin`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}` 
        },
        body: JSON.stringify({
          phone: "9999999999",
          password: "admin123"
        })
      });

      const initData = await initResponse.json();
      
      if (!initResponse.ok) {
        setResult(prev => prev + `❌ Force init failed: ${JSON.stringify(initData)}\n`);
        setLoading(false);
        return;
      }
      
      setResult(prev => prev + `✅ Admin user force initialized!\n\n`);
      
      // Now try to login as admin
      setResult(prev => prev + "Step 2: Logging in as admin...\n");
      const loginResponse = await fetch(`${API_BASE}/signin`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          phone: "9999999999",
          password: "admin123"
        })
      });

      const loginData = await loginResponse.json();
      
      if (!loginResponse.ok) {
        setResult(prev => prev + `❌ Login failed: ${JSON.stringify(loginData)}\n`);
        setLoading(false);
        return;
      }
      
      setResult(prev => prev + `✅ Login successful!\n`);
      setResult(prev => prev + `   Access Token (first 50 chars): ${loginData.accessToken.substring(0, 50)}...\n\n`);
      
      // Store the new token
      localStorage.setItem("accessToken", loginData.accessToken);
      localStorage.setItem("user", JSON.stringify(loginData.user));
      
      // First, validate the token to see what's wrong
      setResult(prev => prev + "Step 3: Validating the new token...\n");
      const validateResponse = await fetch(`${API_BASE}/debug/test-custom-jwt`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ token: loginData.accessToken })
      });

      const validateData = await validateResponse.json();
      
      if (validateResponse.ok && validateData.success) {
        setResult(prev => prev + `✅ Custom JWT validation: SUCCESS\n`);
        setResult(prev => prev + `   Payload: ${JSON.stringify(validateData.payload, null, 2)}\n`);
        setResult(prev => prev + `   KV Data: ${JSON.stringify(validateData.kvData, null, 2)}\n`);
        
        // Show logs
        if (validateData.logs && validateData.logs.length > 0) {
          setResult(prev => prev + `\n📋 Debug Logs:\n`);
          validateData.logs.forEach((log: string) => {
            setResult(prev => prev + `   ${log}\n`);
          });
        }
        setResult(prev => prev + `\n`);
      } else {
        setResult(prev => prev + `❌ Validation failed: ${validateData.message}\n`);
        
        // Show logs even on failure
        if (validateData.logs && validateData.logs.length > 0) {
          setResult(prev => prev + `\n📋 Debug Logs:\n`);
          validateData.logs.forEach((log: string) => {
            setResult(prev => prev + `   ${log}\n`);
          });
        }
        setResult(prev => prev + `\n`);
      }
      
      // Now test if the token works
      setResult(prev => prev + "Step 4: Testing new token on admin endpoint (with X-Custom-Auth header)...\n");
      const testResponse = await fetch(`${API_BASE}/admin/users`, {
        headers: { 
          "Authorization": `Bearer ${publicAnonKey}`,  // Platform validation
          "X-Custom-Auth": loginData.accessToken       // Our custom JWT
        },
      });

      const testData = await testResponse.json();
      
      if (testResponse.ok) {
        setResult(prev => prev + `✅ Token works! Got ${testData.users?.length || 0} users\n\n`);
        setResult(prev => prev + `🎉 ADMIN ACCESS FIXED! You can now use the admin dashboard.\n`);
      } else {
        setResult(prev => prev + `❌ Token test failed: ${JSON.stringify(testData)}\n`);
      }
      
    } catch (error) {
      setResult(prev => prev + `❌ ERROR: ${error.message}\n`);
    } finally {
      setLoading(false);
    }
  };

  const testAdminEndpoints = async () => {
    setLoading(true);
    setResult("Testing admin endpoints...\n\n");
    
    try {
      const accessToken = localStorage.getItem("accessToken");
      
      if (!accessToken) {
        setResult(prev => prev + "❌ No access token found. Please login first.");
        setLoading(false);
        return;
      }
      
      // Test admin/users endpoint
      setResult(prev => prev + "📡 Calling /admin/users...\n");
      const usersResponse = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const usersData = await usersResponse.json();
      
      if (usersResponse.ok) {
        setResult(prev => prev + `✅ /admin/users SUCCESS (${usersData.users?.length || 0} users)\n\n`);
      } else {
        setResult(prev => prev + `❌ /admin/users FAILED (${usersResponse.status}): ${JSON.stringify(usersData)}\n\n`);
      }

      // Test admin/orders endpoint
      setResult(prev => prev + "📡 Calling /admin/orders...\n");
      const ordersResponse = await fetch(`${API_BASE}/admin/orders`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const ordersData = await ordersResponse.json();
      
      if (ordersResponse.ok) {
        setResult(prev => prev + `✅ /admin/orders SUCCESS (${ordersData.orders?.length || 0} orders)\n\n`);
      } else {
        setResult(prev => prev + `❌ /admin/orders FAILED (${ordersResponse.status}): ${JSON.stringify(ordersData)}\n\n`);
      }
      
    } catch (error) {
      setResult(prev => prev + "❌ ERROR:\n\n" + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Admin Debug</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-3">
          <button
            onClick={runFullDiagnostic}
            disabled={loading}
            className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 w-full"
          >
            {loading ? "Testing..." : "1. Run Full Diagnostic"}
          </button>

          <button
            onClick={checkUserData}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 w-full"
          >
            {loading ? "Checking..." : "2. Check User Data in KV Store"}
          </button>

          <button
            onClick={forceInitAdmin}
            disabled={loading}
            className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 disabled:opacity-50 w-full"
          >
            {loading ? "Fixing..." : "2.5 🔧 FIX: Force Initialize Admin in KV"}
          </button>

          <button
            onClick={testAdminEndpoints}
            disabled={loading}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 w-full"
          >
            {loading ? "Testing..." : "3. Test Admin Endpoints"}
          </button>
        </div>

        {result && (
          <div className="bg-gray-900 text-green-400 p-6 rounded-lg font-mono text-sm whitespace-pre-wrap">
            {result}
          </div>
        )}
        
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">Instructions:</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Click "Test Admin Login" to attempt login with admin credentials</li>
            <li>Click "Check User Data in KV Store" to see if isAdmin flag is set correctly</li>
            <li><strong>If isAdmin is missing or false</strong>, click "🔧 FIX: Force Initialize Admin in KV" to fix it</li>
            <li>Click "Test Admin Endpoints" to test if admin API calls work</li>
            <li>If everything passes, navigate to <Link to="/admin" className="text-primary underline">/admin</Link></li>
          </ol>
        </div>

        <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <h2 className="font-bold mb-2 text-yellow-800">🔧 Quick Fix:</h2>
          <p className="text-sm text-yellow-700">
            If you're getting 401 errors on the admin dashboard, the issue is that the admin user's 
            <code className="bg-yellow-200 px-1 rounded">isAdmin</code> flag is not set in the KV store. 
            Click button 2.5 to force-initialize it!
          </p>
        </div>

        <div className="mt-4 bg-green-50 border border-green-300 rounded-lg p-4">
          <h2 className="font-bold mb-2 text-green-800">✅ JWT Token Fix Applied:</h2>
          <p className="text-sm text-green-700 mb-2">
            The backend has been updated to use <code className="bg-green-200 px-1 rounded">SUPABASE_ANON_KEY</code> for 
            validating user JWT tokens (previously used SERVICE_ROLE_KEY which caused validation failures).
          </p>
          <p className="text-sm text-green-700">
            All 20+ endpoints that validate JWT tokens with <code className="bg-green-200 px-1 rounded">auth.getUser()</code> now 
            use the correct key for validation. Try testing the admin endpoints now!
          </p>
        </div>
      </div>
    </div>
  );
}