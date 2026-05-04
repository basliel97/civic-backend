# Audit Features for Super Admin Dashboard

This document describes the audit capabilities provided by the Civic Backend application.
It focuses on the global audit data available to super admins, the audit tables used, and the endpoints that expose audit information.

## What the audit provides

### 1. Global Admin Audit Logs

- Tracks all administrative operations performed by admin or super_admin users.
- Captures actions across bureaus and provides system-wide visibility.
- Includes detailed context for each change.

Fields captured:
- `admin_id`: ID of the admin who performed the action.
- `bureau_id`: Bureau affected by the action (if any).
- `action`: Action type, e.g. `create_staff`, `update_service`, `delete_service`, `review_application`.
- `entity_type`: Type of resource changed, e.g. `user`, `bureau_service`, `transport_applications`, `application_comments`.
- `entity_id`: ID of the affected resource.
- `old_values`: JSON of relevant data before the change.
- `new_values`: JSON of relevant data after the change.
- `metadata`: Optional JSON metadata for additional context, such as IP address or request details.
- `created_at`: Timestamp when the action occurred.

### 2. Application Audit Logs

- Tracks lifecycle changes for transport applications.
- Captures status transitions and notes from admins.
- Useful for compliance, workflow history, and application review tracking.

Fields captured:
- `application_id`: ID of the transport application.
- `changed_by`: Admin who changed the application status.
- `old_status`: Previous application status.
- `new_status`: New application status.
- `action_notes`: Notes describing the change.
- `created_at`: Timestamp when the change occurred.

### 3. Combined Audit Events

- Provides a unified timeline of both admin actions and application changes.
- Useful for building a single audit feed or event log in the super admin dashboard.
- Combines data from both audit tables into one chronological result.

### 4. Audit Statistics Overview

- Summarizes audit activity for the last 30 days.
- Supports high-level dashboard metrics for super admins.

Metrics include:
- `total_admin_actions`
- `unique_admins`
- `bureaus_with_activity`
- `latest_admin_action`
- `total_application_changes`
- `unique_admins_making_changes`
- `applications_modified`
- `latest_application_change`
- `bureau_activity` by bureau

### 5. Entity-Type Audit Filtering

- Allows filtering audit logs by specific entity type.
- Supports targeted review of changes for a given resource category.
- Example entity types: `bureau_service`, `user`, `transport_applications`, `application_comments`.

### 6. Security Audit Logs

- Tracks security-related admin actions.
- Useful for monitoring login, permission, and user access changes.
- Security action types include:
  - `login`
  - `logout`
  - `password_change`
  - `permission_grant`
  - `permission_revoke`
  - `user_suspend`
  - `user_activate`

## Audit Tables

### `application_audit_logs`

Used for application-specific change history:
- `id`
- `application_id`
- `changed_by`
- `old_status`
- `new_status`
- `action_notes`
- `created_at`

### `admin_audit_logs`

Used for admin/user/service actions and general audit history:
- `id`
- `admin_id`
- `bureau_id`
- `action`
- `entity_type`
- `entity_id`
- `old_values`
- `new_values`
- `metadata`
- `created_at`

## Exposed Endpoints

All endpoints are under the base path:
- `/api/admin/global/audit`

### 1. `/api/admin/global/audit/stats`

- Returns audit statistics overview for the last 30 days.
- Useful for dashboard summaries.

### 2. `/api/admin/global/audit/admin-actions`

- Returns admin audit logs across all bureaus.
- Supports filtering by bureau, admin, action, entity type, and date range.

### 3. `/api/admin/global/audit/application-changes`

- Returns application audit logs across all bureaus.
- Supports filtering by bureau, admin, and date range.

### 4. `/api/admin/global/audit/combined`

- Returns both admin and application audit entries in a single chronological list.
- Useful for a unified audit timeline.

### 5. `/api/admin/global/audit/entity/{entityType}`

- Returns admin audit logs filtered by entity type.
- Useful for investigating changes to a specific resource class.

### 6. `/api/admin/global/audit/security`

- Returns security-related audit actions.
- Useful for monitoring login and permission events.

## Who can access these audits?

- Only super admins can access these endpoints.
- The middleware requires `role = super_admin` and `bureau_id = null`.
- This ensures only the global super admin sees system-wide audit data.

## Why this audit is useful

This audit system provides:
- System-wide accountability for admin actions.
- A clear audit trail for application status changes.
- Support for compliance and security review.
- A unified view for super admins to monitor bureau activity.
- Filtering by entity type and security actions.
- Audit statistics for monitoring trends and activity volume.
