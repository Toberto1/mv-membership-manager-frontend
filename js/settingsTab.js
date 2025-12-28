/**
 * Settings Tab Module
 * Handles admin settings functionality including staff management and schedule
 */

import * as global from './globals.js';
import * as util from './utils.js';
import * as roleManager from './roleManager.js';

let initialized = false;
let allClasses = []; // Cache for filtering

// Day mapping: database stores 0-6 (0=Sunday)
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Display order: Monday first (1,2,3,4,5,6,0)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Use centralized constants from globals
const AGE_GROUPS = global.CLASS_AGE_GROUPS;
const DEFAULT_CLASS_TYPES = global.DEFAULT_CLASS_TYPES;

/**
 * Initialize the settings tab
 */
export async function initSettingsTab() {
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

    // Load combos from database first, then render
    await loadCombos();
    renderCombos();
    restoreCombosState();
    populateTypeFilter();

    // Load staff list and schedule in parallel
    loadStaffList();
    loadSchedule();

    // Set up event listeners only once
    if (!initialized) {
        // Settings sub-navigation
        setupSettingsSubnav();

        const addStaffBtn = document.getElementById('add-staff-btn');
        if (addStaffBtn) {
            addStaffBtn.addEventListener('click', showAddStaffModal);
        }

        const changePasswordBtn = document.getElementById('change-password-btn');
        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', changePassword);
        }

        // New Combo button
        const newComboBtn = document.getElementById('new-combo-btn');
        if (newComboBtn) {
            newComboBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger collapse toggle
                showNewComboModal();
            });
        }

        // Combos section collapse toggle
        const combosToggle = document.getElementById('combos-toggle');
        if (combosToggle) {
            combosToggle.addEventListener('click', (e) => {
                // Don't toggle if clicking the button
                if (e.target.closest('.btn')) return;
                toggleCombosSection();
            });
        }

        // Schedule filters
        const dayFilter = document.getElementById('schedule-day-filter');
        if (dayFilter) {
            dayFilter.addEventListener('change', filterSchedule);
        }

        const typeFilter = document.getElementById('schedule-type-filter');
        if (typeFilter) {
            typeFilter.addEventListener('change', filterSchedule);
        }

        initialized = true;
    }
}

/**
 * Setup settings sub-navigation handlers
 */
function setupSettingsSubnav() {
    document.querySelectorAll('.settings-subnav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.settingsTab;
            if (!tab) return;

            // Update nav items
            document.querySelectorAll('.settings-subnav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Update content
            document.querySelectorAll('.settings-subtab').forEach(t => t.classList.add('hidden'));
            const tabContent = document.getElementById(`settings-${tab}`);
            if (tabContent) tabContent.classList.remove('hidden');
        });
    });
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
// CLASS COMBOS (Type + Age + Color) - Database-backed
// ============================================

// In-memory cache of combos from database
// Format: { id, type, age_group, color }
let classCombosCache = [];

/**
 * Load class combos from database API
 */
async function loadCombos() {
    try {
        const res = await fetch(`${global.API_IP}/api/settings/classCombos`, {
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
            throw new Error('Failed to load combos');
        }

        const { combos } = await res.json();
        classCombosCache = combos || [];

    } catch (err) {
        console.error('Error loading combos:', err);
        classCombosCache = [];
    }
}

/**
 * Auto-generate combos from existing schedule + predefined colors
 * Call this once to populate combos from what's already scheduled
 */
async function syncCombosFromSchedule() {
    if (!allClasses || allClasses.length === 0) return;

    const combosToSync = [];

    allClasses.forEach(c => {
        const type = (c.name || '').trim();
        const ageGroup = (c.age_group || '').trim();
        if (!type) return;

        // Check if already exists in cache
        const exists = classCombosCache.some(combo =>
            combo.type.toLowerCase() === type.toLowerCase() &&
            (combo.age_group || '').toLowerCase() === ageGroup.toLowerCase()
        );

        if (!exists) {
            // Check if already in our sync list
            const inSyncList = combosToSync.some(combo =>
                combo.type.toLowerCase() === type.toLowerCase() &&
                (combo.age_group || '').toLowerCase() === ageGroup.toLowerCase()
            );

            if (!inSyncList) {
                // Get color from predefined CLASS_COLORS
                const key = `${type.toLowerCase()}.${ageGroup.toLowerCase()}`;
                const color = global.CLASS_COLORS[key] || global.CLASS_COLORS[type.toLowerCase()] || global.DEFAULT_CLASS_COLOR;
                combosToSync.push({ type, age_group: ageGroup || null, color });
            }
        }
    });

    if (combosToSync.length > 0) {
        try {
            const res = await fetch(`${global.API_IP}/api/settings/classCombos/bulk`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${global.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ combos: combosToSync })
            });

            if (res.ok) {
                console.log(`Auto-created ${combosToSync.length} combos from existing schedule`);
                await loadCombos();
                renderCombos();
                populateTypeFilter();
            }
        } catch (err) {
            console.error('Error syncing combos from schedule:', err);
        }
    }
}

/**
 * Get all combos as array of objects (from cache)
 */
function getCombosArray() {
    return classCombosCache.map(c => ({
        id: c.id,
        key: `${c.type.toLowerCase()}.${(c.age_group || '').toLowerCase()}`,
        type: c.type.toLowerCase(),
        ageGroup: (c.age_group || '').toLowerCase(),
        color: c.color
    })).sort((a, b) => a.type.localeCompare(b.type) || a.ageGroup.localeCompare(b.ageGroup));
}

/**
 * Add a new combo to database
 */
async function addCombo(type, ageGroup, color) {
    try {
        const res = await fetch(`${global.API_IP}/api/settings/classCombos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${global.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: type.trim(),
                age_group: ageGroup?.trim() || null,
                color
            })
        });

        if (res.status === 401) {
            util.kick();
            return false;
        }

        if (res.status === 409) {
            util.showError('This combo already exists');
            return false;
        }

        if (!res.ok) {
            const data = await res.json();
            util.showError(data.error || 'Failed to create combo');
            return false;
        }

        // Refresh cache
        await loadCombos();
        return true;
    } catch (err) {
        console.error('Error adding combo:', err);
        util.showError('Network error');
        return false;
    }
}

/**
 * Update a combo's color in database
 */
async function updateComboColor(comboId, color) {
    try {
        const res = await fetch(`${global.API_IP}/api/settings/classCombos/${comboId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${global.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ color })
        });

        if (res.status === 401) {
            util.kick();
            return false;
        }

        if (!res.ok) {
            throw new Error('Failed to update combo');
        }

        // Update local cache
        const combo = classCombosCache.find(c => c.id === comboId);
        if (combo) combo.color = color;

        return true;
    } catch (err) {
        console.error('Error updating combo color:', err);
        return false;
    }
}

/**
 * Delete a combo from database
 */
async function deleteCombo(comboId) {
    try {
        const res = await fetch(`${global.API_IP}/api/settings/classCombos/${comboId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${global.getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.status === 401) {
            util.kick();
            return false;
        }

        if (!res.ok) {
            const data = await res.json();
            util.showError(data.error || 'Failed to delete combo');
            return false;
        }

        // Refresh cache
        await loadCombos();
        return true;
    } catch (err) {
        console.error('Error deleting combo:', err);
        util.showError('Network error');
        return false;
    }
}

/**
 * Get color for a type + age group (from cache)
 */
function getComboColor(type, ageGroup) {
    if (!type) return global.DEFAULT_CLASS_COLOR;

    // Search in cache
    const combo = classCombosCache.find(c =>
        c.type.toLowerCase() === type.toLowerCase() &&
        (c.age_group || '').toLowerCase() === (ageGroup || '').toLowerCase()
    );
    if (combo) return combo.color;

    // Fallback to hardcoded colors (for schedule entries without combos)
    return global.getClassColor(type, ageGroup);
}

/**
 * Toggle combos section collapsed/expanded
 */
function toggleCombosSection() {
    const section = document.querySelector('.schedule-section.collapsible');
    const container = document.getElementById('combos-list-container');
    if (!section || !container) return;

    const isExpanded = section.classList.toggle('expanded');
    container.classList.toggle('collapsed', !isExpanded);

    // Save state
    localStorage.setItem('combosExpanded', isExpanded ? '1' : '0');
}

/**
 * Restore combos section state
 */
function restoreCombosState() {
    const isExpanded = localStorage.getItem('combosExpanded') === '1';
    const section = document.querySelector('.schedule-section.collapsible');
    const container = document.getElementById('combos-list-container');
    if (!section || !container) return;

    if (isExpanded) {
        section.classList.add('expanded');
        container.classList.remove('collapsed');
    }
}

/**
 * Update combo count display
 */
function updateComboCount() {
    const countEl = document.getElementById('combo-count');
    if (!countEl) return;
    const count = getCombosArray().length;
    countEl.textContent = count > 0 ? `(${count})` : '';
}

/**
 * Render the combos list
 */
function renderCombos() {
    const container = document.getElementById('combos-list-container');
    if (!container) return;

    const combos = getCombosArray();
    updateComboCount();

    if (combos.length === 0) {
        container.innerHTML = '<p class="text-muted">No class combos defined. Click "+ New" to create one.</p>';
        return;
    }

    container.innerHTML = combos.map(c => {
        const displayAge = c.ageGroup ? ` - ${capitalize(c.ageGroup)}` : '';
        return `
            <div class="combo-row" data-id="${c.id}" data-key="${escapeHtml(c.key)}">
                <span class="combo-dot" style="background: ${c.color};"></span>
                <span class="combo-label">${capitalize(c.type)}${displayAge}</span>
                <div class="combo-actions">
                    <input type="color" class="combo-color-input" value="${c.color}" data-id="${c.id}" title="Change color">
                    <input type="button" class="action-btn go-btn btn-sm schedule-combo-btn" data-key="${escapeHtml(c.key)}" value="Schedule">
                    <input type="button" class="action-btn cancel-btn btn-sm delete-combo-btn" data-id="${c.id}" value="X">
                </div>
            </div>
        `;
    }).join('');

    // Event: Change color inline (debounced save to database)
    container.querySelectorAll('.combo-color-input').forEach(input => {
        let debounceTimer;
        input.addEventListener('input', (e) => {
            const comboId = parseInt(e.target.dataset.id);
            const newColor = e.target.value;

            // Update dot color immediately
            const row = e.target.closest('.combo-row');
            row.querySelector('.combo-dot').style.background = newColor;

            // Update local cache immediately for smooth UX
            const combo = classCombosCache.find(c => c.id === comboId);
            if (combo) combo.color = newColor;

            // Refresh schedule to show new colors
            filterSchedule();

            // Debounce the API call
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                updateComboColor(comboId, newColor);
            }, 500);
        });
    });

    // Event: Schedule combo
    container.querySelectorAll('.schedule-combo-btn').forEach(btn => {
        btn.addEventListener('click', () => showScheduleModal(btn.dataset.key));
    });

    // Event: Delete combo
    container.querySelectorAll('.delete-combo-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this combo?')) {
                const comboId = parseInt(btn.dataset.id);
                if (await deleteCombo(comboId)) {
                    renderCombos();
                    populateTypeFilter();
                }
            }
        });
    });
}

/**
 * Capitalize first letter of each word
 */
function capitalize(str) {
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Show modal to create a new combo
 */
function showNewComboModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'new-combo-modal';

    // Build type options (from default types + any custom types in existing combos)
    const existingTypes = new Set(getCombosArray().map(c => c.type));
    const allTypes = [...new Set([...DEFAULT_CLASS_TYPES.map(t => t.toLowerCase()), ...existingTypes])];
    const typeOptions = allTypes.map(t => `<option value="${escapeHtml(t)}">${capitalize(t)}</option>`).join('');
    const ageOptions = AGE_GROUPS.map(a => `<option value="${escapeHtml(a)}">${a}</option>`).join('');

    overlay.innerHTML = `
        <div class="modal-content">
            <h3>New Class Combo</h3>

            <div class="combo-preview" id="combo-preview">
                <span class="combo-preview-dot" id="preview-dot" style="background: #808080;"></span>
                <span class="combo-preview-text" id="preview-text">Select type...</span>
            </div>

            <div class="form-field">
                <label>Type</label>
                <div class="input-with-btn">
                    <select id="combo-type" class="custom-select">
                        <option value="">-- Select or type new --</option>
                        ${typeOptions}
                    </select>
                    <input type="text" id="combo-type-new" placeholder="Or type new..." style="flex: 1;">
                </div>
            </div>

            <div class="form-field">
                <label>Age Group</label>
                <select id="combo-age" class="custom-select">
                    <option value="">-- Select --</option>
                    ${ageOptions}
                </select>
            </div>

            <div class="form-field">
                <label>Color (hex)</label>
                <div class="hex-input-row">
                    <span class="hex-preview" id="hex-preview" style="background: #808080;"></span>
                    <input type="text" id="combo-color" value="#808080" placeholder="#808080" maxlength="7" style="width: 100px;">
                </div>
            </div>

            <div id="combo-modal-error" class="error-text"></div>
            <div class="modal-actions">
                <input type="button" id="save-combo-btn" class="action-btn go-btn" value="Create Combo">
                <input type="button" id="cancel-combo-btn" class="action-btn cancel-btn" value="Cancel">
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const typeSelect = document.getElementById('combo-type');
    const typeNew = document.getElementById('combo-type-new');
    const ageSelect = document.getElementById('combo-age');
    const colorInput = document.getElementById('combo-color');
    const hexPreview = document.getElementById('hex-preview');
    const previewDot = document.getElementById('preview-dot');
    const previewText = document.getElementById('preview-text');

    function isValidHex(hex) {
        return /^#[0-9A-Fa-f]{6}$/.test(hex);
    }

    function updatePreview() {
        const type = typeNew.value.trim() || typeSelect.value;
        const age = ageSelect.value;
        let color = colorInput.value.trim();

        // Auto-add # if missing
        if (color && !color.startsWith('#')) {
            color = '#' + color;
            colorInput.value = color;
        }

        // Update previews if valid hex
        if (isValidHex(color)) {
            previewDot.style.background = color;
            hexPreview.style.background = color;
        }

        let text = type ? capitalize(type) : 'Select type...';
        if (age) text += ` - ${age}`;
        previewText.textContent = text;
    }

    typeSelect.addEventListener('change', () => {
        typeNew.value = '';
        updatePreview();
    });
    typeNew.addEventListener('input', () => {
        typeSelect.value = '';
        updatePreview();
    });
    ageSelect.addEventListener('change', updatePreview);
    colorInput.addEventListener('input', updatePreview);

    document.getElementById('cancel-combo-btn').addEventListener('click', () => overlay.remove());

    document.getElementById('save-combo-btn').addEventListener('click', async () => {
        const type = (typeNew.value.trim() || typeSelect.value);
        const age = ageSelect.value;
        let color = colorInput.value.trim();
        const errorDiv = document.getElementById('combo-modal-error');

        if (!type) {
            errorDiv.textContent = 'Please select or enter a type';
            return;
        }
        if (!age) {
            errorDiv.textContent = 'Please select an age group';
            return;
        }

        // Auto-add # if missing
        if (color && !color.startsWith('#')) {
            color = '#' + color;
        }

        if (!isValidHex(color)) {
            errorDiv.textContent = 'Invalid hex color (e.g. #FF5757)';
            return;
        }

        // Check if already exists in cache
        const exists = classCombosCache.some(c =>
            c.type.toLowerCase() === type.toLowerCase() &&
            (c.age_group || '').toLowerCase() === age.toLowerCase()
        );
        if (exists) {
            errorDiv.textContent = 'This combo already exists';
            return;
        }

        const success = await addCombo(type, age, color);
        if (success) {
            overlay.remove();
            renderCombos();
            populateTypeFilter();
            util.showSuccess('Combo created');
        }
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

/**
 * Populate the type filter dropdown based on combos
 */
function populateTypeFilter() {
    const typeFilter = document.getElementById('schedule-type-filter');
    if (!typeFilter) return;

    const types = [...new Set(getCombosArray().map(c => c.type))];

    let html = '<option value="all">All Types</option>';
    types.forEach(type => {
        html += `<option value="${escapeHtml(type)}">${capitalize(type)}</option>`;
    });
    typeFilter.innerHTML = html;
}

/**
 * Get color for a class entry based on its name/type and age_group
 */
function getClassEntryColor(classEntry) {
    const type = classEntry.name || '';
    const ageGroup = classEntry.age_group || '';
    return getComboColor(type, ageGroup);
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
        // Auto-create combos from existing schedule entries
        await syncCombosFromSchedule();
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
    const typeFilter = document.getElementById('schedule-type-filter')?.value || 'all';

    let filtered = allClasses;

    // Filter by day
    if (dayFilter !== 'all') {
        const dayNum = parseInt(dayFilter);
        filtered = filtered.filter(c => c.day === dayNum);
    }

    // Filter by type (case-insensitive comparison)
    if (typeFilter !== 'all') {
        filtered = filtered.filter(c => (c.name || '').toLowerCase() === typeFilter.toLowerCase());
    }

    renderSchedule(filtered);
}

/**
 * Render the schedule grouped by day with headers
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
        const day = c.day;
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(c);
    });

    // Sort classes within each day by time
    Object.values(byDay).forEach(dayClasses => {
        dayClasses.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    });

    let html = '';
    // Use DAY_ORDER for Monday-first display
    DAY_ORDER.filter(day => byDay[day]).forEach(day => {
        const dayName = DAY_NAMES[day] || 'Unknown';
        const dayClasses = byDay[day];

        html += `<div class="schedule-day-group">`;
        html += `<div class="schedule-day-header">${dayName}</div>`;

        dayClasses.forEach(c => {
            const color = getClassEntryColor(c);
            const typeName = c.name || 'Unknown';
            const timeStr = formatTime(c.time);

            html += `
                <div class="class-row" data-id="${c.id}">
                    <span class="class-type-dot" style="background: ${color};" title="${escapeHtml(typeName)}"></span>
                    <div class="class-info">
                        <span class="class-type-label">${escapeHtml(typeName)}</span>
                        <span class="class-time">${timeStr}</span>
                        ${c.age_group ? `<span class="class-age-group sticker">${escapeHtml(c.age_group)}</span>` : ''}
                    </div>
                    <div class="class-actions">
                        <input type="button" class="action-btn edit-class-btn" data-id="${c.id}" value="Edit">
                        <input type="button" class="action-btn cancel-btn delete-class-btn" data-id="${c.id}" value="Delete">
                    </div>
                </div>
            `;
        });

        html += `</div>`;
    });

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
 * Show modal to schedule a combo (just day/time)
 * @param {string} comboKey - The combo key (type.agegroup) to schedule
 * @param {object} editData - Optional existing class data for editing
 */
function showScheduleModal(comboKey, editData = null) {
    const isEdit = !!editData;
    const combo = getCombosArray().find(c => c.key === comboKey);

    if (!combo && !isEdit) {
        util.showError('Combo not found');
        return;
    }

    // For editing, get type/age from the existing data
    const type = isEdit ? editData.name : combo.type;
    const ageGroup = isEdit ? editData.age_group : combo.ageGroup;
    const color = getComboColor(type, ageGroup);
    const displayAge = ageGroup ? ` - ${capitalize(ageGroup)}` : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'schedule-modal';

    // Build day options (Monday first)
    const dayOptions = DAY_ORDER.map(idx =>
        `<option value="${idx}" ${editData?.day === idx ? 'selected' : ''}>${DAY_NAMES[idx]}</option>`
    ).join('');

    overlay.innerHTML = `
        <div class="modal-content">
            <h3>${isEdit ? 'Edit Schedule Entry' : 'Schedule Class'}</h3>

            <div class="combo-preview">
                <span class="combo-preview-dot" style="background: ${color};"></span>
                <span class="combo-preview-text">${capitalize(type)}${displayAge}</span>
            </div>

            <div class="form-row">
                <div class="form-field">
                    <label for="schedule-day">Day</label>
                    <select id="schedule-day" class="custom-select">
                        ${dayOptions}
                    </select>
                </div>
                <div class="form-field">
                    <label for="schedule-time">Time</label>
                    <input type="time" id="schedule-time" value="${editData?.time?.slice(0, 5) || ''}">
                </div>
            </div>

            <div id="schedule-modal-error" class="error-text"></div>
            <div class="modal-actions">
                <input type="button" id="save-schedule-btn" class="action-btn go-btn" value="${isEdit ? 'Save Changes' : 'Add to Schedule'}">
                <input type="button" id="cancel-schedule-btn" class="action-btn cancel-btn" value="Cancel">
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('cancel-schedule-btn').addEventListener('click', () => overlay.remove());

    document.getElementById('save-schedule-btn').addEventListener('click', async () => {
        const day = parseInt(document.getElementById('schedule-day').value);
        const time = document.getElementById('schedule-time').value;
        const errorDiv = document.getElementById('schedule-modal-error');

        if (!time) {
            errorDiv.textContent = 'Time is required';
            return;
        }

        try {
            const url = isEdit
                ? `${global.API_IP}/api/classes/editClass/${editData.id}`
                : `${global.API_IP}/api/classes/addClass`;

            const method = isEdit ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${global.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: type,
                    day,
                    time,
                    age_group: ageGroup
                })
            });

            if (res.status === 401) {
                util.kick();
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                errorDiv.textContent = data.error || 'Failed to save';
                return;
            }

            overlay.remove();
            util.showSuccess(isEdit ? 'Entry updated' : 'Class scheduled');
            loadSchedule();

        } catch (err) {
            console.error('Error saving schedule:', err);
            errorDiv.textContent = 'Network error. Please try again.';
        }
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

/**
 * Show modal to edit a scheduled class
 */
function showEditClassModal(id) {
    const classData = allClasses.find(c => c.id == id);
    if (!classData) {
        util.showError('Class not found');
        return;
    }
    // Generate the combo key from existing data
    const comboKey = `${(classData.name || '').toLowerCase()}.${(classData.age_group || '').toLowerCase()}`;
    showScheduleModal(comboKey, classData);
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
