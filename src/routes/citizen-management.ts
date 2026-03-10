import { Hono } from "hono";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import { config } from "../config/env.js";
import { adminAuth, superAdminAuth, type AuthContext } from "../middleware/auth.js";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

/**
 * Citizen Management Routes
 * Complete CRUD operations with audit tracking
 */
const citizenManagement = new Hono<{ Variables: AuthContext }>();

/**
 * Helper: Build search query
 */
const buildSearchQuery = (search: string) => {
  if (!search) return { where: "", params: [] as any[] };

  const searchLower = search.toLowerCase();
  return {
    where: `
      AND (
        LOWER(username) LIKE $1 OR
        LOWER(name) LIKE $1 OR
        LOWER(email) LIKE $1 OR
        phone_number LIKE $1
      )
    `,
    params: [`%${searchLower}%`]
  };
};

/**
 * POST /api/admin/citizens
 * Create a new citizen directly by admin (bypasses Fayda OTP)
 */
citizenManagement.post("/citizens", adminAuth(), async (c) => {
  try {
    const adminId = c.get('userId');
    const {
      fin,
      name,
      phone,
      password,
      email,
      dob,
      gender,
      photo_url
    } = await c.req.json();

    // Validate required fields
    if (!fin || !name || !phone || !password) {
      return c.json({
        success: false,
        error: "FIN, name, phone, and password are required"
      }, 400);
    }

    // Validate FIN format (12 digits)
    if (!/^\d{12}$/.test(fin)) {
      return c.json({
        success: false,
        error: "Invalid FIN. Must be 12 digits."
      }, 400);
    }

    // Check if FIN already exists
    const existingFin = await pool.query(
      'SELECT id FROM "user" WHERE username = $1 OR fin = $1',
      [fin]
    );

    if (existingFin.rows.length > 0) {
      return c.json({
        success: false,
        error: "Citizen with this FIN already exists"
      }, 409);
    }

    // Check if phone already exists
    const existingPhone = await pool.query(
      'SELECT id FROM "user" WHERE phone_number = $1',
      [phone]
    );

    if (existingPhone.rows.length > 0) {
      return c.json({
        success: false,
        error: "Citizen with this phone number already exists"
      }, 409);
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await pool.query(
        'SELECT id FROM "user" WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        return c.json({
          success: false,
          error: "Citizen with this email already exists"
        }, 409);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with all information
    const userResult = await pool.query(
      `INSERT INTO "user" (
        id, username, email, email_verified, name, role,
        phone_number, fin, dob, gender, photo_url,
        status, created_by, createdAt, updatedAt
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'citizen',
        $5, $6, $7, $8, $9,
        'active', $10, NOW(), NOW()
      ) RETURNING id`,
      [
        fin,                          // username = FIN
        email || null,                // email (optional)
        email ? true : false,         // email_verified
        name,                         // name
        phone,                        // phone_number
        fin,                          // fin
        dob || null,                  // dob (optional)
        gender || null,               // gender (optional)
        photo_url || null,            // photo_url (optional)
        adminId                       // created_by
      ]
    );

    const userId = userResult.rows[0].id;

    // Create account with password
    await pool.query(
      `INSERT INTO "account" (
        id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 'credential', $3, NOW(), NOW()
      )`,
      [userId, userId, hashedPassword]
    );

    // Get full citizen data
    const citizenData = await pool.query(
      `SELECT id, username, name, email, phone_number, status,
        createdAt, fin, dob, gender, photo_url
      FROM "user" WHERE id = $1`,
      [userId]
    );

    return c.json({
      success: true,
      message: "Citizen created successfully",
      data: citizenData.rows[0]
    });

  } catch (error: any) {
    console.error("[Citizen Management] Create error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to create citizen"
    }, 500);
  }
});

/**
 * GET /api/admin/citizens
 * List all citizens with pagination, filters, and search
 */
citizenManagement.get("/citizens", adminAuth(), async (c) => {
  try {
    const query = c.req.query();
    
    // Pagination
    const page = parseInt(query.page || "1");
    const limit = Math.min(parseInt(query.limit || "20"), 100);
    const offset = (page - 1) * limit;
    
    // Filters
    const status = query.status || "all";
    const sortBy = query.sortBy || "createdAt";
    const sortOrder = query.sortOrder || "desc";
    const search = query.search || "";
    
    // Build query
    let whereClause = "WHERE role = 'citizen'";
    let params: any[] = [];
    
    // Status filter
    if (status !== "all") {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    } else {
      // Exclude soft deleted by default unless explicitly requested
      whereClause += " AND deleted_at IS NULL";
    }
    
    // Search
    const searchQuery = buildSearchQuery(search);
    if (searchQuery.where) {
      whereClause += searchQuery.where;
      params.push(...searchQuery.params);
    }
    
    // Validate sort column
    const allowedSortColumns = ["createdAt", "name", "username", "last_login_at"];
    const orderColumn = allowedSortColumns.includes(sortBy) ? sortBy : "createdAt";
    const orderDirection = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM "user" ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get citizens
    const dataQuery = `
      SELECT 
        id, username, name, email, phone_number, status,
        createdAt, updatedAt, last_login_at,
        fin, dob, gender, image
      FROM "user"
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDirection}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    
    const dataResult = await pool.query(dataQuery, [...params, limit, offset]);
    
    const totalPages = Math.ceil(total / limit);
    
    return c.json({
      success: true,
      data: {
        citizens: dataResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error: any) {
    console.error("[Citizen Management] List error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to list citizens"
    }, 500);
  }
});

/**
 * GET /api/admin/citizens/:id
 * Get single citizen details
 */
citizenManagement.get("/citizens/:id", adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    
    const result = await pool.query(
      `SELECT 
        id, username, name, email, phone_number, status,
        createdAt, updatedAt, deleted_at, last_login_at,
        fin, dob, gender, photo_url,
        created_by, updated_by, deleted_by, deletion_reason,
        failed_login_attempts, locked_until
      FROM "user"
      WHERE id = $1 AND role = 'citizen'`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: "Citizen not found"
      }, 404);
    }
    
    // Get creator/updater/deleter names
    const citizen = result.rows[0];
    const adminIds = [citizen.created_by, citizen.updated_by, citizen.deleted_by].filter(Boolean);
    
    if (adminIds.length > 0) {
      const adminsResult = await pool.query(
        `SELECT id, name FROM "user" WHERE id = ANY($1)`,
        [adminIds]
      );
      
      const adminMap = new Map(adminsResult.rows.map(a => [a.id, a.name]));
      citizen.created_by_name = adminMap.get(citizen.created_by);
      citizen.updated_by_name = adminMap.get(citizen.updated_by);
      citizen.deleted_by_name = adminMap.get(citizen.deleted_by);
    }
    
    return c.json({
      success: true,
      data: citizen
    });
    
  } catch (error: any) {
    console.error("[Citizen Management] Get details error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to get citizen details"
    }, 500);
  }
});

/**
 * PUT /api/admin/citizens/:id
 * Update citizen information
 */
citizenManagement.put("/citizens/:id", adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('userId');
    const updates = await c.req.json();
    
    // Allowed fields to update
    const allowedFields = ['name', 'email', 'phone_number', 'dob', 'gender', 'photo_url'];
    const updateFields: string[] = [];
    const values: any[] = [];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = $${values.length + 1}`);
        values.push(updates[field]);
      }
    }
    
    if (updateFields.length === 0) {
      return c.json({
        success: false,
        error: "No valid fields to update"
      }, 400);
    }
    
    // Add updated_by and updated_at
    updateFields.push(`updated_by = $${values.length + 1}`);
    updateFields.push(`updatedAt = NOW()`);
    values.push(adminId, id);
    
    const query = `
      UPDATE "user"
      SET ${updateFields.join(', ')}
      WHERE id = $${values.length} AND role = 'citizen' AND deleted_at IS NULL
      RETURNING id, username, name, email, phone_number, updatedAt
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: "Citizen not found or has been deleted"
      }, 404);
    }
    
    return c.json({
      success: true,
      message: "Citizen updated successfully",
      data: result.rows[0]
    });
    
  } catch (error: any) {
    console.error("[Citizen Management] Update error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to update citizen"
    }, 500);
  }
});

/**
 * DELETE /api/admin/citizens/:id
 * Soft delete citizen
 */
citizenManagement.delete("/citizens/:id", adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('userId');
    const { reason } = await c.req.json();
    
    // Check if trying to delete self
    if (id === adminId) {
      return c.json({
        success: false,
        error: "Cannot delete your own account"
      }, 400);
    }
    
    const result = await pool.query(
      `UPDATE "user"
      SET 
        deleted_at = NOW(),
        deleted_by = $1,
        deletion_reason = $2,
        status = 'deleted'
      WHERE id = $3 AND role = 'citizen' AND deleted_at IS NULL
      RETURNING id, username, name`,
      [adminId, reason || 'No reason provided', id]
    );
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: "Citizen not found or already deleted"
      }, 404);
    }
    
    return c.json({
      success: true,
      message: "Citizen deleted successfully",
      data: result.rows[0]
    });
    
  } catch (error: any) {
    console.error("[Citizen Management] Delete error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to delete citizen"
    }, 500);
  }
});

/**
 * PATCH /api/admin/citizens/:id/status
 * Activate/Deactivate citizen
 */
citizenManagement.patch("/citizens/:id/status", adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('userId');
    const { status, reason } = await c.req.json();
    
    if (!['active', 'inactive'].includes(status)) {
      return c.json({
        success: false,
        error: "Status must be 'active' or 'inactive'"
      }, 400);
    }
    
    const result = await pool.query(
      `UPDATE "user"
      SET 
        status = $1,
        updated_by = $2,
        updatedAt = NOW()
      WHERE id = $3 AND role = 'citizen' AND deleted_at IS NULL
      RETURNING id, username, name, status`,
      [status, adminId, id]
    );
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: "Citizen not found or has been deleted"
      }, 404);
    }
    
    return c.json({
      success: true,
      message: `Citizen ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: result.rows[0]
    });
    
  } catch (error: any) {
    console.error("[Citizen Management] Status change error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to change citizen status"
    }, 500);
  }
});

/**
 * POST /api/admin/citizens/bulk-delete
 * Bulk delete citizens
 */
citizenManagement.post("/citizens/bulk-delete", adminAuth(), async (c) => {
  try {
    const adminId = c.get('userId');
    const { ids, reason } = await c.req.json();
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({
        success: false,
        error: "Please provide an array of citizen IDs"
      }, 400);
    }
    
    // Remove admin's own ID if present
    const filteredIds = ids.filter((id: string) => id !== adminId);
    
    const result = await pool.query(
      `UPDATE "user"
      SET 
        deleted_at = NOW(),
        deleted_by = $1,
        deletion_reason = $2,
        status = 'deleted'
      WHERE id = ANY($3) AND role = 'citizen' AND deleted_at IS NULL
      RETURNING id`,
      [adminId, reason || 'Bulk delete', filteredIds]
    );
    
    return c.json({
      success: true,
      message: `${result.rowCount} citizens deleted successfully`,
      data: {
        deletedCount: result.rowCount,
        requestedCount: ids.length
      }
    });
    
  } catch (error: any) {
    console.error("[Citizen Management] Bulk delete error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to delete citizens"
    }, 500);
  }
});

/**
 * POST /api/admin/citizens/bulk-status
 * Bulk activate/deactivate citizens
 */
citizenManagement.post("/citizens/bulk-status", adminAuth(), async (c) => {
  try {
    const adminId = c.get('userId');
    const { ids, status } = await c.req.json();
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({
        success: false,
        error: "Please provide an array of citizen IDs"
      }, 400);
    }
    
    if (!['active', 'inactive'].includes(status)) {
      return c.json({
        success: false,
        error: "Status must be 'active' or 'inactive'"
      }, 400);
    }
    
    const result = await pool.query(
      `UPDATE "user"
      SET 
        status = $1,
        updated_by = $2,
        updatedAt = NOW()
      WHERE id = ANY($3) AND role = 'citizen' AND deleted_at IS NULL
      RETURNING id`,
      [status, adminId, ids]
    );
    
    return c.json({
      success: true,
      message: `${result.rowCount} citizens ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: {
        updatedCount: result.rowCount,
        requestedCount: ids.length
      }
    });
    
  } catch (error: any) {
    console.error("[Citizen Management] Bulk status error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to update citizens"
    }, 500);
  }
});

/**
 * POST /api/admin/citizens/:id/restore
 * Restore soft-deleted citizen (Super Admin only)
 */
citizenManagement.post("/citizens/:id/restore", adminAuth(), superAdminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('userId');
    
    const result = await pool.query(
      `UPDATE "user"
      SET 
        deleted_at = NULL,
        deleted_by = NULL,
        deletion_reason = NULL,
        status = 'active',
        updated_by = $1,
        updatedAt = NOW()
      WHERE id = $2 AND role = 'citizen' AND deleted_at IS NOT NULL
      RETURNING id, username, name`,
      [adminId, id]
    );
    
    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: "Citizen not found or not deleted"
      }, 404);
    }
    
    return c.json({
      success: true,
      message: "Citizen restored successfully",
      data: result.rows[0]
    });
    
  } catch (error: any) {
    console.error("[Citizen Management] Restore error:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to restore citizen"
    }, 500);
  }
});

export default citizenManagement;
