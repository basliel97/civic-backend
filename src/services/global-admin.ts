import { pool } from '../db/pool.js';

export interface GlobalAdminStatsOverview {
  totalCitizens: number;
  totalBureaus: number;
  totalAdmins: number;
  totalPolls: number;
  totalForumPosts: number;
  totalSuggestions: number;
  totalReports: number;
}

export interface GlobalAdminStatsDetailed {
  citizensByRegion: Record<string, number>;
  citizensByWorkType: Record<string, number>;
  citizensByGender: Record<string, number>;
  citizensByVerificationStatus: Record<string, number>;
  citizensByActivityLevel: Record<string, number>;
  adminsByBureau: Record<string, number>;
  pollsByStatus: Record<string, number>;
  forumsByCategory: Record<string, number>;
  suggestionsByStatus: Record<string, number>;
  reportsByStatus: Record<string, number>;
}

/**
 * Get high-level overview statistics for global admins
 */
export async function getGlobalAdminStatsOverview(): Promise<GlobalAdminStatsOverview> {
  // Total citizens (role = 'citizen')
  const citizensResult = await pool.query(
    "SELECT COUNT(*) as count FROM \"user\" WHERE role = 'citizen' AND deleted_at IS NULL"
  );

  // Total bureaus
  const bureausResult = await pool.query(
    'SELECT COUNT(*) as count FROM bureaus'
  );


  
  // Total admins (role = 'admin' or 'super_admin')
  const adminsResult = await pool.query(
    "SELECT COUNT(*) as count FROM \"user\" WHERE role IN ('admin', 'super_admin') AND deleted_at IS NULL"
  );

  // Total polls
  const pollsResult = await pool.query(
    'SELECT COUNT(*) as count FROM polls'
  );

  // Total forum posts
  const forumPostsResult = await pool.query(
    'SELECT COUNT(*) as count FROM posts WHERE status = \'active\''
  );

  // Total suggestions
  const suggestionsResult = await pool.query(
    'SELECT COUNT(*) as count FROM suggestions'
  );

  // Total reports
  const reportsResult = await pool.query(
    'SELECT COUNT(*) as count FROM reports'
  );

  return {
    totalCitizens: parseInt(citizensResult.rows[0].count),
    totalBureaus: parseInt(bureausResult.rows[0].count),
    totalAdmins: parseInt(adminsResult.rows[0].count),
    totalPolls: parseInt(pollsResult.rows[0].count),
    totalForumPosts: parseInt(forumPostsResult.rows[0].count),
    totalSuggestions: parseInt(suggestionsResult.rows[0].count),
    totalReports: parseInt(reportsResult.rows[0].count),
  };
}


export async function getPlatformGrowthTrends() {
  const result = await pool.query(`
    WITH months AS (
      SELECT date_trunc('month', series) as month_date
      FROM generate_series(
        now() - INTERVAL '2 months',
        now() + INTERVAL '2 months',
        INTERVAL '1 month'
      ) AS series
    )

    SELECT 
      to_char(m.month_date, 'Mon YYYY') as label,
      
      -- New Citizens count per month
      (
        SELECT COUNT(*) 
        FROM "user"
        WHERE role = 'citizen'
        AND date_trunc('month', created_at) = m.month_date
      ) as citizens,
       
      -- Engagement (Applications + Posts + Votes)
      (
        (SELECT COUNT(*) 
         FROM transport_applications
         WHERE date_trunc('month', created_at) = m.month_date)
         
        +
        
        (SELECT COUNT(*) 
         FROM posts
         WHERE date_trunc('month', created_at) = m.month_date)
         
        +
        
        (SELECT COUNT(*) 
         FROM poll_votes
         WHERE date_trunc('month', voted_at) = m.month_date)
      ) as interactions
      
    FROM months m
    ORDER BY m.month_date ASC;
  `);

  return result.rows;
}
/**
 * Get detailed statistics with breakdowns for global admins
 */
export async function getGlobalAdminStatsDetailed(): Promise<GlobalAdminStatsDetailed> {
  // Citizens by region (assuming region field exists)
  const citizensByRegionResult = await pool.query(
    "SELECT region, COUNT(*) as count FROM \"user\" WHERE role = 'citizen' AND deleted_at IS NULL AND region IS NOT NULL GROUP BY region"
  );
  const citizensByRegion = Object.fromEntries(
    citizensByRegionResult.rows.map(row => [row.region, parseInt(row.count)])
  );

  // Citizens by work type
  const citizensByWorkTypeResult = await pool.query(
    "SELECT work_type, COUNT(*) as count FROM \"user\" WHERE role = 'citizen' AND deleted_at IS NULL AND work_type IS NOT NULL GROUP BY work_type"
  );
  const citizensByWorkType = Object.fromEntries(
    citizensByWorkTypeResult.rows.map(row => [row.work_type, parseInt(row.count)])
  );

  // Citizens by gender
  const citizensByGenderResult = await pool.query(
    "SELECT gender, COUNT(*) as count FROM \"user\" WHERE role = 'citizen' AND deleted_at IS NULL AND gender IS NOT NULL GROUP BY gender"
  );
  const citizensByGender = Object.fromEntries(
    citizensByGenderResult.rows.map(row => [row.gender, parseInt(row.count)])
  );

  // Citizens by verification status (email_verified)
  const citizensByVerificationResult = await pool.query(
    "SELECT email_verified, COUNT(*) as count FROM \"user\" WHERE role = 'citizen' AND deleted_at IS NULL GROUP BY email_verified"
  );
  const citizensByVerificationStatus = Object.fromEntries(
    citizensByVerificationResult.rows.map(row => [row.email_verified ? 'verified' : 'unverified', parseInt(row.count)])
  );

  // Citizens by activity level (based on last_login_at, e.g., active within 30 days)
 const citizensByActivityResult = await pool.query(
  `SELECT 
     status as activity, 
     COUNT(*) as count 
   FROM "user" 
   WHERE role = 'citizen' 
     AND deleted_at IS NULL 
   GROUP BY status`
);

const citizensByActivityLevel = Object.fromEntries(
  citizensByActivityResult.rows.map(row => [
    row.activity,
    parseInt(row.count)
  ])
);
  // Admins by bureau
  const adminsByBureauResult = await pool.query(
    "SELECT b.name as bureau_name, COUNT(u.id) as count FROM \"user\" u LEFT JOIN bureaus b ON u.bureau_id = b.id WHERE u.role IN ('admin', 'super_admin') AND u.deleted_at IS NULL GROUP BY b.name"
  );
  const adminsByBureau = Object.fromEntries(
    adminsByBureauResult.rows.map(row => [row.bureau_name || 'Global', parseInt(row.count)])
  );

  // Polls by status
  const pollsByStatusResult = await pool.query(
    'SELECT status, COUNT(*) as count FROM polls GROUP BY status'
  );
  const pollsByStatus = Object.fromEntries(
    pollsByStatusResult.rows.map(row => [row.status, parseInt(row.count)])
  );

  // Forums by category
  const forumsByCategoryResult = await pool.query(
    'SELECT category, COUNT(*) as count FROM forums GROUP BY category'
  );
  const forumsByCategory = Object.fromEntries(
    forumsByCategoryResult.rows.map(row => [row.category, parseInt(row.count)])
  );

  // Suggestions by status
  const suggestionsByStatusResult = await pool.query(
    'SELECT status, COUNT(*) as count FROM suggestions GROUP BY status'
  );
  const suggestionsByStatus = Object.fromEntries(
    suggestionsByStatusResult.rows.map(row => [row.status, parseInt(row.count)])
  );

  // Reports by status
  const reportsByStatusResult = await pool.query(
    'SELECT status, COUNT(*) as count FROM reports GROUP BY status'
  );
  const reportsByStatus = Object.fromEntries(
    reportsByStatusResult.rows.map(row => [row.status, parseInt(row.count)])
  );

  return {
    citizensByRegion,
    citizensByWorkType,
    citizensByGender,
    citizensByVerificationStatus,
    citizensByActivityLevel,
    adminsByBureau,
    pollsByStatus,
    forumsByCategory,
    suggestionsByStatus,
    reportsByStatus,
  };
}