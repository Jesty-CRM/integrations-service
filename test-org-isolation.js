// Test organization data isolation fix
const axios = require('axios');

async function testOrganizationIsolation() {
  console.log('🧪 Testing Organization Data Isolation Fix...\n');
  
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYSIsInVzZXJJZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYSIsInR5cGUiOiJhY2Nlc3MiLCJlbWFpbCI6InByYXNoYW50c2g3MDE0QGdtYWlsLmNvbSIsInJvbGVzIjpbImFkbWluIl0sInJvbGUiOiJhZG1pbiIsIm9yZ2FuaXphdGlvbklkIjoiNjhlNDJiMTRhZGZjNzgwZTRmNTZmZWNhIiwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3NTk3ODM3MDAsImV4cCI6MTc2MjM3NTcwMCwiYXVkIjoiamVzdHktY3JtLXVzZXJzIiwiaXNzIjoiamVzdHktY3JtIn0.SwizZ4bu7SbAi9V6W0QG2AdcK15riN80xuehr7ltgHw';
  
  const leadsServiceUrl = 'http://localhost:3002/api';
  
  // Decode token to see organizationId
  const jwt = require('jsonwebtoken');
  const decoded = jwt.decode(token);
  console.log('🔍 Token organizationId:', decoded.organizationId);
  
  try {
    // Test 1: Lead Quality Analytics
    console.log('📊 Testing Lead Quality Analytics...');
    const qualityResponse = await axios.get(`${leadsServiceUrl}/analytics/lead-quality`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Lead Quality Response Status:', qualityResponse.status);
    console.log('Lead Quality Data:', JSON.stringify(qualityResponse.data, null, 2));
    
    // Test 2: Lead Sources Analytics  
    console.log('\n📈 Testing Lead Sources Analytics...');
    const sourcesResponse = await axios.get(`${leadsServiceUrl}/analytics/lead-sources`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Lead Sources Response Status:', sourcesResponse.status);
    console.log('Lead Sources Data:', JSON.stringify(sourcesResponse.data, null, 2));
    
    // Test 3: Dashboard Analytics (combined)
    console.log('\n🏠 Testing Dashboard Analytics...');
    const dashboardResponse = await axios.get(`${leadsServiceUrl}/analytics/dashboard`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Dashboard Response Status:', dashboardResponse.status);
    console.log('Dashboard organizationId:', dashboardResponse.data.data?.summary?.organizationId);
    console.log('Dashboard lead quality data exists:', !!dashboardResponse.data.data?.leadQuality);
    console.log('Dashboard lead sources data exists:', !!dashboardResponse.data.data?.leadSources);
    
    // Verify organization isolation
    const returnedOrgId = dashboardResponse.data.data?.summary?.organizationId;
    if (returnedOrgId === decoded.organizationId) {
      console.log('\n✅ SECURITY CHECK PASSED: Data is properly isolated to user\'s organization');
    } else {
      console.log('\n❌ SECURITY CHECK FAILED: Data is not properly isolated!');
      console.log('Expected org:', decoded.organizationId);
      console.log('Returned org:', returnedOrgId);
    }
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Response Status:', error.response.status);
      console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ Request Error:', error.message);
    }
  }
}

testOrganizationIsolation().catch(console.error);