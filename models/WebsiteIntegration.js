const mongoose = require('mongoose');

const websiteIntegrationSchema = new mongoose.Schema({
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
  
  // Website details
  domain: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Integration configuration
  integrationKey: {
    type: String,
    required: true,
    unique: true
  },
  
  // Form configurations (support multiple forms with same API key)
  forms: [{
    formId: { type: String, required: true }, // e.g., 'contact-form', 'newsletter-form'
    formName: { type: String, required: true }, // e.g., 'Contact Form', 'Newsletter'
    fields: [{
      name: String,
      label: String,
      type: { type: String, enum: ['text', 'email', 'phone', 'tel', 'textarea', 'select', 'checkbox', 'radio', 'number', 'url', 'date'] },
      required: { type: Boolean, default: false },
      placeholder: String,
      options: [String] // for select, radio, checkbox
    }],
    submitButtonText: { type: String, default: 'Submit' },
    successMessage: { type: String, default: 'Thank you for your submission!' },
    redirectUrl: String,
    allowDynamicFields: { type: Boolean, default: true }, // Allow any additional fields
    isActive: { type: Boolean, default: true }
  }],
  
  // Default form configuration (backward compatibility)
  formConfig: {
    formId: { type: String, default: '#lead-form' },
    fields: [{
      name: String,
      label: String,
      type: { type: String, enum: ['text', 'email', 'phone', 'textarea', 'select'] },
      required: { type: Boolean, default: false },
      placeholder: String
    }],
    submitButtonText: { type: String, default: 'Submit' },
    successMessage: { type: String, default: 'Thank you for your submission!' },
    redirectUrl: String
  },
  
  // Lead routing settings
  leadSettings: {
    defaultStatus: { type: String, default: 'New Lead' },
    defaultSource: { type: String, enum: ['Website', 'Meta', 'LinkedIn', 'Shopify', 'WordPress'], default: 'Website' },
    assignToUser: mongoose.Schema.Types.ObjectId, // Telecaller assignment
    autoRespond: { type: Boolean, default: false },
    autoResponseMessage: String,
    notifyOnNewLead: { type: Boolean, default: true },
    notifyEmail: String,
    duplicateHandling: {
      enabled: { type: Boolean, default: true },
      checkFields: [{ type: String, enum: ['email', 'phone'], default: ['email', 'phone'] }],
      action: { type: String, enum: ['update', 'ignore', 'create_new'], default: 'update' }
    }
  },

  // Lead Assignment Configuration
  assignmentSettings: {
    enabled: { type: Boolean, default: false }, // Auto-assignment on/off
    mode: { 
      type: String, 
      enum: ['auto', 'manual', 'specific'], 
      default: 'manual' 
    }, // auto = round-robin, manual = no assignment, specific = assign to selected users
    
    // For 'specific' mode - assign to these users only
    assignToUsers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      weight: { type: Number, default: 1, min: 1, max: 10 } // Weight for distribution (1-10)
    }],
    
    // Distribution algorithm
    algorithm: {
      type: String,
      enum: ['round-robin', 'weighted-round-robin', 'least-active', 'random'],
      default: 'weighted-round-robin'
    },
    
    // Track assignments for round-robin
    lastAssignment: {
      userId: { type: mongoose.Schema.Types.ObjectId, default: null },
      timestamp: { type: Date, default: null },
      roundRobinIndex: { type: Number, default: 0 } // Index in assignToUsers array
    }
  },
  
  // Integration status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Verification
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: String,
  verifiedAt: Date,
  
  // Statistics
  stats: {
    totalLeads: { type: Number, default: 0 },
    lastLeadReceived: Date,
    conversionRate: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 }
  },
  
  // Advanced settings
  settings: {
    enableCORS: { type: Boolean, default: true },
    allowedOrigins: [String],
    reCaptcha: {
      enabled: { type: Boolean, default: false },
      siteKey: String,
      secretKey: String
    },
    customCSS: String,
    customJS: String
  }
}, {
  timestamps: true
});

// Indexes
websiteIntegrationSchema.index({ organizationId: 1, domain: 1 }, { unique: true });
websiteIntegrationSchema.index({ integrationKey: 1 }, { unique: true });
websiteIntegrationSchema.index({ isActive: 1 });

// Virtual for webhook URL
websiteIntegrationSchema.virtual('webhookUrl').get(function() {
  return `${process.env.SERVICE_URL || 'https://api.jestycrm.com'}/api/webhooks/website/${this.integrationKey}`;
});

// Virtual for embed script
websiteIntegrationSchema.virtual('embedScript').get(function() {
  return `<script src="${process.env.SERVICE_URL || 'https://api.jestycrm.com'}/api/integrations/website/embed/${this.integrationKey}"></script>`;
});

module.exports = mongoose.model('WebsiteIntegration', websiteIntegrationSchema);
