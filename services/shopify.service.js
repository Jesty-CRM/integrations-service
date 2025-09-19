const axios = require('axios');
const crypto = require('crypto');
const ShopifyIntegration = require('../models/ShopifyIntegration');
// LeadSource operations now handled by leads-service
const logger = require('../utils/logger');

class ShopifyService {
  constructor() {
    this.apiVersion = '2023-10';
    this.appUrl = process.env.SHOPIFY_APP_URL || 'https://api.jestycrm.com';
    this.apiKey = process.env.SHOPIFY_API_KEY;
    this.apiSecret = process.env.SHOPIFY_API_SECRET;
    this.scopes = 'read_customers,read_orders,read_products';
  }

  // Generate Shopify OAuth URL
  generateOAuthURL(shop, state) {
    const params = new URLSearchParams({
      client_id: this.apiKey,
      scope: this.scopes,
      redirect_uri: `${this.appUrl}/api/webhooks/shopify/oauth/callback`,
      state: state
    });

    return `https://${shop}.myshopify.com/admin/oauth/authorize?${params.toString()}`;
  }

  // Handle OAuth callback
  async handleOAuthCallback(shop, code, state) {
    try {
      const { userId, organizationId } = JSON.parse(Buffer.from(state, 'base64').toString());

      // Exchange code for access token
      const response = await axios.post(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        code: code
      });

      const { access_token, scope } = response.data;

      // Get shop info
      const shopInfoResponse = await axios.get(`https://${shop}.myshopify.com/admin/api/${this.apiVersion}/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': access_token
        }
      });

      const shopInfo = shopInfoResponse.data.shop;

      // Create or update integration
      const integration = await ShopifyIntegration.findOneAndUpdate(
        { organizationId, shopDomain: shop },
        {
          organizationId,
          userId,
          shopDomain: shop,
          shopName: shopInfo.name,
          shopOwner: shopInfo.shop_owner,
          shopEmail: shopInfo.email,
          accessToken: access_token,
          scope: scope,
          isActive: true,
          isInstalled: true,
          'stats.lastActivity': new Date()
        },
        { upsert: true, new: true }
      );

      // Setup webhooks
      await this.setupWebhooks(integration);

      return integration;
    } catch (error) {
      logger.error('Shopify OAuth error:', error.response?.data || error.message);
      throw new Error('Failed to connect Shopify store');
    }
  }

  // Setup Shopify webhooks
  async setupWebhooks(integration) {
    try {
      const webhookTopics = [
        'customers/create',
        'customers/update',
        'orders/create',
        'orders/updated',
        'orders/paid',
        'app/uninstalled'
      ];

      const webhooks = [];

      for (const topic of webhookTopics) {
        try {
          const webhookResponse = await axios.post(
            `https://${integration.shopDomain}.myshopify.com/admin/api/${this.apiVersion}/webhooks.json`,
            {
              webhook: {
                topic: topic,
                address: `${this.appUrl}/api/webhooks/shopify/${topic.replace('/', '-')}`,
                format: 'json'
              }
            },
            {
              headers: {
                'X-Shopify-Access-Token': integration.accessToken,
                'Content-Type': 'application/json'
              }
            }
          );

          webhooks.push({
            id: webhookResponse.data.webhook.id.toString(),
            topic: topic,
            address: webhookResponse.data.webhook.address,
            isActive: true
          });

          logger.info(`Shopify webhook created: ${topic} for shop ${integration.shopDomain}`);
        } catch (webhookError) {
          logger.error(`Error creating webhook ${topic}:`, webhookError.response?.data || webhookError.message);
        }
      }

      // Update integration with webhook info
      await ShopifyIntegration.updateOne(
        { _id: integration._id },
        { webhooks: webhooks }
      );

      return webhooks;
    } catch (error) {
      logger.error('Error setting up Shopify webhooks:', error.message);
      throw error;
    }
  }

  // Sync Shopify customers
  async syncCustomers(integration, options = {}) {
    try {
      const { limit = 250, since = null } = options;
      let allCustomers = [];
      let nextPageUrl = null;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      do {
        let url = `https://${integration.shopDomain}.myshopify.com/admin/api/${this.apiVersion}/customers.json`;
        let params = { limit };

        if (since) {
          params.created_at_min = since;
        }

        if (nextPageUrl) {
          url = nextPageUrl;
          params = {};
        }

        const response = await axios.get(url, {
          params,
          headers: {
            'X-Shopify-Access-Token': integration.accessToken
          }
        });

        const customers = response.data.customers;
        allCustomers = allCustomers.concat(customers);

        // Process customers
        for (const customer of customers) {
          try {
            const transformedCustomer = this.transformShopifyCustomer(customer, integration);
            const result = await this.createOrUpdateLead(transformedCustomer);
            
            if (result.created) {
              recordsCreated++;
            } else {
              recordsUpdated++;
            }
          } catch (customerError) {
            logger.error('Error processing customer:', customer.id, customerError.message);
          }
        }

        // Check for next page
        const linkHeader = response.headers.link;
        nextPageUrl = this.extractNextPageUrl(linkHeader);

      } while (nextPageUrl && allCustomers.length < 10000); // Safety limit

      // Update last sync
      await ShopifyIntegration.updateOne(
        { _id: integration._id },
        {
          'lastSync.customers': new Date(),
          $inc: {
            'stats.customersImported': recordsCreated
          }
        }
      );

      return {
        success: true,
        totalProcessed: allCustomers.length,
        recordsCreated,
        recordsUpdated
      };
    } catch (error) {
      logger.error('Error syncing Shopify customers:', error.message);
      throw error;
    }
  }

  // Sync Shopify orders
  async syncOrders(integration, options = {}) {
    try {
      const { limit = 250, since = null } = options;
      let allOrders = [];
      let nextPageUrl = null;
      let recordsCreated = 0;
      let recordsUpdated = 0;
      let totalRevenue = 0;

      do {
        let url = `https://${integration.shopDomain}.myshopify.com/admin/api/${this.apiVersion}/orders.json`;
        let params = { limit, status: 'any' };

        if (since) {
          params.created_at_min = since;
        }

        if (nextPageUrl) {
          url = nextPageUrl;
          params = {};
        }

        const response = await axios.get(url, {
          params,
          headers: {
            'X-Shopify-Access-Token': integration.accessToken
          }
        });

        const orders = response.data.orders;
        allOrders = allOrders.concat(orders);

        // Process orders
        for (const order of orders) {
          try {
            const transformedOrder = this.transformShopifyOrder(order, integration);
            const result = await this.createOrUpdateLead(transformedOrder);
            
            if (result.created) {
              recordsCreated++;
            } else {
              recordsUpdated++;
            }

            totalRevenue += parseFloat(order.total_price) || 0;
          } catch (orderError) {
            logger.error('Error processing order:', order.id, orderError.message);
          }
        }

        // Check for next page
        const linkHeader = response.headers.link;
        nextPageUrl = this.extractNextPageUrl(linkHeader);

      } while (nextPageUrl && allOrders.length < 5000); // Safety limit

      // Update last sync
      await ShopifyIntegration.updateOne(
        { _id: integration._id },
        {
          'lastSync.orders': new Date(),
          $inc: {
            'stats.ordersImported': recordsCreated,
            'stats.totalRevenue': totalRevenue
          }
        }
      );

      return {
        success: true,
        totalProcessed: allOrders.length,
        recordsCreated,
        recordsUpdated,
        totalRevenue
      };
    } catch (error) {
      logger.error('Error syncing Shopify orders:', error.message);
      throw error;
    }
  }

  // Handle webhook events
  async handleWebhook(topic, payload, shop) {
    try {
      const integration = await ShopifyIntegration.findOne({
        shopDomain: shop,
        isActive: true,
        isInstalled: true
      });

      if (!integration) {
        logger.warn('No active Shopify integration found for shop:', shop);
        return;
      }

      switch (topic) {
        case 'customers/create':
        case 'customers/update':
          await this.handleCustomerWebhook(payload, integration);
          break;
        case 'orders/create':
        case 'orders/updated':
        case 'orders/paid':
          await this.handleOrderWebhook(payload, integration);
          break;
        case 'app/uninstalled':
          await this.handleAppUninstalled(integration);
          break;
        default:
          logger.warn('Unhandled Shopify webhook topic:', topic);
      }

      // Update last activity
      await ShopifyIntegration.updateOne(
        { _id: integration._id },
        { 'stats.lastActivity': new Date() }
      );

    } catch (error) {
      logger.error('Error handling Shopify webhook:', error.message);
      throw error;
    }
  }

  // Transform Shopify customer to CRM format
  transformShopifyCustomer(customer, integration) {
    const defaultAddress = customer.default_address || {};
    
    return {
      externalId: customer.id.toString(),
      source: 'shopify',
      name: `${customer.first_name} ${customer.last_name}`.trim(),
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone || defaultAddress.phone,
      company: defaultAddress.company,
      status: integration.syncSettings.customerStatus,
      address: {
        line1: defaultAddress.address1,
        line2: defaultAddress.address2,
        city: defaultAddress.city,
        state: defaultAddress.province,
        country: defaultAddress.country,
        zip: defaultAddress.zip
      },
      organizationId: integration.organizationId,
      assignedTo: integration.syncSettings.assignToUser,
      sourceDetails: {
        shopDomain: integration.shopDomain,
        customerId: customer.id,
        acceptsMarketing: customer.accepts_marketing,
        totalSpent: customer.total_spent,
        ordersCount: customer.orders_count,
        createdAt: customer.created_at,
        updatedAt: customer.updated_at
      },
      customFields: {
        shopifyCustomerId: customer.id,
        acceptsMarketing: customer.accepts_marketing,
        totalSpent: customer.total_spent,
        ordersCount: customer.orders_count,
        tags: customer.tags
      },
      rawData: customer
    };
  }

  // Transform Shopify order to CRM format
  transformShopifyOrder(order, integration) {
    const customer = order.customer || {};
    const billingAddress = order.billing_address || {};
    
    return {
      externalId: `order_${order.id}`,
      source: 'shopify',
      name: order.name, // Order name like #1001
      email: customer.email || order.email,
      phone: customer.phone || billingAddress.phone,
      status: integration.syncSettings.orderLeadStatus,
      value: parseFloat(order.total_price) || 0,
      organizationId: integration.organizationId,
      assignedTo: integration.syncSettings.assignToUser,
      sourceDetails: {
        shopDomain: integration.shopDomain,
        orderId: order.id,
        orderNumber: order.order_number,
        customerId: customer.id,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status
      },
      customFields: {
        shopifyOrderId: order.id,
        orderNumber: order.order_number,
        totalPrice: order.total_price,
        currency: order.currency,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        lineItems: order.line_items?.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        }))
      },
      rawData: order
    };
  }

  // Helper methods
  async handleCustomerWebhook(customer, integration) {
    if (!integration.syncSettings.syncCustomers) return;

    const transformedCustomer = this.transformShopifyCustomer(customer, integration);
    await this.createOrUpdateLead(transformedCustomer);
    
    await ShopifyIntegration.updateOne(
      { _id: integration._id },
      { $inc: { 'stats.customersImported': 1 } }
    );
  }

  async handleOrderWebhook(order, integration) {
    if (!integration.syncSettings.syncOrders) return;

    const transformedOrder = this.transformShopifyOrder(order, integration);
    await this.createOrUpdateLead(transformedOrder);
    
    await ShopifyIntegration.updateOne(
      { _id: integration._id },
      { 
        $inc: { 
          'stats.ordersImported': 1,
          'stats.totalRevenue': parseFloat(order.total_price) || 0
        }
      }
    );
  }

  async handleAppUninstalled(integration) {
    await ShopifyIntegration.updateOne(
      { _id: integration._id },
      { 
        isInstalled: false,
        isActive: false,
        webhooks: []
      }
    );
  }

  extractNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    
    const links = linkHeader.split(',');
    const nextLink = links.find(link => link.includes('rel="next"'));
    
    if (nextLink) {
      const match = nextLink.match(/<(.+)>/);
      return match ? match[1] : null;
    }
    
    return null;
  }

  async createOrUpdateLead(leadData) {
    try {
      const response = await axios.post(`${process.env.LEADS_SERVICE_URL}/api/leads/import`, leadData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error creating/updating lead via leads service:', error.response?.data || error.message);
      throw error;
    }
  }

  // Verify webhook authenticity
  verifyWebhook(rawBody, signature, secret) {
    const calculatedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature)
    );
  }
}

module.exports = new ShopifyService();
