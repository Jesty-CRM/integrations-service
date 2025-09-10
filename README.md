# Integrations Service

A comprehensive microservice for handling third-party integrations in the Jesty CRM system. This service manages Facebook Lead Ads, Shopify store connections, website form captures, and AI-powered chat agents.

## 🚀 Features

### Facebook Integration
- **Lead Ads Management**: Connect Facebook pages and capture leads from ad campaigns
- **OAuth Authentication**: Secure Facebook app authorization
- **Webhook Processing**: Real-time lead notifications from Facebook
- **Page & Form Sync**: Automatic synchronization of pages and lead forms
- **Analytics**: Track lead capture performance and statistics

### Website Integration
- **Custom Form Builder**: Create embeddable lead capture forms
- **Embed Code Generation**: Easy-to-implement JavaScript widgets
- **Domain Validation**: Whitelist specific domains for security
- **reCAPTCHA Support**: Spam protection with Google reCAPTCHA
- **Real-time Processing**: Instant lead capture and routing

### Shopify Integration
- **Store Connection**: OAuth-based Shopify store integration
- **Customer Sync**: Import existing customers as leads
- **Order Processing**: Convert orders into lead interactions
- **Webhook Management**: Real-time notifications for new customers/orders
- **Revenue Tracking**: Monitor sales performance and customer value

### AI Chat Agent
- **Multi-platform Support**: Website, WhatsApp, Messenger, Telegram
- **Intelligent Responses**: AI-powered conversation handling
- **Lead Qualification**: Automatic lead scoring and capture
- **Customizable Personality**: Configure agent behavior and responses
- **Analytics Dashboard**: Track conversations and conversion rates

## 📁 Project Structure

```
integrations-service/
├── controllers/          # Route controllers
│   ├── facebook.controller.js
│   ├── website.controller.js
│   ├── shopify.controller.js
│   └── aiAgent.controller.js
├── models/              # Database models
│   ├── FacebookIntegration.js
│   ├── WebsiteIntegration.js
│   ├── ShopifyIntegration.js
│   ├── AIAgentIntegration.js
│   └── LeadSource.js
├── services/            # Business logic
│   ├── facebook.service.js
│   ├── website.service.js
│   ├── shopify.service.js
│   └── aiAgent.service.js
├── middleware/          # Express middleware
│   ├── auth.js
│   ├── validation.js
│   └── rateLimiter.js
├── routes/              # API routes
│   └── integrations.js
├── utils/               # Utilities
│   └── logger.js
├── logs/                # Log files
├── .env                 # Environment variables
├── index.js             # Main application file
└── package.json
```

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jestycrm/backend.git
   cd backend/integrations-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the service**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## ⚙️ Environment Variables

```env
# Server Configuration
PORT=3005
NODE_ENV=development
SERVICE_VERSION=1.0.0

# Database
MONGODB_URI=mongodb://localhost:27017/crm-integrations
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-jwt-secret
SERVICE_AUTH_TOKEN=your-service-token

# Facebook Integration
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_VERIFY_TOKEN=your-webhook-verify-token

# Shopify Integration
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret
SHOPIFY_APP_URL=https://api.jestycrm.com

# External Services
LEADS_SERVICE_URL=http://localhost:3003
FRONTEND_URL=http://localhost:3000

# Logging
LOG_LEVEL=info
```

## 📚 API Documentation

### Base URL
```
http://localhost:3005/api/integrations
```

### Authentication
Most endpoints require JWT authentication:
```bash
Authorization: Bearer <jwt-token>
```

Public endpoints (forms, webhooks) use API keys:
```bash
X-API-Key: <api-key>
```

### Facebook Integration Endpoints

#### Get Facebook Integrations
```http
GET /api/integrations/facebook
Authorization: Bearer <token>
```

#### Connect Facebook Account
```http
POST /api/integrations/facebook/connect
Authorization: Bearer <token>
```

#### Sync Facebook Pages
```http
POST /api/integrations/facebook/{id}/sync-pages
Authorization: Bearer <token>
```

#### Get Lead Forms
```http
GET /api/integrations/facebook/{id}/pages/{pageId}/forms
Authorization: Bearer <token>
```

### Website Integration Endpoints

#### Create Website Integration
```http
POST /api/integrations/website
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Contact Form",
  "domain": "example.com",
  "formConfig": {
    "title": "Get in Touch",
    "fields": [
      {
        "name": "name",
        "type": "text",
        "label": "Full Name",
        "required": true
      },
      {
        "name": "email", 
        "type": "email",
        "label": "Email Address",
        "required": true
      }
    ]
  }
}
```

#### Submit Form (Public)
```http
POST /api/integrations/website/submit/{id}
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890"
}
```

### Shopify Integration Endpoints

#### Connect Shopify Store
```http
POST /api/integrations/shopify/connect
Authorization: Bearer <token>
Content-Type: application/json

{
  "shop": "mystore"
}
```

#### Sync Customers
```http
POST /api/integrations/shopify/{id}/sync-customers
Authorization: Bearer <token>
```

#### Sync Orders
```http
POST /api/integrations/shopify/{id}/sync-orders
Authorization: Bearer <token>
```

### AI Agent Endpoints

#### Create AI Agent
```http
POST /api/integrations/ai-agents
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Customer Support Bot",
  "description": "Handles customer inquiries",
  "platforms": ["website", "whatsapp"],
  "config": {
    "personality": {
      "context": "You are a helpful customer support agent"
    },
    "responses": {
      "greeting": "Hello! How can I help you today?",
      "default": "I understand. Let me help you with that."
    }
  }
}
```

#### Chat with Agent (Public)
```http
POST /api/integrations/ai-agents/chat
X-Agent-Key: <agent-api-key>
Content-Type: application/json

{
  "message": "Hello, I need help",
  "sessionId": "session_123",
  "platform": "website"
}
```

## 🔧 Integration Setup Guides

### Facebook Lead Ads Setup

1. **Create Facebook App**
   - Go to [Facebook Developers](https://developers.facebook.com)
   - Create a new app with "Business" type
   - Add "Webhooks" and "Lead ads" products

2. **Configure Webhooks**
   ```
   Webhook URL: https://yourdomain.com/api/webhooks/facebook
   Verify Token: your-verify-token
   Fields: leadgen
   ```

3. **Connect in CRM**
   - Navigate to Integrations → Facebook
   - Click "Connect Facebook Account"
   - Authorize the app and select pages

### Shopify App Setup

1. **Create Shopify App**
   - Go to Shopify Partners dashboard
   - Create a new app
   - Set redirect URL: `https://yourdomain.com/api/integrations/shopify/oauth/callback`

2. **Configure Permissions**
   ```
   read_customers
   read_orders
   read_products
   ```

3. **Install in Store**
   - Navigate to Integrations → Shopify
   - Enter store name and click "Connect"
   - Authorize the app in Shopify admin

### Website Form Setup

1. **Create Integration**
   - Go to Integrations → Website Forms
   - Click "Create New Form"
   - Configure form fields and appearance

2. **Embed on Website**
   ```html
   <!-- Copy the generated embed code -->
   <div id="jesty-form-container"></div>
   <script src="https://api.jestycrm.com/forms/embed.js"></script>
   <script>
     JestyForms.init({
       formId: 'your-form-id',
       container: '#jesty-form-container'
     });
   </script>
   ```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test facebook.service.test.js
```

## 📊 Monitoring & Logging

The service includes comprehensive logging:

- **Request Logging**: All HTTP requests with response times
- **Integration Activity**: Track all integration events
- **Webhook Processing**: Log all incoming webhooks
- **Lead Processing**: Monitor lead creation and routing
- **Error Tracking**: Detailed error logs with context

Logs are written to:
- Console (development)
- Files (production): `logs/combined.log`, `logs/error.log`

## 🔒 Security Features

- **Rate Limiting**: Prevent abuse with configurable limits
- **Input Validation**: Sanitize all user inputs
- **CORS Protection**: Whitelist allowed origins
- **Helmet Security**: Standard security headers
- **API Key Authentication**: Secure public endpoints
- **Domain Validation**: Restrict form submissions to authorized domains

## 🚀 Deployment

### Docker Deployment

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

### Docker Compose

```yaml
version: '3.8'
services:
  integrations-service:
    build: .
    ports:
      - "3005:3005"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/crm-integrations
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production database
- [ ] Set up SSL certificates
- [ ] Configure reverse proxy (Nginx)
- [ ] Set up monitoring (PM2, New Relic)
- [ ] Configure log rotation
- [ ] Set up backup strategy
- [ ] Enable security headers
- [ ] Configure rate limiting
- [ ] Set up health checks

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- **Documentation**: [Jesty CRM Docs](https://docs.jestycrm.com)
- **Issues**: [GitHub Issues](https://github.com/jestycrm/backend/issues)
- **Email**: support@jestycrm.com
- **Discord**: [Jesty CRM Community](https://discord.gg/jestycrm)

---

Built with ❤️ by the Jesty CRM Team
