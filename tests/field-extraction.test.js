const facebookLeadProcessor = require('../services/facebookLeadProcessor.service');

describe('Facebook Lead Field Extraction Tests', () => {
  describe('extractLeadFields', () => {
    test('should extract basic fields correctly', () => {
      const fieldData = [
        { name: 'full_name', values: ['John Doe'] },
        { name: 'email', values: ['john@example.com'] },
        { name: 'phone_number', values: ['+1234567890'] }
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        firstName: null,
        lastName: null,
        city: null,
        company: null,
        jobTitle: null
      });
    });

    test('should handle first_name and last_name combination when no full_name exists', () => {
      const fieldData = [
        { name: 'first_name', values: ['Alice'] },
        { name: 'last_name', values: ['Smith'] },
        { name: 'email', values: ['alice@example.com'] }
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'Alice Smith',  // Combination logic should override
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        phone: null,
        city: null,
        company: null,
        jobTitle: null
      });
    });

    test('should extract extended fields', () => {
      const fieldData = [
        { name: 'company_name', values: ['Tech Corp'] },  // Use correct field name
        { name: 'job_title', values: ['Developer'] },
        { name: 'city', values: ['Mumbai'] }
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'FB Lead',
        email: null,
        phone: null,
        firstName: null,
        lastName: null,
        company: 'Tech Corp',
        jobTitle: 'Developer',
        city: 'Mumbai'
      });
    });

    test('should handle empty values', () => {
      const fieldData = [
        { name: 'full_name', values: [''] },
        { name: 'email', values: [] },
        { name: 'phone_number', values: ['9876543210'] }
      ];

      const result = facebookLeadProcessor.extractLeadFields(fieldData);

      expect(result).toEqual({
        name: 'FB Lead',
        email: null,
        phone: '+919876543210',
        firstName: null,
        lastName: null,
        city: null,
        company: null,
        jobTitle: null
      });
    });

    test('should handle unknown fields gracefully', () => {
      const fieldData = [
        { name: 'custom_field', values: ['Custom Value'] },
        { name: 'special_notes', values: ['VIP Client'] }  // Unknown fields are ignored in simplified approach
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

  describe('cleanPhoneNumber', () => {
    test('should clean Indian phone numbers correctly', () => {
      const testCases = [
        { input: '9876543210', expected: '+919876543210' },
        { input: '09876543210', expected: '+919876543210' },
        { input: '919876543210', expected: '+919876543210' },
        { input: '+919876543210', expected: '+919876543210' },
        { input: '987-654-3210', expected: '+919876543210' },
        { input: '(987) 654-3210', expected: '+919876543210' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = facebookLeadProcessor.cleanPhoneNumber(input);
        expect(result).toBe(expected);
      });
    });

    test('should handle international numbers', () => {
      const result = facebookLeadProcessor.cleanPhoneNumber('+1234567890');
      expect(result).toBe('+1234567890');
    });
  });
});