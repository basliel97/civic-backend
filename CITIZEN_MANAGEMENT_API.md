# Citizen Management API Documentation

## Overview
Complete CRUD operations for citizen user management with audit tracking.

**Base URL:** `http://localhost:4000/api/admin`

**Authentication:** All endpoints require Bearer token in Authorization header

---

## Authentication & Authorization

### Required Headers
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

### Roles
- **Admin**: Can list, view, update, soft delete, activate/deactivate citizens
- **Super Admin**: Can do everything + restore deleted citizens + bulk operations

---

## Endpoints

### 1. Create Citizen (Admin Form)

**POST** `/citizens`

Create a new citizen directly from the admin dashboard (bypasses Fayda OTP flow).

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| fin | string | ✅ Yes | 12-digit FIN (e.g., "123456789012") |
| name | string | ✅ Yes | Full name of citizen |
| phone | string | ✅ Yes | Phone number (e.g., "+251912345678") |
| password | string | ✅ Yes | Initial password (min 8 chars) |
| email | string | ❌ No | Email address (optional) |
| dob | string | ❌ No | Date of birth (YYYY-MM-DD) |
| gender | string | ❌ No | "male", "female", or "other" |
| photo_url | string | ❌ No | Profile photo URL |

**Validation:**
- FIN must be exactly 12 digits
- FIN must be unique (not already registered)
- Phone number must be unique
- Email (if provided) must be unique

**Example Request:**
```bash
curl -X POST "http://localhost:4000/api/admin/citizens" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fin": "123456789012",
    "name": "Abebe Kebede",
    "phone": "+251911223344",
    "password": "AbebePass123!",
    "email": "abebe@example.com",
    "dob": "1990-05-15",
    "gender": "male"
  }'
```

**Example Response (Success):**
```json
{
  "success": true,
  "message": "Citizen created successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "123456789012",
    "name": "Abebe Kebede",
    "email": "abebe@example.com",
    "phone_number": "+251911223344",
    "status": "active",
    "created_at": "2026-02-19T15:30:00Z",
    "fin": "123456789012",
    "dob": "1990-05-15",
    "gender": "male",
    "photo_url": null
  }
}
```

**Error Responses:**

**409 - Duplicate FIN:**
```json
{
  "success": false,
  "error": "Citizen with this FIN already exists"
}
```

**409 - Duplicate Phone:**
```json
{
  "success": false,
  "error": "Citizen with this phone number already exists"
}
```

**409 - Duplicate Email:**
```json
{
  "success": false,
  "error": "Citizen with this email already exists"
}
```

**400 - Invalid FIN:**
```json
{
  "success": false,
  "error": "Invalid FIN. Must be 12 digits."
}
```

---

### 2. List Citizens (with Pagination & Filters)

**GET** `/citizens`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| search | string | "" | Search by FIN, name, email, phone |
| status | string | "all" | Filter by status: "active", "inactive", "all" |
| sortBy | string | "created_at" | Sort field: "created_at", "name", "username", "last_login_at" |
| sortOrder | string | "desc" | Sort order: "asc", "desc" |

**Example Request:**
```bash
curl -X GET "http://localhost:4000/api/admin/citizens?page=1&limit=20&search=123456&status=active" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "citizens": [
      {
        "id": "uuid",
        "username": "123456789012",
        "name": "John Doe",
        "email": "john@example.com",
        "phone_number": "+251912345678",
        "status": "active",
        "created_at": "2026-02-19T10:00:00Z",
        "updated_at": "2026-02-19T10:00:00Z",
        "last_login_at": "2026-02-19T12:00:00Z",
        "fin": "123456789012",
        "dob": "1990-01-01",
        "gender": "male",
        "photo_url": "https://..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

---

### 3. Get Single Citizen Details

**GET** `/citizens/:id`

**Example Request:**
```bash
curl -X GET "http://localhost:4000/api/admin/citizens/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "123456789012",
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "+251912345678",
    "status": "active",
    "created_at": "2026-02-19T10:00:00Z",
    "updated_at": "2026-02-19T10:00:00Z",
    "deleted_at": null,
    "last_login_at": "2026-02-19T12:00:00Z",
    "fin": "123456789012",
    "dob": "1990-01-01",
    "gender": "male",
    "photo_url": "https://...",
    "created_by": "admin-uuid",
    "updated_by": null,
    "deleted_by": null,
    "deletion_reason": null,
    "failed_login_attempts": 0,
    "locked_until": null,
    "created_by_name": "Admin User",
    "updated_by_name": null,
    "deleted_by_name": null
  }
}
```

---

### 4. Update Citizen Information

**PUT** `/citizens/:id`

**Request Body:**
```json
{
  "name": "New Name",
  "email": "newemail@example.com",
  "phone_number": "+251987654321",
  "dob": "1990-01-01",
  "gender": "male",
  "photo_url": "https://new-photo-url.com"
}
```

**Note:** Only provided fields will be updated. All fields are optional.

**Example Request:**
```bash
curl -X PUT "http://localhost:4000/api/admin/citizens/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "phone_number": "+251911223344"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "message": "Citizen updated successfully",
  "data": {
    "id": "uuid",
    "username": "123456789012",
    "name": "John Smith",
    "email": "john@example.com",
    "phone_number": "+251911223344",
    "updated_at": "2026-02-19T14:30:00Z"
  }
}
```

---

### 5. Soft Delete Citizen

**DELETE** `/citizens/:id`

**Request Body:**
```json
{
  "reason": "User requested account deletion"
}
```

**Example Request:**
```bash
curl -X DELETE "http://localhost:4000/api/admin/citizens/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Fraudulent activity detected"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "message": "Citizen deleted successfully",
  "data": {
    "id": "uuid",
    "username": "123456789012",
    "name": "John Doe"
  }
}
```

**Note:** This is a soft delete. The citizen data is preserved but marked as deleted.

---

### 6. Activate/Deactivate Citizen

**PATCH** `/citizens/:id/status`

**Request Body:**
```json
{
  "status": "inactive",
  "reason": "Suspicious activity"
}
```

**Status Values:**
- `"active"` - Citizen can login and use the system
- `"inactive"` - Citizen cannot login (soft suspension)

**Example Request:**
```bash
curl -X PATCH "http://localhost:4000/api/admin/citizens/123e4567-e89b-12d3-a456-426614174000/status" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "inactive"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "message": "Citizen deactivated successfully",
  "data": {
    "id": "uuid",
    "username": "123456789012",
    "name": "John Doe",
    "status": "inactive"
  }
}
```

---

### 7. Bulk Delete Citizens

**POST** `/citizens/bulk-delete`

**Request Body:**
```json
{
  "ids": ["uuid1", "uuid2", "uuid3"],
  "reason": "Bulk cleanup of inactive accounts"
}
```

**Authorization:** Admin or Super Admin

**Example Request:**
```bash
curl -X POST "http://localhost:4000/api/admin/citizens/bulk-delete" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": ["uuid1", "uuid2", "uuid3"],
    "reason": "Bulk cleanup"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "message": "3 citizens deleted successfully",
  "data": {
    "deletedCount": 3,
    "requestedCount": 3
  }
}
```

---

### 8. Bulk Activate/Deactivate Citizens

**POST** `/citizens/bulk-status`

**Request Body:**
```json
{
  "ids": ["uuid1", "uuid2", "uuid3"],
  "status": "active"
}
```

**Authorization:** Admin or Super Admin

**Example Request:**
```bash
curl -X POST "http://localhost:4000/api/admin/citizens/bulk-status" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": ["uuid1", "uuid2", "uuid3"],
    "status": "active"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "message": "3 citizens activated successfully",
  "data": {
    "updatedCount": 3,
    "requestedCount": 3
  }
}
```

---

### 9. Restore Deleted Citizen (Super Admin Only)

**POST** `/citizens/:id/restore`

**Authorization:** Super Admin only

**Example Request:**
```bash
curl -X POST "http://localhost:4000/api/admin/citizens/123e4567-e89b-12d3-a456-426614174000/restore" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Example Response:**
```json
{
  "success": true,
  "message": "Citizen restored successfully",
  "data": {
    "id": "uuid",
    "username": "123456789012",
    "name": "John Doe"
  }
}
```

---

### 10. Admin: Change Own Password

**POST** `/admin/change-password`

**Request Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:4000/api/admin/change-password" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "OldPass123!",
    "newPassword": "NewPass123!"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### 11. Admin: Reset Citizen Password

**POST** `/admin/reset-citizen-password`

**Request Body:**
```json
{
  "user_id": "citizen-uuid",
  "newPassword": "TempPass123!"
}
```

**Authorization:** Admin or Super Admin

**Example Request:**
```bash
curl -X POST "http://localhost:4000/api/admin/reset-citizen-password" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "newPassword": "NewTempPass123!"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "message": "Citizen password reset successfully"
}
```

---

## Citizen Status Flow

```
Active → Inactive → Deleted (Soft)
   ↓        ↓
Can      Cannot
login    login

Deleted citizens can be restored by Super Admin
```

---

## Audit Tracking

All operations are tracked with:
- **created_by**: Who created the citizen
- **updated_by**: Who last updated the citizen
- **deleted_by**: Who deleted the citizen
- **deletion_reason**: Why the citizen was deleted
- **created_at**: When created
- **updated_at**: When last updated
- **deleted_at**: When deleted (null if not deleted)
- **last_login_at**: When citizen last logged in

---

## Error Responses

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Authorization header required"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "Unauthorized: Super Admin only"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Citizen not found"
}
```

**500 Server Error:**
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Quick Reference

| Operation | Method | Endpoint | Auth Level |
|-----------|--------|----------|------------|
| **Create Citizen** | **POST** | **`/citizens`** | **Admin** |
| List Citizens | GET | `/citizens` | Admin |
| Get Citizen | GET | `/citizens/:id` | Admin |
| Update Citizen | PUT | `/citizens/:id` | Admin |
| Delete Citizen | DELETE | `/citizens/:id` | Admin |
| Change Status | PATCH | `/citizens/:id/status` | Admin |
| Bulk Delete | POST | `/citizens/bulk-delete` | Admin |
| Bulk Status | POST | `/citizens/bulk-status` | Admin |
| Restore Citizen | POST | `/citizens/:id/restore` | Super Admin |
| Change Own Password | POST | `/admin/change-password` | Admin |
| Reset Citizen Password | POST | `/admin/reset-citizen-password` | Admin |

---

**Status: READY FOR USE!** 🎉
