/**
 * Test script for Facebook Integration Form-Level Assignment
 * 
 * This script demonstrates the new form-level assignment functionality
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'https://12145be97d5a.ngrok-free.app'; // Update with your URL
const API_BASE = `${BASE_URL}/api/integrations/facebook`;

// Test data
const testConfig = {
  // Replace with actual values from your integration
  integrationId: '68de6580de96e21d18db702a',
  pageId: '733586139846420',
  formId: '2250606145364855',
  authToken: 'Bearer YOUR_AUTH_TOKEN' // Replace with actual token
};

class FacebookFormAssignmentTester {
  constructor() {
    this.axios = axios.create({
      baseURL: API_BASE,
      headers: {
        'Authorization': testConfig.authToken,
        'Content-Type': 'application/json'
      }
    });
  }

  async testGetPages() {
    console.log('🔍 Testing: Get Pages with Auto-Sync...');
    try {
      const response = await this.axios.get('/pages');
      console.log('✅ Pages fetched successfully');
      console.log(`   Pages count: ${response.data.pages?.length || 0}`);
      
      if (response.data.pages && response.data.pages.length > 0) {
        const firstPage = response.data.pages[0];
        console.log(`   First page: ${firstPage.name} (${firstPage.id})`);
        console.log(`   Forms count: ${firstPage.leadForms?.length || 0}`);
        
        if (firstPage.leadForms && firstPage.leadForms.length > 0) {
          const firstForm = firstPage.leadForms[0];
          console.log(`   First form: ${firstForm.name} (${firstForm.id})`);
          console.log(`   Form enabled: ${firstForm.enabled}`);
          console.log(`   Assignment enabled: ${firstForm.assignmentSettings?.enabled}`);
        }
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching pages:', error.response?.data || error.message);
      return null;
    }
  }

  async testGetFormAssignmentSettings() {
    console.log('\n🔍 Testing: Get Form Assignment Settings...');
    try {
      const url = `/${testConfig.integrationId}/pages/${testConfig.pageId}/forms/${testConfig.formId}/assignment`;
      const response = await this.axios.get(url);
      console.log('✅ Form assignment settings retrieved');
      console.log('   Settings:', JSON.stringify(response.data.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('❌ Error getting form assignment settings:', error.response?.data || error.message);
      return null;
    }
  }

  async testUpdateFormAssignmentSettings() {
    console.log('\n🔍 Testing: Update Form Assignment Settings...');
    try {
      const url = `/${testConfig.integrationId}/pages/${testConfig.pageId}/forms/${testConfig.formId}/assignment`;
      const settings = {
        enabled: true,
        algorithm: 'round-robin',
        assignToUsers: [
          {
            userId: '68c42a2e97977c4ae18802de', // Replace with actual user ID
            weight: 1,
            isActive: true
          }
        ]
      };
      
      const response = await this.axios.put(url, settings);
      console.log('✅ Form assignment settings updated');
      console.log('   Updated settings:', JSON.stringify(response.data.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('❌ Error updating form assignment settings:', error.response?.data || error.message);
      return null;
    }
  }

  async testToggleFormStatus() {
    console.log('\n🔍 Testing: Toggle Form Status...');
    try {
      const url = `/${testConfig.integrationId}/pages/${testConfig.pageId}/forms/${testConfig.formId}/toggle`;
      const response = await this.axios.put(url, { enabled: true });
      console.log('✅ Form status toggled');
      console.log(`   Form enabled: ${response.data.data?.enabled}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error toggling form status:', error.response?.data || error.message);
      return null;
    }
  }

  async testGetFormStats() {
    console.log('\n🔍 Testing: Get Form Statistics...');
    try {
      const url = `/${testConfig.integrationId}/pages/${testConfig.pageId}/forms/${testConfig.formId}/stats`;
      const response = await this.axios.get(url);
      console.log('✅ Form statistics retrieved');
      console.log('   Stats:', JSON.stringify(response.data.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('❌ Error getting form statistics:', error.response?.data || error.message);
      return null;
    }
  }

  async testPreviewAssignment() {
    console.log('\n🔍 Testing: Preview Next Assignment...');
    try {
      const url = `/${testConfig.integrationId}/pages/${testConfig.pageId}/forms/${testConfig.formId}/assignment/preview`;
      const response = await this.axios.get(url);
      console.log('✅ Assignment preview generated');
      console.log('   Preview:', JSON.stringify(response.data.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('❌ Error previewing assignment:', error.response?.data || error.message);
      return null;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Facebook Form Assignment Tests...\n');
    
    // Test 1: Get pages with auto-sync
    await this.testGetPages();
    
    // Test 2: Get form assignment settings
    await this.testGetFormAssignmentSettings();
    
    // Test 3: Update form assignment settings
    await this.testUpdateFormAssignmentSettings();
    
    // Test 4: Toggle form status
    await this.testToggleFormStatus();
    
    // Test 5: Get form stats
    await this.testGetFormStats();
    
    // Test 6: Preview assignment
    await this.testPreviewAssignment();
    
    console.log('\n✅ All tests completed!');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new FacebookFormAssignmentTester();
  
  // Update the test configuration before running
  console.log('⚠️  Please update the testConfig object with your actual values before running tests');
  console.log('   - integrationId: Your Facebook integration ID');
  console.log('   - pageId: Your Facebook page ID');
  console.log('   - formId: Your Facebook form ID');
  console.log('   - authToken: Your authentication token');
  console.log('   - BASE_URL: Your service URL\n');
  
  // Uncomment to run tests
  // tester.runAllTests();
}

module.exports = FacebookFormAssignmentTester;