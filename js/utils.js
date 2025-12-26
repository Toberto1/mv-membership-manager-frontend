import * as global from './globals.js';
import * as roleManager from './roleManager.js';



export function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

//This function only works on elements that can have children
export function whiteFlash(elementID) {
    const element = document.getElementById(elementID);
    if (!element) return;

    // Create overlay div
    const flashOverlay = document.createElement('div');
    flashOverlay.style.position = 'absolute';
    flashOverlay.style.top = '0';
    flashOverlay.style.left = '0';
    flashOverlay.style.width = '100%';
    flashOverlay.style.height = '100%';
    flashOverlay.style.backgroundColor = 'white';
    flashOverlay.style.opacity = '0.9';
    flashOverlay.style.pointerEvents = 'none';
    flashOverlay.style.zIndex = '1000';
    flashOverlay.style.transition = 'opacity 0.5s ease';

    // Make sure parent is positioned relatively
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
        element.style.position = 'relative';
    }

    // Append overlay
    element.appendChild(flashOverlay);

    // Trigger opacity fade out
    requestAnimationFrame(() => {
        flashOverlay.style.opacity = '0';
    });

    // Remove overlay after transition ends
    flashOverlay.addEventListener('transitionend', () => {
        if (flashOverlay.parentElement) {
            flashOverlay.parentElement.removeChild(flashOverlay);
        }
    }, { once: true });
}


export function daysBetweenISO(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    // strip time using UTC to avoid timezone issues
    const utc1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
    const utc2 = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());

    return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

export function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        // Modern API
        return navigator.clipboard.writeText(text);
    }
}


export function calculateEndDate(startDate, addedDays, totalDaysPaused) {
    if (!startDate || addedDays <= 0) {
        return startDate;
    }

    const startDateObj = new Date(startDate);
    if (isNaN(startDateObj.getTime())) {
        return startDate;
    }

    const totalDays = addedDays + totalDaysPaused;

    const endDate = new Date(startDateObj);
    endDate.setDate(startDateObj.getDate() + totalDays - 1); // Subtract 1 to include the start date in the count

    return getDateOnly(endDate);
}

export function inputMissing(elementID) {
    document.getElementById(elementID).classList.add("missing");
}

export function clearAll(parent, classType) {
    parent.querySelectorAll(classType).forEach((element) => {
        if ((element.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(element.type)) || element.tagName === 'BUTTON')
            return;
        element.value = '';
    });
}

export function clearMemberships(parentId) {
    document.getElementById(parentId).querySelectorAll(`.membership-row`).forEach((element) => {
        element.remove();
    });
}

export function clearAddAccountTab() {
    clearAll(document.getElementById('addAccount-container'), 'input, select, textarea');
    clearMemberships("addAccount-container");
    global.resetMembershipCounter("add");

    const firstRadio = document.getElementById('addAccount-container').querySelector('input[type="radio"]');
    if (firstRadio) {
        firstRadio.checked = true;
        firstRadio.dispatchEvent(new Event('change'));
    }
}

export function kick() {
    // Clear token and role state before redirecting
    localStorage.removeItem('token');
    roleManager.clearRole();
    window.location.href = '/auth.html';
}

export function getDateOnly(date) {
    if (date instanceof Date) {
        return date.toISOString().split('T')[0];
    }
    else if (typeof date === 'string') {
        return date.split('T')[0];
    }
}

export function isExpired(date) {
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return date && new Date(date) < todayDate;
}

export function applyPreset(preset) {
    const startDateInput = document.getElementById("log-start-date");
    const endDateInput = document.getElementById("log-end-date");

    const today = new Date();

    // Helper to format date as 'YYYY-MM-DD' for input[type=date]
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() is 0-based
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    switch (preset) {
        case "today": {
            const todayStr = formatDate(today);
            startDateInput.value = todayStr;
            endDateInput.value = todayStr;
            break;
        }
        case "7": { // Last 7 days
            const end = today;
            const start = new Date(today);
            start.setDate(start.getDate() - 6); // includes today = 7 days total
            startDateInput.value = formatDate(start);
            endDateInput.value = formatDate(end);
            break;
        }
        case "30": { // Last 30 days
            const end = today;
            const start = new Date(today);
            start.setDate(start.getDate() - 29); // 30 days total including today
            startDateInput.value = formatDate(start);
            endDateInput.value = formatDate(end);
            break;
        }
        case "alltime": {
            const end = today;
            const start = new Date(today);
            start.setDate(start.getDate() - 365 * 5); // 30 days total including today
            startDateInput.value = formatDate(start);
            endDateInput.value = formatDate(end);
            break;
        }
        default: {
            // Clear inputs or leave unchanged
            startDateInput.value = "";
            endDateInput.value = "";
        }
    }

    whiteFlash("log-filter-startdate-container");
    whiteFlash("log-filter-enddate-container");
}

export function passDBToReadable(key) {
    return global.logFields[key] || "";
}

export function toggleElement(id) {
    document.getElementById(id)?.classList.toggle('hidden');
}

const animations = [
    '../animations/loadingAnimation1.json',
    '../animations/loadingAnimation2.json',
    '../animations/loadingAnimation3.json',
    '../animations/loadingAnimation4.json',
    '../animations/loadingAnimation5.json',
    '../animations/loadingAnimation6.json',
    '../animations/loadingAnimation7.json'
]

const latestLoadingIdMap = new Map();

/**
 * Show or hide loading overlay on a target element.
 * @param {string} elementId - The DOM element ID to show the overlay on.
 * @param {boolean} isLoading - true to show, false to hide.
 * @param {string|number} [callId] - Optional unique call ID for controlling which call can stop loading.
 * @returns {string|number|undefined} - Returns the call ID when starting loading; undefined when stopping.
 */
export function isLoading(elementId, isLoading, callId) {
    const target = document.getElementById(elementId);
    if (!target) {
        console.warn(`Element with ID "${elementId}" not found.`);
        return;
    }

    const overlays = target.querySelectorAll('.lottie-overlay');

    if (isLoading) {
        // Generate a unique call ID if none provided
        const newCallId = callId ?? (Date.now() + Math.random());
        latestLoadingIdMap.set(elementId, newCallId);

        // Remove any old overlays immediately and clear fade timers
        overlays.forEach(overlay => {
            if (overlay._fadeTimeout) {
                clearTimeout(overlay._fadeTimeout);
            }
            overlay.remove();
        });

        const animationUrl = animations[Math.floor(Math.random() * animations.length)];

        const overlay = document.createElement('div');
        overlay.className = 'lottie-overlay';
        Object.assign(overlay.style, {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: target.clientHeight + 'px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            transition: 'opacity 0.3s ease'
        });

        const player = document.createElement('lottie-player');
        player.setAttribute('src', animationUrl);
        player.setAttribute('autoplay', '');
        player.setAttribute('loop', '');
        player.style.width = '150px';
        player.style.height = '150px';

        overlay.dataset.loadingId = newCallId.toString();

        overlay.appendChild(player);
        target.style.position = target.style.position || 'relative';
        target.appendChild(overlay);

        return newCallId;

    } else {
        // When stopping, only stop if callId matches the latest
        if (!callId) {
            console.warn('isLoading called to stop loading without callId — ignoring.');
            return;
        }

        overlays.forEach(overlay => {
            const loadingId = overlay.dataset.loadingId;
            const latestId = latestLoadingIdMap.get(elementId);

            if (loadingId !== callId.toString() || latestId !== callId) {
                // Not the latest or callId doesn’t match — ignore
                return;
            }

            overlay.classList.add('fadeOutAni');

            overlay._fadeTimeout = setTimeout(() => {
                // Only remove if still latest and matching callId
                if (latestLoadingIdMap.get(elementId) === callId) {
                    overlay.remove();
                    latestLoadingIdMap.delete(elementId);
                }
            }, 300);
        });
    }
}

export function showTopHeaderDialog(message, options = {}) {
    const existing = document.getElementById("custom-header-dialog");
    if (existing) existing.remove(); // Only one at a time

    const header = document.createElement("div");
    header.id = "custom-header-dialog";
    header.textContent = message;

    // Optional close button
    if (!options.noClose) {
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "&times;";
        closeBtn.className = "close-btn";
        closeBtn.onclick = () => header.remove();
        header.appendChild(closeBtn);
    }

    if (options.autoClose && options.duration) {
        setTimeout(() => {
            header.style.transition = "opacity 0.3s"; // fade duration
            header.style.opacity = 0;                // start fading
            setTimeout(() => {
                header.remove();
            }, 300); // match the transition duration
        }, options.duration);
    }
    if (options.error) {
        header.classList.add("error-col");
    }
    if (options.success) {
        header.classList.add("success-col");
    }

    document.body.appendChild(header);
    whiteFlash(header.id);
}

export function utcToLocal(utcString, options = {}) {
    let d = new Date(utcString);

    // Default formatting (local time)
    let formatter = new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        ...options
    });

    return formatter.format(d);
}

export function getTodayString() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString().split('T')[0];
}

export function getCurrentDayOfTheWeek() {
    return (new Date()).getDay();
}
export function getCurrentDayOfTheWeekUTC() {
    return (new Date()).getUTCDay();
}

export function lockout(element, duration, disable = true) {
    element.style.pointerEvents = "none";
    element.style.opacity = "0.5";
    element.disabled = disable;

    setTimeout(() => {
        element.style.pointerEvents = "";
        element.style.opacity = "";
        element.disabled = false;
    }, duration);
}

export function getTimeRangeUTC(buffer) {
    const now = new Date();
    
    // Get UTC components
    const nowUTC = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getUTCMilliseconds()
    );

    const start = new Date(nowUTC - buffer * 60 * 1000);
    const end = new Date(nowUTC + buffer * 60 * 1000);

    return { start: start, end: end};
}

export function groupPassEntries(entries) {
    const mergedEntries = entries.slice();

    for (let i = mergedEntries.length - 2; i >= 0; i--) {
        const current = mergedEntries[i];
        const next = mergedEntries[i + 1];

        if (
            current.action === "PASS_AMOUNT_UPDATED" &&
            next.action === "PASS_AMOUNT_UPDATED" &&
            current.field === next.field &&
            current.name === next.name
        ) {
            const currentTime = new Date(current.timestamp);
            const nextTime = new Date(next.timestamp);

            // Compare up to the minute
            if (
                currentTime.getFullYear() === nextTime.getFullYear() &&
                currentTime.getMonth() === nextTime.getMonth() &&
                currentTime.getDate() === nextTime.getDate() &&
                currentTime.getHours() === nextTime.getHours() &&
                currentTime.getMinutes() === nextTime.getMinutes()
            ) {
                // Merge into next
                next.new_value = current.new_value;
                mergedEntries.splice(i, 1); // Remove current
                // no i++ needed because we're going backwards
            }
        }
    }

    return mergedEntries;
}

export function accountOnlyHasExpired(account, filterTypes = null) {
    const membershipsToCheck = filterTypes && filterTypes.length > 0
        ? account.memberships.filter(m => filterTypes.includes(m.type))
        : account.memberships;

    if (membershipsToCheck.length === 0) return true;

    for (let membership of membershipsToCheck) {
        if (!isExpired(membership.end_date)) {
            return false;
        }
    }
    return true;
}

export function accountHasPasses(account, filterTypes = null) {
    // If no filter, check all passes
    if (!filterTypes || filterTypes.length === 0) {
        if (account.opengympasses > 0) return true;
        if (account.classpasses > 0) return true;
        if (account.privatekidpasses > 0) return true;
        if (account.privateadultpasses > 0) return true;
        if (account.aerialsilkspasses > 0) return true;
        return false;
    }

    // Check only passes matching filter types
    if (filterTypes.includes('open') && account.opengympasses > 0) return true;
    if (filterTypes.includes('class') && account.classpasses > 0) return true;
    return false;
}

export function seperateExpiredMemberships(accounts, filter = null) {
    // Extract active filter types
    const filterTypes = filter
        ? Object.entries(filter).filter(([_, enabled]) => enabled).map(([type]) => type)
        : null;

    const hasActiveFilter = filterTypes && filterTypes.length > 0;

    const activeAccounts = accounts.filter(acc =>
        !accountOnlyHasExpired(acc, hasActiveFilter ? filterTypes : null) ||
        accountHasPasses(acc, hasActiveFilter ? filterTypes : null)
    );
    const expiredAccounts = accounts.filter(acc =>
        accountOnlyHasExpired(acc, hasActiveFilter ? filterTypes : null) &&
        !accountHasPasses(acc, hasActiveFilter ? filterTypes : null)
    );
    return [...activeAccounts, ...expiredAccounts];
}


export function oldToNewDisplay(field) {
    switch (field) {
        case 'is_paused': return ['Paused', 'Active'];
        case 'is_unlimited': return ['Limited', 'Unlimited'];
        case 'is_closed': return ['Actice', 'Closed'];
        default: return null;
    }
}

export function membershipDBToReadable(type) {
    switch (type) {
        case 'open': return 'Open Gym';
        case 'class': return 'Classes';
        case 'athletic' : return 'Athletic';
    }
    return "";
}


/**
 * Show a success toast message
 * @param {string} message - Message to display
 */
export function showSuccess(message) {
    showTopHeaderDialog(message, { success: true, autoClose: true, duration: 3000 });
}

/**
 * Show an error toast message
 * @param {string} message - Message to display
 */
export function showError(message) {
    showTopHeaderDialog(message, { error: true, autoClose: true, duration: 5000 });
}

window.applyPreset = applyPreset;
window.clearAddAccountTab = clearAddAccountTab;
window.toggleElement = toggleElement;