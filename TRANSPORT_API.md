# Transport Agency API Documentation

**Version:** 2.1.0 (G-Cloud Multi-Tenant Architecture)
**Base URL:** `http://localhost:4000/api`

---

## 📋 Table of Contents

- [Service Types (Slugs)](#service-types-slugs)
- [Citizen Endpoints (Mobile App)](#citizen-endpoints-mobile-app)
- [Agency Admin Endpoints (Web Dashboard)](#agency-admin-endpoints-web-dashboard)
- [Chat System](#chat-system)
- [Testing Guide](#testing-guide)

---

## Service Types (Slugs)

When applying, the `serviceType` must be one of these strings:

| Slug | Service Name |
|------|--------------|
| `renewal` | Driver's license renewal |
| `verification_international` | International verification |
| `replacement` | Replacement license |
| `file_transfer` | Record transfer to regions |
| `specialty_training` | Specialty training info |
| `taxi_competency` | Taxi driver certificate |
| `rescheduling` | Theory test rescheduling |
| `lifting_suspension` | Remove license suspension |
| `info_request` | Driver info request |

---

## 📱 Citizen Endpoints (Mobile App)

**Requires Header:** `Authorization: Bearer <citizen_token>`

### 1. Verify External Record

Cross-checks Medical or Police records against the citizen's National ID (FIN).

- **Endpoint:** `POST /api/transport/verify-record`
- **Auth:** Citizen token required

**Request Body:**
```json
{
  "recordType": "medical",
  "referenceNumber": "MED-2026-001"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "record_type": "medical",
    "reference_number": "MED-2026-001",
    "citizen_fin": "123456789012",
    "result_data": { ... },
    "created_at": "..."
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Record not found or does not match your FIN"
}
```

---

### 2. Submit Application

Submits a new transport service application with multiple document support.

- **Endpoint:** `POST /api/transport/apply`
- **Auth:** Citizen token required

**Request Body:**
```json
{
  "serviceType": "renewal",
  "deliveryMethod": "pickup",
  "externalReferences": {
    "medical_ref": "MED-2026-001",
    "police_ref": "POL-2026-001"
  },
  "documents": [
    "https://supabase.storage.../photo.jpg",
    "https://supabase.storage.../id_scan.pdf"
  ]
}
```

**Parameters:**
- `serviceType` (required): One of the service type slugs
- `deliveryMethod` (optional): `"pickup"` or `"postal"` (defaults to `"pickup"`)
- `externalReferences` (optional): Object containing reference numbers for external records
- `documents` (optional): Array of document URLs

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Application submitted",
  "data": {
    "id": "app-uuid-123",
    "user_id": "user-uuid",
    "service_type": "renewal",
    "delivery_method": "pickup",
    "application_status": "submitted",
    "payment_status": "pending",
    "delivery_status": "pending",
    "documents": ["url1", "url2"],
    "external_references": { ... },
    "created_at": "..."
  }
}
```

---

### 3. Process Mock Payment

Simulates Telebirr/CBE Birr payment for an application.

- **Endpoint:** `POST /api/transport/pay/:id`
- **Auth:** Citizen token required
- **URL Parameters:**
  - `id`: Application ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Payment confirmed",
  "data": {
    "id": "app-uuid-123",
    "payment_status": "paid",
    "payment_reference": "PAY-ABC1234",
    "updated_at": "..."
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Application is already paid"
}
```

---

### 4. My Applications

Retrieves all applications submitted by the authenticated citizen.

- **Endpoint:** `GET /api/transport/my-applications`
- **Auth:** Citizen token required

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "app-uuid-123",
      "service_type": "renewal",
      "application_status": "approved",
      "payment_status": "paid",
      "delivery_status": "pending",
      "created_at": "..."
    }
  ]
}
```

---

### 5. My Digital License

Retrieves the active digital driver's license for the citizen.

- **Endpoint:** `GET /api/transport/my-license`
- **Auth:** Citizen token required

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "license-uuid",
    "user_id": "user-uuid",
    "license_number": "DL-1234567",
    "categories": ["Automobile (Grade 1)"],
    "issue_date": "2026-01-15",
    "expiry_date": "2028-01-15",
    "status": "active"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "No active license found"
}
```

---

## 🏛️ Agency Admin Endpoints (Web Dashboard)

**Requires Header:** `Authorization: Bearer <admin_token>`

**Security:** Admins must belong to the "Addis Ababa Traffic Management" bureau.

---

### Dashboard Stats

Retrieves aggregated statistics for the transport agency dashboard.

- **Endpoint:** `GET /api/admin/transport/stats`
- **Auth:** Admin token (Traffic Management bureau)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "total_apps": 150,
    "awaiting_payment": 23,
    "awaiting_review": 45,
    "total_approved": 82,
    "unique_citizens": 120,
    "revenue": 68500
  }
}
```

---

### Service & Staff Management

#### Get Agency Services

Retrieves all active services for the bureau.

- **Endpoint:** `GET /api/admin/transport/services`
- **Auth:** Admin token (Traffic Management bureau)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "service-uuid",
      "bureau_id": "bureau-uuid",
      "service_name": "License Renewal",
      "service_description": "Renew your driver's license",
      "base_fee": 500,
      "required_docs": ["photo", "medical_report"],
      "is_active": true
    }
  ]
}
```

#### Create Agency Service

Creates a new service for the bureau.

- **Endpoint:** `POST /api/admin/transport/services`
- **Auth:** Admin token (Traffic Management bureau)

**Request Body:**
```json
{
  "name": "New Service",
  "description": "Service description",
  "fee": 500,
  "docs": ["required_doc1", "required_doc2"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "service-uuid",
    "bureau_id": "bureau-uuid",
    "service_name": "New Service",
    ...
  }
}
```

#### Get Agency Staff

Retrieves all admin staff for the bureau.

- **Endpoint:** `GET /api/admin/transport/staff`
- **Auth:** Admin token (Traffic Management bureau)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "user-uuid",
      "name": "Officer Name",
      "email": "officer@transport.gov.et",
      "role": "admin",
      "last_login_at": "2026-03-25T10:30:00Z"
    }
  ]
}
```

---

### Service-Specific Application Tabs

All endpoints support an optional `status` query parameter to filter applications.

| Status Values | Description |
|---------------|-------------|
| `submitted` | Application submitted, awaiting payment |
| `pending_payment` | Payment pending |
| `paid` | Paid, awaiting review |
| `approved` | Approved by admin |
| `rejected` | Rejected by admin |
| `cancelled` | Cancelled by admin or citizen |

#### Get Renewals

- **Endpoint:** `GET /api/admin/transport/renewals?status=paid`

#### Get Verifications

- **Endpoint:** `GET /api/admin/transport/verifications?status=paid`

#### Get Replacements

- **Endpoint:** `GET /api/admin/transport/replacements?status=paid`

#### Get Transfers

- **Endpoint:** `GET /api/admin/transport/transfers?status=paid`

#### Get Specialty Training

- **Endpoint:** `GET /api/admin/transport/specialty-training?status=paid`

#### Get Taxi Competency

- **Endpoint:** `GET /api/admin/transport/taxi-competency?status=paid`

#### Get Rescheduling

- **Endpoint:** `GET /api/admin/transport/rescheduling?status=paid`

#### Get Lifting Suspensions

- **Endpoint:** `GET /api/admin/transport/lifting-suspensions?status=paid`

#### Get Info Requests

- **Endpoint:** `GET /api/admin/transport/info-requests?status=paid`

**Response (200 OK) - All Service Tabs:**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "id": "app-uuid",
      "user_id": "user-uuid",
      "service_type": "renewal",
      "application_status": "paid",
      "payment_status": "paid",
      "delivery_status": "pending",
      "citizen_name": "John Doe",
      "citizen_fin": "123456789012",
      "documents": [...],
      "created_at": "..."
    }
  ]
}
```

---

### Review Application (Approve/Reject)

Unified review endpoint that handles application status, delivery status, and notes.

- **Endpoint:** `POST /api/admin/transport/review/:id`
- **Auth:** Admin token (Traffic Management bureau)

**Request Body:**
```json
{
  "appStatus": "approved",
  "deliveryStatus": "shipped",
  "notes": "Medical and Police checks passed.",
  "tracking": "TRK-2026-001"
}
```

**Parameters:**
- `appStatus` (optional): `approved`, `rejected`, or other status
- `deliveryStatus` (optional): `pending`, `shipped`, `delivered`
- `notes` (optional): Admin notes about the decision
- `tracking` (optional): Tracking number for postal delivery

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Review updated",
  "data": {
    "id": "app-uuid",
    "application_status": "approved",
    "delivery_status": "shipped",
    "admin_notes": "Medical and Police checks passed.",
    "delivery_tracking_number": "TRK-2026-001",
    "assigned_admin_id": "admin-uuid",
    "updated_at": "..."
  }
}
```

**Note:** When `appStatus` is set to `"approved"`, the system automatically issues a digital driver's license to the citizen.

---

### Cancel Application (Delete)

Soft-deletes an application by changing its status to cancelled.

- **Endpoint:** `DELETE /api/admin/transport/cancel/:id`
- **Auth:** Admin token (Traffic Management bureau)

**Request Body:**
```json
{
  "reason": "Fraudulent documents detected"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Application cancelled",
  "data": {
    "id": "app-uuid",
    "status": "cancelled",
    "admin_notes": "Fraudulent documents detected",
    "updated_at": "..."
  }
}
```

---

## 💬 Chat System

Both citizens and admins can communicate through application-specific comments.

**Note:** All chat messages are automatically sanitized to prevent XSS attacks. HTML tags are stripped from message content before storage.

### Citizen Chat Endpoints

#### Post a Comment (Citizen)

- **Endpoint:** `POST /api/transport/:id/comments`
- **Auth:** Citizen token required

**Request Body:**
```json
{
  "text": "I have uploaded the additional documents you requested."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "application_id": "app-uuid",
    "author_id": "user-uuid",
    "author_role": "citizen",
    "comment_text": "I have uploaded the additional documents you requested.",
    "created_at": "..."
  }
}
```

#### Get Chat History (Citizen)

- **Endpoint:** `GET /api/transport/:id/comments`
- **Auth:** Citizen token required

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "comment-uuid",
      "application_id": "app-uuid",
      "author_id": "user-uuid",
      "author_role": "citizen",
      "comment_text": "Hello, I have a question...",
      "created_at": "...",
      "author_name": "John Doe",
      "author_image": "https://..."
    },
    {
      "id": "comment-uuid-2",
      "application_id": "app-uuid",
      "author_id": "admin-uuid",
      "author_role": "admin",
      "comment_text": "Please upload your medical report.",
      "created_at": "...",
      "author_name": "Officer Smith",
      "author_image": "https://..."
    }
  ]
}
```

---

### Admin Chat Endpoints

#### Reply to Citizen (Admin)

- **Endpoint:** `POST /api/admin/transport/:id/comments`
- **Auth:** Admin token (Traffic Management bureau)

**Request Body:**
```json
{
  "text": "Your application has been approved. Your license will be ready for pickup."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "comment-uuid",
    "application_id": "app-uuid",
    "author_id": "admin-uuid",
    "author_role": "admin",
    "comment_text": "Your application has been approved...",
    "created_at": "..."
  }
}
```

#### View Chat History (Admin)

- **Endpoint:** `GET /api/admin/transport/:id/comments`
- **Auth:** Admin token (Traffic Management bureau)

**Response (200 OK):** Same as Citizen Chat History response.

---

## 🔑 Agency Management (Super Admin)

### Create Agency Staff

Creates a new admin user locked to the same bureau as the creator.

- **Endpoint:** `POST /api/admin/agency/create-staff`
- **Auth:** Agency Super Admin token

**Request Body:**
```json
{
  "email": "officer1@transport.gov.et",
  "password": "SecurePassword123",
  "name": "Officer Name"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Staff created successfully",
  "data": {
    "id": "user-uuid",
    "email": "officer1@transport.gov.et",
    "name": "Officer Name",
    "role": "admin",
    "bureau_id": "bureau-uuid"
  }
}
```

**Note:** The new staff member is automatically assigned to the same bureau as the creator.

---

## Testing Guide

### Step 1: Prepare the Test Data

Ensure you have a record in your `external_agency_records` table for your test FIN:
- **FIN:** `123456789012`
- **Medical Ref:** `MED-2026-001`
- **Police Ref:** `POL-2026-001`

### Step 2: Test the Citizen Flow

1. **Login as Citizen:** Call `POST /api/citizen/login` using FIN `123456789012`. Copy the `token`.
2. **Verify Record:** Call `POST /api/transport/verify-record` with the token and Medical Ref. It should return the record.
3. **Apply:** Call `POST /api/transport/apply` with `serviceType: "renewal"`. Copy the `id` from response.
4. **Pay:** Call `POST /api/transport/pay/:id`. Status should change to `paid`.
5. **Check Applications:** Call `GET /api/transport/my-applications` to see your application.
6. **Send Comment:** Call `POST /api/transport/:id/comments` with a message.
7. **Get Comments:** Call `GET /api/transport/:id/comments` to view chat history.

### Step 3: Test the Admin Flow

1. **Create an Admin:** Go to Supabase Table Editor, find your user, and change:
   - `role` → `admin`
   - `bureau_id` → Select "Addis Ababa Traffic Management" bureau ID
2. **Login as Admin:** Log in with that user's credentials to get an Admin Token.
3. **Check Dashboard:** Call `GET /api/admin/transport/stats` to see statistics.
4. **Check Services:** Call `GET /api/admin/transport/services` to view agency services.
5. **Check Staff:** Call `GET /api/admin/transport/staff` to view bureau staff.
6. **Check Tabs:** Call `GET /api/admin/transport/renewals` to see submitted applications.
7. **Filter by Status:** Call `GET /api/admin/transport/renewals?status=paid` to filter.
8. **Reply to Comment:** Call `POST /api/admin/transport/:id/comments` to respond.
9. **Approve:** Call `POST /api/admin/transport/review/:id` with `appStatus: "approved"`.
10. **Verify Automation:** Check `driver_licenses` table in Supabase for the new license.

### Step 4: Test the "Big App" Security

1. Create a **second Admin** assigned to a **different bureau** (e.g., Ministry of Health).
2. Try to call any `GET /api/admin/transport/*` endpoint using their token.
3. **Result:** Should return **403 Forbidden**. This proves multi-tenancy security works!

### Step 5: Test the Chat System

1. As a **citizen**, post a comment on an application.
2. As an **admin**, view the comments and reply.
3. As a **citizen**, verify the admin's reply appears in the chat history.
4. Comments are returned oldest-first (like a chat history).

---

## 📊 Audit Logs

Every state change is recorded in the `application_audit_logs` table:
- Application submissions
- Payment confirmations
- Admin reviews (approvals/rejections)
- Cancellations
- Each log includes: who, what, and when (millisecond precision)

This provides a complete audit trail for compliance and accountability.
