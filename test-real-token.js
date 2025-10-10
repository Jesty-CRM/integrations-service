const axios = require('axios');

async function testWithRealToken() {
  console.log('🧪 Testing Analytics API with Real JWT Token...\n');
  
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYyIsInVzZXJJZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYyIsInR5cGUiOiJhY2Nlc3MiLCJlbWFpbCI6InByYXNoYW50c2g3MDE0QGdtYWlsLmNvbSIsInJvbGVzIjpbImFkbWluIl0sInJvbGUiOiJhZG1pbiIsIm9yZ2FuaXphdGlvbklkIjoiNjhlNDJiMTRhZGZjNzgwZTRmNTZmZWNhIiwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3NTk3ODM3MDAsImV4cCI6MTc2MjM3NTcwMCwiYXVkIjoiamVzdHktY3JtLXVzZXJzIiwiaXNzIjoiamVzdHktY3JtIn0.SwizZ4bu7SbAi9V6W0QG2AdcK15riN80xuehr7ltgHw';
  
  const baseUrl = 'http://localhost:3005/api/integrations/analytics';
  
  // Decode the token to see what organizationId it contains
  const jwt = require('jsonwebtoken');
  try {
    const decoded = jwt.decode(token);
    console.log('🔍 Token contains organizationId:', decoded.organizationId);
    console.log('🔍 Organization ID type:', typeof decoded.organizationId);
    console.log('🔍 Valid ObjectId format:', /^[0-9a-fA-F]{24}$/.test(decoded.organizationId));
  } catch (err) {
    console.log('Token decode error:', err.message);
  }
  
  try {
    console.log('\n📋 Testing authenticated request...');
    const response = await axios.get(`${baseUrl}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Request successful!');
    console.log('Status:', response.status);
    console.log('Response Data:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Response Status:', error.response.status);
      console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
      
      // Check if it's an auth error
      if (error.response.status === 401) {
        console.log('\n🔑 Authentication failed - token might be expired or auth service unavailable');
      }
    } else {
      console.log('❌ Request Error:', error.message);
    }
  }
}

testWithRealToken().catch(console.error);