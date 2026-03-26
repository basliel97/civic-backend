# Civic Engagement Module - Complete API Documentation

> **Version:** 1.0.0  
> **Base URL:** `http://localhost:4000/api`  
> **Last Updated:** February 2026

---

## Table of Contents
`
1. [Authentication](#authentication)
2. [Forums](#forums)
3. [Polls](#polls)
4. [Reports](#reports)
5. [Suggestions Box](#suggestions-box)
6. [Work Types](#work-types)
7. [Admin Management](#admin-management)
8. [Error Codes](#error-codes)
9. [Frontend Notes](#frontend-implementation-notes)

---

## Authentication

### Overview

The Civic Engagement Module uses **Bearer Token** authentication. Most citizen endpoints require authentication, while some public endpoints (like listing forums, bureaus) are accessible without authentication.

### How to Authenticate

1. **Login** using the citizen login endpoint (see main auth documentation)
2. **Receive** a token in the response
3. **Include** the token in all protected requests:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Authentication Levels

| Level | Description | Endpoints |
|-------|-------------|-----------|
| **Public** | No authentication required | `GET /forums`, `GET /bureaus`, `GET /polls` |
| **Citizen** | Any authenticated citizen | `POST /forums/:id/posts`, `POST /polls/:id/vote` |
| **Admin** | Admin or Super Admin role | `POST /admin/forums`, `POST /admin/polls` |

---

## Forums

### Overview

Forums are categorized discussion boards where citizens can:
- View and search forums by category
- Create discussion posts
- Reply to existing threads
- Report abusive content

**Security Note:** All post and reply content is automatically sanitized to prevent XSS (Cross-Site Scripting) attacks. HTML tags are stripped from content before storage. For example, `<script>alert('hack')</script>` becomes `alert('hack')`.

### Forum Categories

| Category | Icon | Description |
|----------|------|-------------|
| `general` | 💬 | General community discussions |
| `health` | 🏥 | Health center feedback |
| `education` | 📚 | Education-related discussions |
| `transport` | 🚗 | Road safety and transport |
| `government` | 🏛️ | Government services feedback |
| `local` | 🏘️ | Local community issues |

---

### Endpoints

#### 1. List All Forums

```http
GET /forums
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Filter by category (e.g., `health`, `education`) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "34556172-b57c-41d3-bbf8-81c5fa29f647",
      "name": "Road Safety",
      "description": "Discussions about road safety, traffic, and transport issues",
      "icon": "🚗",
      "category": "transport",
      "is_system": true,
      "is_restricted": false,
      "status": "active",
      "post_count": "5"
    }
  ]
}
```

---

#### 2. Get Forum Details

```http
GET /forums/:id
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Forum ID |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "34556172-b57c-41d3-bbf8-81c5fa29f647",
    "name": "Road Safety",
    "description": "Discussions about road safety...",
    "icon": "🚗",
    "category": "transport",
    "is_system": true,
    "is_restricted": false,
    "allowed_roles": [],
    "allowed_regions": [],
    "allowed_work_types": [],
    "created_by": null,
    "created_at": "2026-02-25T15:52:33.271Z",
    "updated_at": "2026-02-25T15:52:33.271Z",
    "status": "active",
    "post_count": "5"
  }
}
```

---

#### 3. List Posts in Forum

```http
GET /forums/:id/posts
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Forum ID |

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number |
| `limit` | integer | No | 20 | Items per page (max 50) |
| `sort` | string | No | created_at | Sort by: `created_at`, `title`, `view_count` |
| `order` | string | No | desc | Sort order: `asc`, `desc` |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "id": "abc123...",
        "forum_id": "34556172-...",
        "user_id": "user-uuid",
        "title": "Poor road conditions on Bole Road",
        "content": "There are many potholes...",
        "is_pinned": false,
        "is_locked": false,
        "view_count": 45,
        "reply_count": 3,
        "status": "active",
        "created_at": "2026-02-20T10:30:00Z",
        "user_name": "John Doe"
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

#### 4. Create Post

```http
POST /forums/:id/posts
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Forum ID |

**Request Body:**
```json
{
  "title": "Post Title Here",
  "content": "The main content of your post. Can be multiple paragraphs..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Post title (max 255 characters) |
| `content` | string | Yes | Post content (text only, HTML will be escaped) |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "new-post-uuid",
    "forum_id": "34556172-...",
    "user_id": "current-user-uuid",
    "title": "Post Title Here",
    "content": "The main content...",
    "is_pinned": false,
    "is_locked": false,
    "view_count": 0,
    "reply_count": 0,
    "status": "active",
    "created_at": "2026-02-25T16:00:00Z",
    "updated_at": "2026-02-25T16:00:00Z"
  }
}
```

**Error Response (400) - Profanity Detected:**
```json
{
  "success": false,
  "error": "Content contains inappropriate language",
  "code": "PROFANITY_DETECTED",
  "matchedWords": [
    { "word": "badword", "severity": "high" }
  ],
  "severity": "high"
}
```

---

#### 5. Get Post with Replies

```http
GET /posts/:id
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Post ID |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "post-uuid",
    "forum_id": "forum-uuid",
    "user_id": "user-uuid",
    "title": "Post Title",
    "content": "Post content...",
    "is_pinned": false,
    "is_locked": false,
    "view_count": 46,
    "reply_count": 3,
    "status": "active",
    "created_at": "2026-02-20T10:30:00Z",
    "user_name": "John Doe",
    "forum_name": "Road Safety",
    "replies": [
      {
        "id": "reply-uuid",
        "post_id": "post-uuid",
        "user_id": "user-uuid-2",
        "content": "I agree, the roads are terrible!",
        "status": "active",
        "created_at": "2026-02-20T11:00:00Z",
        "user_name": "Jane Smith"
      }
    ]
  }
}
```

---

#### 6. Update Post

```http
PUT /posts/:id
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Post ID |

**Request Body:**
```json
{
  "title": "Updated Title",
  "content": "Updated content..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | New title |
| `content` | string | No | New content |

**Notes:**
- At least one field must be provided
- Only the post author or admin can update

---

#### 7. Delete Post

```http
DELETE /posts/:id
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Post ID |

**Notes:**
- Post author, forum moderator, or admin can delete
- This soft-deletes the post (sets status to 'deleted')

---

#### 8. Create Reply

```http
POST /posts/:id/replies
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Post ID |

**Request Body:**
```json
{
  "content": "Your reply text here..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Reply content |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "reply-uuid",
    "post_id": "post-uuid",
    "user_id": "current-user-uuid",
    "content": "Your reply text here...",
    "status": "active",
    "created_at": "2026-02-25T16:30:00Z"
  }
}
```

**Error (400) - Post Locked:**
```json
{
  "success": false,
  "error": "Post is locked",
  "code": "LOCKED"
}
```

---

#### 9. Delete Reply

```http
DELETE /replies/:id
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Reply ID |

---

## Polls

### Overview

Government-issued polls allow citizens to vote on various issues. Key features:
- **One User, One Vote**: Enforced by database constraint
- **Targeted Polls**: Can restrict by region, gender, or work type
- **Real-time Results**: Shows live vote counts after voting

### Poll Status Values

| Status | Description |
|--------|-------------|
| `draft` | Poll is being prepared, not visible to citizens |
| `active` | Poll is open for voting |
| `closed` | Voting period has ended |

### Targeting Criteria

Polls can be targeted to specific audiences using `target_criteria`:

```json
{
  "target_criteria": {
    "regions": ["addis_ababa", "afar"],
    "genders": ["male", "female"],
    "work_types": ["healthcare", "education"]
  }
}
```

- Empty arrays or missing fields = Universal poll (everyone can vote)
- Only ONE matching criterion needs to be met for the user to be eligible

---

### Endpoints

#### 1. List Active Polls (Public)

```http
GET /polls
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "poll-uuid",
      "title": "Should we improve street lighting?",
      "description": "We are collecting opinions on improving street lighting...",
      "options": [
        { "label": "Yes, definitely", "color": "#3B82F6" },
        { "label": "No, not necessary", "color": "#EF4444" },
        { "label": "Unsure", "color": "#F59E0B" }
      ],
      "target_criteria": {
        "regions": [],
        "genders": [],
        "work_types": []
      },
      "start_date": "2026-01-01T00:00:00Z",
      "end_date": "2026-12-31T23:59:59Z",
      "status": "active",
      "vote_count": 150,
      "is_targeted": false,
      "user_can_vote": true,
      "has_voted": false,
      "user_vote": null
    }
  ]
}
```

**Note:** For authenticated requests, includes `has_voted`, `user_vote`, and `user_can_vote` fields.

---

#### 2. Get Poll Details

```http
GET /polls/:id
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Poll ID |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "poll-uuid",
    "title": "Should we improve street lighting?",
    "description": "Detailed description...",
    "options": [
      { "label": "Yes", "color": "#3B82F6" },
      { "label": "No", "color": "#EF4444" }
    ],
    "target_criteria": {
      "regions": ["addis_ababa"],
      "genders": [],
      "work_types": []
    },
    "start_date": "2026-01-01T00:00:00Z",
    "end_date": "2026-12-31T23:59:59Z",
    "status": "active",
    "has_voted": false,
    "user_vote": null
  }
}
```

---

#### 3. Cast Vote

```http
POST /polls/:id/vote
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Poll ID |

**Request Body:**
```json
{
  "option_index": 0
}
```

| Field | Type | Required | Description |
|--------|------|----------|-------------|
| `option_index` | integer | Yes | Index of the option (0-based) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "vote-uuid",
    "poll_id": "poll-uuid",
    "user_id": "current-user-uuid",
    "option_index": 0,
    "voted_at": "2026-02-25T16:45:00Z"
  }
}
```

**Error Responses:**

*Not Eligible (403):*
```json
{
  "success": false,
  "error": "You are not eligible to vote in this poll",
  "code": "NOT_TARGETED"
}
```

*Already Voted (409):*
```json
{
  "success": false,
  "error": "You have already voted in this poll",
  "code": "ALREADY_VOTED"
}
```

*Poll Expired (400):*
```json
{
  "success": false,
  "error": "Poll voting period has ended",
  "code": "EXPIRED"
}
```

*Invalid Option (400):*
```json
{
  "success": false,
  "error": "Invalid option selected",
  "code": "INVALID_OPTION"
}
```

---

#### 4. Get Poll Results

```http
GET /polls/:id/results
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "poll_id": "poll-uuid",
    "total_votes": 150,
    "has_voted": true,
    "user_vote": 0,
    "options": [
      {
        "index": 0,
        "label": "Yes, definitely",
        "color": "#3B82F6",
        "count": 80,
        "percentage": 53
      },
      {
        "index": 1,
        "label": "No, not necessary",
        "color": "#EF4444",
        "count": 55,
        "percentage": 37
      },
      {
        "index": 2,
        "label": "Unsure",
        "color": "#F59E0B",
        "count": 15,
        "percentage": 10
      }
    ],
    "poll_status": "active",
    "voting_open": true
  }
}
```

**Frontend Tip:** Use `total_votes` and `percentage` values to render bar/pie charts.

---

## Reports

### Overview

Users can report inappropriate content (spam, harassment, etc.) for moderator review.

### Report Reasons

| Reason | Description |
|--------|-------------|
| `spam` | Spam or promotional content |
| `harassment` | Bullying or harassment |
| `inappropriate` | Inappropriate content |
| `other` | Other issues |

---

### Endpoints

#### 1. Submit Report

```http
POST /reports
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "item_id": "uuid-of-post-or-reply",
  "item_type": "post",
  "item_title": "Title of the reported content",
  "reason": "spam",
  "description": "Additional details about why you're reporting this..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `item_id` | UUID | Yes | ID of the post/reply to report |
| `item_type` | string | Yes | Either `post` or `reply` |
| `item_title` | string | No | Title of the content (for context) |
| `reason` | string | Yes | One of: `spam`, `harassment`, `inappropriate`, `other` |
| `description` | string | No | Additional details |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "report-uuid",
    "item_id": "uuid-of-post",
    "item_type": "post",
    "item_title": "Title of the post",
    "user_id": "current-user-uuid",
    "reason": "spam",
    "description": "Additional details...",
    "status": "pending",
    "created_at": "2026-02-25T17:00:00Z"
  }
}
```

---

## Suggestions Box

### Overview

Private feedback system allowing citizens to submit suggestions directly to government bureaus. Only the submitter and admins can view the suggestions.

---

### Endpoints

#### 1. List Bureaus (Public)

```http
GET /bureaus
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "bureau-uuid",
      "name": "Ministry of Health",
      "description": "National health services and feedback",
      "contact_email": "feedback@moh.gov.et",
      "phone": null,
      "address": null,
      "status": "active"
    },
    {
      "id": "bureau-uuid-2",
      "name": "Addis Ababa City Administration",
      "description": "Capital city municipal services",
      "contact_email": "info@addisababa.gov.et",
      "phone": null,
      "address": null,
      "status": "active"
    }
  ]
}
```

---

#### 2. Submit Suggestion

```http
POST /suggestions
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "bureau_id": "uuid-of-bureau",
  "subject": "Issue with local health center",
  "content": "Detailed description of the issue or suggestion..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bureau_id` | UUID | Yes | Target bureau ID (from `/bureaus` list) |
| `subject` | string | Yes | Short subject line (max 255 chars) |
| `content` | string | Yes | Detailed feedback/suggestion |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "suggestion-uuid",
    "user_id": "current-user-uuid",
    "bureau_id": "bureau-uuid",
    "subject": "Issue with local health center",
    "content": "Detailed description...",
    "status": "submitted",
    "response": null,
    "created_at": "2026-02-25T17:30:00Z"
  }
}
```

---

#### 3. Get My Suggestions

```http
GET /suggestions/my
```

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number |
| `limit` | integer | No | 20 | Items per page (max 50) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "id": "suggestion-uuid",
        "user_id": "current-user-uuid",
        "bureau_id": "bureau-uuid",
        "bureau_name": "Ministry of Health",
        "subject": "Issue with local health center",
        "content": "Detailed description...",
        "status": "resolved",
        "response": "Thank you for your feedback. We have addressed...",
        "created_at": "2026-02-20T10:00:00Z",
        "responded_at": "2026-02-25T09:00:00Z"
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

**Suggestion Status Values:**
| Status | Description |
|--------|-------------|
| `submitted` | Awaiting review |
| `under_review` | Bureau is reviewing |
| `resolved` | Issue addressed |
| `rejected` | Suggestion not accepted |

---

## Work Types

### Overview

Dropdown options for citizen work/occupation information. Used for poll targeting and citizen profiles.

---

### Endpoints

#### 1. List Work Types (Public)

```http
GET /work-types
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Government Employee", "category": "public" },
    { "id": "uuid", "name": "Healthcare Worker", "category": "health" },
    { "id": "uuid", "name": "Education Worker", "category": "education" },
    { "id": "uuid", "name": "Private Sector", "category": "private" },
    { "id": "uuid", "name": "Business Owner / Self-Employed", "category": "business" },
    { "id": "uuid", "name": "Student", "category": "education" },
    { "id": "uuid", "name": "Unemployed", "category": "other" },
    { "id": "uuid", "name": "Retired", "category": "other" },
    { "id": "uuid", "name": "Farmer", "category": "agriculture" },
    { "id": "uuid", "name": "Driver / Transport Worker", "category": "transport" },
    { "id": "uuid", "name": "Trade / Merchant", "category": "business" },
    { "id": "uuid", "name": "Technology / IT", "category": "private" },
    { "id": "uuid", "name": "Other", "category": "other" }
  ]
}
```

**Note:** 
- "Other" option allows custom text entry by citizens
- When user selects "Other", save their custom text to the `work_type` field in their profile

---

## Admin Management

### Overview

Admin endpoints for managing civic engagement features. All admin endpoints require authentication with admin or super_admin role.

**Header for all admin requests:**
```
Authorization: Bearer ADMIN_TOKEN
```

---

### Banned Words (Profanity Filter)

#### List Banned Words
```http
GET /admin/banned-words
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "word": "fuck", "severity": "high", "language": "en", "created_at": "2026-02-25T..." },
    { "id": "uuid", "word": "shit", "severity": "medium", "language": "en", "created_at": "2026-02-25T..." }
  ]
}
```

#### Add Banned Word
```http
POST /admin/banned-words
Content-Type: application/json

{
  "word": "bannedword",
  "severity": "high",
  "language": "en"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `word` | string | Yes | Word to ban |
| `severity` | string | No | `low`, `medium`, `high` (default: `medium`) |
| `language` | string | No | `en` (English), `am` (Amharic), `both` (default: `both`) |

#### Bulk Add Banned Words
```http
POST /admin/banned-words/bulk
Content-Type: application/json

{
  "words": [
    { "word": "badword1", "severity": "high" },
    { "word": "badword2", "severity": "medium", "language": "am" },
    { "word": "badword3" }
  ]
}
```

#### Delete Banned Word
```http
DELETE /admin/banned-words/:id
```

---

### Forums Management

#### Create Forum
```http
POST /admin/forums
Content-Type: application/json

{
  "name": "New Forum Name",
  "description": "Forum description",
  "icon": "🎯",
  "category": "general",
  "is_restricted": false,
  "allowed_roles": [],
  "allowed_regions": ["addis_ababa"],
  "allowed_work_types": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Forum name |
| `description` | string | No | Forum description |
| `icon` | string | No | Emoji icon |
| `category` | string | No | Category (default: `general`) |
| `is_restricted` | boolean | No | Restrict access (default: false) |
| `allowed_roles` | array | No | Roles that can access |
| `allowed_regions` | array | No | Regions that can access |
| `allowed_work_types` | array | No | Work types that can access |

#### Update Forum
```http
PUT /admin/forums/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  "status": "active"
}
```

#### Delete Forum
```http
DELETE /admin/forums/:id
```

#### Pin/Lock Post
```http
POST /admin/posts/:id/pin
POST /admin/posts/:id/lock
```

---

### Polls Management

#### Create Poll
```http
POST /admin/polls
Content-Type: application/json

{
  "title": "Poll Title",
  "description": "Poll description for context",
  "options": [
    { "label": "Option 1", "color": "#3B82F6" },
    { "label": "Option 2", "color": "#EF4444" },
    { "label": "Option 3", "color": "#F59E0B" }
  ],
  "target_criteria": {
    "regions": ["addis_ababa"],
    "genders": [],
    "work_types": ["healthcare", "education"]
  },
  "start_date": "2026-01-01T00:00:00Z",
  "end_date": "2026-12-31T23:59:59Z",
  "status": "active",
  "allow_view_results_before_vote": false,
  "allow_view_results_after_vote": true,
  "show_results_live": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Poll question |
| `description` | string | No | Additional context |
| `options` | array | Yes | Array of options with `label` and optional `color` |
| `target_criteria` | object | No | Targeting restrictions |
| `start_date` | ISO date | Yes | Poll start datetime |
| `end_date` | ISO date | Yes | Poll end datetime |
| `status` | string | No | `draft`, `active`, `closed` |
| `allow_view_results_before_vote` | boolean | No | Show results before voting |
| `allow_view_results_after_vote` | boolean | No | Show results after voting |
| `show_results_live` | boolean | No | Real-time result updates |

**Option Colors:** Use hex codes. Default colors are assigned if not specified.

#### Update Poll
```http
PUT /admin/polls/:id
Content-Type: application/json

{
  "title": "Updated Title",
  "status": "closed"
}
```

#### Delete Poll
```http
DELETE /admin/polls/:id
```

#### Get Poll Results (Admin)
```http
GET /admin/polls/:id/results
```
*Admin can see results regardless of voting status.*

---

### Reports Management

#### List Reports
```http
GET /admin/reports?status=pending&page=1&limit=20
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter: `pending`, `reviewed`, `resolved`, `rejected` |
| `page` | integer | Page number |
| `limit` | integer | Items per page |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": "report-uuid",
        "item_id": "post-uuid",
        "item_type": "post",
        "item_title": "Reported Post Title",
        "user_id": "reporter-uuid",
        "reporter_name": "John Doe",
        "reason": "spam",
        "description": "Additional details...",
        "status": "pending",
        "created_at": "2026-02-25T..."
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

#### Get Report Details
```http
GET /admin/reports/:id
```

#### Resolve Report
```http
PUT /admin/reports/:id/resolve
Content-Type: application/json

{
  "resolution": "Action taken: content removed, user warned"
}
```

#### Reject Report
```http
PUT /admin/reports/:id/reject
```

---

### Suggestions Management

#### List All Suggestions
```http
GET /admin/suggestions?status=submitted&bureau_id=uuid&page=1&limit=20
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter: `submitted`, `under_review`, `resolved`, `rejected` |
| `bureau_id` | UUID | Filter by bureau |
| `page` | integer | Page number |
| `limit` | integer | Items per page |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "id": "suggestion-uuid",
        "user_id": "citizen-uuid",
        "user_name": "John Doe",
        "user_fin": "123456789012",
        "bureau_id": "bureau-uuid",
        "bureau_name": "Ministry of Health",
        "subject": "Issue subject",
        "content": "Detailed content...",
        "status": "submitted",
        "created_at": "2026-02-20T..."
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20
  }
}
```

#### Get Suggestion Details
```http
GET /admin/suggestions/:id
```

**Response includes submitter's FIN (username) for follow-up.**

#### Respond to Suggestion
```http
POST /admin/suggestions/:id/respond
Content-Type: application/json

{
  "response": "Thank you for your feedback. We have addressed the issue by..."
}
```

---

### Bureaus Management

#### Create Bureau
```http
POST /admin/bureaus
Content-Type: application/json

{
  "name": "New Government Bureau",
  "description": "Description of services",
  "contact_email": "info@bureau.gov.et",
  "phone": "+251-11-123-4567",
  "address": "Addis Ababa, Ethiopia"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Bureau name |
| `description` | string | No | Description |
| `contact_email` | string | No | Contact email |
| `phone` | string | No | Phone number |
| `address` | string | No | Physical address |

#### Update Bureau
```http
PUT /admin/bureaus/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "contact_email": "new@email.gov.et"
}
```

#### Delete Bureau (Soft Delete)
```http
DELETE /admin/bureaus/:id
```

---

### Work Types Management (Admin)

#### Create Work Type
```http
POST /work-types
Content-Type: application/json

{
  "name": "New Work Type",
  "category": "other"
}
```

#### Archive Work Type
```http
DELETE /work-types/:id
```

---

## Error Codes

### Common HTTP Error Responses

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `PROFANITY_DETECTED` | 400 | Content contains banned words |
| `ALREADY_VOTED` | 409 | User already voted in this poll |
| `NOT_TARGETED` | 403 | User not eligible for targeted poll |
| `VOTE_REQUIRED` | 403 | Must vote to see poll results |
| `UNAUTHORIZED` | 403 | Not allowed to perform action |
| `NOT_FOUND` | 404 | Resource not found |
| `LOCKED` | 400 | Post is locked, cannot reply |
| `EXPIRED` | 400 | Poll voting period ended |
| `INVALID_OPTION` | 400 | Invalid option index |

### Profanity Detection Response

When profanity is detected, the response includes:

```json
{
  "success": false,
  "error": "Content contains inappropriate language",
  "code": "PROFANITY_DETECTED",
  "matchedWords": [
    { "word": "badword", "severity": "high" }
  ],
  "severity": "high"
}
```

**Severity Levels:**
| Level | Description | Action |
|-------|-------------|--------|
| `low` | Minor language | Warning, may be allowed |
| `medium` | Profanity | Blocked by default |
| `high` | Severe | Blocked + flagged for review |

---

## Frontend Implementation Notes

### 1. Poll Results Visualization

Use the `options` array from poll results to render charts:

```javascript
// Bar Chart Example
const renderBarChart = (options, totalVotes) => {
  return options.map(opt => ({
    label: opt.label,
    count: opt.count,
    percentage: opt.percentage,
    // Calculate bar width: (count / total) * 100
    barWidth: `${opt.percentage}%`,
    color: opt.color
  }));
};

// Pie Chart Example  
const renderPieChart = (options) => {
  const total = options.reduce((sum, opt) => sum + opt.count, 0);
  return options.map(opt => ({
    label: opt.label,
    count: opt.count,
    percentage: opt.percentage,
    // For pie: calculate angle
    angle: (opt.count / total) * 360,
    color: opt.color
  }));
};
```

---

### 2. Poll Targeting UI

Check `user_can_vote` before showing the voting button:

```javascript
const renderPoll = (poll) => {
  if (poll.has_voted) {
    // Show results
    return <PollResults data={poll.results} />;
  }
  
  if (poll.is_targeted && !poll.user_can_vote) {
    // Show eligibility message
    const criteria = poll.target_criteria;
    let message = "This poll is available only to: ";
    const restrictions = [];
    if (criteria.regions?.length) restrictions.push(criteria.regions.join(', '));
    if (criteria.work_types?.length) restrictions.push(criteria.work_types.join(', '));
    if (criteria.genders?.length) restrictions.push(criteria.genders.join(', '));
    
    return <RestrictedMessage message={message + restrictions.join(' and ')} />;
  }
  
  // Show voting options
  return <VotingForm options={poll.options} />;
};
```

---

### 3. Profanity Filter UI

When blocked, display the matched words to help users understand what was flagged:

```javascript
const handlePostSubmit = async (data) => {
  try {
    await api.createPost(data);
  } catch (error) {
    if (error.code === 'PROFANITY_DETECTED') {
      const badWords = error.matchedWords.map(w => w.word).join(', ');
      alert(`Please remove inappropriate language: ${badWords}`);
    }
  }
};
```

---

### 4. Suggestions Privacy

- Suggestions are only visible to the submitter and admins
- Citizens cannot see other citizens' suggestions
- Bureau staff can only see suggestions submitted to their bureau (via admin endpoints)

---

### 5. Work Types Dropdown

When implementing the work type selector:

```javascript
const WorkTypeSelector = ({ workTypes, value, onChange }) => {
  const customTypes = workTypes.filter(wt => wt.name === 'Other');
  const standardTypes = workTypes.filter(wt => wt.name !== 'Other');
  const [showCustomInput, setShowCustomInput] = useState(false);
  
  return (
    <select value={value} onChange={(e) => {
      if (e.target.value === 'OTHER') {
        setShowCustomInput(true);
      } else {
        onChange(e.target.value);
      }
    }}>
      {standardTypes.map(wt => (
        <option key={wt.id} value={wt.name}>{wt.name}</option>
      ))}
      <option value="OTHER">Other</option>
    </select>
  );
};
```

---

## Testing Checklist

### Public Endpoints
- [ ] `GET /forums` - Lists all forums with post counts
- [ ] `GET /bureaus` - Lists all government bureaus
- [ ] `GET /polls` - Lists active polls (without auth)
- [ ] `GET /work-types` - Lists work type options

### Citizen Authentication Required
- [ ] `POST /forums/:id/posts` - Create post (with profanity check)
- [ ] `POST /posts/:id/replies` - Reply to post
- [ ] `GET /posts/:id` - View post with replies
- [ ] `POST /polls/:id/vote` - Vote in poll
- [ ] `GET /polls/:id/results` - View poll results
- [ ] `POST /reports` - Report content
- [ ] `POST /suggestions` - Submit suggestion
- [ ] `GET /suggestions/my` - View my suggestions

### Admin Endpoints
- [ ] `GET /admin/banned-words` - List banned words
- [ ] `POST /admin/banned-words` - Add banned word
- [ ] `DELETE /admin/banned-words/:id` - Remove banned word
- [ ] `POST /admin/forums` - Create forum
- [ ] `POST /admin/polls` - Create poll
- [ ] `POST /admin/polls/:id/vote` - Vote (admin can vote)
- [ ] `GET /admin/reports` - List reports
- [ ] `PUT /admin/reports/:id/resolve` - Resolve report
- [ ] `GET /admin/suggestions` - List all suggestions
- [ ] `POST /admin/suggestions/:id/respond` - Respond to suggestion
- [ ] `POST /admin/posts/:id/pin` - Pin post
- [ ] `POST /admin/posts/:id/lock` - Lock post

### Edge Cases
- [ ] Profanity filter blocks inappropriate content
- [ ] One User, One Vote is enforced (cannot vote twice)
- [ ] Targeted polls only show to eligible citizens
- [ ] Poll results only visible after voting (based on settings)
- [ ] Cannot reply to locked posts
- [ ] Cannot update/delete other users' posts (unless admin)
- [ ] Suggestions are private (only submitter can see)

---

## Data Models Reference

### Forum
```typescript
{
  id: string;           // UUID
  name: string;        // Forum name
  description: string; // Forum description
  icon: string;        // Emoji icon
  category: string;    // Category type
  is_system: boolean;  // System-created vs user-created
  is_restricted: boolean; // Access restricted
  allowed_roles: string[];    // Allowed roles
  allowed_regions: string[]; // Allowed regions
  allowed_work_types: string[]; // Allowed work types
  post_count: number;  // Number of posts
}
```

### Post
```typescript
{
  id: string;
  forum_id: string;
  user_id: string;
  title: string;
  content: string;
  is_pinned: boolean;    // Pinned to top
  is_locked: boolean;    // No more replies
  view_count: number;
  reply_count: number;
  status: 'active' | 'hidden' | 'deleted';
  created_at: string;
  user_name: string;     // Author name
  forum_name: string;    // Forum name
  replies: Reply[];      // Only in GET /posts/:id
}
```

### Poll
```typescript
{
  id: string;
  title: string;
  description: string;
  options: { label: string; color: string }[];
  target_criteria: {
    regions?: string[];
    genders?: string[];
    work_types?: string[];
  };
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'closed';
  is_targeted: boolean;      // Has restrictions
  user_can_vote: boolean;   // Current user eligible
  has_voted: boolean;       // User voted
  user_vote: number | null; // User's choice
}
```

### Poll Results
```typescript
{
  poll_id: string;
  total_votes: number;
  has_voted: boolean;
  user_vote: number | null;
  options: {
    index: number;
    label: string;
    color: string;
    count: number;
    percentage: number;
  }[];
  poll_status: string;
  voting_open: boolean;
}
```

---

## Need Help?

For API issues, questions, or support:
- Check the error messages for specific codes
- Verify authentication token is valid
- Ensure required fields are included in request body
- Check that IDs (UUIDs) are properly formatted

**Backend Team Contact:** [Your contact here]
