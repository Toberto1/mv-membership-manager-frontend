import * as util from './utils.js';
import * as global from './globals.js';
import * as dom from './domElements.js';

const resultsBodylog = document.getElementById('log-list');

const logActionType = document.getElementById("log-action-type");
for (const key in global.logActions) {
    if (global.logActions.hasOwnProperty(key)) {
        logActionType.innerHTML += `<option value="${key}">${global.logActions[key]}</option>`;
    }
}

const logFilterToggleBtn = document.getElementById("filter-log-toggle-btn");
logFilterToggleBtn.addEventListener("click", dom.toggleLogFilterRow);


export async function loadLogResults() {
    util.whiteFlash("log-container");
    dom.toggleLogFilterRow(false)

    const startDateInput = document.getElementById("log-start-date");
    const endDateInput = document.getElementById("log-end-date");
    const actionTypeInput = document.getElementById("log-action-type");
    const limit = document.getElementById("log-row-limit");

    const startDateValue = startDateInput.value;
    const endDateValue = endDateInput.value;
    const actionType = actionTypeInput.value;
    const limitValue = limit.value;

    if (!startDateValue || !endDateValue) return;

    const limitNum = parseInt(limitValue);
    if (isNaN(limitNum) || limitNum <= 0) return;

    // startDateValue and endDateValue are strings like "2025-08-22"
    const startTime = new Date(`${startDateValue}T00:00:00`).toISOString();
    const endTime = new Date(`${endDateValue}T23:59:59.999`).toISOString();

    const accountId = global.getSelectedAccountForLog() === null ? null : global.getSelectedAccountForLog().id;

    const logs = await fetchLogs(
        startTime,
        endTime,
        actionType,
        limitNum,
        parseInt(accountId)
    );

    const results = util.groupPassEntries(logs);

    resultsBodylog.innerHTML = ''; // clear old results

    if (results && results.length > 0) {
        // Group logs by "timestamp + personKey"
        const groupedLogs = {};

        for (let i = 0; i < results.length; i++) {
            const log = results[i];

            // Normalize person key - lowercase and trim if string
            const personKeyRaw = log.name || log.email || log.phone_number || "unknown";
            const personKey = typeof personKeyRaw === 'string' ? personKeyRaw.trim().toLowerCase() : "unknown";

            // Parse timestamp and truncate milliseconds to zero
            const dateObj = new Date(log.timestamp);
            dateObj.setMilliseconds(0); // zero out milliseconds
            dateObj.setSeconds(0);

            // Create ISO string without milliseconds
            const logTimeISO = dateObj.toISOString();

            const groupKey = `${logTimeISO}__${personKey}`;

            if (!groupedLogs[groupKey]) groupedLogs[groupKey] = [];
            groupedLogs[groupKey].push(log);
        }


        // For each group, create one header + multiple bodies
        for (const groupKey in groupedLogs) {
            const logsGroup = groupedLogs[groupKey];

            // Create header from first log in group
            const firstLog = logsGroup[0];

            const row = document.createElement('div');
            row.classList.add("log-entry");

            const head = document.createElement('div');
            head.classList.add("log-entry-head");

            const timestamp = firstLog.timestamp;
            const dateObj = new Date(timestamp);
            const options = {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            };
            const formattedDate = dateObj.toLocaleString('en-US', options);

            // Timestamp div
            const timestampDiv = document.createElement('div');
            timestampDiv.textContent = formattedDate;
            timestampDiv.style.fontWeight = "bold";

            const nameDiv = document.createElement('div');
            const hasName = !!firstLog.name;
            const emailDiv = document.createElement('div');
            const hasEmail = !!firstLog.email;
            const phoneDiv = document.createElement('div');
            const hasPhone = !!firstLog.phone_number;

            if (global.getSelectedAccountForLog() === null) {

                // Name div
                nameDiv.textContent = hasName ? firstLog.name : 'Unknown User';
                nameDiv.style.color = hasName ? '#0066cc' : '#999999';
                nameDiv.style.cursor = hasName ? 'pointer' : 'default';
                nameDiv.style.fontWeight = hasName ? 'bold' : 'normal';
                if (hasName) {
                    nameDiv.addEventListener('click', () => {
                        dom.swapTab(global.tabIndexs.search);
                        global.setSearchMethod("name");
                        document.getElementById("searchMethodSelect").value = "name";
                        document.getElementById("searchMethodTableHead").innerHTML = "Name";
                        document.getElementById("searchInput").value = firstLog.name;
                        loadSearchTableResults();
                    });
                }

                // Email div
                emailDiv.textContent = hasEmail ? firstLog.email : 'unknown email';
                emailDiv.style.color = hasEmail ? '#0066cc' : '#999999';
                emailDiv.style.cursor = hasEmail ? 'pointer' : 'default';
                emailDiv.style.fontWeight = hasEmail ? 'bold' : 'normal';
                if (hasEmail) {
                    emailDiv.addEventListener('click', () => {
                        dom.swapTab(global.tabIndexs.search);
                        global.setSearchMethod("email");
                        document.getElementById("searchMethodSelect").value = "email";
                        document.getElementById("searchInput").value = firstLog.email;
                        document.getElementById("searchMethodTableHead").innerHTML = "Email";
                        loadSearchTableResults();
                    });
                }

                // Phone div
                phoneDiv.textContent = hasPhone ? firstLog.phone_number : 'unknown phone';
                phoneDiv.style.color = hasPhone ? '#0066cc' : '#999999';
                phoneDiv.style.cursor = hasPhone ? 'pointer' : 'default';
                phoneDiv.style.fontWeight = hasPhone ? 'bold' : 'normal';
                if (hasPhone) {
                    phoneDiv.addEventListener('click', () => {
                        dom.swapTab(global.tabIndexs.search);
                        global.setSearchMethod("phone_number");
                        document.getElementById("searchMethodSelect").value = "phone_number";
                        document.getElementById("searchInput").value = firstLog.phone_number;
                        document.getElementById("searchMethodTableHead").innerHTML = "Phone";
                        loadSearchTableResults();
                    });
                }
            }

            head.appendChild(timestampDiv);
            if (global.getSelectedAccountForLog() === null) {
                head.appendChild(nameDiv);
                if (hasEmail) head.appendChild(emailDiv);
                if (hasPhone) head.appendChild(phoneDiv);
            }


            row.appendChild(head);

            // Append each log's body info inside this group
            for (const log of logsGroup) {
                const body = document.createElement('div');
                body.classList.add("log-entry-subrow");

                const action = global.logActions[log.action];

                const changeDiv = document.createElement('label');
                if (!(log.old_value === null && log.new_value === null))
                    changeDiv.classList.add("oldToNewSticker");
                const oldValNum = parseFloat(log.old_value);
                const newValNum = parseFloat(log.new_value);
                if (log.old_value === "") log.old_value = '" "';
                if (log.new_value === "") log.new_value = '" "';

                switch (log.action) {
                    case "PASS_AMOUNT_UPDATED":
                        changeDiv.textContent = `${log.old_value} → ${log.new_value}`;
                        if (newValNum - oldValNum > 0) changeDiv.classList.add("additive-update");
                        else changeDiv.classList.add("subtractive-update");

                        break;
                    case "MEMBERSHIP_ADDED":
                        changeDiv.textContent = `+${log.new_value} days`;
                        changeDiv.classList.add("additive-update");
                        break;
                    case "MEMBERSHIP_UPDATED":
                        const displayValues = util.oldToNewDisplay(log.field);
                        log.old_value = displayValues ? displayValues[0] : log.old_value;
                        log.new_value = displayValues ? displayValues[1] : log.new_value;
                    default:
                        if (log.old_value !== null && log.new_value !== null) {
                            changeDiv.textContent = `${log.old_value} → ${log.new_value}`;

                        }
                        if (log.old_value === null && log.new_value !== null) changeDiv.textContent = `${log.new_value}`;
                }




                const fieldDiv = document.createElement('label');
                fieldDiv.style.width = "10%";
                fieldDiv.classList.add("sticker");




                if (util.passDBToReadable(log.field) !== '') {
                    fieldDiv.textContent = util.passDBToReadable(log.field);
                    fieldDiv.classList.add(`${log.field}-color`);
                }
                if (util.membershipDBToReadable(log.field) !== '') {
                    fieldDiv.textContent = util.membershipDBToReadable(log.field);
                    fieldDiv.classList.add(`${log.field}-color`);
                } else {
                    fieldDiv.textContent = global.logFields[log.field] || log.field;
                    fieldDiv.classList.add(`generic-color`);
                }

                const actionDiv = document.createElement('div');
                actionDiv.textContent = action;

                body.appendChild(actionDiv);

                if (log.field !== '') {
                    body.appendChild(fieldDiv);
                }

                body.appendChild(changeDiv);
                row.appendChild(body);


            }

            resultsBodylog.appendChild(row);
        }
    } else {
        resultsBodylog.innerHTML = '<div style="padding: 1.5em; font-size: 14px;">No results found</div>';
    }

    function formatReadableDate(dateStr) {
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        const localDate = new Date(year, month - 1, day);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return localDate.toLocaleDateString(undefined, options);
    }

    const formattedStart = formatReadableDate(startDateValue);
    const formattedEnd = formatReadableDate(endDateValue);

    const resultDate = (startDateValue === endDateValue)
        ? formattedStart
        : `${formattedStart} to ${formattedEnd}`;
    const logResultText = document.getElementById("log-result-text");
    const selectedOptionText = actionTypeInput.querySelector(`option[value="${actionTypeInput.value}"]`)?.textContent;
    let html = `<p>Showing results from <strong>${resultDate}</strong> for <strong>${selectedOptionText}</strong> actions`;

    const selectedAccount = global.getSelectedAccountForLog();
    if (selectedAccount !== null) {
        html += ` (History for <span id="log-container-search-shortcut"></span>)`;
    }

    html += ` <span style="color: #666; font-style: italic;">(${results.length})</span></p>`;

    logResultText.innerHTML = html;

    // Set user name via textContent to prevent XSS
    const nameSpan = document.getElementById("log-container-search-shortcut");
    if (nameSpan && selectedAccount) {
        nameSpan.textContent = ` ${selectedAccount.name}`;
    }



    document.getElementById("log-container-search-shortcut")?.addEventListener("click", () => {
        dom.swapTab(global.tabIndexs.search);
        global.setSearchMethod("name");
        document.getElementById("searchMethodSelect").value = "name";
        document.getElementById("searchMethodTableHead").innerHTML = "Name";
        document.getElementById("searchInput").value = global.getSelectedAccountForLog().name;
        loadSearchTableResults();
    });


}


export async function fetchLogs(startTime, endTime, actionType, limit, accountId) {
    const myCallId = util.isLoading("log-container", true);
    try {
        const res = await fetch(`${global.API_IP}/api/logs/fetchLog`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${global.getToken()}`
            },
            body: JSON.stringify({
                startTime,
                endTime,
                actionType,
                limit,
                accountId
            })
        });
        if (res.status === 401) {
            util.kick(); // token invalid or expired
            return null;
        }
        const data = await res.json();

        return data;

    } catch (err) {
        console.error('Error:', err);
        return null;
    } finally {
        util.isLoading("log-container", false, myCallId);
    }
}




window.loadLogResults = loadLogResults;