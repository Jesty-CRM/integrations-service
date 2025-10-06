const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

async function testFacebookWebhookAssignment() {
  try {
    console.log('🔥 Testing Facebook webhook assignment flow...');
    
    // Connect to MongoDB
    console.log('📂 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm-integrations');
    console.log('✅ Connected to MongoDB');
    
    // First check current form assignment settings
    const FacebookIntegration = require('./models/FacebookIntegration');
    const integration = await FacebookIntegration.findOne({ organizationId: '68c42a2e97977c4ae18802dc' });
    
    if (!integration) {
      console.log('❌ No Facebook integration found');
      return;
    }
    
    console.log('📋 Current integration status:');
    console.log('- Organization ID:', integration.organizationId);
    console.log('- User ID:', integration.userId);
    console.log('- Pages count:', integration.fbPages?.length || 0);
    
    // Check the specific form
    const page = integration.fbPages?.find(p => p.id === '733586139846420');
    if (!page) {
      console.log('❌ Page not found');
      return;
    }
    
    const form = page.leadForms?.find(f => f.id === '1245489033933556');
    if (!form) {
      console.log('❌ Form not found');
      return;
    }
    
    console.log('📝 Form assignment settings:');
    console.log('- Form ID:', form.id);
    console.log('- Form Name:', form.name);
    console.log('- Assignment Enabled:', form.assignmentSettings?.enabled);
    console.log('- Algorithm:', form.assignmentSettings?.algorithm);
    console.log('- Assigned Users:', form.assignmentSettings?.assignToUsers?.map(u => ({ 
      userId: u.userId, 
      isActive: u.isActive 
    })));
    
    if (!form.assignmentSettings?.enabled) {
      console.log('❌ Form assignment is not enabled. Cannot test assignment.');
      return;
    }
    
    // Simulate a Facebook webhook payload
    const webhookPayload = {
      leadgen_id: `test_lead_${Date.now()}`,
      page_id: '733586139846420',
      form_id: '1245489033933556',
      created_time: Math.floor(Date.now() / 1000)
    };
    
    console.log('🚀 Simulating Facebook webhook with payload:', webhookPayload);
    
    // Send webhook to our local service
    const response = await axios.post('http://localhost:3005/api/integrations/facebook/webhook', {
      object: 'page',
      entry: [{
        id: '733586139846420',
        time: Math.floor(Date.now() / 1000),
        changes: [{
          value: webhookPayload,
          field: 'leadgen'
        }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Webhook sent successfully:', {
      status: response.status,
      statusText: response.statusText
    });
    
    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if the lead was created and assigned
    console.log('🔍 Checking if lead was created and assigned...');
    
    // Check the latest lead in the leads service
    const LeadMongoose = require('mongoose');
    const leadsConnection = LeadMongoose.createConnection(process.env.LEADS_MONGODB_URI || 'mongodb://localhost:27017/crm-leads');
    
    const Lead = leadsConnection.model('Lead', new LeadMongoose.Schema({}, { strict: false }));
    const latestLead = await Lead.findOne({ source: 'facebook' }).sort({ createdAt: -1 });
    
    if (latestLead) {
      console.log('📊 Latest Facebook lead:');
      console.log('- Lead ID:', latestLead._id);
      console.log('- Name:', latestLead.name);
      console.log('- Email:', latestLead.email);
      console.log('- Assigned To:', latestLead.assignedTo);
      console.log('- Assignment History:', latestLead.assignmentHistory?.length || 0, 'entries');
      
      if (latestLead.assignedTo) {
        console.log('✅ SUCCESS: Lead was auto-assigned!');
      } else {
        console.log('❌ FAILURE: Lead was NOT auto-assigned');
      }
    } else {
      console.log('❌ No Facebook lead found');
    }
    
    await leadsConnection.close();
    
  } catch (error) {
    console.error('❌ Error testing Facebook webhook assignment:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testFacebookWebhookAssignment();