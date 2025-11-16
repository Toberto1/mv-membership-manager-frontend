import * as util from './utils.js';
import * as dom from './domElements.js';
import * as global from './globals.js';

export function initFields() {
    document.querySelectorAll('input[name="editAccountTabs"]').forEach((radio, radioIndex) => {
        radio.addEventListener('change', () => {
            const tabContainers = document.querySelectorAll('.tab-content-editAccount');
            tabContainers.forEach((tab, tabIndex) => {
                tab.classList.toggle('active', tabIndex === radioIndex);
            });
        });
    });
}

window.saveEditedMember = async function () {

    document.querySelectorAll('input, select').forEach((element) => {
        element.classList.remove("missing");
    });

    // Get values
    const name = document.getElementById("name-edit")?.value.trim() || '';
    const email = document.getElementById("email-edit")?.value.trim() || '';
    const phone_number = document.getElementById("phone-number-edit")?.value.trim() || '';
    const notes = document.getElementById("notes-edit")?.value.trim() || '';
    const openGym = parseInt(document.getElementById("opengymPunches-edit")?.value) || 0;
    const classes = parseInt(document.getElementById("classesPunches-edit")?.value) || 0;
    const privateKids = parseInt(document.getElementById("privatekidsPunches-edit")?.value) || 0;
    const privateAdults = parseInt(document.getElementById("privateadultPunches-edit")?.value) || 0;
    const aerialSilks = parseInt(document.getElementById("aerialsilksPunches-edit")?.value) || 0;
    const addAccountButton = document.getElementById("edit-account-button");
    const AccountId = global.getselectedAccountForEdit().id;


    //Validity checks 
    if (!name) {
        util.showTopHeaderDialog('Name cannot be empty.', { error: true });
        util.inputMissing('name-edit');
        return;
    }
    // if (!email && !phone_number) {
    //     util.showTopHeaderDialog('Email And phone number cannot both be empty.',{error : true});
    //     util.inputMissing('email-edit');
    //     util.inputMissing('phone-number-edit');
    //     return;
    // }
    if (openGym < 0 || classes < 0 || privateKids < 0 || privateAdults < 0 || aerialSilks < 0) {
        util.showTopHeaderDialog('Pass counts cannot be negative.', { error: true });
        return;
    }

    const rows = Array.from(document.getElementById("editAccount-container").getElementsByClassName("membership-row"));
    for (let row of rows) {
        let i = parseInt(row.id.split('-')[3]); //Get dom id 
        let suffix = row.id.split('-')[2];
        let type = document.getElementById(`membership-type-${suffix}-${i}`).value;
        let startDate = document.getElementById(`startDate-${suffix}-${i}`).value;
        let endDate = document.getElementById(`endDate-${suffix}-${i}`).value;
        let addedDays = document.getElementById(`daysAdded-${suffix}-${i}`);
        let ageGroup = document.getElementById(`ageGroupSelect-${suffix}-${i}`).value;

        if (type === '') {
            util.showTopHeaderDialog('Please select a membership type.', { error: true });
            util.inputMissing(`membership-type-${suffix}-${i}`);
            return;
        }
        if ((type === 'class' || type === 'athletic') && ageGroup === '' && !util.isExpired(endDate)) {
            util.showTopHeaderDialog('Age group is required for Classes or Athletic memberships.', { error: true });
            util.inputMissing(`ageGroupSelect-${suffix}-${i}`);
            return;
        }
        if (type === 'open') ageGroup = 'NA';
        if (startDate && isNaN(new Date(startDate).getTime())) {
            util.showTopHeaderDialog('Invalid Start Date. Use YYYY-MM-DD.', { error: true });
            util.inputMissing(`startDate-${suffix}-${i}`);
            return;
        }
        // if (startDate === '') {
        //     showTopHeaderDialog('Start date is required for memberships.', { error: true });
        //     util.inputMissing(`startDate-${suffix}-${i}`);
        //     return;
        // }
        if ((addedDays.value === '' || parseInt(addedDays.value) <= 0) && addedDays.placeholder !== '∞') {
            util.showTopHeaderDialog('Day duration is required for memberships.', { error: true });
            util.inputMissing(`daysAdded-${suffix}-${i}`);
            return;
        }
    }

    // ---------- SEND REQUEST ----------
    addAccountButton.disabled = true;
    addAccountButton.style.opacity = '0.6';

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
        // Step 1: Create Account
        const userRes = await fetch(`${global.API_IP}/api/users/editUser`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${global.getToken()}` },

            body: JSON.stringify({
                id: AccountId,
                name: name,
                email: email,
                phone_number: phone_number,
                password: "",
                notes: notes,
                opengympasses: openGym,
                classpasses: classes,
                privatekidpasses: privateKids,
                privateadultpasses: privateAdults,
                aerialsilkspasses: aerialSilks
            }),
            signal: controller.signal
        });

        const userData = await userRes.json();
        if (!userRes.ok) throw new Error(userData.error || 'Signup failed');


        for (let row of rows) {

            let i = parseInt(row.id.split('-')[3]);
            let suffix = row.id.split('-')[2];

            let type = document.getElementById(`membership-type-${suffix}-${i}`).value;
            let startDate = document.getElementById(`startDate-${suffix}-${i}`).value;
            let addedDays = document.getElementById(`daysAdded-${suffix}-${i}`);
            let ageGroup = document.getElementById(`ageGroupSelect-${suffix}-${i}`).value;
            let endDate = document.getElementById(`endDate-${suffix}-${i}`).value;
            let isUnlimited = (addedDays.placeholder === '∞');
            let isPaused = document.getElementById(`pause-${suffix}-${i}`).checked;
            let isClosed = (suffix === "edit") ? document.getElementById(`closed-${suffix}-${i}`).checked : false;


            if (row.dataset.membershipId == -1) { //New membership not previously held

                // Step 2: Create membership (if applicable)
                if (type) {

                    const membershipPayload = {
                        userId: AccountId,
                        type: type,
                        start_date: startDate,
                        end_date: isUnlimited ? null : endDate,
                        base_length: parseInt(addedDays.value),
                        is_unlimited: isUnlimited,
                        age_group: ageGroup === '' ? 'NA' : ageGroup,
                        is_paused: isPaused,
                        is_closed: false
                    };

                    const membershipRes = await fetch(`${global.API_IP}/api/memberships/addMembership`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${global.getToken()}` },
                        body: JSON.stringify(membershipPayload),
                        signal: controller.signal
                    });

                    const membershipData = await membershipRes.json();

                    if (!membershipRes.ok) throw new Error(membershipData.error || 'Membership creation failed');
                }
            } else {
                // Step 2: Create membership (if applicable)
                if (type) {

                    const membershipPayload = {
                        membershipId: row.dataset.membershipId,
                        type: type,
                        start_date: startDate,
                        end_date: isUnlimited ? null : endDate,
                        base_length: parseInt(addedDays.value),
                        is_unlimited: isUnlimited,
                        age_group: ageGroup === '' ? 'NA' : ageGroup,
                        is_paused: isPaused,
                        is_closed: isClosed
                    };

                    const membershipRes = await fetch(`${global.API_IP}/api/memberships/editMembership`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${global.getToken()}` },
                        body: JSON.stringify(membershipPayload),
                        signal: controller.signal
                    });

                    const membershipData = await membershipRes.json();

                    if (!membershipRes.ok) throw new Error(membershipData.error || 'Membership update failed');
                }
            }
        }

        clearTimeout(timeout);
        util.showTopHeaderDialog("Account updated successfully", { success: true, autoClose: true, duration: 3000 });
        global.setSelectedAccountForEdit(null);
        dom.toggleEditTabButton();
        dom.swapTab(global.tabIndexs.editAccount);
        util.whiteFlash("editAccount-container");
        window.loadSearchTableResults();
        window.loadDailyCheckins(util.getTodayString());
        dom.swapTab(global.tabIndexs.search);
        
    } catch (error) {
        util.showTopHeaderDialog(error, { error: true });
        throw (error);
    } finally {
        addAccountButton.disabled = false;
        addAccountButton.style.opacity = '1';
    }
}