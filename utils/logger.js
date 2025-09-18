const winston = require('winston');
const path = require('path');

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(logColors);

// Create log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Create file format (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define log transports - Console only, no file logging
const transports = [
  // Console transport only
  new winston.transports.Console({
    format: logFormat,
    level: process.env.LOG_LEVEL || 'info'
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: fileFormat,
  transports,
  exitOnError: false
});

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
