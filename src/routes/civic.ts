import { Hono } from 'hono';
import { citizenAuth, type CitizenAuthContext } from '../middleware/citizen-auth.js';
import { getForums, getForumById, getPostsInForum, getPostById, createPost, updatePost, deletePost, getReplies, createReply, deleteReply, togglePinPost, toggleLockPost, toggleLike, getUserPosts } from '../services/forum.js';
import { getPolls, getPollById, votePoll, getPollResults } from '../services/poll.js';
import { createReport } from '../services/report.js';
import { getBureaus, createSuggestion, getMySuggestions } from '../services/suggestion.js';
import { notifyGlobalAdmins } from '../services/agency.js';

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

// 1. GET POSTS ROUTE (Updated to pass user_id for like tracking)
civic.get('/forums/:id/posts', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id'); // Get the logged-in user
    
    // We pass user_id as the 4th parameter so the DB knows who to check for 'is_liked'
    const result = await getPostsInForum(id, 1, 50, user_id); 
    
    return c.json({ success: true, data: result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 2. CREATE POST ROUTE (Updated to accept imageUrl)
civic.post('/forums/:id/posts', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const { title, content, imageUrl } = await c.req.json();
    
    if (!title || !content) {
      return c.json({ success: false, error: 'Title and content are required' }, 400);
    }
    
    const post = await createPost(id, user_id, title, content, imageUrl);
    return c.json({ success: true, data: post }, 201);
  } catch (error: any) {
    if (error.code === 'PROFANITY_DETECTED') {
      return c.json({ success: false, error: error.message, code: error.code }, 400);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 3. 🆕 TOGGLE LIKE ROUTE
civic.post('/posts/:id/like', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    
    const result = await toggleLike(id, user_id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Likes] Toggle error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.post('/forums/:id/posts', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const { title, content, imageUrl } = await c.req.json();
    
    if (!title || !content) {
      return c.json({ success: false, error: 'Title and content are required' }, 400);
    }
    
    const post = await createPost(id, user_id, title, content, imageUrl);
    return c.json({ success: true, data: post }, 201);
  } catch (error: any) {
    if (error.code === 'PROFANITY_DETECTED') {
      return c.json({ success: false, error: error.message, code: error.code }, 400);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});


civic.get('/my-posts', citizenAuth(), async (c) => {
  try {
    const user_id = c.get('user_id');
    const posts = await getUserPosts(user_id);
    return c.json({ success: true, data: posts });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

civic.get('/posts/:id', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id'); // 👈 We now get the user ID
    
    // Pass the user_id to the query
    const post = await getPostById(id, user_id);
    
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
    const { title, content, imageUrl } = await c.req.json(); // 👈 Catch imageUrl
    
    const post = await updatePost(id, user_id, { title, content, imageUrl }, false);
    
    if (!post) return c.json({ success: false, error: 'Post not found' }, 404);
    return c.json({ success: true, data: post });
  } catch (error: any) {
    // ... handle errors as before
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

// GET /api/polls
// This single route handles everything by identifying the user first
civic.get('/polls', citizenAuth(), async (c) => {
  try {
    const category = c.req.query('category'); // 🆕 Catch category from URL
    const polls = await getPolls(
      c.get('user_id'), 
      c.get('userRegion'), 
      c.get('userGender'), 
      c.get('userWorkType'),
      category
    );
    return c.json({ success: true, data: polls });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Vote in a poll (Strict check)
civic.post('/polls/:id/vote', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const userRegion = c.get('userRegion');
    const userGender = c.get('userGender');
    const userWorkType = c.get('userWorkType');
    const { option_index } = await c.req.json();
    
    const vote = await votePoll(id, user_id, option_index, userRegion, userGender, userWorkType);
    return c.json({ success: true, data: vote });
  } catch (error: any) {
    return c.json({ success: false, error: error.message, code: error.code }, 403);
  }
});

// Get Live Results
civic.get('/polls/:id/results', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    const results = await getPollResults(id, user_id);
    return c.json({ success: true, data: results });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 403);
  }
});


civic.post('/reports', citizenAuth(), async (c) => {
  try {
    const user_id = c.get('user_id');
    const body = await c.req.json();

    // 🆕 THE MAPPING FIX: 
    // This looks for both camelCase (Mobile) and snake_case (Web/DB)
    const itemId = body.itemId || body.item_id;
    const itemType = body.itemType || body.item_type;
    const reason = body.reason;
    const description = body.description || '';
    const itemTitle = body.itemTitle || body.item_title || 'Reported Content';

    // 1. Validation check
    if (!itemId || !itemType || !reason) {
      console.error("🚩 [Report Error] Missing required fields:", { itemId, itemType, reason });
      return c.json({ success: false, error: 'item_id, item_type, and reason are required' }, 400);
    }

    console.log(`🚩 [Report Alert] User ${user_id} is reporting a ${itemType}. ID: ${itemId}`);

    // 2. Call your existing service
    // Ensure createReport is imported from ../services/report.js
    const report = await createReport(
      itemId,
      itemType,
      itemTitle,
      user_id,
      reason,
      description
    );

    await notifyGlobalAdmins({ title: 'New Content Report', message: 'A user has flagged a forum post for moderation.', type: 'danger', screen: 'reports_list', targetId: report.id });

    return c.json({
      success: true,
      message: "Report submitted successfully",
      data: report
    }, 201);

  } catch (error: any) {
    console.error('❌ [Backend Report Error]:', error.message);
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


civic.post('/posts/:id/like', citizenAuth(), async (c) => {
  try {
    const { id } = c.req.param();
    const user_id = c.get('user_id');
    
    const result = await toggleLike(id, user_id);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Likes] Toggle error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default civic;
