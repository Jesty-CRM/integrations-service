/**
 * Date Range Filter Middleware for Integrations Service
 * 
 * Provides standardized date filtering for analytics endpoints
 * Supports start_date and end_date query parameters
 */

const moment = require('moment');

/**
 * Parse and validate date from string input
 * @param {string} dateString - Input date string
 * @param {string} fieldName - Field name for error messages
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateString, fieldName) {
  if (!dateString) return null;
  
  // Try multiple date formats
  const formats = [
    'YYYY-MM-DD',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DDTHH:mm:ss.SSSZ',
    'YYYY-MM-DDTHH:mm:ssZ',
    'MM/DD/YYYY',
    'DD/MM/YYYY',
    'YYYY/MM/DD'
  ];
  
  let parsedDate = null;
  
  // Try parsing with moment using multiple formats
  for (const format of formats) {
    const momentDate = moment(dateString, format, true);
    if (momentDate.isValid()) {
      parsedDate = momentDate.toDate();
      break;
    }
  }
  
  // Fallback to native Date parsing
  if (!parsedDate) {
    parsedDate = new Date(dateString);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid ${fieldName} format. Use YYYY-MM-DD or ISO 8601 format`);
    }
  }
  
  return parsedDate;
}

/**
 * Validate date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 */
function validateDateRange(startDate, endDate) {
  if (startDate && endDate && startDate > endDate) {
    throw new Error('start_date cannot be later than end_date');
  }
  
  // Check for reasonable date ranges (not more than 10 years)
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  
  if (startDate && startDate < tenYearsAgo) {
    throw new Error('start_date cannot be more than 10 years in the past');
  }
  
  const futureLimit = new Date();
  futureLimit.setFullYear(futureLimit.getFullYear() + 1);
  
  if (endDate && endDate > futureLimit) {
    throw new Error('end_date cannot be more than 1 year in the future');
  }
}

/**
 * Date filter middleware
 * Parses and validates start_date and end_date query parameters
 * Adds parsedDateRange to req object
 */
function dateFilter(req, res, next) {
  try {
    const { start_date, end_date } = req.query;
    
    let startDate = null;
    let endDate = null;
    
    // Parse dates if provided
    if (start_date) {
      startDate = parseDate(start_date, 'start_date');
    }
    
    if (end_date) {
      endDate = parseDate(end_date, 'end_date');
      // Set end date to end of day if only date is provided (no time)
      if (end_date.length === 10) { // YYYY-MM-DD format
        endDate.setHours(23, 59, 59, 999);
      }
    }
    
    // Validate date range
    validateDateRange(startDate, endDate);
    
    // Add parsed dates to request object
    req.parsedDateRange = {
      startDate,
      endDate,
      hasDateFilter: !!(startDate || endDate)
    };
    
    // Also keep original query params for backward compatibility
    req.dateFilter = {
      start_date,
      end_date,
      startDate,
      endDate,
      hasFilter: !!(startDate || endDate)
    };
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid date parameters',
      error: error.message,
      validFormats: [
        'YYYY-MM-DD (e.g., 2023-12-01)',
        'YYYY-MM-DD HH:mm:ss (e.g., 2023-12-01 14:30:00)',
        'ISO 8601 (e.g., 2023-12-01T14:30:00.000Z)'
      ]
    });
  }
}

/**
 * Build MongoDB date match condition
 * @param {Object} baseMatch - Base match conditions
 * @param {Date} startDate - Start date filter
 * @param {Date} endDate - End date filter
 * @param {string} dateField - Date field name (default: 'createdAt')
 * @returns {Object} Updated match conditions
 */
function buildDateMatch(baseMatch = {}, startDate, endDate, dateField = 'createdAt') {
  if (!startDate && !endDate) {
    return baseMatch;
  }
  
  const dateCondition = {};
  
  if (startDate) {
    dateCondition.$gte = startDate;
  }
  
  if (endDate) {
    dateCondition.$lte = endDate;
  }
  
  return {
    ...baseMatch,
    [dateField]: dateCondition
  };
}

/**
 * Get date range summary for response
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} timezone - Organization timezone
 * @returns {Object} Date range summary
 */
function getDateRangeSummary(startDate, endDate, timezone = 'UTC') {
  if (!startDate && !endDate) {
    return {
      filtered: false,
      message: 'No date filter applied - showing all data'
    };
  }
  
  const summary = {
    filtered: true,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    timezone: timezone,
    message: ''
  };
  
  if (startDate && endDate) {
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    summary.message = `Data filtered from ${startDate.toDateString()} to ${endDate.toDateString()} (${days} days)`;
    summary.duration = `${days} days`;
  } else if (startDate) {
    summary.message = `Data filtered from ${startDate.toDateString()} onwards`;
  } else if (endDate) {
    summary.message = `Data filtered up to ${endDate.toDateString()}`;
  }
  
  return summary;
}

module.exports = {
  dateFilter,
  parseDate,
  validateDateRange,
  buildDateMatch,
  getDateRangeSummary
};