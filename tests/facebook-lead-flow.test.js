const axios = require('axios');
const FacebookIntegration = require('../models/FacebookIntegration');
const facebookLeadProcessor = require('../services/facebookLeadProcessor.service');

// Mock external dependencies
jest.mock('axios');
jest.mock('../models/FacebookIntegration');

describe('Facebook Lead Flow Integration Tests', () => {
  let mockIntegration;
  let mockFacebookLead;
  let mockLeadsServiceResponse;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock Facebook integration data (simplified like old Jesty backend)
    mockIntegration = {
      _id: 'integration123',
      organizationId: 'org123',
      connected: true,
      fbUserId: 'fbuser123',
      userAccessToken: 'user_token_123',
      disabledFormIds: [],  // Simple disabled forms list like old Jesty
      totalLeads: 5,
      fbPages: [{
        id: 'page123',
        name: 'Test Page',
        accessToken: 'page_access_token'
      }]
    };

    // Mock Facebook lead data (as received from Facebook API)
    mockFacebookLead = {
      id: 'lead123',
      created_time: '2024-01-15T10:30:00+0000',
      ad_id: 'ad123',
      ad_name: 'Test Ad',
      campaign_id: 'campaign123',
      campaign_name: 'Test Campaign',
      form_id: 'form123',
      field_data: [
        {
          name: 'full_name',
          values: ['John Doe']
        },
        {
          name: 'email',
          values: ['john.doe@example.com']
        },
        {
          name: 'phone_number',
          values: ['+1234567890']
        },
        {
          name: 'company_name',
          values: ['Tech Corp']
        },
        {
          name: 'budget_range',
          values: ['$10,000 - $50,000']
        }
      ]
    };

    // Mock leads service response
    mockLeadsServiceResponse = {
      data: {
        leadId: 'crm_lead_123',
        action: 'created',
        message: 'Lead created successfully'
      }
    };
  });

  describe('Facebook Webhook Processing', () => {
    test('should process webhook lead end-to-end', async () => {
      // Setup mocks
      FacebookIntegration.findOne.mockResolvedValue(mockIntegration);
      FacebookIntegration.updateOne.mockResolvedValue({ modifiedCount: 1 });
      
      // Mock Facebook API call to fetch lead details
      axios.get.mockResolvedValue({ data: mockFacebookLead });
      
      // Mock leads service API call
      axios.post.mockResolvedValue(mockLeadsServiceResponse);

      // Test the complete flow
      const result = await facebookLeadProcessor.processWebhookLead(
        'lead123',
        'page123', 
        'form123',
        'org123'
      );

      // Verify the result
      expect(result).toEqual({
        success: true,
        leadId: 'crm_lead_123',
        action: 'created'
      });

      // Verify Facebook API was called to fetch lead details
      expect(axios.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v19.0/lead123',
        {
          params: {
            access_token: 'page_access_token',
            fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
          }
        }
      );

      // Verify leads service was called with correct data (simplified structure)
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:3002/api/facebook-leads/import/facebook',
        expect.objectContaining({
          organizationId: 'org123',
          source: 'facebook_leads',
          status: 'new',
          name: 'John Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          company: 'Tech Corp',
          metadata: expect.objectContaining({
            facebookLeadId: 'lead123',
            formId: 'form123',
            adId: 'ad123',
            campaignId: 'campaign123'
          })
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.stringContaining('Bearer')
          })
        })
      );

      // Verify integration stats were updated (simplified approach)
      expect(FacebookIntegration.updateOne).toHaveBeenCalledWith(
        { _id: 'integration123' },
        {
          $inc: { totalLeads: 1 },
          $set: { lastLeadReceived: expect.any(Date) }
        }
      );
    });

    test('should handle disabled form gracefully', async () => {
      // Use old Jesty approach - add form to disabledFormIds
      mockIntegration.disabledFormIds = ['form123'];
      FacebookIntegration.findOne.mockResolvedValue(mockIntegration);

      const result = await facebookLeadProcessor.processWebhookLead(
        'lead123',
        'page123',
        'form123',
        'org123'
      );

      expect(result).toEqual({
        success: false,
        reason: 'form_disabled'
      });

      // Verify no external calls were made
      expect(axios.get).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('should handle missing integration', async () => {
      FacebookIntegration.findOne.mockResolvedValue(null);

      await expect(
        facebookLeadProcessor.processWebhookLead('lead123', 'page123', 'form123', 'org123')
      ).rejects.toThrow('No Facebook integration found for organization org123 and page page123');
    });

    test('should handle Facebook API errors', async () => {
      FacebookIntegration.findOne.mockResolvedValue(mockIntegration);
      
      // Mock Facebook API error
      axios.get.mockRejectedValue({
        response: {
          data: {
            error: {
              message: 'Invalid access token',
              code: 190
            }
          }
        }
      });

      await expect(
        facebookLeadProcessor.processWebhookLead('lead123', 'page123', 'form123', 'org123')
      ).rejects.toThrow('Failed to fetch lead data from Facebook');
    });

    test('should handle leads service errors', async () => {
      FacebookIntegration.findOne.mockResolvedValue(mockIntegration);
      axios.get.mockResolvedValue({ data: mockFacebookLead });
      
      // Mock leads service error
      axios.post.mockRejectedValue({
        response: {
          data: {
            message: 'Duplicate lead found'
          }
        }
      });

      await expect(
        facebookLeadProcessor.processWebhookLead('lead123', 'page123', 'form123', 'org123')
      ).rejects.toThrow('Failed to create lead: Duplicate lead found');
    });
  });

  describe('Field Extraction Tests', () => {
    test('should extract standard fields correctly', () => {
      const fieldData = [
        { name: 'full_name', values: ['Alice Smith'] },
        { name: 'email', values: ['alice@example.com'] },
        { name: 'phone_number', values: ['+1987654321'] }
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '+1987654321',
        firstName: null,
        lastName: null,
        city: null,
        company: null,
        jobTitle: null
      });
    });

    test('should handle first_name and last_name combination', () => {
      const fieldData = [
        { name: 'first_name', values: ['Bob'] },
        { name: 'last_name', values: ['Johnson'] },
        { name: 'email', values: ['bob@test.com'] }  // Use standard field name
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'Bob Johnson',
        email: 'bob@test.com',
        phone: null,
        firstName: 'Bob',
        lastName: 'Johnson',
        city: null,
        company: null,
        jobTitle: null
      });
    });

    test('should extract extended fields', () => {
      const fieldData = [
        { name: 'company_name', values: ['ABC Corp'] },  // Use correct field name
        { name: 'job_title', values: ['Manager'] },
        { name: 'city', values: ['Mumbai'] }
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'FB Lead',
        email: null,
        phone: null,
        firstName: null,
        lastName: null,
        company: 'ABC Corp',
        jobTitle: 'Manager',
        city: 'Mumbai'
      });
    });

    test('should clean Indian phone numbers', () => {
      const testCases = [
        { input: '9876543210', expected: '+919876543210' },
        { input: '09876543210', expected: '+919876543210' },
        { input: '919876543210', expected: '+919876543210' },
        { input: '+919876543210', expected: '+919876543210' },
        { input: '98765-43210', expected: '+919876543210' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = facebookLeadProcessor.cleanPhoneNumber(input);
        expect(result).toBe(expected);
      });
    });

    test('should handle empty or invalid field values', () => {
      const fieldData = [
        { name: 'full_name', values: [''] },
        { name: 'email', values: [] },
        { name: 'phone_number', values: ['Valid Phone: +1234567890'] }
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'FB Lead',
        email: null,
        phone: '+1234567890',  // Should extract the phone number correctly
        firstName: null,
        lastName: null,
        city: null,
        company: null,
        jobTitle: null
      });
    });

    test('should handle unknown fields gracefully', () => {
      const fieldData = [
        { name: 'custom_field_1', values: ['Custom Value 1'] },
        { name: 'special_notes', values: ['Special Need'] },  // Unknown fields ignored in simplified approach
        { name: 'source_campaign', values: ['Summer Campaign'] }
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'FB Lead',
        email: null,
        phone: null,
        firstName: null,
        lastName: null,
        city: null,
        company: null,
        jobTitle: null
      });
    });
  });

  describe('Bulk Lead Processing', () => {
    test('should process multiple leads from Facebook form', async () => {
      const mockFormLeadsResponse = {
        data: {
          data: [
            { ...mockFacebookLead, id: 'lead1' },
            { ...mockFacebookLead, id: 'lead2', field_data: [
              { name: 'full_name', values: ['Jane Smith'] },
              { name: 'email', values: ['jane@example.com'] }
            ]}
          ]
        }
      };

      FacebookIntegration.findOne.mockResolvedValue(mockIntegration);
      FacebookIntegration.updateOne.mockResolvedValue({ modifiedCount: 1 });
      
      // Mock Facebook API call to fetch form leads
      axios.get.mockResolvedValue(mockFormLeadsResponse);
      
      // Mock leads service calls
      axios.post
        .mockResolvedValueOnce({ data: { leadId: 'crm_lead_1', action: 'created' } })
        .mockResolvedValueOnce({ data: { leadId: 'crm_lead_2', action: 'created' } });

      const result = await facebookLeadProcessor.processFormLeads(
        mockIntegration,
        'page123',
        'form123',
        { limit: 50 }
      );

      expect(result).toEqual({
        success: true,
        processed: 2,
        successful: 2,
        errors: 0,
        results: [
          { facebookLeadId: 'lead1', success: true, leadId: 'crm_lead_1', action: 'created' },
          { facebookLeadId: 'lead2', success: true, leadId: 'crm_lead_2', action: 'created' }
        ]
      });

      // Verify integration stats were updated (simplified approach)
      expect(FacebookIntegration.updateOne).toHaveBeenCalledWith(
        { _id: 'integration123' },
        {
          $inc: { totalLeads: 2 },
          $set: { lastLeadReceived: expect.any(Date) }
        }
      );
    });

    test('should handle mixed success/failure in bulk processing', async () => {
      const mockFormLeadsResponse = {
        data: {
          data: [
            { ...mockFacebookLead, id: 'lead1' },
            { ...mockFacebookLead, id: 'lead2' }
          ]
        }
      };

      FacebookIntegration.findOne.mockResolvedValue(mockIntegration);
      FacebookIntegration.updateOne.mockResolvedValue({ modifiedCount: 1 });
      axios.get.mockResolvedValue(mockFormLeadsResponse);
      
      // Mock one success, one failure
      axios.post
        .mockResolvedValueOnce({ data: { leadId: 'crm_lead_1', action: 'created' } })
        .mockRejectedValueOnce({ response: { data: { message: 'Duplicate lead' } } });

      const result = await facebookLeadProcessor.processFormLeads(
        mockIntegration,
        'page123',
        'form123'
      );

      expect(result).toEqual({
        success: true,
        processed: 2,
        successful: 1,
        errors: 1,
        results: [
          { facebookLeadId: 'lead1', success: true, leadId: 'crm_lead_1', action: 'created' },
          { facebookLeadId: 'lead2', success: false, error: 'Failed to create lead: Duplicate lead' }
        ]
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed Facebook webhook data', async () => {
      FacebookIntegration.findOne.mockResolvedValue(mockIntegration);
      
      // Mock malformed Facebook lead data
      const malformedLead = {
        id: 'lead123',
        created_time: '2024-01-15T10:30:00+0000',
        // Missing field_data
      };
      
      axios.get.mockResolvedValue({ data: malformedLead });
      axios.post.mockResolvedValue(mockLeadsServiceResponse);

      const result = await facebookLeadProcessor.processWebhookLead(
        'lead123',
        'page123',
        'form123',
        'org123'
      );

      // With our new validation, this should fail due to no contact info
      expect(result.success).toBe(false);
      expect(result.reason).toBe('no_contact_info');
      expect(axios.post).not.toHaveBeenCalled();  // No leads service call should be made
    });

    test('should handle network timeouts gracefully', async () => {
      FacebookIntegration.findOne.mockResolvedValue(mockIntegration);
      
      // Mock network timeout
      axios.get.mockRejectedValue(new Error('ECONNRESET'));

      await expect(
        facebookLeadProcessor.processWebhookLead('lead123', 'page123', 'form123', 'org123')
      ).rejects.toThrow('Failed to fetch lead data from Facebook');
    });

    test('should handle database connection issues', async () => {
      // Mock database error
      FacebookIntegration.findOne.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        facebookLeadProcessor.processWebhookLead('lead123', 'page123', 'form123', 'org123')
      ).rejects.toThrow('Database connection failed');
    });
  });
});

// Helper function to run the tests
if (require.main === module) {
  console.log('Running Facebook Lead Flow Tests...');
  console.log('Use: npm test facebook-lead-flow.test.js');
}