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

// Define log transports
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: logFormat,
    level: process.env.LOG_LEVEL || 'info'
  })
];

// Add file transports for production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: fileFormat,
  transports,
  exitOnError: false
});

// Create logs directory if it doesn't exist
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

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
