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
  userAccessToken: String, // Long-lived user token
  
  // Connected Facebook pages (simplified like old Jesty)
  fbPages: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    accessToken: String // Page access token
  }],
  
  // Simple disabled form tracking like old Jesty backend
  disabledFormIds: [String],
  
  // Basic stats
  totalLeads: { type: Number, default: 0 },
  lastLeadReceived: Date
}, {
  timestamps: true
});

// Indexes for performance
facebookIntegrationSchema.index({ organizationId: 1 }, { unique: true }); // One Facebook account per organization
facebookIntegrationSchema.index({ 'fbPages.id': 1 });
facebookIntegrationSchema.index({ connected: 1 });

module.exports = mongoose.model('FacebookIntegration', facebookIntegrationSchema);
