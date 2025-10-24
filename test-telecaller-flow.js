const axios = require('axios');

async function testTelecallerNotificationFlow() {
  try {
    console.log('🔍 Testing telecaller notification flow...\n');
    
    // Test 1: Check website integration details
    console.log('1. Checking website integration details...');
    try {
      const integrationResponse = await axios.get(
        'http://localhost:3005/api/integrations/website/68e50b23773b61f1544e2be7',
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Auth': 'jesty-crm-service-auth-token-notifications-2024'
          }
        }
      );
      
      console.log('✅ Website Integration found:');
      console.log('   - Integration ID:', integrationResponse.data._id);
      console.log('   - Organization ID:', integrationResponse.data.organizationId);
      console.log('   - Assignment Settings:', integrationResponse.data.assignmentSettings ? 'Available' : 'Not configured');
      
      if (integrationResponse.data.assignmentSettings?.assignToUsers) {
        console.log('   - Available Telecallers:');
        integrationResponse.data.assignmentSettings.assignToUsers.forEach((user, index) => {
          console.log(`     ${index + 1}. ${user.name || 'N/A'} (${user.email || 'No email'}) - ID: ${user.userId}`);
        });
      }
      
    } catch (error) {
      console.log('❌ Failed to get website integration:', error.message);
    }
    
    // Test 2: Check Facebook integration details
    console.log('\n2. Checking Facebook integration details...');
    try {
      const fbIntegrationResponse = await axios.get(
        'http://localhost:3005/api/integrations/facebook/68f265228d24b596ebc54b93',
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Auth': 'jesty-crm-service-auth-token-notifications-2024'
          }
        }
      );
      
      console.log('✅ Facebook Integration found:');
      console.log('   - Integration ID:', fbIntegrationResponse.data._id);
      console.log('   - Organization ID:', fbIntegrationResponse.data.organizationId);
      console.log('   - User Name:', fbIntegrationResponse.data.fbUserName);
      
      // Check if there are forms with assignment settings
      if (fbIntegrationResponse.data.fbPages && fbIntegrationResponse.data.fbPages.length > 0) {
        console.log('   - Facebook Pages:');
        fbIntegrationResponse.data.fbPages.forEach((page, index) => {
          console.log(`     ${index + 1}. ${page.name} (${page.id})`);
          if (page.forms && page.forms.length > 0) {
            page.forms.forEach((form, formIndex) => {
              console.log(`        Form ${formIndex + 1}: ${form.name} (${form.id})`);
              if (form.assignmentSettings?.assignToUsers) {
                console.log(`        Assignment users: ${form.assignmentSettings.assignToUsers.length}`);
                form.assignmentSettings.assignToUsers.forEach((user, userIndex) => {
                  console.log(`          ${userIndex + 1}. ${user.name || 'N/A'} (${user.email || 'No email'}) - ID: ${user.userId}`);
                });
              }
            });
          }
        });
      }
      
    } catch (error) {
      console.log('❌ Failed to get Facebook integration:', error.message);
    }
    
    // Test 3: Test direct notification service call
    console.log('\n3. Testing direct notification service call...');
    try {
      const testNotificationData = {
        leadData: {
          _id: 'test-lead-' + Date.now(),
          name: 'Test Telecaller Lead',
          email: 'test.telecaller@example.com',
          phone: '+1234567890',
          source: 'test',
          status: 'new',
          organizationId: '68e42b14adfc780e4f56feca'
        },
        assigneeData: {
          _id: '68f21b24fe877f95005539bc', // Use a real telecaller ID from your logs
          name: 'Test Telecaller',
          email: 'prashantsh7014@gmail.com' // Use your real email for testing
        },
        assignerData: null
      };
      
      const notificationResponse = await axios.post(
        'http://localhost:3006/api/notifications/leads/assignment',
        testNotificationData,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Auth': 'jesty-crm-service-auth-token-notifications-2024'
          }
        }
      );
      
      console.log('✅ Direct notification test successful:');
      console.log('   - Success:', notificationResponse.data.success);
      console.log('   - Recipient:', notificationResponse.data.recipient);
      console.log('   - Message ID:', notificationResponse.data.messageId);
      
    } catch (error) {
      console.log('❌ Direct notification test failed:', error.message);
      if (error.response?.data) {
        console.log('   Response:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    // Test 4: Create a test website lead to trigger the full flow
    console.log('\n4. Creating test website lead to trigger full notification flow...');
    try {
      const testLead = {
        name: 'Test Telecaller Assignment Flow',
        email: 'test.flow@example.com',
        phone: '+1234567890',
        source: 'website_test',
        customFields: {
          company: 'Test Company',
          message: 'Testing full telecaller assignment and notification flow'
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
      
      console.log('✅ Test lead created successfully:');
      console.log('   - Lead ID:', leadResponse.data.id);
      console.log('   - Assigned To:', leadResponse.data.assignedTo || 'Not assigned');
      console.log('   - Status:', leadResponse.data.status);
      
      if (leadResponse.data.assignedTo) {
        console.log('\n🎉 Lead was assigned! Check your email for telecaller notification.');
      } else {
        console.log('\n⚠️ Lead was not assigned. Check assignment settings.');
      }
      
    } catch (error) {
      console.log('❌ Test lead creation failed:', error.message);
      if (error.response?.data) {
        console.log('   Response:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    console.log('\n📊 Test Summary:');
    console.log('- If you see "Direct notification test successful", the notification service is working');
    console.log('- If you see "Lead was assigned", the integration assignment is working');
    console.log('- Check your email (prashantsh7014@gmail.com) for both admin and telecaller notifications');
    console.log('- Check the integrations-service logs for detailed assignment and notification info');
    
  } catch (error) {
    console.error('❌ Overall test failed:', error.message);
  }
}

testTelecallerNotificationFlow();