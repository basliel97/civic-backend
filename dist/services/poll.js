import { pool } from '../db/pool.js';
import { notifyTargetedCitizens } from './agency.js';
/**
 * 🔒 INTERNAL: The Eligibility Engine
 * Implements strict "AND" logic between categories.
 */
// src/services/poll.ts
function calculateUserEligibility(poll, userRegion, userGender, userWorkType) {
    const criteria = poll.target_criteria || {};
    // 1. Convert user data to lowercase for safe matching
    const uRegion = userRegion?.trim().toLowerCase();
    const uGender = userGender?.trim().toLowerCase();
    const uWork = userWorkType?.trim().toLowerCase();
    // 2. Check Region
    if (criteria.regions && criteria.regions.length > 0) {
        // Convert all allowed regions in DB to lowercase to compare
        const allowedRegions = criteria.regions.map((r) => r.toLowerCase());
        if (!uRegion || !allowedRegions.includes(uRegion)) {
            return false;
        }
    }
    // 3. Check Gender
    if (criteria.genders && criteria.genders.length > 0) {
        const allowedGenders = criteria.genders.map((g) => g.toLowerCase());
        if (!uGender || !allowedGenders.includes(uGender)) {
            return false;
        }
    }
    // 4. Check Work Type
    if (criteria.work_types && criteria.work_types.length > 0) {
        const allowedWorks = criteria.work_types.map((w) => w.toLowerCase());
        if (!uWork || !allowedWorks.includes(uWork)) {
            return false;
        }
    }
    return true;
}
/**
 * 1. GET ALL POLLS (Citizen View)
 */
export async function getPolls(user_id, userRegion, userGender, userWorkType, category) {
    const now = new Date();
    // 1. Fetch polls (We removed the strict 'active' filter so we can see 'closed' ones too)
    let query = `
    SELECT p.*, 
      (SELECT COUNT(*)::INT FROM poll_votes WHERE poll_id = p.id) as vote_count
    FROM polls p
    WHERE p.status != 'draft' -- Show active and closed, hide drafts
  `;
    const params = [];
    if (category && category !== 'All') {
        params.push(category.toLowerCase());
        query += ` AND p.category = $${params.length}`;
    }
    const result = await pool.query(query + ' ORDER BY p.created_at DESC', params);
    // 2. Fetch all votes by this user to mark 'has_voted'
    let userVotes = new Map();
    if (user_id) {
        const votes = await pool.query('SELECT poll_id, option_index FROM poll_votes WHERE user_id = $1', [user_id]);
        userVotes = new Map(votes.rows.map(v => [v.poll_id, v.option_index]));
    }
    // 3. Process every poll to include results and eligibility
    const processedPolls = await Promise.all(result.rows.map(async (poll) => {
        const hasVoted = userVotes.has(poll.id);
        const isExpired = new Date() > new Date(poll.end_date);
        let results = null;
        // 🆕 THE FIX: If the user voted OR the poll is closed, calculate the results now
        if (hasVoted || isExpired) {
            const votesRes = await pool.query(`SELECT option_index, COUNT(*)::INT as count FROM poll_votes WHERE poll_id = $1 GROUP BY option_index`, [poll.id]);
            const total = votesRes.rows.reduce((sum, v) => sum + v.count, 0);
            results = {
                total_votes: total,
                options: (poll.options || []).map((opt, i) => {
                    const row = votesRes.rows.find(v => v.option_index === i);
                    const count = row ? row.count : 0;
                    return { index: i, percentage: total > 0 ? Math.round((count / total) * 100) : 0 };
                })
            };
        }
        return {
            ...poll,
            has_voted: hasVoted,
            user_vote: userVotes.get(poll.id),
            user_can_vote: calculateUserEligibility(poll, userRegion, userGender, userWorkType),
            results // 👈 Now contains the percentages for the list view!
        };
    }));
    return processedPolls;
}
/**
 * 2. GET ALL POLLS (Admin View)
 */
export async function getAllPollsForAdmin() {
    const result = await pool.query(`
    SELECT p.*, 
      (SELECT COUNT(*)::INT FROM poll_votes WHERE poll_id = p.id) as vote_count
    FROM polls p 
    ORDER BY p.created_at DESC
  `);
    const now = new Date();
    return result.rows.map(poll => ({
        ...poll,
        voting_open: poll.status === 'active' && now >= new Date(poll.start_date) && now <= new Date(poll.end_date),
    }));
}
/**
 * 3. GET SINGLE POLL BY ID
 */
export async function getPollById(id, user_id) {
    // Update view stats
    await pool.query('UPDATE polls SET view_count = view_count + 1 WHERE id = $1', [id]);
    const result = await pool.query('SELECT * FROM polls WHERE id = $1', [id]);
    if (!result.rows[0])
        return null;
    const poll = result.rows[0];
    if (user_id) {
        const vote = await pool.query('SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [id, user_id]);
        poll.has_voted = vote.rows.length > 0;
        poll.user_vote = vote.rows[0]?.option_index;
    }
    return poll;
}
/**
 * 4. CREATE POLL
 */
export async function createPoll(data, createdBy) {
    const options = data.options?.map((opt, i) => ({
        label: opt.label,
        color: opt.color || getDefaultColor(i)
    })) || [];
    const result = await pool.query(`INSERT INTO polls (title, description, options, target_criteria, start_date, end_date, status, allow_view_results_before_vote, allow_view_results_after_vote, show_results_live, created_by, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`, [
        data.title,
        data.description || '',
        JSON.stringify(options),
        JSON.stringify(data.target_criteria || {}),
        data.start_date,
        data.end_date,
        data.status || 'draft',
        data.allow_view_results_before_vote || false,
        data.allow_view_results_after_vote ?? true,
        data.show_results_live ?? true,
        createdBy,
        data.category || 'general'
    ]);
    const poll = result.rows[0];
    // Notify targeted citizens
    try {
        await notifyTargetedCitizens(poll.target_criteria, {
            title: 'New Government Poll',
            message: 'A new proposal needs your vote: ' + poll.title,
            screen: '/community/poll/',
            targetId: poll.id
        });
    }
    catch (error) {
        console.error('Failed to notify targeted citizens for poll:', poll.id, error);
    }
    return poll;
}
/**
 * 5. UPDATE POLL
 */
export async function updatePoll(id, data) {
    const updates = [];
    const values = [];
    let paramCount = 1;
    const fields = [
        'title', 'description', 'target_criteria', 'start_date', 'end_date',
        'status', 'allow_view_results_before_vote', 'allow_view_results_after_vote',
        'show_results_live', 'category'
    ];
    for (const field of fields) {
        if (data[field] !== undefined) {
            let val = data[field];
            if (field === 'target_criteria' && typeof val === 'object')
                val = JSON.stringify(val);
            updates.push(`${field} = $${paramCount++}`);
            values.push(val);
        }
    }
    if (data.options) {
        updates.push(`options = $${paramCount++}`);
        values.push(JSON.stringify(data.options));
    }
    if (updates.length === 0)
        return null;
    values.push(id);
    const result = await pool.query(`UPDATE polls SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`, values);
    return result.rows[0];
}
/**
 * 6. DELETE POLL
 */
export async function deletePoll(id) {
    const result = await pool.query('DELETE FROM polls WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
}
/**
 * 7. VOTE IN POLL
 */
export async function votePoll(pollId, user_id, optionIndex, userRegion, userGender, userWorkType) {
    const pollRes = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (pollRes.rows.length === 0)
        throw { code: 'NOT_FOUND', message: 'Poll not found' };
    const poll = pollRes.rows[0];
    if (poll.status !== 'active')
        throw { code: 'INACTIVE', message: 'Poll is not currently active' };
    const now = new Date();
    if (now < new Date(poll.start_date) || now > new Date(poll.end_date)) {
        throw { code: 'EXPIRED', message: 'Poll voting period has ended' };
    }
    // Validate Eligibility
    const isEligible = calculateUserEligibility(poll, userRegion, userGender, userWorkType);
    if (!isEligible) {
        throw { code: 'NOT_TARGETED', message: 'Your profile does not meet the requirements to vote in this poll.' };
    }
    // Check Duplicate
    const existingVote = await pool.query('SELECT id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollId, user_id]);
    if (existingVote.rows.length > 0)
        throw { code: 'ALREADY_VOTED', message: 'You have already participated in this poll.' };
    // Validate Index
    if (optionIndex < 0 || optionIndex >= (poll.options?.length || 0)) {
        throw { code: 'INVALID_OPTION', message: 'Invalid choice selected' };
    }
    const result = await pool.query('INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES ($1, $2, $3) RETURNING *', [pollId, user_id, optionIndex]);
    return result.rows[0];
}
/**
 * 8. GET RESULTS
 */
export async function getPollResults(pollId, user_id, userRole) {
    const pollRes = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (pollRes.rows.length === 0)
        throw { code: 'NOT_FOUND', message: 'Poll not found' };
    const p = pollRes.rows[0];
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const userVoteRes = user_id
        ? await pool.query('SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollId, user_id])
        : null;
    const hasVoted = !!(userVoteRes && userVoteRes.rows.length > 0);
    // Results Visibility Check
    if (!isAdmin) {
        if (!hasVoted && !p.allow_view_results_before_vote) {
            throw { code: 'VOTE_REQUIRED', message: 'You must participate to view live results' };
        }
        if (hasVoted && !p.allow_view_results_after_vote) {
            throw { code: 'NOT_ALLOWED', message: 'The results for this poll are private' };
        }
    }
    const votesRes = await pool.query(`SELECT option_index, COUNT(*)::INT as count FROM poll_votes WHERE poll_id = $1 GROUP BY option_index`, [pollId]);
    const totalVotes = votesRes.rows.reduce((sum, v) => sum + v.count, 0);
    const options = (p.options || []).map((opt, i) => {
        const voteRow = votesRes.rows.find(v => v.option_index === i);
        const count = voteRow ? voteRow.count : 0;
        return {
            index: i,
            label: opt.label,
            color: opt.color,
            count,
            percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
        };
    });
    return {
        poll_id: pollId,
        total_votes: totalVotes,
        has_voted: hasVoted,
        user_vote: userVoteRes?.rows[0]?.option_index,
        options,
        poll_status: p.status,
        voting_open: p.status === 'active' && new Date() >= new Date(p.start_date) && new Date() <= new Date(p.end_date)
    };
}
/**
 * 🎨 HELPER: Get default hex colors for options
 */
function getDefaultColor(index) {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];
    return colors[index % colors.length];
}
