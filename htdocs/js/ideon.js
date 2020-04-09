"use strict";

function checkForUpdates() {
    sendAPI("MYMPD_API_CHECK_FOR_UPDATES", {}, parseCheck);

    btnWaiting(document.getElementById('btnCheckForUpdates'), true);
}

function parseCheck(obj) {
    document.getElementById('currentVersion').innerText = obj.result.currentVersion;
    if (obj.result.latestVersion !== undefined) {
        document.getElementById('latestVersion').innerText = obj.result.latestVersion;
        document.getElementById('latestVersion').parentNode.classList.remove('hide');
    }
    else {
        document.getElementById('latestVersion').parentNode.classList.add('hide');
    }

    if (obj.result.updatesAvailable) {
        document.getElementById('updateMsg').innerText = 'New version available';
        document.getElementById('btnInstallUpdates').classList.remove('hide');
        document.getElementById('restartMsg').classList.remove('hide');
    }
    else {
        document.getElementById('updateMsg').innerText = 'System is up to date';
        document.getElementById('btnInstallUpdates').classList.add('hide');
        document.getElementById('restartMsg').classList.add('hide');
    }

    btnWaiting(document.getElementById('btnCheckForUpdates'), false);
}

function installUpdates() {
    sendAPI("MYMPD_API_INSTALL_UPDATES", {}, parseInstall);

    btnWaiting(document.getElementById('btnInstallUpdates'), true);
}

function parseInstall(obj) {
    if (!obj.result.restartSystem) {
        document.getElementById('restartMsg').innerText = 'An error occured, please try again.';
    }

    btnWaiting(document.getElementById('btnInstallUpdates'), false);
}

function parseIdeonSettings() {
    document.getElementById('selectMixerType').value = settings.mixerType;
    toggleBtnChk('btnDop', settings.dop);

    document.getElementById('selectNsType').value = settings.nsType;
    document.getElementById('inputNsServer').value = settings.nsServer;
    document.getElementById('inputNsShare').value = settings.nsShare;
    document.getElementById('inputNsUsername').value = settings.nsUsername;
    document.getElementById('inputNsPassword').value = settings.nsPassword;

    if (settings.nsType === 0) {
        document.getElementById('inputNsServer').setAttribute('disabled', 'disabled');
        document.getElementById('inputNsShare').setAttribute('disabled', 'disabled');
        document.getElementById('inputNsUsername').setAttribute('disabled', 'disabled');
        document.getElementById('inputNsPassword').setAttribute('disabled', 'disabled');
    }
    else if (settings.nsType === 1) {
        document.getElementById('inputNsServer').removeAttribute('disabled');
        document.getElementById('inputNsShare').removeAttribute('disabled');
        document.getElementById('inputNsUsername').setAttribute('disabled', 'disabled');
        document.getElementById('inputNsPassword').setAttribute('disabled', 'disabled');
    }
    else if (settings.nsType === 2) {
        document.getElementById('inputNsServer').removeAttribute('disabled');
        document.getElementById('inputNsShare').removeAttribute('disabled');
        document.getElementById('inputNsUsername').removeAttribute('disabled');
        document.getElementById('inputNsPassword').removeAttribute('disabled');
    }

    toggleBtnChk('btnAirplay', settings.airplay);
    toggleBtnChk('btnSpotify', settings.spotify);
    toggleBtnChkCollapse('btnTidalEnabled', 'collapseTidal', settings.tidalEnabled);
    document.getElementById('inputTidalUsername').value = settings.tidalUsername;
    document.getElementById('inputTidalPassword').value = settings.tidalPassword;
    document.getElementById('selectTidalAudioquality').value = settings.tidalAudioquality;
}

function saveIdeonSettings() {
    let formOK = true;

    let selectNsType = document.getElementById('selectNsType');
    let selectNsTypeValue = selectNsType.options[selectNsType.selectedIndex].value;
    let inputNsServer = document.getElementById('inputNsServer');
    let inputNsShare = document.getElementById('inputNsShare');
    let inputNsUsername = document.getElementById('inputNsUsername');
    let inputNsPassword = document.getElementById('inputNsPassword');

    if (selectNsTypeValue !== '0') {
        if (inputNsServer.value.indexOf('/') !== 0) {
            if (!validateHost(inputNsServer)) {
                formOK = false;
            }
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

    let inputTidalUsername = document.getElementById('inputTidalUsername');
    let inputTidalPassword = document.getElementById('inputTidalPassword');
    if (document.getElementById('btnTidalEnabled').classList.contains('active')) {
        if (!validateNotBlank(inputTidalUsername) || !validateNotBlank(inputTidalPassword)) {
            formOK = false;
        }
    }

    if (formOK === true) {
        let selectMixerType = document.getElementById('selectMixerType');
        let selectTidalAudioquality = document.getElementById('selectTidalAudioquality');
        sendAPI("MYMPD_API_SETTINGS_SET", {
            "mixerType": selectMixerType.options[selectMixerType.selectedIndex].value,
            "dop": (document.getElementById('btnDop').classList.contains('active') ? true : false),
            "nsType": parseInt(selectNsTypeValue),
            "nsServer": inputNsServer.value,
            "nsShare": inputNsShare.value,
            "nsUsername": inputNsUsername.value,
            "nsPassword": inputNsPassword.value,
            "airplay": (document.getElementById('btnAirplay').classList.contains('active') ? true : false),
            "spotify": (document.getElementById('btnSpotify').classList.contains('active') ? true : false),
            "tidalEnabled": (document.getElementById('btnTidalEnabled').classList.contains('active') ? true : false),
            "tidalUsername": inputTidalUsername.value,
            "tidalPassword": inputTidalPassword.value,
            "tidalAudioquality": selectTidalAudioquality.options[selectTidalAudioquality.selectedIndex].value
        }, getSettings);
        modalIdeon.hide();
    }
}
