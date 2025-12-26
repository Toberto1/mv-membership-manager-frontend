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

//Log actions -> ui display mapping
export const logActions = {
  ACCOUNT_ADDED: 'Account added',

  NAME_UPDATED: 'Name updated',
  EMAIL_UPDATED: 'Email updated',
  PHONE_UPDATED: 'Phone number updated',

  PASS_AMOUNT_UPDATED: 'Pass amount updated',

  MEMBERSHIP_ADDED: 'Membership added',
  MEMBERSHIP_UPDATED: 'Membership updated',
  MEMBERSHIP_STARTED: 'Membership started',

  NOTE_UPDATED: 'Note updated',
};

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
}

export const membershipFields = {

}



export const API_IP = 'https://monkeyvault-backend-production.up.railway.app';