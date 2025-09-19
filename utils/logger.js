// Console-only logger with colors and formatting
const logger = {
  error: (message) => console.error(`\x1b[31m[ERROR]\x1b[0m ${new Date().toISOString().replace('T', ' ').slice(0, 23)} - ${message}`),
  warn: (message) => console.warn(`\x1b[33m[WARN]\x1b[0m ${new Date().toISOString().replace('T', ' ').slice(0, 23)} - ${message}`),
  info: (message) => console.log(`\x1b[32m[INFO]\x1b[0m ${new Date().toISOString().replace('T', ' ').slice(0, 23)} - ${message}`),
  http: (message) => console.log(`\x1b[35m[HTTP]\x1b[0m ${new Date().toISOString().replace('T', ' ').slice(0, 23)} - ${message}`),
  debug: (message) => console.log(`\x1b[36m[DEBUG]\x1b[0m ${new Date().toISOString().replace('T', ' ').slice(0, 23)} - ${message}`)
};

// No file logging - console only

// Add request logging method
logger.logRequest = (req, res, responseTime) => {
  const { method, url, ip } = req;
  const { statusCode } = res;
  const userAgent = req.get('User-Agent') || '';
  
  logger.http(
    `${method} ${url} ${statusCode} ${responseTime}ms - ${ip} - ${userAgent}`
  );
};

// Add error logging with context
logger.logError = (error, context = {}) => {
  const errorMessage = {
    message: error.message,
    stack: error.stack,
    ...context
  };
  
  logger.error(JSON.stringify(errorMessage));
};

// Add integration-specific logging
logger.logIntegration = (type, action, data = {}) => {
  const logMessage = {
    type: 'integration',
    integration: type,
    action,
    ...data,
    timestamp: new Date().toISOString()
  };
  
  logger.info(`Integration: ${JSON.stringify(logMessage)}`);
};

// Add webhook logging
logger.logWebhook = (source, event, data = {}) => {
  const logMessage = {
    type: 'webhook',
    source,
    event,
    ...data,
    timestamp: new Date().toISOString()
  };
  
  logger.info(`Webhook: ${JSON.stringify(logMessage)}`);
};

// Add lead processing logging
logger.logLead = (action, leadData = {}) => {
  const logMessage = {
    type: 'lead',
    action,
    leadId: leadData.leadId || leadData.id,
    source: leadData.source,
    organizationId: leadData.organizationId,
    timestamp: new Date().toISOString()
  };
  
  logger.info(`Lead: ${JSON.stringify(logMessage)}`);
};

module.exports = logger;
