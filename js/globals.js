let membershipRowCounter_add = 0;
let membershipRowCounter_edit = 0;

export function getMembershipCounter(type) {
    switch (type) {
        case "add": return membershipRowCounter_add;
        case "edit": return membershipRowCounter_edit;
    }
}
export function incramentMembershipCounter(type) {
    switch (type) {
        case "add": return membershipRowCounter_add++;
        case "edit": return membershipRowCounter_edit++;
    }
}

export function resetMembershipCounter(type) {
    switch (type) {
        case "add": membershipRowCounter_add = 0; break;
        case "edit": membershipRowCounter_edit = 0; break;
    }
}


let selectedAccountForEdit = null;

export function setSelectedAccountForEdit(account) {
    selectedAccountForEdit = account;
}

export function getSelectedAccountForEdit() {
    return selectedAccountForEdit;
}

let selectedAccountForLog = null;

export function setSelectedAccountForLog(account) {
    selectedAccountForLog = account;
}

export function getSelectedAccountForLog() {
    return selectedAccountForLog;
}

let showUpcomingCheckins = true;
export function setShowUpcomingCheckins(value) {
    showUpcomingCheckins = value;
}
export function getShowUpcomingCheckins() {
    return showUpcomingCheckins;
}

export const tabIndexs = {
    search: 0,
    addAccount: 1,
    editAccount: 2,
    dailyCheckins: 3,
    logHistory: 4,
    settings: 5,
};

export function getTabIndex() {
  const tabs = Array.from(document.querySelectorAll('input[name="tabs"]'));

  return tabs.findIndex(tab => {
    const label = document.querySelector(`label[for="${tab.id}"]`);
    return tab.checked && (!label || !label.classList.contains("hidden"));
  });
}

export function getNextVisibleIndex(current, step) {
  const tabs = Array.from(document.querySelectorAll('input[name="tabs"]'));
  let i = current;

  for (let j = 0; j < tabs.length; j++) {   // max N iterations
    i = (i + step + tabs.length) % tabs.length;

    const label = document.querySelector(`label[for="${tabs[i].id}"]`);
    if (!label || !label.classList.contains("hidden")) {
      return i;
    }
  }

  return current; // fallback if all are hidden
}
export function getToken() {
    return localStorage.getItem('token');
}



let searchMethod = "name";
const validSearchMethods = ["name", "email", "phone_number"];

export function setSearchMethod(method) {
    if (validSearchMethods.includes(method)) {
        searchMethod = method;
    }
}

export function getSearchMethod() {
    return searchMethod;
}

// Log actions -> UI display mapping
// NOTE: Keys must match backend constants.js logActions
// Values are human-readable labels for display
export const logActions = {
  ACCOUNT_ADDED: 'Account added',

  NAME_UPDATED: 'Name updated',
  EMAIL_UPDATED: 'Email updated',
  PHONE_UPDATED: 'Phone number updated',

  PASS_AMOUNT_UPDATED: 'Pass amount updated',

  MEMBERSHIP_ADDED: 'Membership added',
  MEMBERSHIP_UPDATED: 'Membership updated',
  MEMBERSHIP_STARTED: 'Membership started',
  MEMBERSHIP_PAUSE_UPDATED: 'Membership pause updated',

  NOTE_UPDATED: 'Note updated',
};

// Log fields -> UI display mapping
// NOTE: Keys must match backend constants.js logFields
// Values are human-readable labels for display
export const logFields = {
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
  is_closed: 'Closed status',
};

export const API_IP = 'https://monkeyvault-backend-production.up.railway.app';

// ============================================================================
// CLASS AGE GROUPS - Single source of truth for class schedule age groups
// Order: youngest to oldest (used for combining multiple selections)
// ============================================================================
export const CLASS_AGE_GROUPS = ['Parent & Child', 'Kids', 'Teens', 'Adults'];

// ============================================================================
// CLASS TYPES - Just the type names (color is determined by type + age group)
// ============================================================================
export const DEFAULT_CLASS_TYPES = [
    'Parkour',
    'Calisthenics',
    'Stretching',
    'Acro Dance',
    'Breakdance',
    'Gymnastics',
    'Flips Level 1',
    'Flips Level 2',
    'Backflip Only',
    'Tricking',
    'Athletic'
];

// ============================================================================
// CLASS COLORS - Mapping of "type.agegroup" -> color
// Keys use lowercase with hyphens, matching the classColors from deprecated/script.js
// ============================================================================
export const CLASS_COLORS = {
    // Parkour variants
    'parkour.parent & child': '#FFFF00',
    'parkour.kids': '#00bf63',
    'parkour.teens': '#ff5757',
    'parkour.adults': '#ff914d',
    'parkour.womens only': '#cb6ce6',

    // Calisthenics
    'calisthenics': '#a6a6a6',
    'calisthenics.womens only': '#cb6ce6',

    // Other types (no age group variants - same color for all)
    'stretching': '#5e17eb',
    'acro dance': '#8c5645',
    'breakdance': '#000000',
    'gymnastics': '#d9d9d9',
    'tricking': '#38b6ff',
    'athletic': '#FFCA28',

    // Flips Level 1 variants
    'flips level 1.kids': '#8c52ff',
    'flips level 1.teens': '#545454',
    'flips level 1.adults': '#004aad',

    // Flips Level 2
    'flips level 2.adults': '#004aad',

    // Backflip Only
    'backflip only.adults': '#004aad'
};

// Default fallback color
export const DEFAULT_CLASS_COLOR = '#808080';

/**
 * Get color for a class based on type and age group
 * @param {string} type - Class type (e.g., "Parkour")
 * @param {string} ageGroup - Age group (e.g., "Kids", "Kids & Teens")
 * @returns {string} Hex color code
 */
export function getClassColor(type, ageGroup) {
    if (!type) return DEFAULT_CLASS_COLOR;

    const typeLower = type.toLowerCase();

    // Try specific type.agegroup combination first
    if (ageGroup) {
        // Handle combined age groups like "Kids & Teens" - use first one
        const primaryAge = ageGroup.split(' & ')[0].toLowerCase();
        const key = `${typeLower}.${primaryAge}`;
        if (CLASS_COLORS[key]) return CLASS_COLORS[key];
    }

    // Try just the type (for types without age variants)
    if (CLASS_COLORS[typeLower]) return CLASS_COLORS[typeLower];

    return DEFAULT_CLASS_COLOR;
}

// ============================================================================
// TIMEZONE - Single source of truth for all date/time operations
// ============================================================================
export const TIMEZONE = 'America/New_York';