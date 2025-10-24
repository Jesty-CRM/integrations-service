const axios = require('axios');

async function testDifferentEndpoints() {
  try {
    console.log('🔍 Testing different webhook endpoints...\n');
    
    const testLead = {
      name: 'Test Telecaller Notification',
      email: 'test.telecaller.notification@example.com',
      phone: '+1234567890',
      source: 'website_test',
      customFields: {
        company: 'Test Company',
        message: 'Testing telecaller notification'
      }
    };
    
    // Try the integration key endpoint
    console.log('1. Testing with integration key d58c4304ddd3c947e695993687927a13...');
    try {
      const response1 = await axios.post(
        'http://localhost:3005/api/webhooks/website/d58c4304ddd3c947e695993687927a13',
        testLead,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Integration key endpoint worked!');
      console.log('Response:', response1.data);
      return;
      
    } catch (error) {
      console.log('❌ Integration key endpoint failed:', error.message);
      if (error.response?.data) {
        console.log('   Response:', error.response.data);
      }
    }
    
    // Try the direct leads endpoint
    console.log('\n2. Testing direct integrations leads endpoint...');
    try {
      const response2 = await axios.post(
        'http://localhost:3005/api/integrations/website/68e50b23773b61f1544e2be7/leads',
        testLead,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Direct leads endpoint worked!');
      console.log('Response:', response2.data);
      return;
      
    } catch (error) {
      console.log('❌ Direct leads endpoint failed:', error.message);
      if (error.response?.data) {
        console.log('   Response:', error.response.data);
      }
    }
    
    // Check health endpoint
    console.log('\n3. Testing health endpoint...');
    try {
      const healthResponse = await axios.get('http://localhost:3005/health');
      console.log('✅ Health endpoint works:', healthResponse.data);
    } catch (error) {
      console.log('❌ Health endpoint failed:', error.message);
    }
    
    // List available routes
    console.log('\n4. Available test options:');
    console.log('   - Check if integrations service is properly running');
    console.log('   - Verify the integration ID/key is correct');
    console.log('   - Test with a real Facebook webhook if you have one');
    
  } catch (error) {
    console.error('❌ Overall test failed:', error.message);
  }
}

testDifferentEndpoints();