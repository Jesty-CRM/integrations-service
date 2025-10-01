const axios = require('axios');

const baseURL = 'http://localhost:3005/api/integrations/analytics';

async function testIntegrationsAnalytics() {
  console.log('🚀 Testing Integrations Analytics API\n');

  try {
    // Test with organization ID (replace with actual org ID)
    const orgId = '68c42a2e97977c4ae18802dc'; // Your actual organization ID
    
    console.log('📊 Testing Integration Status Analytics...');
    const statusResponse = await axios.get(`${baseURL}/status?organizationId=${orgId}`);
    
    console.log('✅ Success!');
    console.log('\n📋 Integration Status:');
    
    const { integrations, summary } = statusResponse.data.data;
    
    // Display each integration
    Object.values(integrations).forEach(integration => {
      const statusIcon = integration.status === 'connected' ? '🟢' : 
                        integration.status === 'disconnected' ? '🟡' : '⚪';
      console.log(`${statusIcon} ${integration.platform}: ${integration.status.toUpperCase()}`);
      if (integration.lastActivity) {
        console.log(`   Last Activity: ${new Date(integration.lastActivity).toLocaleString()}`);
      }
      if (integration.configuredAt) {
        console.log(`   Configured: ${new Date(integration.configuredAt).toLocaleString()}`);
      }
    });
    
    // Display summary
    console.log('\n📊 Summary:');
    console.log(`   Total Integrations: ${summary.total}`);
    console.log(`   🟢 Connected: ${summary.connected}`);
    console.log(`   � Disconnected: ${summary.disconnected}`);
    console.log(`   ⚪ Not Configured: ${summary.not_configured}`);
    
    console.log('\n🎉 Test completed successfully!');
    
    // Display full response for debugging
    console.log('\n� Full Response:');
    console.log(JSON.stringify(statusResponse.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Make sure the integrations service is running on port 3005');
    }
  }
}

// Run test
testIntegrationsAnalytics();