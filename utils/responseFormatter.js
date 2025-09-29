/**
 * Standard response formatter for consistent API responses
 */

const formatResponse = (data, message = 'Success', meta = null) => {
  const response = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };

  if (meta) {
    response.meta = meta;
  }

  return response;
};

const formatError = (message, error = null, statusCode = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };

  if (error) {
    response.error = error;
  }

  if (statusCode) {
    response.statusCode = statusCode;
  }

  return response;
};

const formatPaginatedResponse = (data, pagination, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    pagination: {
      total: pagination.total || 0,
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      pages: Math.ceil((pagination.total || 0) / (pagination.limit || 10))
    },
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  formatResponse,
  formatError,
  formatPaginatedResponse
};