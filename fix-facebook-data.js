/**
 * Migration script to fix Facebook integration data structure
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

const FacebookIntegration = require('./models/FacebookIntegration');

async function fixFacebookIntegrations() {
  try {
    console.log('🔍 Finding Facebook integrations to fix...');
    
    const integrations = await FacebookIntegration.find({});
    console.log(`Found ${integrations.length} integrations`);
    
    for (const integration of integrations) {
      console.log(`\n📝 Fixing integration ${integration._id}...`);
      
      let hasChanges = false;
      
      // Fix fbPages structure
      if (integration.fbPages && integration.fbPages.length > 0) {
        integration.fbPages = integration.fbPages.map(page => {
          const fixedPage = {
            id: page.id,
            name: page.name,
            accessToken: page.accessToken,
            lastSyncAt: page.lastSyncAt || new Date(),
            leadForms: []
          };
          
          if (page.leadForms && Array.isArray(page.leadForms)) {
            fixedPage.leadForms = page.leadForms.map(form => ({
              id: form.id,
              name: form.name,
              status: form.status || 'ACTIVE',
              leadsCount: Number(form.leadsCount) || 0,
              createdTime: form.createdTime,
              enabled: form.enabled !== undefined ? Boolean(form.enabled) : true,
              questions: Array.isArray(form.questions) ? form.questions : [],
              assignmentSettings: {
                enabled: form.assignmentSettings?.enabled || false,
                algorithm: form.assignmentSettings?.algorithm || 'round-robin',
                assignToUsers: Array.isArray(form.assignmentSettings?.assignToUsers) ? form.assignmentSettings.assignToUsers : [],
                lastAssignment: {
                  mode: form.assignmentSettings?.lastAssignment?.mode || 'manual',
                  lastAssignedIndex: form.assignmentSettings?.lastAssignment?.lastAssignedIndex || 0,
                  lastAssignedAt: form.assignmentSettings?.lastAssignment?.lastAssignedAt || null,
                  lastAssignedTo: form.assignmentSettings?.lastAssignment?.lastAssignedTo || null
                }
              },
              stats: {
                leadsThisMonth: form.stats?.leadsThisMonth || 0,
                leadsThisWeek: form.stats?.leadsThisWeek || 0,
                leadsToday: form.stats?.leadsToday || 0,
                lastLeadReceived: form.stats?.lastLeadReceived || null
              }
            }));
          }
          
          return fixedPage;
        });
        hasChanges = true;
      }
      
      // Ensure stats object exists
      if (!integration.stats) {
        integration.stats = {
          leadsThisMonth: 0,
          leadsThisWeek: 0,
          leadsToday: 0
        };
        hasChanges = true;
      }
      
      // Ensure settings object exists
      if (!integration.settings) {
        integration.settings = {
          autoProcessLeads: true,
          leadNotifications: true
        };
        hasChanges = true;
      }
      
      if (hasChanges) {
        try {
          await integration.save();
          console.log(`✅ Fixed integration ${integration._id}`);
        } catch (error) {
          console.error(`❌ Failed to fix integration ${integration._id}:`, error.message);
          
          // If save fails, try to delete and recreate with clean data
          if (error.name === 'ValidationError') {
            console.log('🔄 Attempting to recreate with clean data...');
            
            const cleanData = {
              organizationId: integration.organizationId,
              userId: integration.userId,
              connected: integration.connected,
              fbUserId: integration.fbUserId,
              fbUserName: integration.fbUserName,
              fbUserPicture: integration.fbUserPicture,
              userAccessToken: integration.userAccessToken,
              tokenExpiresAt: integration.tokenExpiresAt,
              fbPages: integration.fbPages || [],
              lastSync: integration.lastSync || new Date(),
              totalLeads: integration.totalLeads || 0,
              lastLeadReceived: integration.lastLeadReceived,
              stats: {
                leadsThisMonth: 0,
                leadsThisWeek: 0,
                leadsToday: 0
              },
              settings: {
                autoProcessLeads: true,
                leadNotifications: true
              }
            };
            
            await FacebookIntegration.findByIdAndDelete(integration._id);
            const newIntegration = new FacebookIntegration(cleanData);
            await newIntegration.save();
            
            console.log(`✅ Recreated integration ${newIntegration._id}`);
          }
        }
      } else {
        console.log(`ℹ️  Integration ${integration._id} is already in correct format`);
      }
    }
    
    console.log('\n✅ Migration completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  fixFacebookIntegrations();
}

module.exports = fixFacebookIntegrations;