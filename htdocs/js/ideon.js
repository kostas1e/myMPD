"use strict";

function initModalIdeonSettings() {
    elGetById('modalIdeonSettings').addEventListener('shown.bs.modal', function () {
        // TODO pass callback to parse only ideon settings
        getSettings();
        removeIsInvalid(elGetById('modalIdeonSettings'));
    });

    // elGetById('modalIdeonSettings').addEventListener('keydown', function (event) {
    //     if (event.key === 'Enter') {
    //         saveIdeonSettings();
    //         event.stopPropagation();
    //         event.preventDefault();
    //     }
    // });

    elGetById('selectNsType').addEventListener('change', function () {
        const value = this.options[this.selectedIndex].value;
        if (value === '0') {
            elGetById('nsServerShare').classList.add('hide');
            elGetById('sambaVersion').classList.add('hide');
            elGetById('nsCredentials').classList.add('hide');
            elGetById('inputNsServer').value = '';
            elGetById('inputNsShare').value = '';
            elGetById('inputNsUsername').value = '';
            elGetById('inputNsPassword').value = '';
        }
        else if (value === '2') {
            elGetById('nsServerShare').classList.remove('hide');
            elGetById('sambaVersion').classList.remove('hide');
            elGetById('nsCredentials').classList.remove('hide');
        }
        else {
            elGetById('nsServerShare').classList.remove('hide');
            if (value === '1') {
                elGetById('sambaVersion').classList.remove('hide');
            }
            else {
                elGetById('sambaVersion').classList.add('hide');
            }
            elGetById('nsCredentials').classList.add('hide');
            elGetById('inputNsUsername').value = '';
            elGetById('inputNsPassword').value = '';
        }
    }, false);

    elGetById('btnDropdownServers').parentNode.addEventListener('show.bs.dropdown', function () {
        sendAPI("MYMPD_API_IDEON_NS_SERVER_LIST", {}, parseListServers, true);
    }, false);

    elGetById('dropdownServers').addEventListener('click', function (event) {
        event.preventDefault();
        const target = event.target.nodeName === 'A'
            ? event.target
            : event.target.parentNode;
        if (target.nodeName === 'A') {
            elGetById('inputNsServer').value = getData(target, 'value');
            uiElements.dropdownServers.hide();
        }
    }, false);
}

/**
 * Parses the MYMPD_API_IDEON_NS_SERVER_LIST response
 * @param {object} obj jsonrpc response object
 * @returns {void}
 */
function parseListServers(obj) {
    const serverDropdownId = document.querySelectorAll('#modalIdeonSetup.show').length > 0 ? 'dropdownServers1' : 'dropdownServers';
    const serverDropdown = elGetById(serverDropdownId);
    elClear(serverDropdown);

    if (obj.error) {
        serverDropdown.appendChild(
            elCreateTextTn('div', {"class": ["list-group-item", "alert", "alert-danger"]}, obj.error.message, obj.error.data)
        );
        return;
    }
    if (obj.result.returnedEntities === 0) {
        serverDropdown.appendChild(
            elCreateTextTn('div', {"class": ["list-group-item", "alert", "alert-secondary"]}, 'Empty list')
        );
        return;
    }

    for (let i = 0; i < obj.result.returnedEntities; i++) {
        const a = elCreateNodes('a', {"href": "#", "class": ["list-group-item", "list-group-item-action"]}, [
            elCreateText('span', {}, obj.result.data[i].ipAddress),
            elCreateEmpty('br', {}),
            elCreateText('small', {}, obj.result.data[i].name)
        ]);
        setData(a, 'value', obj.result.data[i].ipAddress);
        serverDropdown.appendChild(a);
    }
}

function checkUpdate() {
    sendAPI("MYMPD_API_IDEON_UPDATE_CHECK", {}, parseUpdateCheck, false);

    btnWaiting(elGetById('btnCheckUpdate'), true);
}

function parseUpdateCheck(obj) {
    elGetById('currentVersion').innerText = obj.result.currentVersion;
    elGetById('latestVersion').innerText = obj.result.latestVersion;

    if (obj.result.latestVersion !== '') {
        if (obj.result.updateAvailable === true) {
            elGetById('lblInstallUpdate').innerText = 'New version available.';
            elGetById('btnInstallUpdate').classList.remove('hide');
        }
        else {
            elGetById('lblInstallUpdate').innerText = 'System is up to date.';
            elGetById('btnInstallUpdate').classList.add('hide');
        }
        elGetById('updateMsg').innerText = '';
    }
    else {
        elGetById('lblInstallUpdate').innerText = '';
        elGetById('btnInstallUpdate').classList.add('hide');
        elGetById('updateMsg').innerText = 'Cannot get latest version, please try again later.';
    }

    btnWaiting(elGetById('btnCheckUpdate'), false);
}

function installUpdate() {
    btnWaiting(elGetById('btnInstallUpdate'), true);
    sendAPI("MYMPD_API_IDEON_UPDATE_INSTALL", {}, parseUpdateInstall, false);
    elGetById('updateMsg').innerText = 'System will automatically reboot after installation.';
    showNotification(tn('Ideon update started'), 'general', 'info');
    toggleAlert('alertIdeonUpdateState', true, tn('Updating'));
}

function parseUpdateInstall(obj) {
    btnWaiting(elGetById('btnInstallUpdate'), false);
    if (obj.result.service === false) {
        elGetById('updateMsg').innerText = 'Update error, please try again later.';
        showNotification(tn('Ideon update failed'), 'general', 'error');
    }
    toggleAlert('alertIdeonUpdateState', false, '');
}

function parseIdeonSettings() {
    elGetById('selectMixerType').value = settings.mixerType;
    toggleBtnChkId('btnDop', settings.dop);

    elGetById('selectNsType').value = settings.nsType;
    elGetById('inputNsServer').value = settings.nsServer;
    elGetById('inputNsShare').value = settings.nsShare;
    elGetById('selectSambaVersion').value = settings.sambaVersion;
    elGetById('inputNsUsername').value = settings.nsUsername;
    elGetById('inputNsPassword').value = settings.nsPassword;

    if (settings.nsType === 0) {
        elGetById('nsServerShare').classList.add('hide');
        elGetById('sambaVersion').classList.add('hide');
        elGetById('nsCredentials').classList.add('hide');
    }
    else if (settings.nsType === 2) {
        elGetById('nsServerShare').classList.remove('hide');
        elGetById('sambaVersion').classList.remove('hide');
        elGetById('nsCredentials').classList.remove('hide');
    }
    else {
        elGetById('nsServerShare').classList.remove('hide');
        if (settings.nsType === 1) {
            elGetById('sambaVersion').classList.remove('hide');
        }
        else {
            elGetById('sambaVersion').classList.add('hide');
        }
        elGetById('nsCredentials').classList.add('hide');
    }

    toggleBtnChkId('btnAirplay', settings.airplay);
    toggleBtnChkId('btnRoon', settings.roon);
    toggleBtnChkId('btnSpotify', settings.spotify);
}

function saveIdeonSettings() {
    // TODO use cleanupModalId, formToJson, modalClose, btnWaiting
    let formOK = true;

    const selectNsType = elGetById('selectNsType');
    const selectNsTypeValue = selectNsType.options[selectNsType.selectedIndex].value;
    const inputNsServer = elGetById('inputNsServer');
    const inputNsShare = elGetById('inputNsShare');
    const inputNsUsername = elGetById('inputNsUsername');
    const inputNsPassword = elGetById('inputNsPassword');

    // TODO use new validate methods
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

    if (formOK === true) {
        const selectMixerType = elGetById('selectMixerType');
        const selectSambaVersion = elGetById('selectSambaVersion');
        sendAPI("MYMPD_API_SETTINGS_SET", {
            "mixerType": selectMixerType.options[selectMixerType.selectedIndex].value,
            "dop": (elGetById('btnDop').classList.contains('active') ? true : false),
            "nsType": parseInt(selectNsTypeValue),
            "nsServer": inputNsServer.value,
            "nsShare": inputNsShare.value,
            "sambaVersion": selectSambaVersion.options[selectSambaVersion.selectedIndex].value,
            "nsUsername": inputNsUsername.value,
            "nsPassword": inputNsPassword.value,
            "airplay": (elGetById('btnAirplay').classList.contains('active') ? true : false),
            "roon": (elGetById('btnRoon').classList.contains('active') ? true : false),
            "spotify": (elGetById('btnSpotify').classList.contains('active') ? true : false)
        }, getSettings, true);
        // TODO add spinner, support apply
        uiElements.modalIdeonSettings.hide();
    }
}

// function confirmReset() {
//     sendAPI("MYMPD_API_SETTINGS_RESET", {}, function () {
//         resetFlag = false;
//         uiElements.modalResetSettings.hide();
//     });
// }
