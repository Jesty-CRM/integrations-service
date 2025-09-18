const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: function() {
      return !this.email && !this.phone; // Either name, email, or phone must be present
    },
    trim: true
  },
  email: {
    type: String,
    required: function() {
      return !this.name && !this.phone; // Either name, email, or phone must be present
    },
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please provide a valid email address'
    }
  },
  phone: {
    type: String,
    required: function() {
      return !this.name && !this.email; // Either name, email, or phone must be present
    },
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^[+]?[\d\s\-\(\)]{10,15}$/.test(v);
      },
      message: 'Please provide a valid phone number'
    }
  },
  
  // Source Information
  source: {
    type: String,
    enum: ['Website', 'Meta', 'LinkedIn', 'Shopify', 'WordPress', 'Manual', 'Import'],
    required: true,
    default: 'Website'
  },
  sourceDetails: {
    integrationId: mongoose.Schema.Types.ObjectId,
    integrationKey: String,
    formId: String,
    formName: String,
    domain: String,
    page: String,
    referrer: String,
    utm: {
      source: String,
      medium: String,
      campaign: String,
      term: String,
      content: String
    },
    userAgent: String,
    ipAddress: String
  },
  
  // Lead Management
  status: {
    type: String,
    enum: ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'Duplicate'],
    default: 'New Lead'
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Telecaller assignment
  },
  assignedAt: Date,
  assignedBy: mongoose.Schema.Types.ObjectId,
  
  // Comments and Notes
  comment: String,
  notes: [{
    content: String,
    addedBy: mongoose.Schema.Types.ObjectId,
    addedAt: { type: Date, default: Date.now }
  }],
  
  // Interaction Tracking
  lastInteractionDate: Date,
  interactions: [{
    type: { type: String, enum: ['call', 'email', 'meeting', 'sms', 'note'] },
    description: String,
    performedBy: mongoose.Schema.Types.ObjectId,
    performedAt: { type: Date, default: Date.now },
    outcome: String
  }],
  
  // Sales Pipeline
  closeConfidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  expectedCloseDate: Date,
  dealValue: {
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' }
  },
  
  // Organization
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Dynamic Fields (flexible form data)
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  
  // Original form data (for reference)
  originalData: mongoose.Schema.Types.Mixed,
  
  // Duplicate Handling
  isDuplicate: { type: Boolean, default: false },
  duplicateOf: mongoose.Schema.Types.ObjectId, // Reference to original lead
  duplicateMatches: [{
    leadId: mongoose.Schema.Types.ObjectId,
    matchedFields: [String],
    matchedAt: { type: Date, default: Date.now }
  }],
  
  // Metadata
  tags: [String],
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date
}, {
  timestamps: true // createdAt, updatedAt
});

// Indexes for performance and uniqueness
leadSchema.index({ organizationId: 1, email: 1 });
leadSchema.index({ organizationId: 1, phone: 1 });
leadSchema.index({ organizationId: 1, status: 1 });
leadSchema.index({ organizationId: 1, assignee: 1 });
leadSchema.index({ organizationId: 1, source: 1 });
leadSchema.index({ organizationId: 1, createdAt: -1 });
leadSchema.index({ isDuplicate: 1 });
leadSchema.index({ isActive: 1, isDeleted: 1 });

// Compound index for duplicate detection
leadSchema.index({ 
  organizationId: 1, 
  email: 1, 
  phone: 1, 
  isActive: 1, 
  isDeleted: 1 
});

// Virtual for full name
leadSchema.virtual('fullName').get(function() {
  return this.name || `${this.firstName || ''} ${this.lastName || ''}`.trim() || this.email;
});

// Method to check for duplicates
leadSchema.methods.findDuplicates = async function() {
  const duplicates = [];
  
  if (this.email) {
    const emailDuplicates = await this.constructor.find({
      organizationId: this.organizationId,
      email: this.email,
      _id: { $ne: this._id },
      isActive: true,
      isDeleted: false
    });
    duplicates.push(...emailDuplicates);
  }
  
  if (this.phone) {
    const phoneDuplicates = await this.constructor.find({
      organizationId: this.organizationId,
      phone: this.phone,
      _id: { $ne: this._id },
      isActive: true,
      isDeleted: false
    });
    duplicates.push(...phoneDuplicates);
  }
  
  // Remove duplicates from array
  const uniqueDuplicates = duplicates.filter((lead, index, self) => 
    index === self.findIndex(l => l._id.toString() === lead._id.toString())
  );
  
  return uniqueDuplicates;
};

// Method to mark as duplicate
leadSchema.methods.markAsDuplicate = function(originalLeadId, matchedFields) {
  this.isDuplicate = true;
  this.duplicateOf = originalLeadId;
  this.status = 'Duplicate';
  
  if (matchedFields) {
    this.duplicateMatches.push({
      leadId: originalLeadId,
      matchedFields: matchedFields
    });
  }
};

// Pre-save hook to update lastInteractionDate
leadSchema.pre('save', function(next) {
  if (this.isModified('interactions') && this.interactions.length > 0) {
    this.lastInteractionDate = this.interactions[this.interactions.length - 1].performedAt;
  }
  next();
});

module.exports = mongoose.model('Lead', leadSchema);