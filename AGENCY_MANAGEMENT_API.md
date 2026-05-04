# Agency Management API Documentation

## Overview

API endpoints for managing government agency operations and staff accounts. This module implements a hierarchical admin structure with multi-tenant security.

**Base URL:** `http://localhost:4000/api/admin`

**Authentication:** All endpoints require Bearer token in Authorization header

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Global Super Admin Endpoints](#global-super-admin-endpoints)
3. [Agency Super Admin Endpoints](#agency-super-admin-endpoints)
4. [Agency Admin Endpoints](#agency-admin-endpoints)
5. [Security Model](#security-model)
6. [Testing Guide](#testing-guide)
7. [Quick Reference](#quick-reference)
8. [Error Responses](#error-responses)

---

## Architecture Overview

### Admin Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    GLOBAL SUPER ADMIN                        │
│                      (No bureau_id)                          │
│                                                              │
│  • Creates Agency Heads for specific bureaus                │
│  • Can access all bureaus                                    │
│  • Highest level access                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Creates Agency Head
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 AGENCY SUPER ADMIN                           │
│                  (Has bureau_id)                             │
│                                                              │
│  • Manages staff within their bureau only                   │
│  • Cannot access other bureaus                               │
│  • Full CRUD on agency staff                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Creates Staff
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     AGENCY ADMIN                             │
│                  (Has bureau_id)                             │
│                                                              │
│  • Regular admin users                                       │
│  • Performs day-to-day operations                            │
│  • Bureau-specific access                                    │
└─────────────────────────────────────────────────────────────┘
```

### Roles

| Role | Description | Can Create |
|------|-------------|------------|
| `super_admin` (Global) | System-wide administrator | Agency Heads |
| `super_admin` (Agency) | Bureau-specific administrator | Agency Admins |
| `admin` | Standard administrator | - |
| `citizen` | Regular citizen user | - |

---

## Global Super Admin Endpoints

These endpoints are for the system-wide super admin who manages bureaus.

**Authentication:** Requires `super_admin` role with no `bureau_id` (Global Super Admin)

---

### 1. Create Agency Head

Creates a new agency head (super_admin) and assigns them to a specific bureau.

**POST** `/agency/create-agency-head`

**Headers:**
```
Authorization: Bearer GLOBAL_SUPER_ADMIN_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "agency.head@transport.gov.et",
  "password": "SecurePassword123",
  "name": "Agency Director",
  "bureauId": "bureau-uuid-here"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address for login |
| `password` | string | Yes | Initial password (min 8 chars) |
| `name` | string | Yes | Full name of the agency head |
| `bureauId` | string | Yes | UUID of the bureau to assign |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Agency Head created for Addis Ababa Traffic Management"
}
```

**Error Responses:**

**400 - Missing Fields:**
```json
{
  "success": false,
  "error": "Email, password, name, and bureauId are required"
}
```

**404 - Bureau Not Found:**
```json
{
  "success": false,
  "error": "Bureau not found"
}
```

---

## Agency Super Admin Endpoints

These endpoints are for agency heads (super_admin) to manage their bureau's staff.

**Authentication:** Requires `super_admin` role with a `bureau_id`

**Security:** All operations are automatically locked to the creator's bureau. An agency head can only manage staff within their own bureau.

---

### 2. Create Agency Staff

Creates a new admin user locked to the same bureau as the creator.

**POST** `/agency/staff`

**Headers:**
```
Authorization: Bearer AGENCY_SUPER_ADMIN_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "officer1@transport.gov.et",
  "password": "SecurePassword123",
  "name": "Officer Name"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address for login |
| `password` | string | Yes | Initial password (min 8 chars) |
| `name` | string | Yes | Full name of the staff member |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Staff account created"
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": "You do not belong to an agency"
}
```

**Note:** The new staff member is automatically assigned to the same bureau as the creator and gets the `admin` role.

---

### 3. List Agency Staff

Retrieves all admin and super_admin users for the agency.

**GET** `/agency/staff`

**Headers:**
```
Authorization: Bearer AGENCY_SUPER_ADMIN_TOKEN
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "user-uuid-1",
      "name": "Agency Director",
      "email": "director@transport.gov.et",
      "role": "super_admin",
      "status": "active",
      "created_at": "2026-01-15T10:00:00Z",
      "last_login_at": "2026-03-26T08:30:00Z"
    },
    {
      "id": "user-uuid-2",
      "name": "Officer Name",
      "email": "officer@transport.gov.et",
      "role": "admin",
      "status": "active",
      "created_at": "2026-02-01T14:00:00Z",
      "last_login_at": "2026-03-25T16:45:00Z"
    }
  ]
}
```

---

### 4. Update Staff Details

Updates a staff member's name or role.

**PUT** `/agency/staff/:id`

**Headers:**
```
Authorization: Bearer AGENCY_SUPER_ADMIN_TOKEN
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Staff member's user ID |

**Request Body:**
```json
{
  "name": "Updated Name",
  "role": "super_admin"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | New name |
| `role` | string | No | New role (`admin` or `super_admin`) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Staff updated successfully",
  "data": {
    "id": "user-uuid",
    "name": "Updated Name",
    "email": "officer@transport.gov.et",
    "role": "super_admin",
    "status": "active"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Staff member not found in your agency"
}
```

**Note:** Security check ensures you can only update staff members who belong to your bureau.

---

### 5. Suspend/Activate Staff

Changes a staff member's status to active or inactive.

**PATCH** `/agency/staff/:id/status`

**Headers:**
```
Authorization: Bearer AGENCY_SUPER_ADMIN_TOKEN
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Staff member's user ID |

**Request Body:**
```json
{
  "status": "inactive"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | `active` or `inactive` |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Staff member marked as inactive",
  "data": {
    "id": "user-uuid",
    "name": "Officer Name",
    "status": "inactive"
  }
}
```

**Error Response (400 - Self Suspension):**
```json
{
  "success": false,
  "error": "You cannot suspend your own account"
}
```

---

### 6. Delete Staff (Soft Delete)

Soft-deletes a staff member by marking them as deleted.

**DELETE** `/agency/staff/:id`

**Headers:**
```
Authorization: Bearer AGENCY_SUPER_ADMIN_TOKEN
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Staff member's user ID |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Staff member removed successfully"
}
```

**Error Response (400 - Self Delete):**
```json
{
  "success": false,
  "error": "You cannot delete your own account"
}
```

**Note:** This is a soft delete. The user record is preserved with `deleted_at` timestamp. Staff cannot delete their own accounts.

---

## Agency Admin Endpoints

These endpoints are for agency staff (super_admin and admin) to manage their bureau's day-to-day operations.

**Authentication:** Requires `admin` or `super_admin` role with a `bureau_id`

---

### 7. Get Dashboard Statistics

Retrieves dashboard statistics for the agency's bureau.

**GET** `/stats`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalApplications": 150,
    "pendingApplications": 45,
    "approvedApplications": 95,
    "rejectedApplications": 10,
    "totalServices": 8,
    "totalStaff": 12
  }
}
```

---

### 8. Service Management

#### List All Services

Retrieves all active services configured for the bureau.

**GET** `/services`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "service-uuid-1",
      "service_name": "Driver License Renewal",
      "service_description": "Renew existing driver license",
      "base_fee": 500,
      "required_docs": ["ID", "Medical Certificate"],
      "is_active": true,
      "bureau_id": "bureau-uuid",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

#### Create New Service

Creates a new service for the bureau.

**POST** `/services`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Driver License Renewal",
  "description": "Renew existing driver license",
  "fee": 500,
  "docs": ["ID", "Medical Certificate"],
  "isActive": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Service name |
| `description` | string | No | Service description |
| `fee` | number | No | Base fee for the service |
| `docs` | array | No | List of required documents |
| `isActive` | boolean | No | Whether service is active (default: true) |

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "new-service-uuid",
    "service_name": "Driver License Renewal",
    "bureau_id": "bureau-uuid",
    "base_fee": 500,
    "is_active": true
  }
}
```

#### Update Service

Updates an existing service's details.

**PUT** `/services/:id`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Service ID |

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Service Name",
  "description": "Updated description",
  "fee": 750,
  "docs": ["ID", "Proof of Residence"],
  "isActive": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "service-uuid",
    "service_name": "Updated Service Name",
    "base_fee": 750,
    "is_active": false
  }
}
```

#### Delete Service (Soft Delete)

Deactivates a service (soft delete).

**DELETE** `/services/:id`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Service deactivated successfully",
  "data": {
    "id": "service-uuid",
    "is_active": false
  }
}
```

---

### 9. Staff Management

#### List Bureau Staff

Retrieves all staff members (admins and super_admins) assigned to the bureau.

**GET** `/staff`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "user-uuid-1",
      "name": "Agency Director",
      "email": "director@transport.gov.et",
      "role": "super_admin",
      "status": "active",
      "created_at": "2026-01-15T10:00:00Z",
      "last_login_at": "2026-03-26T08:30:00Z"
    }
  ]
}
```

**Note:** Full staff CRUD (Create, Update, Suspend, Delete) is available to Agency Super Admins via the Agency Management endpoints (`/api/admin/agency/*`).

---

### 10. Application Management

#### List All Applications

Retrieves all applications for the bureau with optional filtering.

**GET** `/applications`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (e.g., `pending`, `paid`, `approved`, `rejected`) |
| `serviceId` | string | Filter by service UUID |

**Response (200 OK):**
```json
{
  "success": true,
  "count": 45,
  "data": [
    {
      "id": "app-uuid-1",
      "citizenId": "citizen-uuid",
      "serviceId": "service-uuid",
      "application_status": "pending",
      "createdAt": "2026-03-26T10:00:00Z"
    }
  ]
}
```

#### Update Application

Update editable fields of an application (non-status fields or status separately).

**PATCH** `/applications/:id`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Application ID |

**Request Body:** (any combination of allowed fields)
```json
{
  "admin_notes": "Documents verified",
  "delivery_tracking_number": "TRACK123456",
  "delivery_method": "postal",
  "assigned_admin_id": "admin-uuid",
  "application_status": "under_review"
}
```

**Allowed Fields:**
- `admin_notes` – Internal notes
- `delivery_tracking_number` – Tracking number for delivery
- `delivery_method` – `pickup` or `postal`
- `assigned_admin_id` – Reassign to another admin
- `application_status` – Change status (also logged in audit)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "app-uuid",
    "application_status": "under_review",
    "admin_notes": "Documents verified",
    "updated_at": "2026-03-26T12:00:00Z"
  }
}
```

#### Bulk Update Application Status

Update status for multiple applications in one request.

**POST** `/applications/bulk-status`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "applicationIds": ["app-uuid-1", "app-uuid-2"],
  "status": "approved",
  "notes": "Bulk approval after document verification"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `applicationIds` | array | Yes | Array of application UUIDs |
| `status` | string | Yes | New status value |
| `notes` | string | No | Audit note |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "2 applications updated",
  "data": [
    { "id": "app-uuid-1", "application_status": "approved" },
    { "id": "app-uuid-2", "application_status": "approved" }
  ]
}
```

#### Review Application

Approve or reject an application; may issue license if applicable.

**POST** `/review/:id`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
Content-Type: application/json
```

**Path Parameters:** `id` – Application UUID

**Request Body:**
```json
{
  "status": "approved",
  "notes": "All requirements met",
  "issueLicense": true,
  "licenseType": "full",
  "validityPeriod": 365
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | `approved`, `rejected`, or `requires_correction` |
| `notes` | string | No | Review notes |
| `issueLicense` | boolean | Conditional | Set `true` to issue license on approval |
| `licenseType` | string | Conditional | License type (e.g., `full`, `provisional`) |
| `validityPeriod` | number | Conditional | Validity in days |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Review updated",
  "data": {
    "applicationId": "app-uuid",
    "status": "approved",
    "reviewedBy": "admin-uuid",
    "reviewedAt": "2026-03-26T10:30:00Z",
    "license": {
      "id": "license-uuid",
      "type": "full",
      "validUntil": "2027-03-26T00:00:00Z"
    }
  }
}
```

#### Cancel/Delete Application

Soft-deletes (cancels) an application.

**DELETE** `/applications/:id`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Duplicate application"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Application cancelled",
  "data": {
    "id": "app-uuid",
    "application_status": "cancelled",
    "cancelledAt": "2026-03-26T10:30:00Z"
  }
}
```

---

### 11. Communication System

#### Add Comment

**POST** `/:id/comments`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
Content-Type: application/json
```

**Path Parameters:** `id` – Application UUID

**Request Body:**
```json
{
  "text": "Please provide additional documents."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "applicationId": "app-uuid",
    "authorId": "admin-uuid",
    "authorRole": "admin",
    "comment_text": "Please provide additional documents.",
    "createdAt": "2026-03-26T11:00:00Z"
  }
}
```

#### View Comments

**GET** `/:id/comments`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "comment-uuid",
      "comment_text": "I need help",
      "authorRole": "citizen",
      "createdAt": "2026-03-25T14:00:00Z"
    },
    {
      "id": "comment-uuid-2",
      "comment_text": "We are reviewing",
      "authorRole": "admin",
      "createdAt": "2026-03-26T09:30:00Z"
    }
  ]
}
```

#### Update Comment

Admin can edit their own comment.

**PUT** `/comments/:commentId`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
Content-Type: application/json
```

**Path Parameters:** `commentId` – Comment UUID

**Request Body:**
```json
{
  "text": "Updated comment text"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "comment_text": "Updated comment text",
    "updated_at": "2026-03-26T12:05:00Z"
  }
}
```

#### Delete Comment

Admin can delete their own comment.

**DELETE** `/comments/:commentId`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Comment deleted successfully"
}
```

---

### 12. Audit Logs

Retrieve audit logs for the bureau, including application status changes and admin actions (staff changes, service updates, etc.).

**GET** `/audit-logs`

**Headers:**
```
Authorization: Bearer AGENCY_ADMIN_TOKEN
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max records to return (default: 50) |
| `offset` | number | Pagination offset (default: 0) |

**Response (200 OK):**
```json
{
  "success": true,
  "count": 100,
  "data": [
    {
      "id": "log-uuid-1",
      "log_type": "application",
      "action": "status_change",
      "changed_by": "admin-uuid",
      "admin_name": "Officer Kebede",
      "old_status": "pending",
      "new_status": "approved",
      "action_notes": "Documents verified",
      "created_at": "2026-03-26T10:30:00Z"
    },
    {
      "id": "log-uuid-2",
      "log_type": "admin_action",
      "action": "update_service",
      "entity_type": "bureau_service",
      "entity_id": "service-uuid",
      "changed_by": "admin-uuid",
      "admin_name": "Officer Alem",
      "new_values": { "base_fee": 600 },
      "created_at": "2026-03-26T09:15:00Z"
    }
  ]
}
```

---

## Security Model

### Bureau Isolation

The agency management system enforces strict bureau isolation:

1. **Agency Head (Super Admin):** Can only manage staff within their assigned bureau
2. **Automatic Bureau Locking:** All CRUD operations automatically filter by `bureau_id`
3. **Cross-Bureau Prevention:** An agency head cannot:
   - View staff from other bureaus
   - Modify users from other bureaus
   - Create users assigned to different bureaus

### Self-Protection

- Cannot suspend your own account
- Cannot delete your own account
- Prevents accidental lockout

### Multi-Tenancy Test

To verify multi-tenancy security:

1. Create two agency heads for different bureaus
2. Have Agency Head A try to access Agency Head B's staff
3. Result: **403 Forbidden** - Bureau isolation works

---

## Testing Guide

### Setup

1. **Create a Global Super Admin:**
   - Go to Supabase Table Editor
   - Find a user and set:
     - `role` = `super_admin`
     - `bureau_id` = `null` (empty)

2. **Create a Bureau:**
   - Use the bureaus table or POST `/api/admin/bureaus`

### Test Flow

```bash
# 1. Login as Global Super Admin
curl -X POST http://localhost:4000/api/citizen/login \
  -H "Content-Type: application/json" \
  -d '{"loginInput": "global-admin-fin", "password": "Password123"}'

# Save the token from response

# 2. Create an Agency Head
curl -X POST http://localhost:4000/api/admin/agency/create-agency-head \
  -H "Authorization: Bearer GLOBAL_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "agency.head@transport.gov.et",
    "password": "SecurePass123",
    "name": "Agency Director",
    "bureauId": "bureau-uuid"
  }'

# 3. Login as Agency Head
curl -X POST http://localhost:4000/api/citizen/login \
  -H "Content-Type: application/json" \
  -d '{"loginInput": "agency.head@transport.gov.et", "password": "SecurePass123"}'

# 4. Create Agency Staff
curl -X POST http://localhost:4000/api/admin/agency/staff \
  -H "Authorization: Bearer AGENCY_HEAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "officer@transport.gov.et",
    "password": "OfficerPass123",
    "name": "Officer Name"
  }'

# 5. List Staff
curl -X GET http://localhost:4000/api/admin/agency/staff \
  -H "Authorization: Bearer AGENCY_HEAD_TOKEN"

# 6. Update Staff
curl -X PUT http://localhost:4000/api/admin/agency/staff/STAFF_UUID \
  -H "Authorization: Bearer AGENCY_HEAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'

# 7. Suspend Staff
curl -X PATCH http://localhost:4000/api/admin/agency/staff/STAFF_UUID/status \
  -H "Authorization: Bearer AGENCY_HEAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'

# 8. Delete Staff
curl -X DELETE http://localhost:4000/api/admin/agency/staff/STAFF_UUID \
  -H "Authorization: Bearer AGENCY_HEAD_TOKEN"
```

### Security Tests

```bash
# Test 1: Try to access with wrong bureau (should fail)
# Create Agency Head for Bureau A, then try to manage Bureau B staff
curl -X GET http://localhost:4000/api/admin/agency/staff \
  -H "Authorization: Bearer BUREAU_A_HEAD_TOKEN"
# Should return: Staff from Bureau A only

# Test 2: Try to suspend yourself (should fail)
curl -X PATCH http://localhost:4000/api/admin/agency/staff/MY_OWN_UUID/status \
  -H "Authorization: Bearer MY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'
# Should return: "You cannot suspend your own account"

# Test 3: Try to delete yourself (should fail)
curl -X DELETE http://localhost:4000/api/admin/agency/staff/MY_OWN_UUID \
  -H "Authorization: Bearer MY_TOKEN"
# Should return: "You cannot delete your own account"
```

---

### Agency Admin Tests

```bash
# Test Flow: Agency Admin Endpoints

# 1. Login as Agency Admin (or Agency Head)
curl -X POST http://localhost:4000/api/citizen/login \
  -H "Content-Type: application/json" \
  -d '{"loginInput": "officer@transport.gov.et", "password": "OfficerPass123"}'

# Save the token from response
TOKEN=AGENCY_ADMIN_TOKEN

# 2. Get Dashboard Statistics
curl -X GET http://localhost:4000/api/admin/stats \
  -H "Authorization: Bearer $TOKEN"

# 3. List Services
curl -X GET http://localhost:4000/api/admin/services \
  -H "Authorization: Bearer $TOKEN"

# 4. Create a New Service
curl -X POST http://localhost:4000/api/admin/services \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Driver License Renewal",
    "description": "Renew existing driver license",
    "fee": 500
  }'

# 5. Update a Service
curl -X PUT http://localhost:4000/api/admin/services/SERVICE_UUID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fee": 750, "description": "Updated description"}'

# 6. Delete a Service (soft delete)
curl -X DELETE http://localhost:4000/api/admin/services/SERVICE_UUID \
  -H "Authorization: Bearer $TOKEN"

# 7. List Bureau Staff
curl -X GET http://localhost:4000/api/admin/staff \
  -H "Authorization: Bearer $TOKEN"

# 8. List All Applications
curl -X GET "http://localhost:4000/api/admin/applications?status=pending&serviceId=SERVICE_UUID" \
  -H "Authorization: Bearer $TOKEN"

# 9. Update Application (edit notes, tracking, etc.)
curl -X PATCH http://localhost:4000/api/admin/applications/APPLICATION_UUID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "admin_notes": "Documents verified",
    "delivery_tracking_number": "TRACK123456"
  }'

# 10. Bulk Update Application Status
curl -X POST http://localhost:4000/api/admin/applications/bulk-status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "applicationIds": ["app-uuid-1", "app-uuid-2"],
    "status": "approved",
    "notes": "Bulk approval after verification"
  }'

# 11. Review and Approve an Application (with license issuance)
curl -X POST http://localhost:4000/api/admin/review/APPLICATION_UUID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "notes": "All documents verified successfully",
    "issueLicense": true,
    "licenseType": "full",
    "validityPeriod": 365
  }'

# 12. Cancel an Application
curl -X DELETE http://localhost:4000/api/admin/applications/APPLICATION_UUID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Duplicate application"}'

# 13. Add a Comment to Application
curl -X POST http://localhost:4000/api/admin/APPLICATION_UUID/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "We are reviewing your application"}'

# 14. View Comments
curl -X GET http://localhost:4000/api/admin/APPLICATION_UUID/comments \
  -H "Authorization: Bearer $TOKEN"

# 15. Update Own Comment
curl -X PUT http://localhost:4000/api/admin/comments/COMMENT_UUID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Updated comment text"}'

# 16. Delete Own Comment
curl -X DELETE http://localhost:4000/api/admin/comments/COMMENT_UUID \
  -H "Authorization: Bearer $TOKEN"

# 17. Get Audit Logs
curl -X GET "http://localhost:4000/api/admin/audit-logs?limit=50&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Quick Reference

### Global Super Admin Endpoints

| Operation | Method | Endpoint | Auth Level |
|-----------|--------|----------|------------|
| Create Agency Head | POST | `/agency/create-agency-head` | Global Super Admin |
| Get Bureau Admins | GET | `/bureaus/admins` | Global Super Admin |
| Get Bureau Admins (specific) | GET | `/bureaus/:bureauId/admins` | Global Super Admin |
| Update Bureau SuperAdmin | PUT | `/bureaus/:bureauId/superadmins/:id` | Global Super Admin |
| Delete Bureau SuperAdmin | DELETE | `/bureaus/:bureauId/superadmins/:id` | Global Super Admin |

### Agency Super Admin Endpoints

| Operation | Method | Endpoint | Auth Level |
|-----------|--------|----------|------------|
| Create Staff | POST | `/agency/staff` | Agency Super Admin |
| List Staff | GET | `/agency/staff` | Agency Super Admin |
| Update Staff | PUT | `/agency/staff/:id` | Agency Super Admin |
| Suspend/Activate Staff | PATCH | `/agency/staff/:id/status` | Agency Super Admin |
| Delete Staff (Soft) | DELETE | `/agency/staff/:id` | Agency Super Admin |

### Agency Admin Endpoints

| Operation | Method | Endpoint | Auth Level |
|-----------|--------|----------|------------|
| Get Dashboard Stats | GET | `/stats` | Agency Admin |
| List Services | GET | `/services` | Agency Admin |
| Create Service | POST | `/services` | Agency Admin |
| Update Service | PUT | `/services/:id` | Agency Admin |
| Delete Service | DELETE | `/services/:id` | Agency Admin |
| List Bureau Staff | GET | `/staff` | Agency Admin |
| List All Applications | GET | `/applications` | Agency Admin |
| Update Application | PATCH | `/applications/:id` | Agency Admin |
| Bulk Update Applications | POST | `/applications/bulk-status` | Agency Admin |
| Review Application | POST | `/review/:id` | Agency Admin |
| Cancel Application | DELETE | `/applications/:id` | Agency Admin |
| Add Comment | POST | `/:id/comments` | Agency Admin |
| View Comments | GET | `/:id/comments` | Agency Admin |
| Update Comment | PUT | `/comments/:commentId` | Agency Admin |
| Delete Comment | DELETE | `/comments/:commentId` | Agency Admin |
| Get Audit Logs | GET | `/audit-logs` | Agency Admin |

---

## Error Responses

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Authorization header required"
}
```

**403 Forbidden (Wrong Role):**
```json
{
  "success": false,
  "error": "Unauthorized: Super Admin only"
}
```

**403 Forbidden (Wrong Bureau):**
```json
{
  "success": false,
  "error": "Forbidden: This dashboard is only for [Bureau Name] staff."
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Staff member not found"
}
```

**400 Validation Errors (Service):**
```json
{
  "success": false,
  "error": "No fields to update"
}
```

**400 Validation Errors (Bulk Update):**
```json
{
  "success": false,
  "error": "applicationIds array is required"
}
```

**404 Comment Errors:**
```json
{
  "success": false,
  "error": "Comment not found or you do not have permission to edit it"
}
```

---

## Change Log

- **v2.0** - Removed service-specific application tabs (renewals, verifications, etc.). Replaced with unified `/applications` endpoint with filtering capabilities.
- **v2.0** - Added complete Service CRUD (GET, POST, PUT, DELETE).
- **v2.0** - Added Application PATCH endpoint for partial updates.
- **v2.0** - Added Bulk Update Application Status endpoint.
- **v2.0** - Added Comment Edit & Delete endpoints (admin-owned only).
- **v2.0** - Added Audit Logs endpoint for compliance and tracking.
- **v2.0** - Implemented comprehensive audit logging across all admin actions (staff, services, applications, comments).
- **v1.0** - Initial agency management system.

---

**Status: READY FOR USE!**
