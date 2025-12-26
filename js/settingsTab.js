/**
 * Settings Tab Module
 * Handles admin settings functionality including staff management
 */

import * as global from './globals.js';
import * as util from './utils.js';
import * as roleManager from './roleManager.js';

let initialized = false;

/**
 * Initialize the settings tab
 */
export function initSettingsTab() {
    if (!roleManager.isAdmin()) {
        console.warn('Settings tab requires admin role');
        return;
    }

    // Update current user display
    const userDisplay = document.getElementById('current-user-display');
    if (userDisplay) {
        const username = roleManager.getUsername();
        const roleLabel = roleManager.getRoleLabel(roleManager.getRole());
        userDisplay.textContent = `${username} (${roleLabel})`;
    }

    // Load staff list
    loadStaffList();

    // Set up event listeners only once
    if (!initialized) {
        const addStaffBtn = document.getElementById('add-staff-btn');
        if (addStaffBtn) {
            addStaffBtn.addEventListener('click', showAddStaffModal);
        }
        initialized = true;
    }
}

/**
 * Load and display staff list
 */
async function loadStaffList() {
    const container = document.getElementById('staff-list-container');
    if (!container) return;

    container.innerHTML = '<p class="loading-text">Loading staff...</p>';

    try {
        const res = await fetch(`${global.API_IP}/api/auth/listStaff`, {
            headers: {
                'Authorization': `Bearer ${global.getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.status === 401) {
            util.kick();
            return;
        }

        if (!res.ok) {
            throw new Error('Failed to load staff');
        }

        const { staff } = await res.json();
        renderStaffList(staff);

    } catch (err) {
        console.error('Error loading staff:', err);
        container.innerHTML = '<p class="error-text">Failed to load staff list</p>';
    }
}

/**
 * Render the staff list
 */
function renderStaffList(staff) {
    const container = document.getElementById('staff-list-container');
    if (!container) return;

    if (!staff || staff.length === 0) {
        container.innerHTML = '<p class="no-results">No staff accounts found</p>';
        return;
    }

    const currentUserId = roleManager.getUserId();

    container.innerHTML = staff.map(s => {
        const isCurrentUser = s.id === currentUserId;
        const isActive = s.is_active !== false;
        const roleClass = getRoleClass(s.role);
        const statusClass = isActive ? '' : 'staff-disabled';

        return `
            <div class="staff-row ${statusClass}" data-id="${s.id}">
                <div class="staff-info">
                    <span class="staff-username">${escapeHtml(s.username)}</span>
                    <span class="staff-role sticker ${roleClass}">${roleManager.getRoleLabel(s.role)}</span>
                    ${!isActive ? '<span class="staff-status sticker disabled-badge">Disabled</span>' : ''}
                    ${isCurrentUser ? '<span class="staff-status sticker you-badge">(You)</span>' : ''}
                </div>
                <div class="staff-actions">
                    ${!isCurrentUser && isActive ? `<input type="button" class="action-btn cancel-btn disable-staff-btn" data-id="${s.id}" value="Disable">` : ''}
                    ${!isCurrentUser && !isActive ? `<input type="button" class="action-btn go-btn enable-staff-btn" data-id="${s.id}" value="Enable">` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners for disable/enable buttons
    container.querySelectorAll('.disable-staff-btn').forEach(btn => {
        btn.addEventListener('click', () => disableStaff(btn.dataset.id));
    });

    container.querySelectorAll('.enable-staff-btn').forEach(btn => {
        btn.addEventListener('click', () => enableStaff(btn.dataset.id));
    });
}

/**
 * Get CSS class for role badge
 */
function getRoleClass(role) {
    switch (role) {
        case roleManager.roles.ADMIN: return 'admin-role';
        case roleManager.roles.EMPLOYEE: return 'employee-role';
        default: return 'member-role';
    }
}

/**
 * Show modal to add new staff account
 */
function showAddStaffModal() {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'add-staff-modal';

    overlay.innerHTML = `
        <div class="modal-content">
            <h3>Add Staff Account</h3>
            <div class="form-field">
                <label for="new-staff-username">Username</label>
                <input type="text" id="new-staff-username" placeholder="Enter username">
            </div>
            <div class="form-field">
                <label for="new-staff-password">Password</label>
                <input type="password" id="new-staff-password" placeholder="Enter password">
            </div>
            <div class="form-field">
                <label for="new-staff-role">Role</label>
                <select id="new-staff-role" class="custom-select">
                    <option value="1">Employee</option>
                    <option value="2">Admin</option>
                </select>
            </div>
            <div id="add-staff-error" class="error-text"></div>
            <div class="modal-actions">
                <input type="button" id="create-staff-btn" class="action-btn go-btn" value="Create Account">
                <input type="button" id="cancel-staff-btn" class="action-btn cancel-btn" value="Cancel">
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById('cancel-staff-btn').addEventListener('click', () => {
        overlay.remove();
    });

    document.getElementById('create-staff-btn').addEventListener('click', async () => {
        const username = document.getElementById('new-staff-username').value.trim();
        const password = document.getElementById('new-staff-password').value;
        const role = parseInt(document.getElementById('new-staff-role').value);
        const errorDiv = document.getElementById('add-staff-error');

        // Validation
        if (!username) {
            errorDiv.textContent = 'Username is required';
            return;
        }
        if (!password || password.length < 6) {
            errorDiv.textContent = 'Password must be at least 6 characters';
            return;
        }

        try {
            const res = await fetch(`${global.API_IP}/api/auth/createMembershipManagerUser`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${global.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password, role })
            });

            if (res.status === 401) {
                util.kick();
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                errorDiv.textContent = data.error || 'Failed to create account';
                return;
            }

            overlay.remove();
            util.showSuccess('Staff account created successfully');
            loadStaffList();

        } catch (err) {
            console.error('Error creating staff:', err);
            errorDiv.textContent = 'Network error. Please try again.';
        }
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

/**
 * Disable a staff account
 */
async function disableStaff(id) {
    if (!confirm('Are you sure you want to disable this account?')) return;

    try {
        const res = await fetch(`${global.API_IP}/api/auth/disableStaff/${id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${global.getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.status === 401) {
            util.kick();
            return;
        }

        const data = await res.json();

        if (!res.ok) {
            util.showError(data.error || 'Failed to disable account');
            return;
        }

        util.showSuccess('Account disabled');
        loadStaffList();

    } catch (err) {
        console.error('Error disabling staff:', err);
        util.showError('Network error. Please try again.');
    }
}

/**
 * Enable a staff account
 */
async function enableStaff(id) {
    try {
        const res = await fetch(`${global.API_IP}/api/auth/enableStaff/${id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${global.getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.status === 401) {
            util.kick();
            return;
        }

        const data = await res.json();

        if (!res.ok) {
            util.showError(data.error || 'Failed to enable account');
            return;
        }

        util.showSuccess('Account enabled');
        loadStaffList();

    } catch (err) {
        console.error('Error enabling staff:', err);
        util.showError('Network error. Please try again.');
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Export for global access from swapTab
window.initSettingsTab = initSettingsTab;
