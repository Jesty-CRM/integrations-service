const WebsiteService = require('../services/website.service');

// Test the cleanLeadData method specifically
function testCleanLeadData() {
  console.log('Testing cleanLeadData method...\n');
  
  const testInput = {
    "formId": "form-1",
    "fullName": "John Customer", // Should map to 'name'
    "phoneNumber": "+1-555-123-4567", // Should map to 'phone'
    "emailAddress": "john@customer.com", // Should map to 'email'
    "interests": ["CRM", "Marketing", "Sales"], // Should stay as 'interests'
    "experience": "5 years in marketing", // Should stay as 'experience'
    "budget": "$10,000", // Should stay as 'budget'
    "timeline": "Next quarter", // Should stay as 'timeline'
    "companySize": "50-100 employees", // Should stay as 'companySize'
    "message": "Looking for comprehensive CRM solution" // Should stay as 'message'
  };

  console.log('Input data:', JSON.stringify(testInput, null, 2));
  
  const cleaned = WebsiteService.cleanLeadData(testInput);
  
  console.log('\nCleaned data:', JSON.stringify(cleaned, null, 2));
  
  // Check what should be there
  const expectedFields = ['name', 'email', 'phone', 'formId', 'interests', 'experience', 'budget', 'timeline', 'companySize', 'message'];
  
  console.log('\nField check:');
  expectedFields.forEach(field => {
    const exists = cleaned.hasOwnProperty(field);
    console.log(`  ${field}: ${exists ? '✅ Present' : '❌ Missing'}`);
    if (exists) {
      console.log(`    Value: ${JSON.stringify(cleaned[field])}`);
    }
  });
}

testCleanLeadData();