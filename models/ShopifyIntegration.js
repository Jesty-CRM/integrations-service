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
  
  // Shopify store details (optional for webhook-only approach)
  shopDomain: {
    type: String,
    required: false,
    lowercase: true,
    trim: true
  },
  shopName: String,
  
  // Webhook configuration (no OAuth needed)
  webhookEndpoint: {
    type: String,
    required: true,
    unique: true
  },
  webhookSecret: {
    type: String,
    required: true
  },
  
  // Webhook events configuration
  webhookEvents: [{
    event: {
      type: String,
      enum: ['orders/create', 'orders/updated', 'customers/create', 'customers/updated', 'carts/create', 'carts/update']
    },
    isEnabled: {
      type: Boolean,
      default: true
    }
  }],
  
  // Lead mapping configuration
  leadMappingConfig: {
    mapOrdersAsLeads: {
      type: Boolean,
      default: true
    },
    mapCustomersAsLeads: {
      type: Boolean,
      default: true
    },
    leadSource: {
      type: String,
      default: 'Shopify'
    },
    leadStatus: {
      type: String,
      default: 'new'
    }
  },

  // Lead Assignment Configuration
  assignmentSettings: {
    enabled: { type: Boolean, default: false },
    mode: { 
      type: String, 
      enum: ['auto', 'manual', 'specific', 'round-robin', 'weighted-round-robin'], 
      default: 'manual' 
    },
    
    // For multi-user assignment modes (round-robin, weighted, etc)
    assignToUsers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      weight: { type: Number, default: 1, min: 1, max: 10 }
    }],
    
    algorithm: {
      type: String,
      enum: ['round-robin', 'weighted-round-robin', 'least-active', 'random'],
      default: 'weighted-round-robin'
    },
    
    // For tracking round-robin assignment
    lastAssignmentIndex: { type: Number, default: 0 },
    
    lastAssignment: {
      userId: mongoose.Schema.Types.ObjectId,
      timestamp: Date,
      roundRobinIndex: { type: Number, default: 0 }
    }
  },
  
  // Statistics
  statistics: {
    totalWebhooksReceived: {
      type: Number,
      default: 0
    },
    totalLeadsCreated: {
      type: Number,
      default: 0
    },
    totalOrdersProcessed: {
      type: Number,
      default: 0
    },
    totalCustomersProcessed: {
      type: Number,
      default: 0
    },
    lastWebhookReceived: {
      type: Date
    },
    totalRevenue: { 
      type: Number, 
      default: 0 
    }
  },
  
  // Integration status
  isActive: {
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
shopifyIntegrationSchema.index({ organizationId: 1 });
shopifyIntegrationSchema.index({ webhookEndpoint: 1 });
shopifyIntegrationSchema.index({ isActive: 1 });

module.exports = mongoose.model('ShopifyIntegration', shopifyIntegrationSchema);
