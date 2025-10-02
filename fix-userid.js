/**
 * Fix missing userId in Facebook integration
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

async function fixUserId() {
  try {
    console.log('🔍 Finding Facebook integration without userId...');
    
    const integration = await FacebookIntegration.findOne({
      organizationId: '68c42a2e97977c4ae18802dc'
    });
    
    if (!integration) {
      console.log('❌ No integration found');
      process.exit(1);
    }
    
    console.log('📄 Found integration:', integration._id);
    console.log('👤 Current userId:', integration.userId);
    
    if (!integration.userId) {
      console.log('🔧 Setting userId to 68c42a2e97977c4ae18802de...');
      integration.userId = '68c42a2e97977c4ae18802de';
      
      await integration.save();
      console.log('✅ UserId updated successfully');
    } else {
      console.log('ℹ️  UserId already exists');
    }
    
    console.log('✅ Fix completed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  }
}

// Run the fix
fixUserId();