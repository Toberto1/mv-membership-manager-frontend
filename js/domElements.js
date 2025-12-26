import * as util from './utils.js';
import * as global from './globals.js';

const mainTitle = document.getElementById('main-title');
const editAccountContainer = document.getElementById("editAccount-container");
const noAccountSelected = document.getElementById("noAccountSelected");

export function createPersonalInfoFieldset(account) {
    const setID = account === null ? "add" : "edit";
    const accountName = account?.name || "";
    const accountEmail = account?.email || "";
    const accountPhoneNumber = account?.phone_number || "";

    const fieldSet = document.createElement("fieldset");
    fieldSet.classList.add("personal-info-fieldset", `tab-content-${setID}Account`, "originIsFlex");

    const legend = document.createElement("legend");
    legend.textContent = "Personal Info";
    fieldSet.appendChild(legend);

    function createField(labelText, inputType, inputId, placeholder, value) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("form-field");

        const label = document.createElement("label");
        label.textContent = labelText;

        const input = document.createElement("input");
        input.type = inputType;
        input.id = inputId;
        input.placeholder = placeholder;
        input.value = value;

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        return wrapper;
    }

    fieldSet.appendChild(createField("Name:", "text", `name-${setID}`, "Last, First", accountName));
    fieldSet.appendChild(createField("Email:", "text", `email-${setID}`, "example@domain.com", accountEmail));
    fieldSet.appendChild(createField("Phone Number:", "text", `phone-number-${setID}`, "xxx-xxx-xxxx", accountPhoneNumber));

    return fieldSet;
}


export function createNotesFieldset(account) {

    const setID = (account === null) ? "add" : "edit";
    const accountNotes = (account === null) ? "" : account.notes;

    const fieldSet = document.createElement("fieldset");
    fieldSet.classList.add("notes-fieldset", `tab-content-${setID}Account`, "originIsBlock");

    fieldSet.innerHTML = `<legend>Notes</legend>
    <textarea id="notes-${setID}" class="note-box" value = "${accountNotes}"placeholder="Add any additional notes here...">${accountNotes}</textarea>`;

    return fieldSet;
}

export function createMembershipFieldset(account) {
    const setID = (account === null) ? "add" : "edit";

    const fieldSet = document.createElement("fieldset");
    fieldSet.id = `membershipFieldset-${setID}`;
    fieldSet.classList.add("membership-fieldset", `tab-content-${setID}Account`, "originIsBlock");

    // Create legend and button manually
    const legend = document.createElement("legend");
    legend.textContent = "Memberships";

    const addBtn = document.createElement("input");
    addBtn.type = "button";
    addBtn.classList.add("action-btn");
    addBtn.value = " + ";
    addBtn.style.alignSelf = "start";
    addBtn.style.borderRadius = "20px";
    addBtn.style.fontSize = "20px";
    addBtn.id = "addMemberBtn";
    addBtn.addEventListener("click", () => addMembershipRow(setID)); // use setID or whatever context you need

    const renewBtn = document.createElement("input");
    renewBtn.classList.add("action-btn", "clear-btn", "hidden");

    if (account !== null) {
        renewBtn.type = "button";

        renewBtn.value = "Renew Expired";
        renewBtn.style.alignSelf = "start";
        renewBtn.style.marginLeft = "0.5rem";
        renewBtn.style.borderRadius = "20px";
        renewBtn.style.padding = "0.5rem 1rem";
        renewBtn.style.fontSize = "14px";
        renewBtn.id = "renewMemberBtn";

        for (const membership of account.memberships) {
            if (util.isExpired(membership.end_date)) {
                renewBtn.classList.remove("hidden");

                const membershipCopy = { ...membership };

                // Calculate new end date on the copy
                membershipCopy.end_date = util.calculateEndDate(util.getTodayString(), membershipCopy.base_length, membershipCopy.total_days_paused);
                membershipCopy.start_date = util.getTodayString();
                membershipCopy.renewedCopy = true;
                renewBtn.addEventListener("click", () => {
                    renewBtn.classList.add("hidden");
                    renewMembershipRow(setID, membershipCopy);
                });
                break;
            } else break;
        }
    }


    fieldSet.appendChild(legend);
    fieldSet.appendChild(addBtn);
    fieldSet.appendChild(renewBtn);

    if (account !== null && Array.isArray(account.memberships)) {
        for (const membership of account.memberships) {
            fieldSet.appendChild(membershipFormRow(membership));
        }
    }

    return fieldSet;
}

export function createSubmitFieldset(account) {
    const setID = (account === null) ? "add" : "edit";

    const fieldSet = document.createElement("fieldset");
    fieldSet.classList.add("submit-fieldset");

    const legend = document.createElement("legend");
    legend.textContent = "Submit Actions";

    const addBtn = document.createElement("input");
    addBtn.type = "button";
    addBtn.id = `${setID}-account-button`;
    addBtn.classList.add("action-btn");
    addBtn.value = (setID === "add") ? "Add" : "Save";
    addBtn.addEventListener("click", () => {
        if (setID === "add") {
            addNewMember();
        } else {
            saveEditedMember();
        }
    });

    fieldSet.appendChild(legend);
    fieldSet.appendChild(addBtn);

    if (setID === "add") {
        const clearBtn = document.createElement("input");
        clearBtn.type = "button";
        clearBtn.id = `${setID}-account-clear`;
        clearBtn.classList.add("action-btn", "clear-btn");
        clearBtn.value = "Clear All";
        clearBtn.addEventListener("click", () => {
            clearAddAccountTab();
            util.whiteFlash("addAccount-container");
        });
        fieldSet.appendChild(clearBtn);
    } else {
        const cancelBtn = document.createElement("input");
        cancelBtn.type = "button";
        cancelBtn.id = `${setID}-account-cancel`;
        cancelBtn.classList.add("action-btn", "cancel-btn");
        cancelBtn.value = "Cancel";
        cancelBtn.addEventListener("click", () => {
            global.setSelectedAccountForEdit(null);
            toggleEditTabButton();
            swapTab(global.tabIndexs.search);
            util.whiteFlash("editAccount-container");
        });
        fieldSet.appendChild(cancelBtn);
        //clearEditAccountTab();
    }

    const errorDiv = document.createElement("div");
    errorDiv.id = `${setID}Error`;
    errorDiv.classList.add("error-container");


    fieldSet.appendChild(errorDiv);

    return fieldSet;
}

export function createPassFieldset(account) {
    const fieldset = document.createElement('fieldset');
    fieldset.innerHTML = `<legend>Passes</legend>`;

    const setID = (account === null) ? "add" : "edit";

    fieldset.classList.add("passAmountFieldset", `tab-content-${setID}Account`, "originIsGrid");
    fieldset.id = `passFieldset-${setID}`;

    const grid = document.createElement('div');
    grid.classList.add("passAlterGrid");

    let passValues = ['', '', '', '', '']; // Each index represents a different type of pass
    if (account !== null) {
        passValues = [
            account.opengympasses,
            account.classpasses,
            account.privatekidpasses,
            account.privateadultpasses,
            account.aerialsilkspasses
        ];
    }

    grid.innerHTML = `
        <label class="sticker opengympasses-color">OpenGym</label>
        <input type="number" id="opengymPunches-${setID}" class="punch-input only-numbers" min="0" step="1" value="${passValues[0]}">
        <input type="button" class="action-btn" value="USE" onclick="adjustPunches('opengymPunches-${setID}', -1)">
        <input type="button" class="action-btn" value="+10" onclick="adjustPunches('opengymPunches-${setID}', 10)">
        <input type="button" class="action-btn" value="+20" onclick="adjustPunches('opengymPunches-${setID}', 20)">

        <label class="sticker classpasses-color">Classes</label>
        <input type="number" id="classesPunches-${setID}" class="punch-input only-numbers" min="0" step="1" value="${passValues[1]}">
        <input type="button" class="action-btn" value="USE" onclick="adjustPunches('classesPunches-${setID}', -1)">
        <input type="button" class="action-btn" value="+10" onclick="adjustPunches('classesPunches-${setID}', 10)">
        <input type="button" class="action-btn" value="+20" onclick="adjustPunches('classesPunches-${setID}', 20)">

        <label class="sticker privatekidpasses-color">Private Kids</label>
        <input type="number" id="privatekidsPunches-${setID}" class="punch-input only-numbers" min="0" step="1" value="${passValues[2]}">
        <input type="button" class="action-btn" value="USE" onclick="adjustPunches('privatekidsPunches-${setID}', -1)">
        <input type="button" class="action-btn" value="+5" onclick="adjustPunches('privatekidsPunches-${setID}', 5)">
        <div></div>

        <label class="sticker privateadultpasses-color">Private Adults</label>
        <input type="number" id="privateadultPunches-${setID}" class="punch-input only-numbers" min="0" step="1" value="${passValues[3]}">
        <input type="button" class="action-btn" value="USE" onclick="adjustPunches('privateadultPunches-${setID}', -1)">
        <input type="button" class="action-btn" value="+5" onclick="adjustPunches('privateadultPunches-${setID}', 5)">
        <div></div>

        <label class="sticker aerialsilkspasses-color">Aerial Silks</label>
        <input type="number" id="aerialsilksPunches-${setID}" class="punch-input only-numbers" min="0" step="1" value="${passValues[4]}">
        <input type="button" class="action-btn" value="USE" onclick="adjustPunches('aerialsilksPunches-${setID}', -1)">
        <input type="button" class="action-btn" value="+5" onclick="adjustPunches('aerialsilksPunches-${setID}', 5)">
        <input type="button" class="action-btn" value="+10" onclick="adjustPunches('aerialsilksPunches-${setID}', 10)">
    `;

    // Fade labels for 0 passes
    const labels = grid.querySelectorAll("label.sticker");
    labels.forEach((label, index) => {
        if (parseInt(passValues[index], 10) === 0 || passValues[index] === '') {
            label.style.opacity = "0.4"; // Faded look
        }
    });

    fieldset.appendChild(grid);
    return fieldset;
}


export function createEditAccountNavColumn() {
    const container = document.createElement("div");
    container.id = "editAccountNavColumn";
    container.classList.add("accountTabSelector-column", "tab-container");

    // Tab definitions
    const tabs = [
        { id: "personalInfoTab-edit", label: "Personal Information", checked: true },
        { id: "memberhsipsTab-edit", label: "Memberships" },
        { id: "passesTab-edit", label: "Passes" },
        { id: "notesTab-edit", label: "Notes" }
    ];

    tabs.forEach(tab => {
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "editAccountTabs";
        input.id = tab.id;
        if (tab.checked) input.checked = true;

        const label = document.createElement("label");
        label.setAttribute("for", tab.id);
        label.textContent = tab.label;

        container.appendChild(input);
        container.appendChild(label);
    });



    return container;
}



export function createUpComingClassBadge(classObj) {
    const badge = document.createElement("div");
    badge.classList.add("upcoming-class-badge");

    console.log("obj: ", classObj);
    const color = getClassColor(classObj.id);
    badge.style.backgroundColor = color;

    const timeDiv = document.createElement("div");
    timeDiv.classList.add("upcoming-class-time");

    const [hours, minutes, seconds] = classObj.time.split(":");
    const d = new Date();
    d.setHours(hours, minutes);
    timeDiv.textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    const infoDiv = document.createElement("div");
    infoDiv.classList.add("upcoming-class-info");

    const nameDiv = document.createElement("div");
    nameDiv.textContent = classObj.name.toUpperCase();
    nameDiv.style.fontWeight = "bold";
    infoDiv.appendChild(nameDiv);

    const ageDiv = document.createElement("div");
    ageDiv.textContent = classObj.age_group;
    infoDiv.appendChild(ageDiv);

    badge.appendChild(timeDiv);
    badge.appendChild(infoDiv);


    return badge;
}

export function createUpComingClassRow(classObjArray) {
    const row = document.createElement("div");
    row.classList.add("upcoming-class-row");

    classObjArray.forEach(classObj => {
        const badge = createUpComingClassBadge(classObj);
        row.appendChild(badge);
    });

    if (classObjArray.length === 0) {
        const noClassesMessage = document.createElement("div");
        noClassesMessage.classList.add("no-results");
        noClassesMessage.textContent = "No classes scheduled at this time.";
        row.appendChild(noClassesMessage);
    }

    return row;
}


export function createRenewedMembershipRow(membership) {
    // Always create a new "add" row
    const row = membershipFormRow(null, true);

    if (!membership) return row; // fallback to empty row

    // Fill in the fields manually
    const typeSelect = row.querySelector(`#membership-type-add-${row.id.split('-')[3]}`);
    const ageSelect = row.querySelector(`#ageGroupSelect-add-${row.id.split('-')[3]}`);
    const daysInput = row.querySelector(`#daysAdded-add-${row.id.split('-')[3]}`);
    const startInput = row.querySelector(`#startDate-add-${row.id.split('-')[3]}`);
    const endInput = row.querySelector(`#endDate-add-${row.id.split('-')[3]}`);

    // Prefill values from expired membership
    typeSelect.value = membership.type;
    typeSelect.classList.add(`${membership.type}-color`);
    if (["class", "athletic"].includes(membership.type)) ageSelect.disabled = false;

    ageSelect.value = membership.age_group === "NA" ? '' : membership.age_group;

    daysInput.value = membership.is_unlimited ? '' : membership.base_length;
    daysInput.placeholder = membership.is_unlimited ? '∞' : '';

    // Start today
    startInput.value = util.getTodayString();

    // Calculate end date based on base_length and total_days_paused
    endInput.value = util.calculateEndDate(startInput.value, membership.base_length, 0);

    return row;
}



export function membershipFormRow(membership, isRenewed = false) {

    const suffix = (membership === null) ? "add" : "edit";
    const membershipId = (membership === null) ? (-1) : membership.id;
    const totalDaysPaused = (membership === null) ? 0 : membership.total_days_paused;
    const isExpired = (membership === null) ? false : util.isExpired(membership.end_date);

    const row = document.createElement("div");
    const rowID = suffix + "-" + global.incramentMembershipCounter(suffix);
    row.id = `membership-row-${rowID}`;
    row.dataset.membershipId = membershipId;
    row.classList.add(`membership-row`);

    //Top row of widgets
    const topRow = document.createElement("div");
    topRow.classList.add("membership-widget-row");

    //Membership type
    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Type ";

    const selectType = document.createElement("select");
    selectType.id = `membership-type-${rowID}`;
    selectType.classList.add("custom-select");
    selectType.innerHTML = `
            <option value="">Select Type</option>
            <option value="open">Open Gym</option>
            <option value="class">Class</option>
            <option value="athletic">Athletic</option>`;

    selectType.addEventListener("change", () => {
        selectType.classList.remove(`open-color`);
        selectType.classList.remove(`class-color`);
        selectType.classList.remove(`athletic-color`);
        selectType.classList.add(`${selectType.value}-color`);
    });
    topRow.appendChild(selectType);

    //Membership age group
    const ageSelect = document.createElement("select");
    ageSelect.id = `ageGroupSelect-${rowID}`;
    ageSelect.disabled = true;
    ageSelect.classList.add("custom-select");

    const ageOptions = ["", "kid", "teen", "adult"];
    ageOptions.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = opt === "" ? "Select Age Group" : opt.charAt(0).toUpperCase() + opt.slice(1);
        ageSelect.appendChild(option);
    });
    topRow.appendChild(ageSelect);

    // Show/hide age group based on type
    selectType.addEventListener("change", () => {
        if (["class", "athletic"].includes(selectType.value)) {
            ageSelect.disabled = false;
        } else {
            ageSelect.disabled = true;
            ageSelect.value = '';
        }
    });

    //Membership start date
    const startLabel = document.createElement("label");
    startLabel.textContent = "Start Date ";
    const startInput = document.createElement("input");
    startInput.type = "date";
    startInput.id = `startDate-${rowID}`;
    startLabel.appendChild(startInput);
    topRow.appendChild(startLabel);

    startInput.addEventListener("input", () => {
        if (daysInput.value === '') endInput.value = '';
        else endInput.value = util.calculateEndDate(startInput.value, parseInt(daysInput.value), totalDaysPaused);
    });

    //Button to set start date to the current date
    const startDateTodayBtn = document.createElement("input");
    startDateTodayBtn.type = "button";
    startDateTodayBtn.classList.add("action-btn");
    startDateTodayBtn.value = "Today";

    startDateTodayBtn.addEventListener("click", () => {

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString().split('T')[0];
        startInput.value = today;
        if (daysInput.value === '') endInput.value = '';
        else endInput.value = util.calculateEndDate(startInput.value, parseInt(daysInput.value), totalDaysPaused);

    });
    topRow.appendChild(startDateTodayBtn);


    //Membership base lenth
    const daysLabel = document.createElement("label");
    daysLabel.textContent = "Days ";
    const daysInput = document.createElement("input");
    daysInput.type = "number";
    daysInput.min = "1";
    daysInput.id = `daysAdded-${rowID}`;
    daysInput.classList.add("only-numbers");
    daysLabel.appendChild(daysInput);
    topRow.appendChild(daysLabel);

    daysInput.addEventListener("input", () => {
        daysInput.value = daysInput.value.replace(/\D/g, '');

        if (daysInput.value === '') endInput.value = '';
        else endInput.value = util.calculateEndDate(startInput.value, parseInt(daysInput.value), totalDaysPaused);

    });

    //Membership end date
    const endLabel = document.createElement("label");
    endLabel.textContent = "End Date ";
    const endInput = document.createElement("input");
    endInput.type = "date";
    endInput.disabled = true;
    endInput.id = `endDate-${rowID}`;
    endLabel.appendChild(endInput);

    //Action buttons to quickly set base length
    const daysButtons = document.createElement("div");
    daysButtons.style.display = "flex";
    daysButtons.style.gap = "0.5rem";

    const presetDays = [30, 90, 180, 360, -1];
    presetDays.forEach(days => {
        const btn = document.createElement("input");
        btn.type = "button";
        btn.classList = "action-btn";
        btn.value = days === -1 ? "∞" : days;
        btn.onclick = () => {
            daysInput.value = days === -1 ? "" : days;
            daysInput.placeholder = days === -1 ? "∞" : "";

            //Calculate end date 
            if (days === -1) {
                endInput.value = "";
            } else
                endInput.value = util.calculateEndDate(startInput.value, parseInt(daysInput.value), totalDaysPaused);
        };
        daysButtons.appendChild(btn);
    });

    topRow.appendChild(daysButtons);
    topRow.appendChild(endLabel);

    //Bottom row of widgets
    const bottomRow = document.createElement("div");
    bottomRow.classList.add("membership-widget-row");

    //Membership pause checkbox
    const pauseWrapper = document.createElement("div");
    const pauseCheckbox = document.createElement("input");
    pauseCheckbox.type = "checkbox";
    pauseCheckbox.id = `pause-${rowID}`;
    pauseCheckbox.name = "pauseCheck";
    pauseCheckbox.value = "pause";

    const pauseLabel = document.createElement("label");
    pauseLabel.htmlFor = pauseCheckbox.id;
    pauseLabel.classList.add("checkbox-label", "checkboxToggle", "pause-btn-color");
    pauseLabel.textContent = "Pause";

    const closeCheckbox = document.createElement("input");

    pauseCheckbox.addEventListener("change", () => {
        if (pauseCheckbox.checked) {
            pauseLabel.textContent = "Resume";
            row.style.opacity = 0.8;
            selectType.disabled = true;
            ageSelect.disabled = true;
            startInput.disabled = true;
            daysInput.disabled = true;
            row.querySelectorAll('.action-btn').forEach(button => {
                button.disabled = true;
            });
        }
        else if (!closeCheckbox.checked) {
            pauseLabel.textContent = "Pause";
            row.style.opacity = 1.0;
            selectType.disabled = false;
            ageSelect.disabled = false;
            startInput.disabled = false;
            daysInput.disabled = false;
            row.querySelectorAll('.action-btn').forEach(button => {
                button.disabled = false;
            });
        }
    });

    pauseWrapper.appendChild(pauseCheckbox);
    pauseWrapper.appendChild(pauseLabel);
    bottomRow.appendChild(pauseWrapper);

    if (totalDaysPaused > 0) {
        const totalDaysPausedLabel = document.createElement("label");
        totalDaysPausedLabel.textContent = "Total Days Paused: " + totalDaysPaused;
        bottomRow.appendChild(totalDaysPausedLabel);
    }

    //set values of the membership if its from an account
    if (membership !== null) {

        //Membership pause checkbox
        const closeWrapper = document.createElement("div");

        closeCheckbox.type = "checkbox";
        closeCheckbox.id = `closed-${rowID}`;
        closeCheckbox.name = "pauseCheck";
        closeCheckbox.value = "pause";

        const closeLabel = document.createElement("label");
        closeLabel.htmlFor = closeCheckbox.id;
        closeLabel.classList.add("checkbox-label", "checkboxToggle", "close-btn-color");
        closeLabel.textContent = "Close";

        closeCheckbox.addEventListener("change", () => {
            if (closeCheckbox.checked) {
                closeLabel.textContent = "CLOSED";
                row.style.opacity = 0.8;
                selectType.disabled = true;
                ageSelect.disabled = true;
                startInput.disabled = true;
                daysInput.disabled = true;
                row.querySelectorAll('.action-btn').forEach(button => {
                    button.disabled = true;
                });
            }
            else if (!pauseCheckbox.checked) {
                closeLabel.textContent = "Close";
                row.style.opacity = 1.0;
                selectType.disabled = false;
                ageSelect.disabled = false;
                startInput.disabled = false;
                daysInput.disabled = false;
                row.querySelectorAll('.action-btn').forEach(button => {
                    button.disabled = false;
                });
            }
        });

        closeWrapper.appendChild(closeCheckbox);
        closeWrapper.appendChild(closeLabel);
        bottomRow.appendChild(closeWrapper);

        selectType.value = membership.type;
        ageSelect.value = membership.age_group === "NA" ? '' : membership.age_group;
        startInput.value = util.getDateOnly(membership.start_date);

        daysInput.value = (membership.is_unlimited) ? '' : membership.base_length;
        daysInput.placeholder = (membership.is_unlimited) ? '∞' : '';

        endInput.value = util.getDateOnly(util.calculateEndDate(membership.start_date, membership.base_length, membership.total_days_paused));
        pauseCheckbox.checked = (membership.is_paused);

        selectType.classList.add(`${selectType.value}-color`);

        if (["class", "athletic"].includes(selectType.value)) ageSelect.disabled = false;

        if (isExpired) {
            closeLabel.textContent = "EXPIRED";
            closeLabel.classList.add("expired-color");
            closeCheckbox.disabled = true;
            pauseCheckbox.disabled = true;
            row.style.opacity = 0.4;
            selectType.disabled = true;
            ageSelect.disabled = true;
            startInput.disabled = true;
            daysInput.disabled = true;
            topRow.querySelectorAll('.action-btn').forEach(button => {
                button.disabled = true;
            });
            const options = { year: "numeric", month: "short", day: "numeric" };
            const daysLeftTxt = document.createElement("p");
            daysLeftTxt.style.marginLeft = '0.5em';
            daysLeftTxt.style.fontStyle = 'italic';
            daysLeftTxt.style.padding = '6px 0';
            daysLeftTxt.textContent = 'Expired' + ` on ${new Date(membership.end_date).toLocaleDateString("en-US", options)}`;
            bottomRow.appendChild(daysLeftTxt);
        }

        if (pauseCheckbox.checked) pauseLabel.textContent = "Resume";

        if (pauseCheckbox.checked) {
            pauseLabel.textContent = "Resume";
            row.style.opacity = 0.8;
            selectType.disabled = true;
            ageSelect.disabled = true;
            startInput.disabled = true;
            daysInput.disabled = true;
            topRow.querySelectorAll('.action-btn').forEach(button => {
                button.disabled = true;
            });
        }
        closeCheckbox.checked = (membership.is_closed);
        if (membership.is_closed) {
            closeLabel.textContent = "CLOSED";
            closeCheckbox.disabled = true;
            pauseCheckbox.disabled = true;
            row.style.opacity = 0.4;
            selectType.disabled = true;
            ageSelect.disabled = true;
            startInput.disabled = true;
            daysInput.disabled = true;
            topRow.querySelectorAll('.action-btn').forEach(button => {
                button.disabled = true;
            });
        }

    } else {

        // --- Delete Button ---
        const deleteButton = document.createElement("input");
        deleteButton.type = "button";
        deleteButton.classList = "action-btn cancel-btn";
        deleteButton.value = "Delete";
        deleteButton.onclick = () => {
            util.whiteFlash(row.parentElement.id);
            row.remove();
            if (isRenewed) {
                document.getElementById("renewMemberBtn").classList.remove("hidden");
            }

        }
        bottomRow.appendChild(deleteButton);
    }

    row.appendChild(topRow);
    row.appendChild(bottomRow);


    return row;
}

export function updateMainTitle(tabIndex, options = {}) {
    const titles = [
        'Search',
        'Add Account',
        'Edit Account',
        'Daily Check-Ins',
        'Log History',
        'Settings'
    ];
    if (options.custom) {
        mainTitle.innerHTML = tabIndex;
    } else {
        mainTitle.innerHTML = String(titles[tabIndex] || '');
    }
}

export async function swapTab(tabIndex) {
    const tabContainers = document.querySelectorAll('.tab-content');
    tabContainers.forEach((tab, index) => {
        tab.classList.toggle('active', index === tabIndex);
    });

    const tabs = document.querySelectorAll('input[name="tabs"]');
    tabs.forEach((tab, index) => {
        tab.checked = index === tabIndex;
    });

    document.getElementById("upcomingCheckinsTabButton")?.classList.add("hidden");

    //Initiallize tabs
    switch (tabIndex) {

        case global.tabIndexs.search: //Search 
            util.whiteFlash("searchAccount-container");
            break;

        case global.tabIndexs.addAccount:
            util.whiteFlash("addAccount-container");
            break;

        case global.tabIndexs.editAccount:
            initEditTab();
            util.whiteFlash("editAccount-container");
            break;

        case global.tabIndexs.logHistory:
            util.whiteFlash("log-container");
            break;

        case global.tabIndexs.dailyCheckins:
            util.whiteFlash("dailyCheckins-container");
            break;

    }

    updateMainTitle(tabIndex);
}

function createUpcomingClassList(ageGroup, classArray) {

}




function initEditTab() {

    // Remove all the children but the first popup
    while (editAccountContainer.children.length > 2) {
        editAccountContainer.removeChild(editAccountContainer.lastChild);
    }

    const account = global.getSelectedAccountForEdit();
    const nav = document.getElementById("editAccountNavColumn");

    if (account === null) {
        noAccountSelected.classList.remove("hidden");
        nav.classList.add("hidden");
        return;
    }
    noAccountSelected.classList.add("hidden");
    nav.classList.remove("hidden");

    nav.removeChild(nav.lastChild);
    nav.appendChild(createSubmitFieldset(account));

    editAccountContainer.appendChild(createPersonalInfoFieldset(account));
    editAccountContainer.appendChild(createMembershipFieldset(account));
    editAccountContainer.appendChild(createPassFieldset(account));
    editAccountContainer.appendChild(createNotesFieldset(account));

    const firstRadio = nav.querySelector('input[type="radio"]');
    if (firstRadio) {
        firstRadio.checked = true;
        firstRadio.dispatchEvent(new Event('change'));
    }
}

export function toggleLogFilterRow(force) {
    const logFilterToggleBtn = document.getElementById("filter-log-toggle-btn");
    util.whiteFlash("log-filter-row");

    // Detect if 'force' is an event object, skip the block if so
    if (force instanceof Event) {
        // Called by event listener — treat as no argument passed
        util.toggleElement("log-filter-row");
        logFilterToggleBtn.value = (document.getElementById("log-filter-row").classList.contains('hidden')) ? "Filter ▼" : "Filter ▲";
        return;
    }

    // Now handle force as a boolean flag if defined
    if (typeof force !== 'undefined') {
        if (force) {
            document.getElementById("log-filter-row").classList.remove("hidden");
            logFilterToggleBtn.value = "Filter ▲";
        } else {
            document.getElementById("log-filter-row").classList.add("hidden");
            logFilterToggleBtn.value = "Filter ▼";
        }
        return;
    }

    // Fallback in case force is undefined
    util.toggleElement("log-filter-row");
    logFilterToggleBtn.value = (document.getElementById("log-filter-row").classList.contains('hidden')) ? "Filter ▼" : "Filter ▲";
}

export function toggleEditTabButton() {
    const inputId = "editAccountTabButton";
    const label = document.querySelector(`label[for="${inputId}"]`);
    if (global.getSelectedAccountForEdit() === null) {
        label.classList.add("hidden");
    } else {
        label.classList.remove("hidden");
        label.textContent = `Editting: ${global.getSelectedAccountForEdit().name}`; // <-- change inner text
    }
}

export function getClassColor(index) {
    const colors = ["#f9c74f", "#77b845ff", "#f3722c", "#f9844a", "#577590", "#43aa8b", "#277da1"];
    return colors[index % colors.length];
}

/* Responsive design adjustments */

document.getElementById("filter-hamburger").addEventListener("click", () => {
    document.getElementById("search-filterButtons").style.display = (document.getElementById("search-filterButtons").style.display === "flex") ? "none" : "flex";
    util.whiteFlash("search-filterButtons");

    const hamburgerButton = document.getElementById("filter-hamburger");
    if (document.getElementById("search-filterButtons").style.display !== "none") {
        hamburgerButton.style.background = "#222";
        hamburgerButton.style.color = "white";
    } else {
        hamburgerButton.style.background = "";
        hamburgerButton.style.color = "";
    }
});

document.getElementById("right-tab-arrow").addEventListener("click", () => {
  const current = global.getTabIndex();
  swapTab(global.getNextVisibleIndex(current, +1));
  util.whiteFlash("main-tab-container");
});

document.getElementById("left-tab-arrow").addEventListener("click", () => {
  const current = global.getTabIndex();
  swapTab(global.getNextVisibleIndex(current, -1));
  util.whiteFlash("main-tab-container");
});

export function toggleDarkmode(bool) {
    if (bool) document.documentElement.classList.add("darkmode");
    else document.documentElement.classList.remove("darkmode");
};