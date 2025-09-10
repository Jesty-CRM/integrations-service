const mongoose = require('mongoose');

const aiAgentIntegrationSchema = new mongoose.Schema({
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
  
  // Agent configuration
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  
  // AI Provider settings
  provider: {
    type: String,
    enum: ['openai', 'anthropic', 'google', 'custom'],
    required: true
  },
  
  model: {
    type: String,
    required: true
  },
  
  apiKey: String, // Encrypted
  
  // Agent behavior
  personality: {
    tone: { type: String, enum: ['professional', 'friendly', 'casual', 'formal'], default: 'professional' },
    language: { type: String, default: 'en' },
    responseLength: { type: String, enum: ['short', 'medium', 'long'], default: 'medium' }
  },
  
  // Knowledge base
  knowledgeBase: {
    documents: [{
      title: String,
      content: String,
      type: { type: String, enum: ['faq', 'product', 'policy', 'general'] },
      lastUpdated: Date
    }],
    urls: [String],
    lastTraining: Date
  },
  
  // Integration channels
  channels: {
    website: {
      enabled: { type: Boolean, default: false },
      widgetStyle: {
        position: { type: String, enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'], default: 'bottom-right' },
        primaryColor: { type: String, default: '#007bff' },
        greeting: { type: String, default: 'Hi! How can I help you?' }
      }
    },
    whatsapp: {
      enabled: { type: Boolean, default: false },
      phoneNumber: String,
      businessAccountId: String
    },
    facebook: {
      enabled: { type: Boolean, default: false },
      pageId: String,
      accessToken: String
    }
  },
  
  // Lead qualification
  leadQualification: {
    enabled: { type: Boolean, default: true },
    questions: [{
      question: String,
      field: String, // Which lead field to populate
      required: { type: Boolean, default: false }
    }],
    createLeadAfter: { type: Number, default: 3 }, // Number of exchanges before creating lead
    leadStatus: { type: String, default: 'AI Qualified' }
  },
  
  // Analytics
  analytics: {
    totalConversations: { type: Number, default: 0 },
    leadsGenerated: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalTokensUsed: { type: Number, default: 0 },
    lastActivity: Date
  },
  
  // Settings
  settings: {
    maxTokensPerResponse: { type: Number, default: 150 },
    temperature: { type: Number, default: 0.7 },
    responseDelay: { type: Number, default: 1000 }, // ms
    fallbackToHuman: { type: Boolean, default: true },
    operatingHours: {
      enabled: { type: Boolean, default: false },
      timezone: String,
      schedule: [{
        day: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
        start: String, // HH:mm format
        end: String
      }]
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Training status
  trainingStatus: {
    type: String,
    enum: ['untrained', 'training', 'trained', 'error'],
    default: 'untrained'
  },
  
  lastError: {
    message: String,
    timestamp: Date
  }
}, {
  timestamps: true
});

// Indexes
aiAgentIntegrationSchema.index({ organizationId: 1, name: 1 });
aiAgentIntegrationSchema.index({ isActive: 1 });

module.exports = mongoose.model('AIAgentIntegration', aiAgentIntegrationSchema);
