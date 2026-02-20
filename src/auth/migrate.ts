/**
 * Migration utilities to migrate users from Supabase Auth to Better Auth
 */
import { Pool } from "pg";
import { supabaseAdmin } from "../services/supabase.js";
import { config } from "../config/env.js";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

/**
 * Get all existing users from Supabase profiles table
 */
export async function getSupabaseUsers() {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("*");

  if (error) {
    throw new Error(`Failed to fetch profiles: ${error.message}`);
  }

  return profiles || [];
}

/**
 * Get auth user details from Supabase Auth
 */
export async function getSupabaseAuthUser(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  
  if (error) {
    throw new Error(`Failed to fetch auth user: ${error.message}`);
  }

  return data.user;
}

/**
 * Migrate a single user to Better Auth
 */
export async function migrateUserToBetterAuth(profile: any) {
  try {
    // Get the auth user details from Supabase
    const authUser = await getSupabaseAuthUser(profile.id);
    
    if (!authUser || !authUser.email) {
      console.warn(`Skipping user ${profile.id} - no email found`);
      return null;
    }

    // Check if user already exists in Better Auth
    const existingUser = await pool.query(
      'SELECT id FROM "user" WHERE email = $1',
      [authUser.email]
    );

    if (existingUser.rows.length > 0) {
      console.log(`User ${authUser.email} already exists in Better Auth, skipping...`);
      return existingUser.rows[0];
    }

    // Insert user into Better Auth tables
    const result = await pool.query(
      `
      INSERT INTO "user" (
        id, email, email_verified, name, role, 
        created_at, updated_at,
        fin, phone_number, dob, gender, photo_url,
        failed_login_attempts, locked_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
      `,
      [
        profile.id,
        authUser.email,
        authUser.email_confirmed_at ? new Date(authUser.email_confirmed_at) : null,
        profile.full_name,
        profile.role || "citizen",
        new Date(profile.created_at || Date.now()),
        new Date(profile.updated_at || Date.now()),
        profile.fin,
        profile.phone_number,
        profile.dob,
        profile.gender,
        profile.photo_url,
        profile.failed_login_attempts || 0,
        profile.locked_until ? new Date(profile.locked_until) : null,
      ]
    );

    console.log(`Migrated user: ${authUser.email} (${profile.role})`);
    return result.rows[0];
  } catch (error: any) {
    console.error(`Failed to migrate user ${profile.id}:`, error.message);
    throw error;
  }
}

/**
 * Run full migration for all users
 */
export async function runMigration() {
  console.log("Starting migration from Supabase to Better Auth...");
  
  try {
    const profiles = await getSupabaseUsers();
    console.log(`Found ${profiles.length} profiles to migrate`);

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const profile of profiles) {
      try {
        const result = await migrateUserToBetterAuth(profile);
        if (result) {
          migrated++;
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        console.error(`Migration failed for profile ${profile.id}:`, error);
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Total profiles: ${profiles.length}`);
    console.log(`Successfully migrated: ${migrated}`);
    console.log(`Skipped (already exist): ${skipped}`);
    console.log(`Failed: ${failed}`);
    console.log("========================\n");

    return { migrated, skipped, failed, total: profiles.length };
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then(() => {
      console.log("Migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
