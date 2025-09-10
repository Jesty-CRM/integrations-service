const express = require('express');
const router = express.Router();
const aiAgentService = require('../services/aiAgent.service');
const AIAgentIntegration = require('../models/AIAgentIntegration');
const { authenticateUser, authenticateAPIKey } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Get AI agents for organization
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    const agents = await AIAgentIntegration.find({
      organizationId,
      isDeleted: false
    }).select('-apiKey -webhookSecret').sort({ createdAt: -1 });

    res.json({
      success: true,
      agents
    });
  } catch (error) {
    logger.error('Error fetching AI agents:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AI agents'
    });
  }
});

// Get specific AI agent
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const agent = await AIAgentIntegration.findOne({
      _id: id,
      organizationId,
      isDeleted: false
    }).select('-apiKey -webhookSecret');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'AI agent not found'
      });
    }

    res.json({
      success: true,
      agent
    });
  } catch (error) {
    logger.error('Error fetching AI agent:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AI agent'
    });
  }
});

// Create new AI agent
router.post('/', authenticateUser, validateRequest([
  'name',
  'platforms'
]), async (req, res) => {
  try {
    const { userId, organizationId } = req.user;
    
    const agentData = {
      ...req.body,
      userId,
      organizationId
    };

    const result = await aiAgentService.createAgent(agentData);

    res.status(201).json({
      success: true,
      agent: result.agent,
      integrationConfig: result.integrationConfig,
      message: 'AI agent created successfully'
    });
  } catch (error) {
    logger.error('Error creating AI agent:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create AI agent'
    });
  }
});

// Update AI agent
router.put('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    // Remove sensitive fields from updates
    delete updates.apiKey;
    delete updates.webhookSecret;

    const agent = await aiAgentService.updateAgent(id, {
      ...updates,
      organizationId // Ensure organization ownership
    });

    // Generate new integration config if platforms or config changed
    let integrationConfig = null;
    if (updates.platforms || updates.config) {
      integrationConfig = await aiAgentService.generateIntegrationConfig(agent);
    }

    res.json({
      success: true,
      agent,
      integrationConfig,
      message: 'AI agent updated successfully'
    });
  } catch (error) {
    logger.error('Error updating AI agent:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update AI agent'
    });
  }
});

// Get integration configuration
router.get('/:id/config', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const agent = await AIAgentIntegration.findOne({
      _id: id,
      organizationId,
      isActive: true
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'AI agent not found'
      });
    }

    const integrationConfig = await aiAgentService.generateIntegrationConfig(agent);

    res.json({
      success: true,
      integrationConfig,
      supportedPlatforms: aiAgentService.supportedPlatforms
    });
  } catch (error) {
    logger.error('Error generating integration config:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate integration configuration'
    });
  }
});

// Chat endpoint (public, authenticated by API key)
router.post('/chat', rateLimiter, async (req, res) => {
  try {
    const apiKey = req.get('X-Agent-Key');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Find agent by API key
    const agent = await AIAgentIntegration.findOne({
      apiKey: apiKey,
      isActive: true,
      isDeleted: false
    });

    if (!agent) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    const { message, sessionId, platform, metadata } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }

    const result = await aiAgentService.processChatMessage(agent._id, {
      message,
      sessionId,
      platform,
      metadata: {
        ...metadata,
        clientIP: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    logger.error('Error processing chat message:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to process message'
    });
  }
});

// Lead capture endpoint (public, authenticated by API key)
router.post('/lead', rateLimiter, async (req, res) => {
  try {
    const apiKey = req.get('X-Agent-Key');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Find agent by API key
    const agent = await AIAgentIntegration.findOne({
      apiKey: apiKey,
      isActive: true,
      isDeleted: false
    });

    if (!agent) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    const { sessionId, name, email, phone, metadata } = req.body;

    if (!sessionId || !name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Session ID, name, and email are required'
      });
    }

    const result = await aiAgentService.processLeadCapture(agent._id, {
      sessionId,
      name,
      email,
      phone,
      metadata: {
        ...metadata,
        clientIP: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    logger.error('Error processing lead capture:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to capture lead'
    });
  }
});

// WhatsApp webhook endpoint
router.get('/:id/whatsapp/webhook', async (req, res) => {
  try {
    const { id } = req.params;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const agent = await AIAgentIntegration.findOne({
      _id: id,
      isActive: true,
      platforms: 'whatsapp'
    });

    if (!agent) {
      return res.status(404).send('Agent not found');
    }

    if (mode === 'subscribe' && token === agent.webhookSecret) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
  } catch (error) {
    logger.error('Error verifying WhatsApp webhook:', error.message);
    res.status(500).send('Error');
  }
});

router.post('/:id/whatsapp/webhook', async (req, res) => {
  try {
    const { id } = req.params;
    const { entry } = req.body;

    const agent = await AIAgentIntegration.findOne({
      _id: id,
      isActive: true,
      platforms: 'whatsapp'
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Process WhatsApp messages
    if (entry && entry[0] && entry[0].changes) {
      for (const change of entry[0].changes) {
        if (change.value && change.value.messages) {
          for (const message of change.value.messages) {
            try {
              await aiAgentService.processChatMessage(agent._id, {
                message: message.text?.body || '',
                sessionId: message.from,
                platform: 'whatsapp',
                metadata: {
                  messageId: message.id,
                  timestamp: message.timestamp,
                  type: message.type
                }
              });
            } catch (messageError) {
              logger.error('Error processing WhatsApp message:', messageError.message);
            }
          }
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing WhatsApp webhook:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test widget endpoint
router.get('/:id/test-widget', async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await AIAgentIntegration.findOne({
      _id: id,
      isActive: true,
      platforms: 'website'
    });

    if (!agent) {
      return res.status(404).send('Agent not found');
    }

    const testPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Chat Widget Test - ${agent.name}</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5;">
    <div style="max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h1>AI Chat Widget Test</h1>
        <p><strong>Agent:</strong> ${agent.name}</p>
        <p><strong>Description:</strong> ${agent.description || 'No description provided'}</p>
        <p>This is a test page for your AI chat widget. The widget should appear in the bottom-right corner.</p>
        <p>Try starting a conversation to test the integration!</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Widget Configuration:</h3>
            <ul>
                <li><strong>Platforms:</strong> ${agent.platforms.join(', ')}</li>
                <li><strong>Status:</strong> ${agent.isActive ? 'Active' : 'Inactive'}</li>
                <li><strong>Created:</strong> ${new Date(agent.createdAt).toLocaleDateString()}</li>
            </ul>
        </div>
    </div>

    ${(await aiAgentService.generateIntegrationConfig(agent)).website?.embedCode || '<!-- Widget code not available -->'}
</body>
</html>`;

    res.send(testPage);
  } catch (error) {
    logger.error('Error serving test widget:', error.message);
    res.status(500).send('Error loading test widget');
  }
});

// Get agent statistics
router.get('/:id/stats', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { period = '30d' } = req.query;

    const agent = await AIAgentIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'AI agent not found'
      });
    }

    // Calculate period dates
    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const stats = {
      summary: agent.stats,
      period: period,
      startDate: startDate,
      endDate: new Date(),
      platforms: agent.platforms
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Error fetching AI agent stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// Regenerate API key
router.post('/:id/regenerate-key', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const agent = await AIAgentIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'AI agent not found'
      });
    }

    // Generate new API key
    agent.apiKey = aiAgentService.generateAPIKey();
    agent.updatedAt = new Date();
    
    await agent.save();

    res.json({
      success: true,
      message: 'API key regenerated successfully',
      apiKey: agent.apiKey
    });

  } catch (error) {
    logger.error('Error regenerating API key:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate API key'
    });
  }
});

// Delete AI agent
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const agent = await AIAgentIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      { 
        isDeleted: true,
        isActive: false,
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'AI agent not found'
      });
    }

    res.json({
      success: true,
      message: 'AI agent deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting AI agent:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete AI agent'
    });
  }
});

module.exports = router;
