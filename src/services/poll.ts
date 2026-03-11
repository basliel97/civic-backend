import { Pool } from 'pg';
import { config } from '../config/env.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

export interface Poll {
  id: string;
  title: string;
  description: string;
  options: { label: string; color: string }[];
  target_criteria: {
    regions?: string[];
    genders?: string[];
    work_types?: string[];
  };
  start_date: Date;
  end_date: Date;
  status: 'draft' | 'active' | 'closed';
  allow_view_results_before_vote: boolean;
  allow_view_results_after_vote: boolean;
  show_results_live: boolean;
  created_by: string;
  created_at: Date;
  has_voted?: boolean;
  user_vote?: number;
}

export interface PollResults {
  poll_id: string;
  total_votes: number;
  options: {
    index: number;
    label: string;
    color: string;
    count: number;
    percentage: number;
  }[];
}

export async function getPolls(user_id?: string, userRegion?: string, userGender?: string, userWorkType?: string) {
  const now = new Date();
  
  let query = `
    SELECT p.*, 
      (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) as vote_count
    FROM polls p
    WHERE p.status = 'active'
    AND p.start_date <= $1
    AND p.end_date >= $1
  `;
  
  const result = await pool.query(query + ' ORDER BY p.created_at DESC', [now]);
  
  const polls = result.rows.map(poll => {
    const criteria = poll.target_criteria || {};
    
    let canVote = true;
    if (criteria.regions && criteria.regions.length > 0) {
      canVote = userRegion && criteria.regions.includes(userRegion.toLowerCase());
    }
    if (canVote && criteria.genders && criteria.genders.length > 0) {
      canVote = userGender && criteria.genders.includes(userGender.toLowerCase());
    }
    if (canVote && criteria.work_types && criteria.work_types.length > 0) {
      canVote = userWorkType && criteria.work_types.includes(userWorkType.toLowerCase());
    }
    
    return {
      ...poll,
      is_targeted: Object.keys(criteria).some(k => criteria[k]?.length > 0),
      user_can_vote: canVote
    };
  });
  
  if (user_id) {
    const votes = await pool.query(
      'SELECT poll_id, option_index FROM poll_votes WHERE user_id = $1',
      [user_id]
    );
    const voteMap = new Map(votes.rows.map(v => [v.poll_id, v.option_index]));
    
    return polls.map(p => ({
      ...p,
      has_voted: voteMap.has(p.id),
      user_vote: voteMap.get(p.id)
    }));
  }
  
  return polls;
}

export async function getAllPollsForAdmin() {
  const result = await pool.query(`
    SELECT 
      p.*,
      (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) as vote_count
    FROM polls p
    ORDER BY p.created_at DESC
  `);

  const now = new Date();

  return result.rows.map(poll => ({
    ...poll,
    vote_count: parseInt(poll.vote_count, 10),
    voting_open:
      poll.status === 'active' &&
      now >= new Date(poll.start_date) &&
      now <= new Date(poll.end_date),
  }));
}


export async function getPollById(id: string, user_id?: string) {
  const result = await pool.query('SELECT * FROM polls WHERE id = $1', [id]);
  if (!result.rows[0]) return null;
  
  const poll = result.rows[0];
  
  if (user_id) {
    const vote = await pool.query(
      'SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
      [id, user_id]
    );
    poll.has_voted = vote.rows.length > 0;
    poll.user_vote = vote.rows[0]?.option_index;
  }
  
  return poll;
}

export async function createPoll(data: Partial<Poll>, createdBy: string) {
  const options = data.options?.map((opt, i) => ({
    label: opt.label,
    color: opt.color || getDefaultColor(i)
  })) || [];
  
  const result = await pool.query(
    `INSERT INTO polls (title, description, options, target_criteria, start_date, end_date, status, allow_view_results_before_vote, allow_view_results_after_vote, show_results_live, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
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
      createdBy
    ]
  );
  return result.rows[0];
}

export async function updatePoll(id: string, data: Partial<Poll>) {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;
  
  const fields = ['title', 'description', 'target_criteria', 'start_date', 'end_date', 'status', 'allow_view_results_before_vote', 'allow_view_results_after_vote', 'show_results_live'];
  
  for (const field of fields) {
    if (data[field as keyof Poll] !== undefined) {
      updates.push(`${field} = $${paramCount}`);
      let value = data[field as keyof Poll];
      if (field === 'target_criteria' && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      values.push(value);
      paramCount++;
    }
  }
  
  if (data.options) {
    updates.push(`options = $${paramCount++}`);
    values.push(JSON.stringify(data.options));
  }
  
  if (updates.length === 0) return null;
  
  values.push(id);
  const result = await pool.query(
    `UPDATE polls SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deletePoll(id: string) {
  const result = await pool.query('DELETE FROM polls WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
}

export async function votePoll(pollId: string, user_id: string, optionIndex: number, userRegion?: string, userGender?: string, userWorkType?: string) {
  const poll = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
  
  if (poll.rows.length === 0) {
    throw { code: 'NOT_FOUND', message: 'Poll not found' };
  }
  
  const p = poll.rows[0];
  
  if (p.status !== 'active') {
    throw { code: 'INACTIVE', message: 'Poll is not active' };
  }
  
  const now = new Date();
  if (now < new Date(p.start_date) || now > new Date(p.end_date)) {
    throw { code: 'EXPIRED', message: 'Poll voting period has ended' };
  }
  
  const criteria = p.target_criteria || {};
  
  if (criteria.regions && criteria.regions.length > 0) {
    if (!userRegion || !criteria.regions.includes(userRegion.toLowerCase())) {
      throw { code: 'NOT_TARGETED', message: 'You are not eligible to vote in this poll' };
    }
  }
  
  if (criteria.genders && criteria.genders.length > 0) {
    if (!userGender || !criteria.genders.includes(userGender.toLowerCase())) {
      throw { code: 'NOT_TARGETED', message: 'You are not eligible to vote in this poll' };
    }
  }
  
  if (criteria.work_types && criteria.work_types.length > 0) {
    if (!userWorkType || !criteria.work_types.includes(userWorkType.toLowerCase())) {
      throw { code: 'NOT_TARGETED', message: 'You are not eligible to vote in this poll' };
    }
  }
  
  const existingVote = await pool.query(
    'SELECT * FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
    [pollId, user_id]
  );
  
  if (existingVote.rows.length > 0) {
    throw { code: 'ALREADY_VOTED', message: 'You have already voted in this poll' };
  }
  
  const options = p.options || [];
  if (optionIndex < 0 || optionIndex >= options.length) {
    throw { code: 'INVALID_OPTION', message: 'Invalid option selected' };
  }
  
  const result = await pool.query(
    'INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES ($1, $2, $3) RETURNING *',
    [pollId, user_id, optionIndex]
  );
  
  return result.rows[0];
}

export async function getPollResults(
  pollId: string,
  user_id?: string,
  userRole?: string // 'admin' | 'user'
) {
  // 1️⃣ Get poll
  const poll = await pool.query(
    'SELECT * FROM polls WHERE id = $1',
    [pollId]
  );

  if (poll.rows.length === 0) {
    throw { code: 'NOT_FOUND', message: 'Poll not found' };
  }

  const p = poll.rows[0];
  const isAdmin = userRole === 'admin';

  // 2️⃣ Get user vote (if user provided)
  const userVote = user_id
    ? await pool.query(
        'SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
        [pollId, user_id]
      )
    : null;

  const hasVoted = !!(userVote && userVote.rows.length > 0);

  /**
   * 🔐 RESULT VISIBILITY RULES
   * Admin can always view results
   */
  if (!isAdmin) {
    if (!hasVoted && !p.allow_view_results_before_vote) {
      throw {
        code: 'VOTE_REQUIRED',
        message: 'You must vote to see results'
      };
    }

    if (hasVoted && !p.allow_view_results_after_vote) {
      throw {
        code: 'NOT_ALLOWED',
        message: 'Results are not available'
      };
    }
  }

  // 3️⃣ Get vote counts
  const votes = await pool.query(
    `SELECT option_index, COUNT(*) as count 
     FROM poll_votes 
     WHERE poll_id = $1 
     GROUP BY option_index`,
    [pollId]
  );

  const totalVotes = votes.rows.reduce(
    (sum, v) => sum + parseInt(v.count, 10),
    0
  );

  // 4️⃣ Format options with percentage
  const options = (p.options || []).map((opt: any, i: number) => {
    const voteRow = votes.rows.find(
      v => parseInt(v.option_index, 10) === i
    );

    const count = voteRow ? parseInt(voteRow.count, 10) : 0;

    return {
      index: i,
      label: opt.label,
      color: opt.color,
      count,
      percentage:
        totalVotes > 0
          ? Math.round((count / totalVotes) * 100)
          : 0
    };
  });

  // 5️⃣ Return formatted response
  return {
    poll_id: pollId,
    total_votes: totalVotes,
    has_voted: hasVoted,
    user_vote: userVote?.rows[0]?.option_index,
    options,
    poll_status: p.status,
    voting_open:
      p.status === 'active' &&
      new Date() >= new Date(p.start_date) &&
      new Date() <= new Date(p.end_date)
  };
}

function getDefaultColor(index: number) {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  return colors[index % colors.length];
}
