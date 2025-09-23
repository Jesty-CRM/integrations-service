// Jest setup file for integrations service tests

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.LEADS_SERVICE_URL = 'http://localhost:3002';
process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-token';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/jesty-crm-integrations-test';

// Mock console.log for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  // Helper to create mock request objects
  createMockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: {
      id: 'test-user-id',
      organizationId: 'test-org-id',
      roles: ['admin']
    },
    ...overrides
  }),

  // Helper to create mock response objects
  createMockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    return res;
  },

  // Helper to create mock Facebook lead data
  createMockFacebookLead: (overrides = {}) => ({
    id: 'test-lead-id',
    created_time: '2024-01-15T10:30:00+0000',
    ad_id: 'test-ad-id',
    ad_name: 'Test Ad',
    campaign_id: 'test-campaign-id',
    campaign_name: 'Test Campaign',
    form_id: 'test-form-id',
    field_data: [
      { name: 'full_name', values: ['Test User'] },
      { name: 'email', values: ['test@example.com'] },
      { name: 'phone_number', values: ['+1234567890'] }
    ],
    ...overrides
  }),

  // Helper to create mock integration data
  createMockIntegration: (overrides = {}) => ({
    _id: 'test-integration-id',
    organizationId: 'test-org-id',
    accessToken: 'mock-access-token',
    fbPages: [{
      id: 'test-page-id',
      name: 'Test Page',
      accessToken: 'mock-page-access-token',
      leadForms: [{
        id: 'test-form-id',
        name: 'Test Form',
        enabled: true,
        totalLeads: 0
      }]
    }],
    ...overrides
  })
};

// Suppress deprecation warnings in tests
process.env.NO_DEPRECATION = 'true';