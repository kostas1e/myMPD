"use strict";

function initModalIdeonSettings() {
    document.getElementById('modalIdeonSettings').addEventListener('shown.bs.modal', function () {
        // TODO pass callback to parse only ideon settings
        getSettings();
        removeIsInvalid(document.getElementById('modalIdeonSettings'));
    });

    // document.getElementById('modalIdeonSettings').addEventListener('keydown', function (event) {
    //     if (event.key === 'Enter') {
    //         saveIdeonSettings();
    //         event.stopPropagation();
    //         event.preventDefault();
    //     }
    // });

    document.getElementById('selectNsType').addEventListener('change', function () {
        const value = this.options[this.selectedIndex].value;
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
    }, false);

    document.getElementById('btnDropdownServers').parentNode.addEventListener('show.bs.dropdown', function () {
        sendAPI("MYMPD_API_IDEON_NS_SERVER_LIST", {}, parseListServers, true);
    }, false);

    document.getElementById('dropdownServers').addEventListener('click', function (event) {
        event.preventDefault();
        const target = event.target.nodeName === 'A'
            ? event.target
            : event.target.parentNode;
        if (target.nodeName === 'A') {
            document.getElementById('inputNsServer').value = getData(target, 'value');
            uiElements.dropdownServers.hide();
        }
    }, false);
}

/**
 * Parses the MYMPD_API_IDEON_NS_SERVER_LIST
 * @param {object} obj jsonrpc response object
 */
function parseListServers(obj) {
    let list = '';
    if (obj.error) {
        list = '<div class="list-group-item"><span class="mi">error_outline</span> ' + tn(obj.error.message) + '</div>';
    }
    else {
        for (let i = 0; i < obj.result.returnedEntities; i++) {
            list += '<a href="#" class="list-group-item list-group-item-action" data-value="' + obj.result.data[i].ipAddress + '">' +
                obj.result.data[i].ipAddress + '<br/><small>' + obj.result.data[i].name + '</small></a>';
        }
        if (obj.result.returnedEntities === 0) {
            list = '<div class="list-group-item"><span class="mi">error_outline</span>&nbsp;' + tn('Empty list') + '</div>';
        }
    }

    const id = settings.init !== true ? 'dropdownServers1' : 'dropdownServers';
    // TODO replace
    // const id = document.querySelectorAll('#modalIdeonSetup.show').length > 0 ? 'dropdownServers1' : 'dropdownServers';
    document.getElementById(id).innerHTML = list;
}

function checkUpdate() {
    sendAPI("MYMPD_API_IDEON_UPDATE_CHECK", {}, parseUpdateCheck, false);

    btnWaiting(document.getElementById('btnCheckUpdate'), true);
}

function parseUpdateCheck(obj) {
    document.getElementById('currentVersion').innerText = obj.result.currentVersion;
    document.getElementById('latestVersion').innerText = obj.result.latestVersion;

    if (obj.result.latestVersion !== '') {
        if (obj.result.updateAvailable === true) {
            document.getElementById('lblInstallUpdate').innerText = 'New version available.';
            document.getElementById('btnInstallUpdate').classList.remove('hide');
        }
        else {
            document.getElementById('lblInstallUpdate').innerText = 'System is up to date.';
            document.getElementById('btnInstallUpdate').classList.add('hide');
        }
        document.getElementById('updateMsg').innerText = '';
    }
    else {
        document.getElementById('lblInstallUpdate').innerText = '';
        document.getElementById('btnInstallUpdate').classList.add('hide');
        document.getElementById('updateMsg').innerText = 'Cannot get latest version, please try again later.';
    }

    btnWaiting(document.getElementById('btnCheckUpdate'), false);
}

function installUpdate() {
    sendAPI("MYMPD_API_IDEON_UPDATE_INSTALL", {}, parseUpdateInstall, false);

    document.getElementById('updateMsg').innerText = 'System will automatically reboot after installation.';

    btnWaiting(document.getElementById('btnInstallUpdate'), true);
}

function parseUpdateInstall(obj) {
    if (obj.result.service === false) {
        document.getElementById('updateMsg').innerText = 'Update error, please try again later.';
        btnWaiting(document.getElementById('btnInstallUpdate'), false);
    }
}

function parseIdeonSettings() {
    document.getElementById('selectMixerType').value = settings.mixerType;
    toggleBtnChkId('btnDop', settings.dop);

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

    toggleBtnChkId('btnAirplay', settings.airplay);
    toggleBtnChkId('btnRoon', settings.roon);
    toggleBtnChkId('btnSpotify', settings.spotify);
}

function saveIdeonSettings() {
    // TODO use cleanupModalId, formToJson, modalClose, btnWaiting
    let formOK = true;

    const selectNsType = document.getElementById('selectNsType');
    const selectNsTypeValue = selectNsType.options[selectNsType.selectedIndex].value;
    const inputNsServer = document.getElementById('inputNsServer');
    const inputNsShare = document.getElementById('inputNsShare');
    const inputNsUsername = document.getElementById('inputNsUsername');
    const inputNsPassword = document.getElementById('inputNsPassword');

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
        const selectMixerType = document.getElementById('selectMixerType');
        const selectSambaVersion = document.getElementById('selectSambaVersion');
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

function handleQobuzSearch() {
    // FIXME
    // mv, timeout / wds, encodeURIComponent()
    // support for sort/sortdesc/expression of app.current.search/cols
    handleSearchExpression('Search');
    const searchStrEl = elGetById(app.id + 'SearchStr');
    const searchCrumbEl = elGetById(app.id + 'SearchCrumb');
    if (searchStrEl.value.length >= 2 ||
        searchCrumbEl.children.length > 0)
    {
        if (app.current.sort.tag === '') {
            app.current.sort.tag = settings.tagList.includes('Title')
                ? 'Title'
                : '';
        }
        sendAPI("MYMPD_API_IDEON_QOBUZ_TRACK_SEARCH", {
            "offset": app.current.offset,
            "limit": app.current.limit,
            "query": searchStrEl.value
        }, parseSearch, true);
    }
    else {
        // clear list if no search is defined
        const SearchListEl = elGetById('SearchList');
        elClear(SearchListEl.querySelector('tbody'));
        elClear(SearchListEl.querySelector('tfoot'));
        elDisableId('SearchAddAllSongsBtn');
        elDisableId('SearchAddAllSongsDropdownBtn');
        unsetUpdateViewId('SearchList');
        setPagination(0, 0);
    }
}

function updateArray(firstArray, secondArray) {
    const updatedArray = firstArray.map(item => {
        const matchingItem = secondArray.find(obj => obj.uri === item.uri);
        return matchingItem ? { ...item, ...matchingItem } : item;
    });
    return updatedArray;
}

function updateArray2(firstArray, secondArray) {
    let totalDuration = 0;
    const updatedArray = firstArray.map(item => {
        const matchingItem = secondArray.find(obj => obj.uri === item.uri);
        if (matchingItem) {
            const updatedItem = { ...item };
            Object.keys(updatedItem).forEach(key => {
                if (matchingItem.hasOwnProperty(key)) {
                    if (key === 'Title') {
                        updatedItem[key] = '[Qobuz] ' + matchingItem[key];
                    } else {
                        updatedItem[key] = matchingItem[key];
                    }
                }
            });
            totalDuration += matchingItem.Duration;
            return updatedItem;
        } else {
            return item;
        }
    });
    return { updatedArray, totalDuration };
}

function updateObject(obj1, obj2) {
    const updatedObject = { ...obj1 };

    Object.keys(updatedObject).forEach(key => {
        if (obj2.hasOwnProperty(key)) {
            if (key === 'Title') {
                updatedObject[key] = '[Qobuz] ' + obj2[key];
            } else {
                updatedObject[key] = obj2[key];
            }
        }
    });

    return updatedObject;
}

function updateObject2(result1, result2) {
    Object.keys(result2).forEach(key => {
        if (result1.hasOwnProperty(key)) {
            // FIXME ignore method only
            if (key === 'Title') {
                result1[key] = '[Qobuz] ' + result2[key];
            }
            else if (key === 'Duration') {
                result1[key] = result2[key];
            }
        }
    });
}

function updateSongDetails(obj) {
    const uri = obj.result.uri;
    if (uri.startsWith("qobuz://track/")) {
        sendAPI("MYMPD_API_IDEON_QOBUZ_SONG_DETAILS", {
            "uri": uri
        }, function (qobuz_obj) {
            updateObject2(obj.result, qobuz_obj.result);
            parseCurrentSong(obj);
        }, false);
    }
    else {
        parseCurrentSong(obj);
    }
}
