/**
 * Settings Tab Module
 * Handles admin settings functionality including staff management and schedule
 */

import * as global from './globals.js';
import * as util from './utils.js';
import * as roleManager from './roleManager.js';

let initialized = false;
let allClasses = []; // Cache for filtering

// Day mapping: database stores 0-6
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

    // Load staff list and schedule
    loadStaffList();
    loadSchedule();

    // Set up event listeners only once
    if (!initialized) {
        const addStaffBtn = document.getElementById('add-staff-btn');
        if (addStaffBtn) {
            addStaffBtn.addEventListener('click', showAddStaffModal);
        }

        const changePasswordBtn = document.getElementById('change-password-btn');
        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', changePassword);
        }

        // Schedule controls
        const addClassBtn = document.getElementById('add-class-btn');
        if (addClassBtn) {
            addClassBtn.addEventListener('click', showAddClassModal);
        }

        const dayFilter = document.getElementById('schedule-day-filter');
        if (dayFilter) {
            dayFilter.addEventListener('change', filterSchedule);
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
 * Change the current user's password
 */
async function changePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorDiv = document.getElementById('password-change-error');

    // Clear previous error
    errorDiv.textContent = '';

    // Validation
    if (!currentPassword) {
        errorDiv.textContent = 'Current password is required';
        return;
    }
    if (!newPassword || newPassword.length < 6) {
        errorDiv.textContent = 'New password must be at least 6 characters';
        return;
    }
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New passwords do not match';
        return;
    }
    if (currentPassword === newPassword) {
        errorDiv.textContent = 'New password must be different from current password';
        return;
    }

    try {
        const res = await fetch(`${global.API_IP}/api/auth/changePassword`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${global.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        if (res.status === 401) {
            util.kick();
            return;
        }

        const data = await res.json();

        if (!res.ok) {
            errorDiv.textContent = data.error || 'Failed to change password';
            return;
        }

        // Clear form
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';

        util.showSuccess('Password changed successfully');

    } catch (err) {
        console.error('Error changing password:', err);
        errorDiv.textContent = 'Network error. Please try again.';
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

// ============================================
// SCHEDULE MANAGEMENT
// ============================================

/**
 * Load and display class schedule
 */
async function loadSchedule() {
    const container = document.getElementById('schedule-list-container');
    if (!container) return;

    container.innerHTML = '<p class="loading-text">Loading schedule...</p>';

    try {
        const res = await fetch(`${global.API_IP}/api/classes/listClasses`, {
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
            throw new Error('Failed to load schedule');
        }

        const { classes } = await res.json();
        allClasses = classes;
        filterSchedule();

    } catch (err) {
        console.error('Error loading schedule:', err);
        container.innerHTML = '<p class="error-text">Failed to load schedule</p>';
    }
}

/**
 * Filter and render schedule based on current filters
 */
function filterSchedule() {
    const dayFilter = document.getElementById('schedule-day-filter')?.value || 'all';

    let filtered = allClasses;

    if (dayFilter !== 'all') {
        const dayNum = parseInt(dayFilter);
        filtered = filtered.filter(c => c.day === dayNum);
    }

    renderSchedule(filtered);
}

/**
 * Render the schedule list
 */
function renderSchedule(classes) {
    const container = document.getElementById('schedule-list-container');
    if (!container) return;

    if (!classes || classes.length === 0) {
        container.innerHTML = '<p class="no-results">No classes found</p>';
        return;
    }

    // Group by day
    const byDay = {};
    classes.forEach(c => {
        const dayNum = c.day;
        if (!byDay[dayNum]) byDay[dayNum] = [];
        byDay[dayNum].push(c);
    });

    const selectedDay = document.getElementById('schedule-day-filter')?.value;

    let html = '';
    // Iterate 0-6 for proper day order
    for (let dayNum = 0; dayNum <= 6; dayNum++) {
        if (!byDay[dayNum]) continue;

        // Only show day header if showing all days
        if (selectedDay === 'all') {
            html += `<div class="schedule-day-header">${DAY_NAMES[dayNum]}</div>`;
        }

        byDay[dayNum].forEach(c => {
            const timeStr = formatTime(c.time);

            html += `
                <div class="class-row" data-id="${c.id}">
                    <div class="class-info">
                        <span class="class-time">${timeStr}</span>
                        <span class="class-name">${escapeHtml(c.name || 'Unnamed')}</span>
                        ${c.age_group ? `<span class="class-type sticker">${escapeHtml(c.age_group)}</span>` : ''}
                    </div>
                    <div class="class-actions">
                        <input type="button" class="action-btn edit-class-btn" data-id="${c.id}" value="Edit">
                        <input type="button" class="action-btn cancel-btn delete-class-btn" data-id="${c.id}" value="Delete">
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;

    // Add event listeners
    container.querySelectorAll('.edit-class-btn').forEach(btn => {
        btn.addEventListener('click', () => showEditClassModal(btn.dataset.id));
    });

    container.querySelectorAll('.delete-class-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteClass(btn.dataset.id));
    });
}

/**
 * Format time for display (HH:MM:SS -> h:mm AM/PM)
 */
function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

/**
 * Show modal to add a new class
 */
function showAddClassModal() {
    showClassModal(null);
}

/**
 * Show modal to edit a class
 */
function showEditClassModal(id) {
    const classData = allClasses.find(c => c.id == id);
    if (!classData) {
        util.showError('Class not found');
        return;
    }
    showClassModal(classData);
}

/**
 * Show class add/edit modal
 */
function showClassModal(classData) {
    const isEdit = !!classData;
    const title = isEdit ? 'Edit Class' : 'Add Class';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'class-modal';

    // Build day options
    const dayOptions = DAY_NAMES.map((name, idx) =>
        `<option value="${idx}" ${classData?.day === idx ? 'selected' : ''}>${name}</option>`
    ).join('');

    overlay.innerHTML = `
        <div class="modal-content">
            <h3>${title}</h3>
            <div class="form-field">
                <label for="class-name">Class Name</label>
                <input type="text" id="class-name" placeholder="e.g., Parkour Basics" value="${escapeHtml(classData?.name || '')}">
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label for="class-day">Day</label>
                    <select id="class-day" class="custom-select">
                        ${dayOptions}
                    </select>
                </div>
                <div class="form-field">
                    <label for="class-time">Time</label>
                    <input type="time" id="class-time" value="${classData?.time?.slice(0, 5) || ''}">
                </div>
            </div>
            <div class="form-field">
                <label for="class-age-group">Age Group</label>
                <input type="text" id="class-age-group" placeholder="e.g., Kids, Adults, Parent & Child" value="${escapeHtml(classData?.age_group || '')}">
            </div>
            <div id="class-modal-error" class="error-text"></div>
            <div class="modal-actions">
                <input type="button" id="save-class-btn" class="action-btn go-btn" value="${isEdit ? 'Save Changes' : 'Add Class'}">
                <input type="button" id="cancel-class-btn" class="action-btn cancel-btn" value="Cancel">
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById('cancel-class-btn').addEventListener('click', () => {
        overlay.remove();
    });

    document.getElementById('save-class-btn').addEventListener('click', async () => {
        const name = document.getElementById('class-name').value.trim();
        const day = parseInt(document.getElementById('class-day').value);
        const time = document.getElementById('class-time').value;
        const age_group = document.getElementById('class-age-group').value.trim() || null;
        const errorDiv = document.getElementById('class-modal-error');

        // Validation
        if (!name) {
            errorDiv.textContent = 'Class name is required';
            return;
        }
        if (!time) {
            errorDiv.textContent = 'Time is required';
            return;
        }

        try {
            const url = isEdit
                ? `${global.API_IP}/api/classes/editClass/${classData.id}`
                : `${global.API_IP}/api/classes/addClass`;

            const method = isEdit ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${global.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, day, time, age_group })
            });

            if (res.status === 401) {
                util.kick();
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                errorDiv.textContent = data.error || 'Failed to save class';
                return;
            }

            overlay.remove();
            util.showSuccess(isEdit ? 'Class updated' : 'Class added');
            loadSchedule();

        } catch (err) {
            console.error('Error saving class:', err);
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
 * Delete a class
 */
async function deleteClass(id) {
    if (!confirm('Are you sure you want to delete this class? This cannot be undone.')) return;

    try {
        const res = await fetch(`${global.API_IP}/api/classes/deleteClass/${id}`, {
            method: 'DELETE',
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
            util.showError(data.error || 'Failed to delete class');
            return;
        }

        util.showSuccess('Class deleted');
        loadSchedule();

    } catch (err) {
        console.error('Error deleting class:', err);
        util.showError('Network error. Please try again.');
    }
}

// Export for global access from swapTab
window.initSettingsTab = initSettingsTab;
