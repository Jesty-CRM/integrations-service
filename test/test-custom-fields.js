const axios = require('axios');

// Test the custom fields functionality with your specific input
async function testCustomFields() {
  try {
    console.log('Testing custom fields handling...\n');
    
    // Your test data
    const testLeadData = {
      "formId": "form-1",
      "fullName": "John Customer",
      "phoneNumber": "+1-555-123-4567",
      "emailAddress": "john@customer.com",
      "interests": ["CRM", "Marketing", "Sales"],
      "experience": "5 years in marketing",
      "budget": "$10,000",
      "timeline": "Next quarter",
      "companySize": "50-100 employees",
      "message": "Looking for comprehensive CRM solution"
    };

    // First, let's check if we have any existing integrations
    console.log('1. Checking existing integrations...');
    
    const integrationsResponse = await axios.get('http://localhost:3005/api/integrations/website', {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OGM0MmEyZTk3OTc3YzRhZTE4ODAyZGMiLCJpYXQiOjE3MjY2ODI3MDMsImV4cCI6MTcyNzI4NzUwM30.hiloap9P_7plbeArs7018Q6maHQjqUCfrAp3z5E6iT8',
        'Content-Type': 'application/json'
      }
    });

    console.log('Existing integrations:', integrationsResponse.data);
    
    let integrationKey;
    
    if (integrationsResponse.data.data && integrationsResponse.data.data.length > 0) {
      // Use existing integration
      integrationKey = integrationsResponse.data.data[0].integrationKey;
      console.log('Using existing integration key:', integrationKey);
    } else {
      // Create new integration if none exists
      console.log('2. Creating new website integration...');
      
      const integrationData = {
        domain: "testcustomfields.com",
        name: "Custom Fields Test Site",
        numberOfForms: 1, // Use the new numberOfForms approach
        leadSettings: {
          defaultStatus: "New Lead",
          defaultSource: "Website"
        }
      };

      const createResponse = await axios.post('http://localhost:3005/api/integrations/website', integrationData, {
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OGM0MmEyZTk3OTc3YzRhZTE4ODAyZGMiLCJpYXQiOjE3MjY2ODI3MDMsImV4cCI6MTcyNzI4NzUwM30.hiloap9P_7plbeArs7018Q6maHQjqUCfrAp3z5E6iT8',
          'Content-Type': 'application/json'
        }
      });

      console.log('Integration created:', createResponse.data);
      integrationKey = createResponse.data.data.integrationKey;
    }

    // Test the webhook endpoint with custom fields
    console.log('\n3. Testing webhook with custom fields...');
    
    const webhookResponse = await axios.post(`http://localhost:3005/api/webhooks/website/${integrationKey}`, testLeadData, {
      headers: {
        'Content-Type': 'application/json',
        'X-Form-Id': 'form-1'
      }
    });

    console.log('Webhook Response:', JSON.stringify(webhookResponse.data, null, 2));

    if (webhookResponse.data.success) {
      console.log('\n✅ SUCCESS! Lead created with leadId:', webhookResponse.data.leadId);
      
      // Now let's check the LeadSource to see if custom fields are preserved
      console.log('\n4. Checking LeadSource record...');
      
      // You can manually check in MongoDB or create an endpoint to verify
      console.log('Please check MongoDB for LeadSource record with leadId:', webhookResponse.data.leadId);
      console.log('Custom fields should be preserved in the leadData field');
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
testCustomFields();