/**
 * Server-side constants
 *
 * Single-user system: All operations use ADMIN_USER_ID
 * This simplifies the architecture by removing session-based user isolation.
 */

/**
 * Fixed admin user ID for all memory operations
 *
 * In a single-user system, all data belongs to this user.
 * This ensures data persists across sessions/browsers/devices.
 */
export const ADMIN_USER_ID = "admin";
