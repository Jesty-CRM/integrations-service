/**
 * Test script to manually sync Facebook pages for existing integration
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
const FacebookService = require('./services/facebook.service');

async function testSync() {
  try {
    console.log('🔍 Finding Facebook integration...');
    
    const integration = await FacebookIntegration.findOne({
      organizationId: '68c42a2e97977c4ae18802dc'
    });
    
    if (!integration) {
      console.log('❌ No integration found');
      process.exit(1);
    }
    
    console.log('📄 Found integration:', {
      id: integration.id,
      connected: integration.connected,
      fbUserId: integration.fbUserId,
      currentPages: integration.fbPages.length
    });
    
    console.log('🔄 Starting manual sync...');
    const facebookService = new FacebookService();
    const updatedIntegration = await facebookService.syncPages(integration);
    
    console.log('✅ Sync completed successfully!');
    console.log('📊 Results:', {
      pagesCount: updatedIntegration.fbPages.length,
      totalForms: updatedIntegration.fbPages.reduce((total, page) => total + (page.leadForms?.length || 0), 0),
      pagesDetails: updatedIntegration.fbPages.map(page => ({
        id: page.id,
        name: page.name,
        formsCount: page.leadForms?.length || 0,
        forms: page.leadForms?.map(form => ({
          id: form.id,
          name: form.name,
          questionsCount: form.questions?.length || 0
        }))
      }))
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    if (error.response?.data) {
      console.error('📄 Facebook API response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testSync();