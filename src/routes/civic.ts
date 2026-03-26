import { Hono } from 'hono';
import { citizenAuth, type CitizenAuthContext } from '../middleware/citizen-auth.js';
import { getForums, getForumById, getPostsInForum, getPostById, createPost, updatePost, deletePost, getReplies, createReply, deleteReply, togglePinPost, toggleLockPost } from '../services/forum.js';
import { getPolls, getPollById, votePoll, getPollResults } from '../services/poll.js';
import { createReport } from '../services/report.js';
import { getBureaus, createSuggestion, getMySuggestions } from '../services/suggestion.js';

const civic = new Hono<{ Variables: CitizenAuthContext }>();

civic.get('/forums', async (c) => {
  try {
    const forums = await getForums();
    return c.json({ success: true, data: forums });
  } catch (error: any) {
    console.error('[Forums] List error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/forums/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const forum = await getForumById(id);
    
    if (!forum) {
      return c.json({ success: false, error: 'Forum not found' }, 404);
    }
    
    return c.json({ success: true, data: forum });
  } catch (error: any) {
    console.error('[Forums] Get error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/forums/:id/posts', async (c) => {
  try {
    const { id } = c.req.param();
    const query = c.req.query();
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 50);
    
    const result = await getPostsInForum(id, page, limit);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Forums] Posts error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.post('/forums/:id/posts', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const { title, content } = await c.req.json();
    
    if (!title || !content) {
      return c.json({ success: false, error: 'Title and content are required' }, 400);
    }
    
    const post = await createPost(id, user_id, title, content);
    return c.json({ success: true, data: post }, 201);
  } catch (error: any) {
    if (error.code === 'PROFANITY_DETECTED') {
      return c.json({ 
        success: false, 
        error: error.message,
        code: error.code,
        matchedWords: error.matchedWords,
        severity: error.severity
      }, 400);
    }
    console.error('[Forums] Create post error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/posts/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const post = await getPostById(id);
    
    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    
    const replies = await getReplies(id);
    
    return c.json({ success: true, data: { ...post, replies } });
  } catch (error: any) {
    console.error('[Forums] Get post error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.put('/posts/:id', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const userRole = c.get('userRole');
    const { title, content } = await c.req.json();
    
    const post = await updatePost(id, user_id, { title, content }, userRole === 'admin' || userRole === 'super_admin');
    
    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    
    return c.json({ success: true, data: post });
  } catch (error: any) {
    if (error.code === 'PROFANITY_DETECTED') {
      return c.json({ success: false, error: error.message, code: error.code, matchedWords: error.matchedWords }, 400);
    }
    if (error.code === 'UNAUTHORIZED') {
      return c.json({ success: false, error: error.message }, 403);
    }
    console.error('[Forums] Update post error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.delete('/posts/:id', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const userRole = c.get('userRole');
    
    const post = await deletePost(id, user_id, userRole);
    
    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Post deleted' });
  } catch (error: any) {
    if (error.code === 'UNAUTHORIZED') {
      return c.json({ success: false, error: error.message }, 403);
    }
    console.error('[Forums] Delete post error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.post('/posts/:id/replies', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const { content } = await c.req.json();
    
    if (!content) {
      return c.json({ success: false, error: 'Content is required' }, 400);
    }
    
    const reply = await createReply(id, user_id, content);
    return c.json({ success: true, data: reply }, 201);
  } catch (error: any) {
    if (error.code === 'PROFANITY_DETECTED') {
      return c.json({ success: false, error: error.message, code: error.code, matchedWords: error.matchedWords }, 400);
    }
    if (error.code === 'LOCKED') {
      return c.json({ success: false, error: error.message }, 400);
    }
    console.error('[Forums] Create reply error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.delete('/replies/:id', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const userRole = c.get('userRole');
    
    const reply = await deleteReply(id, user_id, userRole);
    
    if (!reply) {
      return c.json({ success: false, error: 'Reply not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Reply deleted' });
  } catch (error: any) {
    if (error.code === 'UNAUTHORIZED') {
      return c.json({ success: false, error: error.message }, 403);
    }
    console.error('[Forums] Delete reply error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/polls', async (c) => {
  try {
    const polls = await getPolls();
    return c.json({ success: true, data: polls });
  } catch (error: any) {
    console.error('[Polls] List error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/polls/:id', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    
    const poll = await getPollById(id, user_id);
    
    if (!poll) {
      return c.json({ success: false, error: 'Poll not found' }, 404);
    }
    
    return c.json({ success: true, data: poll });
  } catch (error: any) {
    console.error('[Polls] Get error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.post('/polls/:id/vote', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const userRegion = c.get('userRegion');
    const userGender = c.get('userGender');
    const userWorkType = c.get('userWorkType');
    const { option_index } = await c.req.json();
    
    if (option_index === undefined) {
      return c.json({ success: false, error: 'option_index is required' }, 400);
    }
    
    const vote = await votePoll(id, user_id, option_index, userRegion, userGender, userWorkType);
    return c.json({ success: true, data: vote });
  } catch (error: any) {
    if (error.code === 'ALREADY_VOTED') {
      return c.json({ success: false, error: error.message }, 409);
    }
    if (error.code === 'NOT_TARGETED') {
      return c.json({ success: false, error: error.message }, 403);
    }
    if (error.code === 'VOTE_REQUIRED') {
      return c.json({ success: false, error: error.message }, 403);
    }
    console.error('[Polls] Vote error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/polls/:id/results', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    
    const results = await getPollResults(id, user_id);
    return c.json({ success: true, data: results });
  } catch (error: any) {
    if (error.code === 'VOTE_REQUIRED') {
      return c.json({ success: false, error: error.message }, 403);
    }
    console.error('[Polls] Results error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.post('/reports', citizenAuth(), async (c) => {
  try {
    const user_id = c.get('user_id');
    const { item_id, item_type, item_title, reason, description } = await c.req.json();
    
    if (!item_id || !item_type || !reason) {
      return c.json({ success: false, error: 'item_id, item_type, and reason are required' }, 400);
    }
    
    const report = await createReport(item_id, item_type, item_title || '', user_id, reason, description);
    return c.json({ success: true, data: report }, 201);
  } catch (error: any) {
    console.error('[Reports] Create error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/bureaus', async (c) => {
  try {
    const bureaus = await getBureaus();
    return c.json({ success: true, data: bureaus });
  } catch (error: any) {
    console.error('[Bureaus] List error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.post('/suggestions', citizenAuth(), async (c) => {
  try {
    const user_id = c.get('user_id');
    const { bureau_id, subject, content } = await c.req.json();
    
    if (!bureau_id || !subject || !content) {
      return c.json({ success: false, error: 'bureau_id, subject, and content are required' }, 400);
    }
    
    const suggestion = await createSuggestion(user_id, bureau_id, subject, content);
    return c.json({ success: true, data: suggestion }, 201);
  } catch (error: any) {
    console.error('[Suggestions] Create error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/suggestions/my', citizenAuth(), async (c) => {
  try {
    const user_id = c.get('user_id');
    const query = c.req.query();
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 50);
    
    const result = await getMySuggestions(user_id, page, limit);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Suggestions] List error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default civic;
