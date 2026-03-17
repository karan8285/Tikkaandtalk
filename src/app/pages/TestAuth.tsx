import { useState } from "react";
import { Button } from "../components/ui/button";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";

export default function TestAuth() {
  const [testResults, setTestResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testConnection = async () => {
    setTestResults([]);
    addResult("🚀 Starting connection test...");
    
    // Test 1: Check Supabase info
    addResult(`✅ Project ID: ${projectId}`);
    addResult(`✅ Public Key length: ${publicAnonKey.length} chars`);
    
    // Test 2: Test health endpoint
    try {
      const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
      addResult(`📡 Testing health endpoint: ${API_BASE}/health`);
      
      const healthResponse = await fetchWithRetry(`${API_BASE}/health`);
      addResult(`✅ Health check status: ${healthResponse.status}`);
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        addResult(`✅ Health check response: ${JSON.stringify(healthData)}`);
      }
    } catch (error) {
      addResult(`❌ Health check failed: ${error}`);
    }
    
    // Test 3: Test signup with random user
    try {
      const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
      const testPhone = `555${Math.floor(Math.random() * 1000000).toString().padStart(7, '0')}`;
      addResult(`📝 Testing signup with phone: ${testPhone}`);
      
      const signupResponse = await fetchWithRetry(`${API_BASE}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          phone: testPhone,
          pin: "123456",
          name: "Test User"
        }),
      });
      
      addResult(`📝 Signup response status: ${signupResponse.status}`);
      const signupData = await signupResponse.json();
      addResult(`📝 Signup response: ${JSON.stringify(signupData, null, 2)}`);
      
      if (signupResponse.ok) {
        // Test 4: Test signin with the same user
        addResult(`🔐 Testing signin with same credentials...`);
        
        const signinResponse = await fetchWithRetry(`${API_BASE}/signin`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            phone: testPhone,
            pin: "123456",
          }),
        });
        
        addResult(`🔐 Signin response status: ${signinResponse.status}`);
        const signinData = await signinResponse.json();
        addResult(`🔐 Signin response: ${JSON.stringify(signinData, null, 2)}`);
        
        if (signinResponse.ok && signinData.accessToken) {
          addResult(`✅ Token received! Length: ${signinData.accessToken.length}`);
          addResult(`✅ ALL TESTS PASSED! Authentication is working.`);
        } else {
          addResult(`❌ Signin failed even though signup succeeded`);
        }
      } else {
        addResult(`❌ Signup failed: ${signupData.error}`);
      }
    } catch (error) {
      addResult(`❌ Signup/signin test failed: ${error}`);
    }
    
    // Test 5: Test admin login
    try {
      const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
      addResult(`👑 Testing admin login with +629999999999...`);
      
      const adminSigninResponse = await fetchWithRetry(`${API_BASE}/signin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          phone: "+629999999999",
          pin: "999999",
        }),
      });
      
      addResult(`👑 Admin signin status: ${adminSigninResponse.status}`);
      const adminData = await adminSigninResponse.json();
      addResult(`👑 Admin signin response: ${JSON.stringify(adminData, null, 2)}`);
      
      if (adminSigninResponse.ok) {
        addResult(`✅ Admin login successful! isAdmin: ${adminData.user?.isAdmin}`);
      } else {
        addResult(`❌ Admin login failed: ${adminData.error}`);
      }
    } catch (error) {
      addResult(`❌ Admin login test failed: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
          <h1 className="text-2xl font-bold mb-4">Authentication Test Page</h1>
          <p className="text-muted-foreground mb-6">
            This page tests the authentication system to diagnose any issues.
          </p>
          
          <Button 
            onClick={testConnection}
            className="mb-6 bg-primary hover:bg-primary/90"
          >
            Run Authentication Tests
          </Button>
          
          {testResults.length > 0 && (
            <div className="bg-gray-100 rounded-lg p-4 font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
              {testResults.map((result, idx) => (
                <div key={idx} className="whitespace-pre-wrap break-all">
                  {result}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}