const mongoose = require('mongoose');
require('dotenv').config();

// Connect to the leads database
const connectToLeadsDB = async () => {
  try {
    // Use the same database URI as the leads service
    const mongoUri = 'mongodb+srv://jestycrm_db_user:JestyMongo1609@jesty.gwwnvsx.mongodb.net/jesty_leads';
    await mongoose.connect(mongoUri);
    console.log('Connected to leads database (cloud)');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Define Lead schema (simple version)
const leadSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  source: String,
  organizationId: String,
  shopifyOrderId: String,
  orderValue: Number,
  currency: String,
  createdAt: { type: Date, default: Date.now },
  extraFields: Object
}, { collection: 'leads' });

const Lead = mongoose.model('Lead', leadSchema);

const verifyShopifyLeads = async () => {
  try {
    await connectToLeadsDB();
    
    console.log('\n=== Shopify Leads Verification ===\n');
    
    // Find all Shopify leads
    const shopifyLeads = await Lead.find({ source: 'shopify' })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name email phone shopifyOrderId orderValue currency createdAt')
      .lean();
    
    console.log(`Found ${shopifyLeads.length} Shopify leads:`);
    console.log('==========================================');
    
    shopifyLeads.forEach((lead, index) => {
      console.log(`${index + 1}. Name: ${lead.name}`);
      console.log(`   Email: ${lead.email}`);
      console.log(`   Phone: ${lead.phone || 'N/A'}`);
      console.log(`   Order ID: ${lead.shopifyOrderId}`);
      console.log(`   Order Value: ${lead.orderValue} ${lead.currency}`);
      console.log(`   Created: ${lead.createdAt}`);
      console.log('   ---');
    });
    
    if (shopifyLeads.length === 0) {
      console.log('No Shopify leads found. Checking all leads...');
    }
    
    // Count total leads
    const totalLeads = await Lead.countDocuments();
    console.log(`\nTotal leads in database: ${totalLeads}`);
    
    // Show recent leads from any source
    const recentLeads = await Lead.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email source createdAt shopifyOrderId')
      .lean();
    
    console.log('\nRecent leads (any source):');
    recentLeads.forEach((lead, index) => {
      console.log(`${index + 1}. ${lead.name} (${lead.email}) - ${lead.source} - ${lead.createdAt} - Order: ${lead.shopifyOrderId || 'N/A'}`);
    });
    
  } catch (error) {
    console.error('Error verifying leads:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
};

// Run the verification
verifyShopifyLeads();