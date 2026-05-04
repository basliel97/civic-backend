# 📢 Announcements API Documentation

## Overview

The Announcements API allows agency administrators and global administrators to create, manage, and publish announcements to citizens. Citizens can view active announcements through the citizen portal.

### Key Features

- **Bureau-Specific Announcements**: Agency admins can create announcements for their specific bureau
- **Global Announcements**: Super admins can create system-wide announcements
- **Targeted Audiences**: Announcements can target specific user roles (citizen, admin, etc.)
- **Soft Deletes**: Announcements are deactivated rather than permanently deleted
- **Audit Logging**: All announcement operations are logged for compliance
- **Active Status**: Only active announcements are visible to citizens

---

## 🔐 Authentication

All admin endpoints require authentication with appropriate role permissions:

- **Agency Admin**: `admin` role with assigned `bureau_id`
- **Global Admin**: `super_admin` role with `bureau_id = null`
- **Citizens**: Bearer token authentication (optional for public announcements)

---

## 📋 API Endpoints

### Agency Admin Endpoints

**Base URL:** `/api/admin/agency-admin/announcements`

#### 1. Get Bureau Announcements
```http
GET /api/admin/agency-admin/announcements?limit=50&offset=0
```

**Authentication:** Agency Admin (Bearer Token)

**Query Parameters:**
- `limit` (optional): Number of announcements to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Important Update",
      "content": "System maintenance scheduled for tonight",
      "image_url": "https://example.com/image.jpg",
      "bureau_id": "bureau-uuid",
      "is_active": true,
      "created_by": "admin-uuid",
      "target_role": "citizen",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### 2. Create Bureau Announcement
```http
POST /api/admin/agency-admin/announcements
```

**Authentication:** Agency Admin (Bearer Token)

**Request Body:**
```json
{
  "title": "Required: Announcement Title",
  "content": "Required: Announcement content in markdown or plain text",
  "image_url": "Optional: Image URL for the announcement",
  "target_role": "Optional: Target audience (default: 'citizen')"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Important Update",
    "content": "System maintenance scheduled for tonight",
    "image_url": null,
    "bureau_id": "bureau-uuid",
    "is_active": true,
    "created_by": "admin-uuid",
    "target_role": "citizen",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

#### 3. Update Bureau Announcement
```http
PUT /api/admin/agency-admin/announcements/{id}
```

**Authentication:** Agency Admin (Bearer Token)

**Request Body:** (all fields optional)
```json
{
  "title": "Updated title",
  "content": "Updated content",
  "image_url": "New image URL",
  "target_role": "admin"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Updated title",
    "content": "Updated content",
    "image_url": "New image URL",
    "bureau_id": "bureau-uuid",
    "is_active": true,
    "created_by": "admin-uuid",
    "target_role": "admin",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T11:00:00Z"
  }
}
```

#### 4. Delete Bureau Announcement
```http
DELETE /api/admin/agency-admin/announcements/{id}
```

**Authentication:** Agency Admin (Bearer Token)

**Response:**
```json
{
  "success": true,
  "message": "Announcement deactivated"
}
```

---

### Global Admin Endpoints

**Base URL:** `/api/admin/global-admin/announcements`

#### 1. Get Global Announcements
```http
GET /api/admin/global-admin/announcements?limit=50&offset=0
```

**Authentication:** Global Admin (Bearer Token)

**Response:** Same format as agency admin get endpoint, but only global announcements.

#### 2. Create Global Announcement
```http
POST /api/admin/global-admin/announcements
```

**Authentication:** Global Admin (Bearer Token)

**Request Body:** Same as agency admin create endpoint.

**Response:** Same format as agency admin create endpoint.

#### 3. Update Global Announcement
```http
PUT /api/admin/global-admin/announcements/{id}
```

**Authentication:** Global Admin (Bearer Token)

**Request Body:** Same as agency admin update endpoint.

**Response:** Same format as agency admin update endpoint.

#### 4. Delete Global Announcement
```http
DELETE /api/admin/global-admin/announcements/{id}
```

**Authentication:** Global Admin (Bearer Token)

**Response:** Same as agency admin delete endpoint.

---

### Citizen Portal Endpoints

**Base URL:** `/api/citizen/announcements`

#### 1. Get Active Announcements
```http
GET /api/citizen/announcements?limit=10
```

**Authentication:** Optional (Bearer Token) - shows more relevant announcements if authenticated

**Query Parameters:**
- `limit` (optional): Number of announcements to return (default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "System Maintenance Notice",
      "content": "The system will be down for maintenance tonight from 10 PM to 2 AM.",
      "image_url": "https://example.com/maintenance.jpg",
      "bureau_id": null,
      "target_role": "citizen",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Behavior:**
- **Unauthenticated users**: See only global active announcements
- **Authenticated citizens**: See global announcements + announcements from their bureau (if they have one)

---

## 🚨 Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error message description"
}
```

### Common Error Codes

- **400 Bad Request**: Missing required fields, invalid data
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Insufficient permissions (wrong bureau, wrong role)
- **404 Not Found**: Announcement not found or not owned by your bureau
- **500 Internal Server Error**: Server-side error

### Specific Error Messages

- `"Bureau ID required"`: Agency admin endpoint called without bureau assignment
- `"Title and content are required"`: Missing required fields in create request
- `"Announcement not found or you do not have permission to edit it"`: Trying to edit announcement from another bureau
- `"No fields to update"`: Update request with no valid fields

---

## 📝 Data Types

### Announcement Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Auto | Unique announcement identifier |
| `title` | String | Yes | Announcement title (max 255 chars) |
| `content` | String | Yes | Announcement content (markdown supported) |
| `image_url` | String | No | Optional image URL |
| `bureau_id` | UUID | Auto | Bureau that owns the announcement (null for global) |
| `is_active` | Boolean | Auto | Whether announcement is active (default: true) |
| `created_by` | UUID | Auto | Admin user who created the announcement |
| `target_role` | String | No | Target audience role (default: "citizen") |
| `created_at` | Timestamp | Auto | Creation timestamp |
| `updated_at` | Timestamp | Auto | Last update timestamp |

### Target Role Values

- `"citizen"` - Regular citizens (default)
- `"admin"` - Agency administrators
- `"all"` - All users
- Custom roles as needed

---

## 🔍 Usage Examples

### JavaScript (Frontend)

#### Create Announcement (Agency Admin)
```javascript
const createAnnouncement = async (title, content, imageUrl = null) => {
  const response = await fetch('/api/admin/agency-admin/announcements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title,
      content,
      image_url: imageUrl,
      target_role: 'citizen'
    })
  });

  const result = await response.json();
  if (result.success) {
    console.log('Announcement created:', result.data);
  } else {
    console.error('Error:', result.error);
  }
};
```

#### Get Announcements (Citizen Portal)
```javascript
const getAnnouncements = async () => {
  const response = await fetch('/api/citizen/announcements?limit=5', {
    headers: {
      'Authorization': `Bearer ${token}` // Optional
    }
  });

  const result = await response.json();
  if (result.success) {
    displayAnnouncements(result.data);
  }
};
```

#### Update Announcement (Global Admin)
```javascript
const updateAnnouncement = async (id, updates) => {
  const response = await fetch(`/api/admin/global-admin/announcements/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });

  const result = await response.json();
  return result.success;
};
```

### React Hook Example
```javascript
import { useState, useEffect } from 'react';

const useAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const response = await fetch('/api/citizen/announcements');
      const result = await response.json();
      if (result.success) {
        setAnnouncements(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  return { announcements, loading, refetch: fetchAnnouncements };
};
```

---

## 🔒 Security Considerations

1. **Role-Based Access**: Endpoints automatically check user roles and bureau assignments
2. **Bureau Isolation**: Agency admins can only manage their own bureau's announcements
3. **Audit Logging**: All operations are logged in `admin_audit_logs` table
4. **Soft Deletes**: Announcements are deactivated, not permanently deleted
5. **Input Validation**: All inputs are validated server-side
6. **SQL Injection Protection**: All queries use parameterized statements

---

## 📊 Database Schema

```sql
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  image_url VARCHAR(500),
  bureau_id UUID REFERENCES bureaus(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES "user"(id),
  target_role VARCHAR(50) DEFAULT 'citizen',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_announcements_bureau_id ON announcements(bureau_id);
CREATE INDEX idx_announcements_is_active ON announcements(is_active);
CREATE INDEX idx_announcements_created_at ON announcements(created_at DESC);
```

---

## 🚀 Getting Started

1. **Database Migration**: Run the SQL to add new columns to existing `announcements` table
2. **Authentication**: Ensure your frontend handles Bearer token authentication
3. **Error Handling**: Implement proper error handling for all API calls
4. **Loading States**: Show loading indicators during API calls
5. **Offline Support**: Consider caching announcements for offline viewing

---

## 📞 Support

For questions about the Announcements API:

- Check the error messages for specific issues
- Verify authentication tokens are valid and have correct permissions
- Ensure bureau assignments are correct for agency admins
- Check server logs for detailed error information

## If you want bureau-specific announcements

The cleanest choice is to add a single column to `announcements`:

- `bureau_id UUID NULL`

Then use one table for both global and bureau-scoped news.

If a bureau announcement is created by an agency admin, save that admin's `bureau_id` into the record and protect it with route logic:

- agency admin can only manage announcements where `bureau_id = their bureau_id`
- global super admin can manage records with `bureau_id IS NULL` or all announcements

## Suggested Column Set for `announcements`

```sql
ALTER TABLE announcements
ADD COLUMN bureau_id UUID NULL,
ADD COLUMN is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN created_by UUID NULL,
ADD COLUMN updated_at TIMESTAMP NULL,
ADD COLUMN target_role TEXT NULL;
```

## Recommended Implementation Plan

1. Confirm the current `announcements` table schema in the database.
2. Add `bureau_id`, `is_active`, and `updated_at`.
3. Add new agency admin routes under `src/routes/agency-admin.ts`.
4. Add service methods to `src/services/agency.ts`:
   - `createAnnouncement`
   - `getBureauAnnouncements`
   - `updateAnnouncement`
   - `deleteAnnouncement`
5. Update `getSystemAnnouncements()` to return active global announcements and optionally bureau-specific records.
6. Add audit logging for announcement creation/updates/deletion.

## Summary Recommendation

- Use the existing `announcements` table.
- Extend it with `bureau_id` and `is_active` rather than creating a separate table.
- Build agency-admin CRUD endpoints for announcements.
- Keep citizen-facing announcement retrieval in place and extend it to support bureau filtering in the future.

This gives you a clean, reusable announcement model that works for both global and bureau-specific government communications.