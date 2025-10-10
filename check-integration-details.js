require('dotenv').config();
const FacebookIntegration = require('./models/FacebookIntegration');
const mongoose = require('mongoose');

async function getIntegrationDetails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const integration = await FacebookIntegration.findOne({
      organizationId: '68e8d18834596d41a715228b'
    });
    
    if (integration) {
      console.log('✅ Found Facebook integration');
      console.log('Organization ID:', integration.organizationId);
      console.log('Connected:', integration.connected);
      console.log('Total leads:', integration.totalLeads);
      console.log('');
      
      console.log('📋 Available Facebook Pages:');
      integration.fbPages.forEach((page, index) => {
        console.log(`Page ${index + 1}:`);
        console.log('  ID:', page.id);
        console.log('  Name:', page.name);
        console.log('  Access token length:', page.accessToken?.length || 0);
        
        if (page.leadForms && page.leadForms.length > 0) {
          console.log('  📝 Lead Forms:');
          page.leadForms.forEach((form, formIndex) => {
            console.log(`    Form ${formIndex + 1}:`);
            console.log('      ID:', form.id);
            console.log('      Name:', form.name);
            console.log('      Enabled:', form.enabled);
            console.log('      Has assignment settings:', !!form.assignmentSettings);
            if (form.assignmentSettings) {
              console.log('      Assignment enabled:', form.assignmentSettings.enabled);
              console.log('      Assigned users count:', form.assignmentSettings.assignedUsers?.length || 0);
            }
          });
        } else {
          console.log('  ❌ No lead forms found');
        }
        console.log('');
      });
    } else {
      console.log('❌ No integration found for organizationId: 68e8d18834596d41a715228b');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

getIntegrationDetails();