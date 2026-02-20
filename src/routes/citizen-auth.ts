import { Hono } from "hono";
import { auth } from "../auth/index.js";
import { FaydaService } from "../services/fyda.js";
import { Pool } from "pg";
import { config } from "../config/env.js";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

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
const citizenAuth = new Hono();

/**
 * POST /citizen/initiate-register
 * Start citizen registration process
 * Sends OTP via Fayda identity system
 */
citizenAuth.post("/initiate-register", async (c) => {
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
    const existingUser = await pool.query(
      'SELECT id FROM "user" WHERE fin = $1',
      [fin]
    );

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

  } catch (error: any) {
    console.error("[Citizen Auth] Initiate register error:", error);
    return c.json({ 
      success: false, 
      error: error.message || "Failed to send OTP" 
    }, 500);
  }
});

/**
 * POST /citizen/complete-register
 * Complete registration after Fayda OTP verification
 * Creates user in Better Auth with verified identity
 */
citizenAuth.post("/complete-register", async (c) => {
  try {
    const { fin, otp, email, password } = await c.req.json();

    // Validate inputs
    if (!fin || !otp || !email || !password) {
      return c.json({ 
        success: false, 
        error: "FIN, OTP, email, and password are required" 
      }, 400);
    }

    // Verify OTP with Fayda
    const kycData = await FaydaService.verifyOtp(fin, otp);

    // Check if email already exists
    const existingEmail = await pool.query(
      'SELECT id FROM "user" WHERE email = $1',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return c.json({ 
        success: false, 
        error: "Email already registered" 
      }, 409);
    }

    // Create user via Better Auth API
    const userResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: kycData.personalIdentity.fullName,
      },
    });

    if (!userResult || !userResult.user) {
      throw new Error("Failed to create user");
    }

    // Update user with Fayda data
    await pool.query(
      `UPDATE "user" SET 
        fin = $1,
        phone_number = $2,
        dob = $3,
        gender = $4,
        photo_url = $5,
        role = 'citizen',
        email_verified = true
      WHERE id = $6`,
      [
        fin,
        kycData.personalIdentity.phone,
        kycData.personalIdentity.dob,
        kycData.personalIdentity.gender,
        kycData.biometrics?.face || null,
        userResult.user.id,
      ]
    );

    return c.json({
      success: true,
      message: "Registration successful",
      user: {
        id: userResult.user.id,
        email: userResult.user.email,
        name: userResult.user.name,
        role: "citizen",
      },
    });

  } catch (error: any) {
    console.error("[Citizen Auth] Complete register error:", error);
    return c.json({ 
      success: false, 
      error: error.message || "Registration failed" 
    }, 500);
  }
});

/**
 * POST /citizen/login
 * Login with FIN or phone number
 * Validates credentials and returns Better Auth session
 */
citizenAuth.post("/login", async (c) => {
  try {
    const { loginInput, password } = await c.req.json();
    const rawInput = (loginInput || "").trim();

    if (!rawInput || !password) {
      return c.json({ 
        success: false, 
        error: "Login input and password are required" 
      }, 400);
    }

    let userData = null;

    // Check if input is FIN (12 digits)
    if (/^\d{12}$/.test(rawInput)) {
      const result = await pool.query(
        'SELECT id, email, failed_login_attempts, locked_until FROM "user" WHERE fin = $1',
        [rawInput]
      );
      userData = result.rows[0];
    } else {
      // Check phone numbers (handle different formats)
      const possibleNumbers = [rawInput];
      if (rawInput.startsWith("09")) {
        possibleNumbers.push("+251" + rawInput.substring(1));
      } else if (rawInput.startsWith("+2519")) {
        possibleNumbers.push("0" + rawInput.substring(4));
      }

      const result = await pool.query(
        'SELECT id, email, failed_login_attempts, locked_until FROM "user" WHERE phone_number = ANY($1)',
        [possibleNumbers]
      );
      userData = result.rows[0];
    }

    if (!userData) {
      return c.json({ 
        success: false, 
        error: "Invalid credentials" 
      }, 401);
    }

    // Check if account is locked
    if (userData.locked_until && new Date(userData.locked_until) > new Date()) {
      const waitTime = Math.ceil(
        (new Date(userData.locked_until).getTime() - Date.now()) / 60000
      );
      return c.json({ 
        success: false, 
        error: `Account locked. Try again in ${waitTime} minutes.` 
      }, 403);
    }

    // Attempt login via Better Auth
    const loginResult = await auth.api.signInEmail({
      body: {
        email: userData.email,
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

      await pool.query(
        'UPDATE "user" SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [newCount, lockTime, userData.id]
      );

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
    await pool.query(
      'UPDATE "user" SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [userData.id]
    );

    return c.json({
      success: true,
      message: "Login successful",
      token: loginResult.token,
      user: {
        id: loginResult.user.id,
        email: loginResult.user.email,
        name: loginResult.user.name,
        role: loginResult.user.role,
      },
    });

  } catch (error: any) {
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
citizenAuth.post("/initiate-reset", async (c) => {
  try {
    const { fin } = await c.req.json();

    if (!fin) {
      return c.json({ 
        success: false, 
        error: "FIN is required" 
      }, 400);
    }

    // Check if user exists
    const result = await pool.query(
      'SELECT id FROM "user" WHERE fin = $1',
      [fin]
    );

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

  } catch (error: any) {
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
citizenAuth.post("/reset-password", async (c) => {
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
    const result = await pool.query(
      'SELECT id FROM "user" WHERE fin = $1',
      [fin]
    );

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

  } catch (error: any) {
    console.error("[Citizen Auth] Reset password error:", error);
    return c.json({ 
      success: false, 
      error: error.message || "Password reset failed" 
    }, 500);
  }
});

export default citizenAuth;
