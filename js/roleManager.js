/**
 * Role Manager Module
 * Handles JWT decoding and role-based access control for the frontend
 */

// Role constants - MUST match backend constants.js roles
// Duplicated here because frontend needs roles at runtime for UI decisions
// without making an API call. If backend roles change, update here too.
export const roles = {
    MEMBER: 0,
    EMPLOYEE: 1,
    ADMIN: 2
};

// Role display names
export const roleLabels = {
    [roles.MEMBER]: 'Member',
    [roles.EMPLOYEE]: 'Employee',
    [roles.ADMIN]: 'Admin'
};

// Module state
let currentUserRole = null;
let currentUserId = null;
let currentUsername = null;

/**
 * Decode JWT payload without verification (backend already verified)
 * @param {string} token - JWT token
 * @returns {object|null} Decoded payload or null on error
 */
export function decodeToken(token) {
    try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(atob(payload));
        return decoded;
    } catch (e) {
        console.error('Failed to decode token:', e);
        return null;
    }
}

/**
 * Initialize role from stored token
 * Call this after token verification succeeds
 * @returns {boolean} True if role was initialized successfully
 */
export function initializeRole() {
    const token = localStorage.getItem('token');
    if (!token) return false;

    const decoded = decodeToken(token);
    if (!decoded) return false;

    // Default to EMPLOYEE if role is missing (old tokens before role was added)
    // Parse as integer in case database returns string
    const roleValue = decoded.role !== undefined && decoded.role !== null
        ? parseInt(decoded.role, 10)
        : roles.EMPLOYEE;
    currentUserRole = isNaN(roleValue) ? roles.EMPLOYEE : roleValue;
    currentUserId = decoded.id;
    currentUsername = decoded.username;

    console.log(`Role initialized: ${roleLabels[currentUserRole] || 'Unknown'} (${currentUsername})`);
    return true;
}

/**
 * Get current user's role
 * @returns {number|null} Role number or null if not initialized
 */
export function getRole() {
    return currentUserRole;
}

/**
 * Get current user's ID
 * @returns {number|null} User ID or null if not initialized
 */
export function getUserId() {
    return currentUserId;
}

/**
 * Get current user's username
 * @returns {string|null} Username or null if not initialized
 */
export function getUsername() {
    return currentUsername;
}

/**
 * Get role display label
 * @param {number} role - Role number
 * @returns {string} Role label
 */
export function getRoleLabel(role) {
    return roleLabels[role] || 'Unknown';
}

/**
 * Check if current user is admin
 * @returns {boolean}
 */
export function isAdmin() {
    return currentUserRole !== null && currentUserRole >= roles.ADMIN;
}

/**
 * Check if current user is employee or higher
 * @returns {boolean}
 */
export function isEmployee() {
    return currentUserRole !== null && currentUserRole >= roles.EMPLOYEE;
}

/**
 * Check if current user is member or higher
 * @returns {boolean}
 */
export function isMember() {
    return currentUserRole !== null && currentUserRole >= roles.MEMBER;
}

/**
 * Check if current user has minimum role level
 * @param {number} minRole - Minimum role required
 * @returns {boolean}
 */
export function hasMinRole(minRole) {
    return currentUserRole !== null && currentUserRole >= minRole;
}

/**
 * Clear role state (call on logout)
 */
export function clearRole() {
    currentUserRole = null;
    currentUserId = null;
    currentUsername = null;
}
