/**
 * TMV Membership - Redesign Main JS
 * Connects the redesigned UI to the existing backend API
 *
 * PLANNED FEATURES:
 * -----------------
 * - Pass Types Settings: Add a settings menu to manage pass types dynamically
 *   - Add/edit pass types (name, color, quick-add buttons)
 *   - Soft delete: disabled passes can still be used but not added to new accounts
 *   - This replaces hardcoded pass types (Aerial Silks no longer used, etc.)
 */

import { API_IP } from './globals.js';
import {
    getTimeRangeInTimezone,
    getTodayStringInTimezone,
    getDayBoundsInTimezone
} from './utils.js';
import { initSettingsTab } from './settingsTab.js';
import { initializeRole } from './roleManager.js';

// ============================================================================
// AUTH
// ============================================================================
const token = localStorage.getItem('token');
if (token) {
    fetch(`${API_IP}/api/auth/verifyToken`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
        .then(res => {
            if (!res.ok) throw new Error('Invalid token');
            initApp();
        })
        .catch(() => {
            localStorage.removeItem('token');
            window.location.href = '/auth.html';
        });
} else {
    window.location.href = '/auth.html';
}

// ============================================================================
// STATE
// ============================================================================
let currentTab = 'search';
let selectedAccountForEdit = null;
let searchMethod = 'name';
let allAccounts = [];
let filters = { open: false, classes: false, athletic: false };

// Class combos cache (loaded from database)
let classCombosCache = [];

// ============================================================================
// THEME
// ============================================================================
function initTheme() {
    const savedTheme = localStorage.getItem('tmv-theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('darkmode');
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('darkmode');
    localStorage.setItem('tmv-theme', isDark ? 'dark' : 'light');
}

// Expose to window for onclick handler
window.toggleTheme = toggleTheme;

// Apply saved theme immediately (before DOMContentLoaded)
initTheme();

// ============================================================================
// INIT
// ============================================================================
async function initApp() {
    console.log('Redesign app initialized');

    // Initialize role from token (required for settings tab)
    initializeRole();

    // Load class combos from database (needed for schedule colors)
    await loadClassCombos();

    // Load initial data
    loadSearchResults();
    loadDailyCheckins();

    // Set up event listeners
    setupNavigation();
    setupSearch();
    setupFilters();
    setupCheckinDateNav();
    setupDailyCheckins();

    // Setup two-panel check-in layout
    setupTwoPanelCheckin();
}

// ============================================================================
// NAVIGATION
// ============================================================================
function setupNavigation() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            if (tab) goToTab(tab);
        });
    });

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
        // Restore saved state
        const isCollapsed = localStorage.getItem('tmv-sidebar-collapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
        }

        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const collapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('tmv-sidebar-collapsed', collapsed);
        });
    }
}

function goToTab(tab) {
    currentTab = tab;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(n => n.classList.add('active'));

    // Update content
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    const tabContent = document.getElementById(`tab-${tab}`);
    if (tabContent) tabContent.classList.remove('hidden');

    // Initialize settings tab when selected
    if (tab === 'settings') {
        initSettingsTab();
    }

    // Load daily check-ins (activity log) when checkins tab is selected
    if (tab === 'checkins') {
        loadDailyCheckinsLog(currentLogDate);
    }
}

// ============================================================================
// SEARCH
// ============================================================================
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            loadSearchResults();
            // Toggle clear button visibility
            if (clearBtn) {
                clearBtn.classList.toggle('visible', searchInput.value.length > 0);
            }
        }, 300));
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                loadSearchResults();
                clearBtn.classList.remove('visible');
                searchInput.focus();
            }
        });
    }
}

function setupFilters() {
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const wasActive = pill.classList.contains('active');

            // Deactivate all pills first (radio behavior)
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            filters.open = false;
            filters.classes = false;
            filters.athletic = false;

            // Toggle the clicked pill (if it wasn't active, activate it)
            if (!wasActive) {
                pill.classList.add('active');
                if (pill.classList.contains('open')) filters.open = true;
                if (pill.classList.contains('classes')) filters.classes = true;
                if (pill.classList.contains('athletic')) filters.athletic = true;
            }

            loadSearchResults();
        });
    });
}

async function loadSearchResults() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const hasFilters = filters.open || filters.classes || filters.athletic;

    // Toggle between suggestions and search results
    const suggestionsContent = document.getElementById('suggestions-content');
    const searchResultsContent = document.getElementById('search-results-content');

    if (searchTerm.length === 0 && !hasFilters) {
        // Show suggestions/upcoming
        if (suggestionsContent) suggestionsContent.classList.remove('hidden');
        if (searchResultsContent) searchResultsContent.classList.add('hidden');
        await loadUpcomingCheckins();
    } else {
        // Show search results
        if (suggestionsContent) suggestionsContent.classList.add('hidden');
        if (searchResultsContent) searchResultsContent.classList.remove('hidden');
        await searchAccounts(searchTerm);
    }
}

async function searchAccounts(searchTerm) {
    try {
        const response = await fetch(`${API_IP}/api/users/searchUser`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                value: searchTerm.trim(),
                searchMethod,
                filter: {
                    open: filters.open,
                    class: filters.classes,
                    athletic: filters.athletic
                }
            })
        });

        if (response.status === 401) {
            window.location.href = '/auth.html';
            return;
        }

        let accounts = await response.json();
        accounts = accounts || [];

        // Filter to only show accounts with ACTIVE memberships matching the filter
        const hasFilters = filters.open || filters.classes || filters.athletic;
        if (hasFilters) {
            accounts = accounts.filter(account => hasActiveFilteredMembership(account));
        }

        allAccounts = accounts;
        renderMemberTable(allAccounts);

    } catch (error) {
        console.error('Search error:', error);
        renderMemberTable([]);
    }
}

// Check if account has an active membership matching the current filters
function hasActiveFilteredMembership(account) {
    if (!account.memberships || account.memberships.length === 0) return false;

    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return account.memberships.some(m => {
        // Check if membership is active (not expired, not closed)
        const isExpired = m.end_date && new Date(m.end_date) < todayDate;
        const isActive = !m.is_closed && !isExpired;
        if (!isActive) return false;

        // Check if membership type matches any active filter
        if (filters.open && m.type === 'open') return true;
        if (filters.classes && m.type === 'class') return true;
        if (filters.athletic && m.type === 'athletic') return true;

        return false;
    });
}

function renderMemberTable(accounts) {
    const tbody = document.querySelector('.member-table tbody');
    const countEl = document.getElementById('member-count');
    if (!tbody) return;

    if (accounts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:24px;">No results found</td></tr>`;
        if (countEl) countEl.textContent = '0 total';
        return;
    }

    tbody.innerHTML = accounts.map(account => createMemberRow(account)).join('');
    if (countEl) countEl.textContent = `${accounts.length} total`;
}

function createMemberRow(account) {
    const name = account.name || 'Unknown';
    const email = account.email || '';

    return `
        <tr onclick="openEditAccount('${account.id}')" style="cursor:pointer;">
            <td>
                <div class="member-name">${escapeHtml(name)}</div>
                <div class="member-contact">${escapeHtml(email)}</div>
            </td>
            <td>${renderMemberships(account)}</td>
            <td>${renderPasses(account)}</td>
            <td class="member-notes">${escapeHtml(account.notes || '')}</td>
            <td>
                <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); openCheckinModal('${account.id}')">Check In</button>
            </td>
        </tr>
    `;
}

function renderMemberships(account) {
    const memberships = account.memberships || [];
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let html = '';
    let hasActive = false;

    for (const m of memberships) {
        if (m.is_closed) continue;

        const isExpired = m.end_date && new Date(m.end_date) < todayDate;

        // Skip expired memberships older than 30 days
        if (isExpired) {
            const daysSinceExpired = Math.floor((todayDate - new Date(m.end_date)) / (1000 * 60 * 60 * 24));
            if (daysSinceExpired > 30) continue;
        }

        if (hasActive && isExpired) continue;

        const typeName = getMembershipTypeName(m.type);
        const typeClass = getMembershipTypeClass(m.type, m);
        const status = getMembershipStatus(m, todayDate);

        // Build badge with optional action button inside
        const actionBtn = status.action
            ? `<span class="badge-action" onclick="event.preventDefault(); event.stopPropagation(); ${status.action}('${account.id}', '${m.id}')">${status.actionLabel}</span>`
            : '';

        html += `<span class="pass-badge ${typeClass}"><span class="badge-label">${typeName}</span><span class="badge-count">${status.text}</span>${actionBtn}</span>`;

        if (!isExpired && !m.is_paused) hasActive = true;

        // Only show one membership per row for clarity
        break;
    }

    return html || '<span class="text-muted">—</span>';
}

function getMembershipTypeName(type) {
    switch (type) {
        case 'open': return 'Open Gym';
        case 'class': return 'Classes';
        case 'athletic': return 'Athletic';
        default: return type;
    }
}

function getMembershipTypeClass(type, membership) {
    if (membership.end_date) {
        const now = new Date();
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endDate = new Date(membership.end_date);
        if (endDate < todayDate) {
            const daysSinceExpired = Math.floor((todayDate - endDate) / (1000 * 60 * 60 * 24));
            if (daysSinceExpired > 14) return 'expired-faded';
            return 'expired';
        }
    }
    // "Attention" state: needs action (paused or not started)
    if (membership.is_paused) return 'attention';
    if (membership.start_date === null && !membership.is_unlimited) return 'attention';

    switch (type) {
        case 'open': return 'opengym';
        case 'class': return 'classes';
        case 'athletic': return 'athletic';
        default: return 'classes';
    }
}

function getMembershipStatus(m, todayDate) {
    // Not started - show base length with Start action
    if (m.start_date === null && !m.is_unlimited) {
        const days = m.base_length || '?';
        return { text: `${days}d`, action: 'startMembership', actionLabel: 'Start' };
    }

    // Unlimited membership (can't be paused)
    if (m.is_unlimited) {
        return { text: '∞' };
    }

    // Check expiration
    if (m.end_date) {
        const endDate = new Date(m.end_date);
        if (endDate < todayDate) {
            return { text: 'Exp', action: 'renewMembership', actionLabel: 'Renew' };
        }
        const daysLeft = Math.ceil((endDate - todayDate) / (1000 * 60 * 60 * 24));
        // Paused - show days left with Resume action (button indicates paused state)
        if (m.is_paused) {
            return { text: `${daysLeft}d`, action: 'resumeMembership', actionLabel: 'Resume' };
        }
        return { text: `${daysLeft}d` };
    }

    return { text: '?' };
}

function renderPasses(account) {
    const passes = [
        { key: 'opengympasses', name: 'Open Gym', class: 'opengym' },
        { key: 'classpasses', name: 'Classes', class: 'classes' },
        { key: 'privatekidpasses', name: 'Priv Kid', class: 'private' },
        { key: 'privateadultpasses', name: 'Priv Adult', class: 'private' },
        { key: 'aerialsilkspasses', name: 'Aerial', class: 'aerial' }
    ];

    const badges = passes
        .filter(p => account[p.key] > 0)
        .map(p => `<span class="pass-badge ${p.class}"><span class="badge-label">${p.name}</span><span class="badge-count">${account[p.key]}</span></span>`)
        .join('');

    return badges || '<span class="text-muted">—</span>';
}

// ============================================================================
// UPCOMING / SUGGESTIONS
// ============================================================================
async function loadUpcomingCheckins() {
    try {
        // Fetch upcoming classes
        const classesResponse = await fetchUpcomingClasses();
        const classes = classesResponse?.classes || [];
        renderUpcomingClasses(classes);

        // Load membership-based suggestions based on class age groups
        await loadMembershipSuggestions(classes);

        // Load pass-based predictions
        await loadPassPredictions();

    } catch (error) {
        console.error('Error loading upcoming:', error);
    }
}

async function fetchUpcomingClasses() {
    const { day, startTime, endTime } = getTimeRangeInTimezone(25);

    const response = await fetch(`${API_IP}/api/classes/fetchClasses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ day, startTime, endTime })
    });

    return response.json();
}

function renderUpcomingClasses(classes) {
    const container = document.getElementById('upcoming-classes-container');
    if (!container) return;

    if (classes.length === 0) {
        container.innerHTML = '<div class="text-muted text-sm">No classes in the next 30 minutes</div>';
        return;
    }

    container.innerHTML = classes.map(cls => {
        const typeClass = cls.name === 'Athletic' ? 'athletic' : (cls.type === 'open' ? 'opengym' : 'classes');
        const time = formatTime(cls.start_time);
        return `
            <div class="upcoming-class-chip ${typeClass}">
                <span class="class-name">${escapeHtml(cls.name)}</span>
                <span class="class-time">${time}</span>
            </div>
        `;
    }).join('');
}

// ============================================================================
// MEMBERSHIP-BASED SUGGESTIONS
// ============================================================================
async function loadMembershipSuggestions(classes) {
    const container = document.getElementById('membership-suggestions-grid');
    if (!container) return;

    // Determine which age groups are in the provided class list
    const hasAthletic = classes.some(cls => cls.name === 'Athletic');
    const hasNormal = classes.some(cls => cls.name !== 'Athletic');
    const hasKids = classes.some(cls => cls.age_group?.includes('Kid') || cls.age_group?.includes('Child'));
    const hasTeens = classes.some(cls => cls.age_group?.includes('Teen'));
    const hasAdults = classes.some(cls => cls.age_group?.includes('Adult') || cls.age_group?.includes("Women's"));

    if (!hasAthletic && !hasNormal) {
        container.innerHTML = '<div class="text-muted text-sm" style="padding: 12px;">No eligible members for upcoming classes</div>';
        return;
    }

    // Fetch members with relevant memberships
    const filter = { open: false, class: hasNormal, athletic: hasAthletic };

    try {
        const response = await fetch(`${API_IP}/api/users/searchUser`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ value: '', searchMethod: 'name', filter })
        });

        const accounts = await response.json();
        if (!accounts?.length) {
            container.innerHTML = '<div class="text-muted text-sm" style="padding: 12px;">No members with active memberships</div>';
            return;
        }

        // Group by age group
        const kids = [], teens = [], adults = [];
        const now = new Date();
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        for (const account of accounts) {
            for (const m of (account.memberships || [])) {
                if (m.is_closed || m.is_paused || m.start_date === null) continue;
                if (m.end_date && new Date(m.end_date) < todayDate) continue;

                if (m.age_group === 'kid' && hasKids) {
                    kids.push({ account, membership: m });
                    break;
                } else if (m.age_group === 'teen' && hasTeens) {
                    teens.push({ account, membership: m });
                    break;
                } else if (m.age_group === 'adult' && hasAdults) {
                    adults.push({ account, membership: m });
                    break;
                }
            }
        }

        // Build HTML
        let html = '';

        if (hasKids && kids.length > 0) {
            html += createSuggestionCard('Kids', 'Classes', kids);
        }
        if (hasTeens && teens.length > 0) {
            html += createSuggestionCard('Teens', 'Classes', teens);
        }
        if (hasAdults && adults.length > 0) {
            html += createSuggestionCard('Adults', 'Memberships', adults);
        }

        container.innerHTML = html || '<div class="text-muted text-sm" style="padding: 12px;">No suggested members for upcoming classes</div>';

    } catch (error) {
        console.error('Error loading membership suggestions:', error);
        container.innerHTML = '<div class="text-muted text-sm" style="padding: 12px;">Failed to load suggestions</div>';
    }
}

function createSuggestionCard(title, subtitle, items) {
    const rows = items.slice(0, 5).map(({ account, membership }) => {
        const typeName = getMembershipTypeName(membership.type);
        const typeClass = getMembershipTypeClass(membership.type, membership);
        return `
            <div class="suggestion-row" onclick="openCheckinModal('${account.id}')" style="cursor:pointer;">
                <span class="suggestion-name">${escapeHtml(account.name)}</span>
                <span class="pass-badge ${typeClass}"><span class="badge-label">${typeName}</span></span>
            </div>
        `;
    }).join('');

    return `
        <div class="card">
            <div class="card-header">
                <h2 class="card-title">${title}</h2>
                <span class="text-muted text-sm">${subtitle}</span>
            </div>
            <div class="suggestion-list">
                ${rows}
            </div>
        </div>
    `;
}

// ============================================================================
// PASS-BASED PREDICTIONS
// ============================================================================
async function loadPassPredictions() {
    const container = document.getElementById('pass-predictions-list');
    if (!container) return;

    try {
        const { day, startTime, endTime } = getTimeRangeInTimezone(15);

        const response = await fetch(`${API_IP}/api/users/fetchUpcomingCheckins`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ day, startTime, endTime })
        });

        const predictions = await response.json();

        if (!predictions?.length) {
            container.innerHTML = '<div class="text-muted text-sm" style="padding: 12px;">No predicted check-ins right now</div>';
            return;
        }

        container.innerHTML = predictions.slice(0, 8).map(account => {
            // Find first non-zero pass
            const passTypes = [
                { key: 'opengympasses', name: 'Open Gym', class: 'opengym' },
                { key: 'classpasses', name: 'Classes', class: 'classes' },
                { key: 'privatekidpasses', name: 'Priv Kid', class: 'private' },
                { key: 'privateadultpasses', name: 'Priv Adult', class: 'private' },
                { key: 'aerialsilkspasses', name: 'Aerial', class: 'aerial' }
            ];

            let badgeHtml = '';
            for (const p of passTypes) {
                if (account[p.key] > 0) {
                    badgeHtml = `<span class="pass-badge ${p.class}"><span class="badge-label">${p.name}</span><span class="badge-count">${account[p.key]}</span></span>`;
                    break;
                }
            }

            return `
                <div class="suggestion-row" onclick="openCheckinModal('${account.id}')" style="cursor:pointer;">
                    <span class="suggestion-name">${escapeHtml(account.name)}</span>
                    ${badgeHtml}
                    <span class="text-muted text-sm">Usually checks in now</span>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading pass predictions:', error);
        container.innerHTML = '<div class="text-muted text-sm" style="padding: 12px;">Failed to load predictions</div>';
    }
}

// ============================================================================
// DAILY CHECK-INS (Class-First Approach)
// ============================================================================
let currentCheckinDate = getTodayStringInTimezone();
let currentLogDate = getTodayStringInTimezone(); // Separate date for log tab
let daySchedule = []; // Classes for the current day
let dayCheckins = []; // Check-ins for the current day
let currentClassForCheckin = null; // Currently selected class for check-in modal

function setupCheckinDateNav() {
    const dateInput = document.getElementById('checkin-date-input');
    const prevBtn = document.getElementById('checkin-prev-day');
    const nextBtn = document.getElementById('checkin-next-day');
    const todayBtn = document.getElementById('checkin-today');
    const refreshBtn = document.getElementById('checkin-refresh');
    const walkinBtn = document.getElementById('walkin-btn');

    if (dateInput) {
        dateInput.value = currentCheckinDate;
        dateInput.addEventListener('change', () => {
            currentCheckinDate = dateInput.value;
            loadDayScheduleAndCheckins(currentCheckinDate);
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            const date = new Date(currentCheckinDate);
            date.setDate(date.getDate() - 1);
            currentCheckinDate = date.toISOString().split('T')[0];
            if (dateInput) dateInput.value = currentCheckinDate;
            loadDayScheduleAndCheckins(currentCheckinDate);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const date = new Date(currentCheckinDate);
            date.setDate(date.getDate() + 1);
            currentCheckinDate = date.toISOString().split('T')[0];
            if (dateInput) dateInput.value = currentCheckinDate;
            loadDayScheduleAndCheckins(currentCheckinDate);
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            currentCheckinDate = getTodayStringInTimezone();
            if (dateInput) dateInput.value = currentCheckinDate;
            loadDayScheduleAndCheckins(currentCheckinDate);
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDayScheduleAndCheckins(currentCheckinDate);
        });
    }

    if (walkinBtn) {
        walkinBtn.addEventListener('click', openWalkinModal);
    }

    // Setup class check-in search
    const searchInput = document.getElementById('class-checkin-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            searchForClassCheckin(searchInput.value.trim());
        }, 300));
    }
}

// ============================================================================
// DAILY CHECK-INS TAB (Activity Log for the day)
// ============================================================================

function setupDailyCheckins() {
    const dateInput = document.getElementById('dailyCheckinDate');
    const refreshBtn = document.getElementById('refresh-daily-checkins');

    if (dateInput) {
        dateInput.value = currentLogDate;
        dateInput.addEventListener('change', () => {
            currentLogDate = dateInput.value;
            loadDailyCheckinsLog(currentLogDate);
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDailyCheckinsLog(currentLogDate);
        });
    }
}

async function loadDailyCheckinsLog(date) {
    const dateStr = date || currentLogDate || getTodayStringInTimezone();
    currentLogDate = dateStr;

    const list = document.getElementById('dailyCheckin-list');
    const infoDiv = document.getElementById('dailyCheckin-info');

    if (list) {
        list.innerHTML = '<div class="text-muted text-sm" style="padding: 24px; text-align: center;">Loading...</div>';
    }

    try {
        const startTime = new Date(`${dateStr}T00:00:00`).toISOString();
        const endTime = new Date(`${dateStr}T23:59:59.999`).toISOString();

        const res = await fetch(`${API_IP}/api/logs/fetchDailyCheckins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ startTime, endTime })
        });

        if (res.status === 401) {
            kick();
            return;
        }

        if (!res.ok) {
            throw new Error('Failed to load daily check-ins');
        }

        const data = await res.json();
        const entries = Array.isArray(data) ? data : [];

        // Update info
        if (infoDiv) {
            if (entries.length > 0) {
                infoDiv.innerHTML = `Total Check-ins - (${entries.length})`;
            } else {
                infoDiv.innerHTML = '';
            }
        }

        // Render entries
        if (!list) return;

        if (entries.length === 0) {
            list.innerHTML = '<div class="text-muted text-sm" style="padding: 24px;">No check-ins for this date.</div>';
            return;
        }

        list.innerHTML = entries.map(entry => {
            const timeObj = new Date(entry.timestamp);
            const time = timeObj.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const action = LOG_ACTIONS[entry.action] || entry.action;
            const field = getFieldLabel(entry.field);
            const value = getValueDisplay(entry);

            return `
                <div class="dailyCheckin-entry">
                    <div>${time}</div>
                    <div style="font-weight: 600; color: ${entry.name ? 'var(--color-primary)' : 'var(--color-text-muted)'}; cursor: ${entry.name ? 'pointer' : 'default'};"
                         ${entry.name ? `onclick="searchForMember('${escapeHtml(entry.name)}')"` : ''}>
                        ${escapeHtml(entry.name || 'Unknown')}
                    </div>
                    <div>${action}</div>
                    <div>${field ? `<span class="sticker ${entry.field}-color">${field}</span>` : ''}</div>
                    <div class="oldToNewSticker ${value.cls}">${value.text}</div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading daily check-ins:', err);
        if (list) {
            list.innerHTML = '<div class="text-muted text-sm" style="padding: 24px; text-align: center;">Failed to load check-ins</div>';
        }
    }
}

// Log actions mapping
const LOG_ACTIONS = {
    ACCOUNT_ADDED: 'Account added',
    NAME_UPDATED: 'Name updated',
    EMAIL_UPDATED: 'Email updated',
    PHONE_UPDATED: 'Phone number updated',
    PASS_AMOUNT_UPDATED: 'Pass amount updated',
    MEMBERSHIP_ADDED: 'Membership added',
    MEMBERSHIP_UPDATED: 'Membership updated',
    MEMBERSHIP_STARTED: 'Membership started',
    MEMBERSHIP_PAUSE_UPDATED: 'Membership pause updated',
    NOTE_UPDATED: 'Note updated'
};

// Field label mapping
function getFieldLabel(field) {
    if (!field) return '';
    const labels = {
        opengympasses: 'Open Gym',
        classpasses: 'Classes',
        privatekidpasses: 'Private Kids',
        privateadultpasses: 'Private Adults',
        aerialsilkspasses: 'Aerial Silks',
        type: 'Type',
        age_group: 'Age Group',
        start_date: 'Start Date',
        end_date: 'End Date',
        base_length: 'Base Length',
        is_paused: 'Pause status',
        is_unlimited: 'Unlimited status',
        is_closed: 'Closed status'
    };
    return labels[field] || field;
}

// Value display logic
function getValueDisplay(entry) {
    let text = '';
    let cls = '';

    switch (entry.action) {
        case 'PASS_AMOUNT_UPDATED':
            const diff = entry.new_value - entry.old_value;
            text = `${diff > 0 ? '+' : ''}${diff}`;
            cls = diff > 0 ? 'additive-update' : 'subtractive-update';
            break;
        case 'MEMBERSHIP_ADDED':
            text = `+${entry.new_value} days`;
            cls = 'additive-update';
            break;
        default:
            if (entry.old_value !== null && entry.new_value !== null) {
                text = `${entry.old_value} → ${entry.new_value}`;
            }
    }

    return { text, cls };
}

// Search for member (clicking name in daily checkins)
function searchForMember(name) {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = name;
        goToTab('search');
        loadSearchResults();
    }
}
window.searchForMember = searchForMember;

// Load both schedule and check-ins for a day
async function loadDayScheduleAndCheckins(date) {
    const dateStr = date || currentCheckinDate || getTodayStringInTimezone();
    currentCheckinDate = dateStr;

    const scheduleContainer = document.getElementById('day-schedule');
    if (scheduleContainer) {
        scheduleContainer.innerHTML = '<div class="text-muted text-sm" style="padding: 24px; text-align: center;">Loading...</div>';
    }

    try {
        // Get day of week (0=Sunday, 1=Monday, etc.)
        const d = new Date(dateStr);
        const dayOfWeek = d.getDay();

        // Fetch schedule and check-ins in parallel
        // Use scheduleByDay endpoint (EMPLOYEE access) instead of listClasses (ADMIN only)
        const [scheduleRes, checkinsRes] = await Promise.all([
            fetch(`${API_IP}/api/classes/scheduleByDay/${dayOfWeek}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }),
            fetch(`${API_IP}/api/logs/fetchDailyCheckins`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(getDayBoundsInTimezone(dateStr))
            })
        ]);

        const scheduleData = await scheduleRes.json();
        const checkinsData = await checkinsRes.json();

        // Schedule is already filtered by day from the API
        daySchedule = (scheduleData.classes || [])
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        dayCheckins = checkinsData || [];

        renderDaySchedule(dateStr);
        renderCheckinsSummary(dateStr);

    } catch (error) {
        console.error('Error loading day schedule:', error);
        if (scheduleContainer) {
            scheduleContainer.innerHTML = '<div class="text-muted text-sm" style="padding: 24px; text-align: center;">Failed to load schedule</div>';
        }
    }
}

// Render the day's schedule with class cards
function renderDaySchedule(dateStr) {
    const container = document.getElementById('day-schedule');
    if (!container) return;

    const isToday = dateStr === getTodayStringInTimezone();
    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (daySchedule.length === 0) {
        const d = new Date(dateStr);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        container.innerHTML = `<div class="no-classes-message">No classes scheduled for ${dayName}</div>`;
        return;
    }

    // Group check-ins by class (based on time proximity)
    const checkinsByClass = groupCheckinsByClass(dayCheckins, daySchedule);

    let html = '';
    let addedNowDivider = false;

    daySchedule.forEach((cls, index) => {
        const classTime = cls.time?.slice(0, 5) || '00:00';
        const isPast = isToday && classTime < currentTimeStr;
        const isCurrent = isToday && isCurrentClass(cls, currentTimeStr);

        // Add "NOW" divider before the current class
        if (isToday && !addedNowDivider && !isPast) {
            html += `<div class="time-divider now">Current Time</div>`;
            addedNowDivider = true;
        }

        const classCheckins = checkinsByClass[cls.id] || [];
        const checkinCount = classCheckins.length;

        // Get color from localStorage combos or fallback
        const color = getClassColor(cls.name, cls.age_group);

        const stateClass = isPast ? 'past' : (isCurrent ? 'current' : '');
        const countClass = checkinCount > 0 ? 'has-checkins' : '';

        html += `
            <div class="schedule-class-card ${stateClass}" data-class-id="${cls.id}" style="--class-color: ${color};">
                <div class="class-card-header" onclick="openClassCheckinModal('${cls.id}')">
                    <div class="class-card-info">
                        <span class="class-card-name">${escapeHtml(cls.name)}</span>
                        <div class="class-card-meta">
                            <span class="class-card-time">${formatTime(classTime)}</span>
                            ${cls.age_group ? `<span class="class-card-age">${escapeHtml(cls.age_group)}</span>` : ''}
                        </div>
                    </div>
                    <div class="class-card-count ${countClass}">
                        <span>${checkinCount}</span>
                        <span>👤</span>
                    </div>
                </div>
                ${checkinCount > 0 ? `
                    <div class="class-card-attendees">
                        <div class="attendees-preview">
                            ${classCheckins.slice(0, 5).map(c => `
                                <span class="attendee-chip ${c.is_walkin ? 'walkin' : ''}">
                                    <span class="attendee-name">${escapeHtml(c.user_name || 'Unknown')}</span>
                                </span>
                            `).join('')}
                            ${checkinCount > 5 ? `<span class="attendee-chip">+${checkinCount - 5} more</span>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    });

    // Add "Past Classes" divider if all classes are past
    if (isToday && !addedNowDivider && daySchedule.length > 0) {
        html = `<div class="time-divider">All classes completed</div>` + html;
    }

    container.innerHTML = html;
}

// Check if a class is currently happening
function isCurrentClass(cls, currentTimeStr) {
    const startTime = cls.time?.slice(0, 5) || '00:00';
    const startMinutes = timeToMinutes(startTime);
    const currentMinutes = timeToMinutes(currentTimeStr);
    // Assume 1 hour class duration
    return currentMinutes >= startMinutes && currentMinutes < startMinutes + 60;
}

function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Group check-ins by class (match check-in time to closest class)
function groupCheckinsByClass(checkins, classes) {
    const grouped = {};

    checkins.forEach(checkin => {
        const checkinTime = new Date(checkin.timestamp);
        const checkinMinutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();

        // Find the closest class (within 30 mins before or during)
        let matchedClass = null;
        let closestDiff = Infinity;

        classes.forEach(cls => {
            const classMinutes = timeToMinutes(cls.time?.slice(0, 5) || '00:00');
            // Check-in should be within 30 mins before class start to 60 mins after
            if (checkinMinutes >= classMinutes - 30 && checkinMinutes <= classMinutes + 60) {
                const diff = Math.abs(checkinMinutes - classMinutes);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    matchedClass = cls;
                }
            }
        });

        if (matchedClass) {
            if (!grouped[matchedClass.id]) grouped[matchedClass.id] = [];
            grouped[matchedClass.id].push(checkin);
        } else {
            // Unmatched check-ins go to "other"
            if (!grouped['other']) grouped['other'] = [];
            grouped['other'].push(checkin);
        }
    });

    return grouped;
}

// Load class combos from database
async function loadClassCombos() {
    try {
        const res = await fetch(`${API_IP}/api/settings/classCombos`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) return;

        const { combos } = await res.json();
        classCombosCache = combos || [];
    } catch (err) {
        console.error('Error loading class combos:', err);
    }
}

// Get class color from database combos cache
function getClassColor(type, ageGroup) {
    if (!type) return '#808080';

    // Search in database cache
    const combo = classCombosCache.find(c =>
        c.type.toLowerCase() === type.toLowerCase() &&
        (c.age_group || '').toLowerCase() === (ageGroup || '').toLowerCase()
    );
    if (combo) return combo.color;

    // Fallback colors
    const key = `${type.toLowerCase()}.${(ageGroup || '').toLowerCase()}`;
    const fallbackColors = {
        'parkour.kids': '#00bf63',
        'parkour.teens': '#ff5757',
        'parkour.adults': '#ff914d',
        'calisthenics': '#a6a6a6',
        'athletic': '#FFCA28'
    };
    return fallbackColors[key] || fallbackColors[type?.toLowerCase()] || '#808080';
}

// Render check-ins summary (collapsed by default)
function renderCheckinsSummary(dateStr) {
    const container = document.getElementById('checkin-list');
    const countEl = document.getElementById('checkin-count');
    if (!container) return;

    const isToday = dateStr === getTodayStringInTimezone();

    if (countEl) countEl.textContent = `${dayCheckins.length} total`;

    if (dayCheckins.length === 0) {
        container.innerHTML = `<div class="text-muted text-sm" style="padding:24px;text-align:center;">No check-ins ${isToday ? 'yet today' : 'on this day'}</div>`;
        return;
    }

    container.innerHTML = dayCheckins.map(c => {
        const time = formatTimestamp(c.timestamp);
        const typeClass = getCheckinTypeClass(c.type);
        const typeName = getCheckinTypeName(c);

        return `
            <div class="checkin-row">
                <span class="checkin-time">${time}</span>
                <span class="checkin-name">${escapeHtml(c.user_name || 'Unknown')}</span>
                <span class="checkin-type ${typeClass}">${typeName}</span>
                ${isToday ? `<button class="btn btn-ghost btn-sm" onclick="undoCheckin('${c.id}')">Undo</button>` : ''}
            </div>
        `;
    }).join('');
}

// Legacy function for backward compatibility
async function loadDailyCheckins(date) {
    await loadDayScheduleAndCheckins(date);
}

// ============================================================================
// CLASS CHECK-IN MODAL
// ============================================================================
function openClassCheckinModal(classId) {
    const cls = daySchedule.find(c => c.id == classId);
    if (!cls) {
        showToast('Class not found', 'error');
        return;
    }

    currentClassForCheckin = cls;

    // Update modal header
    const titleEl = document.getElementById('class-checkin-title');
    const dotEl = document.getElementById('class-checkin-dot');
    const textEl = document.getElementById('class-checkin-text');

    if (titleEl) titleEl.textContent = `${cls.name} Check-in`;
    if (dotEl) dotEl.style.background = getClassColor(cls.name, cls.age_group);
    if (textEl) textEl.textContent = `${cls.name}${cls.age_group ? ` - ${cls.age_group}` : ''} @ ${formatTime(cls.time?.slice(0, 5))}`;

    // Load attendees for this class
    const checkinsByClass = groupCheckinsByClass(dayCheckins, daySchedule);
    const classCheckins = checkinsByClass[classId] || [];
    renderClassAttendees(classCheckins);

    // Load suggestions based on membership type
    loadClassSuggestions(cls);

    // Clear search
    const searchInput = document.getElementById('class-checkin-search');
    if (searchInput) searchInput.value = '';
    const searchResults = document.getElementById('class-search-results');
    if (searchResults) searchResults.innerHTML = '';

    // Show modal
    document.getElementById('class-checkin-modal')?.classList.remove('hidden');
}

function closeClassCheckinModal() {
    document.getElementById('class-checkin-modal')?.classList.add('hidden');
    currentClassForCheckin = null;
}

function renderClassAttendees(checkins) {
    const container = document.getElementById('class-attendees-list');
    const countEl = document.getElementById('class-attendees-count');

    if (countEl) countEl.textContent = checkins.length;

    if (!container) return;

    if (checkins.length === 0) {
        container.innerHTML = '<div class="text-muted text-sm">No check-ins yet</div>';
        return;
    }

    container.innerHTML = checkins.map(c => {
        const time = formatTimestamp(c.timestamp);
        const badgeHtml = renderAttendeeBadge(c);

        return `
            <div class="attendee-row">
                <span class="attendee-name">${escapeHtml(c.user_name || 'Unknown')}</span>
                ${badgeHtml}
                <span class="attendee-time">${time}</span>
            </div>
        `;
    }).join('');
}

async function loadClassSuggestions(cls) {
    const container = document.getElementById('class-suggestions-list');
    if (!container) return;

    container.innerHTML = '<div class="text-muted text-sm">Loading...</div>';

    // Determine what membership types can attend this class
    const classType = cls.name?.toLowerCase() || '';
    const ageGroup = cls.age_group?.toLowerCase() || '';

    // Find members with matching active memberships
    const suggestedMembers = allAccounts.filter(account => {
        if (!account.memberships) return false;

        return account.memberships.some(m => {
            if (m.is_closed) return false;

            // Check if membership is active
            const now = new Date();
            const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            if (m.end_date && new Date(m.end_date) < todayDate) return false;
            if (m.start_date === null && !m.is_unlimited) return false;
            if (m.is_paused) return false;

            // Match membership type to class type
            if (classType === 'athletic') {
                return m.type === 'athletic';
            } else {
                // Regular classes accept "class" memberships
                if (m.type !== 'class') return false;

                // Optionally match age group
                if (ageGroup && m.age_group) {
                    const memberAge = m.age_group.toLowerCase();
                    return memberAge === ageGroup ||
                        ageGroup.includes(memberAge) ||
                        memberAge.includes(ageGroup);
                }
                return true;
            }
        });
    });

    // Also find members with class passes (for non-athletic classes)
    const passMembers = classType !== 'athletic' ? allAccounts.filter(account => {
        return (account.classpasses || 0) > 0;
    }) : [];

    // Combine and deduplicate
    const allSuggested = [...suggestedMembers];
    passMembers.forEach(pm => {
        if (!allSuggested.find(s => s.id === pm.id)) {
            allSuggested.push(pm);
        }
    });

    // Filter out those already checked in today
    const checkedInIds = new Set(dayCheckins.map(c => c.user_id));
    const availableSuggestions = allSuggested.filter(s => !checkedInIds.has(s.id));

    if (availableSuggestions.length === 0) {
        container.innerHTML = '<div class="text-muted text-sm">No suggestions available</div>';
        return;
    }

    // Sort by name and limit to 10
    availableSuggestions.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const limited = availableSuggestions.slice(0, 10);

    container.innerHTML = limited.map(account => {
        // Determine what they can use to check in
        const hasMembership = account.memberships?.some(m => {
            if (m.is_closed || m.is_paused) return false;
            const now = new Date();
            const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (m.end_date && new Date(m.end_date) < todayDate) return false;
            if (m.start_date === null && !m.is_unlimited) return false;
            return classType === 'athletic' ? m.type === 'athletic' : m.type === 'class';
        });
        const hasPasses = classType !== 'athletic' && (account.classpasses || 0) > 0;

        return `
            <div class="suggestion-item" onclick="quickCheckinFromModal('${account.id}', '${hasMembership ? 'membership' : 'pass'}')">
                <span class="suggestion-name">${escapeHtml(account.name)}</span>
                <div class="suggestion-info">
                    ${hasMembership ? '<span class="pass-badge membership" style="font-size:10px;padding:2px 6px;">Membership</span>' : ''}
                    ${hasPasses ? `<span class="pass-badge classes" style="font-size:10px;padding:2px 6px;">${account.classpasses} passes</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function searchForClassCheckin(searchTerm) {
    const container = document.getElementById('class-search-results');
    if (!container) return;

    if (!searchTerm || searchTerm.length < 2) {
        container.innerHTML = '';
        return;
    }

    const searchLower = searchTerm.toLowerCase();
    const matches = allAccounts.filter(a =>
        (a.name || '').toLowerCase().includes(searchLower) ||
        (a.email || '').toLowerCase().includes(searchLower) ||
        (a.phone_number || '').includes(searchTerm)
    ).slice(0, 5);

    if (matches.length === 0) {
        container.innerHTML = '<div class="text-muted text-sm" style="padding: 8px;">No matches found</div>';
        return;
    }

    container.innerHTML = matches.map(account => `
        <div class="search-result-item">
            <span class="result-name">${escapeHtml(account.name)}</span>
            <button class="quick-checkin-btn" onclick="quickCheckinFromModal('${account.id}', 'auto')">Check In</button>
        </div>
    `).join('');
}

async function quickCheckinFromModal(userId, type) {
    if (!currentClassForCheckin) {
        showToast('No class selected', 'error');
        return;
    }

    const account = allAccounts.find(a => a.id === userId);
    if (!account) {
        showToast('Account not found', 'error');
        return;
    }

    // Determine check-in type if "auto"
    let checkinType = type;
    if (type === 'auto') {
        const classType = currentClassForCheckin.name?.toLowerCase() || '';
        const hasMembership = account.memberships?.some(m => {
            if (m.is_closed || m.is_paused) return false;
            const now = new Date();
            const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (m.end_date && new Date(m.end_date) < todayDate) return false;
            if (m.start_date === null && !m.is_unlimited) return false;
            return classType === 'athletic' ? m.type === 'athletic' : m.type === 'class';
        });
        const hasPasses = classType !== 'athletic' && (account.classpasses || 0) > 0;

        if (hasMembership) {
            checkinType = 'membership';
        } else if (hasPasses) {
            checkinType = 'pass';
        } else {
            showToast('No valid membership or passes', 'error');
            return;
        }
    }

    try {
        const response = await fetch(`${API_IP}/api/account/checkin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                user_id: userId,
                type: checkinType === 'membership' ? 'membership_class' : 'pass_class',
                class_id: currentClassForCheckin.id
            })
        });

        if (response.ok) {
            showToast(`${account.name} checked in!`, 'success');
            // Reload data and refresh modal
            await loadDayScheduleAndCheckins(currentCheckinDate);
            // Refresh the modal content
            openClassCheckinModal(currentClassForCheckin.id);
        } else {
            const data = await response.json();
            showToast(data.error || 'Check-in failed', 'error');
        }
    } catch (error) {
        console.error('Check-in error:', error);
        showToast('Check-in failed', 'error');
    }
}

// ============================================================================
// WALK-IN MODAL
// ============================================================================
function openWalkinModal() {
    // Populate class dropdown with today's schedule (prefer panel schedule, fallback to daySchedule)
    const classSelect = document.getElementById('walkin-class');
    const scheduleToUse = panelDaySchedule.length > 0 ? panelDaySchedule : daySchedule;

    if (classSelect) {
        let options = '<option value="">General (no class)</option>';
        scheduleToUse.forEach(cls => {
            const isSelected = selectedClassForPanel === cls.id;
            options += `<option value="${cls.id}" ${isSelected ? 'selected' : ''}>${cls.name} @ ${formatTime(cls.time?.slice(0, 5))}</option>`;
        });
        classSelect.innerHTML = options;
    }

    // Clear name input
    const nameInput = document.getElementById('walkin-name');
    if (nameInput) nameInput.value = '';

    document.getElementById('walkin-modal')?.classList.remove('hidden');
}

function closeWalkinModal() {
    document.getElementById('walkin-modal')?.classList.add('hidden');
}

async function addWalkin() {
    const nameInput = document.getElementById('walkin-name');
    const classSelect = document.getElementById('walkin-class');

    const name = nameInput?.value.trim();
    const classId = classSelect?.value;

    if (!name) {
        showToast('Please enter a name', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_IP}/api/logs/addWalkin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                class_id: classId || null
            })
        });

        if (response.ok) {
            showToast(`${name} added as walk-in!`, 'success');
            closeWalkinModal();
            // Refresh both the old schedule view and the new panel
            await loadDayScheduleAndCheckins(currentCheckinDate);
            await loadSchedulePanel();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to add walk-in', 'error');
        }
    } catch (error) {
        console.error('Walk-in error:', error);
        showToast('Failed to add walk-in', 'error');
    }
}

function getCheckinTypeClass(type) {
    if (type?.includes('membership')) return 'membership';
    if (type?.includes('open')) return 'opengym';
    return 'classes';
}

function getCheckinTypeName(checkin) {
    if (checkin.type?.includes('membership')) {
        const membershipType = checkin.membership_type || '';
        const typeName = getMembershipTypeName(membershipType);
        return typeName;
    }

    const passNames = {
        'opengympasses': 'Open Gym',
        'classpasses': 'Classes',
        'privatekidpasses': 'Priv Kid',
        'privateadultpasses': 'Private Adult',
        'aerialsilkspasses': 'Aerial'
    };

    return passNames[checkin.type] || checkin.type || 'Check-in';
}

window.undoCheckin = async function(logId) {
    if (!confirm('Undo this check-in?')) return;

    try {
        const response = await fetch(`${API_IP}/api/logs/deleteCheckin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ logId })
        });

        const result = await response.json();
        if (result.success) {
            showToast('Check-in undone', 'success');
            loadDailyCheckins();
            loadSearchResults();
        } else {
            showToast(result.message || 'Failed to undo', 'error');
        }
    } catch (error) {
        console.error('Undo error:', error);
        showToast('Failed to undo check-in', 'error');
    }
};

// ============================================================================
// CHECK-IN MODAL
// ============================================================================
window.openCheckinModal = async function(accountId) {
    const account = allAccounts.find(a => a.id === accountId);
    if (!account) {
        // Fetch account if not in cache
        try {
            const response = await fetch(`${API_IP}/api/users/searchUserById`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id: accountId })
            });
            const fetchedAccount = await response.json();
            showCheckinModal(fetchedAccount);
        } catch (error) {
            console.error('Error fetching account:', error);
        }
    } else {
        showCheckinModal(account);
    }
};

function showCheckinModal(account) {
    if (!account) return;

    const modal = document.getElementById('checkin-modal');
    const nameEl = document.getElementById('checkin-member-name');
    const optionsContainer = document.querySelector('.checkin-options');

    if (nameEl) nameEl.textContent = account.name || 'Unknown';

    // Build options from memberships and passes
    let options = [];

    // Active memberships
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const m of (account.memberships || [])) {
        if (m.is_closed || m.is_paused) continue;
        if (m.start_date === null) continue;
        if (m.end_date && new Date(m.end_date) < todayDate) continue;

        const typeName = getMembershipTypeName(m.type);
        const daysLeft = m.is_unlimited ? 'Unlimited' :
            (m.end_date ? `${Math.ceil((new Date(m.end_date) - todayDate) / (1000 * 60 * 60 * 24))} days left` : '');

        options.push({
            type: 'membership',
            id: m.id,
            label: `${typeName} Membership`,
            detail: daysLeft,
            class: getMembershipTypeClass(m.type, m)
        });
    }

    // Passes
    const passes = [
        { key: 'opengympasses', name: 'Open Gym Pass', class: 'opengym' },
        { key: 'classpasses', name: 'Classes Pass', class: 'classes' },
        { key: 'privatekidpasses', name: 'Priv Kid Pass', class: 'private' },
        { key: 'privateadultpasses', name: 'Private Adult Pass', class: 'private' },
        { key: 'aerialsilkspasses', name: 'Aerial Silks Pass', class: 'aerial' }
    ];

    for (const p of passes) {
        if (account[p.key] > 0) {
            options.push({
                type: 'pass',
                passType: p.key,
                label: p.name,
                detail: `${account[p.key]} remaining`,
                class: p.class
            });
        }
    }

    if (options.length === 0) {
        optionsContainer.innerHTML = '<div class="text-muted">No active memberships or passes</div>';
    } else {
        optionsContainer.innerHTML = options.map(opt => `
            <button class="checkin-option ${opt.class}" onclick="doCheckin('${account.id}', '${opt.type}', '${opt.type === 'pass' ? opt.passType : opt.id}')">
                <span class="option-label">${opt.label}</span>
                <span class="option-detail">${opt.detail}</span>
            </button>
        `).join('');
    }

    modal.classList.remove('hidden');
}

window.closeCheckinModal = function() {
    document.getElementById('checkin-modal')?.classList.add('hidden');
};

window.doCheckin = async function(accountId, type, typeId) {
    try {
        let endpoint, body;

        if (type === 'pass') {
            endpoint = `${API_IP}/api/users/usePass`;
            body = { userId: accountId, passType: typeId };
        } else {
            endpoint = `${API_IP}/api/memberships/useMembership`;
            body = { userId: accountId, membershipId: typeId };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (result.success) {
            showToast('Check-in successful!', 'success');
            closeCheckinModal();
            loadSearchResults();
            loadDailyCheckins();
        } else {
            showToast(result.message || 'Check-in failed', 'error');
        }

    } catch (error) {
        console.error('Check-in error:', error);
        showToast('Check-in failed', 'error');
    }
};

// ============================================================================
// MEMBERSHIP ACTIONS
// ============================================================================
window.startMembership = async function(userId, membershipId) {
    try {
        const response = await fetch(`${API_IP}/api/memberships/startMembership`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userId, membershipId })
        });

        const result = await response.json();
        if (result.success) {
            showToast('Membership started!', 'success');
            loadSearchResults();
        }
    } catch (error) {
        console.error('Start membership error:', error);
    }
};

window.resumeMembership = async function(userId, membershipId) {
    try {
        const response = await fetch(`${API_IP}/api/memberships/unpauseMembership`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userId, membershipId })
        });

        const result = await response.json();
        if (result.success) {
            showToast('Membership resumed!', 'success');
            loadSearchResults();
        }
    } catch (error) {
        console.error('Resume membership error:', error);
    }
};

window.renewMembership = async function(userId, membershipId) {
    // Find the account and membership to get the type
    const account = allAccounts.find(a => a.id === userId);
    if (!account) {
        showToast('Account not found', 'error');
        return;
    }

    const membership = account.memberships?.find(m => m.id === membershipId);
    if (!membership) {
        showToast('Membership not found', 'error');
        return;
    }

    // Open edit account and scroll to memberships, or create new membership with same type
    openEditAccount(userId);

    // After a brief delay to let the UI render, add a new membership row with the same type
    setTimeout(() => {
        addMembershipRow();

        // Find the newly added row (last one)
        const cards = document.querySelectorAll('.membership-card');
        const newCard = cards[cards.length - 1];
        if (newCard) {
            const rowId = newCard.dataset.rowId;

            // Set the type to match the expired membership
            const typeSelect = document.getElementById(`mtype-${rowId}`);
            if (typeSelect) {
                typeSelect.value = membership.type;
                typeSelect.dispatchEvent(new Event('change'));
            }

            // Set age group if applicable
            if (membership.age_group && membership.age_group !== 'NA') {
                const ageSelect = document.getElementById(`mage-${rowId}`);
                if (ageSelect) {
                    ageSelect.value = membership.age_group;
                }
            }

            // Set start date to today
            const startInput = document.getElementById(`mstart-${rowId}`);
            if (startInput) {
                startInput.value = getTodayStringInTimezone();
                startInput.dispatchEvent(new Event('input'));
            }

            showToast('New membership created - set duration and save', 'info');
        }
    }, 100);
};

// ============================================================================
// UTILITIES
// ============================================================================
function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
}

function showToast(message, type = 'info') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        z-index: 9999;
        animation: fadeIn 0.3s ease;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#333'};
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
            }
        });
    });

    // Setup subtab navigation for Add/Edit tabs
    setupSubtabNavigation();
});

// ============================================================================
// SUBTAB NAVIGATION
// ============================================================================
function setupSubtabNavigation() {
    document.querySelectorAll('.subnav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const subtabId = btn.dataset.subtab;
            const parent = btn.closest('.account-layout');

            // Update active button
            parent.querySelectorAll('.subnav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show/hide subtabs
            parent.querySelectorAll('.account-subtab').forEach(tab => {
                tab.classList.toggle('hidden', tab.id !== `subtab-${subtabId}`);
            });
        });
    });
}

// ============================================================================
// ADD ACCOUNT
// ============================================================================
async function addNewAccount() {
    const btn = document.getElementById('add-submit-btn');
    const name = document.getElementById('add-name')?.value.trim() || '';
    const email = document.getElementById('add-email')?.value.trim() || '';
    const phone = document.getElementById('add-phone')?.value.trim() || '';
    const notes = document.getElementById('add-notes')?.value.trim() || '';
    const opengym = parseInt(document.getElementById('add-opengym')?.value) || 0;
    const classes = parseInt(document.getElementById('add-classes')?.value) || 0;
    const privatekid = parseInt(document.getElementById('add-privatekid')?.value) || 0;
    const privateadult = parseInt(document.getElementById('add-privateadult')?.value) || 0;
    const aerial = parseInt(document.getElementById('add-aerial')?.value) || 0;

    // Validation
    if (!name) {
        showToast('Name is required', 'error');
        document.getElementById('add-name')?.focus();
        return;
    }

    if (opengym < 0 || classes < 0 || privatekid < 0 || privateadult < 0 || aerial < 0) {
        showToast('Pass counts cannot be negative', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        const response = await fetch(`${API_IP}/api/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                email,
                phone_number: phone,
                password: '',
                notes,
                opengympasses: opengym,
                classpasses: classes,
                privatekidpasses: privatekid,
                privateadultpasses: privateadult,
                aerialsilkspasses: aerial
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create account');
        }

        showToast('Account created successfully!', 'success');
        clearAddForm();
        goToTab('search');
        loadSearchResults();

    } catch (error) {
        showToast(error.message || 'Failed to create account', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

function clearAddForm() {
    document.getElementById('add-name').value = '';
    document.getElementById('add-email').value = '';
    document.getElementById('add-phone').value = '';
    document.getElementById('add-notes').value = '';
    document.getElementById('add-opengym').value = '0';
    document.getElementById('add-classes').value = '0';
    document.getElementById('add-privatekid').value = '0';
    document.getElementById('add-privateadult').value = '0';
    document.getElementById('add-aerial').value = '0';
}

// ============================================================================
// EDIT ACCOUNT
// ============================================================================
let currentEditAccount = null;
let membershipRowCounter = 0;

function openEditAccount(accountId) {
    // Find account in allAccounts cache
    const account = allAccounts.find(a => a.id == accountId);
    if (!account) {
        showToast('Account not found', 'error');
        return;
    }

    currentEditAccount = account;

    // Populate header
    document.getElementById('edit-account-name').textContent = account.name || 'Unknown';
    document.getElementById('edit-account-contact').textContent = account.email || account.phone_number || '';
    document.getElementById('edit-account-id').value = account.id;

    // Populate personal info
    document.getElementById('edit-name').value = account.name || '';
    document.getElementById('edit-email').value = account.email || '';
    document.getElementById('edit-phone').value = account.phone_number || '';

    // Populate passes
    document.getElementById('edit-opengym').value = account.opengympasses || 0;
    document.getElementById('edit-classes').value = account.classpasses || 0;
    document.getElementById('edit-privatekid').value = account.privatekidpasses || 0;
    document.getElementById('edit-privateadult').value = account.privateadultpasses || 0;
    document.getElementById('edit-aerial').value = account.aerialsilkspasses || 0;
    updateAllPassPreviews();

    // Populate notes
    document.getElementById('edit-notes').value = account.notes || '';

    // Populate memberships
    renderEditMemberships(account.memberships || []);

    // Show edit tab and nav
    document.getElementById('editNavItem').classList.remove('hidden');
    goToTab('edit');
}

function renderEditMemberships(memberships) {
    const container = document.getElementById('edit-memberships-list');
    membershipRowCounter = 0;

    if (!memberships || memberships.length === 0) {
        container.innerHTML = '<div class="membership-empty">No memberships yet. Click "+ Add Membership" to add one.</div>';
        return;
    }

    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Sort memberships: active first (by days left), unlimited at bottom of active, then inactive
    const sorted = [...memberships].sort((a, b) => {
        const aExpired = a.end_date && new Date(a.end_date) < todayDate;
        const bExpired = b.end_date && new Date(b.end_date) < todayDate;
        const aActive = !a.is_closed && !aExpired;
        const bActive = !b.is_closed && !bExpired;

        // Active memberships first
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;

        // Within active memberships
        if (aActive && bActive) {
            // Unlimited goes to bottom of active list
            if (a.is_unlimited && !b.is_unlimited) return 1;
            if (!a.is_unlimited && b.is_unlimited) return -1;

            // Both unlimited - sort by start date (most recent first)
            if (a.is_unlimited && b.is_unlimited) {
                const aDate = a.start_date ? new Date(a.start_date) : new Date(0);
                const bDate = b.start_date ? new Date(b.start_date) : new Date(0);
                return bDate - aDate;
            }

            // Both have end dates - sort by days left (fewest first = most urgent)
            const aDaysLeft = a.end_date ? Math.ceil((new Date(a.end_date) - todayDate) / (1000 * 60 * 60 * 24)) : Infinity;
            const bDaysLeft = b.end_date ? Math.ceil((new Date(b.end_date) - todayDate) / (1000 * 60 * 60 * 24)) : Infinity;
            return aDaysLeft - bDaysLeft;
        }

        // Within inactive, sort by start date (most recent first)
        const aDate = a.start_date ? new Date(a.start_date) : new Date(0);
        const bDate = b.start_date ? new Date(b.start_date) : new Date(0);
        return bDate - aDate;
    });

    container.innerHTML = sorted.map(m => createMembershipFormRow(m, todayDate)).join('');

    // Setup event listeners for all rows
    setupMembershipRowListeners();
}

function createMembershipFormRow(membership, todayDate) {
    const rowId = membershipRowCounter++;
    const isNew = !membership || membership.id === -1;
    const isExpired = membership && membership.end_date && new Date(membership.end_date) < todayDate;
    const isPaused = membership?.is_paused || false;
    const isClosed = membership?.is_closed || false;
    const isUnlimited = membership?.is_unlimited || false;

    let stateClass = '';
    let badgeCount = '';

    if (isClosed) {
        stateClass = 'closed';
        badgeCount = 'Closed';
    } else if (isExpired) {
        stateClass = 'expired';
        badgeCount = 'Exp';
    } else if (isPaused) {
        stateClass = 'paused';
        badgeCount = 'Paused';
    } else if (isUnlimited) {
        badgeCount = '∞';
    } else if (membership?.end_date) {
        const daysLeft = Math.ceil((new Date(membership.end_date) - todayDate) / (1000 * 60 * 60 * 24));
        badgeCount = `${daysLeft}d`;
    } else if (membership?.base_length) {
        // No start date yet, but duration is set - show pending duration
        badgeCount = `${membership.base_length}d`;
    } else {
        badgeCount = '?';
    }

    if (isNew) stateClass = 'new-membership';

    const isDisabled = isClosed || isExpired;
    const startDate = membership?.start_date ? getDateOnly(membership.start_date) : '';
    const endDate = membership?.end_date ? getDateOnly(membership.end_date) : '';
    const baseLength = membership?.base_length || '';
    const d = isDisabled ? 'disabled' : '';

    const typeName = getMembershipTypeName(membership?.type) || 'New';
    const dateRange = startDate && endDate
        ? `${formatDateShort(startDate)} → ${formatDateShort(endDate)}`
        : startDate
            ? `From ${formatDateShort(startDate)}`
            : '';

    // Get badge class
    const badgeClass = getMembershipTypeClass(membership?.type, membership);

    // Single-row card layout with standard badge
    return `
        <div class="membership-card ${stateClass}" data-row-id="${rowId}" data-membership-id="${membership?.id || -1}">
            <div class="membership-header" onclick="toggleMembershipCard(${rowId})">
                <span class="pass-badge ${badgeClass}" id="mbadge-${rowId}">
                    <span class="badge-label" id="mbadge-label-${rowId}">${typeName}</span>
                    <span class="badge-count" id="mbadge-count-${rowId}">${badgeCount}</span>
                </span>
                <span class="membership-dates">${dateRange || 'Not started'}</span>
                <div class="membership-actions">
                    ${!isDisabled && !isNew ? `<button class="btn btn-sm ${isPaused ? 'btn-success' : 'btn-warning'}" onclick="event.stopPropagation(); toggleMembershipPause(${rowId})" id="mpause-btn-${rowId}">${isPaused ? 'Resume' : 'Pause'}</button>` : ''}
                    ${isDisabled ? `<span class="text-muted text-sm">${isClosed ? 'Closed' : 'Expired'}</span>` : ''}
                    <span class="membership-expand-icon">▼</span>
                </div>
            </div>
            <div class="membership-body">
                <div class="membership-form-grid">
                    <div class="form-group">
                        <label class="form-label">Type</label>
                        <select class="form-select" id="mtype-${rowId}" ${d}>
                            <option value="">Select...</option>
                            <option value="open" ${membership?.type === 'open' ? 'selected' : ''}>Open Gym</option>
                            <option value="class" ${membership?.type === 'class' ? 'selected' : ''}>Classes</option>
                            <option value="athletic" ${membership?.type === 'athletic' ? 'selected' : ''}>Athletic</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Age Group</label>
                        <select class="form-select" id="mage-${rowId}" ${d} ${membership?.type === 'open' ? 'disabled' : ''}>
                            <option value="">N/A</option>
                            <option value="kid" ${membership?.age_group === 'kid' ? 'selected' : ''}>Kid</option>
                            <option value="teen" ${membership?.age_group === 'teen' ? 'selected' : ''}>Teen</option>
                            <option value="adult" ${membership?.age_group === 'adult' ? 'selected' : ''}>Adult</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Start Date</label>
                        <input type="date" class="form-input" id="mstart-${rowId}" value="${startDate}" ${d}>
                        <div style="display:flex;gap:4px;margin-top:4px">
                            <button class="btn btn-outline btn-sm" onclick="setMembershipToday(${rowId})" ${d}>Today</button>
                            <button class="btn btn-outline btn-sm" onclick="clearMembershipStart(${rowId})" ${d}>Clear</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Duration (days)</label>
                        <input type="number" class="form-input" id="mdays-${rowId}" value="${isUnlimited ? '' : baseLength}" placeholder="${isUnlimited ? '∞' : 'days'}" min="1" ${d}>
                        <div class="duration-btns">
                            <button class="btn btn-outline" onclick="setMembershipDays(${rowId}, 30)" ${d}>30</button>
                            <button class="btn btn-outline" onclick="setMembershipDays(${rowId}, 90)" ${d}>90</button>
                            <button class="btn btn-outline" onclick="setMembershipDays(${rowId}, 180)" ${d}>180</button>
                            <button class="btn btn-outline" onclick="setMembershipDays(${rowId}, -1)" ${d}>∞</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">End Date</label>
                        <input type="date" class="form-input" id="mend-${rowId}" value="${endDate}" disabled>
                    </div>
                </div>
                <div class="membership-footer">
                    <div class="membership-footer-left">
                        ${!isClosed && !isNew && !isExpired ? `<button class="btn btn-sm btn-close-mem" onclick="closeMembership(${rowId})">Close Membership</button>` : ''}
                        ${isNew ? `<button class="btn btn-sm btn-delete-mem" onclick="deleteMembershipRow(${rowId})">Remove</button>` : ''}
                    </div>
                </div>
            </div>
            <input type="hidden" id="mpaused-${rowId}" value="${isPaused ? '1' : '0'}">
            <input type="hidden" id="mclosed-${rowId}" value="${isClosed ? '1' : '0'}">
            <input type="hidden" id="munlimited-${rowId}" value="${isUnlimited ? '1' : '0'}">
            <input type="hidden" id="mtotalpause-${rowId}" value="${membership?.total_days_paused || 0}">
        </div>
    `;
}

// Toggle card expansion
function toggleMembershipCard(rowId) {
    const card = document.querySelector(`[data-row-id="${rowId}"]`);
    if (card && !card.classList.contains('new-membership')) {
        card.classList.toggle('expanded');
    }
}
window.toggleMembershipCard = toggleMembershipCard;

// Format date as short (e.g., "Dec 27")
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function setupMembershipRowListeners() {
    // Type change listeners
    document.querySelectorAll('[id^="mtype-"]').forEach(select => {
        select.addEventListener('change', function() {
            const rowId = this.id.split('-')[1];
            const type = this.value;
            const ageSelect = document.getElementById(`mage-${rowId}`);
            const card = this.closest('.membership-card');

            // Enable/disable age group based on type
            if (type === 'open') {
                ageSelect.disabled = true;
                ageSelect.value = '';
            } else if (card && !card.classList.contains('closed') && !card.classList.contains('expired')) {
                ageSelect.disabled = false;
            }

            updateMembershipCardHeader(rowId);
        });
    });

    // Age change listeners
    document.querySelectorAll('[id^="mage-"]').forEach(select => {
        select.addEventListener('change', function() {
            const rowId = this.id.split('-')[1];
            updateMembershipCardHeader(rowId);
        });
    });

    // Start date & days change listeners
    document.querySelectorAll('[id^="mstart-"], [id^="mdays-"]').forEach(input => {
        input.addEventListener('input', function() {
            const rowId = this.id.split('-')[1];
            updateMembershipEndDate(rowId);
            updateMembershipCardHeader(rowId);
        });
    });
}

function updateMembershipEndDate(rowId) {
    const startInput = document.getElementById(`mstart-${rowId}`);
    const daysInput = document.getElementById(`mdays-${rowId}`);
    const endInput = document.getElementById(`mend-${rowId}`);
    const totalPaused = parseInt(document.getElementById(`mtotalpause-${rowId}`)?.value) || 0;
    const isUnlimited = document.getElementById(`munlimited-${rowId}`)?.value === '1';

    if (isUnlimited || !daysInput.value) {
        endInput.value = '';
        return;
    }

    const start = startInput.value;
    const days = parseInt(daysInput.value) || 0;

    if (start && days > 0) {
        endInput.value = calculateEndDate(start, days, totalPaused);
    } else {
        endInput.value = '';
    }
}

function updateMembershipCardHeader(rowId) {
    const card = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!card) return;

    const type = document.getElementById(`mtype-${rowId}`)?.value || '';
    const startDate = document.getElementById(`mstart-${rowId}`)?.value;
    const endDate = document.getElementById(`mend-${rowId}`)?.value;
    const isPaused = document.getElementById(`mpaused-${rowId}`)?.value === '1';
    const isClosed = document.getElementById(`mclosed-${rowId}`)?.value === '1';
    const isUnlimited = document.getElementById(`munlimited-${rowId}`)?.value === '1';

    // Update badge label
    const badgeLabel = document.getElementById(`mbadge-label-${rowId}`);
    if (badgeLabel) {
        badgeLabel.textContent = getMembershipTypeName(type) || 'New';
    }

    // Update badge count
    const badgeCount = document.getElementById(`mbadge-count-${rowId}`);
    if (badgeCount) {
        const now = new Date();
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const daysInput = document.getElementById(`mdays-${rowId}`);
        const baseLength = daysInput ? parseInt(daysInput.value) || 0 : 0;

        if (isClosed) {
            badgeCount.textContent = 'Closed';
        } else if (endDate && new Date(endDate) < todayDate) {
            badgeCount.textContent = 'Exp';
        } else if (isPaused) {
            badgeCount.textContent = 'Paused';
        } else if (isUnlimited) {
            badgeCount.textContent = '∞';
        } else if (endDate) {
            const daysLeft = Math.ceil((new Date(endDate) - todayDate) / (1000 * 60 * 60 * 24));
            badgeCount.textContent = `${daysLeft}d`;
        } else if (baseLength > 0) {
            // No start date yet, but duration is set - show pending duration
            badgeCount.textContent = `${baseLength}d`;
        } else {
            badgeCount.textContent = '?';
        }
    }

    // Update badge class
    const badge = document.getElementById(`mbadge-${rowId}`);
    if (badge) {
        badge.className = 'pass-badge ' + getMembershipTypeClass(type, {
            is_paused: isPaused,
            is_unlimited: isUnlimited,
            start_date: startDate || null,
            end_date: endDate || null
        });
    }

    // Update dates
    const datesEl = card.querySelector('.membership-dates');
    if (datesEl) {
        const dateRange = startDate && endDate
            ? `${formatDateShort(startDate)} → ${formatDateShort(endDate)}`
            : startDate
                ? `From ${formatDateShort(startDate)}`
                : 'Not started';
        datesEl.textContent = dateRange;
    }
}

// Alias for backward compatibility
function updateMembershipBadge(rowId) {
    updateMembershipCardHeader(rowId);
}

function calculateEndDate(startDate, days, totalPaused = 0) {
    if (!startDate || days <= 0) return '';

    const start = new Date(startDate);
    if (isNaN(start.getTime())) return '';

    const totalDays = days + totalPaused;
    const end = new Date(start);
    end.setDate(start.getDate() + totalDays - 1);

    return getDateOnly(end);
}

function getDateOnly(date) {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function addMembershipRow() {
    const container = document.getElementById('edit-memberships-list');

    // Remove empty message if present
    const emptyMsg = container.querySelector('.membership-empty');
    if (emptyMsg) emptyMsg.remove();

    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Create a new empty membership object
    const newMembership = {
        id: -1,
        type: '',
        age_group: '',
        start_date: null,
        end_date: null,
        base_length: null,
        is_unlimited: false,
        is_paused: false,
        is_closed: false,
        total_days_paused: 0
    };

    const html = createMembershipFormRow(newMembership, todayDate);
    container.insertAdjacentHTML('beforeend', html);

    // Setup listeners for the new row
    setupMembershipRowListeners();

    showToast('New membership row added', 'info');
}

function setMembershipToday(rowId) {
    const input = document.getElementById(`mstart-${rowId}`);
    if (input) {
        input.value = getTodayStringInTimezone();
        updateMembershipEndDate(rowId);
        updateMembershipBadge(rowId);
    }
}

function clearMembershipStart(rowId) {
    const input = document.getElementById(`mstart-${rowId}`);
    if (input) {
        input.value = '';
        updateMembershipEndDate(rowId);
        updateMembershipBadge(rowId);
    }
}

function setMembershipDays(rowId, days) {
    const input = document.getElementById(`mdays-${rowId}`);
    const unlimitedInput = document.getElementById(`munlimited-${rowId}`);

    if (days === -1) {
        // Unlimited
        input.value = '';
        input.placeholder = '∞';
        unlimitedInput.value = '1';
    } else {
        input.value = days;
        input.placeholder = '';
        unlimitedInput.value = '0';
    }

    updateMembershipEndDate(rowId);
    updateMembershipBadge(rowId);
}

function toggleMembershipPause(rowId) {
    const pausedInput = document.getElementById(`mpaused-${rowId}`);
    const card = document.querySelector(`[data-row-id="${rowId}"]`);
    const btn = document.getElementById(`mpause-btn-${rowId}`);

    if (!card || !btn) return;

    const isPaused = pausedInput.value === '1';

    if (isPaused) {
        // Resume
        pausedInput.value = '0';
        card.classList.remove('paused');
        btn.textContent = 'Pause';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-warning');
        enableMembershipFields(rowId);
    } else {
        // Pause
        pausedInput.value = '1';
        card.classList.add('paused');
        btn.textContent = 'Resume';
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-success');
        disableMembershipFields(rowId);
    }

    updateMembershipCardHeader(rowId);
}

function enableMembershipFields(rowId) {
    const card = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!card) return;
    card.querySelectorAll('.membership-body input:not([type="hidden"]), .membership-body select').forEach(el => {
        if (el.id !== `mend-${rowId}`) {
            el.disabled = false;
        }
    });
    card.querySelectorAll('.duration-btns button').forEach(btn => {
        btn.disabled = false;
    });
}

function disableMembershipFields(rowId) {
    const card = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!card) return;
    card.querySelectorAll('.membership-body input:not([type="hidden"]), .membership-body select').forEach(el => {
        el.disabled = true;
    });
    card.querySelectorAll('.duration-btns button').forEach(btn => {
        btn.disabled = true;
    });
}

function closeMembership(rowId) {
    if (!confirm('Close this membership? This cannot be undone.')) return;

    const closedInput = document.getElementById(`mclosed-${rowId}`);
    const card = document.querySelector(`[data-row-id="${rowId}"]`);

    closedInput.value = '1';
    card.classList.add('closed');
    card.classList.remove('paused');

    // Disable all fields
    disableMembershipFields(rowId);

    // Update footer
    const footerLeft = card.querySelector('.membership-footer-left');
    if (footerLeft) {
        footerLeft.innerHTML = '';
    }

    // Hide pause button in header
    const pauseBtn = card.querySelector(`#mpause-btn-${rowId}`);
    if (pauseBtn) pauseBtn.remove();

    updateMembershipCardHeader(rowId);
    showToast('Membership marked as closed', 'info');
}

function deleteMembershipRow(rowId) {
    const card = document.querySelector(`[data-row-id="${rowId}"]`);
    if (card) {
        card.remove();
        showToast('Membership removed', 'info');

        // Check if no cards left
        const container = document.getElementById('edit-memberships-list');
        if (!container.querySelector('.membership-card')) {
            container.innerHTML = '<div class="membership-empty">No memberships yet. Click "+ Add Membership" to add one.</div>';
        }
    }
}

async function saveEditedAccount() {
    const btn = document.getElementById('edit-save-btn');
    const accountId = document.getElementById('edit-account-id').value;
    const name = document.getElementById('edit-name')?.value.trim() || '';
    const email = document.getElementById('edit-email')?.value.trim() || '';
    const phone = document.getElementById('edit-phone')?.value.trim() || '';
    const notes = document.getElementById('edit-notes')?.value.trim() || '';
    const opengym = parseInt(document.getElementById('edit-opengym')?.value) || 0;
    const classes = parseInt(document.getElementById('edit-classes')?.value) || 0;
    const privatekid = parseInt(document.getElementById('edit-privatekid')?.value) || 0;
    const privateadult = parseInt(document.getElementById('edit-privateadult')?.value) || 0;
    const aerial = parseInt(document.getElementById('edit-aerial')?.value) || 0;

    if (!name) {
        showToast('Name is required', 'error');
        return;
    }

    // Validate memberships
    const membershipCards = document.querySelectorAll('.membership-card');
    for (const row of membershipCards) {
        const rowId = row.dataset.rowId;
        const type = document.getElementById(`mtype-${rowId}`)?.value;
        const ageGroup = document.getElementById(`mage-${rowId}`)?.value;
        const daysInput = document.getElementById(`mdays-${rowId}`);
        const isUnlimited = document.getElementById(`munlimited-${rowId}`)?.value === '1';
        const isClosed = document.getElementById(`mclosed-${rowId}`)?.value === '1';

        // Skip closed memberships validation
        if (isClosed) continue;

        if (!type) {
            showToast('Please select a membership type', 'error');
            return;
        }

        if ((type === 'class' || type === 'athletic') && !ageGroup) {
            showToast('Age group is required for Classes/Athletic memberships', 'error');
            return;
        }

        if (!isUnlimited && (!daysInput.value || parseInt(daysInput.value) <= 0)) {
            showToast('Duration is required for memberships', 'error');
            return;
        }
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        // Step 1: Save user info
        const response = await fetch(`${API_IP}/api/users/editUser`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                id: accountId,
                name,
                email,
                phone_number: phone,
                password: '',
                notes,
                opengympasses: opengym,
                classpasses: classes,
                privatekidpasses: privatekid,
                privateadultpasses: privateadult,
                aerialsilkspasses: aerial
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to save changes');
        }

        // Step 2: Save memberships
        for (const row of membershipCards) {
            const rowId = row.dataset.rowId;
            const membershipId = row.dataset.membershipId;
            const isNew = membershipId === '-1';

            const type = document.getElementById(`mtype-${rowId}`)?.value;
            const ageGroup = document.getElementById(`mage-${rowId}`)?.value || 'NA';
            const startDate = document.getElementById(`mstart-${rowId}`)?.value || null;
            const endDate = document.getElementById(`mend-${rowId}`)?.value || null;
            const baseLength = parseInt(document.getElementById(`mdays-${rowId}`)?.value) || 0;
            const isUnlimited = document.getElementById(`munlimited-${rowId}`)?.value === '1';
            const isPaused = document.getElementById(`mpaused-${rowId}`)?.value === '1';
            const isClosed = document.getElementById(`mclosed-${rowId}`)?.value === '1';

            if (!type) continue; // Skip empty rows

            const membershipPayload = {
                type,
                start_date: startDate,
                end_date: isUnlimited ? null : endDate,
                base_length: baseLength,
                is_unlimited: isUnlimited,
                age_group: type === 'open' ? 'NA' : ageGroup,
                is_paused: isPaused,
                is_closed: isClosed
            };

            if (isNew) {
                // Create new membership
                membershipPayload.userId = accountId;
                const res = await fetch(`${API_IP}/api/memberships/addMembership`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(membershipPayload)
                });
                const resData = await res.json();
                if (!res.ok) throw new Error(resData.error || 'Failed to add membership');
            } else {
                // Update existing membership
                membershipPayload.membershipId = membershipId;
                const res = await fetch(`${API_IP}/api/memberships/editMembership`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(membershipPayload)
                });
                const resData = await res.json();
                if (!res.ok) throw new Error(resData.error || 'Failed to update membership');
            }
        }

        showToast('Changes saved successfully!', 'success');
        closeEditTab();
        loadSearchResults();
        loadDailyCheckins();

    } catch (error) {
        showToast(error.message || 'Failed to save changes', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
}

function closeEditTab() {
    currentEditAccount = null;
    document.getElementById('editNavItem').classList.add('hidden');
    goToTab('search');
}

function addPasses(type, amount) {
    const input = document.getElementById(`edit-${type}`);
    if (input) {
        const newValue = Math.max(0, parseInt(input.value || 0) + amount);
        input.value = newValue;
        updatePassPreview(type);
    }
}

function updatePassPreview(type) {
    const input = document.getElementById(`edit-${type}`);
    const preview = document.getElementById(`preview-${type}`);
    if (input && preview) {
        const value = parseInt(input.value) || 0;
        preview.textContent = value;

        // Add visual feedback for non-zero values
        const item = input.closest('.pass-edit-item');
        if (item) {
            item.classList.toggle('has-passes', value > 0);
        }
    }
}

function updateAllPassPreviews() {
    ['opengym', 'classes', 'privatekid', 'privateadult', 'aerial'].forEach(updatePassPreview);
}

function viewAccountLogs() {
    if (currentEditAccount) {
        // TODO: Implement log filtering by account
        goToTab('log');
    }
}

// ============================================================================
// ACTIVITY LOG
// ============================================================================
function initLogFilters() {
    const today = getTodayStringInTimezone();
    document.getElementById('log-end-date').value = today;

    // Default to last 7 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    document.getElementById('log-start-date').value = startDate.toISOString().split('T')[0];
}

function setLogPreset(preset) {
    const today = new Date();
    const endDate = getTodayStringInTimezone();
    let startDate;

    switch (preset) {
        case 'today':
            startDate = endDate;
            break;
        case '7':
            const d7 = new Date(today);
            d7.setDate(d7.getDate() - 6);
            startDate = d7.toISOString().split('T')[0];
            break;
        case '30':
            const d30 = new Date(today);
            d30.setDate(d30.getDate() - 29);
            startDate = d30.toISOString().split('T')[0];
            break;
        case 'alltime':
            const dall = new Date(today);
            dall.setFullYear(dall.getFullYear() - 5);
            startDate = dall.toISOString().split('T')[0];
            break;
        default:
            startDate = endDate;
    }

    document.getElementById('log-start-date').value = startDate;
    document.getElementById('log-end-date').value = endDate;
    loadActivityLog();
}

async function loadActivityLog() {
    const startDateStr = document.getElementById('log-start-date').value;
    const endDateStr = document.getElementById('log-end-date').value;
    const limit = parseInt(document.getElementById('log-limit').value) || 100;

    if (!startDateStr || !endDateStr) {
        showToast('Please select date range', 'error');
        return;
    }

    const startTime = new Date(`${startDateStr}T00:00:00`).toISOString();
    const endTime = new Date(`${endDateStr}T23:59:59.999`).toISOString();

    const container = document.getElementById('log-list');
    const countEl = document.getElementById('log-count');

    container.innerHTML = '<div class="text-muted text-sm" style="padding: 24px; text-align: center;">Loading...</div>';

    try {
        const response = await fetch(`${API_IP}/api/logs/fetchLog`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                startTime,
                endTime,
                actionType: null,
                limit,
                accountId: null
            })
        });

        const logs = await response.json();

        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="text-muted text-sm" style="padding: 24px; text-align: center;">No activity found for this date range</div>';
            countEl.textContent = '0 results';
            return;
        }

        countEl.textContent = `${logs.length} results`;
        container.innerHTML = logs.map(log => renderLogEntry(log)).join('');

    } catch (error) {
        console.error('Error loading activity log:', error);
        container.innerHTML = '<div class="text-muted text-sm" style="padding: 24px; text-align: center;">Error loading activity log</div>';
    }
}

function renderLogEntry(log) {
    const time = formatTimestamp(log.timestamp);
    const action = getLogActionLabel(log.action);
    const accountName = log.account_name || 'Unknown';

    let details = '';
    if (log.field) {
        const fieldName = getLogFieldLabel(log.field);
        if (log.old_value !== undefined && log.new_value !== undefined) {
            details = `${fieldName}: ${log.old_value} → ${log.new_value}`;
        } else if (log.new_value !== undefined) {
            details = `${fieldName}: ${log.new_value}`;
        }
    }

    return `
        <div class="log-entry">
            <div class="log-time">${time}</div>
            <div class="log-content">
                <div class="log-action">${action}</div>
                <div class="log-account">${escapeHtml(accountName)}</div>
                ${details ? `<div class="log-details text-muted text-sm">${escapeHtml(details)}</div>` : ''}
            </div>
        </div>
    `;
}

function getLogActionLabel(action) {
    const labels = {
        'ACCOUNT_ADDED': 'Account added',
        'NAME_UPDATED': 'Name updated',
        'EMAIL_UPDATED': 'Email updated',
        'PHONE_UPDATED': 'Phone updated',
        'PASS_AMOUNT_UPDATED': 'Pass updated',
        'MEMBERSHIP_ADDED': 'Membership added',
        'MEMBERSHIP_UPDATED': 'Membership updated',
        'MEMBERSHIP_STARTED': 'Membership started',
        'MEMBERSHIP_PAUSE_UPDATED': 'Membership pause updated',
        'NOTE_UPDATED': 'Note updated',
        'PASS_USED': 'Pass used',
        'MEMBERSHIP_USED': 'Membership used'
    };
    return labels[action] || action;
}

function getLogFieldLabel(field) {
    const labels = {
        'opengympasses': 'Open Gym',
        'classpasses': 'Classes',
        'privatekidpasses': 'Priv Kid',
        'privateadultpasses': 'Private Adult',
        'aerialsilkspasses': 'Aerial Silks',
        'type': 'Type',
        'age_group': 'Age Group',
        'start_date': 'Start Date',
        'end_date': 'End Date',
        'base_length': 'Duration',
        'is_paused': 'Paused',
        'is_unlimited': 'Unlimited',
        'is_closed': 'Closed'
    };
    return labels[field] || field;
}

// Initialize log filters when page loads
document.addEventListener('DOMContentLoaded', initLogFilters);

// Expose functions to window
window.addNewAccount = addNewAccount;
window.goToTab = goToTab;
window.openEditAccount = openEditAccount;
window.saveEditedAccount = saveEditedAccount;
window.closeEditTab = closeEditTab;
window.addPasses = addPasses;
window.updatePassPreview = updatePassPreview;

// Membership management functions
window.addMembershipRow = addMembershipRow;
window.setMembershipToday = setMembershipToday;
window.clearMembershipStart = clearMembershipStart;
window.setMembershipDays = setMembershipDays;
window.toggleMembershipPause = toggleMembershipPause;
window.closeMembership = closeMembership;
window.deleteMembershipRow = deleteMembershipRow;
window.viewAccountLogs = viewAccountLogs;
window.setLogPreset = setLogPreset;
window.loadActivityLog = loadActivityLog;

// Class check-in modal functions
window.openClassCheckinModal = openClassCheckinModal;
window.closeClassCheckinModal = closeClassCheckinModal;
window.quickCheckinFromModal = quickCheckinFromModal;

// Walk-in modal functions
window.openWalkinModal = openWalkinModal;
window.closeWalkinModal = closeWalkinModal;
window.addWalkin = addWalkin;

// ============================================================================
// TWO-PANEL CHECK-IN LAYOUT
// ============================================================================
let selectedClassForPanel = null; // Currently selected class in the two-panel layout
let panelScheduleDate = getTodayStringInTimezone(); // Date shown in schedule panel
let panelDaySchedule = []; // Classes for the schedule panel
let panelDayCheckins = []; // Check-ins for the schedule panel date

/**
 * Setup the two-panel check-in layout
 */
function setupTwoPanelCheckin() {
    // Date navigation
    const prevBtn = document.getElementById('schedule-prev-day');
    const nextBtn = document.getElementById('schedule-next-day');
    const dateDisplay = document.getElementById('schedule-date-display');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            const date = new Date(panelScheduleDate);
            date.setDate(date.getDate() - 1);
            panelScheduleDate = date.toISOString().split('T')[0];
            loadSchedulePanel();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const date = new Date(panelScheduleDate);
            date.setDate(date.getDate() + 1);
            panelScheduleDate = date.toISOString().split('T')[0];
            loadSchedulePanel();
        });
    }

    // General check-in button
    const generalBtn = document.getElementById('general-checkin-btn');
    if (generalBtn) {
        generalBtn.addEventListener('click', () => {
            selectClassForPanel(null); // null = general check-in
        });
    }

    // Search in workspace
    const searchInput = document.getElementById('checkin-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            searchForCheckinPanel(searchInput.value.trim());
        }, 300));
    }

    // Walk-in button in the panel
    const walkinBtn = document.getElementById('walkin-btn');
    if (walkinBtn) {
        walkinBtn.addEventListener('click', openWalkinModal);
    }

    // Initial load
    loadSchedulePanel();
}

/**
 * Load schedule and check-ins for the panel
 */
async function loadSchedulePanel() {
    const dateDisplay = document.getElementById('schedule-date-display');
    const scheduleList = document.getElementById('schedule-class-list');

    // Update date display
    if (dateDisplay) {
        const d = new Date(panelScheduleDate);
        const isToday = panelScheduleDate === getTodayStringInTimezone();
        if (isToday) {
            dateDisplay.textContent = 'Today';
        } else {
            dateDisplay.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    }

    if (scheduleList) {
        scheduleList.innerHTML = '<div class="text-muted text-sm" style="padding: 16px; text-align: center;">Loading...</div>';
    }

    try {
        // Get day of week (0=Sunday, 1=Monday, etc.)
        const d = new Date(panelScheduleDate);
        const dayOfWeek = d.getDay();

        // Fetch schedule and check-ins in parallel
        const [scheduleRes, checkinsRes] = await Promise.all([
            fetch(`${API_IP}/api/classes/scheduleByDay/${dayOfWeek}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }),
            fetch(`${API_IP}/api/logs/fetchDailyCheckins`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(getDayBoundsInTimezone(panelScheduleDate))
            })
        ]);

        const scheduleData = await scheduleRes.json();
        const checkinsData = await checkinsRes.json();

        panelDaySchedule = (scheduleData.classes || [])
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        panelDayCheckins = checkinsData || [];

        renderSchedulePanel();

        // If no class is selected, select the first one or general
        if (!selectedClassForPanel && panelDaySchedule.length > 0) {
            selectClassForPanel(panelDaySchedule[0].id);
        } else if (selectedClassForPanel) {
            // Refresh the attendees for currently selected class
            renderWorkspaceAttendees();
        } else {
            selectClassForPanel(null); // General check-in
        }

    } catch (error) {
        console.error('Error loading schedule panel:', error);
        if (scheduleList) {
            scheduleList.innerHTML = '<div class="text-muted text-sm" style="padding: 16px; text-align: center;">Failed to load</div>';
        }
    }
}

/**
 * Render the schedule class list in the left panel
 */
function renderSchedulePanel() {
    const container = document.getElementById('schedule-class-list');
    const generalCountEl = document.getElementById('general-checkin-count');

    if (!container) return;

    // Group check-ins by class
    const checkinsByClass = groupCheckinsByClass(panelDayCheckins, panelDaySchedule);

    // Count general/unassigned check-ins
    const generalCount = (checkinsByClass['other'] || []).length;
    if (generalCountEl) {
        generalCountEl.textContent = generalCount;
    }

    if (panelDaySchedule.length === 0) {
        const d = new Date(panelScheduleDate);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        container.innerHTML = `<div class="text-muted text-sm" style="padding: 16px; text-align: center;">No classes on ${dayName}</div>`;
        return;
    }

    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const isToday = panelScheduleDate === getTodayStringInTimezone();

    // Group classes by time
    const classesByTime = {};
    panelDaySchedule.forEach(cls => {
        const time = cls.time?.slice(0, 5) || '00:00';
        if (!classesByTime[time]) classesByTime[time] = [];
        classesByTime[time].push(cls);
    });

    let html = '';
    Object.entries(classesByTime).forEach(([time, classes]) => {
        const isPast = isToday && time < currentTimeStr;
        const formattedTime = formatTime(time);

        // Time header
        html += `<div class="schedule-time-group ${isPast ? 'past' : ''}">`;
        html += `<div class="schedule-time-header">${formattedTime}</div>`;

        // Classes at this time
        classes.forEach(cls => {
            const classCheckins = checkinsByClass[cls.id] || [];
            const checkinCount = classCheckins.length;
            const color = getClassColor(cls.name, cls.age_group);
            const isSelected = selectedClassForPanel === cls.id;

            html += `
                <button class="schedule-class-item ${isSelected ? 'selected' : ''}"
                        data-class-id="${cls.id}"
                        style="--class-color: ${color};"
                        onclick="selectClassForPanel('${cls.id}')">
                    <div class="class-item-info">
                        <span class="class-item-name">${escapeHtml(cls.name)}</span>
                        ${cls.age_group ? `<span class="class-item-age">${escapeHtml(cls.age_group)}</span>` : ''}
                    </div>
                    <span class="class-item-count ${checkinCount > 0 ? 'has-checkins' : ''}">${checkinCount}</span>
                </button>
            `;
        });

        html += '</div>';
    });

    container.innerHTML = html;

    // Update general button selected state
    const generalBtn = document.getElementById('general-checkin-btn');
    if (generalBtn) {
        generalBtn.classList.toggle('selected', selectedClassForPanel === null);
    }
}

/**
 * Select a class in the panel (or null for general check-in)
 */
function selectClassForPanel(classId) {
    selectedClassForPanel = classId;

    // Update selected state in schedule panel
    document.querySelectorAll('.schedule-class-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.classId === classId);
    });

    const generalBtn = document.getElementById('general-checkin-btn');
    if (generalBtn) {
        generalBtn.classList.toggle('selected', classId === null);
    }

    // Update workspace header
    const classNameEl = document.getElementById('selected-class-name');
    const classTimeEl = document.getElementById('selected-class-time');

    if (classId === null) {
        if (classNameEl) classNameEl.textContent = 'General Check-in';
        if (classTimeEl) classTimeEl.textContent = '';
    } else {
        const cls = panelDaySchedule.find(c => c.id == classId);
        if (cls) {
            if (classNameEl) classNameEl.textContent = cls.name;
            if (classTimeEl) {
                const time = formatTime(cls.time?.slice(0, 5));
                classTimeEl.textContent = cls.age_group ? `${time} · ${cls.age_group}` : time;
            }
        }
    }

    // Clear search
    const searchInput = document.getElementById('checkin-search-input');
    if (searchInput) searchInput.value = '';

    const searchResults = document.getElementById('checkin-search-results');
    if (searchResults) {
        searchResults.classList.add('hidden');
        searchResults.innerHTML = '';
    }

    // Render attendees for this class
    renderWorkspaceAttendees();
}

/**
 * Render attendees in the workspace for the selected class
 */
function renderWorkspaceAttendees() {
    const container = document.getElementById('checkin-attendees-list');
    const countEl = document.getElementById('attendees-count');

    if (!container) return;

    // Get check-ins for selected class
    const checkinsByClass = groupCheckinsByClass(panelDayCheckins, panelDaySchedule);
    let classCheckins;

    if (selectedClassForPanel === null) {
        // General check-in - show unassigned check-ins
        classCheckins = checkinsByClass['other'] || [];
    } else {
        classCheckins = checkinsByClass[selectedClassForPanel] || [];
    }

    if (countEl) countEl.textContent = classCheckins.length;

    if (classCheckins.length === 0) {
        container.innerHTML = '<div class="empty-state text-muted text-sm">No check-ins yet</div>';
        return;
    }

    container.innerHTML = classCheckins.map(c => {
        const time = formatTimestamp(c.timestamp);
        const badgeHtml = renderAttendeeBadge(c);

        return `
            <div class="attendee-row">
                <span class="attendee-name">${escapeHtml(c.user_name || c.name || 'Unknown')}</span>
                ${badgeHtml}
                <span class="attendee-time">${time}</span>
                <button class="btn btn-ghost btn-xs" onclick="undoCheckinFromPanel('${c.id}')" title="Undo">×</button>
            </div>
        `;
    }).join('');
}

/**
 * Render badge for an attendee check-in (reuses pass-badge structure)
 */
function renderAttendeeBadge(checkin) {
    // Walk-in badge
    if (checkin.is_walkin) {
        return `<span class="pass-badge walkin"><span class="badge-label">Walk-in</span></span>`;
    }

    // Use field (from log entry) or type for badge info
    const fieldOrType = checkin.field || checkin.type || '';

    // Membership badge
    if (fieldOrType.includes('membership')) {
        const typeName = getMembershipTypeName(checkin.membership_type || fieldOrType);
        const typeClass = fieldOrType.includes('athletic') ? 'athletic' : 'classes';
        return `<span class="pass-badge ${typeClass}"><span class="badge-label">${typeName}</span></span>`;
    }

    // Pass badge with count change
    const passInfo = {
        'opengympasses': { name: 'Open Gym', class: 'opengym' },
        'classpasses': { name: 'Classes', class: 'classes' },
        'privatekidpasses': { name: 'Priv Kid', class: 'private' },
        'privateadultpasses': { name: 'Priv Adult', class: 'private' },
        'aerialsilkspasses': { name: 'Aerial', class: 'aerial' }
    };

    const info = passInfo[fieldOrType] || { name: getFieldLabel(fieldOrType) || 'Pass', class: 'classes' };

    // Show count change if available (old_value → new_value)
    let countHtml = '';
    if (checkin.old_value !== undefined && checkin.new_value !== undefined) {
        const diff = Number(checkin.new_value) - Number(checkin.old_value);
        const diffClass = diff < 0 ? 'decreased' : diff > 0 ? 'increased' : '';
        countHtml = `<span class="badge-count ${diffClass}">${checkin.old_value}→${checkin.new_value}</span>`;
    }

    return `<span class="pass-badge ${info.class}"><span class="badge-label">${info.name}</span>${countHtml}</span>`;
}

/**
 * Search for members in the check-in panel
 */
async function searchForCheckinPanel(searchTerm) {
    const container = document.getElementById('checkin-search-results');
    if (!container) return;

    if (!searchTerm || searchTerm.length < 2) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = '<div class="text-muted text-sm" style="padding: 12px;">Searching...</div>';

    try {
        // Search in all accounts
        const response = await fetch(`${API_IP}/api/users/searchUser`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                value: searchTerm,
                searchMethod: 'name',
                filter: { open: false, class: false, athletic: false }
            })
        });

        const accounts = await response.json();
        const matches = (accounts || []).slice(0, 8);

        if (matches.length === 0) {
            container.innerHTML = '<div class="text-muted text-sm" style="padding: 12px;">No matches found</div>';
            return;
        }

        container.innerHTML = matches.map(account => {
            return `
                <div class="search-result-item" onclick="showCheckinOptionsForPanel('${account.id}')">
                    <div class="result-info">
                        <span class="result-name">${escapeHtml(account.name)}</span>
                        <div class="result-badges">
                            ${renderCheckinBadges(account)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Search error:', error);
        container.innerHTML = '<div class="text-muted text-sm" style="padding: 12px;">Search failed</div>';
    }
}

/**
 * Render clickable check-in badges for an account
 */
function renderCheckinBadges(account) {
    let badges = [];
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Active memberships first (priority)
    for (const m of (account.memberships || [])) {
        if (m.is_closed || m.is_paused) continue;
        if (m.start_date === null && !m.is_unlimited) continue;
        if (m.end_date && new Date(m.end_date) < todayDate) continue;

        const typeName = getMembershipTypeName(m.type);
        const typeClass = getMembershipTypeClass(m.type, m);
        const daysLeft = m.is_unlimited ? '∞' :
            (m.end_date ? `${Math.ceil((new Date(m.end_date) - todayDate) / (1000 * 60 * 60 * 24))}d` : '?');

        badges.push(`
            <span class="pass-badge-clickable ${typeClass}" onclick="event.stopPropagation(); checkinWithMembership('${account.id}', '${m.id}')">
                <span class="badge-label">${typeName}</span>
                <span class="badge-count">${daysLeft}</span>
            </span>
        `);
    }

    // Then passes
    const passes = [
        { key: 'opengympasses', name: 'Open Gym', class: 'opengym' },
        { key: 'classpasses', name: 'Classes', class: 'classes' },
        { key: 'privatekidpasses', name: 'Priv Kid', class: 'private' },
        { key: 'privateadultpasses', name: 'Priv Adult', class: 'private' }
    ];

    for (const p of passes) {
        if (account[p.key] > 0) {
            badges.push(`
                <span class="pass-badge-clickable ${p.class}" onclick="event.stopPropagation(); checkinWithPass('${account.id}', '${p.key}')">
                    <span class="badge-label">${p.name}</span>
                    <span class="badge-count">${account[p.key]}</span>
                </span>
            `);
        }
    }

    if (badges.length === 0) {
        return '<span class="text-muted text-sm">No passes/memberships</span>';
    }

    return badges.join('');
}

/**
 * Check in with a membership
 */
async function checkinWithMembership(userId, membershipId) {
    try {
        const response = await fetch(`${API_IP}/api/memberships/useMembership`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                userId,
                membershipId,
                classId: selectedClassForPanel
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Check-in successful!', 'success');
            // Clear search and reload
            const searchInput = document.getElementById('checkin-search-input');
            if (searchInput) searchInput.value = '';
            const searchResults = document.getElementById('checkin-search-results');
            if (searchResults) {
                searchResults.classList.add('hidden');
                searchResults.innerHTML = '';
            }
            await loadSchedulePanel();
        } else {
            showToast(result.message || 'Check-in failed', 'error');
        }
    } catch (error) {
        console.error('Check-in error:', error);
        showToast('Check-in failed', 'error');
    }
}

/**
 * Check in with a pass
 */
async function checkinWithPass(userId, passType) {
    try {
        const response = await fetch(`${API_IP}/api/users/usePass`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                userId,
                passType,
                classId: selectedClassForPanel
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Check-in successful!', 'success');
            // Clear search and reload
            const searchInput = document.getElementById('checkin-search-input');
            if (searchInput) searchInput.value = '';
            const searchResults = document.getElementById('checkin-search-results');
            if (searchResults) {
                searchResults.classList.add('hidden');
                searchResults.innerHTML = '';
            }
            await loadSchedulePanel();
        } else {
            showToast(result.message || 'Check-in failed', 'error');
        }
    } catch (error) {
        console.error('Check-in error:', error);
        showToast('Check-in failed', 'error');
    }
}

/**
 * Show check-in options for an account (fallback if clicking on name)
 */
function showCheckinOptionsForPanel(accountId) {
    // Just open the regular check-in modal for this account
    window.openCheckinModal(accountId);
}

/**
 * Undo check-in from the panel
 */
async function undoCheckinFromPanel(logId) {
    if (!confirm('Undo this check-in?')) return;

    try {
        const response = await fetch(`${API_IP}/api/logs/deleteCheckin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ logId })
        });

        const result = await response.json();
        if (result.success) {
            showToast('Check-in undone', 'success');
            await loadSchedulePanel();
        } else {
            showToast(result.message || 'Failed to undo', 'error');
        }
    } catch (error) {
        console.error('Undo error:', error);
        showToast('Failed to undo check-in', 'error');
    }
}

// Expose two-panel functions to window
window.selectClassForPanel = selectClassForPanel;
window.checkinWithMembership = checkinWithMembership;
window.checkinWithPass = checkinWithPass;
window.showCheckinOptionsForPanel = showCheckinOptionsForPanel;
window.undoCheckinFromPanel = undoCheckinFromPanel;
