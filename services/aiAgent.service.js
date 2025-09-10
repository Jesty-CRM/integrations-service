const axios = require('axios');
const crypto = require('crypto');
const AIAgentIntegration = require('../models/AIAgentIntegration');
const LeadSource = require('../models/LeadSource');
const logger = require('../utils/logger');

class AIAgentService {
  constructor() {
    this.supportedPlatforms = {
      website: {
        name: 'Website Chat Widget',
        description: 'JavaScript widget for websites'
      },
      whatsapp: {
        name: 'WhatsApp Business API',
        description: 'WhatsApp Business integration'
      },
      messenger: {
        name: 'Facebook Messenger',
        description: 'Facebook Messenger chatbot'
      },
      telegram: {
        name: 'Telegram Bot',
        description: 'Telegram bot integration'
      },
      instagram: {
        name: 'Instagram Direct Messages',
        description: 'Instagram DM automation'
      },
      livechat: {
        name: 'Live Chat Handover',
        description: 'Human agent takeover'
      }
    };
  }

  // Create new AI agent
  async createAgent(data) {
    try {
      const agent = new AIAgentIntegration({
        ...data,
        isActive: true,
        apiKey: this.generateAPIKey(),
        webhookSecret: this.generateWebhookSecret(),
        'stats.createdAt': new Date()
      });

      await agent.save();

      // Generate integration scripts/configs
      const integrationConfig = await this.generateIntegrationConfig(agent);

      return {
        agent,
        integrationConfig
      };
    } catch (error) {
      logger.error('Error creating AI agent:', error.message);
      throw error;
    }
  }

  // Update AI agent configuration
  async updateAgent(agentId, updates) {
    try {
      const agent = await AIAgentIntegration.findByIdAndUpdate(
        agentId,
        {
          ...updates,
          'stats.lastUpdated': new Date()
        },
        { new: true }
      );

      if (!agent) {
        throw new Error('AI agent not found');
      }

      return agent;
    } catch (error) {
      logger.error('Error updating AI agent:', error.message);
      throw error;
    }
  }

  // Generate integration configuration for different platforms
  async generateIntegrationConfig(agent) {
    const configs = {};

    for (const platform of agent.platforms) {
      switch (platform) {
        case 'website':
          configs.website = this.generateWebsiteWidget(agent);
          break;
        case 'whatsapp':
          configs.whatsapp = this.generateWhatsAppConfig(agent);
          break;
        case 'messenger':
          configs.messenger = this.generateMessengerConfig(agent);
          break;
        case 'telegram':
          configs.telegram = this.generateTelegramConfig(agent);
          break;
        case 'instagram':
          configs.instagram = this.generateInstagramConfig(agent);
          break;
        case 'livechat':
          configs.livechat = this.generateLiveChatConfig(agent);
          break;
      }
    }

    return configs;
  }

  // Generate website chat widget
  generateWebsiteWidget(agent) {
    const widgetCode = `
<!-- Jesty CRM AI Chat Widget -->
<div id="jesty-chat-widget"></div>
<script>
(function() {
  var jestyWidget = {
    agentId: '${agent._id}',
    apiKey: '${agent.apiKey}',
    apiUrl: '${process.env.INTEGRATIONS_SERVICE_URL}/api/ai-agents',
    config: ${JSON.stringify(agent.config.appearance)},
    
    init: function() {
      this.createWidget();
      this.bindEvents();
      this.loadConversation();
    },
    
    createWidget: function() {
      var widget = document.createElement('div');
      widget.innerHTML = \`
        <div id="jesty-chat-container" style="
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 350px;
          height: 500px;
          z-index: 10000;
          font-family: Arial, sans-serif;
          display: none;
        ">
          <div id="jesty-chat-header" style="
            background: \${this.config.primaryColor || '#007bff'};
            color: white;
            padding: 15px;
            border-radius: 10px 10px 0 0;
            cursor: pointer;
          ">
            <h4 style="margin: 0; font-size: 16px;">\${this.config.title || 'Chat with us'}</h4>
            <span id="jesty-chat-close" style="float: right; cursor: pointer;">&times;</span>
          </div>
          <div id="jesty-chat-messages" style="
            height: 350px;
            overflow-y: auto;
            padding: 10px;
            background: white;
            border: 1px solid #ddd;
          "></div>
          <div id="jesty-chat-input-container" style="
            padding: 10px;
            background: white;
            border: 1px solid #ddd;
            border-top: none;
            border-radius: 0 0 10px 10px;
          ">
            <input type="text" id="jesty-chat-input" placeholder="Type your message..." style="
              width: 100%;
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 20px;
              outline: none;
            ">
          </div>
        </div>
        
        <div id="jesty-chat-button" style="
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 60px;
          height: 60px;
          background: \${this.config.primaryColor || '#007bff'};
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          z-index: 10001;
        ">
          <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v5l5-5h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
        </div>
      \`;
      
      document.body.appendChild(widget);
    },
    
    bindEvents: function() {
      var self = this;
      
      document.getElementById('jesty-chat-button').onclick = function() {
        self.toggleChat();
      };
      
      document.getElementById('jesty-chat-close').onclick = function() {
        self.hideChat();
      };
      
      document.getElementById('jesty-chat-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          self.sendMessage(this.value);
          this.value = '';
        }
      });
    },
    
    toggleChat: function() {
      var container = document.getElementById('jesty-chat-container');
      var button = document.getElementById('jesty-chat-button');
      
      if (container.style.display === 'none') {
        container.style.display = 'block';
        button.style.display = 'none';
      } else {
        container.style.display = 'none';
        button.style.display = 'flex';
      }
    },
    
    hideChat: function() {
      document.getElementById('jesty-chat-container').style.display = 'none';
      document.getElementById('jesty-chat-button').style.display = 'flex';
    },
    
    sendMessage: function(message) {
      if (!message.trim()) return;
      
      this.addMessage(message, 'user');
      this.showTyping();
      
      fetch(this.apiUrl + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': this.apiKey
        },
        body: JSON.stringify({
          message: message,
          sessionId: this.getSessionId(),
          metadata: {
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      })
      .then(response => response.json())
      .then(data => {
        this.hideTyping();
        this.addMessage(data.response, 'bot');
        
        if (data.requiresLead) {
          this.showLeadForm();
        }
      })
      .catch(error => {
        this.hideTyping();
        this.addMessage('Sorry, I\\'m having trouble responding right now. Please try again.', 'bot');
      });
    },
    
    addMessage: function(message, sender) {
      var messagesContainer = document.getElementById('jesty-chat-messages');
      var messageDiv = document.createElement('div');
      messageDiv.style.cssText = \`
        margin: 10px 0;
        padding: 10px;
        border-radius: 10px;
        max-width: 80%;
        \${sender === 'user' ? 
          'background: #007bff; color: white; margin-left: auto; text-align: right;' : 
          'background: #f1f1f1; color: black;'
        }
      \`;
      messageDiv.textContent = message;
      messagesContainer.appendChild(messageDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    },
    
    showTyping: function() {
      this.addMessage('...', 'bot');
    },
    
    hideTyping: function() {
      var messages = document.getElementById('jesty-chat-messages');
      var lastMessage = messages.lastElementChild;
      if (lastMessage && lastMessage.textContent === '...') {
        messages.removeChild(lastMessage);
      }
    },
    
    getSessionId: function() {
      var sessionId = localStorage.getItem('jesty-chat-session');
      if (!sessionId) {
        sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('jesty-chat-session', sessionId);
      }
      return sessionId;
    },
    
    loadConversation: function() {
      // Load previous conversation if exists
      // Implementation depends on your backend requirements
    },
    
    showLeadForm: function() {
      // Show lead capture form when AI determines user is qualified
      var form = \`
        <div style="padding: 15px; background: #f8f9fa; border-radius: 5px; margin: 10px 0;">
          <h5>Get personalized assistance</h5>
          <input type="text" id="lead-name" placeholder="Your name" style="width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;">
          <input type="email" id="lead-email" placeholder="Your email" style="width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;">
          <input type="tel" id="lead-phone" placeholder="Your phone (optional)" style="width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;">
          <button onclick="jestyWidget.submitLead()" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Submit</button>
        </div>
      \`;
      
      var messagesContainer = document.getElementById('jesty-chat-messages');
      var formDiv = document.createElement('div');
      formDiv.innerHTML = form;
      messagesContainer.appendChild(formDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    },
    
    submitLead: function() {
      var name = document.getElementById('lead-name').value;
      var email = document.getElementById('lead-email').value;
      var phone = document.getElementById('lead-phone').value;
      
      if (!name || !email) {
        alert('Please fill in required fields');
        return;
      }
      
      fetch(this.apiUrl + '/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': this.apiKey
        },
        body: JSON.stringify({
          name: name,
          email: email,
          phone: phone,
          sessionId: this.getSessionId(),
          source: 'ai-chat-widget',
          metadata: {
            url: window.location.href,
            conversationData: this.getConversationData()
          }
        })
      })
      .then(response => response.json())
      .then(data => {
        this.addMessage('Thank you! A team member will contact you soon.', 'bot');
      })
      .catch(error => {
        this.addMessage('Sorry, there was an error submitting your information. Please try again.', 'bot');
      });
    },
    
    getConversationData: function() {
      var messages = document.getElementById('jesty-chat-messages');
      var messageElements = messages.querySelectorAll('div');
      var conversation = [];
      
      messageElements.forEach(function(el) {
        if (el.textContent && el.textContent !== '...') {
          conversation.push(el.textContent);
        }
      });
      
      return conversation;
    }
  };
  
  // Initialize widget when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      jestyWidget.init();
    });
  } else {
    jestyWidget.init();
  }
  
  // Make widget globally accessible
  window.jestyWidget = jestyWidget;
})();
</script>`;

    return {
      type: 'website',
      embedCode: widgetCode,
      instructions: `
        1. Copy the embed code above
        2. Paste it before the closing </body> tag on your website
        3. Customize colors and text in the agent configuration
        4. The widget will automatically appear on your website
      `,
      testUrl: `${process.env.INTEGRATIONS_SERVICE_URL}/api/ai-agents/${agent._id}/test-widget`
    };
  }

  // Generate WhatsApp configuration
  generateWhatsAppConfig(agent) {
    return {
      type: 'whatsapp',
      webhookUrl: `${process.env.INTEGRATIONS_SERVICE_URL}/api/ai-agents/${agent._id}/whatsapp/webhook`,
      phoneNumber: agent.config.whatsapp?.phoneNumber,
      accessToken: agent.config.whatsapp?.accessToken,
      verifyToken: agent.webhookSecret,
      instructions: `
        1. Configure webhook URL in WhatsApp Business API
        2. Set verify token to: ${agent.webhookSecret}
        3. Subscribe to message events
        4. Test the integration using the test endpoint
      `
    };
  }

  // Process incoming chat message
  async processChatMessage(agentId, messageData) {
    try {
      const agent = await AIAgentIntegration.findById(agentId);
      if (!agent || !agent.isActive) {
        throw new Error('AI agent not found or inactive');
      }

      const { message, sessionId, platform = 'website', metadata = {} } = messageData;

      // Get or create conversation session
      let session = await this.getOrCreateSession(agentId, sessionId, platform, metadata);

      // Process message with AI
      const aiResponse = await this.processWithAI(agent, message, session);

      // Update session with new messages
      session.messages.push(
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'assistant', content: aiResponse.response, timestamp: new Date() }
      );

      session.lastActivity = new Date();
      session.messageCount += 2;
      await session.save();

      // Check if lead qualification is needed
      const requiresLead = this.shouldCaptureLead(agent, session, aiResponse);

      // Update agent stats
      await AIAgentIntegration.updateOne(
        { _id: agentId },
        {
          $inc: {
            'stats.totalMessages': 1,
            'stats.totalSessions': session.messageCount === 2 ? 1 : 0
          },
          'stats.lastActivity': new Date()
        }
      );

      return {
        response: aiResponse.response,
        sessionId: session.sessionId,
        requiresLead,
        confidence: aiResponse.confidence,
        intent: aiResponse.intent
      };

    } catch (error) {
      logger.error('Error processing chat message:', error.message);
      throw error;
    }
  }

  // Process lead capture from AI chat
  async processLeadCapture(agentId, leadData) {
    try {
      const agent = await AIAgentIntegration.findById(agentId);
      if (!agent) {
        throw new Error('AI agent not found');
      }

      const { sessionId, name, email, phone, metadata = {} } = leadData;

      // Get session data for context
      const session = await this.getSession(sessionId);
      
      // Create lead source record
      const leadSource = new LeadSource({
        organizationId: agent.organizationId,
        name: `AI Chat - ${agent.name}`,
        type: 'ai-chat',
        platform: metadata.platform || 'website',
        config: {
          agentId: agentId,
          sessionId: sessionId,
          conversationLength: session?.messageCount || 0
        },
        isActive: true
      });

      await leadSource.save();

      // Prepare lead data for leads service
      const transformedLead = {
        name,
        email,
        phone,
        source: 'ai-chat',
        status: agent.config.leadSettings?.defaultStatus || 'new',
        organizationId: agent.organizationId,
        assignedTo: agent.config.leadSettings?.assignToUser,
        sourceDetails: {
          agentId: agentId,
          agentName: agent.name,
          sessionId: sessionId,
          platform: metadata.platform || 'website',
          conversationData: session?.messages || []
        },
        customFields: {
          chatSource: agent.name,
          conversationLength: session?.messageCount || 0,
          leadScore: this.calculateLeadScore(session),
          capturedVia: 'ai-chat-widget'
        },
        rawData: {
          session: session,
          metadata: metadata
        }
      };

      // Create lead via leads service
      const leadResult = await this.createLead(transformedLead);

      // Update agent stats
      await AIAgentIntegration.updateOne(
        { _id: agentId },
        { $inc: { 'stats.leadsGenerated': 1 } }
      );

      return {
        success: true,
        leadId: leadResult.leadId,
        message: 'Lead captured successfully'
      };

    } catch (error) {
      logger.error('Error processing lead capture:', error.message);
      throw error;
    }
  }

  // Helper methods
  async processWithAI(agent, message, session) {
    // This would integrate with your AI service (OpenAI, Anthropic, etc.)
    // For now, returning a simple response structure
    
    const context = agent.config.personality?.context || 'You are a helpful customer service assistant.';
    const conversationHistory = session.messages.slice(-10); // Last 10 messages for context
    
    // Simple intent detection (replace with actual AI service)
    const intent = this.detectIntent(message);
    const confidence = Math.random() * 0.4 + 0.6; // 0.6-1.0 confidence
    
    let response = '';
    
    switch (intent) {
      case 'greeting':
        response = agent.config.responses?.greeting || 'Hello! How can I help you today?';
        break;
      case 'pricing':
        response = agent.config.responses?.pricing || 'I\'d be happy to help with pricing information. Let me connect you with our sales team.';
        break;
      case 'support':
        response = agent.config.responses?.support || 'I\'m here to help! What specific issue are you experiencing?';
        break;
      case 'contact':
        response = agent.config.responses?.contact || 'I can help you get in touch with the right person. May I get your contact information?';
        break;
      default:
        response = agent.config.responses?.default || 'I understand you\'re asking about that. Let me help you find the right information.';
    }
    
    return {
      response,
      intent,
      confidence
    };
  }

  detectIntent(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
      return 'greeting';
    }
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('pricing')) {
      return 'pricing';
    }
    if (lowerMessage.includes('help') || lowerMessage.includes('support') || lowerMessage.includes('issue')) {
      return 'support';
    }
    if (lowerMessage.includes('contact') || lowerMessage.includes('call') || lowerMessage.includes('speak')) {
      return 'contact';
    }
    
    return 'general';
  }

  shouldCaptureLead(agent, session, aiResponse) {
    // Determine if we should show lead capture form
    const messageCount = session.messageCount;
    const intent = aiResponse.intent;
    const settings = agent.config.leadSettings || {};
    
    if (settings.captureAfterMessages && messageCount >= settings.captureAfterMessages) {
      return true;
    }
    
    if (settings.captureOnIntents && settings.captureOnIntents.includes(intent)) {
      return true;
    }
    
    return false;
  }

  calculateLeadScore(session) {
    // Simple lead scoring based on conversation
    let score = 50; // Base score
    
    if (session.messageCount > 5) score += 20;
    if (session.messageCount > 10) score += 30;
    
    // Check for buying intent keywords
    const allMessages = session.messages.map(m => m.content).join(' ').toLowerCase();
    const buyingKeywords = ['price', 'cost', 'buy', 'purchase', 'demo', 'trial', 'contact', 'sales'];
    
    buyingKeywords.forEach(keyword => {
      if (allMessages.includes(keyword)) {
        score += 10;
      }
    });
    
    return Math.min(score, 100);
  }

  async createLead(leadData) {
    try {
      const response = await axios.post(`${process.env.LEADS_SERVICE_URL}/api/leads`, leadData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error creating lead via leads service:', error.response?.data || error.message);
      throw error;
    }
  }

  // Generate API key and webhook secret
  generateAPIKey() {
    return 'agent_' + crypto.randomBytes(32).toString('hex');
  }

  generateWebhookSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Session management
  async getOrCreateSession(agentId, sessionId, platform, metadata) {
    // This would typically use a separate sessions collection or Redis
    // For now, storing basic session info in memory/database
    
    return {
      sessionId,
      agentId,
      platform,
      messages: [],
      metadata,
      messageCount: 0,
      createdAt: new Date(),
      lastActivity: new Date(),
      save: async function() {
        // Save session to database
        return this;
      }
    };
  }

  async getSession(sessionId) {
    // Retrieve session from storage
    return null; // Placeholder
  }
}

module.exports = new AIAgentService();
