import { Hono } from "hono";
import { auth } from "../auth/index.js";
import { FaydaService } from "../services/fyda.js";
import { pool } from "../db/pool.js";
import { citizenAuth as citizenAuthMiddleware } from "../middleware/citizen-auth.js";
/**
 * Citizen Authentication Routes
 * Integrates Fayda identity verification with Better Auth
 *
 * Flow:
 * 1. initiate-register: Send FIN, receive OTP via Fayda
 * 2. complete-register: Verify OTP with Fayda, create user in Better Auth
 * 3. login: Login with FIN or phone number
 * 4. initiate-reset: Request password reset (sends Fayda OTP)
 * 5. reset-password: Verify OTP and reset password
 */
const citizenAuthRoutes = new Hono();
/**
 * POST /citizen/initiate-register
 * Start citizen registration process
 * Sends OTP via Fayda identity system
 */
citizenAuthRoutes.post("/initiate-register", async (c) => {
    try {
        const { fin } = await c.req.json();
        // Validate FIN format (12 digits)
        if (!fin || !/^\d{12}$/.test(fin)) {
            return c.json({
                success: false,
                error: "Invalid FIN. Must be 12 digits."
            }, 400);
        }
        // Check if user already exists
        const existingUser = await pool.query('SELECT id FROM "user" WHERE fin = $1', [fin]);
        if (existingUser.rows.length > 0) {
            return c.json({
                success: false,
                error: "User already registered. Please login."
            }, 409);
        }
        // Request OTP from Fayda
        await FaydaService.requestOtp(fin);
        return c.json({
            success: true,
            message: "OTP sent successfully",
            fin: fin // Return FIN for reference
        });
    }
    catch (error) {
        console.error("[Citizen Auth] Initiate register error:", error);
        return c.json({
            success: false,
            error: error.message || "Failed to send OTP"
        }, 500);
    }
});
citizenAuthRoutes.post("/kyc-preview", async (c) => {
    try {
        const { fin, otp } = await c.req.json();
        // Verify with Fayda
        const kycData = await FaydaService.verifyOtp(fin, otp);
        // Return the data to the frontend to show the "Preview" screen
        return c.json({ success: true, data: kycData });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * POST /citizen/complete-register
 * Complete registration after Fayda OTP verification
 * Creates user in Better Auth with verified identity
 *
 * NEW: Email is optional, FIN is used as username
 */
citizenAuthRoutes.post("/complete-register", async (c) => {
    try {
        const { fin, otp, password, email } = await c.req.json();
        if (!fin || !otp || !password) {
            return c.json({ success: false, error: "Missing required fields" }, 400);
        }
        // 1. Verify OTP with Fayda API
        const kycData = await FaydaService.verifyOtp(fin, otp);
        const verifiedPhone = kycData.personalIdentity.phone;
        // 2. Check if user exists in Better Auth
        const existingUser = await pool.query('SELECT id FROM "user" WHERE username = $1', [fin]);
        if (existingUser.rows.length > 0) {
            return c.json({ success: false, error: "User already registered" }, 409);
        }
        // 3. Create Better Auth User
        const userResult = await auth.api.signUpEmail({
            body: { email: email || `${fin}@civic.local`, password, name: kycData.personalIdentity.fullName },
        });
        if (!userResult || !userResult.user)
            throw new Error("Failed to create user");
        // 4. Update Postgres with Hierarchical Data (Mapping Fayda -> Postgres)
        await pool.query(`UPDATE "user" SET 
        username = $1,
        fin = $2,
        fan = $3,
        phone_number = $4,
        dob = $5,
        dob_eth = $6,
        gender = $7,
        image = $8,        -- Changed from photo_url to image
        region = $9,
        sub_city = $10,
        kebele = $11,
        "email_verified" = $12,
        status = 'active', -- Using standard status
        "updated_at" = NOW()
      WHERE id = $13`, [
            fin,
            fin,
            kycData.personalIdentity.fan,
            kycData.personalIdentity.phone,
            kycData.personalIdentity.dob,
            kycData.personalIdentity.dobEth,
            kycData.personalIdentity.gender,
            kycData.biometrics?.face || null, // Mapping to 'image'
            kycData.address.region,
            kycData.address.woreda,
            kycData.address.kebele,
            email ? true : false,
            userResult.user.id,
        ]);
        return c.json({
            success: true,
            message: "Registration successful",
            user: { id: userResult.user.id, name: userResult.user.name }
        });
    }
    catch (error) {
        console.error("[Citizen Auth] Complete register error:", error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * POST /citizen/login
 * Login with FIN or phone number
 * Validates credentials and returns Better Auth session
 *
 * UPDATED: Uses username (FIN) for authentication
 */
citizenAuthRoutes.post("/login", async (c) => {
    try {
        const { loginInput, password } = await c.req.json();
        const rawInput = (loginInput || "").trim();
        if (!rawInput || !password) {
            return c.json({
                success: false,
                error: "Login input and password are required"
            }, 400);
        }
        let fin = null;
        // Check if input is FIN (12 digits)
        if (/^\d{12}$/.test(rawInput)) {
            fin = rawInput;
        }
        else {
            // Input is phone number - lookup FIN from phone
            const possibleNumbers = [rawInput];
            if (rawInput.startsWith("09")) {
                possibleNumbers.push("+251" + rawInput.substring(1));
            }
            else if (rawInput.startsWith("+2519")) {
                possibleNumbers.push("0" + rawInput.substring(4));
            }
            const result = await pool.query('SELECT username FROM "user" WHERE phone_number = ANY($1)', [possibleNumbers]);
            if (result.rows.length > 0) {
                fin = result.rows[0].username;
            }
        }
        if (!fin) {
            return c.json({
                success: false,
                error: "Invalid credentials"
            }, 401);
        }
        // Check if account is locked
        const userCheck = await pool.query('SELECT id, failed_login_attempts, locked_until FROM "user" WHERE username = $1', [fin]);
        if (userCheck.rows.length === 0) {
            return c.json({
                success: false,
                error: "Invalid credentials"
            }, 401);
        }
        const userData = userCheck.rows[0];
        if (userData.locked_until && new Date(userData.locked_until) > new Date()) {
            const waitTime = Math.ceil((new Date(userData.locked_until).getTime() - Date.now()) / 60000);
            return c.json({
                success: false,
                error: `Account locked. Try again in ${waitTime} minutes.`
            }, 403);
        }
        // Attempt login via Better Auth using username (FIN)
        const loginResult = await auth.api.signInUsername({
            body: {
                username: fin,
                password,
            },
        });
        if (!loginResult) {
            // Login failed - increment failed attempts
            const newCount = (userData.failed_login_attempts || 0) + 1;
            let lockTime = null;
            if (newCount >= 5) {
                lockTime = new Date(Date.now() + 15 * 60000); // Lock for 15 minutes
            }
            await pool.query('UPDATE "user" SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3', [newCount, lockTime, userData.id]);
            if (newCount >= 5) {
                return c.json({
                    success: false,
                    error: "Too many failed attempts. Account locked for 15 minutes."
                }, 403);
            }
            return c.json({
                success: false,
                error: `Invalid credentials. ${5 - newCount} attempts remaining.`
            }, 401);
        }
        // Login success - reset failed attempts
        await pool.query('UPDATE "user" SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [userData.id]);
        // Get full user data including role from database
        const fullUser = await pool.query('SELECT id, email, name, role FROM "user" WHERE id = $1', [loginResult.user.id]);
        return c.json({
            success: true,
            message: "Login successful",
            token: loginResult.token,
            user: fullUser.rows[0] || {
                id: loginResult.user.id,
                email: loginResult.user.email,
                name: loginResult.user.name,
                role: "citizen",
            },
        });
    }
    catch (error) {
        console.error("[Citizen Auth] Login error:", error);
        return c.json({
            success: false,
            error: error.message || "Login failed"
        }, 500);
    }
});
/**
 * POST /citizen/initiate-reset
 * Request password reset via Fayda OTP
 */
citizenAuthRoutes.post("/initiate-reset", async (c) => {
    try {
        const { fin } = await c.req.json();
        if (!fin) {
            return c.json({
                success: false,
                error: "FIN is required"
            }, 400);
        }
        // Check if user exists
        const result = await pool.query('SELECT id FROM "user" WHERE fin = $1', [fin]);
        if (result.rows.length === 0) {
            // Don't reveal if user exists (security)
            return c.json({
                success: true,
                message: "If an account exists, an OTP has been sent."
            });
        }
        // Send OTP via Fayda
        await FaydaService.requestOtp(fin);
        return c.json({
            success: true,
            message: "OTP sent successfully"
        });
    }
    catch (error) {
        console.error("[Citizen Auth] Initiate reset error:", error);
        return c.json({
            success: false,
            error: error.message || "Failed to send OTP"
        }, 500);
    }
});
/**
 * POST /citizen/reset-password
 * Reset password after Fayda OTP verification
 */
citizenAuthRoutes.post("/reset-password", async (c) => {
    try {
        const { fin, otp, newPassword } = await c.req.json();
        if (!fin || !otp || !newPassword) {
            return c.json({
                success: false,
                error: "FIN, OTP, and new password are required"
            }, 400);
        }
        // Verify OTP with Fayda
        await FaydaService.verifyOtp(fin, otp);
        // Find user by FIN
        const result = await pool.query('SELECT id FROM "user" WHERE fin = $1', [fin]);
        if (result.rows.length === 0) {
            return c.json({
                success: false,
                error: "User not found"
            }, 404);
        }
        // Update password via Better Auth
        await auth.api.setPassword({
            body: {
                newPassword,
            },
            headers: c.req.raw.headers,
        });
        return c.json({
            success: true,
            message: "Password updated successfully"
        });
    }
    catch (error) {
        console.error("[Citizen Auth] Reset password error:", error);
        return c.json({
            success: false,
            error: error.message || "Password reset failed"
        }, 500);
    }
});
/**
 * GET /citizen/profile
 * Get citizen profile (uses shared auth middleware with status check)
 */
citizenAuthRoutes.get("/profile", citizenAuthMiddleware(), async (c) => {
    try {
        const user_id = c.get('user_id');
        const user = await pool.query(`SELECT id, username, email, name, role, status, fin, phone_number,
              region, sub_city, kebele, work_type, occupation, dob, gender, image,
              created_at, last_login_at
       FROM "user" WHERE id = $1`, [user_id]);
        if (user.rows.length === 0) {
            return c.json({ success: false, error: 'User not found' }, 404);
        }
        return c.json({ success: true, profile: user.rows[0] });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
/**
 * PUT /citizen/profile
 * Update citizen contact details (uses shared auth middleware with status check)
 */
citizenAuthRoutes.put("/profile", citizenAuthMiddleware(), async (c) => {
    try {
        const user_id = c.get('user_id');
        const { phone_number, region, sub_city, kebele, work_type, occupation } = await c.req.json();
        const updates = [];
        const values = [];
        const payload = { phone_number, region, sub_city, kebele, work_type, occupation };
        Object.keys(payload).forEach((key) => {
            if (payload[key] !== undefined) {
                values.push(payload[key]);
                updates.push(`${key} = $${values.length}`);
            }
        });
        if (updates.length === 0)
            return c.json({ success: true });
        values.push(user_id);
        const result = await pool.query(`UPDATE "user" SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
        return c.json({ success: true, profile: result.rows[0] });
    }
    catch (error) {
        return c.json({ success: false, error: error.message }, 500);
    }
});
export default citizenAuthRoutes;
