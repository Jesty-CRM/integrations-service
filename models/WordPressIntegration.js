const mongoose = require('mongoose');

const wordpressIntegrationSchema = new mongoose.Schema({
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
  
  // WordPress site details
  siteUrl: {
    type: String,
    required: false, // Not required until plugin connects
    lowercase: true,
    trim: true
  },
  siteDescription: String,
  
  // Integration configuration
  apiKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // WordPress plugin configuration
  pluginVersion: String,
  pluginStatus: {
    downloaded: {
      type: Boolean,
      default: false
    },
    installed: {
      type: Boolean,
      default: false
    },
    configured: {
      type: Boolean,
      default: false
    },
    version: String,
    wordpressVersion: String,
    lastActivity: Date
  },
  
  // Forms configuration - auto-mapped forms
  forms: [{
    formId: String, // Contact Form 7 ID, Gravity Forms ID, etc.
    formName: String,
    formPlugin: {
      type: String,
      enum: ['contact-form-7', 'gravity-forms', 'wpforms', 'ninja-forms', 'forminator', 'custom'],
      default: 'contact-form-7'
    },
    isEnabled: {
      type: Boolean,
      default: true
    },
    fieldMapping: [{
      wpField: String, // WordPress form field name
      crmField: String, // CRM field (name, email, phone, company, etc.)
      isRequired: Boolean,
      fieldType: String // text, email, phone, textarea, select, etc.
    }],
    lastSubmission: Date,
    totalSubmissions: {
      type: Number,
      default: 0
    }
  }],
  
  // Auto-mapping configuration (similar to website service)
  autoMapping: {
    enabled: {
      type: Boolean,
      default: true
    },
    nameFields: [String], // Common name field variations
    emailFields: [String], // Common email field variations
    phoneFields: [String], // Common phone field variations
    companyFields: [String], // Common company field variations
    messageFields: [String] // Common message field variations
  },
  
  // Lead mapping configuration
  leadMappingConfig: {
    leadSource: {
      type: String,
      default: 'WordPress'
    },
    leadStatus: {
      type: String,
      default: 'new'
    },
    leadPriority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    autoAssignment: {
      enabled: Boolean,
      assignToUser: mongoose.Schema.Types.ObjectId,
      rules: {
        highValueThreshold: Number,
        businessHours: Boolean
      }
    }
  },
  
  // Assignment settings
  assignmentSettings: {
    enabled: { type: Boolean, default: false },
    mode: { 
      type: String, 
      enum: ['auto', 'manual', 'specific', 'round-robin', 'weighted-round-robin'], 
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
    lastAssignmentIndex: { type: Number, default: 0 }
  },
  
  // WordPress environment info
  wpInfo: {
    version: String,
    phpVersion: String,
    theme: String,
    plugins: [String],
    lastChecked: Date
  },
  
  // Statistics
  statistics: {
    totalFormSubmissions: {
      type: Number,
      default: 0
    },
    totalLeadsCreated: {
      type: Number,
      default: 0
    },
    totalForms: {
      type: Number,
      default: 0
    },
    lastSubmissionReceived: Date,
    lastLeadCreated: Date,
    formBreakdown: {
      type: Map,
      of: Number,
      default: new Map()
    }
  },
  
  // Integration status
  isActive: {
    type: Boolean,
    default: true
  },
  connected: {
    type: Boolean,
    default: false
  },
  
  // Custom configuration
  customConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Error tracking
  lastError: {
    message: String,
    timestamp: Date,
    resolved: { type: Boolean, default: false }
  },
  
  // Logs for debugging
  logs: [{
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ['info', 'warning', 'error'] },
    message: String,
    data: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Indexes
wordpressIntegrationSchema.index({ organizationId: 1 });
wordpressIntegrationSchema.index({ apiKey: 1 }, { unique: true });
wordpressIntegrationSchema.index({ siteUrl: 1 });
wordpressIntegrationSchema.index({ isActive: 1 });
wordpressIntegrationSchema.index({ connected: 1 });

// Methods
wordpressIntegrationSchema.methods.addForm = function(formData) {
  const existingForm = this.forms.find(f => f.formId === formData.formId);
  if (!existingForm) {
    this.forms.push(formData);
    this.statistics.totalForms = this.forms.length;
  }
  return this.save();
};

wordpressIntegrationSchema.methods.updateFormMapping = function(formId, fieldMapping) {
  const form = this.forms.find(f => f.formId === formId);
  if (form) {
    form.fieldMapping = fieldMapping;
  }
  return this.save();
};

wordpressIntegrationSchema.methods.incrementSubmissionCount = function(formId) {
  this.statistics.totalFormSubmissions += 1;
  this.statistics.lastSubmissionReceived = new Date();
  
  const form = this.forms.find(f => f.formId === formId);
  if (form) {
    form.totalSubmissions += 1;
    form.lastSubmission = new Date();
  }
  
  return this.save();
};

wordpressIntegrationSchema.methods.addLog = function(type, message, data = null) {
  this.logs.push({ type, message, data });
  
  // Keep only last 1000 logs
  if (this.logs.length > 1000) {
    this.logs = this.logs.slice(-1000);
  }
  
  return this.save();
};

module.exports = mongoose.model('WordPressIntegration', wordpressIntegrationSchema);