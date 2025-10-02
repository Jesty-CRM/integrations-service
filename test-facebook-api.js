/**
 * Test Facebook API calls directly
 */

require('dotenv').config();
const axios = require('axios');

async function testFacebookAPI() {
  try {
    // Get a test integration from the database to use its access token
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const FacebookIntegration = require('./models/FacebookIntegration');
    const integration = await FacebookIntegration.findOne({ connected: true }).sort({ createdAt: -1 });
    
    if (!integration) {
      console.log('❌ No connected Facebook integration found');
      process.exit(1);
    }
    
    console.log('✅ Found integration:', integration._id);
    console.log('User:', integration.fbUserName);
    console.log('Pages:', integration.fbPages?.length || 0);
    
    const baseURL = 'https://graph.facebook.com/v19.0';
    const accessToken = integration.userAccessToken;
    
    if (!accessToken) {
      console.log('❌ No access token found');
      process.exit(1);
    }
    
    console.log('\n🔍 Testing Facebook API calls...');
    
    // Test 1: Get user info
    console.log('\n1. Testing user info...');
    try {
      const userResponse = await axios.get(`${baseURL}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,name'
        }
      });
      console.log('✅ User info:', userResponse.data);
    } catch (error) {
      console.log('❌ User info failed:', error.response?.data || error.message);
    }
    
    // Test 2: Get pages
    console.log('\n2. Testing pages...');
    try {
      const pagesResponse = await axios.get(`${baseURL}/me/accounts`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token'
        }
      });
      console.log('✅ Pages:', pagesResponse.data.data?.length || 0);
      
      if (pagesResponse.data.data && pagesResponse.data.data.length > 0) {
        const firstPage = pagesResponse.data.data[0];
        console.log('First page:', firstPage.name, firstPage.id);
        
        // Test 3: Get lead forms for first page
        console.log('\n3. Testing lead forms...');
        try {
          const formsResponse = await axios.get(`${baseURL}/${firstPage.id}/leadgen_forms`, {
            params: {
              access_token: firstPage.access_token,
              fields: 'id,name,status,leads_count,created_time'
            }
          });
          console.log('✅ Lead forms:', formsResponse.data.data?.length || 0);
          
          if (formsResponse.data.data && formsResponse.data.data.length > 0) {
            const firstForm = formsResponse.data.data[0];
            console.log('First form:', firstForm.name, firstForm.id);
            
            // Test 4: Get form questions
            console.log('\n4. Testing form questions...');
            try {
              const questionsResponse = await axios.get(`${baseURL}/${firstForm.id}`, {
                params: {
                  access_token: firstPage.access_token,
                  fields: 'questions'
                }
              });
              console.log('✅ Form questions:', questionsResponse.data.questions?.length || 0);
            } catch (error) {
              console.log('❌ Form questions failed:', error.response?.data || error.message);
            }
          } else {
            console.log('ℹ️  No lead forms found');
          }
        } catch (error) {
          console.log('❌ Lead forms failed:', error.response?.data || error.message);
        }
      } else {
        console.log('ℹ️  No pages found');
      }
    } catch (error) {
      console.log('❌ Pages failed:', error.response?.data || error.message);
    }
    
    console.log('\n✅ API test completed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testFacebookAPI();
}

module.exports = testFacebookAPI;