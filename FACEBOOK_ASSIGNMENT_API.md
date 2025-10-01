# Facebook Integration Assignment API

## Base URL
```
/api/integrations/facebook
```

## Authentication
All endpoints require authentication via Bearer token in Authorization header.

---

## Assignment Settings Endpoints

### 1. Update Assignment Settings
**PUT** `/api/integrations/facebook/{integrationId}/assignment`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "assignmentSettings": {
    "enabled": true,
    "algorithm": "weighted-round-robin",
    "assignToUsers": [
      {
        "userId": "68c42a2e97977c4ae18802de",
        "weight": 1,
        "isActive": true
      },
      {
        "userId": "68c42a2e97977c4ae18802df",
        "weight": 2,
        "isActive": true
      }
    ],
    "lastAssignment": {
      "mode": "automatic",
      "lastAssignedIndex": 0,
      "lastAssignedAt": "2025-10-01T10:00:00.000Z"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Assignment settings updated successfully",
  "assignmentSettings": {
    "enabled": true,
    "algorithm": "weighted-round-robin",
    "assignToUsers": [...],
    "lastAssignment": {...}
  }
}
```

---

### 2. Enable/Disable Assignment
**PUT** `/api/integrations/facebook/{integrationId}/assignment/toggle`

**Request Body:**
```json
{
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Assignment enabled successfully",
  "enabled": true
}
```

---

### 3. Add User to Assignment Pool
**POST** `/api/integrations/facebook/{integrationId}/assignment/users`

**Request Body:**
```json
{
  "userId": "68c42a2e97977c4ae18802de",
  "weight": 2,
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "User added to assignment pool successfully",
  "assignToUsers": [
    {
      "userId": "68c42a2e97977c4ae18802de",
      "weight": 2,
      "isActive": true
    }
  ]
}
```

---

### 4. Remove User from Assignment Pool
**DELETE** `/api/integrations/facebook/{integrationId}/assignment/users/{userId}`

**Response:**
```json
{
  "success": true,
  "message": "User removed from assignment pool successfully",
  "assignToUsers": []
}
```

---

### 5. Get Assignment Statistics
**GET** `/api/integrations/facebook/{integrationId}/assignment/stats`

**Response:**
```json
{
  "success": true,
  "stats": {
    "enabled": true,
    "algorithm": "weighted-round-robin",
    "totalUsers": 2,
    "activeUsers": 2,
    "totalLeads": 26,
    "lastLeadReceived": "2025-09-24T13:58:59.894Z",
    "lastAssignment": {
      "mode": "automatic",
      "lastAssignedIndex": 1,
      "lastAssignedAt": "2025-10-01T10:00:00.000Z"
    }
  }
}
```

---

## Assignment Algorithms

### 1. Round Robin (`round-robin`)
Assigns leads to users in sequential order, ignoring weights.

### 2. Weighted Round Robin (`weighted-round-robin`)
Assigns leads based on user weights. Higher weight = more leads.

### 3. Least Assigned (`least-assigned`)
Assigns leads to the user with the fewest assigned leads.

### 4. Random (`random`)
Randomly assigns leads to active users.

---

## Example Usage for Your Integration

### Your Integration ID: `68d191b42f1ee2468f9fef7f`

### 1. Enable Assignment with Round Robin
```bash
curl -X PUT \
  'https://api.jestycrm.com/integrations/api/facebook/68d191b42f1ee2468f9fef7f/assignment/toggle' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "enabled": true
  }'
```

### 2. Add Users to Assignment Pool
```bash
curl -X POST \
  'https://api.jestycrm.com/integrations/api/facebook/68d191b42f1ee2468f9fef7f/assignment/users' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "68c42a2e97977c4ae18802de",
    "weight": 1,
    "isActive": true
  }'
```

### 3. Set Weighted Round Robin Algorithm
```bash
curl -X PUT \
  'https://api.jestycrm.com/integrations/api/facebook/68d191b42f1ee2468f9fef7f/assignment' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "assignmentSettings": {
      "algorithm": "weighted-round-robin",
      "assignToUsers": [
        {
          "userId": "68c42a2e97977c4ae18802de",
          "weight": 1,
          "isActive": true
        },
        {
          "userId": "68c42a2e97977c4ae18802df",
          "weight": 3,
          "isActive": true
        }
      ]
    }
  }'
```

### 4. Check Assignment Status
```bash
curl -X GET \
  'https://api.jestycrm.com/integrations/api/facebook/68d191b42f1ee2468f9fef7f/assignment/stats' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Assignment settings are required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Integration not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to update assignment settings"
}
```

---

## Notes

1. **Organization Scoping**: All operations are scoped to your organization automatically
2. **User Validation**: Ensure userIds exist in your organization before adding them
3. **Weights**: Valid weight range is 1-10 for weighted algorithms
4. **Algorithm Changes**: Changing algorithm resets assignment index to 0
5. **Active Users**: Only active users receive lead assignments