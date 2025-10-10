const facebookLeadProcessor = require('./services/facebookLeadProcessor.service');
const FacebookIntegration = require('./models/FacebookIntegration');

async function testFacebookResilienceWithInvalidToken() {
  console.log('🧪 Testing Facebook Lead Processing Resilience...\n');
  
  try {
    // Test with real webhook data but invalid Facebook token
    const webhookData = {
      leadgen_id: 'test_resilience_' + Date.now(),
      page_id: '7481197345333653',
      form_id: '477738011798758'
    };

    console.log('📝 Testing webhook data:', webhookData);
    
    // Test the resilience
    const result = await facebookLeadProcessor.processWebhookLead(webhookData);
    
    console.log('✅ Process completed successfully!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

async function testOrganizationIdValidation() {
  console.log('\n🔍 Testing Organization ID Validation...\n');
  
  try {
    // Create a test integration with invalid organizationId
    const testIntegration = {
      organizationId: 'dummy', // This should fail validation
      fbPages: [{
        id: '7481197345333653',
        accessToken: 'invalid_token',
        leadForms: [{
          id: '477738011798758',
          enabled: true
        }]
      }]
    };

    // Mock the integration lookup to return our test data
    const originalFindOne = FacebookIntegration.findOne;
    FacebookIntegration.findOne = () => Promise.resolve(testIntegration);

    const webhookData = {
      leadgen_id: 'test_invalid_org',
      page_id: '7481197345333653',
      form_id: '477738011798758'
    };

    await facebookLeadProcessor.processWebhookLead(webhookData);
    console.log('❌ Should have failed with invalid organizationId');
    
  } catch (error) {
    if (error.message.includes('Invalid organizationId')) {
      console.log('✅ Organization ID validation working correctly');
      console.log('Error message:', error.message);
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

async function testFallbackLeadData() {
  console.log('\n🔄 Testing Fallback Lead Data Creation...\n');
  
  const fallbackData = facebookLeadProcessor.createFallbackLeadData('test_lead_123');
  
  console.log('✅ Fallback lead data created:');
  console.log(JSON.stringify(fallbackData, null, 2));
  
  // Validate required fields
  const hasRequiredFields = fallbackData.field_data.some(f => f.name === 'full_name') &&
                           fallbackData.field_data.some(f => f.name === 'email') &&
                           fallbackData.field_data.some(f => f.name === 'phone_number');
  
  console.log(hasRequiredFields ? '✅ All required fields present' : '❌ Missing required fields');
}

// Run all tests
async function runAllTests() {
  await testFallbackLeadData();
  await testOrganizationIdValidation();
  await testFacebookResilienceWithInvalidToken();
  
  console.log('\n🎯 Resilience tests completed!');
}

runAllTests().catch(console.error);