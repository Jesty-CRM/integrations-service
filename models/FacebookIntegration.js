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
  userAccessToken: String, // Long-lived user token
  tokenExpiresAt: Date,
  
  // Connected Facebook pages (simplified like old Jesty)
  fbPages: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    accessToken: String // Page access token
  }],
  
  // Simple disabled form tracking like old Jesty backend
  disabledFormIds: [String],
  
  // Lead assignment settings
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
        required: true
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
  stats: {
    leadsThisMonth: { type: Number, default: 0 },
    leadsThisWeek: { type: Number, default: 0 },
    leadsToday: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes for performance
facebookIntegrationSchema.index({ organizationId: 1 }, { unique: true }); // One Facebook account per organization
facebookIntegrationSchema.index({ 'fbPages.id': 1 });
facebookIntegrationSchema.index({ connected: 1 });

module.exports = mongoose.model('FacebookIntegration', facebookIntegrationSchema);
