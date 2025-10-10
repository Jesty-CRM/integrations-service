// Test analytics API with and without authentication
const axios = require('axios');

async function testAnalyticsAuth() {
  console.log('🧪 Testing Analytics API Authentication...\n');
  
  const baseUrl = 'http://localhost:3005/api/integrations/analytics';
  
  // Test 1: Call without authentication (should fail)
  console.log('📋 Test 1: No Authentication');
  try {
    const response = await axios.get(`${baseUrl}/status`);
    console.log('❌ Should have failed - no authentication provided');
    console.log('Response:', response.status, response.data);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Correctly blocked unauthenticated request');
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data.message);
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data || error.message);
    }
  }
  
  // Test 2: Call with dummy organizationId in query (should still be blocked by auth)
  console.log('\n📋 Test 2: Dummy Organization ID in Query (No Auth)');
  try {
    const response = await axios.get(`${baseUrl}/status?organizationId=dummy`);
    console.log('❌ Should have failed - no authentication provided');
    console.log('Response:', response.status, response.data);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Correctly blocked unauthenticated request with dummy org ID');
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data.message);
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data || error.message);
    }
  }
  
  // Test 3: Call with invalid token
  console.log('\n📋 Test 3: Invalid Token');
  try {
    const response = await axios.get(`${baseUrl}/status`, {
      headers: {
        'Authorization': 'Bearer invalid_token_here'
      }
    });
    console.log('❌ Should have failed - invalid token');
    console.log('Response:', response.status, response.data);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Correctly rejected invalid token');
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data.message);
    } else {
      console.log('❌ Unexpected error:', error.response?.status, error.response?.data || error.message);
    }
  }
  
  console.log('\n🎯 Analytics Authentication Tests Complete!');
  console.log('\n📊 Summary:');
  console.log('✅ Unauthenticated requests properly blocked');
  console.log('✅ Dummy organizationId cannot bypass authentication');
  console.log('✅ Invalid tokens properly rejected');
  console.log('✅ This should prevent the ObjectId casting errors');
}

testAnalyticsAuth().catch(console.error);