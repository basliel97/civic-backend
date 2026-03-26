
## Overview

This is a production-grade authentication API using **Better Auth** with role-based access control. It supports both standard email/password authentication and Ethiopian citizen identity verification via the Fayda system.

**Base URL:** `http://localhost:4000`

**Authentication:** Bearer token via `Authorization: Bearer <token>` header

---

## Authentication Architecture

### Roles

- **citizen** - Standard user with verified identity
- **admin** - Administrative access
- **super_admin** - Full system access

### Authentication Flows

1. **Admin Flow:** Direct email/password login → Better Auth
2. **Citizen Flow:** FIN verification → Fayda OTP → Better Auth registration

---

## Endpoints

### Standard Better Auth Endpoints

Better Auth provides these endpoints automatically at `/api/auth/*`:

#### Authentication

**POST** `/api/auth/sign-up/email`
- Register new user with email/password
- Body: `{ email: string, password: string, name: string }`
- Returns: `{ user: User, token: string }`

**POST** `/api/auth/sign-in/email`
- Login with email/password
- Body: `{ email: string, password: string }`
- Returns: `{ user: User, token: string }`

**POST** `/api/auth/sign-out`
- Logout current user
- Headers: `Authorization: Bearer <token>`
- Returns: `{ success: boolean }`

**GET** `/api/auth/session`
- Get current session
- Headers: `Authorization: Bearer <token>`
- Returns: `{ user: User, session: Session }`

#### Password Management

**POST** `/api/auth/forget-password`
- Request password reset email
- Body: `{ email: string }`
- Returns: `{ success: boolean }`

**POST** `/api/auth/reset-password`
- Reset password with token
- Body: `{ token: string, newPassword: string }`
- Returns: `{ success: boolean }`

#### Email Verification

**POST** `/api/auth/send-verification-email`
- Send verification email
- Headers: `Authorization: Bearer <token>`
- Returns: `{ success: boolean }`

**GET** `/api/auth/verify-email`
- Verify email with token
- Query: `?token=<verification_token>`
- Returns: `{ success: boolean }`

### Admin Endpoints (Requires admin/super_admin role)

**POST** `/api/auth/admin/create-user`
- Create new user (admin only)
- Headers: `Authorization: Bearer <admin_token>`
- Body:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "User Name",
    "role": "citizen"
  }
  ```
- Returns: `{ user: User }`

**POST** `/api/admin/forgot-password`
- Request password reset for admin accounts
- **No authentication required** (can be called before login)
- Body: `{ email: "admin@example.com" }`
- Returns: `{ success: true, message: "If an account exists, a reset link has been sent." }`

**POST** `/api/auth/admin/list-users`
- List all users
- Headers: `Authorization: Bearer <admin_token>`
- Body: `{ limit?: number, offset?: number }`
- Returns: `{ users: User[], total: number }`

**POST** `/api/auth/admin/update-user`
- Update user details
- Headers: `Authorization: Bearer <admin_token>`
- Body: `{ user_id: string, ...updates }`
- Returns: `{ user: User }`

**POST** `/api/auth/admin/set-role`
- Change user role (super_admin only)
- Headers: `Authorization: Bearer <super_admin_token>`
- Body: `{ user_id: string, role: "citizen" | "admin" | "super_admin" }`
- Returns: `{ user: User }`

---

### Citizen Authentication Endpoints (Fayda Integration)

**Base Path:** `/api/citizen`

These endpoints integrate with the Ethiopian Fayda identity system for citizen verification.

#### 1. Initiate Registration

**POST** `/api/citizen/initiate-register`

Start the citizen registration process. Sends OTP via Fayda.

**Request:**
```json
{
  "fin": "123456789012"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "fin": "123456789012"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "User already registered. Please login."
}
```

**Status Codes:**
- `200` - OTP sent successfully
- `400` - Invalid FIN format
- `409` - User already exists
- `500` - Server error

#### 2. Complete Registration

**POST** `/api/citizen/complete-register`

Complete registration after OTP verification.

**Request:**
```json
{
  "fin": "123456789012",
  "otp": "123456",
  "email": "citizen@example.com",
  "password": "SecurePass123!"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": "uuid",
    "email": "citizen@example.com",
    "name": "Full Name",
    "role": "citizen"
  }
}
```

**Status Codes:**
- `200` - Registration successful
- `400` - Missing fields or invalid OTP
- `409` - Email already registered
- `500` - Server error

#### 3. Login

**POST** `/api/citizen/login`

Login with FIN or phone number.

**Request:**
```json
{
  "loginInput": "123456789012",
  "password": "SecurePass123!"
}
```
 
*Note: `loginInput` can be FIN (12 digits) or phone number*

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "citizen@example.com",
    "name": "Full Name",
    "role": "citizen"
  }
}
```

**Response (Account Locked):**
```json
{
  "success": false,
  "error": "Account locked. Try again in 12 minutes."
}
```

**Status Codes:**
- `200` - Login successful
- `400` - Missing credentials
- `401` - Invalid credentials
- `403` - Account locked
- `500` - Server error

#### 4. Initiate Password Reset

**POST** `/api/citizen/initiate-reset`

Request password reset via Fayda OTP.

**Request:**
```json
{
  "fin": "123456789012"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

*Note: Returns success even if FIN doesn't exist (security)*

**Status Codes:**
- `200` - OTP request processed
- `400` - Missing FIN
- `500` - Server error

#### 5. Reset Password

**POST** `/api/citizen/reset-password`

Reset password after OTP verification.

**Request:**
```json
{
  "fin": "123456789012",
  "otp": "123456",
  "newPassword": "NewSecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

**Status Codes:**
- `200` - Password updated
- `400` - Missing fields
- `404` - User not found
- `500` - Server error

---

#### 6. KYC Preview (Before Registration)

**POST** `/api/citizen/kyc-preview`

Preview citizen's KYC data from Fayda before completing registration. This allows citizens to verify their information before creating an account.

**Request:**
```json
{
  "fin": "123456789012",
  "otp": "123456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "full_name": "John Doe",
    "date_of_birth": "1990-01-15",
    "gender": "male",
    "photo_url": "https://...",
    "address": "Addis Ababa, Ethiopia"
  }
}
```

*Note: This endpoint does NOT delete the OTP, so it can be called multiple times before finalizing registration.*

**Status Codes:**
- `200` - Preview successful
- `400` - Invalid FIN or OTP
- `500` - Server error

---

#### 7. Get Citizen Profile

**GET** `/api/citizen/profile`

Get the authenticated citizen's profile information. Requires a valid session token.

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Response (Success):**
```json
{
  "success": true,
  "profile": {
    "id": "user-uuid",
    "username": "123456789012",
    "email": "citizen@example.com",
    "name": "John Doe",
    "role": "citizen",
    "status": "active",
    "fin": "123456789012",
    "phone_number": "+251912345678",
    "region": "Addis Ababa",
    "sub_city": "Bole",
    "kebele": "05",
    "work_type": "Technology / IT",
    "occupation": "Software Engineer",
    "dob": "1990-01-15",
    "gender": "male",
    "image": "https://...",
    "created_at": "2026-01-15T10:00:00Z",
    "last_login_at": "2026-03-26T08:30:00Z"
  }
}
```

**Error Response (403 - Inactive Account):**
```json
{
  "success": false,
  "error": "Account is not active"
}
```

**Status Codes:**
- `200` - Profile retrieved
- `401` - Unauthorized (missing/invalid token)
- `403` - Account inactive or deleted
- `404` - User not found
- `500` - Server error

---

#### 8. Update Citizen Profile

**PUT** `/api/citizen/profile`

Update the authenticated citizen's contact and location details.

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "phone_number": "+251987654321",
  "region": "Addis Ababa",
  "sub_city": "Kirkos",
  "kebele": "12",
  "work_type": "Government Employee",
  "occupation": "Civil Servant"
}
```

**Parameters (all optional):**
| Field | Type | Description |
|-------|------|-------------|
| `phone_number` | string | New phone number |
| `region` | string | Region/state |
| `sub_city` | string | Sub-city or district |
| `kebele` | string | Kebele/ward |
| `work_type` | string | Work type from dropdown |
| `occupation` | string | Specific occupation/job title |

**Response (Success):**
```json
{
  "success": true,
  "profile": {
    "id": "user-uuid",
    "phone_number": "+251987654321",
    "region": "Addis Ababa",
    "sub_city": "Kirkos",
    "kebele": "12",
    "work_type": "Government Employee",
    "occupation": "Civil Servant",
    "updated_at": "2026-03-26T09:00:00Z"
  }
}
```

**Status Codes:**
- `200` - Profile updated
- `401` - Unauthorized
- `403` - Account inactive
- `500` - Server error

---

## Frontend Integration Examples

### React with Better Auth Client

```typescript
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient({
  baseURL: "http://localhost:4000",
});

// Admin Login
const loginAdmin = async (email: string, password: string) => {
  const result = await authClient.signIn.email({
    email,
    password,
  });
  
  if (result.error) {
    console.error(result.error.message);
    return null;
  }
  
  // Store token
  localStorage.setItem('token', result.data.token);
  return result.data.user;
};

// Create User (Admin only)
const createUser = async (userData: {
  email: string;
  password: string;
  name: string;
  role: string;
}) => {
  const token = localStorage.getItem('token');
  
  const result = await authClient.admin.createUser({
    ...userData,
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
  
  return result.data;
};

// Citizen Registration Flow
const citizenRegistration = {
  // Step 1: Send FIN
  initiate: async (fin: string) => {
    const response = await fetch('http://localhost:4000/api/citizen/initiate-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fin }),
    });
    return response.json();
  },
  
  // Step 2: Complete with OTP
  complete: async (data: {
    fin: string;
    otp: string;
    email: string;
    password: string;
  }) => {
    const response = await fetch('http://localhost:4000/api/citizen/complete-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },
};

// Citizen Login
const loginCitizen = async (loginInput: string, password: string) => {
  const response = await fetch('http://localhost:4000/api/citizen/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginInput, password }),
  });
  
  const data = await response.json();
  
  if (data.success) {
    localStorage.setItem('token', data.token);
    return data.user;
  }
  
  throw new Error(data.error);
};
```

---

## Security Features

1. **Password Policy**
   - Minimum 8 characters
   - Maximum 128 characters
   - Recommended: uppercase, lowercase, numbers, special characters

2. **Account Lockout**
   - 5 failed login attempts = 15-minute lockout
   - Automatically resets after successful login

3. **Session Management**
   - 7-day session expiration
   - Daily session refresh
   - Secure HTTP-only cookies

4. **CSRF Protection**
   - Disabled in development for API testing
   - Enable in production by setting `NODE_ENV=production`
   - Origin validation available when enabled

5. **Rate Limiting**
   - 100 requests per minute per IP
   - Automatic blocking of excessive requests

6. **Email Verification**
   - Required for new accounts
   - 1-hour verification token expiration

7. **Account Status Checks**
   - All protected endpoints verify account is active
   - Deleted accounts are blocked from access
   - Middleware checks `status` and `deleted_at` fields

8. **XSS Prevention**
   - Forum posts and replies automatically strip HTML tags
   - Prevents script injection attacks

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

Or for Better Auth native endpoints:

```json
{
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE"
  }
}
```

**Common Error Codes:**
- `INVALID_CREDENTIALS` - Wrong email/password
- `USER_NOT_FOUND` - User doesn't exist
- `UNAUTHORIZED` - Missing or invalid token
- `FORBIDDEN` - Insufficient permissions
- `RATE_LIMITED` - Too many requests
- `VALIDATION_ERROR` - Invalid input data

---

## Testing

### Admin User Creation

```bash
# 1. Login as admin
curl -X POST http://localhost:4000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@civic.et",
    "password": "SecurePass123!"
  }'

# 2. Create new user with admin token
curl -X POST http://localhost:4000/api/auth/admin/create-user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token_from_step_1>" \
  -d '{
    "email": "newuser@example.com",
    "password": "TempPass123!",
    "name": "New User",
    "role": "citizen"
  }'
```

### Citizen Registration

```bash
# 1. Initiate registration (sends OTP via Fayda)
curl -X POST http://localhost:4000/api/citizen/initiate-register \
  -H "Content-Type: application/json" \
  -d '{"fin": "123456789012"}'

# 2. Preview KYC data (optional - verify info before registering)
curl -X POST http://localhost:4000/api/citizen/kyc-preview \
  -H "Content-Type: application/json" \
  -d '{
    "fin": "123456789012",
    "otp": "123456"
  }'

# 3. Complete registration (after receiving OTP)
curl -X POST http://localhost:4000/api/citizen/complete-register \
  -H "Content-Type: application/json" \
  -d '{
    "fin": "123456789012",
    "otp": "123456",
    "email": "citizen@example.com",
    "password": "SecurePass123!"
  }'
```

### Get/Update Citizen Profile

```bash
# Get profile (requires login token)
curl -X GET http://localhost:4000/api/citizen/profile \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update profile
curl -X PUT http://localhost:4000/api/citizen/profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+251987654321",
    "region": "Addis Ababa",
    "sub_city": "Bole"
  }'
```

---

## Environment Variables

Required environment variables:

```bash
# Server
PORT=4000

# Database
DATABASE_URL=postgresql://...

# Better Auth
BETTER_AUTH_SECRET=your-32-char-secret
BETTER_AUTH_URL=http://localhost:4000
TRUSTED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Fayda Integration
FAYDA_API_URL=https://fyda-api.onrender.com
```

---

## Support

For issues or questions:
- Better Auth Docs: https://www.better-auth.com
- GitHub Issues: https://github.com/better-auth/better-auth
