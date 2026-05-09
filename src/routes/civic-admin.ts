import { Hono } from 'hono';
import { pool } from '../db/pool.js';
import { adminAuth, superAdminAuth, type AuthContext } from '../middleware/auth.js';
import { logAdminAction } from '../services/agency.js';
import { getBannedWords, addBannedWord, deleteBannedWord, bulkAddBannedWords } from '../services/profanity.js';
import { getForums, createForum, updateForum, deleteForum, togglePinPost, toggleLockPost } from '../services/forum.js';
import { getPolls, getPollById, createPoll, updatePoll, deletePoll, getPollResults, getAllPollsForAdmin } from '../services/poll.js';
import { getReports, getReportById, resolveReport, rejectReport } from '../services/report.js';
import { getBureaus, createBureau, updateBureau, deleteBureau, getSuggestions, getSuggestionById, respondToSuggestion } from '../services/suggestion.js';

const civicAdmin = new Hono<{ Variables: AuthContext }>();

civicAdmin.get('/banned-words', adminAuth(), async (c) => {
  try {
    const words = await getBannedWords();
    return c.json({ success: true, data: words });
  } catch (error: any) {
    console.error('[Admin] Banned words error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.post('/banned-words', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const { word, severity, language } = await c.req.json();

    if (!word) {
      return c.json({ success: false, error: 'Word is required' }, 400);
    }

    const result = await addBannedWord(word, severity || 'medium', language || 'both', adminId);

    // Log admin action
    await logAdminAction(adminId, null, 'ADD_BANNED_WORD', 'profanity_filter', result.id, null, result, {});

    return c.json({ success: true, data: result }, 201);
  } catch (error: any) {
    console.error('[Admin] Add banned word error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.delete('/banned-words/:id', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const { id } = c.req.param();

    // Get old values for audit
    const oldWordResult = await pool.query('SELECT * FROM banned_words WHERE id = $1', [id]);
    if (oldWordResult.rows.length === 0) {
      return c.json({ success: false, error: 'Word not found' }, 404);
    }
    const oldWord = oldWordResult.rows[0];

    const result = await deleteBannedWord(id);

    if (!result) {
      return c.json({ success: false, error: 'Word not found' }, 404);
    }

    // Log admin action
    await logAdminAction(adminId, null, 'REMOVE_BANNED_WORD', 'profanity_filter', id, oldWord, null, {});

    return c.json({ success: true, message: 'Word deleted' });
  } catch (error: any) {
    console.error('[Admin] Delete banned word error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.post('/banned-words/bulk', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const { words } = await c.req.json();
    
    if (!Array.isArray(words) || words.length === 0) {
      return c.json({ success: false, error: 'Words array is required' }, 400);
    }
    
    const results = await bulkAddBannedWords(words, adminId);
    return c.json({ success: true, data: { added: results.length, words: results } });
  } catch (error: any) {
    console.error('[Admin] Bulk add banned words error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.get('/forums', adminAuth(), async (c) => {
  try {
    const forums = await getForums();
    return c.json({ success: true, data: forums });
  } catch (error: any) {
    console.error('[Admin] Forums error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.post('/forums', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const data = await c.req.json();

    if (!data.name) {
      return c.json({ success: false, error: 'Name is required' }, 400);
    }

    const forum = await createForum(data, adminId);

    // Log admin action
    await logAdminAction(adminId, null, 'CREATE_FORUM', 'forum', forum.id, null, forum, {});

    return c.json({ success: true, data: forum }, 201);
  } catch (error: any) {
    console.error('[Admin] Create forum error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.put('/forums/:id', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const { id } = c.req.param();
    const data = await c.req.json();

    // Get old values for audit
    const oldForumResult = await pool.query('SELECT * FROM forums WHERE id = $1', [id]);
    if (oldForumResult.rows.length === 0) {
      return c.json({ success: false, error: 'Forum not found' }, 404);
    }
    const oldForum = oldForumResult.rows[0];

    const forum = await updateForum(id, data);

    if (!forum) {
      return c.json({ success: false, error: 'Forum not found' }, 404);
    }

    // Log admin action
    await logAdminAction(adminId, null, 'UPDATE_FORUM', 'forum', id, oldForum, data, {});

    return c.json({ success: true, data: forum });
  } catch (error: any) {
    console.error('[Admin] Update forum error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.delete('/forums/:id', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const { id } = c.req.param();

    // Get old values for audit
    const oldForumResult = await pool.query('SELECT * FROM forums WHERE id = $1', [id]);
    if (oldForumResult.rows.length === 0) {
      return c.json({ success: false, error: 'Forum not found' }, 404);
    }
    const oldForum = oldForumResult.rows[0];

    const forum = await deleteForum(id);

    if (!forum) {
      return c.json({ success: false, error: 'Forum not found' }, 404);
    }

    // Log admin action
    await logAdminAction(adminId, null, 'DELETE_FORUM', 'forum', id, oldForum, null, {});

    return c.json({ success: true, message: 'Forum deleted' });
  } catch (error: any) {
    console.error('[Admin] Delete forum error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.post('/posts/:id/pin', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const result = await togglePinPost(id);
    
    if (!result) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Admin] Pin post error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.post('/posts/:id/lock', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const { id } = c.req.param();

    // Get old values for audit
    const oldPostResult = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    if (oldPostResult.rows.length === 0) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    const oldPost = oldPostResult.rows[0];

    const result = await toggleLockPost(id);

    if (!result) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }

    // Log admin action
    await logAdminAction(adminId, null, 'LOCK_FORUM_POST', 'post', id, oldPost, result, {});

    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Admin] Lock post error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.get('/polls', adminAuth(), async (c) => {
  try {
    const polls = await getAllPollsForAdmin();
    return c.json({ success: true, data: polls });
  } catch (error: any) {
    console.error('[Admin] Polls error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.get('/polls/:id', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const poll = await getPollById(id);
    
    if (!poll) {
      return c.json({ success: false, error: 'Poll not found' }, 404);
    }
    
    return c.json({ success: true, data: poll });
  } catch (error: any) {
    console.error('[Admin] Get poll error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.post('/polls', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const data = await c.req.json();
    
    if (!data.title || !data.options || !data.start_date || !data.end_date) {
      return c.json({ success: false, error: 'Title, options, start_date, and end_date are required' }, 400);
    }
    
    const poll = await createPoll(data, adminId);
    return c.json({ success: true, data: poll }, 201);
  } catch (error: any) {
    console.error('[Admin] Create poll error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.put('/polls/:id', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const data = await c.req.json();
    
    const poll = await updatePoll(id, data);
    
    if (!poll) {
      return c.json({ success: false, error: 'Poll not found' }, 404);
    }
    
    return c.json({ success: true, data: poll });
  } catch (error: any) {
    console.error('[Admin] Update poll error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.delete('/polls/:id', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const poll = await deletePoll(id);
    
    if (!poll) {
      return c.json({ success: false, error: 'Poll not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Poll deleted' });
  } catch (error: any) {
    console.error('[Admin] Delete poll error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.get('/polls/:id/results', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();

    const results = await getPollResults(id, undefined, 'admin');

    return c.json({ success: true, data: results });
  } catch (error: any) {
    console.error('[Admin] Poll results error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.get('/reports', adminAuth(), async (c) => {
  try {
    const query = c.req.query();
    const status = query.status;
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 50);
    
    const result = await getReports(status, page, limit);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Admin] Reports error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.get('/reports/:id', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const report = await getReportById(id);
    
    if (!report) {
      return c.json({ success: false, error: 'Report not found' }, 404);
    }
    
    return c.json({ success: true, data: report });
  } catch (error: any) {
    console.error('[Admin] Get report error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.put('/reports/:id/resolve', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id');
    const { resolution } = await c.req.json();
    
    if (!resolution) {
      return c.json({ success: false, error: 'Resolution is required' }, 400);
    }
    
    const report = await resolveReport(id, adminId, resolution);
    return c.json({ success: true, data: report });
  } catch (error: any) {
    console.error('[Admin] Resolve report error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.put('/reports/:id/reject', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const report = await rejectReport(id);
    return c.json({ success: true, data: report });
  } catch (error: any) {
    console.error('[Admin] Reject report error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.get('/bureaus', adminAuth(), async (c) => {
  try {
    const bureaus = await getBureaus();
    return c.json({ success: true, data: bureaus });
  } catch (error: any) {
    console.error('[Admin] Bureaus error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.post('/bureaus', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const data = await c.req.json();

    if (!data.name) {
      return c.json({ success: false, error: 'Name is required' }, 400);
    }

    const bureau = await createBureau(data);

    // Log admin action
    await logAdminAction(adminId, null, 'CREATE_BUREAU', 'bureau', bureau.id, null, bureau, {});

    return c.json({ success: true, data: bureau }, 201);
  } catch (error: any) {
    console.error('[Admin] Create bureau error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.put('/bureaus/:id', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const { id } = c.req.param();
    const data = await c.req.json();

    // Get old values for audit
    const oldBureauResult = await pool.query('SELECT * FROM bureaus WHERE id = $1', [id]);
    if (oldBureauResult.rows.length === 0) {
      return c.json({ success: false, error: 'Bureau not found' }, 404);
    }
    const oldBureau = oldBureauResult.rows[0];

    const bureau = await updateBureau(id, data);

    if (!bureau) {
      return c.json({ success: false, error: 'Bureau not found' }, 404);
    }

    // Log admin action
    await logAdminAction(adminId, null, 'UPDATE_BUREAU', 'bureau', id, oldBureau, bureau, {});

    return c.json({ success: true, data: bureau });
  } catch (error: any) {
    console.error('[Admin] Update bureau error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.delete('/bureaus/:id', adminAuth(), async (c) => {
  try {
    const adminId = c.get('user_id');
    const { id } = c.req.param();

    // Get old values for audit
    const oldBureauResult = await pool.query('SELECT * FROM bureaus WHERE id = $1', [id]);
    if (oldBureauResult.rows.length === 0) {
      return c.json({ success: false, error: 'Bureau not found' }, 404);
    }
    const oldBureau = oldBureauResult.rows[0];

    const bureau = await deleteBureau(id);

    // Log admin action
    await logAdminAction(adminId, null, 'DELETE_BUREAU', 'bureau', id, oldBureau, null, {});

    return c.json({ success: true, message: 'Bureau deleted' });
  } catch (error: any) {
    console.error('[Admin] Delete bureau error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get all suggestions with filters
civicAdmin.get('/suggestions', adminAuth(), async (c) => {
  try {
    const url = new URL(c.req.url);
    const bureauId = url.searchParams.get('bureauId');
    const statusParam = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    
    // Convert null string to actual null, and convert null/undefined to undefined for status
    const bureauIdParam = bureauId === 'null' ? null : bureauId;
    const statusParamValue = statusParam === 'null' ? undefined : (statusParam || undefined);
    
    const result = await getSuggestions(bureauIdParam, statusParamValue, page, limit);
    
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Admin] Get suggestions error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get single suggestion by ID
civicAdmin.get('/suggestions/:id', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const suggestion = await getSuggestionById(id);
    
    if (!suggestion) {
      return c.json({ success: false, error: 'Suggestion not found' }, 404);
    }
    
    return c.json({ success: true, data: suggestion });
  } catch (error: any) {
    console.error('[Admin] Get suggestion error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.get('/suggestions/:id', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const suggestion = await getSuggestionById(id);
    
    if (!suggestion) {
      return c.json({ success: false, error: 'Suggestion not found' }, 404);
    }
    
    return c.json({ success: true, data: suggestion });
  } catch (error: any) {
    console.error('[Admin] Get suggestion error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civicAdmin.post('/suggestions/:id/respond', adminAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const adminId = c.get('user_id');
    const { response } = await c.req.json();
    
    if (!response) {
      return c.json({ success: false, error: 'Response is required' }, 400);
    }
    
    const suggestion = await respondToSuggestion(id, adminId, response);
    return c.json({ success: true, data: suggestion });
  } catch (error: any) {
    console.error('[Admin] Respond to suggestion error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default civicAdmin;
