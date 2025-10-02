# Facebook Integration Form-Level Assignment Enhancement

## Overview

This document outlines the implemented changes to support form-level assignment settings for Facebook integrations in the CRM system.

## Key Changes

### 1. Updated Database Schema

- **FacebookIntegration Model**: Modified to store detailed form information with individual assignment settings
- **Form Structure**: Each form now contains:
  - Basic form info (id, name, status, leadsCount, questions)
  - Individual assignment settings (algorithm, assignToUsers, lastAssignment)
  - Form-level statistics (leadsToday, leadsThisWeek, leadsThisMonth)
  - Enable/disable status

### 2. Auto-Sync Functionality

- **Automatic Sync**: Pages endpoint now auto-syncs with Facebook API to ensure latest forms data
- **Preserved Settings**: Existing assignment settings are preserved during sync
- **New Forms**: New forms are automatically initialized with default settings

### 3. Form-Level Assignment

- **Individual Control**: Each form can have its own assignment settings
- **Assignment Algorithms**: Support for round-robin, weighted-round-robin, least-assigned, and random
- **User Management**: Add/remove users per form with weight settings
- **Assignment Tracking**: Track last assignment per form

### 4. New API Endpoints

#### Form Assignment Management
```
GET    /api/integrations/facebook/:id/pages/:pageId/forms/:formId/assignment
PUT    /api/integrations/facebook/:id/pages/:pageId/forms/:formId/assignment
GET    /api/integrations/facebook/:id/pages/:pageId/forms/:formId/assignment/eligible-users
GET    /api/integrations/facebook/:id/pages/:pageId/forms/:formId/assignment/preview
POST   /api/integrations/facebook/:id/pages/:pageId/forms/:formId/assignment/assign
GET    /api/integrations/facebook/:id/pages/:pageId/forms/:formId/assignment/stats
POST   /api/integrations/facebook/:id/pages/:pageId/forms/:formId/assignment/reset
```

#### Form Management
```
PUT    /api/integrations/facebook/:id/pages/:pageId/forms/:formId/toggle
GET    /api/integrations/facebook/:id/pages/:pageId/forms/:formId/stats
POST   /api/integrations/facebook/:id/pages/:pageId/forms/:formId/process-leads
```

### 5. Enhanced Services

- **FormAssignmentService**: New service for form-level assignment logic
- **FacebookLeadProcessor**: Updated to handle form-level settings and auto-assignment
- **FacebookService**: Enhanced with detailed form fetching and auto-sync capabilities

## API Usage Examples

### Get Pages with Forms (Auto-Sync)
```bash
GET /api/integrations/facebook/pages
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "pages": [
    {
      "id": "733586139846420",
      "name": "Personal7023",
      "lastSyncAt": "2025-10-02T12:00:00.000Z",
      "leadForms": [
        {
          "id": "2250606145364855",
          "name": "new-form",
          "enabled": true,
          "leadsCount": 0,
          "assignmentSettings": {
            "enabled": false,
            "algorithm": "round-robin",
            "assignToUsers": []
          },
          "stats": {
            "leadsToday": 0,
            "leadsThisWeek": 0,
            "leadsThisMonth": 0
          }
        }
      ]
    }
  ]
}
```

### Update Form Assignment Settings
```bash
PUT /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/assignment
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": true,
  "algorithm": "round-robin",
  "assignToUsers": [
    {
      "userId": "68c42a2e97977c4ae18802de",
      "weight": 1,
      "isActive": true
    }
  ]
}
```

### Toggle Form Status
```bash
PUT /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/toggle
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": false
}
```

## Data Structure

### Updated FacebookIntegration Schema
```javascript
{
  organizationId: ObjectId,
  userId: ObjectId,
  connected: Boolean,
  fbUserId: String,
  fbUserName: String,
  userAccessToken: String,
  fbPages: [{
    id: String,
    name: String,
    accessToken: String,
    lastSyncAt: Date,
    leadForms: [{
      id: String,
      name: String,
      status: String,
      leadsCount: Number,
      enabled: Boolean,
      questions: [Object],
      assignmentSettings: {
        enabled: Boolean,
        algorithm: String,
        assignToUsers: [{
          userId: ObjectId,
          weight: Number,
          isActive: Boolean
        }],
        lastAssignment: {
          mode: String,
          lastAssignedIndex: Number,
          lastAssignedAt: Date,
          lastAssignedTo: ObjectId
        }
      },
      stats: {
        leadsToday: Number,
        leadsThisWeek: Number,
        leadsThisMonth: Number,
        lastLeadReceived: Date
      }
    }]
  }]
}
```

## Features

✅ **Form-Level Assignment**: Each form can have independent assignment settings
✅ **Auto-Sync**: Automatic synchronization with Facebook API when fetching pages
✅ **Settings Preservation**: Existing settings are preserved during sync
✅ **Multiple Algorithms**: Round-robin, weighted, least-assigned, random
✅ **Form Statistics**: Track leads per form with time-based metrics
✅ **Enable/Disable Forms**: Toggle form processing on/off
✅ **Assignment Preview**: Preview who will get the next assignment
✅ **User Management**: Add/remove users from assignment pool per form

## Benefits

1. **Granular Control**: Assign different teams to different forms
2. **Flexible Routing**: Route leads based on form type (product inquiries vs support)
3. **Load Balancing**: Distribute workload effectively across team members
4. **Performance Tracking**: Monitor form performance and assignment distribution
5. **Easy Management**: Simple API to manage settings per form

## Migration Notes

- Existing integrations will continue to work
- Old assignment settings at integration level are removed
- Forms are automatically initialized with default settings on first sync
- No data loss during migration as form data is fetched fresh from Facebook

## Testing

To test the implementation:

1. **Setup Facebook Integration**: Connect a Facebook page with lead forms
2. **Fetch Pages**: Call `/api/integrations/facebook/pages` to auto-sync
3. **Configure Assignment**: Set up assignment settings for specific forms
4. **Test Lead Processing**: Submit test leads through Facebook forms
5. **Monitor Assignment**: Check assignment distribution and statistics

## Next Steps

- Implement service-to-service authentication for lead assignment
- Add webhook validation for enhanced security
- Implement assignment analytics and reporting
- Add bulk assignment operations
- Implement assignment rules based on lead data