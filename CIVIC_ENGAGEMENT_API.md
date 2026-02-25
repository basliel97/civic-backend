# Civic Engagement Module - API Documentation

> Version: 1.0.0 | Last Updated: February 2026

---

## Base URL
```
http://localhost:4000/api
```

---

## Authentication

### Citizen Auth (Bearer Token)
For protected routes, include the token in the header:
```
Authorization: Bearer YOUR_TOKEN
```

### Admin Auth
Admin routes require admin or super_admin role. Use the same token from admin login.

---

## Forums

### List All Forums
```http
GET /forums
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Road Safety",
      "description": "Discussions about road safety...",
      "icon": "🚗",
      "category": "transport",
      "is_system": true,
      "post_count": "5"
    }
  ]
}
```

### Get Forum Details
```http
GET /forums/:id
```

### List Posts in Forum
```http
GET /forums/:id/posts?page=1&limit=20
```

### Create Post (Auth Required)
```http
POST /forums/:id/posts
Header: Authorization: Bearer TOKEN
Body:
{
  "title": "Post Title",
  "content": "Post content here..."
}
```
**Errors:**
- `400` - Profanity detected (contains inappropriate language)
- `401` - Not authenticated

### Get Post with Replies
```http
GET /posts/:id
```

### Update Post (Auth Required)
```http
PUT /posts/:id
Header: Authorization: Bearer TOKEN
Body:
{
  "title": "Updated Title",
  "content": "Updated content..."
}
```

### Delete Post (Auth Required)
```http
DELETE /posts/:id
Header: Authorization: Bearer TOKEN
```

### Create Reply (Auth Required)
```http
POST /posts/:id/replies
Header: Authorization: Bearer TOKEN
Body:
{
  "content": "Your reply..."
}
```

### Delete Reply (Auth Required)
```http
DELETE /replies/:id
Header: Authorization: Bearer TOKEN
```

---

## Polls

### List Active Polls
```http
GET /polls
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Should we improve road lighting?",
      "description": "Opinion on street lighting...",
      "options": [
        { "label": "Yes", "color": "#3B82F6" },
        { "label": "No", "color": "#EF4444" }
      ],
      "target_criteria": {
        "regions": ["addis_ababa"],
        "genders": [],
        "work_types": []
      },
      "status": "active",
      "start_date": "2026-01-01",
      "end_date": "2026-12-31",
      "is_targeted": true,
      "user_can_vote": true,
      "has_voted": false
    }
  ]
}
```

### Get Poll Details (Auth Required)
```http
GET /polls/:id
Header: Authorization: Bearer TOKEN
```

### Cast Vote (Auth Required)
```http
POST /polls/:id/vote
Header: Authorization: Bearer TOKEN
Body:
{
  "option_index": 0
}
```
**Errors:**
- `403` - Not eligible for this poll (targeting restrictions)
- `409` - Already voted

### Get Poll Results (Auth Required)
```http
GET /polls/:id/results
Header: Authorization: Bearer TOKEN
```
**Response:**
```json
{
  "success": true,
  "data": {
    "poll_id": "uuid",
    "total_votes": 150,
    "has_voted": true,
    "user_vote": 0,
    "options": [
      { "index": 0, "label": "Yes", "color": "#3B82F6", "count": 80, "percentage": 53 },
      { "index": 1, "label": "No", "color": "#EF4444", "count": 70, "percentage": 47 }
    ],
    "poll_status": "active",
    "voting_open": true
  }
}
```
*Use `total_votes` and `percentage` for bar/pie charts*

---

## Reports

### Report Content (Auth Required)
```http
POST /reports
Header: Authorization: Bearer TOKEN
Body:
{
  "item_id": "post-or-reply-uuid",
  "item_type": "post",
  "item_title": "Reported post title",
  "reason": "spam",
  "description": "Additional details..."
}
```
**Reasons:** `spam`, `harassment`, `inappropriate`, `other`

---

## Suggestions Box

### List Bureaus
```http
GET /bureaus
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Ministry of Health",
      "description": "National health services...",
      "contact_email": "feedback@moh.gov.et"
    }
  ]
}
```

### Submit Suggestion (Auth Required)
```http
POST /suggestions
Header: Authorization: Bearer TOKEN
Body:
{
  "bureau_id": "uuid",
  "subject": "Issue with health center",
  "content": "Detailed feedback..."
}
```

### My Suggestions (Auth Required)
```http
GET /suggestions/my?page=1&limit=20
Header: Authorization: Bearer TOKEN
```

---

## Work Types

### List Work Types
```http
GET /work-types
```
**Response:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Government Employee", "category": "public" },
    { "id": "uuid", "name": "Healthcare Worker", "category": "health" },
    { "id": "uuid", "name": "Other", "category": "other" }
  ]
}
```

---

## Admin Endpoints

### Banned Words (Profanity Filter)
```http
GET /admin/banned-words
Header: Authorization: Bearer ADMIN_TOKEN

POST /admin/banned-words
Header: Authorization: Bearer ADMIN_TOKEN
Body:
{
  "word": "bannedword",
  "severity": "high",
  "language": "en"
}

DELETE /admin/banned-words/:id
Header: Authorization: Bearer ADMIN_TOKEN
```

### Manage Forums
```http
GET /admin/forums
POST /admin/forums
PUT /admin/forums/:id
DELETE /admin/forums/:id

POST /admin/posts/:id/pin
POST /admin/posts/:id/lock
```

### Manage Polls
```http
GET /admin/polls
POST /admin/polls
Body:
{
  "title": "Poll Title",
  "description": "Description",
  "options": [
    { "label": "Option 1", "color": "#3B82F6" },
    { "label": "Option 2", "color": "#EF4444" }
  ],
  "target_criteria": {
    "regions": ["addis_ababa"],
    "genders": [],
    "work_types": ["healthcare"]
  },
  "start_date": "2026-01-01T00:00:00Z",
  "end_date": "2026-12-31T23:59:59Z",
  "status": "active",
  "allow_view_results_before_vote": false,
  "allow_view_results_after_vote": true
}

PUT /admin/polls/:id
DELETE /admin/polls/:id
GET /admin/polls/:id/results
```

### Manage Reports
```http
GET /admin/reports?status=pending
GET /admin/reports/:id
PUT /admin/reports/:id/resolve
Body: { "resolution": "Action taken..." }
PUT /admin/reports/:id/reject
```

### Manage Suggestions
```http
GET /admin/suggestions?status=submitted
GET /admin/suggestions/:id
POST /admin/suggestions/:id/respond
Body: { "response": "Response to citizen..." }
```

### Manage Bureaus
```http
GET /admin/bureaus
POST /admin/bureaus
PUT /admin/bureaus/:id
DELETE /admin/bureaus/:id
```

### Manage Work Types
```http
POST /work-types
Body: { "name": "New Work Type", "category": "other" }
DELETE /work-types/:id
```

---

## Error Responses

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "matchedWords": [{ "word": "badword", "severity": "high" }]
}
```

### Common Error Codes
| Code | Description |
|------|-------------|
| `PROFANITY_DETECTED` | Content contains banned words |
| `ALREADY_VOTED` | User has already voted |
| `NOT_TARGETED` | User not eligible for poll |
| `UNAUTHORIZED` | Not allowed to perform action |
| `NOT_FOUND` | Resource not found |

---

## Notes for Frontend

1. **Poll Targeting**: Check `user_can_vote` before showing vote button
2. **Profanity Filter**: Show `matchedWords` to user when blocked
3. **Results**: Use `percentage` and `total_votes` for chart rendering
4. **Suggestions**: Only visible to submitter and admins
5. **Work Types**: "Other" option allows custom text entry
