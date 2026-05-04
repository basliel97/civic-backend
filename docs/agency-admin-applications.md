# Agency Admin - Applications API Documentation

This document describes the API endpoints for agency admins to manage citizen applications.

## Base URL
```
/api/agency-admin
```

**Authentication:** Requires `Authorization: Bearer <token>` header with admin role.

---

## Endpoints

### 1. Get Applications Grouped by Service
Returns all applications organized by each service.

**Endpoint:** `GET /api/agency-admin/applications-by-service`

**Query Parameters:** None (uses authenticated bureau automatically)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "service_id": "uuid",
      "service_name": "Driver License Renewal",
      "service_description": "Renew your driver's license",
      "base_fee": 100,
      "applications": [
        {
          "id": "application-uuid",
          "user_id": "user-uuid",
          "service_id": "service-uuid",
          "application_status": "submitted",
          "payment_status": "pending",
          "delivery_status": "pending",
          "created_at": "2025-01-15T10:30:00.000Z",
          "citizen_name": "John Doe",
          "citizen_fin": "username123"
        }
      ]
    },
    {
      "service_id": "uuid",
      "service_name": "Vehicle Registration",
      "service_description": "Register a new vehicle",
      "base_fee": 200,
      "applications": []
    }
  ]
}
```

**Notes:**
- Only returns active statuses: `submitted`, `paid`, `approved`, `rejected`
- Empty `applications` array if no applications for that service
- Applications sorted by newest first

---

### 2. Get All Applications (with filters)
Returns a flat list of all applications with optional filters.

**Endpoint:** `GET /api/agency-admin/applications`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status: `submitted`, `paid`, `approved`, `rejected` |
| serviceId | string | Filter by specific service UUID |

**Example:**
```
GET /api/agency-admin/applications?status=submitted&serviceId=UUID-HERE
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "id": "application-uuid",
      "service_id": "service-uuid",
      "application_status": "submitted",
      "payment_status": "pending",
      "created_at": "2025-01-15T10:30:00.000Z",
      "citizen_name": "John Doe",
      "citizen_fin": "username123",
      "service_name": "Driver License Renewal",
      "service_description": "Renew your driver's license",
      "base_fee": 100
    }
  ]
}
```

---

### 3. Get Agency Stats
Returns dashboard statistics for the bureau.

**Endpoint:** `GET /api/agency-admin/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "total_apps": "50",
    "awaiting_payment": "10",
    "awaiting_review": "25",
    "total_approved": "15",
    "unique_citizens": "45",
    "revenue": "7500"
  }
}
```

---

### 4. Get Bureau Services
Returns all services created by the agency.

**Endpoint:** `GET /api/agency-admin/services`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "service-uuid",
      "bureau_id": "bureau-uuid",
      "service_name": "Driver License Renewal",
      "service_description": "Renew your driver's license",
      "base_fee": 100,
      "required_docs": ["id_card", "photo"],
      "is_active": true,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## Status Values

### Application Status
| Status | Description |
|--------|-------------|
| submitted | Citizen submitted, awaiting payment |
| paid | Payment completed, awaiting review |
| approved | Application approved |
| rejected | Application rejected |

### Payment Status
| Status | Description |
|--------|-------------|
| pending | Awaiting payment |
| paid | Payment completed |

### Delivery Status
| Status | Description |
|--------|-------------|
| pending | Not yet delivered |
| ready | Ready for pickup/delivery |
| delivered | Delivered to citizen |

---

## Frontend Implementation Tips

### Recommended Approach for Dashboard:
1. Call `/applications-by-service` once
2. Group 1: Show sidebar with services and their application counts
3. Group 2: When user clicks a service, show that service's applications array
4. For status filtering, either filter the array in memory or call `/applications?serviceId=XYZ&status=submitted`

### Display Example:
```
┌─────────────────────────────────────────────────┐
│  📊 Dashboard                                   │
├─────────────────────────────────────────────────┤
│  Services:            │  Applications:           │
│                       │                         │
│  ● License (5)        │  John Doe - submitted    │
│  ○ Registration (2)     │  Jane Smith - paid     │
│  ○ Permit (0)         │  ...                  │
│                       │                         │
└─────────────────────────────────────────────────┘
```