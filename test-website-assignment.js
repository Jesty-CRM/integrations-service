const axios = require('axios');

async function testWebsiteLeadAssignment() {
  try {
    console.log('Testing website lead assignment...');
    
    const payload = {
      name: "Test Assignment User",
      email: "test.assignment@example.com",
      phone: "+1-555-999-0001",
      company: "Assignment Test Company",
      message: "Testing website lead auto-assignment",
      xyz: "test-assignment-field"
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-integration-key': 'd58c4304ddd3c947e695993687927a13' // Your integration key
    };

    console.log('Sending test lead for assignment:', JSON.stringify(payload, null, 2));

    const response = await axios.post('http://localhost:3005/api/webhooks/website-lead', payload, { headers });
    
    console.log('✅ Lead created successfully:', response.data);
    
    if (response.data.leadId) {
      console.log('🎯 Lead ID:', response.data.leadId);
      
      // Wait a moment for assignment to complete
      setTimeout(async () => {
        console.log('Checking if lead was assigned...');
        // You could add a call here to check the lead's assignment status
      }, 2000);
    }
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    return null;
  }
}

// Run the test
testWebsiteLeadAssignment();