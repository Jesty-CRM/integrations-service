const axios = require('axios');

async function testWebsiteLeadDirect() {
  try {
    console.log('🧪 Testing website lead creation directly (simulating webhook)...\n');
    
    // Create test lead data that matches what a real webhook would send
    const testLead = {
      name: 'Test Telecaller Notification',
      email: 'test.telecaller.notification@example.com',
      phone: '+1234567890',
      source: 'website_test',
      customFields: {
        company: 'Test Company',
        message: 'Testing telecaller notification from integrations service'
      }
    };
    
    console.log('📤 Sending lead to website webhook endpoint...');
    console.log('Lead data:', JSON.stringify(testLead, null, 2));
    
    // Send to the webhook endpoint that doesn't require authentication
    const response = await axios.post(
      'http://localhost:3005/api/webhooks/website/68e50b23773b61f1544e2be7',
      testLead,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Source-Type': 'website'
        }
      }
    );
    
    console.log('\n✅ Website lead webhook successful!');
    console.log('Response:', {
      success: response.data.success,
      leadId: response.data.leadId,
      message: response.data.message,
      assigned: response.data.assigned,
      assignedTo: response.data.assignedTo
    });
    
    if (response.data.assigned && response.data.assignedTo) {
      console.log('\n🎉 Lead was assigned to telecaller!');
      console.log('📧 Check your email for:');
      console.log('   1. Admin notification (prashantsh7014@gmail.com)');
      console.log('   2. Telecaller assignment notification');
      console.log('\n⏰ Wait 10-15 seconds for emails to arrive...');
    } else {
      console.log('\n⚠️ Lead was not assigned. This might be because:');
      console.log('   - Assignment settings are disabled');
      console.log('   - No telecallers configured');
      console.log('   - Round-robin assignment is at limit');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.log('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testWebsiteLeadDirect();