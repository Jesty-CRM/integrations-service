/**
 * Debug Facebook OAuth Process
 * Run this to test the Facebook OAuth flow with detailed logging
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

const FacebookIntegration = require('./models/FacebookIntegration');

async function testDatabaseOperation() {
  try {
    console.log('🔍 Testing database operations...');
    
    // Test creating a simple integration
    const testData = {
      organizationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      connected: true,
      fbUserId: 'test_user_id',
      fbUserName: 'Test User',
      fbUserPicture: '',
      userAccessToken: 'test_token',
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      fbPages: [{
        id: 'test_page_id',
        name: 'Test Page',
        accessToken: 'test_page_token',
        lastSyncAt: new Date(),
        leadForms: [{
          id: 'test_form_id',
          name: 'Test Form',
          status: 'ACTIVE',
          leadsCount: 0,
          createdTime: new Date().toISOString(),
          enabled: true,
          questions: [],
          assignmentSettings: {
            enabled: false,
            algorithm: 'round-robin',
            assignToUsers: [],
            lastAssignment: {
              mode: 'manual',
              lastAssignedIndex: 0,
              lastAssignedAt: null,
              lastAssignedTo: null
            }
          },
          stats: {
            leadsThisMonth: 0,
            leadsThisWeek: 0,
            leadsToday: 0,
            lastLeadReceived: null
          }
        }]
      }],
      lastSync: new Date()
    };

    console.log('Creating test integration...');
    const integration = new FacebookIntegration(testData);
    await integration.save();
    console.log('✅ Test integration created:', integration._id);

    // Test findOneAndUpdate (upsert)
    console.log('Testing findOneAndUpdate with upsert...');
    const updated = await FacebookIntegration.findOneAndUpdate(
      { organizationId: testData.organizationId },
      { 
        ...testData,
        fbUserName: 'Updated Test User'
      },
      { upsert: true, new: true }
    );
    console.log('✅ Integration upserted:', updated._id);

    // Clean up
    await FacebookIntegration.deleteOne({ _id: integration._id });
    console.log('✅ Test integration cleaned up');

    console.log('✅ All database tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Database test failed:', {
      message: error.message,
      stack: error.stack,
      errors: error.errors
    });
    process.exit(1);
  }
}

// Test Facebook API configuration
function testFacebookConfig() {
  console.log('🔍 Testing Facebook configuration...');
  
  const requiredEnvVars = [
    'FB_APP_ID',
    'FB_APP_SECRET',
    'FB_VERIFY_TOKEN',
    'API_URL',
    'MONGODB_URI'
  ];

  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing);
    return false;
  }

  console.log('✅ All required environment variables are set');
  console.log('Facebook App ID:', process.env.FB_APP_ID);
  console.log('API URL:', process.env.API_URL);
  return true;
}

async function main() {
  console.log('🚀 Starting Facebook OAuth Debug Test...\n');
  
  // Test configuration
  if (!testFacebookConfig()) {
    process.exit(1);
  }
  
  // Test database operations
  await testDatabaseOperation();
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testDatabaseOperation, testFacebookConfig };