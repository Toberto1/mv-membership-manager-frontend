import * as util from './utils.js';
import * as dom from './domElements.js';
import * as global from './globals.js';

import * as searchTab from './searchTab.js';
import * as addAccountTab from './addAccountTab.js';
import * as editAccountTab from './editAccountTab.js';
import * as dailyCheckinTab from './dailyCheckinTab.js';
import * as logTab from './logTab.js';

const token = localStorage.getItem('token');
if (token) {
    fetch(`${global.API_IP}/api/auth/verifyToken`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
        .then(res => {
            if (!res.ok) throw new Error('Invalid token');
        })
        .catch(() => {
            localStorage.removeItem('token');
            util.kick();
        });
} else window.location.href = '/auth.html';

const VERSION = "1.0.1";
async function checkVersion() {
    try {
        const res = await fetch(`${global.API_IP}/api/mmVersion`, { cache: "no-store" });
        const { version: currentVersion } = await res.json();

        if (currentVersion !== VERSION) {
            util.showTopHeaderDialog("An update is being rolled out... please wait", { error: true });
            setTimeout(() => util.kick(), 3000);
        }
    } catch (err) {
        util.showTopHeaderDialog("Failed to check version. Please refresh the page.", { error: true });
        console.error("Version check failed", err);
    }
}

// Check every 5 minutes
setInterval(checkVersion, 15 * 60 * 1000);

// Also check immediately on page load
checkVersion();

//Get main elements
const searchBar = document.getElementById('searchInput');
const resultsBody = document.getElementById('searchResults');
const filterRow = document.querySelectorAll(".filter-checkbox");

window.addEventListener('DOMContentLoaded', () => {

    const tabsChecked = document.querySelector('input[name="tabs"]:checked');
    if (tabsChecked) tabsChecked.dispatchEvent(new Event('change'));

    //set up log filters
    util.applyPreset('today');
    window.loadLogResults();
    window.loadSearchTableResults();
    dailyCheckinTab.loadDailyCheckins(util.getTodayString());
    addAccountTab.initFields();
    editAccountTab.initFields();
});

setInterval( () => {
    //Reload log and search incoming checkins every 10 minutes
    dailyCheckinTab.loadDailyCheckins(util.getTodayString());
    window.loadLogResults();
    window.loadSearchTableResults(true);
}, 10 * 60 * 1000); //10 minutes

document.getElementById("clear-search").addEventListener("click", () => {
    searchBar.value = "";
    for (let item of filterRow) {
        item.checked = false;
    }
    window.loadSearchTableResults();
});

for (let item of filterRow) {
    item.addEventListener("change", () => {
        window.loadSearchTableResults();
    });
}

document.querySelectorAll('input, select').forEach((element) => {
    element.addEventListener('input', () => {
        element.classList.remove("missing");
    });
});

document.getElementById("clearAccountFilterBtn").addEventListener("click", () => {
    global.setSelectedAccountForLog(null);
    util.applyPreset('today');

    util.whiteFlash("log-container");

    util.toggleElement("selectedAccountInfoButton");
    util.toggleElement("clearAccountFilterBtn");

    document.getElementById("log-container-edit-shortcut")?.remove();

    window.loadLogResults();
});



//Input listener for tab element
document.querySelectorAll('input[name="tabs"]').forEach((radio, index) => {
    radio.addEventListener('change', () => {
        dom.swapTab(index);
    });
});

const searchMethodSelect = document.getElementById("searchMethodSelect");
searchMethodSelect.addEventListener("change", () => {
    const method = searchMethodSelect.value;
    global.setSearchMethod(method);

    switch (method) {
        case "name":
            searchBar.placeholder = "Search by name (Last, First)";
            document.getElementById("searchMethodTableHead").innerText = "Name";
            break;
        case "email":
            searchBar.placeholder = "Search by email (example@domain.com)";
            document.getElementById("searchMethodTableHead").innerText = "Email";
            break;
        case "phone_number":
            searchBar.placeholder = "Search by phone number (xxx-xxx-xxxx)";
            document.getElementById("searchMethodTableHead").innerText = "Phone";
            break;
    }

    window.loadSearchTableResults();
    util.whiteFlash("search-container");
});

document.querySelectorAll(".go-to-search").forEach(button => {
    button.addEventListener("click", () => {
        dom.swapTab(global.tabIndexs.search);
    });
});

searchBar.addEventListener('input', util.debounce(async (e) => {
    try {
        window.loadSearchTableResults();
    } catch (error) {
        console.error('Error fetching search results:', error);
        resultsBody.innerHTML = resultsBody.innerHTML = '<tr><td colspan="4" class="tooltipText" style="vertical-align: top;">Something went wrong</td></tr>';
    }
}, 300)); // debounce delay of 300ms

//-------Functions---------//
window.addMembershipRow = function (type) {
    const row = dom.membershipFormRow(null);
    const container = document.getElementById(`membershipFieldset-${type}`);
    container.insertBefore(row, container.children[3]);
    util.whiteFlash(row.id);
}
window.renewMembershipRow = function (type, membership) {
    const row = dom.createRenewedMembershipRow(membership);
    const container = document.getElementById(`membershipFieldset-${type}`);
    container.insertBefore(row, container.children[3]);
    util.whiteFlash(row.id);
}
window.adjustPunches = function (inputId, amount) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Update the value
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.max(0, currentValue + amount);
    input.value = newValue;

    // Find the matching sticker label (the one right before the input)
    const sticker = input.previousElementSibling;
    if (sticker && sticker.classList.contains('sticker')) {
        if (newValue === 0) {
            sticker.style.opacity = '0.4';
        } else {
            sticker.style.opacity = '1';
        }
        sticker.style.transition = 'opacity 0.3s ease';
    }

    // Keep your white flash
    util.whiteFlash("passFieldset-add");
    util.whiteFlash("passFieldset-edit");
};

document.querySelectorAll('.only-numbers').forEach(inputElement => {
    inputElement.addEventListener('input', () => {
        inputElement.value = inputElement.value.replace(/\D/g, '');
    });
});

document.querySelectorAll('input, select').forEach((element) => {
    element.addEventListener('input', () => {
        element.classList.remove("missing");
    });
    element.addEventListener('change', () => {
        element.classList.remove("missing");
    });
});