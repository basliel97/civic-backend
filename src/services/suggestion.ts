import { pool } from '../db/pool.js';

export async function getBureaus() {
  const result = await pool.query(
    'SELECT * FROM bureaus WHERE status = $1 ORDER BY name ASC',
    ['active']
  );
  return result.rows;
}

export async function getBureauById(id: string) {
  const result = await pool.query('SELECT * FROM bureaus WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createBureau(data: { name: string; description?: string; contact_email?: string; phone?: string; address?: string }) {
  const result = await pool.query(
    `INSERT INTO bureaus (name, description, contact_email, phone, address)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.name, data.description || null, data.contact_email || null, data.phone || null, data.address || null]
  );
  return result.rows[0];
}

export async function updateBureau(id: string, data: Partial<{ name: string; description: string; contact_email: string; phone: string; address: string; status: string }>) {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;
  
  const fields = ['name', 'description', 'contact_email', 'phone', 'address', 'status'];
  
  for (const field of fields) {
    if (data[field as keyof typeof data] !== undefined) {
      updates.push(`${field} = $${paramCount++}`);
      values.push(data[field as keyof typeof data]);
    }
  }
  
  if (updates.length === 0) return null;
  
  values.push(id);
  const result = await pool.query(
    `UPDATE bureaus SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteBureau(id: string) {
  const result = await pool.query('UPDATE bureaus SET status = $1 WHERE id = $2 RETURNING *', ['deleted', id]);
  return result.rows[0];
}

export async function createSuggestion(user_id: string, bureauId: string, subject: string, content: string) {
  const result = await pool.query(
    `INSERT INTO suggestions (user_id, bureau_id, subject, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [user_id, bureauId, subject, content]
  );
  return result.rows[0];
}

export async function getMySuggestions(user_id: string, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  
  const result = await pool.query(
    `SELECT s.*, b.name as bureau_name
     FROM suggestions s
     JOIN bureaus b ON s.bureau_id = b.id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT $2 OFFSET $3`,
    [user_id, limit, offset]
  );
  
  const countResult = await pool.query(
    'SELECT COUNT(*) FROM suggestions WHERE user_id = $1',
    [user_id]
  );
  
  return {
    suggestions: result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

export async function getSuggestionById(id: string) {
  const result = await pool.query(
    `SELECT s.*, b.name as bureau_name, u.name as user_name
     FROM suggestions s
     JOIN bureaus b ON s.bureau_id = b.id
     JOIN "user" u ON s.user_id = u.id
     WHERE s.id = $1`,
    [id]
  );
  return result.rows[0];
}

export async function getSuggestions(bureauId?: string, status?: string, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT s.*, b.name as bureau_name, u.name as user_name, u.username as user_fin
    FROM suggestions s
    JOIN bureaus b ON s.bureau_id = b.id
    JOIN "user" u ON s.user_id = u.id
    WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (bureauId) {
    params.push(bureauId);
    query += ` AND s.bureau_id = $${params.length}`;
  }
  
  if (status) {
    params.push(status);
    query += ` AND s.status = $${params.length}`;
  }
  
  query += ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  
  const result = await pool.query(query, [...params, limit, offset]);
  
  const countQuery = 'SELECT COUNT(*) FROM suggestions WHERE 1=1' + 
    (bureauId ? ` AND bureau_id = $1` : '') +
    (status ? ` AND status = $${bureauId ? '$2' : '$1'}` : '');
  
  const countResult = await pool.query(countQuery, params);
  
  return {
    suggestions: result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

export async function respondToSuggestion(id: string, respondedBy: string, response: string) {
  const result = await pool.query(
    `UPDATE suggestions SET status = 'resolved', response = $1, responded_by = $2, responded_at = NOW()
     WHERE id = $3 RETURNING *`,
    [response, respondedBy, id]
  );
  return result.rows[0];
}

export async function updateSuggestionStatus(id: string, status: string) {
  const result = await pool.query(
    'UPDATE suggestions SET status = $1 WHERE id = $2 RETURNING *',
    [status, id]
  );
  return result.rows[0];
}
