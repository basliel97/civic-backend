# Implementation Summary: Better Auth with FIN as Username

## ✅ Completed Changes

### 1. Database Schema Updates
- Added `username` column (VARCHAR(12), UNIQUE) to store FIN
- Made `email` column nullable for citizens
- Created index on username for performance
- Migrated existing users: `username = fin`
- Set citizen emails to NULL (optional)

### 2. Better Auth Configuration
- Added `username` plugin with FIN validation (12 digits)
- Configured `minUsernameLength` and `maxUsernameLength` to 12
- Email verification now optional
- Kept admin plugin for user management

### 3. Citizen Registration (UPDATED)
```
POST /api/citizen/complete-register
Body: {
  "fin": "123456789012",        // Required - becomes username
  "otp": "123456",              // Required - from Fayda
  "phone": "+251912345678",     // Required
  "password": "SecurePass123!", // Required
  "email": "optional@email.com" // Optional - can be null
}
```

### 4. Citizen Login (UPDATED)
```
POST /api/citizen/login
Body: {
  "loginInput": "123456789012 or +251912345678",
  "password": "SecurePass123!"
}

Response: {
  "success": true,
  "token": "...",
  "user": { "id", "email", "name", "role" }
}
```
- Accepts FIN (12 digits) or phone number
- Uses username plugin for authentication
- Better Auth handles the login

### 5. Admin Forgot Password
```
POST /api/admin/forgot-password
Body: { "email": "admin@civic.et" }

Response: Redirects to Better Auth forgot password endpoint
```

### 6. Admin Change Password
```
POST /api/admin/change-password
Headers: Authorization: Bearer TOKEN
Body: {
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}
```

### 7. Admin Reset Citizen Password
```
POST /api/admin/reset-citizen-password
Headers: Authorization: Bearer ADMIN_TOKEN
Body: {
  "userId": "citizen-uuid",
  "newPassword": "TempPass123!"
}
```

## 📊 Database Stats After Migration
- Total users: 3
- With username: 2 (citizens migrated)
- With email: 1 (admin only)

## 🔐 Authentication Flows

### Citizen Flow:
1. Registration: Fayda OTP → Create user with username=FIN, email optional
2. Login: FIN or Phone → Lookup username → Authenticate with Better Auth
3. Password Reset: Fayda OTP → Reset password

### Admin Flow:
1. Login: Email + Password (Better Auth)
2. Forgot Password: Email → Reset link
3. Change Password: Current + New password
4. Reset Citizen: Admin can reset any citizen password

## 📁 Updated Files
- `src/auth/index.ts` - Added username plugin
- `src/routes/citizen-auth.ts` - Updated registration and login
- `src/routes/admin.ts` - New admin password management
- `src/index.ts` - Mounted admin routes

## ✅ Ready to Test

Start server:
```bash
npm run dev
```

Test citizen login with FIN:
```bash
curl -X POST http://localhost:4000/api/citizen/login \
  -H "Content-Type: application/json" \
  -d '{"loginInput":"123456789012","password":"SecurePass123!"}'
```

Test admin forgot password:
```bash
curl -X POST http://localhost:4000/api/admin/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@civic.et"}'
```

Then use Better Auth endpoint:
```bash
curl -X POST http://localhost:4000/api/auth/forget-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@civic.et"}'
```

## 🎯 Key Features
✅ FIN as primary identifier for citizens
✅ Email optional for citizens
✅ Login with FIN or phone number
✅ Admin forgot password via email
✅ Admin can change own password
✅ Admin can reset citizen passwords
✅ All using Better Auth with username plugin

**Status: READY FOR TESTING!** 🚀
