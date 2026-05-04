import { Hono } from 'hono';
import { globalSuperAdminAuth } from '../middleware/auth.js';
import {
  getGlobalAdminAuditLogs,
  getGlobalApplicationAuditLogs,
  getGlobalCombinedAuditLogs,
  getGlobalAuditStats,
  getAuditLogsByEntityType,
  getSecurityAuditLogs,
  type GlobalAuditFilters
} from '../services/global-audit.js';

const globalAuditRoutes = new Hono();

// ============================================================================
// GLOBAL AUDIT ENDPOINTS (Super Admin Only)
// ============================================================================

/**
 * GET /api/admin/global/audit/stats
 * Get audit statistics overview for super admin dashboard
 */
globalAuditRoutes.get('/stats', globalSuperAdminAuth, async (c) => {
  try {
    const stats = await getGlobalAuditStats();
    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching global audit stats:', error);
    return c.json({ error: 'Failed to fetch audit statistics' }, 500);
  }
});

/**
 * GET /api/admin/global/audit/admin-actions
 * Get all admin audit logs across all bureaus
 */
globalAuditRoutes.get('/admin-actions', globalSuperAdminAuth, async (c) => {
  try {
    const filters: GlobalAuditFilters = {
      bureauId: c.req.query('bureauId'),
      adminId: c.req.query('adminId'),
      action: c.req.query('action'),
      entityType: c.req.query('entityType'),
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0
    };

    const logs = await getGlobalAdminAuditLogs(filters);
    return c.json({
      success: true,
      data: logs,
      filters: filters
    });
  } catch (error) {
    console.error('Error fetching global admin audit logs:', error);
    return c.json({ error: 'Failed to fetch admin audit logs' }, 500);
  }
});

/**
 * GET /api/admin/global/audit/application-changes
 * Get all application audit logs across all bureaus
 */
globalAuditRoutes.get('/application-changes', globalSuperAdminAuth, async (c) => {
  try {
    const filters: GlobalAuditFilters = {
      bureauId: c.req.query('bureauId'),
      adminId: c.req.query('adminId'),
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0
    };

    const logs = await getGlobalApplicationAuditLogs(filters);
    return c.json({
      success: true,
      data: logs,
      filters: filters
    });
  } catch (error) {
    console.error('Error fetching global application audit logs:', error);
    return c.json({ error: 'Failed to fetch application audit logs' }, 500);
  }
});

/**
 * GET /api/admin/global/audit/combined
 * Get combined audit logs (both admin actions and application changes)
 */
globalAuditRoutes.get('/combined', globalSuperAdminAuth, async (c) => {
  try {
    const filters: GlobalAuditFilters = {
      bureauId: c.req.query('bureauId'),
      adminId: c.req.query('adminId'),
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0
    };

    const logs = await getGlobalCombinedAuditLogs(filters);
    return c.json({
      success: true,
      data: logs,
      filters: filters
    });
  } catch (error) {
    console.error('Error fetching combined audit logs:', error);
    return c.json({ error: 'Failed to fetch combined audit logs' }, 500);
  }
});

/**
 * GET /api/admin/global/audit/entity/:entityType
 * Get audit logs filtered by entity type
 */
globalAuditRoutes.get('/entity/:entityType', globalSuperAdminAuth, async (c) => {
  try {
    const entityType = c.req.param('entityType');
    const filters: GlobalAuditFilters = {
      bureauId: c.req.query('bureauId'),
      adminId: c.req.query('adminId'),
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0
    };

    const logs = await getAuditLogsByEntityType(entityType, filters);
    return c.json({
      success: true,
      data: logs,
      entityType: entityType,
      filters: filters
    });
  } catch (error) {
    console.error('Error fetching audit logs by entity type:', error);
    return c.json({ error: 'Failed to fetch audit logs by entity type' }, 500);
  }
});

/**
 * GET /api/admin/global/audit/security
 * Get security-related audit logs (login, permissions, etc.)
 */
globalAuditRoutes.get('/security', globalSuperAdminAuth, async (c) => {
  try {
    const filters: GlobalAuditFilters = {
      bureauId: c.req.query('bureauId'),
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0
    };

    const logs = await getSecurityAuditLogs(filters);
    return c.json({
      success: true,
      data: logs,
      filters: filters
    });
  } catch (error) {
    console.error('Error fetching security audit logs:', error);
    return c.json({ error: 'Failed to fetch security audit logs' }, 500);
  }
});

export default globalAuditRoutes;