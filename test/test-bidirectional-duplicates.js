const axios = require('axios');

async function testBidirectionalDuplicates() {
  console.log('Testing bidirectional duplicate detection...\n');

  const baseUrl = 'http://localhost:3005';
  const integrationKey = 'test-key-1758233329510'; // Using existing key

  // Test data - we'll submit this 3 times to test duplicate logic
  const testLead = {
    "formId": "form-1",
    "fullName": "Duplicate Test User",
    "phoneNumber": "+1-555-DUPLICATE", 
    "emailAddress": "duplicate@test.com",
    "interests": ["Testing", "CRM"],
    "budget": "$5,000",
    "message": "Testing duplicate detection"
  };

  try {
    console.log('1. Submitting first lead (should be original, not duplicate)');
    const response1 = await axios.post(`${baseUrl}/api/webhooks/website/${integrationKey}`, {
      ...testLead,
      message: "First submission - original"
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Form-Id': 'form-1'
      }
    });
    console.log('✓ First submission result:', response1.data);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n2. Submitting second lead (should detect duplicate)');
    const response2 = await axios.post(`${baseUrl}/api/webhooks/website/${integrationKey}`, {
      ...testLead,
      message: "Second submission - should be duplicate"
    }, {
      headers: {
        'Content-Type': 'application/json', 
        'X-Form-Id': 'form-1'
      }
    });
    console.log('✓ Second submission result:', response2.data);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n3. Submitting third lead (should also detect duplicate)');
    const response3 = await axios.post(`${baseUrl}/api/webhooks/website/${integrationKey}`, {
      ...testLead,
      message: "Third submission - another duplicate"
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Form-Id': 'form-1'
      }
    });
    console.log('✓ Third submission result:', response3.data);

    console.log('\n🎉 Test completed! Check MongoDB LeadSource collection for:');
    console.log('- First lead should now have isDuplicate: true and duplicateLeadIds containing 2nd and 3rd lead IDs');
    console.log('- Second lead should have isDuplicate: true, duplicateOf: first_lead_id, and duplicateLeadIds containing 1st and 3rd lead IDs'); 
    console.log('- Third lead should have isDuplicate: true, duplicateOf: first_lead_id, and duplicateLeadIds containing 1st and 2nd lead IDs');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testBidirectionalDuplicates();