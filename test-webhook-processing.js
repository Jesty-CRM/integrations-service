const mongoose = require('mongoose');
require('dotenv').config();

async function testWebhookProcessing() {
  try {
    console.log('🧪 Testing webhook processing with real payload...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm-integrations');
    console.log('✅ Connected to MongoDB');
    
    // Import the Facebook lead processor
    const facebookLeadProcessor = require('./services/facebookLeadProcessor.service');
    
    // Use the exact webhook data from your logs
    const webhookData = {
      leadgen_id: "1453183692650020",
      page_id: "733586139846420", 
      form_id: "2250606145364855",
      created_time: Math.floor(Date.now() / 1000)
    };
    
    console.log('🚀 Processing webhook with data:', webhookData);
    
    // Call our updated processWebhookLead method
    const result = await facebookLeadProcessor.processWebhookLead(webhookData);
    
    console.log('✅ Webhook processing result:', {
      success: result.success,
      leadId: result.leadId,
      action: result.action,
      assigned: result.assigned,
      assignedTo: result.assignedTo
    });
    
    if (result.success && result.leadId) {
      // Check if the lead was assigned
      const axios = require('axios');
      const checkResponse = await axios.get(
        `http://localhost:3002/api/leads/${result.leadId}`,
        {
          headers: {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYyIsInVzZXJJZCI6IjY4ZTQyYjE0YWRmYzc4MGU0ZjU2ZmVjYyIsInR5cGUiOiJhY2Nlc3MiLCJlbWFpbCI6InByYXNoYW50c2g3MDE0QGdtYWlsLmNvbSIsInJvbGVzIjpbImFkbWluIl0sInJvbGUiOiJhZG1pbiIsIm9yZ2FuaXphdGlvbklkIjoiNjhlNDJiMTRhZGZjNzgwZTRmNTZmZWNhIiwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3NTk3ODM3MDAsImV4cCI6MTc2MjM3NTcwMCwiYXVkIjoiamVzdHktY3JtLXVzZXJzIiwiaXNzIjoiamVzdHktY3JtIn0.SwizZ4bu7SbAi9V6W0QG2AdcK15riN80xuehr7ltgHw'
          }
        }
      );
      
      const lead = checkResponse.data.data;
      console.log('📊 Lead verification:');
      console.log('- Lead ID:', lead._id);
      console.log('- Assigned To:', lead.assignedTo || 'NOT ASSIGNED');
      console.log('- Assignment History:', lead.assignmentHistory?.length || 0, 'entries');
      
      if (lead.assignedTo && lead.assignmentHistory?.length > 0) {
        console.log('🎉 SUCCESS! Webhook assignment is working!');
      } else {
        console.log('❌ FAILED: Webhook processed but no assignment');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testWebhookProcessing();