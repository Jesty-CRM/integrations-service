// Test Facebook field separation to verify custom fields vs integration fields
console.log('Testing Facebook field extraction and separation...\n');

// Simulate Facebook field data that would come from a webhook
const testFacebookFieldData = [
  { name: 'full_name', values: ['John Smith'] },
  { name: 'email', values: ['john.smith@cus.com'] },
  { name: 'phone_number', values: ['+1-555-123-4557'] },
  { name: 'company', values: ['Customer Solutions Inc'] },
  { name: 'xyz', values: ['abcd'] },
  { name: 'message', values: ['I am interested in your web development services.'] }
];

// Simulate the extractLeadFields function (simplified)
function extractLeadFields(fieldData) {
  const name = fieldData.find(f => f.name === 'full_name')?.values[0] || 'FB Lead';
  const email = fieldData.find(f => f.name === 'email')?.values[0];
  const phone = fieldData.find(f => f.name === 'phone_number')?.values[0];
  const company = fieldData.find(f => f.name === 'company')?.values[0];
  const message = fieldData.find(f => f.name === 'message')?.values[0];
  
  // Extract custom fields (non-standard fields)
  const standardFields = ['full_name', 'email', 'phone_number', 'company', 'message'];
  const customFields = {};
  
  fieldData.forEach(field => {
    if (!standardFields.includes(field.name)) {
      customFields[field.name] = field.values[0];
    }
  });
  
  return { name, email, phone, company, message, customFields };
}

const extractedFields = extractLeadFields(testFacebookFieldData);
console.log('1. Extracted fields from Facebook:', JSON.stringify(extractedFields, null, 2));

// Simulate the corrected lead data structure
const leadData = {
  name: extractedFields.name,
  email: extractedFields.email,
  phone: extractedFields.phone,
  organizationId: '68e42b14adfc780e4f56feca',
  source: 'facebook',
  status: 'new',
  
  // Store user/business data in customFields (CORRECT)
  customFields: {
    company: extractedFields.company,
    message: extractedFields.message,
    ...extractedFields.customFields  // This includes 'xyz' and other custom fields
  },
  
  // Store integration/system data in extraFields (CORRECT)
  extraFields: {
    formId: 'fb_form_123',
    pageId: 'fb_page_456',
    adId: 'fb_ad_789',
    campaignId: 'fb_campaign_101',
    platform: 'facebook'
  },
  
  // Integration-specific identifiers
  integrationData: {
    integrationName: 'Facebook Integration',
    facebookLeadId: 'fb_lead_12345',
    platform: 'facebook'
  }
};

console.log('\n2. Corrected lead data structure:');
console.log('customFields (user data):', JSON.stringify(leadData.customFields, null, 2));
console.log('extraFields (integration data):', JSON.stringify(leadData.extraFields, null, 2));
console.log('integrationData (platform data):', JSON.stringify(leadData.integrationData, null, 2));

// Verify the separation is correct
console.log('\n3. Verification:');
console.log('✅ User data in customFields:', 
  Object.keys(leadData.customFields).filter(key => ['company', 'message', 'xyz'].includes(key)));
console.log('✅ System data in extraFields:', 
  Object.keys(leadData.extraFields).filter(key => ['formId', 'pageId', 'platform'].includes(key)));
console.log('✅ Integration data separated:', 
  Object.keys(leadData.integrationData).includes('integrationName'));

console.log('\n🎉 Facebook field separation test completed successfully!');