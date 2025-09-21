const mongoose = require('mongoose');

const integrationConfigSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  provider: {
    type: String,
    enum: ['facebook', 'shopify', 'linkedin', 'justdial', 'indiamart', 'zapier', 'webhook'],
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  
  // Integration Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'error', 'pending_auth', 'suspended'],
    default: 'pending_auth',
    index: true
  },
  
  // Provider-specific Configuration
  config: {
    // Facebook Lead Ads
    facebook: {
      appId: String,
      appSecret: String,
      accessToken: String,
      pageId: String,
      formIds: [String],
      webhookVerifyToken: String
    },
    
    // Shopify
    shopify: {
      shopDomain: String,
      accessToken: String,
      apiKey: String,
      apiSecret: String,
      webhookSecret: String
    },
    
    // LinkedIn
    linkedin: {
      clientId: String,
      clientSecret: String,
      accessToken: String,
      refreshToken: String,
      organizationId: String,
      campaignIds: [String]
    },
    
    // JustDial
    justdial: {
      apiKey: String,
      secretKey: String,
      businessId: String,
      categoryIds: [String]
    },
    
    // IndiaMart
    indiamart: {
      apiKey: String,
      mobileNumber: String,
      emailId: String
    },
    
    // Zapier
    zapier: {
      webhookUrl: String,
      subscriptionId: String,
      eventTypes: [String]
    },
    
    // Generic Webhook
    webhook: {
      url: String,
      method: { type: String, default: 'POST' },
      headers: Object,
      authType: { type: String, enum: ['none', 'basic', 'bearer', 'api_key'] },
      authConfig: Object
    }
  },
  
  // Mapping Configuration
  fieldMapping: {
    name: { type: String, default: 'name' },
    email: { type: String, default: 'email' },
    phone: { type: String, default: 'phone' },
    company: { type: String, default: 'company' },
    source: { type: String, default: 'source' },
    customFields: Object // Maps provider fields to CRM custom fields
  },
  
  // Sync Configuration
  syncConfig: {
    enabled: { type: Boolean, default: true },
    frequency: { 
      type: String, 
      enum: ['realtime', 'hourly', 'daily', 'weekly'],
      default: 'realtime'
    },
    batchSize: { type: Number, default: 100, min: 1, max: 1000 },
    duplicateHandling: {
      type: String,
      enum: ['skip', 'update', 'create_new'],
      default: 'skip'
    },
    autoAssignment: {
      enabled: { type: Boolean, default: false },
      assignTo: mongoose.Schema.Types.ObjectId,
      roundRobin: { type: Boolean, default: false }
    }
  },

  // Advanced Lead Assignment Configuration
  assignmentConfig: {
    enabled: { type: Boolean, default: false },
    mode: { 
      type: String, 
      enum: ['auto', 'manual', 'specific'], 
      default: 'manual' 
    }, // auto = all telecallers, manual = no assignment, specific = selected users only
    
    // For 'specific' mode - assign to these users only
    assignToUsers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      weight: { type: Number, default: 1, min: 1, max: 10 } // Higher weight = more leads
    }],
    
    // Distribution algorithm
    algorithm: {
      type: String,
      enum: ['round-robin', 'weighted-round-robin', 'least-active', 'random'],
      default: 'weighted-round-robin'
    },
    
    // Assignment tracking for algorithms
    lastAssignment: {
      userId: mongoose.Schema.Types.ObjectId,
      timestamp: Date,
      roundRobinIndex: { type: Number, default: 0 } // Index in assignToUsers array
    }
  },

  // Assignment Statistics  
  assignmentStats: {
    totalAssignments: { type: Number, default: 0 },
    lastAssignmentDate: Date,
    userAssignments: [{
      userId: mongoose.Schema.Types.ObjectId,
      count: { type: Number, default: 0 },
      lastAssigned: Date
    }]
  },
  
  // Filters and Conditions
  filters: {
    includeCriteria: Object,
    excludeCriteria: Object,
    dateRange: {
      from: Date,
      to: Date
    },
    sourceFilters: [String]
  },
  
  // Statistics
  stats: {
    totalLeadsImported: { type: Number, default: 0 },
    lastSyncAt: Date,
    lastSuccessfulSyncAt: Date,
    failedSyncs: { type: Number, default: 0 },
    avgLeadsPerSync: { type: Number, default: 0 },
    totalErrors: { type: Number, default: 0 }
  },
  
  // Error Handling
  errorConfig: {
    maxRetries: { type: Number, default: 3 },
    retryDelay: { type: Number, default: 300 }, // seconds
    notifyOnError: { type: Boolean, default: true },
    notifyEmails: [String]
  },
  
  // Webhook Configuration
  webhook: {
    url: String,
    secret: String,
    events: [String], // lead.created, lead.updated, sync.completed, etc.
    lastTriggeredAt: Date,
    totalTriggers: { type: Number, default: 0 }
  },
  
  // Authorization Data
  auth: {
    isAuthorized: { type: Boolean, default: false },
    authorizedAt: Date,
    authorizedBy: mongoose.Schema.Types.ObjectId,
    expiresAt: Date,
    refreshToken: String,
    scopes: [String]
  },
  
  // Rate Limiting
  rateLimit: {
    requestsPerMinute: { type: Number, default: 60 },
    requestsPerHour: { type: Number, default: 1000 },
    requestsPerDay: { type: Number, default: 10000 }
  },
  
  // Audit Trail
  history: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'activated', 'deactivated', 'authorized', 'sync_started', 'sync_completed', 'error']
    },
    timestamp: { type: Date, default: Date.now },
    performedBy: mongoose.Schema.Types.ObjectId,
    details: Object,
    metadata: Object
  }],
  
  // Custom Settings
  customSettings: Object,
  
  // Creation/Update Info
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  updatedBy: mongoose.Schema.Types.ObjectId
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
integrationConfigSchema.index({ companyId: 1, provider: 1 });
integrationConfigSchema.index({ status: 1 });
integrationConfigSchema.index({ 'syncConfig.enabled': 1 });
integrationConfigSchema.index({ 'auth.expiresAt': 1 });

// Virtual properties
integrationConfigSchema.virtual('isActive').get(function() {
  return this.status === 'active' && this.syncConfig.enabled;
});

integrationConfigSchema.virtual('needsReauth').get(function() {
  return this.auth.expiresAt && this.auth.expiresAt < new Date();
});

integrationConfigSchema.virtual('syncHealth').get(function() {
  if (!this.stats.lastSyncAt) return 'never_synced';
  
  const hoursAgo = (new Date() - this.stats.lastSyncAt) / (1000 * 60 * 60);
  const failureRate = this.stats.totalLeadsImported > 0 ? 
    (this.stats.failedSyncs / this.stats.totalLeadsImported) * 100 : 0;
  
  if (failureRate > 50) return 'critical';
  if (failureRate > 20 || hoursAgo > 48) return 'warning';
  if (hoursAgo > 24) return 'stale';
  return 'healthy';
});

// Methods
integrationConfigSchema.methods.updateStats = function(leadsImported, success = true) {
  this.stats.totalLeadsImported += leadsImported;
  this.stats.lastSyncAt = new Date();
  
  if (success) {
    this.stats.lastSuccessfulSyncAt = new Date();
    this.stats.avgLeadsPerSync = Math.round(
      ((this.stats.avgLeadsPerSync * (this.stats.totalLeadsImported - leadsImported)) + leadsImported) / 
      this.stats.totalLeadsImported
    );
  } else {
    this.stats.failedSyncs += 1;
    this.stats.totalErrors += 1;
  }
  
  return this.save();
};

integrationConfigSchema.methods.addHistoryEntry = function(action, details, performedBy) {
  this.history.push({
    action,
    details,
    performedBy,
    metadata: {
      status: this.status,
      syncEnabled: this.syncConfig.enabled
    }
  });
  
  return this.save();
};

integrationConfigSchema.methods.authorize = function(authData, authorizedBy) {
  this.auth.isAuthorized = true;
  this.auth.authorizedAt = new Date();
  this.auth.authorizedBy = authorizedBy;
  
  if (authData.expiresAt) this.auth.expiresAt = authData.expiresAt;
  if (authData.refreshToken) this.auth.refreshToken = authData.refreshToken;
  if (authData.scopes) this.auth.scopes = authData.scopes;
  
  this.status = 'active';
  
  this.addHistoryEntry('authorized', authData, authorizedBy);
  
  return this.save();
};

integrationConfigSchema.methods.deauthorize = function(reason, performedBy) {
  this.auth.isAuthorized = false;
  this.auth.expiresAt = undefined;
  this.auth.refreshToken = undefined;
  this.status = 'inactive';
  
  this.addHistoryEntry('deactivated', { reason }, performedBy);
  
  return this.save();
};

integrationConfigSchema.methods.testConnection = async function() {
  // This would be implemented in the service layer
  // Different logic for each provider
  return { success: true, message: 'Connection test not implemented' };
};

// Static methods
integrationConfigSchema.statics.getActiveIntegrations = function(companyId) {
  return this.find({
    companyId,
    status: 'active',
    'syncConfig.enabled': true
  });
};

integrationConfigSchema.statics.getByProvider = function(provider, companyId = null) {
  const filter = { provider };
  if (companyId) filter.companyId = companyId;
  
  return this.find(filter);
};

integrationConfigSchema.statics.getNeedingReauth = function() {
  return this.find({
    'auth.expiresAt': { $lt: new Date() },
    status: 'active'
  });
};

integrationConfigSchema.statics.getHealthStatus = function(companyId) {
  return this.aggregate([
    { $match: { companyId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        providers: { $push: '$provider' }
      }
    }
  ]);
};

// Pre-save middleware
integrationConfigSchema.pre('save', function(next) {
  // Update the updatedBy field if it's not already set
  if (this.isModified() && !this.updatedBy) {
    // This would typically be set by the controller
  }
  
  next();
});

module.exports = mongoose.model('IntegrationConfig', integrationConfigSchema);
