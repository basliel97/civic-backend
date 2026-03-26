import { pool } from '../db/pool.js';

export async function createReport(
  itemId: string,
  itemType: string,
  itemTitle: string,
  user_id: string,
  reason: string,
  description?: string
) {
  const result = await pool.query(
    `INSERT INTO reports (item_id, item_type, item_title, user_id, reason, description)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [itemId, itemType, itemTitle, user_id, reason, description || null]
  );
  return result.rows[0];
}

export async function getReports(status?: string, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT r.*, u.name as reporter_name
    FROM reports r
    JOIN "user" u ON r.user_id = u.id
  `;
  
  const params: any[] = [];
  
  if (status) {
    query += ` WHERE r.status = $1`;
    params.push(status);
  }
  
  query += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  
  const result = await pool.query(query, [...params, limit, offset]);
  
  const countQuery = status 
    ? 'SELECT COUNT(*) FROM reports WHERE status = $1'
    : 'SELECT COUNT(*) FROM reports';
  const countResult = await pool.query(countQuery, status ? [status] : []);
  
  return {
    reports: result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

export async function getReportById(id: string) {
  const result = await pool.query(
    `SELECT r.*, u.name as reporter_name
     FROM reports r
     JOIN "user" u ON r.user_id = u.id
     WHERE r.id = $1`,
    [id]
  );
  return result.rows[0];
}

export async function resolveReport(id: string, resolvedBy: string, resolution: string) {
  const result = await pool.query(
    `UPDATE reports SET status = 'resolved', resolved_by = $1, resolution = $2, resolved_at = NOW()
     WHERE id = $3 RETURNING *`,
    [resolvedBy, resolution, id]
  );
  return result.rows[0];
}

export async function rejectReport(id: string) {
  const result = await pool.query(
    `UPDATE reports SET status = 'rejected' WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

export async function getUserReports(user_id: string) {
  const result = await pool.query(
    `SELECT * FROM reports WHERE user_id = $1 ORDER BY created_at DESC`,
    [user_id]
  );
  return result.rows;
}
