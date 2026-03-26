import { Hono } from 'hono';
import { pool } from '../db/pool.js';
import { adminAuth, superAdminAuth } from '../middleware/auth.js';
import { getBannedWords, addBannedWord, deleteBannedWord, bulkAddBannedWords } from '../services/profanity.js';
import { getForums, createForum, updateForum, deleteForum, togglePinPost, toggleLockPost } from '../services/forum.js';
import { getPolls, getPollById, createPoll, updatePoll, deletePoll, getPollResults, getAllPollsForAdmin } from '../services/poll.js';
import { getReports, getReportById, resolveReport, rejectReport } from '../services/report.js';
import { getBureaus, createBureau, updateBureau, deleteBureau, getSuggestions, getSuggestionById, respondToSuggestion } from '../services/suggestion.js';
const civicAdmin = new Hono();
civicAdmin.get('/banned-words', adminAuth(), async (c) => {
    try {
        const words = await getBannedWords();
        return c.json({ success: true, data: words });
    }
    catch (error) {
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
        return c.json({ success: true, data: result }, 201);
    }
    catch (error) {
        console.error('[Admin] Add banned word error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.delete('/banned-words/:id', adminAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const result = await deleteBannedWord(id);
        if (!result) {
            return c.json({ success: false, error: 'Word not found' }, 404);
        }
        return c.json({ success: true, message: 'Word deleted' });
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('[Admin] Bulk add banned words error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.get('/forums', adminAuth(), async (c) => {
    try {
        const forums = await getForums();
        return c.json({ success: true, data: forums });
    }
    catch (error) {
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
        return c.json({ success: true, data: forum }, 201);
    }
    catch (error) {
        console.error('[Admin] Create forum error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.put('/forums/:id', adminAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const data = await c.req.json();
        const forum = await updateForum(id, data);
        if (!forum) {
            return c.json({ success: false, error: 'Forum not found' }, 404);
        }
        return c.json({ success: true, data: forum });
    }
    catch (error) {
        console.error('[Admin] Update forum error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.delete('/forums/:id', adminAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const forum = await deleteForum(id);
        if (!forum) {
            return c.json({ success: false, error: 'Forum not found' }, 404);
        }
        return c.json({ success: true, message: 'Forum deleted' });
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('[Admin] Pin post error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.post('/posts/:id/lock', adminAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const result = await toggleLockPost(id);
        if (!result) {
            return c.json({ success: false, error: 'Post not found' }, 404);
        }
        return c.json({ success: true, data: result });
    }
    catch (error) {
        console.error('[Admin] Lock post error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.get('/polls', adminAuth(), async (c) => {
    try {
        const polls = await getAllPollsForAdmin();
        return c.json({ success: true, data: polls });
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('[Admin] Delete poll error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.get('/polls/:id/results', adminAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const results = await getPollResults(id, undefined, 'admin');
        return c.json({ success: true, data: results });
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('[Admin] Resolve report error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.put('/reports/:id/reject', adminAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const report = await rejectReport(id);
        return c.json({ success: true, data: report });
    }
    catch (error) {
        console.error('[Admin] Reject report error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.get('/bureaus', adminAuth(), async (c) => {
    try {
        const bureaus = await getBureaus();
        return c.json({ success: true, data: bureaus });
    }
    catch (error) {
        console.error('[Admin] Bureaus error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.post('/bureaus', adminAuth(), async (c) => {
    try {
        const data = await c.req.json();
        if (!data.name) {
            return c.json({ success: false, error: 'Name is required' }, 400);
        }
        const bureau = await createBureau(data);
        return c.json({ success: true, data: bureau }, 201);
    }
    catch (error) {
        console.error('[Admin] Create bureau error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.put('/bureaus/:id', adminAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const data = await c.req.json();
        const bureau = await updateBureau(id, data);
        if (!bureau) {
            return c.json({ success: false, error: 'Bureau not found' }, 404);
        }
        return c.json({ success: true, data: bureau });
    }
    catch (error) {
        console.error('[Admin] Update bureau error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.delete('/bureaus/:id', adminAuth(), async (c) => {
    try {
        const { id } = c.req.param();
        const bureau = await deleteBureau(id);
        return c.json({ success: true, message: 'Bureau deleted' });
    }
    catch (error) {
        console.error('[Admin] Delete bureau error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
civicAdmin.get('/suggestions', adminAuth(), async (c) => {
    try {
        const query = c.req.query();
        const bureauId = query.bureau_id;
        const status = query.status;
        const page = parseInt(query.page || '1');
        const limit = Math.min(parseInt(query.limit || '20'), 50);
        const result = await getSuggestions(bureauId, status, page, limit);
        return c.json({ success: true, data: result });
    }
    catch (error) {
        console.error('[Admin] Suggestions error:', error);
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('[Admin] Respond to suggestion error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});
export default civicAdmin;
