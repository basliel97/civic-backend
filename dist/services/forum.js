import { pool } from '../db/pool.js';
import { checkProfanity, stripHtmlTags } from './profanity.js';
export async function getForums(user_id, userRegion, userWorkType) {
    let query = `
    SELECT f.*, 
      (SELECT COUNT(*) FROM posts WHERE forum_id = f.id AND status = 'active') as post_count
    FROM forums f
    WHERE f.status = 'active'
  `;
    const result = await pool.query(query + ' ORDER BY f.is_system DESC, f.name ASC');
    return result.rows;
}
export async function getForumById(id) {
    const result = await pool.query(`SELECT f.*, 
      (SELECT COUNT(*) FROM posts WHERE forum_id = f.id AND status = 'active') as post_count
    FROM forums f WHERE f.id = $1`, [id]);
    return result.rows[0];
}
export async function createForum(data, createdBy) {
    const result = await pool.query(`INSERT INTO forums (name, description, icon, category, is_system, is_restricted, allowed_roles, allowed_regions, allowed_work_types, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`, [
        data.name,
        data.description || '',
        data.icon || '',
        data.category || 'general',
        false,
        data.is_restricted || false,
        JSON.stringify(data.allowed_roles || []),
        JSON.stringify(data.allowed_regions || []),
        JSON.stringify(data.allowed_work_types || []),
        createdBy
    ]);
    return result.rows[0];
}
export async function updateForum(id, data) {
    const updates = [];
    const values = [];
    let paramCount = 1;
    const fields = ['name', 'description', 'icon', 'category', 'is_restricted', 'allowed_roles', 'allowed_regions', 'allowed_work_types', 'status'];
    for (const field of fields) {
        if (data[field] !== undefined) {
            updates.push(`${field} = $${paramCount}`);
            let value = data[field];
            if (['allowed_roles', 'allowed_regions', 'allowed_work_types'].includes(field) && typeof value === 'object') {
                value = JSON.stringify(value);
            }
            values.push(value);
            paramCount++;
        }
    }
    if (updates.length === 0)
        return null;
    values.push(id);
    const result = await pool.query(`UPDATE forums SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`, values);
    return result.rows[0];
}
export async function deleteForum(id) {
    const result = await pool.query('DELETE FROM forums WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
}
export async function getPostsInForum(forumId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const result = await pool.query(`SELECT p.*, u.name as user_name, f.name as forum_name
     FROM posts p
     JOIN "user" u ON p.user_id = u.id
     JOIN forums f ON p.forum_id = f.id
     WHERE p.forum_id = $1 AND p.status = 'active'
     ORDER BY p.is_pinned DESC, p.created_at DESC
     LIMIT $2 OFFSET $3`, [forumId, limit, offset]);
    const countResult = await pool.query('SELECT COUNT(*) FROM posts WHERE forum_id = $1 AND status = $2', [forumId, 'active']);
    return {
        posts: result.rows,
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
}
export async function getPostById(id) {
    await pool.query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [id]);
    const result = await pool.query(`SELECT p.*, u.name as user_name, f.name as forum_name
     FROM posts p
     JOIN "user" u ON p.user_id = u.id
     JOIN forums f ON p.forum_id = f.id
     WHERE p.id = $1`, [id]);
    return result.rows[0];
}
export async function createPost(forumId, user_id, title, content) {
    // Strip HTML tags to prevent XSS
    const sanitizedTitle = stripHtmlTags(title);
    const sanitizedContent = stripHtmlTags(content);
    const profanityCheck = await checkProfanity(sanitizedTitle + ' ' + sanitizedContent);
    if (!profanityCheck.isClean) {
        throw {
            code: 'PROFANITY_DETECTED',
            message: 'Content contains inappropriate language',
            matchedWords: profanityCheck.matchedWords,
            severity: profanityCheck.severity
        };
    }
    const result = await pool.query(`INSERT INTO posts (forum_id, user_id, title, content) VALUES ($1, $2, $3, $4) RETURNING *`, [forumId, user_id, sanitizedTitle, sanitizedContent]);
    return result.rows[0];
}
export async function updatePost(id, user_id, data, isAdmin) {
    const post = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    if (post.rows.length === 0)
        return null;
    if (!isAdmin && post.rows[0].user_id !== user_id) {
        throw { code: 'UNAUTHORIZED', message: 'You can only edit your own posts' };
    }
    // Sanitize input
    const sanitizedTitle = data.title ? stripHtmlTags(data.title) : undefined;
    const sanitizedContent = data.content ? stripHtmlTags(data.content) : undefined;
    if (sanitizedTitle || sanitizedContent) {
        const newTitle = sanitizedTitle || post.rows[0].title;
        const newContent = sanitizedContent || post.rows[0].content;
        const profanityCheck = await checkProfanity(newTitle + ' ' + newContent);
        if (!profanityCheck.isClean) {
            throw {
                code: 'PROFANITY_DETECTED',
                message: 'Content contains inappropriate language',
                matchedWords: profanityCheck.matchedWords
            };
        }
    }
    const updates = [];
    const values = [];
    let paramCount = 1;
    if (sanitizedTitle) {
        updates.push(`title = $${paramCount++}`);
        values.push(sanitizedTitle);
    }
    if (sanitizedContent) {
        updates.push(`content = $${paramCount++}`);
        values.push(sanitizedContent);
    }
    if (updates.length === 0)
        return post.rows[0];
    values.push(id);
    const result = await pool.query(`UPDATE posts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`, values);
    return result.rows[0];
}
export async function deletePost(id, user_id, userRole) {
    const post = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    if (post.rows.length === 0)
        return null;
    if (userRole !== 'admin' && userRole !== 'super_admin' && post.rows[0].user_id !== user_id) {
        const isMod = await pool.query('SELECT * FROM forum_mods WHERE forum_id = $1 AND user_id = $2', [post.rows[0].forum_id, user_id]);
        if (isMod.rows.length === 0) {
            throw { code: 'UNAUTHORIZED', message: 'You cannot delete this post' };
        }
    }
    await pool.query('UPDATE posts SET status = $1, reply_count = 0 WHERE id = $2', ['deleted', id]);
    await pool.query('UPDATE replies SET status = $1 WHERE post_id = $2', ['deleted', id]);
    return post.rows[0];
}
export async function getReplies(postId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const result = await pool.query(`SELECT r.*, u.name as user_name
     FROM replies r
     JOIN "user" u ON r.user_id = u.id
     WHERE r.post_id = $1 AND r.status = 'active'
     ORDER BY r.created_at ASC
     LIMIT $2 OFFSET $3`, [postId, limit, offset]);
    return result.rows;
}
export async function createReply(postId, user_id, content) {
    const post = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (post.rows.length === 0)
        throw { code: 'NOT_FOUND', message: 'Post not found' };
    if (post.rows[0].is_locked)
        throw { code: 'LOCKED', message: 'Post is locked' };
    // Strip HTML tags to prevent XSS
    const sanitizedContent = stripHtmlTags(content);
    const profanityCheck = await checkProfanity(sanitizedContent);
    if (!profanityCheck.isClean) {
        throw {
            code: 'PROFANITY_DETECTED',
            message: 'Content contains inappropriate language',
            matchedWords: profanityCheck.matchedWords
        };
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`INSERT INTO replies (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`, [postId, user_id, sanitizedContent]);
        await client.query('UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1', [postId]);
        await client.query('COMMIT');
        return result.rows[0];
    }
    catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    finally {
        client.release();
    }
}
export async function deleteReply(id, user_id, userRole) {
    const reply = await pool.query('SELECT * FROM replies WHERE id = $1', [id]);
    if (reply.rows.length === 0)
        return null;
    if (userRole !== 'admin' && userRole !== 'super_admin' && reply.rows[0].user_id !== user_id) {
        throw { code: 'UNAUTHORIZED', message: 'You cannot delete this reply' };
    }
    await pool.query('UPDATE replies SET status = $1 WHERE id = $2', ['deleted', id]);
    await pool.query('UPDATE posts SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = $1', [reply.rows[0].post_id]);
    return reply.rows[0];
}
export async function togglePinPost(postId) {
    const post = await pool.query('SELECT is_pinned FROM posts WHERE id = $1', [postId]);
    if (post.rows.length === 0)
        return null;
    const newStatus = !post.rows[0].is_pinned;
    await pool.query('UPDATE posts SET is_pinned = $1 WHERE id = $2', [newStatus, postId]);
    return { is_pinned: newStatus };
}
export async function toggleLockPost(postId) {
    const post = await pool.query('SELECT is_locked FROM posts WHERE id = $1', [postId]);
    if (post.rows.length === 0)
        return null;
    const newStatus = !post.rows[0].is_locked;
    await pool.query('UPDATE posts SET is_locked = $1 WHERE id = $2', [newStatus, postId]);
    return { is_locked: newStatus };
}
