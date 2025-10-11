const FacebookIntegration = require('./models/FacebookIntegration');
const facebookService = require('./services/facebook.service');
const mongoose = require('mongoose');
require('dotenv').config();

// Test Facebook duplicate cleanup functionality
async function testFacebookDuplicateCleanup() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jesty_integrations');
    console.log('✅ Connected to MongoDB');
    
    const fbUserId = "3663875647250316"; // Your Facebook user ID
    const keepOrganizationId = "68e4c346152591d8b08d8282"; // Organization to keep (first one)
    
    console.log('\n🔍 Before cleanup - checking existing integrations...');
    
    // Check existing integrations for this Facebook user
    const beforeIntegrations = await FacebookIntegration.find({ fbUserId });
    console.log(`Found ${beforeIntegrations.length} existing integrations for Facebook user ${fbUserId}:`);
    
    beforeIntegrations.forEach((integration, index) => {
      console.log(`${index + 1}. ID: ${integration._id}, Organization: ${integration.organizationId}, Connected: ${integration.connected}`);
    });
    
    console.log('\n🧹 Running cleanup operation...');
    
    // Run the cleanup
    const cleanupResult = await facebookService.cleanupDuplicateIntegrations(fbUserId, keepOrganizationId);
    
    console.log('Cleanup result:', {
      success: cleanupResult.success,
      removedCount: cleanupResult.removedCount,
      message: cleanupResult.message
    });
    
    if (cleanupResult.removedIntegrations.length > 0) {
      console.log('\nRemoved integrations:');
      cleanupResult.removedIntegrations.forEach((removed, index) => {
        console.log(`${index + 1}. ID: ${removed.integrationId}, Organization: ${removed.organizationId}, User: ${removed.fbUserName}`);
      });
    }
    
    console.log('\n🔍 After cleanup - checking remaining integrations...');
    
    // Check remaining integrations
    const afterIntegrations = await FacebookIntegration.find({ fbUserId });
    console.log(`Now found ${afterIntegrations.length} integrations for Facebook user ${fbUserId}:`);
    
    afterIntegrations.forEach((integration, index) => {
      console.log(`${index + 1}. ID: ${integration._id}, Organization: ${integration.organizationId}, Connected: ${integration.connected}`);
    });
    
    console.log('\n✅ Cleanup test completed successfully');
    
  } catch (error) {
    console.error('❌ Error during cleanup test:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
console.log('🚀 Starting Facebook duplicate cleanup test...');
testFacebookDuplicateCleanup();