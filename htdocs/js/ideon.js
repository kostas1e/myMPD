"use strict";

function initIdeon() {
    document.getElementById('modalIdeon').addEventListener('shown.bs.modal', function () {
        getSettings();
        removeIsInvalid(document.getElementById('modalIdeon'));
    });

    document.getElementById('modalIdeon').addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            saveIdeonSettings();
            event.stopPropagation();
            event.preventDefault();
        }
    });

    document.getElementById('selectNsType').addEventListener('change', function () {
        let value = this.options[this.selectedIndex].value;
        if (value === '0') {
            document.getElementById('nsServerShare').classList.add('hide');
            document.getElementById('sambaVersion').classList.add('hide');
            document.getElementById('nsCredentials').classList.add('hide');
            document.getElementById('inputNsServer').value = '';
            document.getElementById('inputNsShare').value = '';
            document.getElementById('inputNsUsername').value = '';
            document.getElementById('inputNsPassword').value = '';
        }
        else if (value === '2') {
            document.getElementById('nsServerShare').classList.remove('hide');
            document.getElementById('sambaVersion').classList.remove('hide');
            document.getElementById('nsCredentials').classList.remove('hide');
        }
        else {
            document.getElementById('nsServerShare').classList.remove('hide');
            if (value === '1') {
                document.getElementById('sambaVersion').classList.remove('hide');
            }
            else {
                document.getElementById('sambaVersion').classList.add('hide');
            }
            document.getElementById('nsCredentials').classList.add('hide');
            document.getElementById('inputNsUsername').value = '';
            document.getElementById('inputNsPassword').value = '';
        }
    });

    document.getElementById('btnDropdownServers').parentNode.addEventListener('show.bs.dropdown', function () {
        sendAPI("MYMPD_API_NS_SERVER_LIST", {}, parseServers, true);
    });

    document.getElementById('dropdownServers').children[0].addEventListener('click', function (event) {
        event.preventDefault();
        if (event.target.nodeName === 'A') {
            document.getElementById('inputNsServer').value = event.target.getAttribute('data-value');
        }
    });
}

function parseServers(obj) {
    let list = '';
    if (obj.error) {
        list = '<div class="list-group-item"><span class="mi">error_outline</span> ' + t(obj.error.message) + '</div>';
    }
    else {
        for (let i = 0; i < obj.result.returnedEntities; i++) {
            list += '<a href="#" class="list-group-item list-group-item-action" data-value="' + obj.result.data[i].ipAddress + '">' +
                obj.result.data[i].ipAddress + '<br/><small>' + obj.result.data[i].name + '</small></a>';
        }
        if (obj.result.returnedEntities === 0) {
            list = '<div class="list-group-item"><span class="mi">error_outline</span>&nbsp;' + t('Empty list') + '</div>';
        }
    }

    let id = settings.init !== true ? 'dropdownServers1' : 'dropdownServers';
    document.getElementById(id).children[0].innerHTML = list;
}

function checkUpdate() {
    sendAPI("MYMPD_API_UPDATE_CHECK", {}, parseUpdateCheck);

    btnWaiting(document.getElementById('btnCheckUpdate'), true);
}

function parseUpdateCheck(obj) {
    document.getElementById('currentVersion').innerText = obj.result.currentVersion;
    document.getElementById('latestVersion').innerText = obj.result.latestVersion;

    if (obj.result.latestVersion !== '') {
        if (obj.result.updateAvailable === true) {
            document.getElementById('lblInstallUpdate').innerText = 'New version available';
            document.getElementById('btnInstallUpdate').classList.remove('hide');
        }
        else {
            document.getElementById('lblInstallUpdate').innerText = 'There is no update available';
            document.getElementById('btnInstallUpdate').classList.add('hide');
        }
        document.getElementById('updateMsg').innerText = '';
    }
    else {
        document.getElementById('lblInstallUpdate').innerText = '';
        document.getElementById('btnInstallUpdate').classList.add('hide');
        document.getElementById('updateMsg').innerText = 'Cannot get latest version, please try again later';
    }

    btnWaiting(document.getElementById('btnCheckUpdate'), false);
}

function installUpdate() {
    sendAPI("MYMPD_API_UPDATE_INSTALL", {}, parseUpdateInstall);

    document.getElementById('updateMsg').innerText = 'System will automatically reboot after installation';

    btnWaiting(document.getElementById('btnInstallUpdate'), true);
}

function parseUpdateInstall(obj) {
    if (obj.result.service === false) {
        document.getElementById('updateMsg').innerText = 'Update error, please try again later';
        btnWaiting(document.getElementById('btnInstallUpdate'), false);
    }
}

function parseIdeonSettings() {
    document.getElementById('selectMixerType').value = settings.mixerType;
    toggleBtnChk('btnDop', settings.dop);

    document.getElementById('selectNsType').value = settings.nsType;
    document.getElementById('inputNsServer').value = settings.nsServer;
    document.getElementById('inputNsShare').value = settings.nsShare;
    document.getElementById('selectSambaVersion').value = settings.sambaVersion;
    document.getElementById('inputNsUsername').value = settings.nsUsername;
    document.getElementById('inputNsPassword').value = settings.nsPassword;

    if (settings.nsType === 0) {
        document.getElementById('nsServerShare').classList.add('hide');
        document.getElementById('sambaVersion').classList.add('hide');
        document.getElementById('nsCredentials').classList.add('hide');
    }
    else if (settings.nsType === 2) {
        document.getElementById('nsServerShare').classList.remove('hide');
        document.getElementById('sambaVersion').classList.remove('hide');
        document.getElementById('nsCredentials').classList.remove('hide');
    }
    else {
        document.getElementById('nsServerShare').classList.remove('hide');
        if (settings.nsType === 1) {
            document.getElementById('sambaVersion').classList.remove('hide');
        }
        else {
            document.getElementById('sambaVersion').classList.add('hide');
        }
        document.getElementById('nsCredentials').classList.add('hide');
    }

    toggleBtnChk('btnAirplay', settings.airplay);
    toggleBtnChk('btnRoon', settings.roon);
    toggleBtnChk('btnSpotify', settings.spotify);
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
        if (!validateIPAddress(inputNsServer)) {
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
        let selectMixerType = document.getElementById('selectMixerType');
        let selectSambaVersion = document.getElementById('selectSambaVersion');
        sendAPI("MYMPD_API_SETTINGS_SET", {
            "mixerType": selectMixerType.options[selectMixerType.selectedIndex].value,
            "dop": (document.getElementById('btnDop').classList.contains('active') ? true : false),
            "nsType": parseInt(selectNsTypeValue),
            "nsServer": inputNsServer.value,
            "nsShare": inputNsShare.value,
            "sambaVersion": selectSambaVersion.options[selectSambaVersion.selectedIndex].value,
            "nsUsername": inputNsUsername.value,
            "nsPassword": inputNsPassword.value,
            "airplay": (document.getElementById('btnAirplay').classList.contains('active') ? true : false),
            "roon": (document.getElementById('btnRoon').classList.contains('active') ? true : false),
            "spotify": (document.getElementById('btnSpotify').classList.contains('active') ? true : false)
        }, getSettings);
        modalIdeon.hide();
    }
}

function confirmReset() {
    sendAPI("MYMPD_API_SETTINGS_RESET", {}, closeReset);
}

function closeReset() {
    resetFlag = false;
    modalResetSettings.hide();
}
