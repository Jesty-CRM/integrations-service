// Test the Facebook assignment flow
async function testFacebookAssignmentFlow() {
  try {
    console.log('🧪 Testing Facebook assignment flow...');
    
    // Simulate the assignment service call
    const formAssignmentService = require('./services/formAssignmentService');
    
    const integrationId = '68e4154e0cd92a857730702e'; // Updated integration ID
    const pageId = '733586139846420';
    const formId = '2250606145364855';
    
    console.log('📋 Testing with:');
    console.log('- Integration ID:', integrationId);
    console.log('- Page ID:', pageId);
    console.log('- Form ID:', formId);
    
    const assigneeResult = await formAssignmentService.getNextAssigneeForForm(
      integrationId,
      pageId,
      formId
    );
    
    console.log('\n🎯 Assignment result:');
    console.log('- Has result:', !!assigneeResult);
    console.log('- Has user:', !!(assigneeResult && assigneeResult.user));
    console.log('- User ID:', assigneeResult?.user?._id);
    console.log('- User userId:', assigneeResult?.user?.userId);
    
    if (assigneeResult && assigneeResult.user && assigneeResult.user._id) {
      console.log('\n✅ SUCCESS: Facebook assignment would work!');
      console.log('Lead would be assigned to:', assigneeResult.user._id);
    } else {
      console.log('\n❌ FAILURE: Facebook assignment would not work');
      console.log('Missing user._id in result');
    }
    
  } catch (error) {
    console.error('❌ Error testing Facebook assignment:', error.message);
  }
}

testFacebookAssignmentFlow();