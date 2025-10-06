const mongoose = require('mongoose');

const facebookIntegrationSchema = new mongoose.Schema({
  // Integration ID (for external references)
  id: {
    type: String,
    unique: true,
    sparse: true // Allow null/undefined values but ensure uniqueness when present
  },
  // Organization and user info
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false, // Temporarily make optional to prevent crashes
    index: true, // Add index for faster queries by user
    ref: 'User' // Add reference to User model for population
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
  userAccessToken: String, // Long-lived user token
  tokenExpiresAt: Date,
  
  // Connected Facebook pages with forms and individual settings
  fbPages: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    accessToken: String, // Page access token
    lastSyncAt: { type: Date, default: Date.now },
    leadForms: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      status: { type: String, default: 'ACTIVE' }, // Facebook's status
      leadsCount: { type: Number, default: 0 },
      createdTime: String,
      
      // CRM Control Settings
      enabled: { 
        type: Boolean, 
        default: true,
        index: true // Add index for fast queries
      },
      crmStatus: {
        type: String,
        enum: ['active', 'paused', 'disabled'],
        default: 'active'
      },
      disabledAt: Date,
      disabledBy: mongoose.Schema.Types.ObjectId,
      disabledReason: String,
      
      questions: [{
        id: String,
        key: String,
        label: String,
        type: String,
        options: [{
          key: String,
          value: String
        }]
      }],
      // Form-level assignment settings
      assignmentSettings: {
        enabled: {
          type: Boolean,
          default: false
        },
        algorithm: {
          type: String,
          enum: ['round-robin', 'weighted-round-robin', 'least-assigned', 'random'],
          default: 'round-robin'
        },
        assignToUsers: [{
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: function() {
              // Only require userId if the parent array has items
              return this.parent().length > 0;
            }
          },
          weight: {
            type: Number,
            default: 1,
            min: 1,
            max: 10
          },
          isActive: {
            type: Boolean,
            default: true
          }
        }],
        lastAssignment: {
          mode: {
            type: String,
            enum: ['manual', 'automatic'],
            default: 'manual'
          },
          lastAssignedIndex: {
            type: Number,
            default: 0
          },
          lastAssignedAt: Date,
          lastAssignedTo: mongoose.Schema.Types.ObjectId
        }
      },
      // Form stats
      stats: {
        leadsThisMonth: { type: Number, default: 0 },
        leadsThisWeek: { type: Number, default: 0 },
        leadsToday: { type: Number, default: 0 },
        lastLeadReceived: Date
      }
    }]
  }],
  
  // Additional settings
  settings: {
    autoProcessLeads: {
      type: Boolean,
      default: true
    },
    leadNotifications: {
      type: Boolean,
      default: true
    }
  },
  
  // Basic stats
  totalLeads: { type: Number, default: 0 },
  lastLeadReceived: Date,
  lastSync: Date,
  stats: {
    leadsThisMonth: { type: Number, default: 0 },
    leadsThisWeek: { type: Number, default: 0 },
    leadsToday: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate id if not present
facebookIntegrationSchema.pre('save', function(next) {
  if (!this.id) {
    this.id = `fb_${this.organizationId}_${Date.now()}`;
  }
  next();
});

// Indexes for performance
facebookIntegrationSchema.index({ organizationId: 1 }, { unique: true }); // One Facebook account per organization
facebookIntegrationSchema.index({ id: 1 }, { unique: true, sparse: true }); // Unique integration ID
facebookIntegrationSchema.index({ userId: 1 }); // Index for userId queries
facebookIntegrationSchema.index({ 'fbPages.id': 1 });
facebookIntegrationSchema.index({ 'fbPages.leadForms.id': 1 });
facebookIntegrationSchema.index({ 'fbPages.leadForms.enabled': 1 }); // Index for enabled/disabled forms
facebookIntegrationSchema.index({ 'fbPages.leadForms.crmStatus': 1 }); // Index for CRM status
facebookIntegrationSchema.index({ connected: 1 });

// Virtual field to get user information (would need to be populated from auth service)
facebookIntegrationSchema.virtual('createdByUser', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Static methods for common queries
facebookIntegrationSchema.statics.findByUser = function(userId) {
  return this.find({ userId: userId });
};

facebookIntegrationSchema.statics.findByOrganizationAndUser = function(organizationId, userId) {
  return this.findOne({ organizationId: organizationId, userId: userId });
};

// Instance methods
facebookIntegrationSchema.methods.getCreatorInfo = function() {
  return {
    userId: this.userId,
    organizationId: this.organizationId,
    createdAt: this.createdAt,
    fbUserName: this.fbUserName
  };
};

module.exports = mongoose.model('FacebookIntegration', facebookIntegrationSchema);
