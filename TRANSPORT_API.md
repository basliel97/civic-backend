# Transport Agency API Documentation

**Version:** 3.0.0 (Fully Dynamic Multi-Tenant Architecture)
**Base URL:** `http://localhost:4000/api`

---

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Citizen Endpoints (Mobile App)](#citizen-endpoints-mobile-app)
- [Agency Admin Endpoints (Web Dashboard)](#agency-admin-endpoints-web-dashboard)
- [Chat System](#chat-system)
- [Testing Guide](#testing-guide)

---

## Architecture Overview

### Dynamic Service Model

This API uses a **fully dynamic, multi-tenant architecture**:

- **No hardcoded service types** - Services are stored in the `bureau_services` table
- **UUID-based service selection** - Applications reference services via `service_id`
- **Bureau isolation** - Each bureau manages its own services and applications
- **Bureau ID as scope** - All admin operations are scoped to the bureau

### How It Works

1. **Mobile App Flow:**
   - Fetch available services for a bureau: `GET /transport/bureaus/:bureauId/services`
   - Apply using the `service_id` from the response

2. **Admin Dashboard Flow:**
   - Query applications with filters: `GET /admin/transport/applications?status=paid&serviceId=uuid`
   - Bureau scope is automatic (based on admin's bureau)

---

## 📱 Citizen Endpoints (Mobile App)

**Requires Header:** `Authorization: Bearer <citizen_token>` (except for public endpoints)

### 0. Get Bureau Services (PUBLIC - No Auth Required)

Fetches the list of available services for a specific bureau. Mobile apps should call this first to dynamically populate service options.

- **Endpoint:** `GET /api/transport/bureaus/:bureauId/services`
- **Auth:** None (public endpoint)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `bureauId` | UUID | The bureau's ID |

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "service-uuid-1",
      "service_name": "License Renewal",
      "service_description": "Renew your driver's license",
      "base_fee": 500,
      "required_docs": ["photo", "medical_report"]
    },
    {
      "id": "service-uuid-2",
      "service_name": "Replacement License",
      "service_description": "Replace lost or damaged license",
      "base_fee": 300,
      "required_docs": ["police_report", "photo"]
    }
  ]
}
```

**Note:** Store the `id` from this response - you'll need it when submitting an application.

---

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
  "serviceId": "service-uuid-from-bureau-services",
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
- `serviceId` (required): UUID from `GET /bureaus/:bureauId/services`
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
    "service_id": "service-uuid",
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

Retrieves aggregated statistics for the transport agency dashboard (scoped to bureau).

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

### Unified Applications Endpoint (Dynamic)

**Single endpoint replaces the 9 hardcoded service-specific routes.**

- **Endpoint:** `GET /api/admin/transport/applications`
- **Auth:** Admin token (Traffic Management bureau)

**Query Parameters (all optional):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by application status |
| `serviceId` | UUID | Filter by specific service |

**Status Values:**

| Status | Description |
|--------|-------------|
| `submitted` | Application submitted, awaiting payment |
| `pending_payment` | Payment pending |
| `paid` | Paid, awaiting review |
| `approved` | Approved by admin |
| `rejected` | Rejected by admin |
| `cancelled` | Cancelled by admin or citizen |

**Examples:**
```
GET /api/admin/transport/applications                    # All applications
GET /api/admin/transport/applications?status=paid        # Only paid applications
GET /api/admin/transport/applications?serviceId=uuid     # Filter by service
GET /api/admin/transport/applications?status=paid&serviceId=uuid  # Combined filter
```

**Response (200 OK):**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "id": "app-uuid",
      "user_id": "user-uuid",
      "service_id": "service-uuid",
      "service_name": "License Renewal",
      "service_description": "Renew your driver's license",
      "base_fee": 500,
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

### Step 1: Prepare Test Data

1. Ensure you have a record in `external_agency_records`:
   - **FIN:** `123456789012`
   - **Medical Ref:** `MED-2026-001`
   - **Police Ref:** `POL-2026-001`

2. Create a test service in `bureau_services`:
   - **bureau_id:** Your test bureau UUID
   - **service_name:** "License Renewal"
   - **base_fee:** 500
   - **required_docs:** ["photo", "medical_report"]
   - **is_active:** true

### Step 2: Test the Dynamic Citizen Flow

1. **Login as Citizen:** Call `POST /api/citizen/login` using FIN `123456789012`. Copy the `token`.

2. **Fetch Available Services (NEW):**
   ```bash
   curl -X GET http://localhost:4000/api/transport/bureaus/YOUR_BUREAU_UUID/services
   ```
   Copy the `id` of the service you want.

3. **Verify Record:** Call `POST /api/transport/verify-record` with the token and Medical Ref.

4. **Apply (Dynamic):** Call `POST /api/transport/apply` with the `serviceId` from step 2:
   ```json
   {
     "serviceId": "service-uuid-from-step-2",
     "deliveryMethod": "pickup",
     "documents": ["url1", "url2"]
   }
   ```

5. **Pay:** Call `POST /api/transport/pay/:id`. Status should change to `paid`.

6. **Check Applications:** Call `GET /api/transport/my-applications` to see your application.

7. **Send Comment:** Call `POST /api/transport/:id/comments` with a message.

8. **Get Comments:** Call `GET /api/transport/:id/comments` to view chat history.

### Step 3: Test the Dynamic Admin Flow

1. **Setup Admin:** Set user's `role` → `admin` and `bureau_id` → your bureau UUID.

2. **Login as Admin:** Get an Admin Token.

3. **Check Dashboard:** `GET /api/admin/transport/stats` (now scoped to bureau).

4. **Check Services:** `GET /api/admin/transport/services` to view agency services.

5. **Create a Service (NEW):**
   ```bash
   curl -X POST http://localhost:4000/api/admin/transport/services \
     -H "Authorization: Bearer ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "New Test Service", "description": "Test", "fee": 300, "docs": ["photo"]}'
   ```

6. **View Applications (Dynamic):**
   ```bash
   # All applications
   curl -X GET http://localhost:4000/api/admin/transport/applications
   
   # Filter by status
   curl -X GET "http://localhost:4000/api/admin/transport/applications?status=paid"
   
   # Filter by service
   curl -X GET "http://localhost:4000/api/admin/transport/applications?serviceId=SERVICE_UUID"
   
   # Combined filters
   curl -X GET "http://localhost:4000/api/admin/transport/applications?status=paid&serviceId=SERVICE_UUID"
   ```

7. **Reply to Comment:** `POST /api/admin/transport/:id/comments`.

8. **Approve:** `POST /api/admin/transport/review/:id` with `appStatus: "approved"`.

9. **Verify Automation:** Check `driver_licenses` table for new license.

### Step 4: Test Multi-Tenancy Security

1. Create a **second Admin** assigned to a **different bureau**.
2. Login as that admin and try to view applications.
3. **Result:** Should only see applications from their bureau, proving isolation works.

---

## 📊 Audit Logs

Every state change is recorded in the `application_audit_logs` table:
- Application submissions
- Payment confirmations
- Admin reviews (approvals/rejections)
- Cancellations
- Each log includes: who, what, and when (millisecond precision)

This provides a complete audit trail for compliance and accountability.
