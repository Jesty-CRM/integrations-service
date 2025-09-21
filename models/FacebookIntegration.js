const mongoose = require('mongoose');

const facebookIntegrationSchema = new mongoose.Schema({
  // Organization and user info
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  // Facebook connection status
  connected: {
    type: Boolean,
    default: false
  },
  
  // Facebook user info
  fbUserId: String,
  fbUserName: String,
  fbUserPicture: String,
  
  // Access tokens
  userAccessToken: String, // Long-lived user token
  tokenExpiresAt: Date,
  
  // Connected Facebook pages
  fbPages: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    accessToken: String, // Page access token
    picture: String,
    isSubscribed: { type: Boolean, default: false },
    
    // Lead forms for this page
    leadForms: [{
      id: String,
      name: String,
      enabled: { type: Boolean, default: true },
      lastLeadReceived: Date,
      totalLeads: { type: Number, default: 0 }
    }]
  }],
  
  // Settings
  settings: {
    autoCreateLeads: { type: Boolean, default: true },
    leadStatus: { type: String, default: 'New Lead' },
    assignToUser: mongoose.Schema.Types.ObjectId,
    notifyOnNewLead: { type: Boolean, default: true }
  },

  // Lead Assignment Configuration
  assignmentSettings: {
    enabled: { type: Boolean, default: false },
    mode: { 
      type: String, 
      enum: ['auto', 'manual', 'specific'], 
      default: 'manual' 
    },
    
    // For 'specific' mode - assign to these users only
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
  
  // Disabled form IDs (for selective form handling)
  disabledFormIds: [String],
  
  // Statistics
  stats: {
    totalLeadsReceived: { type: Number, default: 0 },
    lastLeadReceived: Date,
    lastSync: Date
  }
}, {
  timestamps: true
});

// Indexes for performance
facebookIntegrationSchema.index({ organizationId: 1 }, { unique: true }); // One Facebook account per organization
facebookIntegrationSchema.index({ 'fbPages.id': 1 });
facebookIntegrationSchema.index({ connected: 1 });

module.exports = mongoose.model('FacebookIntegration', facebookIntegrationSchema);
