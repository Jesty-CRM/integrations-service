const mongoose = require('mongoose');
require('dotenv').config();

async function testNewFacebookAssignmentFlow() {
  try {
    console.log('🧪 Testing NEW Facebook assignment flow (after lead creation)...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm-integrations');
    console.log('✅ Connected to MongoDB');
    
    // Import the updated Facebook lead processor
    const facebookLeadProcessor = require('./services/facebookLeadProcessor.service');
    const assignmentService = require('./services/assignmentService');
    const FacebookIntegration = require('./models/FacebookIntegration');
    
    // Get the integration - try both organization IDs
    let integration = await FacebookIntegration.findOne({ 
      organizationId: '68e42b14adfc780e4f56feca' 
    });
    
    if (!integration) {
      integration = await FacebookIntegration.findOne({ 
        organizationId: '68c42a2e97977c4ae18802dc' 
      });
    }
    
    if (!integration) {
      console.log('❌ No integration found');
      return;
    }
    
    console.log('📋 Integration found:', integration.organizationId);
    
    // Find the testing form
    const page = integration.fbPages.find(p => p.id === '733586139846420');
    const form = page?.leadForms?.find(f => f.id === '1245489033933556');
    
    if (!form) {
      console.log('❌ Testing form not found');
      return;
    }
    
    console.log('📝 Testing form found:', {
      id: form.id,
      name: form.name,
      enabled: form.assignmentSettings?.enabled,
      assignToUsers: form.assignmentSettings?.assignToUsers?.length
    });
    
    if (!form.assignmentSettings?.enabled) {
      console.log('❌ Form assignment is not enabled. Cannot test assignment.');
      return;
    }
    
    // Test creating a lead WITHOUT assignment first
    const leadData = {
      name: 'Test New Assignment Flow',
      email: 'test-new-flow@example.com',
      phone: '+911234567890',
      organizationId: integration.organizationId,
      source: 'facebook',
      status: 'new',
      customFields: {},
      integrationData: {
        platform: 'facebook',
        facebookLeadId: 'test_new_flow_lead',
        formId: '1245489033933556',
        pageId: '733586139846420'
      }
    };
    
    console.log('\n🚀 Step 1: Creating lead (without assignment)...');
    const createResult = await facebookLeadProcessor.createLeadInCRM(leadData, integration.organizationId);
    
    console.log('✅ Lead creation result:', {
      success: createResult.success,
      leadId: createResult.leadId,
      action: createResult.action
    });
    
    if (!createResult.success) {
      console.log('❌ Lead creation failed, cannot test assignment');
      return;
    }
    
    const leadId = createResult.leadId;
    
    // Test assignment AFTER lead creation (like website does)
    console.log('\n🎯 Step 2: Testing assignment after lead creation...');
    
    try {
      const assignmentResult = await facebookLeadProcessor.autoAssignFacebookLead(
        leadId,
        integration,
        '733586139846420',
        '1245489033933556',
        integration.organizationId
      );
      
      console.log('✅ Assignment result:', {
        assigned: assignmentResult.assigned,
        assignedTo: assignmentResult.assignedTo,
        algorithm: assignmentResult.algorithm,
        reason: assignmentResult.reason
      });
      
      if (assignmentResult.assigned) {
        console.log('\n🔍 Step 3: Verifying assignment in database...');
        
        const axios = require('axios');
        const checkResponse = await axios.get(
          `http://localhost:3002/api/leads/${leadId}`,
          {
            headers: {
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4YzQyYTJlOTc5NzdjNGFlMTg4MDJkZSIsInVzZXJJZCI6IjY4YzQyYTJlOTc5NzdjNGFlMTg4MDJkZSIsInR5cGUiOiJhY2Nlc3MiLCJlbWFpbCI6InByYXNoYW50c2g3MDE0QGdtYWlsLmNvbSIsInJvbGVzIjpbImFkbWluIl0sInJvbGUiOiJhZG1pbiIsIm9yZ2FuaXphdGlvbklkIjoiNjhjNDJhMmU5Nzk3N2M0YWUxODgwMmRjIiwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3NTgyNzMwMjgsImV4cCI6MTc2MDg2NTAyOCwiYXVkIjoiamVzdHktY3JtLXVzZXJzIiwiaXNzIjoiamVzdHktY3JtIn0.EvB5TYRCDycIVZYb5ArjZ0eQLM-vyI_Jtw4Lro9ukIk'
            }
          }
        );
        
        const updatedLead = checkResponse.data.data;
        console.log('📊 Lead verification:');
        console.log('- Lead ID:', updatedLead._id);
        console.log('- Assigned To:', updatedLead.assignedTo || 'NOT ASSIGNED');
        console.log('- Assignment History:', updatedLead.assignmentHistory?.length || 0, 'entries');
        console.log('- Timeline Entries:', updatedLead.timeline?.length || 0, 'entries');
        
        if (updatedLead.assignedTo && updatedLead.assignmentHistory?.length > 0) {
          console.log('🎉 SUCCESS! New Facebook assignment flow is working correctly!');
          console.log('- Assignment History:', updatedLead.assignmentHistory[updatedLead.assignmentHistory.length - 1]);
        } else {
          console.log('❌ PARTIAL SUCCESS: Assignment called but history not updated properly');
        }
      } else {
        console.log('❌ Assignment failed:', assignmentResult.reason);
      }
      
    } catch (assignmentError) {
      console.error('❌ Assignment error:', assignmentError.message);
      console.error('Stack:', assignmentError.stack);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testNewFacebookAssignmentFlow();