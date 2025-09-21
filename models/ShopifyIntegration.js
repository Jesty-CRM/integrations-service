const mongoose = require('mongoose');

const shopifyIntegrationSchema = new mongoose.Schema({
  // Organization info
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  // Shopify store details
  shopDomain: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  shopName: String,
  shopOwner: String,
  shopEmail: String,
  
  // OAuth credentials
  accessToken: {
    type: String,
    required: true
  },
  scope: String,
  
  // Webhooks configuration
  webhooks: [{
    id: String,
    topic: {
      type: String,
      enum: [
        'customers/create',
        'customers/update',
        'orders/create',
        'orders/updated',
        'orders/paid',
        'app/uninstalled'
      ]
    },
    address: String,
    isActive: { type: Boolean, default: true }
  }],
  
  // Sync settings
  syncSettings: {
    syncCustomers: { type: Boolean, default: true },
    syncOrders: { type: Boolean, default: true },
    customerStatus: { type: String, default: 'Customer' },
    orderLeadStatus: { type: String, default: 'Converted' },
    assignToUser: mongoose.Schema.Types.ObjectId
  },

  // Lead Assignment Configuration
  assignmentSettings: {
    enabled: { type: Boolean, default: false },
    mode: { 
      type: String, 
      enum: ['auto', 'manual', 'specific'], 
      default: 'manual' 
    },
    
    assignToUsers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      weight: { type: Number, default: 1, min: 1, max: 10 }
    }],
    
    algorithm: {
      type: String,
      enum: ['round-robin', 'weighted-round-robin', 'least-active', 'random'],
      default: 'weighted-round-robin'
    },
    
    lastAssignment: {
      userId: mongoose.Schema.Types.ObjectId,
      timestamp: Date,
      roundRobinIndex: { type: Number, default: 0 }
    }
  },
  
  // Last sync info
  lastSync: {
    customers: Date,
    orders: Date,
    products: Date
  },
  
  // Statistics
  stats: {
    customersImported: { type: Number, default: 0 },
    ordersImported: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    lastActivity: Date
  },
  
  // Integration status
  isActive: {
    type: Boolean,
    default: true
  },
  
  isInstalled: {
    type: Boolean,
    default: true
  },
  
  // Error tracking
  lastError: {
    message: String,
    timestamp: Date,
    resolved: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Indexes
shopifyIntegrationSchema.index({ organizationId: 1, shopDomain: 1 }, { unique: true });
shopifyIntegrationSchema.index({ isActive: 1, isInstalled: 1 });

module.exports = mongoose.model('ShopifyIntegration', shopifyIntegrationSchema);
