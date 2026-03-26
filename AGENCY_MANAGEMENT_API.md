# Agency Management API Documentation

## Overview

API endpoints for managing government agency staff accounts. This module implements a hierarchical admin structure with multi-tenant security.

**Base URL:** `http://localhost:4000/api/admin`

**Authentication:** All endpoints require Bearer token in Authorization header

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Global Super Admin Endpoints](#global-super-admin-endpoints)
3. [Agency Super Admin Endpoints](#agency-super-admin-endpoints)
4. [Security Model](#security-model)
5. [Testing Guide](#testing-guide)

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

## Quick Reference

| Operation | Method | Endpoint | Auth Level |
|-----------|--------|----------|------------|
| Create Agency Head | POST | `/agency/create-agency-head` | Global Super Admin |
| Create Staff | POST | `/agency/staff` | Agency Super Admin |
| List Staff | GET | `/agency/staff` | Agency Super Admin |
| Update Staff | PUT | `/agency/staff/:id` | Agency Super Admin |
| Suspend/Activate | PATCH | `/agency/staff/:id/status` | Agency Super Admin |
| Delete Staff | DELETE | `/agency/staff/:id` | Agency Super Admin |

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

---

**Status: READY FOR USE!**
