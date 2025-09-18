const axios = require('axios');

// Test the enhanced system with duplicate detection
async function testEnhancedSystem() {
  try {
    console.log('Testing enhanced system with duplicate detection and cleaned custom fields...\n');
    
    // Test data
    const testLeadData = {
      "formId": "form-1",
      "fullName": "John Customer Enhanced Test",
      "phoneNumber": "+1-555-123-4567",
      "emailAddress": "john@customer.com", // Same email to test duplicate detection
      "interests": ["CRM", "Marketing", "Sales", "Analytics"],
      "experience": "7 years in marketing and sales",
      "budget": "$25,000",
      "timeline": "Within 2 months",
      "companySize": "100-250 employees",
      "message": "Looking for advanced CRM solution with analytics"
    };

    console.log('Input data:', JSON.stringify(testLeadData, null, 2));

    // Test the webhook endpoint with an existing integration key
    console.log('\n1. Testing webhook with enhanced duplicate detection...');
    
    const webhookResponse = await axios.post(`http://localhost:3005/api/webhooks/website/test-key-1758233329510`, testLeadData, {
      headers: {
        'Content-Type': 'application/json',
        'X-Form-Id': 'form-1'
      }
    });

    console.log('\nWebhook Response:', JSON.stringify(webhookResponse.data, null, 2));

    if (webhookResponse.data.success) {
      console.log('\n✅ SUCCESS! Lead processed with leadId:', webhookResponse.data.leadId);
      console.log('\nExpected improvements:');
      console.log('1. Custom fields should be in leadData.customFields (not mixed with basic fields)');
      console.log('2. FormId should be removed from customFields');
      console.log('3. Referrer should be removed from customFields');
      console.log('4. Duplicate detection should be performed');
      console.log('5. isDuplicate flag should be set appropriately');
      console.log('6. duplicateLeadIds should contain IDs of matching leads');
      
      console.log('\nPlease check MongoDB LeadSource collection for:');
      console.log('- leadData.customFields containing only: interests, experience, budget, timeline, companySize, message');
      console.log('- isDuplicate: true/false');
      console.log('- duplicateLeadIds: array of ObjectIds');
    } else {
      console.log('\n❌ FAILED:', webhookResponse.data.message);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testEnhancedSystem();