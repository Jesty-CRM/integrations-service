const axios = require('axios');

async function testTelecallerAssignment() {
  try {
    console.log('Testing telecaller assignment and notification...');
    
    // Get the website integration details
    const integrationResponse = await axios.get(
      'http://localhost:3005/api/integrations/website/68e50b23773b61f1544e2be7',
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': 'jesty-crm-service-auth-token-notifications-2024'
        }
      }
    );
    
    console.log('\n=== Integration Details ===');
    console.log('Integration ID:', integrationResponse.data._id);
    console.log('Organization ID:', integrationResponse.data.organizationId);
    console.log('Assignment Settings:', JSON.stringify(integrationResponse.data.assignmentSettings, null, 2));
    
    if (integrationResponse.data.assignmentSettings?.assignToUsers) {
      console.log('\n=== Available Telecallers ===');
      integrationResponse.data.assignmentSettings.assignToUsers.forEach((user, index) => {
        console.log(`${index + 1}. User ID: ${user.userId}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
        console.log('---');
      });
    }
    
    // Test lead creation
    console.log('\n=== Testing Lead Creation ===');
    const testLead = {
      name: 'Test Telecaller Assignment',
      email: 'test.telecaller@example.com',
      phone: '+1234567890',
      source: 'website_test',
      customFields: {
        company: 'Test Company',
        message: 'Testing telecaller assignment notification'
      }
    };
    
    const leadResponse = await axios.post(
      'http://localhost:3005/api/integrations/website/68e50b23773b61f1544e2be7/leads',
      testLead,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': 'jesty-crm-service-auth-token-notifications-2024'
        }
      }
    );
    
    console.log('Lead Created:', {
      id: leadResponse.data.id,
      assignedTo: leadResponse.data.assignedTo,
      status: leadResponse.data.status
    });
    
    if (leadResponse.data.assignedTo) {
      console.log('\n✅ Lead was assigned to telecaller:', leadResponse.data.assignedTo);
      console.log('Check your email for the telecaller assignment notification!');
    } else {
      console.log('\n❌ Lead was not assigned to any telecaller');
    }
    
  } catch (error) {
    console.error('Error testing telecaller assignment:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

testTelecallerAssignment();