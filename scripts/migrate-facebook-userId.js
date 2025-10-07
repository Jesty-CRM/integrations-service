/**
 * Migration script to fix Facebook integrations missing userId
 */

const mongoose = require('mongoose');
const FacebookIntegration = require('../models/FacebookIntegration');
const logger = require('../utils/logger');

async function migrateFacebookIntegrations() {
  try {
    console.log('🔄 Starting Facebook integration userId migration...');
    
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('✅ Connected to MongoDB');
    }

    // Find integrations without userId
    const integrationsWithoutUserId = await FacebookIntegration.find({
      $or: [
        { userId: { $exists: false } },
        { userId: null }
      ]
    });

    console.log(`📊 Found ${integrationsWithoutUserId.length} integrations missing userId`);

    if (integrationsWithoutUserId.length === 0) {
      console.log('✅ No integrations need migration');
      return;
    }

    // Display details of integrations that need migration
    console.log('\n📋 Integrations needing migration:');
    integrationsWithoutUserId.forEach((integration, index) => {
      console.log(`  ${index + 1}. Organization: ${integration.organizationId}`);
      console.log(`     Facebook User: ${integration.fbUserName} (${integration.fbUserId})`);
      console.log(`     Connected: ${integration.connected}`);
      console.log(`     Pages: ${integration.fbPages?.length || 0}`);
      console.log(`     Created: ${integration.createdAt}\n`);
    });

    // Mark them for migration (they'll be fixed when users next access their Facebook integration)
    const updateResult = await FacebookIntegration.updateMany(
      {
        $or: [
          { userId: { $exists: false } },
          { userId: null }
        ]
      },
      {
        $set: {
          needsUserMigration: true,
          migrationNote: 'userId needs to be set when user next accesses Facebook integration'
        }
      }
    );

    console.log(`✅ Marked ${updateResult.modifiedCount} integrations for user migration`);
    console.log('');
    console.log('📝 Migration Notes:');
    console.log('   - Integrations have been marked for migration');
    console.log('   - userId will be automatically set when users next access their Facebook integration');
    console.log('   - This will eliminate the "Integration missing userId" warnings');
    console.log('   - No manual intervention required');

    return {
      found: integrationsWithoutUserId.length,
      marked: updateResult.modifiedCount
    };

  } catch (error) {
    console.error('❌ Error during Facebook integration migration:', error.message);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateFacebookIntegrations()
    .then((result) => {
      if (result) {
        console.log(`\n🎉 Migration completed: ${result.marked} integrations marked for migration`);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = migrateFacebookIntegrations;