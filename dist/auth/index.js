import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import { config } from "../config/env.js";
/**
 * Production-grade Better Auth configuration
 * Following industry best practices for security and scalability
 */
export const auth = betterAuth({
    // Database configuration using Supabase PostgreSQL
    database: new Pool({
        connectionString: config.databaseUrl,
        // Connection pool settings for production
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection not established
    }),
    // Base configuration
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    // Advanced security configuration
    advanced: {
        // IP address tracking for security logging
        ipAddress: {
            ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
            disableIpTracking: false,
        },
        // Cookie security (enable in production with HTTPS)
        useSecureCookies: process.env.NODE_ENV === "production",
        // CSRF protection (keep enabled)
        disableCSRFCheck: false,
        // Origin validation
        disableOriginCheck: false,
        // Cookie configuration
        cookiePrefix: "civic",
        defaultCookieAttributes: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
        },
        // Database configuration
        database: {
            generateId: "uuid", // Use UUID for IDs
        },
    },
    // Email and password authentication with security best practices
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        requireEmailVerification: false,
        autoSignIn: false, // Don't auto sign in - let frontend handle redirect
        // Password reset configuration
        resetPasswordTokenExpiresIn: 3600, // 1 hour
        // Use bcrypt for password hashing (compatible with our manual insertion)
        password: {
            hash: async (password) => {
                return await bcrypt.hash(password, 10);
            },
            verify: async ({ hash, password }) => {
                return await bcrypt.compare(password, hash);
            },
        },
    },
    // Session configuration
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // Refresh session daily
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60, // 5 minutes cache
        },
    },
    // Email verification
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: false,
        expiresIn: 3600, // 1 hour
    },
    // Trusted origins for CORS
    trustedOrigins: config.trustedOrigins?.split(",") || [config.betterAuthUrl],
    // Rate limiting (built into Better Auth)
    rateLimit: {
        enabled: true,
        windowMs: 60 * 1000, // 1 minute window
        max: 100, // 100 requests per window per IP
    },
    // User configuration with additional fields for Civic platform
    user: {
        additionalFields: {
            // Citizen identification
            fin: {
                type: "string",
                required: false,
                input: true,
            },
            // Contact information
            phone_number: {
                type: "string",
                required: false,
                input: true,
            },
            // Personal details
            dob: {
                type: "string",
                required: false,
                input: true,
            },
            gender: {
                type: "string",
                required: false,
                input: true,
            },
            photo_url: {
                type: "string",
                required: false,
                input: true,
            },
            // Security fields
            failed_login_attempts: {
                type: "number",
                required: false,
                input: false,
                defaultValue: 0,
            },
            locked_until: {
                type: "date",
                required: false,
                input: false,
            },
        },
    },
    // Admin plugin with role-based access control
    plugins: [
        admin({
            defaultRole: "citizen",
        }),
    ],
    // Hooks for audit logging
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    console.log(`[AUDIT] User created: ${user.email} (${user.id})`);
                },
            },
            update: {
                after: async (user) => {
                    console.log(`[AUDIT] User updated: ${user.email} (${user.id})`);
                },
            },
        },
        session: {
            create: {
                after: async (session) => {
                    console.log(`[AUDIT] Session created for user: ${session.userId}`);
                },
            },
        },
    },
});
