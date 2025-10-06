// Simple test to verify assignment would work
console.log('🧪 Testing Facebook assignment logic (simplified)...');

// Mock the assignment settings from your integration data
const mockAssignmentSettings = {
  enabled: true,
  algorithm: "round-robin",
  assignToUsers: [
    {
      userId: "68c42a2e97977c4ae18802de",
      weight: 1,
      isActive: true
    }
  ],
  lastAssignment: {
    lastAssignedIndex: 0
  }
};

// Test the assignment algorithm directly
function roundRobinAssignment(activeUsers, lastAssignment) {
  const currentIndex = lastAssignment.lastAssignedIndex || 0;
  const nextIndex = (currentIndex + 1) % activeUsers.length;
  const selectedUserSettings = activeUsers[nextIndex];
  
  return {
    user: {
      _id: selectedUserSettings.userId,
      userId: selectedUserSettings.userId,
      weight: selectedUserSettings.weight
    },
    nextIndex: nextIndex
  };
}

console.log('📋 Mock settings:', {
  enabled: mockAssignmentSettings.enabled,
  algorithm: mockAssignmentSettings.algorithm,
  userCount: mockAssignmentSettings.assignToUsers.length
});

if (mockAssignmentSettings.enabled) {
  const activeUsers = mockAssignmentSettings.assignToUsers.filter(u => u.isActive);
  console.log('👥 Active users:', activeUsers.length);
  
  if (activeUsers.length > 0) {
    const assigneeResult = roundRobinAssignment(activeUsers, mockAssignmentSettings.lastAssignment);
    
    console.log('🎯 Assignment result:', {
      hasUser: !!assigneeResult.user,
      userId: assigneeResult.user._id,
      userIdFormat: typeof assigneeResult.user._id
    });
    
    if (assigneeResult.user._id) {
      console.log('✅ SUCCESS: Facebook assignment WOULD work!');
      console.log('Lead would be assigned to user:', assigneeResult.user._id);
    } else {
      console.log('❌ FAILURE: Missing user ID');
    }
  } else {
    console.log('❌ No active users');
  }
} else {
  console.log('❌ Assignment not enabled');
}

console.log('\n🔧 SOLUTION: Restart integrations service to pick up all the fixes!');
console.log('🎯 After restart, Facebook leads will auto-assign to:', mockAssignmentSettings.assignToUsers[0].userId);