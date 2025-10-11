const FacebookIntegration = require('./models/FacebookIntegration');
const mongoose = require('mongoose');
require('dotenv').config();

// Test Facebook duplicate connection handling
async function testFacebookDuplicateHandling() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jesty_integrations');
    console.log('✅ Connected to MongoDB');
    
    const fbUserId = "3663875647250316"; // Your Facebook user ID
    const org1 = "68e4c346152591d8b08d8282"; // First organization
    const org2 = "68e4c346152591d8b08d8999"; // Mock second organization
    
    console.log('\n🔍 Checking current Facebook integrations...');
    
    // Check existing integrations for this Facebook user
    const existingIntegrations = await FacebookIntegration.find({ fbUserId });
    console.log(`Found ${existingIntegrations.length} existing integrations for Facebook user ${fbUserId}:`);
    
    existingIntegrations.forEach((integration, index) => {
      console.log(`${index + 1}. Organization: ${integration.organizationId}, Connected: ${integration.connected}`);
    });
    
    // Simulate what happens when same Facebook account connects to different org
    console.log('\n🧪 Testing duplicate detection logic...');
    
    // Find integrations with same fbUserId but different organizationId
    const duplicateIntegrations = await FacebookIntegration.find({ 
      fbUserId: fbUserId,
      organizationId: { $ne: org1 } // Exclude current organization
    });
    
    console.log(`Found ${duplicateIntegrations.length} duplicate integrations that would be removed`);
    
    if (duplicateIntegrations.length > 0) {
      console.log('Duplicate integrations found:');
      duplicateIntegrations.forEach((integration, index) => {
        console.log(`${index + 1}. ID: ${integration._id}, Organization: ${integration.organizationId}`);
      });
    }
    
    // Test the complete flow with example data
    console.log('\n📊 Integration summary:');
    console.log(`Facebook User ID: ${fbUserId}`);
    console.log(`Current Organization: ${org1}`);
    console.log(`Would remove ${duplicateIntegrations.length} conflicting integrations`);
    
    console.log('\n✅ Duplicate handling test completed successfully');
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
console.log('🚀 Starting Facebook duplicate connection test...');
testFacebookDuplicateHandling();