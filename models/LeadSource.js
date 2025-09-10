const mongoose = require('mongoose');

const leadSourceSchema = new mongoose.Schema({
  // Organization info
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Lead details
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  // Source information
  source: {
    type: String,
    required: true,
    enum: ['website', 'facebook', 'shopify', 'ai-agent', 'manual', 'api', 'import']
  },
  
  sourceDetails: {
    // For website leads
    domain: String,
    page: String,
    referrer: String,
    
    // For Facebook leads
    campaignId: String,
    adsetId: String,
    adId: String,
    formId: String,
    
    // For Shopify leads
    shopDomain: String,
    orderId: String,
    
    // For AI agent leads
    agentId: String,
    conversationId: String,
    
    // Additional tracking
    utm: {
      source: String,
      medium: String,
      campaign: String,
      term: String,
      content: String
    }
  },
  
  // Lead data
  leadData: {
    name: String,
    email: String,
    phone: String,
    customFields: mongoose.Schema.Types.Mixed
  },
  
  // Tracking info
  ipAddress: String,
  userAgent: String,
  location: {
    country: String,
    region: String,
    city: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  // Processing status
  processed: {
    type: Boolean,
    default: false
  },
  processedAt: Date,
  
  // Error handling
  error: {
    message: String,
    timestamp: Date,
    resolved: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Indexes
leadSourceSchema.index({ organizationId: 1, source: 1 });
leadSourceSchema.index({ leadId: 1 });
leadSourceSchema.index({ processed: 1 });
leadSourceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LeadSource', leadSourceSchema);
