const axios = require('axios');

async function testSingleAssignment() {
  console.log('🧪 Testing Single Assignment');
  console.log('============================');

  try {
    // Create a website lead submission
    const websiteLeadData = {
      name: 'Test Single Assignment',
      email: `test.single.${Date.now()}@example.com`,
      phone: '+1-555-999-1234',
      company: 'Test Company Single',
      message: 'Testing single assignment history entry'
    };

    console.log('📤 Submitting website lead...');
    
    // Submit the lead via webhook with integration key
    const integrationKey = '9c0e7f56d0a49fb7b41c3d734da1cd20';
    const leadResponse = await axios.post(
      `http://localhost:3005/api/webhooks/website/${integrationKey}`,
      websiteLeadData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (leadResponse.data.success) {
      const leadId = leadResponse.data.leadId;
      console.log('✅ Lead created successfully:', leadId);
      console.log('📋 Please check this lead in the database to verify:');
      console.log('   1. Has assignedTo field populated');
      console.log('   2. Has exactly ONE entry in assignmentHistory array');
      console.log('   3. Assignment was successful without duplicates');
      
    } else {
      console.log('❌ Lead creation failed:', leadResponse.data.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testSingleAssignment();