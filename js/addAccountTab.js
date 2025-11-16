import * as util from './utils.js';
import * as dom from './domElements.js';
import * as global from './globals.js';

export function initFields() {

    const addAccountContainer = document.getElementById("addAccount-container");
    addAccountContainer.appendChild(dom.createPersonalInfoFieldset(null));
    addAccountContainer.appendChild(dom.createMembershipFieldset(null));
    addAccountContainer.appendChild(dom.createPassFieldset(null));
    addAccountContainer.appendChild(dom.createNotesFieldset(null));
    document.getElementById("addAccountNavColumn").appendChild(dom.createSubmitFieldset(null));

    document.querySelectorAll('input[name="addAccountTabs"]').forEach((radio, radioIndex) => {
        radio.addEventListener('change', () => {
            const tabContainers = document.querySelectorAll('.tab-content-addAccount');
            tabContainers.forEach((tab, tabIndex) => {
                tab.classList.toggle('active', tabIndex === radioIndex);
            });
        });
    });

    const addAccountTabChecked = document.querySelector('input[name="addAccountTabs"]:checked');
    if (addAccountTabChecked) addAccountTabChecked.dispatchEvent(new Event('change'));

}

window.addNewMember = async function () {

    document.querySelectorAll('input, select').forEach((element) => {
        element.classList.remove("missing");
    });

    // Get values
    const name = document.getElementById("name-add")?.value.trim() || '';
    const email = document.getElementById("email-add")?.value.trim() || '';
    const phone_number = document.getElementById("phone-number-add")?.value.trim() || '';
    const notes = document.getElementById("notes-add")?.value.trim() || '';
    const openGym = parseInt(document.getElementById("opengymPunches-add")?.value) || 0;
    const classes = parseInt(document.getElementById("classesPunches-add")?.value) || 0;
    const privateKids = parseInt(document.getElementById("privatekidsPunches-add")?.value) || 0;
    const privateAdults = parseInt(document.getElementById("privateadultPunches-add")?.value) || 0;
    const aerialSilks = parseInt(document.getElementById("aerialsilksPunches-add")?.value) || 0;
    const addAccountButton = document.getElementById("add-account-button");

    //Validity checks 
    if (!name) {
        util.showTopHeaderDialog('Name cannot be empty.', { error: true });
        util.inputMissing('name-add');
        return;
    }
    // if (!email && !phone_number) {
    //     showTopHeaderDialog('Email And phone number cannot both be empty.', { error: true });
    //     util.inputMissing('email-add');
    //     util.inputMissing('phone-number-add');
    //     return;
    // }
    if (openGym < 0 || classes < 0 || privateKids < 0 || privateAdults < 0 || aerialSilks < 0) {
        util.showTopHeaderDialog('Pass counts cannot be negative.', { error: true });
        return;
    }

    const rows = Array.from(document.getElementById("addAccount-container").getElementsByClassName("membership-row"));
    for (let row of rows) {
        let i = parseInt(row.id.split('-')[3]);
        let type = document.getElementById(`membership-type-add-${i}`).value;
        let startDate = document.getElementById(`startDate-add-${i}`).value;
        let addedDays = document.getElementById(`daysAdded-add-${i}`);
        let ageGroup = document.getElementById(`ageGroupSelect-add-${i}`).value;

        if (type === '') {
            util.showTopHeaderDialog('Please select a membership type.', { error: true });
            util.inputMissing(`membership-type-add-${i}`);
            return;
        }
        if ((type === 'class' || type === 'athletic') && ageGroup === '') {
            util.showTopHeaderDialog('Age group is required for Classes or Athletic memberships.', { error: true });
            util.inputMissing(`ageGroupSelect-add-${i}`);
            return;
        }
        if (type === 'open') ageGroup = 'NA';
        if (startDate && isNaN(new Date(startDate).getTime())) {
            util.showTopHeaderDialog('Invalid Start Date. Use YYYY-MM-DD.', { error: true });
            util.inputMissing(`startDate-add-${i}`);
            return;
        }
        // if (startDate === '') {
        //     util.showTopHeaderDialog('Start date is required for memberships.', { error: true });
        //     util.inputMissing(`startDate-add-${i}`);
        //     return;
        // }
        if ((addedDays.value === '' || parseInt(addedDays.value) <= 0) && addedDays.placeholder !== '∞') {
            util.showTopHeaderDialog('Day duration is required for memberships.', { error: true });
            util.inputMissing(`daysAdded-add-${i}`);
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
        const userRes = await fetch(`${global.API_IP}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${global.getToken()}` },
            body: JSON.stringify({
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

        //Get new user ID after account creation
        const userId = userData.user?.id;

        for (let row of rows) {
            let i = parseInt(row.id.split('-')[3]);
            let type = document.getElementById(`membership-type-add-${i}`).value;
            let startDate = document.getElementById(`startDate-add-${i}`).value;
            let addedDays = document.getElementById(`daysAdded-add-${i}`);
            let ageGroup = document.getElementById(`ageGroupSelect-add-${i}`).value;
            let endDate = document.getElementById(`endDate-add-${i}`).value;
            let isUnlimited = (addedDays.placeholder === '∞');
            let isPaused = document.getElementById(`pause-add-${i}`).checked;

            // Step 2: Create membership (if applicable)
            if (type) {

                const membershipPayload = {
                    userId: userId,
                    type: type,
                    start_date: startDate,
                    end_date: isUnlimited ? null : endDate,
                    base_length: parseInt(addedDays.value),
                    is_unlimited: isUnlimited,
                    age_group: ageGroup === '' ? 'NA' : ageGroup,
                    is_paused: isPaused
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
        }

        clearTimeout(timeout);
        util.showTopHeaderDialog("Account added successfully", { success: true, autoClose: true, duration: 3000 });
        util.clearAddAccountTab();
        util.whiteFlash("addAccount-container");

        dom.swapTab(global.tabIndexs.search);

        global.setSearchMethod("name");
        document.getElementById("searchMethodSelect").value = "name";
        document.getElementById("searchMethodTableHead").innerHTML = "Name";
        document.getElementById("searchInput").value = name;

        window.loadSearchTableResults();
        window.loadDailyCheckins(util.getTodayString());
        dom.swapTab(global.tabIndexs.search);

    } catch (error) {
        util.showTopHeaderDialog(error, { error: true });
    } finally {
        addAccountButton.disabled = false;
        addAccountButton.style.opacity = '1';
    }
}