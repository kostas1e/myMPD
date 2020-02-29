"use strict";
/* 
function saveIdeonSettings() {
    let formOK = true;
    let mpdHostEl = document.getElementById('inputMpdHost');
    let mpdPortEl = document.getElementById('inputMpdPort');
    let mpdPassEl = document.getElementById('inputMpdPass');
    let musicDirectoryEl = document.getElementById('selectMusicDirectory');
    let musicDirectory = musicDirectoryEl.options[musicDirectoryEl.selectedIndex].value;

    if (musicDirectory === 'custom') {
        let musicDirectoryValueEl = document.getElementById('inputMusicDirectory');
        if (!validatePath(musicDirectoryValueEl)) {
            formOK = false;
        }
        musicDirectory = musicDirectoryValueEl.value;
    }

    if (mpdPortEl.value === '') {
        mpdPortEl.value = '6600';
    }
    if (mpdHostEl.value.indexOf('/') !== 0) {
        if (!validateInt(mpdPortEl)) {
            formOK = false;
        }
        if (!validateHost(mpdHostEl)) {
            formOK = false;
        }
    }
    if (formOK === true) {
        sendAPI("MYMPD_API_CONNECTION_SAVE", { "mpdHost": mpdHostEl.value, "mpdPort": mpdPortEl.value, "mpdPass": mpdPassEl.value, "musicDirectory": musicDirectory }, getSettings);
        modalConnection.hide();
    }
}
 */

function parseIdeonSettings() {
    console.log('parseideonsettings');
    console.log(settings.ideonVersion);
    document.getElementById('selectNasType').value = settings.nasType;
    document.getElementById('inputNasHost').value = settings.nasHost;
    document.getElementById('inputNasDirectory').value = settings.nasDirectory;
    document.getElementById('inputNasUsername').value = settings.nasUsername;
    document.getElementById('inputNasPassword').value = settings.nasPassword;

    if (settings.nastype === '0') {
        document.getElementById('inputNasHost').setAttribute('disabled', 'disabled');
        document.getElementById('inputNasDirectory').setAttribute('disabled', 'disabled');
        document.getElementById('inputNasUsername').setAttribute('disabled', 'disabled');
        document.getElementById('inputNasPassword').setAttribute('disabled', 'disabled');
    }
    else if (settings.nastype === '1') {
        document.getElementById('inputNasHost').removeAttribute('disabled');
        document.getElementById('inputNasDirectory').removeAttribute('disabled');
        document.getElementById('inputNasUsername').setAttribute('disabled', 'disabled');
        document.getElementById('inputNasPassword').setAttribute('disabled', 'disabled');
    }
    else if (settings.nastype === '2') {
        document.getElementById('inputNasHost').removeAttribute('disabled');
        document.getElementById('inputNasDirectory').removeAttribute('disabled');
        document.getElementById('inputNasUsername').removeAttribute('disabled');
        document.getElementById('inputNasPassword').removeAttribute('disabled');
    }

    toggleBtnChkCollapse('btnTidal', 'collapseTidal', settings.tidal);
    document.getElementById('inputTidalUsername').value = settings.tidalUsername;
    document.getElementById('inputTidalPassword').value = settings.tidalPassword;
    document.getElementById('selectTidalAudioquality').value = settings.tidalAudioquality;
    if (settings.tidal) {
        document.getElementById('cardSearchNavTidal').classList.remove('disabled');
    }
    else {
        document.getElementById('cardSearchNavTidal').classList.add('disabled');
        if (app.current.tab === 'Tidal') {
            appGoto('Search', 'Database');
        }
    }

    document.getElementById('ideonVersion').innerText = settings.ideonVersion;
    document.getElementById('btnUpdate').value = settings.ideonUpdate;
    if (settings.ideonUpdate === false) {
        console.log('updfalse');
        // document.getElementById('updateFieldset').disabled = true;
    }
    else if (settings.ideonUpdate === true) {
        console.log('updtrue');
        // document.getElementById('updateFieldset').disabled = false;
    }
}

function saveIdeonSettings() {
    
    let formOK = true;
    console.log('saveideonsettings', formOK);
    // validate form

    if (formOK === true) {
        let selectNasType = document.getElementById('selectNasType');
        let selectTidalAudioquality = document.getElementById('selectTidalAudioquality');
        sendAPI("MYMPD_API_SETTINGS_SET", {
            "nasType": parseInt(selectNasType.options[selectNasType.selectedIndex].value),
            "nasHost": document.getElementById('inputNasHost').value,
            "nasDirecory": document.getElementById('inputNasDirectory').value,
            "nasUsername": document.getElementById('inputNasUsername').value,
            "nasPassword": document.getElementById('inputNasPassword').value,
            "tidal": (document.getElementById('btnTidal').classList.contains('active') ? true : false),
            "tidalUsername": document.getElementById('inputTidalUsername').value,
            "tidalPassword": document.getElementById('inputTidalPassword').value,
            "tidalAudioquality": selectTidalAudioquality.options[selectTidalAudioquality.selectedIndex].value,
            "ideonVersion": document.getElementById('ideonVersion').innerText,
            "ideonUpdate": (document.getElementById('btnUpdate').classList.contains('active') ? true : false)
        }, getSettings);
        modalIdeon.hide();
    }
}
