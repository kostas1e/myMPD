"use strict";

let currentTab;
let bgColor;

function checkInit() {
    if (settings.init === true) {
        return;
    }

    
    getServerinfo();
    elGetById('modalIdeonSetupWebserverIP').textContent = elGetById('modalAboutWebserverIP').textContent;
    
    elGetById('selectTheme1').innerHTML = elGetById('modalSettingsThemeInput').innerHTML;
    elGetById('selectTheme1').value = settings.webuiSettings.theme;

    // TODO set bgcolor
    
    elGetById('selectTheme1').addEventListener('change', function (event) {
        //theme
        let value = getSelectValue(event.target);
        if (value === 'auto') {
            value = window.matchMedia &&
                window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        document.querySelector('html').setAttribute('data-bs-theme', value);

        //background color
        if (value === 'light') {
            bgColor = '#ffffff';
        }
        else if (value === 'dark') {
            bgColor = '#060708';
        }
        document.documentElement.style.setProperty('--mympd-backgroundcolor', bgColor);
    }, false);

    elGetById('selectNsType1').addEventListener('change', function () {
        const value = this.options[this.selectedIndex].value;
        
        if (value === '0') {
            elGetById('nsServerShare1').classList.add('hide');
            elGetById('sambaVersion1').classList.add('hide');
            elGetById('nsCredentials1').classList.add('hide');
            elGetById('inputNsServer1').value = '';
            elGetById('inputNsShare1').value = '';
            elGetById('inputNsUsername1').value = '';
            elGetById('inputNsPassword1').value = '';
        }
        else if (value === '2') {
            elGetById('nsServerShare1').classList.remove('hide');
            elGetById('sambaVersion1').classList.remove('hide');
            elGetById('nsCredentials1').classList.remove('hide');
        }
        else {
            elGetById('nsServerShare1').classList.remove('hide');
            if (value === '1') {
                elGetById('sambaVersion1').classList.remove('hide');
            }
            else {
                elGetById('sambaVersion1').classList.add('hide');
            }
            elGetById('nsCredentials1').classList.add('hide');
            elGetById('inputNsUsername1').value = '';
            elGetById('inputNsPassword1').value = '';
        }
    }, false);

    elGetById('btnDropdownServers1').parentNode.addEventListener('show.bs.dropdown', function () {
        sendAPI("MYMPD_API_IDEON_NS_SERVER_LIST", {}, parseListServers, true);
    }, false);

    elGetById('dropdownServers1').addEventListener('click', function (event) {
        event.preventDefault();
        const target = event.target.nodeName === 'A'
            ? event.target
            : event.target.parentNode;
        if (target.nodeName === 'A') {
            elGetById('inputNsServer1').value = getData(target, 'value');
            uiElements.dropdownServers1.hide();
        }
    });

    currentTab = 0;
    showTab(currentTab);
    uiElements.modalIdeonSetup.show();
}

function showTab(n) {
    const x = document.querySelectorAll(".tab");
    x[n].style.display = "block";
    if (n == 0) {
        elGetById("prevBtn").style.display = "none";
    } else {
        elGetById("prevBtn").style.display = "inline";
    }
    if (n == (x.length - 1)) {
        elGetById("nextBtn").innerHTML = "Submit";
    } else {
        elGetById("nextBtn").innerHTML = "Next";
    }
}

function nextPrev(n) {
    const x = document.getElementsByClassName("tab");
    if (n == 1 && currentTab == 1 && !validateForm()) {
        return;
    }
    x[currentTab].style.display = "none";
    currentTab = currentTab + n;
    if (currentTab >= x.length) {
        saveIdeonSettingsInit();
        return;
    }
    showTab(currentTab);
}

function validateForm() {
    let formOK = true;

    const selectNsType = elGetById('selectNsType1');
    const selectNsTypeValue = selectNsType.options[selectNsType.selectedIndex].value;
    const inputNsServer = elGetById('inputNsServer1');
    const inputNsShare = elGetById('inputNsShare1');
    const inputNsUsername = elGetById('inputNsUsername1');
    const inputNsPassword = elGetById('inputNsPassword1');

    if (selectNsTypeValue !== '0') {
        if (!validateIPAddressEl(inputNsServer)) {
            formOK = false;
        }
        if (!validatePath(inputNsShare)) {
            formOK = false;
        }
    }
    if (selectNsTypeValue === '2') {
        if (!validateNotBlank(inputNsUsername) || !validateNotBlank(inputNsPassword)) {
            formOK = false;
        }
    }

    return formOK;
}

function saveIdeonSettingsInit() {
    const selectTheme = elGetById('selectTheme1');
    const selectNsType = elGetById('selectNsType1');
    const selectSambaVersion = elGetById('selectSambaVersion1');
    sendAPI("MYMPD_API_SETTINGS_SET", {
        "webuiSettings": {
            "theme": selectTheme.options[selectTheme.selectedIndex].value,
            "bgColor": bgColor
        },
        "nsType": parseInt(selectNsType.options[selectNsType.selectedIndex].value),
        "nsServer": elGetById('inputNsServer1').value,
        "nsShare": elGetById('inputNsShare1').value,
        "sambaVersion": selectSambaVersion.options[selectSambaVersion.selectedIndex].value,
        "nsUsername": elGetById('inputNsUsername1').value,
        "nsPassword": elGetById('inputNsPassword1').value,
        "init": true
    }, getSettings, true);
    // TODO add spinner
    uiElements.modalIdeonSetup.hide();
}
