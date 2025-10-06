const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

async function enableAssignmentAndAssignLead() {
  try {
    console.log('🔧 Enabling assignment for testing-copy form and assigning latest lead...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm-integrations');
    console.log('✅ Connected to MongoDB');
    
    const FacebookIntegration = require('./models/FacebookIntegration');
    
    // Find the integration
    const integration = await FacebookIntegration.findOne({ 
      organizationId: '68e42b14adfc780e4f56feca' 
    });
    
    if (!integration) {
      console.log('❌ Integration not found');
      return;
    }
    
    console.log('📋 Found integration for organization:', integration.organizationId);
    
    // Find the testing-copy form
    const page = integration.fbPages.find(p => p.id === '733586139846420');
    if (!page) {
      console.log('❌ Page not found');
      return;
    }
    
    const testingCopyFormIndex = page.leadForms.findIndex(f => f.id === '1311360457391963');
    if (testingCopyFormIndex === -1) {
      console.log('❌ Testing-copy form not found');
      return;
    }
    
    console.log('📝 Found testing-copy form');
    
    // Enable assignment settings for testing-copy form
    integration.fbPages[0].leadForms[testingCopyFormIndex].assignmentSettings = {
      enabled: true,
      algorithm: 'round-robin',
      assignToUsers: [{
        userId: '68e42b14adfc780e4f56fecc',
        isActive: true,
        weight: 1,
        addedAt: new Date()
      }],
      lastAssignment: {
        mode: 'manual',
        lastAssignedIndex: 0,
        lastAssignedAt: null,
        lastAssignedTo: null
      }
    };
    
    // Save the integration
    await integration.save();
    
    console.log('✅ Assignment settings enabled for testing-copy form');
    
    // Now manually assign the latest lead
    const leadId = '68e42c96e11455a8f8b27d7f';
    const userId = '68e42b14adfc780e4f56fecc';
    const organizationId = '68e42b14adfc780e4f56feca';
    
    console.log('🎯 Manually assigning latest Facebook lead...');
    
    try {
      const assignResponse = await axios.put(
        `http://localhost:3002/api/leads/${leadId}/assign`,
        { 
          assignedTo: userId,
          reason: 'manual-assignment'
        },
        {
          headers: {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYyIsInVzZXJJZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYyIsInR5cGUiOiJhY2Nlc3MiLCJlbWFpbCI6InByYXNoYW50c2g3MDE0QGdtYWlsLmNvbSIsInJvbGVzIjpbImFkbWluIl0sInJvbGUiOiJhZG1pbiIsIm9yZ2FuaXphdGlvbklkIjoiNjhlNDJiMTRhZGZjNzgwZTRmNTZmZWNhIiwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3NTk3ODM3MDAsImV4cCI6MTc2MjM3NTcwMCwiYXVkIjoiamVzdHktY3JtLXVzZXJzIiwiaXNzIjoiamVzdHktY3JtIn0.SwizZ4bu7SbAi9V6W0QG2AdcK15riN80xuehr7ltgHw',
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (assignResponse.data.success) {
        console.log('✅ Lead assigned successfully:', {
          leadId: leadId,
          assignedTo: userId,
          response: assignResponse.data.message
        });
        
        // Verify the assignment
        const verifyResponse = await axios.get(
          `http://localhost:3002/api/leads/${leadId}`,
          {
            headers: {
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYyIsInVzZXJJZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYyIsInR5cGUiOiJhY2Nlc3MiLCJlbWFpbCI6InByYXNoYW50c2g3MDE0QGdtYWlsLmNvbSIsInJvbGVzIjpbImFkbWluIl0sInJvbGUiOiJhZG1pbiIsIm9yZ2FuaXphdGlvbklkIjoiNjhlNDJiMTRhZGZjNzgwZTRmNTZmZWNhIiwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3NTk3ODM3MDAsImV4cCI6MTc2MjM3NTcwMCwiYXVkIjoiamVzdHktY3JtLXVzZXJzIiwiaXNzIjoiamVzdHktY3JtIn0.SwizZ4bu7SbAi9V6W0QG2AdcK15riN80xuehr7ltgHw'
            }
          }
        );
        
        const assignedLead = verifyResponse.data.data;
        console.log('📊 Assignment verification:');
        console.log('- Lead ID:', assignedLead._id);
        console.log('- Assigned To:', assignedLead.assignedTo);
        console.log('- Assignment History:', assignedLead.assignmentHistory?.length || 0, 'entries');
        
        if (assignedLead.assignedTo && assignedLead.assignmentHistory?.length > 0) {
          console.log('🎉 SUCCESS! Manual assignment completed and verified!');
        }
        
      } else {
        console.log('❌ Assignment failed:', assignResponse.data.message);
      }
      
    } catch (assignError) {
      console.error('❌ Error assigning lead:', assignError.response?.data || assignError.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

enableAssignmentAndAssignLead();