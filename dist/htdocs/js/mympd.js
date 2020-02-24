
function albumDetails(uri) {
    if (uri.startsWith("tidal://")) {
        sendAPI("MYMPD_API_TIDAL_ALBUMDETAILS", {"uri": uri}, parseTidalAlbumDetails);
    }
    else if (uri.startsWith("qobuz://")) {
        sendAPI("MYMPD_API_QOBUZ_ALBUMDETAILS", {"uri": uri}, parseQobuzAlbumDetails);
    }
    modalAlbumDetails.show();
}

function parseTidalAlbumDetails(obj) {
    let modal = document.getElementById('modalAlbumDetails');
    let cover = obj.result.cover;
    if (cover) {
        // cover = subdir + '/image/' + obj.result.cover.replace(/-/g, '/') + '/320x320.jpg';
        // csp check
        // <img src="img_chania.jpg" alt="Chania"> 
        // cover = subdir + 'https://resources.tidal.com/images/cb23981d/e1f6/404f/9902/840a5ec20f59/80x80.jpg';
    }
    else {
        image = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + cover + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.title;

    let albumDetails = '';
    albumDetails += '<tr><th>' + t('AlbumArtist') + '</th><td>' + obj.result.artist.name + '</td></tr>';
    albumDetails += '<tr><th>' + t('Date') + '</th><td>' + obj.result.releaseDate + '</td></tr>';
    albumDetails += '<tr><th>' + t('NumberOfTracks') + '</th><td>' + obj.result.numberOfTracks + '</td></tr>';
    albumDetails += '<tr><th>' + t('Duration') + '</th><td>' + beautifyDuration(obj.result.duration) + '</td></tr>';

    modal.getElementsByTagName('tbody')[0].innerHTML = albumDetails;
}

function parseQobuzAlbumDetails(obj) {
    let modal = document.getElementById('modalAlbumDetails');
    let image = obj.result.image.large;
    if (image) {
        image = subdir + '/image/' + image.split('/').pop();
    }
    else {
        image = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + image + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.title;

    let albumDetails = '';
    albumDetails += '<tr><th>' + t('AlbumArtist') + '</th><td>' + obj.result.artist.name + '</td></tr>';
    albumDetails += '<tr><th>' + t('Date') + '</th><td>' + new Date(obj.result.released_at).toLocaleDateString() + '</td></tr>';
    albumDetails += '<tr><th>' + t('NumberOfTracks') + '</th><td>' + obj.result.tracks_count + '</td></tr>';
    albumDetails += '<tr><th>' + t('Duration') + '</th><td>' + beautifyDuration(obj.result.duration) + '</td></tr>';
    albumDetails += '<tr><th>' + t('Genre') + '</th><td>' + obj.result.genre.name + '</td></tr>';

    modal.getElementsByTagName('tbody')[0].innerHTML = albumDetails;
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function sendAPI(method, params, callback, onerror) {
    let request = {"jsonrpc": "2.0", "id": 0, "method": method, "params": params};
    let ajaxRequest=new XMLHttpRequest();
    ajaxRequest.open('POST', subdir + '/api', true);
    ajaxRequest.setRequestHeader('Content-type', 'application/json');
    ajaxRequest.onreadystatechange = function() {
        if (ajaxRequest.readyState === 4) {
            if (ajaxRequest.responseText !== '') {
                let obj = JSON.parse(ajaxRequest.responseText);
                if (obj.error) {
                    showNotification(t(obj.error.message, obj.error.data), '', '', 'danger');
                    logError(JSON.stringify(obj.error));
                }
                else if (obj.result && obj.result.message && obj.result.message !== 'ok') {
                    logDebug('Got API response: ' + JSON.stringify(obj.result));
                    showNotification(t(obj.result.message, obj.result.data), '', '', 'success');
                }
                else if (obj.result && obj.result.message && obj.result.message === 'ok') {
                    logDebug('Got API response: ' + JSON.stringify(obj.result));
                }
                else if (obj.result && obj.result.method) {
                    logDebug('Got API response of type: ' + obj.result.method);
                }
                else {
                    logError('Got invalid API response: ' + JSON.stringify(obj));
                    if (onerror !== true) {
                        return;
                    }
                }
                if (callback !== undefined && typeof(callback) === 'function') {
                    if (obj.result !== undefined || onerror === true) {
                        logDebug('Calling ' + callback.name);
                        callback(obj);
                    }
                    else {
                        logDebug('Undefined resultset, skip calling ' + callback.name);
                    }
                }
            }
            else {
                logError('Empty response for request: ' + JSON.stringify(request));
                if (onerror === true) {
                    if (callback !== undefined && typeof(callback) === 'function') {
                        logDebug('Got empty API response calling ' + callback.name);
                        callback('');
                    }
                }
            }
        }
    };
    ajaxRequest.send(JSON.stringify(request));
    logDebug('Send API request: ' + method);
}

function webSocketConnect() {
    if (socket !== null && socket.readyState === WebSocket.OPEN) {
        logInfo("Socket already connected");
        websocketConnected = true;
        return;
    }
    else if (socket !== null && socket.readyState === WebSocket.CONNECTING) {
        logInfo("Socket connection in progress");
        websocketConnected = false;
        return;
    }
    else {
        websocketConnected = false;
    }
    let wsUrl = getWsUrl();
    socket = new WebSocket(wsUrl);
    logInfo('Connecting to ' + wsUrl);

    try {
        socket.onopen = function() {
            logInfo('Websocket is connected');
            websocketConnected = true;
            if (websocketTimer !== null) {
                clearTimeout(websocketTimer);
                websocketTimer = null;
            }
        }

        socket.onmessage = function got_packet(msg) {
            var obj;
            try {
                obj = JSON.parse(msg.data);
                logDebug('Websocket notification: ' + JSON.stringify(obj));
            }
            catch(error) {
                logError('Invalid JSON data received: ' + msg.data);
                return;
            }

            switch (obj.method) {
                case 'welcome':
                    websocketConnected = true;
                    showNotification(t('Connected to myMPD') + ': ' + wsUrl, '', '', 'success');
                    appRoute();
                    sendAPI("MPD_API_PLAYER_STATE", {}, parseState, true);
                    break;
                case 'update_state':
                    obj.result = obj.params;
                    parseState(obj);
                    break;
                case 'mpd_disconnected':
                    if (progressTimer) {
                        clearTimeout(progressTimer);
                    }
                    getSettings(true);
                    break;
                case 'mpd_connected':
                    showNotification(t('Connected to MPD'), '', '', 'success');
                    sendAPI("MPD_API_PLAYER_STATE", {}, parseState);
                    getSettings(true);
                    break;
                case 'update_queue':
                    if (app.current.app === 'Queue') {
                        getQueue();
                    }
                    else if (app.current.app === 'Playback') {
                        // console.log('updq', obj.params.songPos);
                        // mk colsqm
                        /* sendAPI("MPD_API_QUEUE_LIST", {"offset": 0, "cols": []}, parseQueue);
                        if (obj.params.songPos !== -1) */
                        getQueueMini(obj.params.songPos, true);
                    }
                    obj.result = obj.params;
                    parseUpdateQueue(obj);
                    break;
                case 'update_options':
                    getSettings();
                    break;
                case 'update_outputs':
                    sendAPI("MPD_API_PLAYER_OUTPUT_LIST", {}, parseOutputs);
                    break;
                case 'update_started':
                    updateDBstarted(false);
                    break;
                case 'update_database':
                    //fall through
                case 'update_finished':
                    updateDBfinished(obj.method);
                    updateDBstats();
                    break;
                case 'update_volume':
                    obj.result = obj.params;
                    parseVolume(obj);
                    break;
                case 'update_stored_playlist':
                    if (app.current.app === 'Browse' && app.current.tab === 'Playlists' && app.current.view === 'All') {
                        sendAPI("MPD_API_PLAYLIST_LIST", {"offset": app.current.page, "filter": app.current.filter}, parsePlaylists);
                    }
                    else if (app.current.app === 'Browse' && app.current.tab === 'Playlists' && app.current.view === 'Detail') {
                        sendAPI("MPD_API_PLAYLIST_CONTENT_LIST", {"offset": app.current.page, "filter": app.current.filter, "uri": app.current.search, "cols": settings.colsBrowsePlaylistsDetail}, parsePlaylists);
                    }
                    break;
                case 'update_lastplayed':
                    if (app.current.app === 'Queue' && app.current.tab === 'LastPlayed') {
                        sendAPI("MPD_API_QUEUE_LAST_PLAYED", {"offset": app.current.page, "cols": settings.colsQueueLastPlayed}, parseLastPlayed);
                    }
                    break;
                case 'error':
                    if (document.getElementById('alertMpdState').classList.contains('hide')) {
                        showNotification(t(obj.params.message), '', '', 'danger');
                    }
                    break;
                default:
                    break;
            }
        }

        socket.onclose = function(){
            logError('Websocket is disconnected');
            websocketConnected = false;
            if (appInited === true) {
                toggleUI();
                if (progressTimer) {
                    clearTimeout(progressTimer);
                }
            }
            else {
                showAppInitAlert(t('Websocket connection failed'));
                logError('Websocket connection failed.');
            }
            if (websocketTimer !== null) {
                clearTimeout(websocketTimer);
                websocketTimer = null;
            }
            websocketTimer = setTimeout(function() {
                logInfo('Reconnecting websocket');
                toggleAlert('alertMympdState', true, t('Websocket connection failed, trying to reconnect') + '&nbsp;&nbsp;<div class="spinner-border spinner-border-sm"></div>');
                webSocketConnect();
            }, 3000);
            socket = null;
        }

    } catch(error) {
        logError(error);
    }
}

function getWsUrl() {
    let hostname = window.location.hostname;
    let protocol = window.location.protocol;
    let port = window.location.port;

    if (protocol === 'https:') {
        protocol = 'wss://';
    }
    else {
        protocol = 'ws://';
    }

    let wsUrl = protocol + hostname + (port !== '' ? ':' + port : '') + subdir + '/ws/';
    return wsUrl;
}

function artistDetails(uri) {
    if (uri.startsWith("tidal://")) {
        sendAPI("MYMPD_API_TIDAL_ARTISTDETAILS", {"uri": uri}, parseTidalArtistDetails);
    }
    else if (uri.startsWith("qobuz://")) {
        sendAPI("MYMPD_API_QOBUZ_ARTISTDETAILS", {"uri": uri}, parseQobuzArtistDetails);
    }
    modalArtistDetails.show();
}

function parseTidalArtistDetails(obj) {
    let modal = document.getElementById('modalArtistDetails');
    let picture = obj.result.picture;
    if (picture) {
        picture = subdir + '/image/' + picture.replace(/-/g, '/') + '/320x320.jpg';
    }
    else {
        picture = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + picture + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.name;

    let artistDetails = '';
    artistDetails += '<tr><th>' + t('Biography') + '</th></tr>';
    let bio = obj.result.bio;
    if (bio.hasOwnProperty('text')) {
        bio.text = bio.text.replace(/\[.*?\]/g, '');
        bio.text = bio.text.replace(/<br\s*[\/]?>/gi, '\n');
        artistDetails += '<tr><td>' + bio.text + '</td></tr>';
        artistDetails += '<tr><th>' + t('Artist bio from ') + bio.source + '.</th></tr>';
    }

    modal.getElementsByTagName('tbody')[0].innerHTML = artistDetails;
}

function parseQobuzArtistDetails(obj) {
    let modal = document.getElementById('modalArtistDetails');
    let image = obj.result.image.large;
    if (image) {
        image = subdir + '/image/' + image.split('/').pop();
    }
    else {
        image = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + image + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.name;

    let artistDetails = '';
    artistDetails += '<tr><th>' + t('Portrait') + '</th></tr>';
    artistDetails += '<tr><td>' + obj.result.biography.content + '</td></tr>';

    modal.getElementsByTagName('tbody')[0].innerHTML = artistDetails;
}

function artistRadio(uri) { // tidal artist radio
    uri = uri.split('://').pop() + '/mix';
    searchTidal(uri);
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

var openCoverId;

function gotoBrowse(x) {
    let tag = x.parentNode.getAttribute('data-tag');
    let name = decodeURI(x.parentNode.getAttribute('data-name'));
    if (tag !== '' && name !== '' && name !== '-' && settings.browsetags.includes(tag)) {
        appGoto('Browse', 'Database', tag, '0/-/-/' + name);
    }
}

function parseFilesystem(obj) {
    let list = app.current.app + app.current.tab;
    let colspan = settings['cols' + list].length;
    colspan--;
    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById(list + 'List');
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
    let activeRow = 0;
    for (let i = 0; i < nrItems; i++) {
        let uri = encodeURI(obj.result.data[i].uri);
        let row = document.createElement('tr');
        let tds = '';
        row.setAttribute('data-type', obj.result.data[i].Type);
        row.setAttribute('data-uri', uri);
        row.setAttribute('tabindex', 0);
        if (obj.result.data[i].Type === 'song') {
            row.setAttribute('data-name', obj.result.data[i].Title);
        }
        else {
            row.setAttribute('data-name', obj.result.data[i].name);
        }

        switch(obj.result.data[i].Type) {
            case 'dir':
            case 'smartpls':
            case 'plist':
                for (let c = 0; c < settings['cols' + list].length; c++) {
                    tds += '<td data-col="' + settings['cols' + list][c] + '">';
                    if (settings['cols' + list][c] === 'Type') {
                        if (obj.result.data[i].Type === 'dir') {
                            tds += '<span class="material-icons">folder_open</span>';
                        }
                        else {
                            tds += '<span class="material-icons">' + (obj.result.data[i].Type === 'smartpls' ? 'queue_music' : 'list') + '</span>';
                        }
                    }
                    else if (settings['cols' + list][c] === 'Title') {
                        tds += e(obj.result.data[i].name);
                    }
                    tds += '</td>';
                }
                // tds += '<td data-col="Add" title="Append to queue"><a href="#" class="material-icons color-darkgrey">add</a></td>';
                tds += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td>';
                row.innerHTML = tds;
                break;
            case 'song':
                obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
                for (let c = 0; c < settings['cols' + list].length; c++) {
                    tds += '<td data-col="' + settings['cols' + list][c] + '">';
                    if (settings['cols' + list][c] === 'Type') {
                        tds += '<span class="material-icons">music_note</span>';
                    }
                    else {
                        tds += e(obj.result.data[i][settings['cols' + list][c]]);
                    }
                    tds += '</td>';
                }
                // tds += '<td data-col="Add" title="Append to queue"><a href="#" class="material-icons color-darkgrey">add</a></td>';
                tds += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td>';
                row.innerHTML = tds;
                break;
        }
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    let trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i --) {
        tr[i].remove();
    }

    if (navigate === true) {
        focusTable(0);
    }

    setPagination(obj.result.totalEntities, obj.result.returnedEntities);

    if (nrItems === 0)
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                          '<td colspan="' + colspan + '">' + t('Empty list') + '</td></tr>';
    //document.getElementById(app.current.app + (app.current.tab === undefined ? '' : app.current.tab) + 'List').classList.remove('opacity05');
    document.getElementById(list + 'List').classList.remove('opacity05');
    document.getElementById('cardFooterBrowse').innerText = t('Num entries', obj.result.totalEntities);
}

function parseListDBtags(obj) {
    scrollToPosY(0);
    if (app.current.search !== '') {
        document.getElementById('BrowseDatabaseAlbumList').classList.remove('hide');
        document.getElementById('BrowseDatabaseTagList').classList.add('hide');
        document.getElementById('btnBrowseDatabaseByTag').parentNode.classList.add('hide');
        document.getElementById('btnBrowseDatabaseTag').parentNode.classList.remove('hide');
        document.getElementById('BrowseDatabaseAddAllSongs').parentNode.parentNode.classList.remove('hide');
        document.getElementById('BrowseDatabaseColsBtn').parentNode.classList.remove('hide');
        document.getElementById('btnBrowseDatabaseTag').innerHTML = '&laquo; ' + t(app.current.view);
        document.getElementById('BrowseDatabaseAlbumListCaption').innerHTML = '<h2>' + t(obj.result.searchtagtype) + ': ' + e(obj.result.searchstr) + '</h2><hr/>';
        document.getElementById('cardFooterBrowse').innerText = t('Num entries', obj.result.totalEntities);
        let nrItems = obj.result.returnedEntities;
        let cardContainer = document.getElementById('BrowseDatabaseAlbumList');
        let cards = cardContainer.getElementsByClassName('card');
        for (let i = 0; i < nrItems; i++) {
            let id = genId(obj.result.data[i].value);
            let card = document.createElement('div');
            card.classList.add('card', 'ml-4', 'mr-4', 'mb-4', 'w-100');
            card.setAttribute('id', 'card' + id);
            card.setAttribute('data-album', encodeURI(obj.result.data[i].value));
            let html = '<div class="card-header"><span id="albumartist' + id + '"></span> &ndash; ' + e(obj.result.data[i].value) + '</div>' +
                       '<div class="card-body"><div class="row">';
            if (settings.featCoverimage === true && settings.coverimage === true) {
                html += '<div class="col-md-auto"><a class="card-img-left album-cover-loading"></a></div>';
            }
            html += '<div class="col table-responsive-md"><table class="tblAlbumTitles table table-sm table-hover" tabindex="0" id="tbl' + id + '"><thead><tr></tr></thead><tbody class="clickable"></tbody>' +
                    '<tfoot class="bg-light border-bottom"></tfoot></table></div>' + 
                    '</div></div>' +
                    '</div><div class="card-footer"></div>';

            card.innerHTML = html;
            if (i < cards.length) {
                cards[i].replaceWith(card);
            }
            else {
                cardContainer.append(card);
            }

            if ('IntersectionObserver' in window) {
                createListTitleObserver(document.getElementById('card' + id));
            }
            else {
                sendAPI("MPD_API_DATABASE_TAG_ALBUM_TITLE_LIST", {"album": obj.result.data[i].value, "search": app.current.search, "tag": app.current.view, "cols": settings.colsBrowseDatabase}, parseListTitles);
            }
        }
        let cardsLen = cards.length - 1;
        for (let i = cardsLen; i >= nrItems; i--) {
            cards[i].remove();
        }
        setPagination(obj.result.totalEntities, obj.result.returnedEntities);
        setCols('BrowseDatabase', '.tblAlbumTitles');
        let tbls = document.querySelectorAll('.tblAlbumTitles');
        for (let i = 0; i < tbls.length; i++) {
            dragAndDropTableHeader(tbls[i]);
        }
        document.getElementById('BrowseDatabaseAlbumList').classList.remove('opacity05');
    }
    else {
        document.getElementById('BrowseDatabaseAlbumList').classList.add('hide');
        document.getElementById('BrowseDatabaseTagList').classList.remove('hide');
        document.getElementById('btnBrowseDatabaseByTag').parentNode.classList.remove('hide');
        document.getElementById('BrowseDatabaseAddAllSongs').parentNode.parentNode.classList.add('hide');
        document.getElementById('BrowseDatabaseColsBtn').parentNode.classList.add('hide');
        document.getElementById('btnBrowseDatabaseTag').parentNode.classList.add('hide');
        document.getElementById('BrowseDatabaseTagListCaption').innerText = t(app.current.view);
        document.getElementById('cardFooterBrowse').innerText = t('Num entries', obj.result.totalEntities);
        let nrItems = obj.result.returnedEntities;
        let table = document.getElementById(app.current.app + app.current.tab + 'TagList');
        let tbody = table.getElementsByTagName('tbody')[0];
        let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
        let activeRow = 0;
        let tr = tbody.getElementsByTagName('tr');
        for (let i = 0; i < nrItems; i++) {
            let uri = encodeURI(obj.result.data[i].value);
            let row = document.createElement('tr');
            row.setAttribute('data-uri', uri);
            row.setAttribute('tabindex', 0);
            row.innerHTML='<td data-col="Type"><span class="material-icons">album</span></td>' +
                          '<td>' + e(obj.result.data[i].value) + '</td>';
            if (i < tr.length) {
                activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
            }
            else {
                tbody.append(row);
            }
        }
        let trLen = tr.length - 1;
        for (let i = trLen; i >= nrItems; i --) {
            tr[i].remove();
        }

        if (navigate === true) {
            focusTable(0);
        }

        setPagination(obj.result.totalEntities, obj.result.returnedEntities);

        if (nrItems === 0) {
            tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                              '<td>No entries found.</td></tr>';
        }
        document.getElementById('BrowseDatabaseTagList').classList.remove('opacity05');
    }
}

function createListTitleObserver(ele) {
  let options = {
    root: null,
    rootMargin: '0px',
  };

  let observer = new IntersectionObserver(getListTitles, options);
  observer.observe(ele);
}

function getListTitles(changes, observer) {
    changes.forEach(change => {
        if (change.intersectionRatio > 0) {
            observer.unobserve(change.target);
            let album = decodeURI(change.target.getAttribute('data-album'));
            sendAPI("MPD_API_DATABASE_TAG_ALBUM_TITLE_LIST", {"album": album, "search": app.current.search, "tag": app.current.view, "cols": settings.colsBrowseDatabase}, parseListTitles);
        }
    });
}

function parseListTitles(obj) {
    let id = genId(obj.result.Album);
    let card = document.getElementById('card' + id)
    let table = card.getElementsByTagName('table')[0];
    let tbody = card.getElementsByTagName('tbody')[0];
    let cardFooter = card.querySelector('.card-footer');
    let cardHeader = card.querySelector('.card-header');
    cardHeader.setAttribute('data-uri', encodeURI(obj.result.data[0].uri.replace(/\/[^/]+$/, '')));
    cardHeader.setAttribute('data-name', obj.result.Album);
    cardHeader.setAttribute('data-type', 'dir');
    cardHeader.addEventListener('click', function(event) {
        showMenu(this, event);
    }, false);
    cardHeader.classList.add('clickable');
    table.addEventListener('keydown', function(event) {
        navigateTable(this, event.key);
    }, false);
    let img = card.getElementsByTagName('a')[0];
    if (img && obj.result.data.length > 0) {
        img.style.backgroundImage = 'url("' + subdir + '/albumart/' + obj.result.data[0].uri + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
        img.setAttribute('data-uri', encodeURI(obj.result.data[0].uri.replace(/\/[^/]+$/, '')));
        img.setAttribute('data-name', obj.result.Album);
        img.setAttribute('data-type', 'dir');
        img.addEventListener('click', function(event) {
            showMenu(this, event);
        }, false);
    }

    document.getElementById('albumartist' + id).innerText = obj.result.AlbumArtist;

    let titleList = '';
    let nrItems = obj.result.returnedEntities;
    for (let i = 0; i < nrItems; i++) {
        if (obj.result.data[i].Duration) {
            obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
        }
        titleList += '<tr tabindex="0" data-type="song" data-name="' + obj.result.data[i].Title + '" data-uri="' + encodeURI(obj.result.data[i].uri) + '">';
        for (let c = 0; c < settings.colsBrowseDatabase.length; c++) {
            titleList += '<td data-col="' + settings.colsBrowseDatabase[c] + '">' + e(obj.result.data[i][settings.colsBrowseDatabase[c]]) + '</td>';
        }
        // titleList += '<td data-col="Add" title="Append to queue"><a href="#" class="material-icons color-darkgrey">add</a></td></tr>';
        titleList += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td></tr>';
    }
    tbody.innerHTML = titleList;
    cardFooter.innerHTML = t('Num songs', obj.result.totalEntities) + ' &ndash; ' + beautifyDuration(obj.result.totalTime);

    tbody.parentNode.addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            // appendQueue('song', decodeURI(event.target.parentNode.getAttribute('data-uri')), event.target.parentNode.getAttribute('data-name'));
            appendPlayQueue('song', decodeURI(event.target.parentNode.getAttribute('data-uri')), event.target.parentNode.getAttribute('data-name'));
        }
        else if (event.target.nodeName === 'A') {
            /* if (event.target.parentNode.getAttribute('data-col') === 'Add') {
                event.preventDefault();
                event.stopPropagation();
                let type = event.target.parentNode.parentNode.getAttribute('data-type');
                let uri = decodeURI(event.target.parentNode.parentNode.getAttribute('data-uri'));
                let name = event.target.parentNode.parentNode.getAttribute('data-name');
                appendQueue(type, uri, name);
            }
            else { */ // Action
                showMenu(event.target, event);
            // }
        }
    }, false);
}

function addAllFromBrowseFilesystem() {
    sendAPI("MPD_API_QUEUE_ADD_TRACK", {"uri": app.current.search});
    showNotification(t('Added all songs'), '', '', 'success');
}

function addAllFromBrowseDatabasePlist(plist) {
    if (app.current.search.length >= 2) {
        sendAPI("MPD_API_DATABASE_SEARCH", {"plist": plist, "filter": app.current.view, "searchstr": app.current.search, "offset": 0, "cols": settings.colsSearchDatabase});
    }
}

function parseBookmarks(obj) {
    let list = '<table class="table table-sm table-dark table-borderless mb-0">';
    for (let i = 0; i < obj.result.returnedEntities; i++) {
        list += '<tr data-id="' + obj.result.data[i].id + '" data-type="' + obj.result.data[i].type + '" ' +
                'data-uri="' + encodeURI(obj.result.data[i].uri) + '">' +
                '<td class="nowrap"><a class="text-light" href="#" data-href="goto">' + e(obj.result.data[i].name) + '</a></td>' +
                '<td><a class="text-light material-icons material-icons-small" href="#" data-href="edit">edit</a></td><td>' +
                '<a class="text-light material-icons material-icons-small" href="#" data-href="delete">delete</a></td></tr>';
    }
    if (obj.result.returnedEntities === 0) {
        list += '<tr><td class="text-light nowrap">' + t('No bookmarks found') + '</td></tr>';
    }
    list += '</table>';
    document.getElementById('BrowseFilesystemBookmarks').innerHTML = list;
}

function showBookmarkSave(id, name, uri, type) {
    document.getElementById('saveBookmarkName').classList.remove('is-invalid');
    document.getElementById('saveBookmarkId').value = id;
    document.getElementById('saveBookmarkName').value = name;
    document.getElementById('saveBookmarkUri').value = uri;
    document.getElementById('saveBookmarkType').value = type;
    modalSaveBookmark.show();
}

//eslint-disable-next-line no-unused-vars
function saveBookmark() {
    let id = parseInt(document.getElementById('saveBookmarkId').value);
    let name = document.getElementById('saveBookmarkName').value;
    let uri = document.getElementById('saveBookmarkUri').value;
    let type = document.getElementById('saveBookmarkType').value;
    if (name !== '') {
        sendAPI("MYMPD_API_BOOKMARK_SAVE", {"id": id, "name": name, "uri": uri, "type": type});
        modalSaveBookmark.hide();
    }
    else {
        document.getElementById('saveBookmarkName').classList.add('is-invalid');
    }
}

function parseCovergrid(obj) {
    let nrItems = obj.result.returnedEntities;
    let cardContainer = document.getElementById('BrowseCovergridList');
    let cols = cardContainer.getElementsByClassName('col');
    if (cols.length === 0) {
        cardContainer.innerHTML = '';
    }
    for (let i = 0; i < nrItems; i++) {
        let col = document.createElement('div');
        col.classList.add('col', 'px-0', 'flex-grow-0');
        if (obj.result.data[i].AlbumArtist === '') {
            obj.result.data[i].AlbumArtist = t('Unknown artist');
        }
        if (obj.result.data[i].Album === '') {
            obj.result.data[i].Album = t('Unknown album');
        }
        let id = genId('covergrid' + obj.result.data[i].Album + obj.result.data[i].AlbumArtist);
        let t = app.current.app === 'Playback' ? 'card-grid-2' : '';
        let t2 = app.current.app === 'Playback' ? 'album-cover-grid-2' : '';
        let html = '<div class="card card-grid '+t+' clickable" data-uri="' + encodeURI(obj.result.data[i].FirstSongUri) + '" ' +
                       'data-album="' + encodeURI(obj.result.data[i].Album) + '" ' +
                       'data-albumartist="' + encodeURI(obj.result.data[i].AlbumArtist) + '" tabindex="0">' +
                   '<div class="card-header covergrid-header hide unvisible"></div>' +
                   '<div class="card-body album-cover-loading album-cover-grid '+t2+' bg-white" id="' + id + '"></div>' +
                   '<div class="card-footer card-footer-grid p-2" title="' + obj.result.data[i].AlbumArtist + ': ' + obj.result.data[i].Album + '">' +
                   obj.result.data[i].Album + '<br/><small>' + obj.result.data[i].AlbumArtist + '</small>' +
                   '</div></div>';
        col.innerHTML = html;
        let replaced = false;
        if (i < cols.length) {
            if (cols[i].firstChild.getAttribute('data-uri') !== col.firstChild.getAttribute('data-uri')) {
                cols[i].replaceWith(col);
                replaced = true;
                // console.log('rplc');
            }
            else {
                // console.log('else');
                document.getElementById(id).style.width = '';
                document.getElementById(id).style.height = '';
                cols[i].firstChild.style.width = '';
                if (app.current.app === 'Playback') {
                    if (!cols[i].firstChild.classList.contains('card-grid-2'))
                        cols[i].firstChild.classList.add('card-grid-2');
                    if (!document.getElementById(id).classList.contains('album-cover-grid-2'))
                        document.getElementById(id).classList.add('album-cover-grid-2');
                }
                if (app.current.app === 'Browse') {
                    if (cols[i].firstChild.classList.contains('card-grid-2'))
                        cols[i].firstChild.classList.remove('card-grid-2');
                    if (document.getElementById(id).classList.contains('album-cover-grid-2'))
                        document.getElementById(id).classList.remove('album-cover-grid-2');
                }
            }
        }
        else {
            cardContainer.append(col);
            replaced = true;
        }
        if ('IntersectionObserver' in window && replaced === true) {
            let options = {
                root: null,
                rootMargin: '0px',
            };
            let observer = new IntersectionObserver(setGridImage, options);
            observer.observe(col);
        }
        else if (replaced === true) {
            col.firstChild.firstChild.style.backgroundImage = 'url("' + subdir + '/albumart/' + obj.result.data[i].uri + '")';
        }
        if (replaced === true) {
            col.firstChild.addEventListener('click', function(event) {
                if (event.target.classList.contains('card-body')) {
                    getCovergridTitleList(id);
                }
                else if (event.target.classList.contains('card-footer') ||
                         event.target.classList.contains('card-header')) {
                    showMenu(event.target, event);
                }
            }, false);
            col.firstChild.addEventListener('transitionend', function(event) {
                if (event.target.getElementsByClassName('card-body')[0].style.backgroundImage !== '' ||
                    openCoverId === undefined) {
                    return;
                }
                event.target.getElementsByTagName('table')[0].classList.remove('unvisible');
                event.target.getElementsByClassName('card-header')[0].classList.remove('unvisible');
            }, false);
            col.firstChild.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    let cardBody = event.target.getElementsByClassName('card-body')[0];
                    let uri = decodeURI(cardBody.parentNode.getAttribute('data-uri'));
                    showGridImage(cardBody, uri);
                    openCoverId = undefined;
                }
                else if (event.key === 'Enter') {
                    getCovergridTitleList(id);
                    event.stopPropagation();
                    event.preventDefault();
                }
                else if (event.key === ' ') {
                    showMenu(event.target.getElementsByClassName('card-footer')[0], event);
                    event.stopPropagation();
                    event.preventDefault();
                }
            }, false);
        }
    }
    let colsLen = cols.length - 1;
    for (let i = colsLen; i >= nrItems; i --) {
        cols[i].remove();
    }

    if (app.current.app === 'Browse' && app.current.tab === 'Covergrid')
        setPagination(obj.result.totalEntities, obj.result.returnedEntities);
    else // playback
        setPagination(obj.result.totalEntities, obj.result.returnedEntities, 'BrowseCovergrid');

    if (nrItems === 0) {
        cardContainer.innerHTML = t('Empty list');
    }
    // document.getElementById(app.current.app + (app.current.tab === undefined ? '' : app.current.tab) + 'List').classList.remove('opacity05');
    document.getElementById('BrowseCovergridList').classList.remove('opacity05');
    document.getElementById('cardFooterBrowse').innerText = gtPage('Num entries', obj.result.returnedEntities, obj.result.totalEntities);

    parseCovergridAlbum(obj);
    closeCover();
    // console.log('parsecovergridret');
}

function getCovergridTitleList(id) {
    closeCover(id);
    let cardBody = document.getElementById(id);
    let card = cardBody.parentNode;
    card.classList.add('opacity05');
    let s = document.getElementById('BrowseCovergridList').childNodes[1];
    let width;
    if (s) {
        let p = parseInt(window.getComputedStyle(document.getElementById('cardBrowseCovergrid'), null).getPropertyValue('padding-left'));
        width = s.offsetLeft + settings.covergridSize - p; // 2
    }
    else {
        width = settings.covergridSize * 2 + 20; // 2
    }
    cardBody.style.width = width + 'px';
    cardBody.parentNode.style.width = width + 'px';
    sendAPI("MPD_API_DATABASE_TAG_ALBUM_TITLE_LIST", {"album": decodeURI(card.getAttribute('data-album')),
        "search": decodeURI(card.getAttribute('data-albumartist')),
        "tag": "AlbumArtist", "cols": settings.colsBrowseDatabase}, parseCovergridTitleList);
}

function parseCovergridTitleList(obj) {
    let id = genId('covergrid' + obj.result.Album + obj.result.AlbumArtist);
    let cardBody = document.getElementById(id);

    let titleList = '<table class="table table-hover table-sm unvisible" tabindex="0"><thead>';
    for (let i = 0; i < settings.colsBrowseDatabase.length; i++) {
        let h = settings.colsBrowseDatabase[i];
        if (h === 'Track') {
            h = '#';
        }
        titleList += '<th class="border-top-0">' + t(h) + '</th>';
    }
    titleList += '<th class="border-top-0"></th></thead><tbody class="clickable">';
    let nrItems = obj.result.returnedEntities;
    for (let i = 0; i < nrItems; i++) {
        if (obj.result.data[i].Duration) {
            obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
        }
        titleList += '<tr tabindex="0" data-type="song" data-name="' + obj.result.data[i].Title + '" data-uri="' + encodeURI(obj.result.data[i].uri) + '">';
        for (let c = 0; c < settings.colsBrowseDatabase.length; c++) {
            titleList += '<td data-col="' + settings.colsBrowseDatabase[c] + '">' + e(obj.result.data[i][settings.colsBrowseDatabase[c]]) + '</td>';
        }
        titleList += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td></tr>';
    }
    titleList += '</tbody></table>';

    let uri = decodeURI(cardBody.parentNode.getAttribute('data-uri'));
    let cardFooter = cardBody.parentNode.getElementsByClassName('card-footer')[0];
    let cardHeader = cardBody.parentNode.getElementsByClassName('card-header')[0];
    cardHeader.innerHTML = '<button class="close" type="button">&times;</button><img class="covergrid-header" src="' + subdir + '/albumart/' + uri + '"/>' +
        cardFooter.innerHTML + '';
    cardHeader.classList.remove('hide');
    cardFooter.classList.add('hide');

    cardBody.style.backgroundImage = '';
    cardBody.classList.remove('album-cover-loading');
    cardBody.style.height = 'auto';

    cardBody.innerHTML = titleList;
    cardBody.parentNode.classList.remove('opacity05');
    cardHeader.getElementsByClassName('close')[0].addEventListener('click', function(event) {
        event.stopPropagation();
        showGridImage(cardBody, uri);
        openCoverId = undefined;
    }, false);

    let table = cardBody.getElementsByTagName('table')[0];
    table.addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            // appendQueue('song', decodeURI(event.target.parentNode.getAttribute('data-uri')), event.target.parentNode.getAttribute('data-name'));
            appendPlayQueue('song', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
        }
        else if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        }
    }, false);
    table.addEventListener('keydown', function(event) {
        navigateTable(this, event.key);
        if (event.key === 'Escape') {
            event.target.parentNode.parentNode.parentNode.parentNode.focus();
        }
    }, false);

    //fallback if transitionEnd is not fired
    setTimeout(function() {
        cardBody.getElementsByTagName('table')[0].classList.remove('unvisible');
        cardBody.parentNode.getElementsByClassName('card-header')[0].classList.remove('unvisible');
        scrollFocusIntoView();
    }, 500);
}

function showGridImage(cardBody, uri) {
    cardBody.innerHTML = '';
    cardBody.style.backgroundImage = 'url("' + subdir + '/albumart/' + uri + '")';
    cardBody.style.width = 'var(--mympd-covergridsize, 200px)';
    cardBody.style.height = 'var(--mympd-covergridsize, 200px)';
    cardBody.parentNode.style.width = 'var(--mympd-covergridsize, 200px)';
    if (app.current.app === 'Playback') {
        // console.log(1);
        cardBody.style.width = 'var(--mympd-covergridsize2, 100px)';
        cardBody.style.height = 'var(--mympd-covergridsize2, 100px)';
        cardBody.parentNode.style.width = 'var(--mympd-covergridsize2, 100px)';
    }
    cardBody.parentNode.getElementsByClassName('card-footer')[0].classList.remove('hide');
    cardBody.parentNode.getElementsByClassName('card-header')[0].classList.add('hide', 'unvisible');
}

function setGridImage(changes, observer) {
    changes.forEach(change => {
        if (change.intersectionRatio > 0) {
            observer.unobserve(change.target);
            let uri = decodeURI(change.target.firstChild.getAttribute('data-uri'));
            change.target.firstChild.getElementsByClassName('card-body')[0].style.backgroundImage = 'url("' + subdir + '/albumart/' + uri + '")';
        }
    });
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

//eslint-disable-next-line no-unused-vars
var keymap = {
    "ArrowLeft": {"cmd": "clickPrev", "options": [], "desc": "Previous song", "key": "keyboard_arrow_left"},
    "ArrowRight": {"cmd": "clickNext", "options": [], "desc": "Next song", "key": "keyboard_arrow_right"},
    " ": {"cmd": "clickPlay", "options": [], "desc": "Toggle play / pause", "key": "space_bar"},
    "s": {"cmd": "clickStop", "options": [], "desc": "Stop playing"},
    "-": {"cmd": "volumeStep", "options": ["down"], "desc": "Volume down"},
    "+": {"cmd": "VolumeStep", "options": ["up"], "desc": "Volume up"},
    "c": {"cmd": "sendAPI", "options": [{"cmd": "MPD_API_QUEUE_CLEAR"}], "desc": "Clear queue"},
    "u": {"cmd": "updateDB", "options": [], "desc": "Update database"},
    "r": {"cmd": "rescanDB", "options": [], "desc": "Rescan database"},
    "p": {"cmd": "updateSmartPlaylists", "options": [], "desc": "Update smart playlists", "req": "featSmartpls"},
    "a": {"cmd": "showAddToPlaylist", "options": ["stream", ""], "desc": "Add stream"},
    "t": {"cmd": "openModal", "options": ["modalSettings"], "desc": "Open settings"},
    "i": {"cmd": "clickTitle", "options": [], "desc": "Open song details"},
    "l": {"cmd": "openDropdown", "options": ["dropdownLocalPlayer"], "desc": "Open local player"},
    "0": {"cmd": "appGoto", "options": ["Playback"], "desc": "Goto playback"},
    "1": {"cmd": "appGoto", "options": ["Queue", "Current"], "desc": "Goto queue"},
    "2": {"cmd": "appGoto", "options": ["Queue", "LastPlayed"], "desc": "Goto last played"},
    "3": {"cmd": "appGoto", "options": ["Browse", "Database"], "desc": "Goto browse database", "req": "featTags"},
    "4": {"cmd": "appGoto", "options": ["Browse", "Playlists"], "desc": "Goto browse playlists", "req": "featPlaylists"},
    "5": {"cmd": "appGoto", "options": ["Browse", "Filesystem"], "desc": "Goto browse filesystem"},
    "6": {"cmd": "appGoto", "options": ["Browse", "Covergrid"], "desc": "Goto browse covergrid", "req": "featTags"},
    "7": {"cmd": "appGoto", "options": ["Search","Database"], "desc": "Goto search"},
    "8": {"cmd": "appGoto", "options": ["Search","Tidal"], "desc": "Goto search tidal"},
    "m": {"cmd": "openDropdown", "options": ["dropdownMainMenu"], "desc": "Open main menu"},
    "v": {"cmd": "openDropdown", "options": ["dropdownVolumeMenu"], "desc": "Open volume menu"},
    "S": {"cmd": "sendAPI", "options": [{"cmd": "MPD_API_QUEUE_SHUFFLE"}], "desc": "Shuffle queue"},
    "C": {"cmd": "sendAPI", "options": [{"cmd": "MPD_API_QUEUE_CROP"}], "desc": "Crop queue"},
    "?": {"cmd": "openModal", "options": ["modalAbout"], "desc": "Open about"},
    "/": {"cmd": "focusSearch", "options": [], "desc": "Focus search"},
    "n": {"cmd": "focusTable", "options": [], "desc": "Focus table"},
    // "q": {"cmd": "queueSelectedItem", "options": [true], "desc": "Append item to queue"},
    "q": {"cmd": "queueSelectedItem", "options": [true], "desc": "Add item to queue"},
    "Q": {"cmd": "queueSelectedItem", "options": [false], "desc": "Replace queue with item"},
    "d": {"cmd": "dequeueSelectedItem", "options": [], "desc": "Remove item from queue"},
    // "x": {"cmd": "addSelectedItemToPlaylist", "options": [], "desc": "Append item to playlist"}
    "x": {"cmd": "addSelectedItemToPlaylist", "options": [], "desc": "Add item to playlist"}
};
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function e(x) {
    if (isNaN(x)) {
        return x.replace(/([<>"])/g, function(m0, m1) {
            if (m1 === '<') return '&lt;';
            else if (m1 === '>') return '&gt;';
            else if (m1 === '"') return '&quot;';
        });
    }
    else {
        return x;
    }
}

function t(phrase, number, data) {
    let result = undefined;
    if (isNaN(number)) {
        data = number;
    }

    if (phrases[phrase]) {
        result = phrases[phrase][locale];
        if (result === undefined) {
            if (locale !== 'en-US') {
                logWarn('Phrase "' + phrase + '" for locale ' + locale + ' not found');
            }
            result = phrases[phrase]['en-US'];
        }
    }
    if (result === undefined) {
        result = phrase;
    }

    if (isNaN(number) === false) {
        let p = result.split(' |||| ');
        if (p.length > 1) {
            result = p[smartCount(number)];
        }
        result = result.replace('%{smart_count}', number);
    }
    
    if (data !== null) {
        result = result.replace(/%\{(\w+)\}/g, function(m0, m1) {
            return data[m1];
        });
    }

    return e(result);
}

function smartCount(number) {
    if (number === 0) { return 1; }
    else if (number === 1) { return 0; }
    else { return 1; }
}

function localeDate(secs) {
    let d;
    if (secs === undefined) {
       d  = new Date();
    }
    else {
        d = new Date(secs * 1000);
    }
    return d.toLocaleString(locale);
}

function beautifyDuration(x) {
    let days = Math.floor(x / 86400);
    let hours = Math.floor(x / 3600) - days * 24;
    let minutes = Math.floor(x / 60) - hours * 60 - days * 1440;
    let seconds = x - days * 86400 - hours * 3600 - minutes * 60;

    return (days > 0 ? days + '\u2009'+ t('Days') + ' ' : '') +
        (hours > 0 ? hours + '\u2009' + t('Hours') + ' ' +
        (minutes < 10 ? '0' : '') : '') + minutes + '\u2009' + t('Minutes') + ' ' +
        (seconds < 10 ? '0' : '') + seconds + '\u2009' + t('Seconds');
}

function beautifySongDuration(x) {
    let hours = Math.floor(x / 3600);
    let minutes = Math.floor(x / 60) - hours * 60;
    let seconds = x - hours * 3600 - minutes * 60;

    return (hours > 0 ? hours + ':' + (minutes < 10 ? '0' : '') : '') +
        minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function gtPage(phrase, returnedEntities, totalEntities, limit = settings.maxElementsPerPage) {
    if (totalEntities > -1) {
        return t(phrase, totalEntities);
    }
    else if (returnedEntities + app.current.page < limit) {
        return t(phrase, returnedEntities);
    }
    else {
        return '> ' + t(phrase, limit);
    }
}

function i18nHtml(root) {
    let attributes = [['data-phrase', 'innerText'], ['data-title-phrase', 'title'], ['data-placeholder-phrase', 'placeholder']];
    for (let i = 0; i < attributes.length; i++) {
        let els = root.querySelectorAll('[' + attributes[i][0] + ']');
        let elsLen = els.length;
        for (let j = 0; j < elsLen; j++) {
            els[j][attributes[i][1]] = t(els[j].getAttribute(attributes[i][0]));
        }
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function logError(line) {
    logLog(0, 'ERROR: ' + line);
}

function logWarn(line) {
    logLog(1, 'WARN: ' + line);
}

function logInfo(line) {
    logLog(2, 'INFO: ' + line);
}

function logVerbose(line) {
    logLog(3, 'VERBOSE: ' + line);
}

function logDebug(line) {
    logLog(4, 'DEBUG: ' + line);
}

function logLog(loglevel, line) {
    if (settings.loglevel >= loglevel) {
        if (loglevel === 0) {
            console.error(line);
        }
        else if (loglevel === 1) {
            console.warn(line);
        }
        else if (loglevel === 4) {
            console.debug(line);
        }
        else {
            console.log(line);
        }
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

async function localplayerPlay() {
    let localPlayer = document.getElementById('localPlayer');
    if (localPlayer.paused) {
        try {
            await localPlayer.play();
        }
        catch(err) {
            showNotification(t('Local playback'), t('Can not start playing'), '', 'danger');
        }
    }
}

//eslint-disable-next-line no-unused-vars
function addStream() {
    let streamUriEl = document.getElementById('streamUrl');
    if (validateStream(streamUriEl) === true) {
        sendAPI("MPD_API_QUEUE_ADD_TRACK", {"uri": streamUriEl.value});
        modalAddToPlaylist.hide();
        showNotification(t('Added stream %{streamUri} to queue', {"streamUri": streamUriEl.value}), '', '', 'success');
    }
}

function seekRelativeForward() {
    seekRelative(5);
}

function seekRelativeBackward() {
    seekRelative(-5);
}

function seekRelative(offset) {
    sendAPI("MPD_API_SEEK_CURRENT", {"seek": offset, "relative": true});
}

//eslint-disable-next-line no-unused-vars
function clickPlay() {
    if (playstate !== 'play') {
        sendAPI("MPD_API_PLAYER_PLAY", {});
    }
    else {
        sendAPI("MPD_API_PLAYER_PAUSE", {});
    }
}

//eslint-disable-next-line no-unused-vars
function clickStop() {
    sendAPI("MPD_API_PLAYER_STOP", {});
}

//eslint-disable-next-line no-unused-vars
function clickPrev() {
    sendAPI("MPD_API_PLAYER_PREV", {});
}

//eslint-disable-next-line no-unused-vars
function clickNext() {
    sendAPI("MPD_API_PLAYER_NEXT", {});
}

//eslint-disable-next-line no-unused-vars
function execSyscmd(cmd) {
    sendAPI("MYMPD_API_SYSCMD", {"cmd": cmd});
}

//eslint-disable-next-line no-unused-vars
function clearCovercache() {
    sendAPI("MYMPD_API_COVERCACHE_CLEAR", {});
}

//eslint-disable-next-line no-unused-vars
function cropCovercache() {
    sendAPI("MYMPD_API_COVERCACHE_CROP", {});
}

//eslint-disable-next-line no-unused-vars
function updateDB(uri) {
    sendAPI("MPD_API_DATABASE_UPDATE", {"uri": uri});
    updateDBstarted(true);
}

//eslint-disable-next-line no-unused-vars
function rescanDB(uri) {
    sendAPI("MPD_API_DATABASE_RESCAN", {"uri": uri});
    updateDBstarted(true);
}

function updateDBstarted(showModal) {
    if (showModal === true) {
        document.getElementById('updateDBfinished').innerText = '';
        document.getElementById('updateDBfooter').classList.add('hide');
        let updateDBprogress = document.getElementById('updateDBprogress');
        updateDBprogress.style.width = '20px';
        updateDBprogress.style.marginLeft = '-20px';
        modalUpdateDB.show();
        updateDBprogress.classList.add('updateDBprogressAnimate');
    }
    else {
        showNotification(t('Database update started'), '', '', 'success');
    }
}

function updateDBfinished(idleEvent) {
    if (document.getElementById('modalUpdateDB').classList.contains('show')) {
        if (idleEvent === 'update_database') {
            document.getElementById('updateDBfinished').innerText = t('Database successfully updated');
        }
        else if (idleEvent === 'update_finished') {
            document.getElementById('updateDBfinished').innerText = t('Database update finished');
        }
        let updateDBprogress = document.getElementById('updateDBprogress');
        updateDBprogress.classList.remove('updateDBprogressAnimate');
        updateDBprogress.style.width = '100%';
        updateDBprogress.style.marginLeft = '0px';
        document.getElementById('updateDBfooter').classList.remove('hide');
    }
    else {
        if (idleEvent === 'update_database') {
            showNotification(t('Database successfully updated'), '', '', 'success');
        }
        else if (idleEvent === 'update_finished') {
            showNotification(t('Database update finished'), '', '', 'success');
        }
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

/* Disable eslint warnings */
/* global Modal, Dropdown, Collapse, Popover, Carousel */

var socket = null;
var lastSong = '';
var lastSongObj = {};
var lastState;
var currentSong = new Object();
var playstate = '';
var settingsLock = false;
var settingsParsed = false;
var settingsNew = {};
var settings = {};
settings.loglevel = 2;
var alertTimeout = null;
var progressTimer = null;
var deferredPrompt;
var dragEl;
var playlistEl;
var websocketConnected = false;
var websocketTimer = null;
var appInited = false;
var subdir = '';
var uiEnabled = true;
var locale = navigator.language || navigator.userLanguage;

var ligatureMore = 'menu';

var app = {};
app.apps = { "Playback": { "state": "0/AlbumArtist/AlbumArtist/", "scrollPos": 0 },
                /* "active": "Covergrid",
                "tabs": { "Covergrid": {"state": "0/AlbumArtist/AlbumArtist/", "scrollPos": 0 } }
             }, */
            //  "Playback":   { "state": "0/-/-/", "scrollPos": 0 },
             "Queue":	   {
                  "active": "Current",
                  "tabs": { "Current": { "state": "0/any/-/", "scrollPos": 0 },
                            "LastPlayed": { "state": "0/any/-/", "scrollPos": 0 }
                          }
                  },
             "Browse":     {
                  "active": "Covergrid", // "Database"
                  "tabs":  { "Filesystem": { "state": "0/-/-/", "scrollPos": 0 },
                             "Playlists":  {
                                    "active": "All",
                                    "views": { "All":    { "state": "0/-/-/", "scrollPos": 0 },
                                               "Detail": { "state": "0/-/-/", "scrollPos": 0 }
                                    }
                             },
                             "Database":   {
                                    "active": "AlbumArtist",
                                    "views": {
                                     }
                             },
                             "Covergrid":  { "state": "0/AlbumArtist/AlbumArtist/", "scrollPos": 0 }
                  }
             },
             // radio/mix(/track) view plus back history
             "Search":     {
                 "active": "Database",
                 "tabs": { "Database": { "state": "0/any/-/", "scrollPos": 0 },
                           "Tidal": {
                               "active": "All",
                               "views": { "All": { "state": "0/any/-/", "scrollPos": 0 },
                                          "Album": { "state": "0/any/-/", "scrollPos": 0 },
                                          "Artist": { "state": "0/any/-/", "scrollPos": 0 },
                                          "ArtistRadio": { "state": "0/any/-/", "scrollPos": 0 },
                                          "TrackRadio": { "state": "0/any/-/", "scrollPos": 0 }
                               }
                 },
                           "Qobuz": {
                               "active": "All",
                               "views": { "All": { "state": "0/any/-/", "scrollPos": 0 },
                                          "Album": { "state": "0/any/-/", "scrollPos": 0 },
                                          "Artist": { "state": "0/any/-/", "scrollPos": 0 }
                               }
                           }
                 }
             }
           };

// app.current = { "app": "Playback", "tab": undefined, "view": undefined, "page": 0, "filter": "", "search": "", "sort": "", "scrollPos": 0 };
app.current = { "app": "Playback", "tab": undefined, "view": undefined, "page": 0, "filter": "AlbumArtist", "search": "", "sort": "AlbumArtist", "scrollPos": 0 };
app.last = { "app": undefined, "tab": undefined, "view": undefined, "filter": "", "search": "", "sort": "", "scrollPos": 0 };
// wip tq views history wip
app.back1 = { "app": undefined, "tab": undefined, "view": undefined, "filter": "", "search": "", "sort": "", "scrollPos": 0 };

var domCache = {};
domCache.navbarBottomBtns = document.getElementById('navbar-bottom').getElementsByTagName('div');
domCache.navbarBottomBtnsLen = domCache.navbarBottomBtns.length;
domCache.cardHeaderBrowse = document.getElementById('cardHeaderBrowse').getElementsByTagName('a');
domCache.cardHeaderBrowseLen = domCache.cardHeaderBrowse.length;
domCache.cardHeaderQueue = document.getElementById('cardHeaderQueue').getElementsByTagName('a');
domCache.cardHeaderQueueLen = domCache.cardHeaderQueue.length;
domCache.cardHeaderSearch = document.getElementById('cardHeaderSearch').getElementsByTagName('a');
domCache.cardHeaderSearchLen = domCache.cardHeaderSearch.length;
domCache.counter = document.getElementById('counter');
domCache.volumePrct = document.getElementById('volumePrct');
domCache.volumeControl = document.getElementById('volumeControl');
domCache.volumeMenu = document.getElementById('volumeMenu');
domCache.btnsPlay = document.getElementsByClassName('btnPlay');
domCache.btnsPlayLen = domCache.btnsPlay.length;
domCache.btnPrev = document.getElementById('btnPrev');
domCache.btnNext = document.getElementById('btnNext');
domCache.progressBar = document.getElementById('progressBar');
domCache.volumeBar = document.getElementById('volumeBar');
domCache.outputs = document.getElementById('outputs');
domCache.btnAdd = document.getElementById('nav-add2homescreen');
domCache.currentCover = document.getElementById('currentCover');
domCache.currentTitle = document.getElementById('currentTitle');
domCache.btnVoteUp = document.getElementById('btnVoteUp');
domCache.btnVoteDown = document.getElementById('btnVoteDown');
domCache.badgeQueueItems = document.getElementById('badgeQueueItems');
domCache.searchstr = document.getElementById('searchstr');
domCache.searchCrumb = document.getElementById('searchCrumb');
domCache.searchtidalstr = document.getElementById('searchtidalstr');
domCache.searchqobuzstr = document.getElementById('searchqobuzstr');
domCache.body = document.getElementsByTagName('body')[0];

/* eslint-disable no-unused-vars */
var modalConnection = new Modal(document.getElementById('modalConnection'));
var modalSettings = new Modal(document.getElementById('modalSettings'));
var modalAbout = new Modal(document.getElementById('modalAbout'));
var modalSaveQueue = new Modal(document.getElementById('modalSaveQueue'));
var modalAddToQueue = new Modal(document.getElementById('modalAddToQueue'));
var modalSongDetails = new Modal(document.getElementById('modalSongDetails'));
var modalAlbumDetails = new Modal(document.getElementById('modalAlbumDetails'));
var modalArtistDetails = new Modal(document.getElementById('modalArtistDetails'));
var modalAddToPlaylist = new Modal(document.getElementById('modalAddToPlaylist'));
var modalRenamePlaylist = new Modal(document.getElementById('modalRenamePlaylist'));
var modalUpdateDB = new Modal(document.getElementById('modalUpdateDB'));
var modalSaveSmartPlaylist = new Modal(document.getElementById('modalSaveSmartPlaylist'));
var modalDeletePlaylist = new Modal(document.getElementById('modalDeletePlaylist'));
var modalSaveBookmark = new Modal(document.getElementById('modalSaveBookmark'));
var modalTimer = new Modal(document.getElementById('modalTimer'));
var modalSetup = new Modal(document.getElementById('modalSetup'));

var dropdownMainMenu;
var dropdownVolumeMenu = new Dropdown(document.getElementById('volumeMenu'));
var dropdownBookmarks = new Dropdown(document.getElementById('BrowseFilesystemBookmark'));
var dropdownLocalPlayer = new Dropdown(document.getElementById('localPlaybackMenu'));
var dropdownPlay = new Dropdown(document.getElementById('btnPlayDropdown'));
var dropdownCovergridSort = new Dropdown(document.getElementById('btnCovergridSortDropdown'));

var collapseDBupdate = new Collapse(document.getElementById('navDBupdate'));
var collapseSyscmds = new Collapse(document.getElementById('navSyscmds'));
var collapseJukeboxMode = new Collapse(document.getElementById('labelJukeboxMode'));
/* eslint-enable no-unused-vars */

function appPrepare(scrollPos) {
    if (app.current.app !== app.last.app || app.current.tab !== app.last.tab || app.current.view !== app.last.view) {
        //Hide all cards + nav
        for (let i = 0; i < domCache.navbarBottomBtnsLen; i++) {
            domCache.navbarBottomBtns[i].classList.remove('active');
        }
        document.getElementById('cardPlayback').classList.add('hide');
        document.getElementById('cardQueue').classList.add('hide');
        document.getElementById('cardBrowse').classList.add('hide');
        document.getElementById('cardSearch').classList.add('hide');
        for (let i = 0; i < domCache.cardHeaderBrowseLen; i++) {
            domCache.cardHeaderBrowse[i].classList.remove('active');
        }
        for (let i = 0; i < domCache.cardHeaderQueueLen; i++) {
            domCache.cardHeaderQueue[i].classList.remove('active');
        }
        for (let i = 0; i < domCache.cardHeaderSearchLen; i++) {
            domCache.cardHeaderSearch[i].classList.remove('active');
        }
        document.getElementById('cardQueueCurrent').classList.add('hide');
        document.getElementById('cardQueueLastPlayed').classList.add('hide');
        document.getElementById('cardBrowsePlaylists').classList.add('hide');
        document.getElementById('cardBrowseDatabase').classList.add('hide');
        document.getElementById('cardBrowseFilesystem').classList.add('hide');
        document.getElementById('cardSearchDatabase').classList.add('hide');
        document.getElementById('cardSearchTidal').classList.add('hide');
        document.getElementById('cardSearchQobuz').classList.add('hide');
        document.getElementById('cardBrowseCovergrid').classList.add('hide');
        //show active card + nav
        setGridPlayback();
        document.getElementById('card' + app.current.app).classList.remove('hide');
        if (document.getElementById('nav' + app.current.app)) {
            document.getElementById('nav' + app.current.app).classList.add('active');
        }
        if (app.current.tab !== undefined) {
            document.getElementById('card' + app.current.app + app.current.tab).classList.remove('hide');
            document.getElementById('card' + app.current.app + 'Nav' + app.current.tab).classList.add('active');
        }
        scrollToPosY(scrollPos);
    }
    let list = document.getElementById(app.current.app +
        (app.current.tab === undefined ? '' : app.current.tab) +
        (app.current.view === undefined ? '' : app.current.view) + 'List');
    if (list) {
        list.classList.add('opacity05');
    }
    else { // playback
        // document.getElementById('QueueCurrentList').classList.add('opacity05');
        document.getElementById('QueueMiniList').classList.add('opacity05');
        document.getElementById('BrowseCovergridList').classList.add('opacity05');
    }
}

function appGoto(card, tab, view, state) {
    let scrollPos = 0;
    if (document.body.scrollTop) {
        scrollPos = document.body.scrollTop
    }
    else {
        scrollPos = document.documentElement.scrollTop;
    }

    if (app.apps[app.current.app].scrollPos !== undefined) {
        app.apps[app.current.app].scrollPos = scrollPos
    }
    else if (app.apps[app.current.app].tabs[app.current.tab].scrollPos !== undefined) {
        app.apps[app.current.app].tabs[app.current.tab].scrollPos = scrollPos
    }
    else if (app.apps[app.current.app].tabs[app.current.tab].views[app.current.view].scrollPos !== undefined) {
        app.apps[app.current.app].tabs[app.current.tab].views[app.current.view].scrollPos = scrollPos;
    }

    let hash = '';
    if (app.apps[card].tabs) {
        if (tab === undefined) {
            tab = app.apps[card].active;
        }
        if (app.apps[card].tabs[tab].views) {
            if (view === undefined) {
                view = app.apps[card].tabs[tab].active;
            }
            hash = '/' + card + '/' + tab +'/' + view + '!' + (state === undefined ? app.apps[card].tabs[tab].views[view].state : state);
        }
        else {
            hash = '/' + card +'/' + tab + '!' + (state === undefined ? app.apps[card].tabs[tab].state : state);
        }
    }
    else {
        hash = '/' + card + '!'+ (state === undefined ? app.apps[card].state : state);
    }
    location.hash = hash;
}

function appRoute() {
    if (settingsParsed === false) {
        appInitStart();
        return;
    }
    let hash = decodeURI(location.hash);
    let params = hash.match(/^#\/(\w+)\/?(\w+)?\/?(\w+)?!((\d+)\/([^/]+)\/([^/]+)\/(.*))$/);
    if (params) {
        app.current.app = params[1];
        app.current.tab = params[2];
        app.current.view = params[3];
        if (app.apps[app.current.app].state) {
            app.apps[app.current.app].state = params[4];
            app.current.scrollPos = app.apps[app.current.app].scrollPos;
        }
        else if (app.apps[app.current.app].tabs[app.current.tab].state) {
            app.apps[app.current.app].tabs[app.current.tab].state = params[4];
            app.apps[app.current.app].active = app.current.tab;
            app.current.scrollPos = app.apps[app.current.app].tabs[app.current.tab].scrollPos;
        }
        else if (app.apps[app.current.app].tabs[app.current.tab].views[app.current.view].state) {
            app.apps[app.current.app].tabs[app.current.tab].views[app.current.view].state = params[4];
            app.apps[app.current.app].active = app.current.tab;
            app.apps[app.current.app].tabs[app.current.tab].active = app.current.view;
            app.current.scrollPos = app.apps[app.current.app].tabs[app.current.tab].views[app.current.view].scrollPos;
        }
        app.current.page = parseInt(params[5]);
        app.current.filter = params[6];
        app.current.sort = params[7];
        app.current.search = params[8];
    }
    else {
        appGoto('Playback');
        return;
    }

    appPrepare(app.current.scrollPos);

    if (app.current.app === 'Playback') {
        sendAPI("MPD_API_PLAYER_CURRENT_SONG", {}, songChange);
        getBrowseCovergrid();
    }
    else if (app.current.app === 'Queue' && app.current.tab === 'Current' ) {
        selectTag('searchqueuetags', 'searchqueuetagsdesc', app.current.filter);
        getQueue();
    }
    else if (app.current.app === 'Queue' && app.current.tab === 'LastPlayed') {
        sendAPI("MPD_API_QUEUE_LAST_PLAYED", {"offset": app.current.page, "cols": settings.colsQueueLastPlayed}, parseLastPlayed);
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Playlists' && app.current.view === 'All') {
        sendAPI("MPD_API_PLAYLIST_LIST", {"offset": app.current.page, "filter": app.current.filter}, parsePlaylists);
        doSetFilterLetter('BrowsePlaylistsFilter');
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Playlists' && app.current.view === 'Detail') {
        sendAPI("MPD_API_PLAYLIST_CONTENT_LIST", {"offset": app.current.page, "filter": app.current.filter, "uri": app.current.search, "cols": settings.colsBrowsePlaylistsDetail}, parsePlaylists);
        doSetFilterLetter('BrowsePlaylistsFilter');
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Database') {
        if (app.current.search !== '') {
            sendAPI("MPD_API_DATABASE_TAG_ALBUM_LIST", {"offset": app.current.page, "filter": app.current.filter, "search": app.current.search, "tag": app.current.view}, parseListDBtags);
            doSetFilterLetter('BrowseDatabaseFilter');
        }
        else {
            sendAPI("MPD_API_DATABASE_TAG_LIST", {"offset": app.current.page, "filter": app.current.filter, "tag": app.current.view}, parseListDBtags);
            doSetFilterLetter('BrowseDatabaseFilter');
            selectTag('BrowseDatabaseByTagDropdown', 'btnBrowseDatabaseByTag', app.current.view);
        }
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Filesystem') {
        sendAPI("MPD_API_DATABASE_FILESYSTEM_LIST", {"offset": app.current.page, "path": (app.current.search ? app.current.search : "/"), "filter": app.current.filter, "cols": settings.colsBrowseFilesystem}, parseFilesystem);
        // Don't add all songs from root
        if (app.current.search) {
            document.getElementById('BrowseFilesystemAddAllSongs').removeAttribute('disabled');
            document.getElementById('BrowseFilesystemAddAllSongsBtn').removeAttribute('disabled');
        }
        else {
            document.getElementById('BrowseFilesystemAddAllSongs').setAttribute('disabled', 'disabled');
            document.getElementById('BrowseFilesystemAddAllSongsBtn').setAttribute('disabled', 'disabled');
        }
        // Create breadcrumb
        let breadcrumbs='<li class="breadcrumb-item"><a data-uri="" class="material-icons">home</a></li>';
        let pathArray = app.current.search.split('/');
        let pathArrayLen = pathArray.length;
        let fullPath = '';
        for (let i = 0; i < pathArrayLen; i++) {
            if (pathArrayLen - 1 === i) {
                breadcrumbs += '<li class="breadcrumb-item active">' + e(pathArray[i]) + '</li>';
                break;
            }
            fullPath += pathArray[i];
            breadcrumbs += '<li class="breadcrumb-item"><a class="text-body" href="#" data-uri="' + encodeURI(fullPath) + '">' + e(pathArray[i]) + '</a></li>';
            fullPath += '/';
        }
        document.getElementById('BrowseBreadcrumb').innerHTML = breadcrumbs;
        doSetFilterLetter('BrowseFilesystemFilter');
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Covergrid') {
        setCovergridList();
        document.getElementById('searchCovergridStr').value = app.current.search;
        selectTag('searchCovergridTags', 'searchCovergridTagsDesc', app.current.filter);
        let sort = app.current.sort;
        let sortdesc = false;
        if (app.current.sort.charAt(0) === '-') {
            sortdesc = true;
            sort = app.current.sort.substr(1);
            toggleBtnChk('covergridSortDesc', true);
        }
        else {
            toggleBtnChk('covergridSortDesc', false);
        }
        selectTag('covergridSortTags', undefined, sort);
        sendAPI("MPD_API_DATABASE_GET_ALBUMS", {"offset": app.current.page, "searchstr": app.current.search,
            "tag": app.current.filter, "sort": sort, "sortdesc": sortdesc}, parseCovergrid);
        // console.log('approuteret');
    }
    else if (app.current.app === 'Search' && app.current.tab === 'Database') {
        domCache.searchstr.focus();
        if (settings.featAdvsearch) {
            let crumbs = '';
            let elements = app.current.search.substring(1, app.current.search.length - 1).split(' AND ');
            for (let i = 0; i < elements.length - 1; i++) {
                let value = elements[i].substring(1, elements[i].length - 1);
                crumbs += '<button data-filter="' + encodeURI(value) + '" class="btn btn-light mr-2">' + e(value) + '<span class="ml-2 badge badge-secondary">&times</span></button>';
            }
            domCache.searchCrumb.innerHTML = crumbs;
            if (domCache.searchstr.value === '' && elements.length >= 1) {
                let lastEl = elements[elements.length - 1].substring(1,  elements[elements.length - 1].length - 1);
                let lastElValue = lastEl.substring(lastEl.indexOf('\'') + 1, lastEl.length - 1);
                if (domCache.searchstr.value !== lastElValue) {
                    domCache.searchCrumb.innerHTML += '<button data-filter="' + encodeURI(lastEl) +'" class="btn btn-light mr-2">' + e(lastEl) + '<span href="#" class="ml-2 badge badge-secondary">&times;</span></button>';
                }
                let match = lastEl.substring(lastEl.indexOf(' ') + 1);
                match = match.substring(0, match.indexOf(' '));
                if (match === '')
                    match = 'contains';
                document.getElementById('searchMatch').value = match;
            }
        }
        else {
            if (domCache.searchstr.value === '' && app.current.search !== '') {
                domCache.searchstr.value = app.current.search;
            }
        }
        if (app.last.app !== app.current.app) {
            if (app.current.search !== '') {
                let colspan = settings['cols' + app.current.app + app.current.tab].length;
                colspan--;
                document.getElementById('SearchDatabaseList').getElementsByTagName('tbody')[0].innerHTML=
                    '<tr><td><span class="material-icons">search</span></td>' +
                    '<td colspan="' + colspan + '">' + t('Searching...') + '</td></tr>';
            }
        }

        if (domCache.searchstr.value.length >= 2 || domCache.searchCrumb.children.length > 0) {
            if (settings.featAdvsearch) {
                let sort = app.current.sort;
                let sortdesc = false;
                if (sort === '-') {
                    if (settings.tags.includes('Title')) {
                        sort = 'Title';
                    }
                    else {
                        sort = '-';
                    }
                    document.getElementById('SearchDatabaseList').setAttribute('data-sort', sort);
                }
                else {
                    if (sort.indexOf('-') === 0) {
                        sortdesc = true;
                        sort = sort.substring(1);
                    }
                }
                sendAPI("MPD_API_DATABASE_SEARCH_ADV", {"plist": "", "offset": app.current.page, "sort": sort, "sortdesc": sortdesc, "expression": app.current.search, "cols": settings.colsSearchDatabase, "replace": false}, parseSearch);
            }
            else {
                sendAPI("MPD_API_DATABASE_SEARCH", {"plist": "", "offset": app.current.page, "filter": app.current.filter, "searchstr": app.current.search, "cols": settings.colsSearchDatabase, "replace": false}, parseSearch);
            }
        } else {
            document.getElementById('SearchDatabaseList').getElementsByTagName('tbody')[0].innerHTML = '';
            document.getElementById('searchAddAllSongs').setAttribute('disabled', 'disabled');
            document.getElementById('searchAddAllSongsBtn').setAttribute('disabled', 'disabled');
            //document.getElementById('panel-heading-search').innerText = '';
            document.getElementById('cardFooterSearch').innerText = '';
            document.getElementById('SearchDatabaseList').classList.remove('opacity05');
            setPagination(0, 0);
        }
        selectTag('searchtags', 'searchtagsdesc', app.current.filter);
    }
    else if (app.current.app === 'Search' && app.current.tab === 'Tidal') {
        // domCache.searchtidalstr.focus();
        if (domCache.searchtidalstr.value === '' && app.current.search !== '') {
            domCache.searchtidalstr.value = app.current.search;
        }
        if (app.last.app !== app.current.app) {
            if (app.current.search !== '') {
                let colspan = settings['cols' + app.current.app + app.current.tab].length;
                colspan--;
                document.getElementById('SearchTidalList').getElementsByTagName('tbody')[0].innerHTML=
                    '<tr><td><span class="material-icons">search</span></td>' +
                    '<td colspan="' + colspan + '">' + t('Searching...') + '</td></tr>';
            }
        }
        if (domCache.searchtidalstr.value.length >= 2) {
            sendAPI("MYMPD_API_TIDAL_SEARCH", {"plist": "", "offset": app.current.page, "filter": app.current.filter, "searchstr": app.current.search}, parseSearch);
        } else {
            document.getElementById('SearchTidalList').getElementsByTagName('tbody')[0].innerHTML = '';
            document.getElementById('searchTidalAddAllSongs').setAttribute('disabled', 'disabled');
            document.getElementById('searchTidalAddAllSongsBtn').setAttribute('disabled', 'disabled');
            //document.getElementById('panel-heading-search').innerText = '';
            document.getElementById('cardFooterSearch').innerText = '';
            document.getElementById('SearchTidalList').classList.remove('opacity05');
            setPagination(0, 0);
        }
        selectTag('searchtidaltags', 'searchtidaltagsdesc', app.current.filter);
    }
    else if (app.current.app === 'Search' && app.current.tab === 'Qobuz') {
        domCache.searchqobuzstr.focus();
        if (domCache.searchqobuzstr.value === '' && app.current.search !== '') {
            domCache.searchqobuzstr.value = app.current.search;
        }
        if (app.last.app !== app.current.app) {
            if (app.current.search !== '') {
                let colspan = settings['cols' + app.current.app + app.current.tab].length;
                colspan--;
                document.getElementById('SearchQobuzList').getElementsByTagName('tbody')[0].innerHTML=
                    '<tr><td><span class="material-icons">search</span></td>' +
                    '<td colspan="' + colspan + '">' + t('Searching...') + '</td></tr>';
            }
        }
        if (domCache.searchqobuzstr.value.length >= 2) {
            sendAPI("MYMPD_API_QOBUZ_SEARCH", {"plist": "", "offset": app.current.page, "filter": app.current.filter, "searchstr": app.current.search}, parseSearch);
        } else {
            document.getElementById('SearchQobuzList').getElementsByTagName('tbody')[0].innerHTML = '';
            document.getElementById('searchQobuzAddAllSongs').setAttribute('disabled', 'disabled');
            document.getElementById('searchQobuzAddAllSongsBtn').setAttribute('disabled', 'disabled');
            //document.getElementById('panel-heading-search').innerText = '';
            document.getElementById('cardFooterSearch').innerText = '';
            document.getElementById('SearchQobuzList').classList.remove('opacity05');
            setPagination(0, 0);
        }
        selectTag('searchqobuztags', 'searchqobuztagsdesc', app.current.filter);
    }
    else {
        appGoto("Playback");
    }

    app.last.app = app.current.app;
    app.last.tab = app.current.tab;
    app.last.view = app.current.view;
}

function showAppInitAlert(text) {
    document.getElementById('splashScreenAlert').innerHTML = '<p class="text-danger">' + t(text) + '</p>' +
        '<p><a id="appReloadBtn" class="btn btn-danger text-light clickable">' + t('Reload') + '</a></p>';
    document.getElementById('appReloadBtn').addEventListener('click', function() {
        clearAndReload();
    }, false);
}


function clearAndReload() {
    if ('serviceWorker' in navigator) {
        caches.keys().then(function(cacheNames) {
            cacheNames.forEach(function(cacheName) {
                caches.delete(cacheName);
            });
        });
    }
    location.reload();
}

function appInitStart() {
    subdir = window.location.pathname.replace('/index.html', '').replace(/\/$/, '');
    let localeList = '<option value="default" data-phrase="Browser default"></option>';
    for (let i = 0; i < locales.length; i++) {
        localeList += '<option value="' + e(locales[i].code) + '">' + e(locales[i].desc) + ' (' + e(locales[i].code) + ')</option>';
    }
    document.getElementById('selectLocale').innerHTML = localeList;

    i18nHtml(document.getElementById('splashScreenAlert'));

    //register serviceworker
    let script = document.getElementsByTagName("script")[0].src.replace(/^.*[/]/, '');
    if (script !== 'combined.js') {
        settings.loglevel = 4;
    }
    if ('serviceWorker' in navigator && document.URL.substring(0, 5) === 'https'
        && window.location.hostname !== 'localhost' && script === 'combined.js')
    {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js', {scope: '/'}).then(function(registration) {
                // Registration was successful
                logInfo('ServiceWorker registration successful.');
                registration.update();
            }, function(err) {
                // Registration failed
                logError('ServiceWorker registration failed: ' + err);
            });
        });
    }

    appInited = false;
    document.getElementById('splashScreen').classList.remove('hide');
    document.getElementsByTagName('body')[0].classList.add('overflow-hidden');
    document.getElementById('splashScreenAlert').innerText = t('Fetch myMPD settings');

    getSettings(true);
    appInitWait();
}

function appInitWait() {
    setTimeout(function() {
        if (settingsParsed === 'true' && websocketConnected === true) {
            //app initialized
            document.getElementById('splashScreenAlert').innerText = t('Applying settings');
            document.getElementById('splashScreen').classList.add('hide-fade');
            setTimeout(function() {
                document.getElementById('splashScreen').classList.add('hide');
                document.getElementById('splashScreen').classList.remove('hide-fade');
                document.getElementsByTagName('body')[0].classList.remove('overflow-hidden');
            }, 500);
            appInit();
            appInited = true;
            return;
        }

        if (settingsParsed === 'true') {
            //parsed settings, now its safe to connect to websocket
            document.getElementById('splashScreenAlert').innerText = t('Connect to websocket');
            webSocketConnect();
        }
        else if (settingsParsed === 'error') {
            return;
        }
        appInitWait();
    }, 500);
}

function appInit() {
    document.getElementById('btnChVolumeDown').addEventListener('click', function(event) {
        event.stopPropagation();
    }, false);
    document.getElementById('btnChVolumeUp').addEventListener('click', function(event) {
        event.stopPropagation();
    }, false);

    domCache.volumeBar.addEventListener('click', function(event) {
        event.stopPropagation();
    }, false);
    domCache.volumeBar.addEventListener('change', function() {
        sendAPI("MPD_API_PLAYER_VOLUME_SET", {"volume": domCache.volumeBar.value});
    }, false);

    domCache.progressBar.value = 0;
    domCache.progressBar.addEventListener('change', function() {
        if (currentSong && currentSong.currentSongId >= 0) {
            let seekVal = Math.ceil(currentSong.totalTime * (domCache.progressBar.value / 1000));
            sendAPI("MPD_API_PLAYER_SEEK", {"songid": currentSong.currentSongId, "seek": seekVal});
        }
    }, false);


    let collapseArrows = document.querySelectorAll('.subMenu');
    let collapseArrowsLen = collapseArrows.length;
    for (let i = 0; i < collapseArrowsLen; i++) {
        collapseArrows[i].addEventListener('click', function(event) {
            event.stopPropagation();
            event.preventDefault();
            let icon = this.getElementsByTagName('span')[0];
            icon.innerText = icon.innerText === 'keyboard_arrow_right' ? 'keyboard_arrow_down' : 'keyboard_arrow_right';
        }, false);
    }

    document.getElementById('volumeMenu').parentNode.addEventListener('show.bs.dropdown', function () {
        sendAPI("MPD_API_PLAYER_OUTPUT_LIST", {}, parseOutputs);
    });

    document.getElementById('BrowseFilesystemBookmark').parentNode.addEventListener('show.bs.dropdown', function () {
        sendAPI("MYMPD_API_BOOKMARK_LIST", {"offset": 0}, parseBookmarks);
    });

    document.getElementById('playDropdown').parentNode.addEventListener('show.bs.dropdown', function () {
        showPlayDropdown();
    });

    document.getElementById('playDropdown').addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
    });

    let dropdowns = document.querySelectorAll('.dropdown-toggle');
    for (let i = 0; i < dropdowns.length; i++) {
        dropdowns[i].parentNode.addEventListener('show.bs.dropdown', function () {
            alignDropdown(this);
        });
    }

    document.getElementById('modalTimer').addEventListener('shown.bs.modal', function () {
        showListTimer();
    });

    document.getElementById('modalAbout').addEventListener('shown.bs.modal', function () {
        sendAPI("MPD_API_DATABASE_STATS", {}, parseStats);
        getServerinfo();
        let trs = '';
        for (let key in keymap) {
            if (keymap[key].req === undefined || settings[keymap[key].req] === true) {
                trs += '<tr><td><div class="key' + (keymap[key].key && keymap[key].key.length > 1 ? ' material-icons material-icons-small' : '') +
                       '">' + (keymap[key].key !== undefined ? keymap[key].key : key ) + '</div></td><td>' + t(keymap[key].desc) + '</td></tr>';
            }
        }
        document.getElementById('tbodyShortcuts').innerHTML = trs;
    });

    document.getElementById('modalAddToPlaylist').addEventListener('shown.bs.modal', function () {
        if (!document.getElementById('addStreamFrm').classList.contains('hide')) {
            document.getElementById('streamUrl').focus();
            document.getElementById('streamUrl').value = '';
        }
        else {
            document.getElementById('addToPlaylistPlaylist').focus();
        }
    });

    document.getElementById('modalAddToPlaylist').addEventListener('keydown', function (event) {
        // event.preventDefault();
        event.stopPropagation();
        if (event.keyCode === 13) {
            if (document.getElementById('addStreamFrm').classList.contains('show')) {
                addStream();
            }
            else {
                modalAddToPlaylist();
            }
        }
        else if (event.keyCode == 27) {
            modalAddToPlaylist.hide();
        }
    });

    document.getElementById('modalSaveBookmark').addEventListener('keydown', function (event) {
        // event.preventDefault();
        event.stopPropagation();
        if (event.keyCode === 13) {
            saveBookmark();
        }
        else if (event.keyCode == 27) {
            modalSaveBookmark.hide();
        }
    });

    document.getElementById('inputTimerVolume').addEventListener('change', function() {
        document.getElementById('textTimerVolume').innerHTML = this.value + '&nbsp;%';
    }, false);

    document.getElementById('selectTimerAction').addEventListener('change', function() {
        if (this.options[this.selectedIndex].value === 'startplay') {
            document.getElementById('timerActionPlay').classList.remove('hide');
        }
        else {
            document.getElementById('timerActionPlay').classList.add('hide');
        }
    }, false);

    let selectTimerHour = '';
    for (let i = 0; i < 24; i++) {
        selectTimerHour += '<option value="' + i + '">' + zeroPad(i, 2) + '</option>';
    }
    document.getElementById('selectTimerHour').innerHTML = selectTimerHour;

    let selectTimerMinute = '';
    for (let i = 0; i < 60; i = i + 5) {
        selectTimerMinute += '<option value="' + i + '">' + zeroPad(i, 2) + '</option>';
    }
    document.getElementById('selectTimerMinute').innerHTML = selectTimerMinute;
    

    document.getElementById('inputHighlightColor').addEventListener('change', function() {
        document.getElementById('highlightColorPreview').style.backgroundColor = this.value;
    }, false);
    
    document.getElementById('inputBgColor').addEventListener('change', function() {
        document.getElementById('bgColorPreview').style.backgroundColor = this.value;
    }, false);
    
    document.getElementById('modalAddToQueue').addEventListener('shown.bs.modal', function () {
        document.getElementById('inputAddToQueueQuantity').classList.remove('is-invalid');
        if (settings.featPlaylists) {
            playlistEl = 'selectAddToQueuePlaylist';
            sendAPI("MPD_API_PLAYLIST_LIST", {"offset": 0, "filter": "-"}, getAllPlaylists);
        }
    });

    document.getElementById('modalUpdateDB').addEventListener('hidden.bs.modal', function () {
        document.getElementById('updateDBprogress').classList.remove('updateDBprogressAnimate');
    });

    document.getElementById('modalSaveQueue').addEventListener('shown.bs.modal', function () {
        let plName = document.getElementById('saveQueueName');
        plName.focus();
        plName.value = '';
        plName.classList.remove('is-invalid');
    });

    document.getElementById('modalSettings').addEventListener('shown.bs.modal', function () {
        getSettings();
        document.getElementById('inputCrossfade').classList.remove('is-invalid');
        document.getElementById('inputMixrampdb').classList.remove('is-invalid');
        document.getElementById('inputMixrampdelay').classList.remove('is-invalid');
    });

    document.getElementById('modalSettings').addEventListener('keydown', function (event) {
        // event.preventDefault();
        event.stopPropagation();
        if (event.keyCode === 13) {
            saveSettings();
        }
        else if (event.keyCode == 27) {
            modalSettings.hide();
        }
    });

    document.getElementById('modalConnection').addEventListener('shown.bs.modal', function () {
        // document.getElementById('inputMpdHost').focus();
        this.focus();
        getSettings();
        document.getElementById('inputMpdHost').classList.remove('is-invalid');
        document.getElementById('inputMpdPort').classList.remove('is-invalid');
        document.getElementById('inputMpdPass').classList.remove('is-invalid');
    });

    document.getElementById('modalConnection').addEventListener('keydown', function (event) {
        // event.preventDefault();
        event.stopPropagation();
        if (event.keyCode === 13) {
            saveConnection();
        }
        else if (event.keyCode == 27) {
            modalConnection.hide();
        }
    });

    document.getElementById('modalSetup').addEventListener('shown.bs.modal', function () {
        //getSettings();
        // document.getElementById('inputMpdHost').classList.remove('is-invalid');
        // document.getElementById('inputMpdPort').classList.remove('is-invalid');
        // document.getElementById('inputMpdPass').classList.remove('is-invalid');
    });

    document.getElementById('btnJukeboxModeGroup').addEventListener('mouseup', function () {
        setTimeout(function() {
            let value = document.getElementById('btnJukeboxModeGroup').getElementsByClassName('active')[0].getAttribute('data-value');
            if (value === '0') {
                document.getElementById('inputJukeboxQueueLength').setAttribute('disabled', 'disabled');
                document.getElementById('selectJukeboxPlaylist').setAttribute('disabled', 'disabled');
            }
            else if (value === '2') {
                document.getElementById('inputJukeboxQueueLength').setAttribute('disabled', 'disabled');
                document.getElementById('selectJukeboxPlaylist').setAttribute('disabled', 'disabled');
                document.getElementById('selectJukeboxPlaylist').value = 'Database';
            }
            else if (value === '1') {
                document.getElementById('inputJukeboxQueueLength').removeAttribute('disabled');
                document.getElementById('selectJukeboxPlaylist').removeAttribute('disabled');
            }
            if (value !== '0') {
                toggleBtnChk('btnConsume', true);
            }
            checkConsume();
        }, 100);
    });

    document.getElementById('btnConsume').addEventListener('mouseup', function() {
        setTimeout(function() {
            checkConsume();
        }, 100);
    });

    document.getElementById('btnStickers').addEventListener('mouseup', function() {
        setTimeout(function() {
            if (document.getElementById('btnStickers').classList.contains('active')) {
                document.getElementById('warnPlaybackStatistics').classList.add('hide');
                document.getElementById('inputJukeboxLastPlayed').removeAttribute('disabled');
            }
            else {
                document.getElementById('warnPlaybackStatistics').classList.remove('hide');
                document.getElementById('inputJukeboxLastPlayed').setAttribute('disabled', 'disabled');
            }
        }, 100);
    });

    document.getElementById('selectAddToQueueMode').addEventListener('change', function () {
        let value = this.options[this.selectedIndex].value;
        if (value === '2') {
            document.getElementById('inputAddToQueueQuantity').setAttribute('disabled', 'disabled');
            document.getElementById('selectAddToQueuePlaylist').setAttribute('disabled', 'disabled');
            document.getElementById('selectAddToQueuePlaylist').value = 'Database';
        }
        else if (value === '1') {
            document.getElementById('inputAddToQueueQuantity').removeAttribute('disabled');
            document.getElementById('selectAddToQueuePlaylist').removeAttribute('disabled');
        }
    });

    document.getElementById('addToPlaylistPlaylist').addEventListener('change', function () {
        if (this.options[this.selectedIndex].value === 'new') {
            document.getElementById('addToPlaylistNewPlaylistDiv').classList.remove('hide');
            document.getElementById('addToPlaylistNewPlaylist').focus();
        }
        else {
            document.getElementById('addToPlaylistNewPlaylistDiv').classList.add('hide');
        }
    }, false);

    document.getElementById('selectMusicDirectory').addEventListener('change', function () {
        if (this.options[this.selectedIndex].value === 'auto') {
            document.getElementById('inputMusicDirectory').value = settings.musicDirectoryValue;
            document.getElementById('inputMusicDirectory').setAttribute('readonly', 'readonly');
        }
        else if (this.options[this.selectedIndex].value === 'none') {
            document.getElementById('inputMusicDirectory').value = '';
            document.getElementById('inputMusicDirectory').setAttribute('readonly', 'readonly');
        }
        else {
            document.getElementById('inputMusicDirectory').value = '';
            document.getElementById('inputMusicDirectory').removeAttribute('readonly');
        }
    }, false);

    addFilterLetter('BrowseFilesystemFilterLetters');
    addFilterLetter('BrowseDatabaseFilterLetters');
    addFilterLetter('BrowsePlaylistsFilterLetters');

    document.getElementById('syscmds').addEventListener('click', function(event) {
        if (event.target.nodeName === 'A') {
            parseCmd(event, event.target.getAttribute('data-href'));
        }
    }, false);

    let hrefs = document.querySelectorAll('[data-href]');
    let hrefsLen = hrefs.length;
    for (let i = 0; i < hrefsLen; i++) {
        if (hrefs[i].classList.contains('notclickable') === false) {
            hrefs[i].classList.add('clickable');
        }
        let parentInit = hrefs[i].parentNode.classList.contains('noInitChilds') ? true : false;
        if (parentInit === true) {
            //handler on parentnode
            continue;
        }
        hrefs[i].addEventListener('click', function(event) {
            parseCmd(event, this.getAttribute('data-href'));
        }, false);
    }

    let pd = document.getElementsByClassName('pages');
    let pdLen = pd.length;
    for (let i = 0; i < pdLen; i++) {
        pd[i].addEventListener('click', function(event) {
            if (event.target.nodeName === 'BUTTON') {
                gotoPage(event.target.getAttribute('data-page'));
            }
        }, false);
    }

    document.getElementById('cardPlaybackTags').addEventListener('click', function(event) {
        if (event.target.nodeName === 'H4')
            gotoBrowse(event.target);
    }, false);

    document.getElementById('BrowseBreadcrumb').addEventListener('click', function(event) {
        if (event.target.nodeName === 'A') {
            event.preventDefault();
            appGoto('Browse', 'Filesystem', undefined, '0/' + app.current.filter + '/' + app.current.sort + '/' + decodeURI(event.target.getAttribute('data-uri')));
        }
    }, false);
    
    document.getElementById('tbodySongDetails').addEventListener('click', function(event) {
        if (event.target.nodeName === 'A') {
            if (event.target.id === 'calcFingerprint') {
                sendAPI("MPD_API_DATABASE_FINGERPRINT", {"uri": decodeURI(event.target.getAttribute('data-uri'))}, parseFingerprint);
                event.preventDefault();
                let parent = event.target.parentNode;
                let spinner = document.createElement('div');
                spinner.classList.add('spinner-border', 'spinner-border-sm');
                event.target.classList.add('hide');
                parent.appendChild(spinner);
            }
            else if (event.target.parentNode.getAttribute('data-tag') !== null) {
                modalSongDetails.hide();
                event.preventDefault();
                gotoBrowse(event.target);
            }
        }
        else if (event.target.nodeName === 'BUTTON') {
            if (event.target.getAttribute('data-href')) {
                parseCmd(event, event.target.getAttribute('data-href'));
            }
        }
    }, false);

    // modalAlbumDetails

    // modalArtistDetails

    document.getElementById('outputs').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            event.stopPropagation();
            sendAPI("MPD_API_PLAYER_TOGGLE_OUTPUT", {"output": event.target.getAttribute('data-output-id'), "state": (event.target.classList.contains('active') ? 0 : 1)});
            toggleBtn(event.target.id);
        }
    }, false);

    document.getElementById('listTimerList').addEventListener('click', function(event) {
        event.stopPropagation();
        event.preventDefault();
        if (event.target.nodeName === 'TD') {
            showEditTimer(event.target.parentNode.getAttribute('data-id'));
        }
        else if (event.target.nodeName === 'A') {
            deleteTimer(event.target.parentNode.parentNode.getAttribute('data-id'));
        }
        else if (event.target.nodeName === 'BUTTON') {
            toggleTimer(event.target, event.target.parentNode.parentNode.getAttribute('data-id'));
        }
    }, false);

    document.getElementById('QueueCurrentList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            sendAPI("MPD_API_PLAYER_PLAY_TRACK", {"track": event.target.parentNode.getAttribute('data-trackid')});
        }
        else if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        }
    }, false);

    document.getElementById('QueueLastPlayedList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        }
        else if (event.target.nodeName === 'TD') {
            appendPlayQueue('song', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
        }
    }, false);

    document.getElementById('QueueMiniList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            sendAPI("MPD_API_PLAYER_PLAY_TRACK", {"track": event.target.parentNode.getAttribute('data-trackid')});
        }
        /* else if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        } */
    }, false);

    document.getElementById('BrowseFilesystemList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            switch(event.target.parentNode.getAttribute('data-type')) {
                case 'parentDir':
                case 'dir':
                    appGoto('Browse', 'Filesystem', undefined, '0/' + app.current.filter + '/' + app.current.sort + '/' + decodeURI(event.target.parentNode.getAttribute("data-uri")));
                    break;
                case 'song':
                    // appendQueue('song', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
                    appendPlayQueue('song', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
                    break;
                case 'plist':
                    // appendQueue('plist', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
                    // appendPlayQueue('plist', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
                    showMenu(event.target, event);
                    break;
            }
        }
        else if (event.target.nodeName === 'A') {
            if (event.target.parentNode.getAttribute('data-col') === 'Add') {
                event.preventDefault();
                event.stopPropagation();
                let type = event.target.parentNode.parentNode.getAttribute('data-type');
                let uri = decodeURI(event.target.parentNode.parentNode.getAttribute('data-uri'));
                let name = event.target.parentNode.parentNode.getAttribute('data-name');
                appendQueue(type, uri, name);
            }
            else { // Action
                showMenu(event.target, event);
            }
        }
    }, false);

    document.getElementById('BrowseFilesystemBookmarks').addEventListener('click', function(event) {
        if (event.target.nodeName === 'A') {
            let id = event.target.parentNode.parentNode.getAttribute('data-id');
            let type = event.target.parentNode.parentNode.getAttribute('data-type');
            let uri = decodeURI(event.target.parentNode.parentNode.getAttribute('data-uri'));
            let name = event.target.parentNode.parentNode.firstChild.innerText;
            let href = event.target.getAttribute('data-href');

            if (href === 'delete') {
                sendAPI("MYMPD_API_BOOKMARK_RM", {"id": id}, function() {
                    sendAPI("MYMPD_API_BOOKMARK_LIST", {"offset": 0}, parseBookmarks);
                });
                event.preventDefault();
                event.stopPropagation();
            }
            else if (href === 'edit') {
                showBookmarkSave(id, name, uri, type);
            }
            else if (href === 'goto') {
                appGoto('Browse', 'Filesystem', undefined, '0/-/-/' + uri );
            }
        }
    }, false);

    document.getElementById('BrowsePlaylistsAllList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            // appendQueue('plist', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
            // appendPlayQueue('plist', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
            showMenu(event.target, event);
        }
        else if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        }
    }, false);

    document.getElementById('BrowsePlaylistsDetailList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            // appendQueue('plist', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
            appendPlayQueue('song', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
        }
        else if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        }
        else if (event.target.nodeName === 'CAPTION') {
            showMenu(event.target, event);
        }
    }, false);

    document.getElementById('BrowseDatabaseTagList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            appGoto('Browse', 'Database', app.current.view, '0/-/-/' + event.target.parentNode.getAttribute('data-uri'));
        }
    }, false);

    document.getElementById('BrowseCovergridAlbumList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            // appGoto('Browse', 'Database', app.current.view, '0/-/-/' + event.target.parentNode.getAttribute('data-uri'));
            getCovergridTitle(event.target.parentNode);
        }
        else if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        }
    }, false);

    document.getElementById('BrowseCovergridTitleList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            // appGoto('Browse', 'Database', app.current.view, '0/-/-/' + event.target.parentNode.getAttribute('data-uri'));
            // getCovergridTitle(event.target.parentNode);
            appendPlayQueue('song', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
        }
        else if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        }
        /* else if (event.target.nodeName === 'CAPTION') {
            showMenu(event.target, event);
        } */
    }, false);


    document.getElementById('SearchDatabaseList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            // appendQueue('song', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
            appendPlayQueue('song', decodeURI(event.target.parentNode.getAttribute("data-uri")), event.target.parentNode.getAttribute("data-name"));
        }
        else if (event.target.nodeName === 'A') {
            if (event.target.parentNode.getAttribute('data-col') === 'Add') {
                event.preventDefault();
                event.stopPropagation();
                let uri = decodeURI(event.target.parentNode.parentNode.getAttribute('data-uri'));
                let name = event.target.parentNode.parentNode.getAttribute('data-name');
                appendQueue('song', uri, name);
            }
            else { // Action
                showMenu(event.target, event);
            }
        }
    }, false);

    document.getElementById('SearchTidalList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            let uri = event.target.parentNode.getAttribute("data-uri");
            switch(event.target.parentNode.getAttribute('data-type')) {
                case 'song': // tidal://track/track_id
                    // appendQueue('song', uri, event.target.parentNode.getAttribute("data-name"));
                    appendPlayQueue('song', uri, event.target.parentNode.getAttribute("data-name"));
                    break;
                case 'artist': // tidal://artist/artist_id
                    uri = uri.split("://").pop();
                    searchTidal(uri);
                    break;
                case 'album': // tidal://album/album_id
                    uri = uri.split("://").pop();
                    searchTidal(uri);
                    break;
            }
        }
        else if (event.target.nodeName === 'A') {
            if (event.target.parentNode.getAttribute('data-col') === 'Add') {
                event.preventDefault();
                event.stopPropagation();
                let type = event.target.parentNode.parentNode.getAttribute('data-type');
                let uri = event.target.parentNode.parentNode.getAttribute('data-uri');
                let name = event.target.parentNode.parentNode.getAttribute('data-name');
                appendQueue(type, uri, name);
            }
            else { // Action
                showMenu(event.target, event);
            }
        }
    }, false);

    document.getElementById('SearchQobuzList').addEventListener('click', function(event) {
        if (event.target.nodeName === 'TD') {
            let uri = decodeURI(event.target.parentNode.getAttribute("data-uri"));
            switch(event.target.parentNode.getAttribute('data-type')) {
                case 'song': // qobuz://track/track_id
                    appendQueue('song', uri, event.target.parentNode.getAttribute("data-name"));
                    break;
                case 'artist': // qobuz://artist/artist_id
                    uri = uri.split("://").pop();
                    searchQobuz(uri);
                    break;
                case 'album': // qobuz://album/album_id
                    uri = uri.split("://").pop();
                    // wip - all or artist view
                    app.back1.view = app.current.view;
                    app.back1.search = app.current.search;
                    app.back1.page = app.current.page;
                    searchQobuz(uri);
                    break;
            }
        }
        else if (event.target.nodeName === 'A') {
            showMenu(event.target, event);
        }
    }, false);

    document.getElementById('BrowseFilesystemAddAllSongsDropdown').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            if (event.target.getAttribute('data-phrase') === 'Add all to queue') {
                addAllFromBrowseFilesystem();
            }
            else if (event.target.getAttribute('data-phrase') === 'Add all to playlist') {
                showAddToPlaylist(app.current.search, '');
            }
        }
    }, false);

    document.getElementById('searchAddAllSongsDropdown').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            if (event.target.getAttribute('data-phrase') === 'Add all to queue') {
                addAllFromSearchPlist('queue', null, false);
            }
            else if (event.target.getAttribute('data-phrase') === 'Add all to playlist') {
                showAddToPlaylist('SEARCH', '');
            }
            else if (event.target.getAttribute('data-phrase') === 'Save as smart playlist') {
                saveSearchAsSmartPlaylist();
            }
        }
    }, false);

    document.getElementById('searchTidalAddAllSongsDropdown').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            if (event.target.getAttribute('data-phrase') === 'Add all to queue') {
                addAllFromSearchTidalPlist('queue');
            }
            else if (event.target.getAttribute('data-phrase') === 'Add all to playlist') {
                showAddToPlaylist('SEARCHTIDAL');
            }
            else if (event.target.getAttribute('data-phrase') === 'Save as smart playlist') {
                saveSearchAsSmartPlaylist(); // not yet implemented
            }
        }
    }, false);

    // qobuz

    document.getElementById('BrowseDatabaseAddAllSongsDropdown').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            if (event.target.getAttribute('data-phrase') === 'Add all to queue') {
                addAllFromBrowseDatabasePlist('queue');
            }
            else if (event.target.getAttribute('data-phrase') === 'Add all to playlist') {
                showAddToPlaylist('DATABASE', '');
            }
        }
    }, false);

    document.getElementById('searchtags').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            app.current.filter = event.target.getAttribute('data-tag');
            search(domCache.searchstr.value);
        }
    }, false);

    document.getElementById('searchCovergridTags').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            app.current.filter = event.target.getAttribute('data-tag');
            appGoto(app.current.app, app.current.tab, app.current.view, '0/' + app.current.filter + '/' + app.current.sort + '/' + app.current.search);
        }
    }, false);

    document.getElementById('covergridSortDesc').addEventListener('click', function(event) {
        toggleBtnChk(this);
        event.stopPropagation();
        event.preventDefault();
        if (app.current.sort.charAt(0) === '-') {
            app.current.sort = app.current.sort.substr(1);
        }
        else {
            app.current.sort = '-' + app.current.sort;
        }
        appGoto(app.current.app, app.current.tab, app.current.view, '0/' + app.current.filter + '/' + app.current.sort + '/' + app.current.search);
    }, false);

    document.getElementById('covergridSortTags').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            event.preventDefault();
            event.stopPropagation();
            app.current.sort = event.target.getAttribute('data-tag');
            appGoto(app.current.app, app.current.tab, app.current.view, '0/' + app.current.filter + '/' + app.current.sort + '/' + app.current.search);
        }
    }, false);

    document.getElementById('searchCovergridStr').addEventListener('keyup', function(event) {
        if (event.key === 'Escape') {
            this.blur();
        }
        else {
            appGoto(app.current.app, app.current.tab, app.current.view, '0/' + app.current.filter + '/' + app.current.sort + '/' + this.value);
        }
    }, false);

    document.getElementById('dropdownSortPlaylistTags').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            event.preventDefault();
            playlistSort(event.target.getAttribute('data-tag'));
        }
    }, false);

    document.getElementById('searchqueuestr').addEventListener('keyup', function(event) {
        if (event.key === 'Escape') {
            this.blur();
        }
        else {
            appGoto(app.current.app, app.current.tab, app.current.view, '0/' + app.current.filter + '/' + app.current.sort + '/' + this.value);
        }
    }, false);

    document.getElementById('searchqueuetags').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            appGoto(app.current.app, app.current.tab, app.current.view, app.current.page + '/' + event.target.getAttribute('data-tag') + '/' + app.current.sort  + '/' + app.current.search);
        }
    }, false);

    /*
    let dropdowns = ['QueueCurrentColsDropdown', 'BrowseFilesystemColsDropdown', 'SearchDatabaseColsDropdown', 'BrowsePlaylistsDetailColsDropdown',
        'BrowseDatabaseColsDropdown', 'PlaybackColsDropdown', 'QueueLastPlayedColsDropdown', 'SearchTidalColsDropdown', 'SearchQobuzColsDropdown'];
    for (let i = 0; i < dropdowns.length; i++) {
        document.getElementById(dropdowns[i]).addEventListener('click', function(event) {
            if (event.target.nodeName === 'INPUT')
    */
    let colDropdowns = ['BrowseDatabaseColsDropdown', 'PlaybackColsDropdown'];
    for (let i = 0; i < colDropdowns.length; i++) {
        document.getElementById(colDropdowns[i]).addEventListener('click', function(event) {
            if (event.target.nodeName === 'BUTTON' && event.target.classList.contains('material-icons')) {
                event.stopPropagation();
                event.preventDefault();
                toggleBtnChk(event.target);
            }
        }, false);
    }

    document.getElementById('search').addEventListener('submit', function() {
        return false;
    }, false);

    document.getElementById('searchtidal').addEventListener('submit', function() {
        return false;
    }, false);

    document.getElementById('searchqobuz').addEventListener('submit', function() {
        return false;
    }, false);

    document.getElementById('searchqueue').addEventListener('submit', function() {
        return false;
    }, false);

    document.getElementById('searchcovergrid').addEventListener('submit', function() {
        return false;
    }, false);

    domCache.searchstr.addEventListener('keyup', function(event) {
        if (event.key === 'Escape') {
            this.blur();
        }
        else if (event.key === 'Enter' && settings.featAdvsearch) {
            if (this.value !== '') {
                let match = document.getElementById('searchMatch');
                let li = document.createElement('button');
                li.classList.add('btn', 'btn-light', 'mr-2');
                li.setAttribute('data-filter', encodeURI(app.current.filter + ' ' + match.options[match.selectedIndex].value +' \'' + this.value + '\''));
                li.innerHTML = app.current.filter + ' ' + match.options[match.selectedIndex].value + ' \'' + e(this.value) + '\'<span class="ml-2 badge badge-secondary">&times;</span>';
                this.value = '';
                domCache.searchCrumb.appendChild(li);
            }
            else {
                search(this.value);
            }
        }
        else {
            search(this.value);
        }
    }, false);

    domCache.searchCrumb.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.target.nodeName === 'SPAN') {
            event.target.parentNode.remove();
            search('');
        }
        else if (event.target.nodeName === 'BUTTON') {
            let value = decodeURI(event.target.getAttribute('data-filter'));
            domCache.searchstr.value = value.substring(value.indexOf('\'') + 1, value.length - 1);
            let filter = value.substring(0, value.indexOf(' '));
            selectTag('searchtags', 'searchtagsdesc', filter);
            let match = value.substring(value.indexOf(' ') + 1);
            match = match.substring(0, match.indexOf(' '));
            document.getElementById('searchMatch').value = match;
            event.target.remove();
            search(domCache.searchstr.value);
        }
    }, false);

    domCache.searchtidalstr.addEventListener('keyup', function(event) {
        if (event.key === 'Escape') {
            this.blur();
        }
        else {
            searchTidal(this.value);
        }
    }, false);

    domCache.searchqobuzstr.addEventListener('keyup', function(event) {
        if (event.key === 'Escape') {
            this.blur();
        }
        else {
            searchQobuz(this.value);
        }
    }, false);

    document.getElementById('searchMatch').addEventListener('change', function() {
        search(domCache.searchstr.value);
    }, false);

    document.getElementById('SearchDatabaseList').getElementsByTagName('tr')[0].addEventListener('click', function(event) {
        if (settings.featAdvsearch) {
            if (event.target.nodeName === 'TH') {
                if (event.target.innerHTML === '') {
                    return;
                }
                let col = event.target.getAttribute('data-col');
                if (col === 'Duration') {
                    return;
                }
                let sortcol = app.current.sort;
                let sortdesc = true;

                if (sortcol === col || sortcol === '-' + col) {
                    if (sortcol.indexOf('-') === 0) {
                        sortdesc = true;
                        col = sortcol.substring(1);
                    }
                    else {
                        sortdesc = false;
                    }
                }
                if (sortdesc === false) {
                    sortcol = '-' + col;
                    sortdesc = true;
                }
                else {
                    sortdesc = false;
                    sortcol = col;
                }

                let s = document.getElementById('SearchDatabaseList').getElementsByClassName('sort-dir');
                for (let i = 0; i < s.length; i++) {
                    s[i].remove();
                }
                app.current.sort = sortcol;
                event.target.innerHTML = t(col) + '<span class="sort-dir material-icons pull-right">' + (sortdesc === true ? 'arrow_drop_up' : 'arrow_drop_down') + '</span>';
                appGoto(app.current.app, app.current.tab, app.current.view, app.current.page + '/' + app.current.filter + '/' + app.current.sort + '/' + app.current.search);
            }
        }
    }, false);

    document.getElementById('SearchTidalList').getElementsByTagName('tr')[0].addEventListener('click', function(event) {
        //
    }, false);

    document.getElementById('SearchQobuzList').getElementsByTagName('tr')[0].addEventListener('click', function(event) {
        //
    }, false);

    document.getElementById('BrowseDatabaseByTagDropdown').addEventListener('click', function(event) {
        if (event.target.nodeName === 'BUTTON') {
            appGoto(app.current.app, app.current.tab, event.target.getAttribute('data-tag') , '0/' + app.current.filter + '/' + app.current.sort + '/' + app.current.search);
        }
    }, false);

    document.getElementsByTagName('body')[0].addEventListener('click', function() {
        hideMenu();
    }, false);

    dragAndDropTable('QueueCurrentList');
    dragAndDropTable('BrowsePlaylistsDetailList');
    dragAndDropTableHeader('QueueCurrent');
    dragAndDropTableHeader('QueueLastPlayed');
    dragAndDropTableHeader('SearchDatabase');
    dragAndDropTableHeader('SearchTidal');
    dragAndDropTableHeader('SearchQobuz');
    dragAndDropTableHeader('BrowseFilesystem');
    dragAndDropTableHeader('BrowsePlaylistsDetail');

    window.addEventListener('hashchange', appRoute, false);

    window.addEventListener('focus', function() {
        sendAPI("MPD_API_PLAYER_STATE", {}, parseState);
    }, false);

    document.addEventListener('keydown', function(event) {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' ||
            event.ctrlKey || event.altKey) {
            return;
        }
        let cmd = keymap[event.key];
        if (cmd && typeof window[cmd.cmd] === 'function') {
            if (keymap[event.key].req === undefined || settings[keymap[event.key].req] === true)
                parseCmd(event, cmd);
        }
    }, false);

    let tables = document.getElementsByTagName('table');
    for (let i = 0; i < tables.length; i++) {
        tables[i].setAttribute('tabindex', 0);
        tables[i].addEventListener('keydown', function(event) {
            navigateTable(this, event.key);
        }, false);
    }

    let selectThemeHtml = '';
    Object.keys(themes).forEach(function(key) {
        selectThemeHtml += '<option value="' + key + '">' + t(themes[key]) + '</option>';
    });
    document.getElementById('selectTheme').innerHTML = selectThemeHtml;

    window.addEventListener('beforeinstallprompt', function(event) {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        event.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = event;
    });

    window.addEventListener('beforeinstallprompt', function(event) {
        event.preventDefault();
        deferredPrompt = event;
        // Update UI notify the user they can add to home screen
        domCache.btnAdd.classList.remove('hide');
    });

    domCache.btnAdd.addEventListener('click', function() {
        // Hide our user interface that shows our A2HS button
        domCache.btnAdd.classList.add('hide');
        // Show the prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                logVerbose('User accepted the A2HS prompt');
            }
            else {
                logVerbose('User dismissed the A2HS prompt');
            }
            deferredPrompt = null;
        });
    });

    window.addEventListener('appinstalled', function() {
        logInfo('myMPD installed as app');
        showNotification(t('myMPD installed as app'), '', '', 'success');
    });

    window.addEventListener('beforeunload', function() {
        if (websocketTimer !== null) {
            clearTimeout(websocketTimer);
            websocketTimer = null;
        }
        if (socket !== null) {
            socket.onclose = function () {}; // disable onclose handler first
            socket.close();
            socket = null;
        }
        websocketConnected = false;
    });

    document.getElementById('localPlayer').addEventListener('canplay', function() {
        document.getElementById('alertLocalPlayback').classList.add('hide');
        if (settings.featLocalplayer === true && settings.localplayerAutoplay === true) {
            localplayerPlay();
        }
    });
/* 
    // first time setup wip
    if (settings.set === false) {
        modalSetup.show();
        // console.log(false);
    }
    else {
        // console.log(true);
    }
 */
    // setGridPlayback();
    // appPrepare();
    updateDBstats();
}
/* 
window.onscroll = function() {
    scrollFunction();
};

window.onresize = function() {
    computeBrowseHeight();
};
 */
//Init app
window.onerror = function(msg, url, line) {
    logError('JavaScript error: ' + msg + ' (' + url + ': ' + line + ')');
    if (settings.loglevel >= 4) {
        if (appInited === true) {
            showNotification(t('JavaScript error'), msg + ' (' + url + ': ' + line + ')', '', 'danger');
        }
        else {
            showAppInitAlert(t('JavaScript error') + ': ' + msg + ' (' + url + ': ' + line + ')');
        }
    }
    return true;
};

appInitStart();
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function setStateIcon(state) {
    let stateIcon = document.getElementById('navState').children[0];
    let websocketStateIcon = document.getElementById('websocketState').children[0];
    let mpdStateIcon = document.getElementById('mpdState').children[0];
    let websocketStateText = document.getElementById('websocketState').getElementsByTagName('small')[0];
    let mpdStateText = document.getElementById('mpdState').getElementsByTagName('small')[0];
    
    if (websocketConnected === false) {
        stateIcon.innerText = 'cloud_off';
    }
    else if (settings.mpdConnected === false) {
        stateIcon.innerText = 'cloud_off';
    }
    else {
        if (state === 'newMessage') {
            stateIcon.innerText = 'chat';
        }
        else if (state === 'noMessage') {
            stateIcon.innerText = 'chat_bubble_outline';
        }
    }
    
    if (websocketConnected === false) {
        websocketStateIcon.innerText = 'cloud_off';
        websocketStateIcon.classList.remove('text-success');
        websocketStateText.innerText = t('Websocket disconnected');
    }
    else { 
        websocketStateIcon.innerText = 'cloud_done';
        websocketStateIcon.classList.add('text-success');
        websocketStateText.innerText = t('Websocket connected');
    }

    if (websocketConnected === false) { 
        mpdStateIcon.innerText = 'cloud_off';
        mpdStateIcon.classList.remove('text-success');
        mpdStateText.innerText = t('MPD disconnected');
    }
    else {
        mpdStateIcon.innerText = 'cloud_done';
        mpdStateIcon.classList.add('text-success');
        mpdStateText.innerText = t('MPD connected');
    }
}

function toggleAlert(alertBox, state, msg) {
    let mpdState = document.getElementById(alertBox);
    if (state === false) {
        mpdState.innerHTML = '';
        mpdState.classList.add('hide');
    }
    else {
        mpdState.innerHTML = msg;
        mpdState.classList.remove('hide');
    }
}

function showNotification(notificationTitle, notificationText, notificationHtml, notificationType) {
    if (settings.notificationWeb === true) {
        let notification = new Notification(notificationTitle, {icon: 'assets/favicon.ico', body: notificationText});
        setTimeout(notification.close.bind(notification), 3000);
    } 
    if (settings.notificationPage === true) {
        let alertBox;
        if (!document.getElementById('alertBox')) {
            alertBox = document.createElement('div');
            alertBox.setAttribute('id', 'alertBox');
            alertBox.addEventListener('click', function() {
                hideNotification();
            }, false);
        }
        else {
            alertBox = document.getElementById('alertBox');
        }
        alertBox.classList.remove('alert-success', 'alert-danger');
        alertBox.classList.add('alert','alert-' + notificationType);
        alertBox.innerHTML = '<strong>' + e(notificationTitle) + '</strong><br/>' + (notificationHtml === '' ? e(notificationText) : notificationHtml);
        document.getElementsByTagName('main')[0].append(alertBox);
        document.getElementById('alertBox').classList.add('alertBoxActive');
        if (alertTimeout) {
            clearTimeout(alertTimeout);
        }
        alertTimeout = setTimeout(function() {
            hideNotification();
        }, 3000);
    }
    setStateIcon('newMessage');
    logMessage(notificationTitle, notificationText, notificationHtml, notificationType);
}

function logMessage(notificationTitle, notificationText, notificationHtml, notificationType) {
    if (notificationType === 'success') { notificationType = 'Info'; }
    else if (notificationType === 'danger') { notificationType = 'Error'; }
    
    let overview = document.getElementById('logOverview');

    let append = true;
    let lastEntry = overview.firstElementChild;
    if (lastEntry) {
        if (lastEntry.getAttribute('data-title') === notificationTitle) {
            append = false;        
        }
    }

    let entry = document.createElement('div');
    entry.classList.add('text-light');
    entry.setAttribute('data-title', notificationTitle);
    let occurence = 1;
    if (append === false) {
        occurence += parseInt(lastEntry.getAttribute('data-occurence'));
    }
    entry.setAttribute('data-occurence', occurence);
    entry.innerHTML = '<small>' + localeDate() + '&nbsp;&ndash;&nbsp;' + t(notificationType) +
        (occurence > 1 ? '&nbsp;(' + occurence + ')' : '') + '</small>' +
        '<p>' + e(notificationTitle) +
        (notificationHtml === '' && notificationText === '' ? '' :
        '<br/>' + (notificationHtml === '' ? e(notificationText) : notificationHtml)) +
        '</p>';

    if (append === true) {
        overview.insertBefore(entry, overview.firstElementChild);
    }
    else {
        overview.replaceChild(entry, lastEntry);
    }
   
    let overviewEls = overview.getElementsByTagName('div');
    if (overviewEls.length > 10) {
        overviewEls[10].remove();
    }

    document.getElementById('navState').children[0].classList.add('text-success');
    setTimeout(function() {
        document.getElementById('navState').children[0].classList.remove('text-success');
    }, 250);
}

//eslint-disable-next-line no-unused-vars
function clearLogOverview() {
    let overviewEls = document.getElementById('logOverview').getElementsByTagName('div');
    for (let i = overviewEls.length - 1; i >= 0; i--) {
        overviewEls[i].remove();
    }
    setStateIcon('noMessage');
}

function hideNotification() {
    if (document.getElementById('alertBox')) {
        document.getElementById('alertBox').classList.remove('alertBoxActive');
        setTimeout(function() {
            let alertBox = document.getElementById('alertBox');
            if (alertBox)
                alertBox.remove();
        }, 600);
    }
}

function notificationsSupported() {
    return "Notification" in window;
}

function setElsState(tag, state) {
    let els = document.getElementsByTagName(tag);
    let elsLen = els.length;
    for (let i = 0; i < elsLen; i++) {
        if (state === 'disabled') {
            if (els[i].classList.contains('alwaysEnabled') === false) {
                if (els[i].getAttribute('disabled') === null) {
                    els[i].setAttribute('disabled', 'disabled');
                    els[i].classList.add('disabled');
                }
            }
        }
        else {
            if (els[i].classList.contains('disabled')) {
                els[i].removeAttribute('disabled');
                els[i].classList.remove('disabled');
            }
        }
    }
}

function toggleUI() {
    let state = 'disabled';
    if (websocketConnected === true && settings.mpdConnected === true) {
        state = 'enabled';
    }
    let enabled = state === 'disabled' ? false : true;
    if (enabled !== uiEnabled) {
        logDebug('Setting ui state to ' + state);
        setElsState('a', state);
        setElsState('input', state);
        setElsState('button', state);
        uiEnabled = enabled;
    }

    if (settings.mpdConnected === true) {
        toggleAlert('alertMpdState', false, '');
    }
    else {
        toggleAlert('alertMpdState', true, t('MPD disconnected'));
        logMessage(t('MPD disconnected'), '', '', 'danger');
    }

    if (websocketConnected === true) {
        toggleAlert('alertMympdState', false, '');
    }
    else {
        toggleAlert('alertMympdState', true, t('Websocket is disconnected'));
        logMessage(t('Websocket is disconnected'), '', '', 'danger');
    }
    setStateIcon();
}

var covergridSize2 = '100px';
var browseHeight = '';

var scrollToTopBtn = document.getElementById('scrollToTopBtn');

window.onscroll = function() {
    scrollFunction();
};

window.onresize = function() {
    computeBrowseHeight();
};

function scrollFunction() {
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        scrollToTopBtn.style.display = 'block';
    } else {
        scrollToTopBtn.style.display = 'none';
    }
}

function setGridPlayback() {
    document.getElementById('cardQueueMini').classList.add('hide');
    // domCache.cardHeaderQueue[i].classList.remove('active');
    // console.log('setgridplayback');
    closeCover();
    
    let list = ['col-md-6', 'd-none', 'd-md-block']; // col2
    if (app.current.app === 'Playback') {
        document.getElementById('row1').classList.add('row');
        document.getElementById('col1').classList.add('col-md-6');
        document.getElementById('col2').classList.add(...list);
        document.getElementById('cardQueueMini').classList.remove('hide');
        document.getElementById('cardBrowse').classList.remove('hide');
        document.getElementById('cardBrowseCovergrid').classList.remove('hide');
        document.getElementById('cardBrowseNavCovergrid').classList.add('active');
        //document.documentElement.style.setProperty('--mympd-coverimagesize', settings.coverimageSize + "px");
        // document.documentElement.style.setProperty('--mympd-covergridsize', settings.covergridSize * 0.5 + "px");
        document.getElementById('cardHeaderBrowse').classList.add('hide');
        // add txt as class hide always for sm
        // document.getElementById('sortText').style.display = 'none';
        document.getElementById('sortText').classList.add('d-none');
        document.getElementById('browseHeight').style.height = browseHeight;
    }
    else {
        document.getElementById('row1').classList.remove('row');
        document.getElementById('col1').classList.remove('col-md-6');
        document.getElementById('col2').classList.remove(...list);
        // document.documentElement.style.setProperty('--mympd-covergridsize', settings.covergridSize + "px");
        // document.getElementById('cardHeaderQueue').classList.remove('hide');
        document.getElementById('cardHeaderBrowse').classList.remove('hide');
        document.getElementById('sortText').classList.remove('d-none');
        // document.getElementById('sortText').style.display = 'inline';
        document.getElementById('browseHeight').style.height = '';
    }
    // console.log('setgridplaybackret');
    //lists
}

function getQueueMini(pos, updFooter = false) {
    let colsQueueMini = ["Pos", "Title", "Artist", "Album", "Duration"];
    // footer
    sendAPI("MPD_API_QUEUE_LIST", {"offset": 0, "cols": []}, parseQueueList);
    // list
    if (pos !== undefined && pos !== -1) {
        // console.log('api call mini', pos);
        sendAPI("MPD_API_QUEUE_MINI", {"pos": pos, "cols": colsQueueMini}, parseQueueMini);
    }
    else if (pos === undefined) {
        let table = document.getElementById('QueueMiniList');
        let tbody = table.getElementsByTagName('tbody')[0];
        for (let i = tbody.rows.length - 1; i >= 0; i--) {
            tbody.deleteRow(i);
        }
        table.classList.add('opacity05');
    }
}

function parseQueueList(obj) {
    if (obj.result.totalTime && obj.result.totalTime > 0 && obj.result.totalEntities <= settings.maxElementsPerPage ) {
        document.getElementById('cardFooterQueueMini').innerText = t('Num songs', obj.result.totalEntities) + ' – ' + beautifyDuration(obj.result.totalTime);
    }
    else if (obj.result.totalEntities > 0) {
        document.getElementById('cardFooterQueueMini').innerText = t('Num songs', obj.result.totalEntities);
    }
    else {
        document.getElementById('cardFooterQueueMini').innerText = '';
    }
}

function parseQueueMini(obj) {
    let colsQueueMini = ["Pos", "Title", "Artist", "Album", "Duration"];
    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById('QueueMiniList');
    // let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
    let activeRow = 0;
    table.setAttribute('data-version', obj.result.queueVersion);
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    for (let i = 0; i < nrItems; i++) {
        obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
        obj.result.data[i].Pos++;
        let row = document.createElement('tr');
        // row.setAttribute('draggable', 'true');
        row.setAttribute('data-trackid', obj.result.data[i].id);
        row.setAttribute('id','queueMiniTrackId' + obj.result.data[i].id);
        row.setAttribute('data-songpos', obj.result.data[i].Pos);
        row.setAttribute('data-duration', obj.result.data[i].Duration);
        row.setAttribute('data-uri', obj.result.data[i].uri);
        row.setAttribute('tabindex', 0);
        let tds = '';
        for (let c = 0; c < colsQueueMini.length; c++) {
            tds += '<td data-col="' + colsQueueMini[c] + '">' + e(obj.result.data[i][colsQueueMini[c]]) + '</td>';
        }
        // tds += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td>';
        row.innerHTML = tds;
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    let trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i --) {
        tr[i].remove();
    }
    document.getElementById('QueueMiniList').classList.remove('opacity05');
}

function setCovergridList() {
    if (document.getElementById('BrowseCovergridList').classList.contains('hide')) { // view2list
        document.getElementById('btnBrowseCovergridAlbum').parentNode.classList.add('hide');
        document.getElementById('BrowseCovergridTitleList').classList.add('hide');
        document.getElementById('BrowseCovergridAlbumList').classList.remove('hide');
    }
}

function getBrowseCovergrid() {
    setCovergridList();
    document.getElementById('searchCovergridStr').value = app.current.search;
    selectTag('searchCovergridTags', 'searchCovergridTagsDesc', app.current.filter);
    let sort = app.current.sort;
    let sortdesc = false;
    if (app.current.sort.charAt(0) === '-') {
        sortdesc = true;
        sort = app.current.sort.substr(1);
        toggleBtnChk('covergridSortDesc', true);
    }
    else {
        toggleBtnChk('covergridSortDesc', false);
    }
    selectTag('covergridSortTags', undefined, sort);
    sendAPI("MPD_API_DATABASE_GET_ALBUMS", {"offset": app.current.page, "searchstr": app.current.search,
        "tag": app.current.filter, "sort": sort, "sortdesc": sortdesc}, parseCovergrid);
}

function computeBrowseHeight() {
    // console.log('cbh');
    //test
    let p = document.getElementById('cardPlayback').offsetHeight;
    let q = document.getElementById('cardQueueMini').offsetHeight;
    let b = document.getElementById('BrowseCovergridButtons').offsetHeight;
    let f = document.getElementById('cardFooterBrowse').offsetHeight;
    // let h = document.getElementById('cardHeaderQueueMini').offsetHeight;
    let c = p + q - b - f - 54 -1; // 
    browseHeight = c + 'px';
    if (app.current.app === 'Playback') {
        document.getElementById('browseHeight').style.height = browseHeight;
    }
}

function swapView() {
    document.getElementById('btnBrowseCovergridAlbum').classList.add('hide');
    if (document.getElementById('BrowseCovergridList').classList.contains('hide')) {
        document.getElementById('BrowseCovergridAlbumList').classList.add('hide');
        document.getElementById('BrowseCovergridTitleList').classList.add('hide');
        document.getElementById('BrowseCovergridList').classList.remove('hide');
    }
    else {
        document.getElementById('BrowseCovergridList').classList.add('hide');
        document.getElementById('BrowseCovergridTitleList').classList.add('hide');
        document.getElementById('BrowseCovergridAlbumList').classList.remove('hide');
    }
}

function gotoAlbumList() {
    // console.log('gotoalbumlist');
    // maxof document.body.scrollTop document.documentElement.scrollTop
    document.getElementById('btnBrowseCovergridAlbum').parentNode.classList.add('hide');
    getBrowseCovergrid();
}

function parseCovergridAlbum(obj) {
    // console.log('parsecovergridalbum');
    let colspan = 3;
    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById('BrowseCovergridAlbumList');
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
    let activeRow = 0;
    for (let i = 0; i < nrItems; i++) {
        let row = document.createElement('tr');
        let tds = '';
        // row.setAttribute('data-type', obj.result.data[i].Type); // album
        row.setAttribute('data-type', 'dir');
        // row.setAttribute('data-uri', encodeURI(obj.result.data[i].FirstSongUri));
        let uri = dirname(obj.result.data[i].FirstSongUri);
        row.setAttribute('data-uri', encodeURI(uri));
        row.setAttribute('tabindex', 0);
        // row.setAttribute('data-id', genId('covergrid' + obj.result.data[i].Album + obj.result.data[i].AlbumArtist));
        row.setAttribute('data-album', obj.result.data[i].Album);
        row.setAttribute('data-albumartist', obj.result.data[i].AlbumArtist);
        row.setAttribute('data-name', obj.result.data[i].Album);
        tds += '<td data-col="Type"><span class="material-icons">album</span></td>';
        tds += '<td data-col="Album">' + e(obj.result.data[i].Album) + '</td>';
        tds += '<td data-col="AlbumArtist">' + e(obj.result.data[i].AlbumArtist) + '</td>';
        tds += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td>';
        row.innerHTML = tds;
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    let trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i --) {
        tr[i].remove();
    }

    if (navigate === true) {
        focusTable(0);
    }

    if (nrItems === 0)
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                          '<td colspan="' + colspan + '">' + t('Empty list') + '</td></tr>';
    document.getElementById('BrowseCovergridAlbumList').classList.remove('opacity05');
}

function getCovergridTitle(tr) {
    // console.log('getcovergridtitle', tr);
    sendAPI("MPD_API_DATABASE_TAG_ALBUM_TITLE_LIST", {"album": decodeURI(tr.getAttribute('data-album')),
        "search": decodeURI(tr.getAttribute('data-albumartist')),
        "tag": "AlbumArtist", "cols": settings.colsBrowseDatabase}, parseCovergridTitle);
}

function parseCovergridTitle(obj) {
    document.getElementById('card' + app.current.app).scrollIntoView();
    document.getElementById('BrowseCovergridAlbumList').classList.add('hide');
    document.getElementById('BrowseCovergridTitleList').classList.remove('hide');
    document.getElementById('BrowseCovergridTitleList').getElementsByTagName('caption')[0].innerHTML =
        t(obj.result.AlbumArtist)  + ' - ' + t(obj.result.Album);
    document.getElementById('btnBrowseCovergridAlbum').parentNode.classList.remove('hide');
    let colspan = 3;
    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById('BrowseCovergridTitleList');
    let albumuri = encodeURI(dirname(obj.result.data[0].uri)); // rplc
    table.setAttribute('data-uri', albumuri);
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
    let activeRow = 0;
    for (let i = 0; i < nrItems; i++) {
        let uri = encodeURI(obj.result.data[i].uri);
        let row = document.createElement('tr');
        let tds = '';
        row.setAttribute('data-type', obj.result.data[i].Type); // song
        row.setAttribute('data-uri', uri);
        row.setAttribute('tabindex', 0);
        row.setAttribute('data-name', obj.result.data[i].Title);
        obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
        /*for (let c = 0; c < settings['cols' + list].length; c++) {
            tds += '<td data-col="' + settings['cols' + list][c] + '">';
            if (settings['cols' + list][c] === 'Type') {
                tds += '<span class="material-icons">music_note</span>';
            }
            else {
                tds += e(obj.result.data[i][settings['cols' + list][c]]);
            }
            tds += '</td>';
        } */
        tds += '<td data-col="Track">' + e(obj.result.data[i].Track) + '</td>';
        tds += '<td data-col="Title">' + e(obj.result.data[i].Title) + '</td>';
        tds += '<td data-col="Duration">' + e(obj.result.data[i].Duration) + '</td>';
        tds += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td>';
        row.innerHTML = tds;
        
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    let trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i --) {
        tr[i].remove();
    }

    if (navigate === true) {
        focusTable(0);
    }

    if (nrItems === 0)
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                          '<td colspan="' + colspan + '">' + t('Empty list') + '</td></tr>';

    document.getElementById('cardFooterBrowse').innerHTML = t('Num songs', obj.result.totalEntities) + ' &ndash; ' + beautifyDuration(obj.result.totalTime);
    document.getElementById('BrowseCovergridTitleList').classList.remove('opacity05');
}

function updateDBstats() {
    // console.log('updatedbstats');
    sendAPI("MPD_API_DATABASE_STATS", {}, parseDBstats);
}

function parseDBstats(obj) {
    // console.log('parsedbstats');
    document.getElementById('cardBrowseDBStats').firstChild.innerHTML = 'Songs: ' + obj.result.songs + ' &bull; DB play time: ' + beautifyDuration(obj.result.dbPlaytime);
}

function getTableId(node) {
    let element = node;
    if (element.nodeName !== 'A')
        return ''; 
    while (element.tagName.toLowerCase() !== 'table') {
        element = element.parentNode;
    }
    return element.id;
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function parsePlaylists(obj) {
    if (app.current.view === 'All') {
        document.getElementById('BrowsePlaylistsAllList').classList.remove('hide');
        document.getElementById('BrowsePlaylistsDetailList').classList.add('hide');
        document.getElementById('btnBrowsePlaylistsAll').parentNode.classList.add('hide');
        document.getElementById('playlistContentBtns').classList.add('hide');
        document.getElementById('smartPlaylistContentBtns').classList.add('hide');
        document.getElementById('btnAddSmartpls').parentNode.classList.remove('hide');
    } else {
        if (obj.result.uri.indexOf('.') > -1 || obj.result.smartpls === true) {
            document.getElementById('BrowsePlaylistsDetailList').setAttribute('data-ro', 'true')
            document.getElementById('playlistContentBtns').classList.add('hide');
            document.getElementById('smartPlaylistContentBtns').classList.remove('hide');
        }
        else {
            document.getElementById('BrowsePlaylistsDetailList').setAttribute('data-ro', 'false');
            document.getElementById('playlistContentBtns').classList.remove('hide');
            document.getElementById('smartPlaylistContentBtns').classList.add('hide');
        }
        document.getElementById('BrowsePlaylistsDetailList').setAttribute('data-uri', obj.result.uri);
        document.getElementById('BrowsePlaylistsDetailList').getElementsByTagName('caption')[0].innerHTML =
            (obj.result.smartpls === true ? t('Smart playlist') : t('Playlist'))  + ': ' + obj.result.uri;
        document.getElementById('BrowsePlaylistsDetailList').classList.remove('hide');
        document.getElementById('BrowsePlaylistsDetailList').classList.add('clickable');
        document.getElementById('BrowsePlaylistsAllList').classList.add('hide');
        document.getElementById('btnBrowsePlaylistsAll').parentNode.classList.remove('hide');
        document.getElementById('btnAddSmartpls').parentNode.classList.add('hide');
    }

    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById(app.current.app + app.current.tab + app.current.view + 'List');
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
    let activeRow = 0;
    if (app.current.view === 'All') {
        for (let i = 0; i < nrItems; i++) {
            let uri = encodeURI(obj.result.data[i].uri);
            let row = document.createElement('tr');
            row.setAttribute('data-uri', uri);
            row.setAttribute('data-type', obj.result.data[i].Type);
            row.setAttribute('data-name', obj.result.data[i].name);
            row.setAttribute('tabindex', 0);
            row.innerHTML = '<td data-col="Type"><span class="material-icons">' + (obj.result.data[i].Type === 'smartpls' ? 'queue_music' : 'list') + '</span></td>' +
                            '<td>' + e(obj.result.data[i].name) + '</td>' +
                            '<td>'+ localeDate(obj.result.data[i].last_modified) + '</td>' +
                            '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td>';
            if (i < tr.length) {
                activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
            }
            else {
                tbody.append(row);
            }
        }
        document.getElementById('cardFooterBrowse').innerText = gtPage('Num playlists', obj.result.returnedEntities, obj.result.totalEntities);
    }
    else if (app.current.view === 'Detail') {
        for (let i = 0; i < nrItems; i++) {
            let uri = encodeURI(obj.result.data[i].uri);
            let row = document.createElement('tr');
            if (obj.result.smartpls === false) {
                row.setAttribute('draggable','true');
            }
            row.setAttribute('id','playlistTrackId' + obj.result.data[i].Pos);
            row.setAttribute('data-type', obj.result.data[i].Type);
            row.setAttribute('data-uri', uri);
            row.setAttribute('data-name', obj.result.data[i].Title);
            row.setAttribute('data-songpos', obj.result.data[i].Pos);
            row.setAttribute('tabindex', 0);
            obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
            let tds = '';
            for (let c = 0; c < settings.colsBrowsePlaylistsDetail.length; c++) {
                tds += '<td data-col="' + settings.colsBrowsePlaylistsDetail[c] + '">' + e(obj.result.data[i][settings.colsBrowsePlaylistsDetail[c]]) + '</td>';
            }
            tds += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td>';
            row.innerHTML = tds;

            if (i < tr.length) {
                activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
            }
            else {
                tbody.append(row);
            }
        }
        document.getElementById('cardFooterBrowse').innerText = gtPage('Num songs', obj.result.returnedEntities, obj.result.totalEntities);
    }
    let trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i --) {
        tr[i].remove();
    }

    if (navigate === true) {
        focusTable(0);
    }

    setPagination(obj.result.totalEntities, obj.result.returnedEntities);

    if (nrItems === 0) {
        if (app.current.view === 'All') {
            tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                              '<td colspan="3">' + t('No playlists found') + '</td></tr>';
        }
        else {
            tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                              '<td colspan="' + (settings.colsBrowsePlaylistsDetail.length - 1) + '">' + t('Empty playlist') + '</td></tr>';
        }
    }

    document.getElementById(app.current.app + app.current.tab + app.current.view + 'List').classList.remove('opacity05');
}

//eslint-disable-next-line no-unused-vars
function playlistDetails(uri) {
    document.getElementById('BrowsePlaylistsAllList').classList.add('opacity05');
    appGoto('Browse', 'Playlists', 'Detail', '0/-/-/' + uri);
}

//eslint-disable-next-line no-unused-vars
function playlistClear() {
    let uri = document.getElementById('BrowsePlaylistsDetailList').getAttribute('data-uri');
    sendAPI("MPD_API_PLAYLIST_CLEAR", {"uri": uri});
    document.getElementById('BrowsePlaylistsDetailList').classList.add('opacity05');
}

//eslint-disable-next-line no-unused-vars
function playlistShuffle() {
    let uri = document.getElementById('BrowsePlaylistsDetailList').getAttribute('data-uri');
    sendAPI("MPD_API_PLAYLIST_SHUFFLE", {"uri": uri});
    document.getElementById('BrowsePlaylistsDetailList').classList.add('opacity05');    
}

//eslint-disable-next-line no-unused-vars
function playlistSort(tag) {
    let uri = document.getElementById('BrowsePlaylistsDetailList').getAttribute('data-uri');
    sendAPI("MPD_API_PLAYLIST_SORT", {"uri": uri, "tag": tag});
    document.getElementById('BrowsePlaylistsDetailList').classList.add('opacity05');    
}

function getAllPlaylists(obj) {
    let nrItems = obj.result.returnedEntities;
    let playlists = '';
    if (obj.result.offset === 0) {
        if (playlistEl === 'addToPlaylistPlaylist') {
            playlists = '<option value=""></option><option value="new">' + t('New playlist') + '</option>';
        }
        else if (playlistEl === 'selectJukeboxPlaylist' ||
                 playlistEl === 'selectAddToQueuePlaylist' ||
                 playlistEl === 'selectTimerPlaylist'
        ) {
            playlists = '<option value="Database">' + t('Database') + '</option>';
        }
    }
    for (let i = 0; i < nrItems; i++) {
        if (playlistEl === 'addToPlaylistPlaylist' && obj.result.data[i].Type === 'smartpls') {
            continue;
        }
        playlists += '<option value="' + e(obj.result.data[i].uri) + '"';
        if (playlistEl === 'selectJukeboxPlaylist' && obj.result.data[i].uri === settings.jukeboxPlaylist) {
            playlists += ' selected';
        }
        playlists += '>' + e(obj.result.data[i].uri) + '</option>';
    }
    if (obj.result.offset === 0) {
        document.getElementById(playlistEl).innerHTML = playlists;
    }
    else {
        document.getElementById(playlistEl).innerHTML += playlists;
    }
    
    if (obj.result.totalEntities > obj.result.returnedEntities + obj.result.offset && obj.result.returnedEntities > 0) {
        obj.result.offset += settings.maxElementsPerPage;
        sendAPI("MPD_API_PLAYLIST_LIST", {"offset": obj.result.offset, "filter": "-"}, getAllPlaylists);
    }
}

//eslint-disable-next-line no-unused-vars
function updateSmartPlaylists() {
    sendAPI("MPD_API_SMARTPLS_UPDATE_ALL", {});
}

//eslint-disable-next-line no-unused-vars
function removeFromPlaylist(uri, pos) {
    pos--;
    sendAPI("MPD_API_PLAYLIST_RM_TRACK", {"uri": uri, "track": pos});
    document.getElementById('BrowsePlaylistsDetailList').classList.add('opacity05');
}

//eslint-disable-next-line no-unused-vars
function toggleAddToPlaylistFrm() {
    let btn = document.getElementById('toggleAddToPlaylistBtn');
    toggleBtn('toggleAddToPlaylistBtn');
    if (btn.classList.contains('active')) {
        document.getElementById('addToPlaylistFrm').classList.remove('hide');
        document.getElementById('addStreamFooter').classList.add('hide');
        document.getElementById('addToPlaylistFooter').classList.remove('hide');
    }
    else {
        document.getElementById('addToPlaylistFrm').classList.add('hide');
        document.getElementById('addStreamFooter').classList.remove('hide');
        document.getElementById('addToPlaylistFooter').classList.add('hide');
    }
}

function parseSmartPlaylist(obj) {
    let nameEl = document.getElementById('saveSmartPlaylistName');
    nameEl.value = obj.result.playlist;
    nameEl.classList.remove('is-invalid');
    document.getElementById('saveSmartPlaylistType').value = t(obj.result.type);
    document.getElementById('saveSmartPlaylistType').setAttribute('data-value', obj.result.type);
    document.getElementById('saveSmartPlaylistSearch').classList.add('hide');
    document.getElementById('saveSmartPlaylistSticker').classList.add('hide');
    document.getElementById('saveSmartPlaylistNewest').classList.add('hide');
    let tagList;
    if (settings.featTags) {
        tagList = '<option value="any">' + t('Any Tag') + '</option>';
    }
    tagList += '<option value="filename">' + t('Filename') + '</option>';
    for (let i = 0; i < settings.searchtags.length; i++) {
        tagList += '<option value="' + settings.searchtags[i] + '">' + t(settings.searchtags[i]) + '</option>';
    }
    let elSelectSaveSmartPlaylistTag = document.getElementById('selectSaveSmartPlaylistTag');
    elSelectSaveSmartPlaylistTag.innerHTML = tagList;
    if (obj.result.type === 'search') {
        document.getElementById('saveSmartPlaylistSearch').classList.remove('hide');
        document.getElementById('selectSaveSmartPlaylistTag').value = obj.result.tag;
        document.getElementById('inputSaveSmartPlaylistSearchstr').value = obj.result.searchstr;
        if (settings.featAdvsearch && obj.result.tag === 'expression') {
            elSelectSaveSmartPlaylistTag.parentNode.parentNode.classList.add('hide');
            elSelectSaveSmartPlaylistTag.innerHTML = '<option value="expression">expression</option>';
            elSelectSaveSmartPlaylistTag.value = 'expression';
        }
        else {
            document.getElementById('selectSaveSmartPlaylistTag').parentNode.parentNode.classList.remove('hide');
        }
    }
    else if (obj.result.type === 'sticker') {
        document.getElementById('saveSmartPlaylistSticker').classList.remove('hide');
        document.getElementById('selectSaveSmartPlaylistSticker').value = obj.result.sticker;
        document.getElementById('inputSaveSmartPlaylistStickerMaxentries').value = obj.result.maxentries;
        document.getElementById('inputSaveSmartPlaylistStickerMinvalue').value = obj.result.minvalue;
    }
    else if (obj.result.type === 'newest') {
        document.getElementById('saveSmartPlaylistNewest').classList.remove('hide');
        let timerange = obj.result.timerange / 24 / 60 / 60;
        document.getElementById('inputSaveSmartPlaylistNewestTimerange').value = timerange;
    }
    modalSaveSmartPlaylist.show();
    nameEl.focus();
}

//eslint-disable-next-line no-unused-vars
function saveSmartPlaylist() {
    let name = document.getElementById('saveSmartPlaylistName').value;
    let type = document.getElementById('saveSmartPlaylistType').getAttribute('data-value');
    let sortEl = document.getElementById('saveSmartPlaylistSort');
    let sort = sortEl.options[sortEl.selectedIndex].value;
    if (validatePlname(name) === true) {
        if (type === 'search') {
            let tagEl = document.getElementById('selectSaveSmartPlaylistTag');
            let tag = tagEl.options[tagEl.selectedIndex].value;
            let searchstr = document.getElementById('inputSaveSmartPlaylistSearchstr').value;
            sendAPI("MPD_API_SMARTPLS_SAVE", {"type": type, "playlist": name, "tag": tag, "searchstr": searchstr, "sort": sort});
        }
        else if (type === 'sticker') {
            let stickerEl = document.getElementById('selectSaveSmartPlaylistSticker');
            let sticker = stickerEl.options[stickerEl.selectedIndex].value;
            let maxentriesEl = document.getElementById('inputSaveSmartPlaylistStickerMaxentries');
            if (!validateInt(maxentriesEl)) {
                return;
            }
            let minvalueEl = document.getElementById('inputSaveSmartPlaylistStickerMinvalue');
            if (!validateInt(minvalueEl)) {
                return;
            }
            sendAPI("MPD_API_SMARTPLS_SAVE", {"type": type, "playlist": name, "sticker": sticker, "maxentries": parseInt(maxentriesEl.value), 
                "minvalue": parseInt(minvalueEl.value), "sort": sort});
        }
        else if (type === 'newest') {
            let timerangeEl = document.getElementById('inputSaveSmartPlaylistNewestTimerange');
            if (!validateInt(timerangeEl)) {
                return;
            }
            let timerange = parseInt(timerangeEl.value) * 60 * 60 * 24;
            sendAPI("MPD_API_SMARTPLS_SAVE", {"type": type, "playlist": name, "timerange": timerange, "sort": sort});
        }
        else {
            document.getElementById('saveSmartPlaylistType').classList.add('is-invalid');
            return;
        }
        modalSaveSmartPlaylist.hide();
        showNotification(t('Saved smart playlist %{name}', {"name": name}), '', '', 'success');
    }
    else {
        document.getElementById('saveSmartPlaylistName').classList.add('is-invalid');
    }
}

//eslint-disable-next-line no-unused-vars
function addSmartpls(type) {
    let obj = {"jsonrpc":"2.0", "id":0, "result": {"method":"MPD_API_SMARTPLS_GET"}};
    if (type === 'mostPlayed') {
        obj.result.playlist = settings.smartplsPrefix + (settings.smartplsPrefix !== '' ? '-' : '') + 'mostPlayed';
        obj.result.type = 'sticker';
        obj.result.sticker = 'playCount';
        obj.result.maxentries = 200;
        obj.result.minvalue = 10;
    }
    else if (type === 'newest') {
        obj.result.playlist = settings.smartplsPrefix + (settings.smartplsPrefix !== '' ? '-' : '') + 'newestSongs';
        obj.result.type = 'newest';
        obj.result.timerange = 14 * 24 * 60 * 60;
    }
    else if (type === 'bestRated') {
        obj.result.playlist = settings.smartplsPrefix + (settings.smartplsPrefix !== '' ? '-' : '') + 'bestRated';
        obj.result.type = 'sticker';
        obj.result.sticker = 'like';
        obj.result.maxentries = 200;
        obj.result.minvalue = 2;
    }
    parseSmartPlaylist(obj);
}

//eslint-disable-next-line no-unused-vars
function deletePlaylists() {
    let selectDeletePlaylists = document.getElementById('selectDeletePlaylists');
    let btnDeletePlaylists = document.getElementById('btnDeletePlaylists');
    btnWaiting(btnDeletePlaylists, true);
    sendAPI("MPD_API_PLAYLIST_RM_ALL", {"type": selectDeletePlaylists.options[selectDeletePlaylists.selectedIndex].value}, function() {
        btnWaiting(btnDeletePlaylists, false);
    });
}

//eslint-disable-next-line no-unused-vars
function showAddToPlaylistCurrentSong() {
    let uri = document.getElementById('currentTitle').getAttribute('data-uri');
    if (uri !== '') {
        showAddToPlaylist(uri, '');
    }
}

function showAddToPlaylist(uri, searchstr) {
    document.getElementById('addToPlaylistUri').value = uri;
    document.getElementById('addToPlaylistSearch').value = searchstr;
    document.getElementById('addToPlaylistPlaylist').innerHTML = '';
    document.getElementById('addToPlaylistNewPlaylist').value = '';
    document.getElementById('addToPlaylistNewPlaylistDiv').classList.add('hide');
    document.getElementById('addToPlaylistNewPlaylist').classList.remove('is-invalid');
    toggleBtn('toggleAddToPlaylistBtn',0);
    let streamUrl = document.getElementById('streamUrl')
    streamUrl.focus();
    streamUrl.value = '';
    streamUrl.classList.remove('is-invalid');
    if (uri !== 'stream') {
        document.getElementById('addStreamFooter').classList.add('hide');
        document.getElementById('addStreamFrm').classList.add('hide');
        document.getElementById('addToPlaylistFooter').classList.remove('hide');
        document.getElementById('addToPlaylistFrm').classList.remove('hide');
        document.getElementById('addToPlaylistCaption').innerText = t('Add to playlist');
    }
    else {
        document.getElementById('addStreamFooter').classList.remove('hide');
        document.getElementById('addStreamFrm').classList.remove('hide');
        document.getElementById('addToPlaylistFooter').classList.add('hide');
        document.getElementById('addToPlaylistFrm').classList.add('hide');
        document.getElementById('addToPlaylistCaption').innerText = t('Add stream');
    }
    modalAddToPlaylist.show();
    if (settings.featPlaylists) {
        playlistEl = 'addToPlaylistPlaylist';
        sendAPI("MPD_API_PLAYLIST_LIST", {"offset": 0, "filter": "-"}, getAllPlaylists);
    }
}

//eslint-disable-next-line no-unused-vars
function addToPlaylist() {
    let uri = document.getElementById('addToPlaylistUri').value;
    if (uri === 'stream') {
        uri = document.getElementById('streamUrl').value;
        if (uri === '' || uri.indexOf('http') === -1) {
            document.getElementById('streamUrl').classList.add('is-invalid');
            return;
        }
    }
    let plistEl = document.getElementById('addToPlaylistPlaylist');
    let plist = plistEl.options[plistEl.selectedIndex].value;
    if (plist === 'new') {
        let newPl = document.getElementById('addToPlaylistNewPlaylist').value;
        if (validatePlname(newPl) === true) {
            plist = newPl;
        } else {
            document.getElementById('addToPlaylistNewPlaylist').classList.add('is-invalid');
            return;
        }
    }
    if (plist !== '') {
        if (uri === 'SEARCH') {
            addAllFromSearchPlist(plist, null, false);
        }
        if (uri === 'ALBUM') {
            let expression = document.getElementById('addToPlaylistSearch').value;
            addAllFromSearchPlist(plist, expression, false);
        }
        else if (uri === 'SEARCHTIDAL') {
            addAllFromSearchTidalPlist(plist);
        }
        else if (uri === 'SEARCHQOBUZ') {
            //addAllFromSearchQobuzPlist(plist);
        }
        else if (uri === 'DATABASE') {
            addAllFromBrowseDatabasePlist(plist);
        }
        else {
            sendAPI("MPD_API_PLAYLIST_ADD_TRACK", {"uri": uri, "plist": plist});
        }
        modalAddToPlaylist.hide();
    }
    else {
        document.getElementById('addToPlaylistPlaylist').classList.add('is-invalid');
    }
}

//eslint-disable-next-line no-unused-vars
function showRenamePlaylist(from) {
    document.getElementById('renamePlaylistTo').classList.remove('is-invalid');
    modalRenamePlaylist.show();
    document.getElementById('renamePlaylistFrom').value = from;
    document.getElementById('renamePlaylistTo').value = '';
}

//eslint-disable-next-line no-unused-vars
function renamePlaylist() {
    let from = document.getElementById('renamePlaylistFrom').value;
    let to = document.getElementById('renamePlaylistTo').value;
    if (to !== from && validatePlname(to) === true && validatePlname(from) === true) {
        sendAPI("MPD_API_PLAYLIST_RENAME", {"from": from, "to": to});
        modalRenamePlaylist.hide();
    }
    else {
        document.getElementById('renamePlaylistTo').classList.add('is-invalid');
    }
}

//eslint-disable-next-line no-unused-vars
function showSmartPlaylist(playlist) {
    sendAPI("MPD_API_SMARTPLS_GET", {"playlist": playlist}, parseSmartPlaylist);
}

//eslint-disable-next-line no-unused-vars
function updateSmartPlaylist(playlist) {
    sendAPI("MPD_API_SMARTPLS_UPDATE", {"playlist": playlist});
}

//eslint-disable-next-line no-unused-vars
function updateSmartPlaylistClick() {
    let uri = document.getElementById('BrowsePlaylistsDetailList').getAttribute('data-uri');
    sendAPI("MPD_API_SMARTPLS_UPDATE", {"playlist": uri});
    document.getElementById('BrowsePlaylistsDetailList').classList.add('opacity05');    
}

//eslint-disable-next-line no-unused-vars
function showDelPlaylist(uri) {
    document.getElementById('deletePlaylist').value = uri;
    modalDeletePlaylist.show();
}

//eslint-disable-next-line no-unused-vars
function delPlaylist() {
    let uri = document.getElementById('deletePlaylist').value;
    sendAPI("MPD_API_PLAYLIST_RM", {"uri": uri});
    modalDeletePlaylist.hide();
}

function playlistMoveTrack(from, to) {
    sendAPI("MPD_API_PLAYLIST_MOVE_TRACK", {"plist": app.current.search, "from": from, "to": to});
}

//eslint-disable-next-line no-unused-vars
function addSelectedItemToPlaylist() {
    let item = document.activeElement;
    if (item) {
        if (item.parentNode.parentNode.id === 'BrowsePlaylistsAllList') {
            return;
        }
        showAddToPlaylist(item.getAttribute('data-uri'), '');
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

function addMenuItem(href, text) {
    return '<a class="dropdown-item" href="#" data-href=\'' + b64EncodeUnicode(JSON.stringify(href)) + '\'>' + text +'</a>';
}

function hideMenu() {
    let menuEl = document.querySelector('[data-popover]');
    if (menuEl) {
        new Popover(menuEl, {});
        menuEl.Popover.hide();
        menuEl.removeAttribute('data-popover');
        if (menuEl.parentNode.parentNode.classList.contains('selected')) {
            focusTable(undefined, menuEl.parentNode.parentNode.parentNode.parentNode);
        }
        else if ((app.current.app === 'Browse' && app.current.tab === 'Covergrid') ||
                 (app.current.app === 'Playlist' && getTableId(menuEl) !== 'QueueCurrentList')) {
            focusTable(undefined, menuEl.parentNode.parentNode.parentNode.parentNode);
        }
    }
}

function showMenu(el, event) {
    event.preventDefault();
    event.stopPropagation();
    hideMenu();
    if (el.getAttribute('data-init')) {
        return;
    }
    if (el.parentNode.nodeName === 'TH') {
        showMenuTh(el);
    }
    else {
        showMenuTd(el);
    }
}

function showMenuTh(el) {
    let table = app.current.app + (app.current.tab !== undefined ? app.current.tab : '') + (app.current.view !== undefined ? app.current.view : '');
    // tmp fix rm view for tidal
    if (table === 'SearchTidalAll' || table === 'SearchTidalArtist' || table === 'SearchTidalAlbum') {
        table = 'SearchTidal';
    }
    else if (table === 'Playback' && getTableId(el) === 'QueueCurrentList') {
        table = 'QueueCurrent'
    }
    else if (table === 'Playback' && getTableId(el) !== 'QueueCurrentList') {
        table = 'BrowseCovergrid'
    }
    let menu = '<form class="p-2" id="colChecklist' + table + '">';
    menu += setColsChecklist(table);
    menu += '<button class="btn btn-success btn-block btn-sm mt-2">' + t('Apply') + '</button>';
    menu += '</form>';
    new Popover(el, { trigger: 'click', delay: 0, dismissible: true, template: '<div class="popover" role="tooltip">' +
        '<div class="arrow"></div>' +
        '<div class="popover-content" id="' + table + 'ColsDropdown' + '">' + menu + '</div>' +
        '</div>', content: ' '});
    let popoverInit = el.Popover;
    el.setAttribute('data-init', 'true');
    el.addEventListener('shown.bs.popover', function(event) {
        event.target.setAttribute('data-popover', 'true');
        document.getElementById('colChecklist' + table).addEventListener('click', function(eventClick) {
            if (eventClick.target.nodeName === 'BUTTON' && eventClick.target.classList.contains('material-icons')) {
                toggleBtnChk(eventClick.target);
                eventClick.preventDefault();
                eventClick.stopPropagation();
            }
            else if (event.target.nodeName === 'BUTTON') {
                eventClick.preventDefault();
                saveCols(table);
            }
        }, false);
    }, false);
    popoverInit.show();
}

function showMenuTd(el) {
    let type = el.getAttribute('data-type');
    let uri = decodeURI(el.getAttribute('data-uri'));
    let name = decodeURI(el.getAttribute('data-name'));
    let nextsongpos = 0;
    if (type === null || uri === '') { // a > td > tr
        type = el.parentNode.parentNode.getAttribute('data-type');
        uri = decodeURI(el.parentNode.parentNode.getAttribute('data-uri'));
        name = el.parentNode.parentNode.getAttribute('data-name');
    }
    if (type === null || uri === '') { // wip - playlist  td > tr
        // console.log('testa');
        type = el.parentNode.getAttribute('data-type');
        uri = decodeURI(el.parentNode.getAttribute('data-uri'));
        name = el.parentNode.getAttribute('data-name');
    }
    
    if (lastState) {
        nextsongpos = lastState.nextSongPos;
    }

    let menu = '';
    if ((app.current.app === 'Browse' && app.current.tab === 'Filesystem') ||
        (app.current.app === 'Search' && app.current.tab === 'Database') ||
        (app.current.app === 'Browse' && app.current.tab === 'Database') ||
        (app.current.app === 'Browse' && app.current.tab === 'Covergrid' && el.nodeName === 'A') ||
        // alter line below
        (app.current.app === 'Playback' && el.nodeName === 'A' && getTableId(el) !== 'QueueCurrentList')) {
        // menu += (type === 'song' ? addMenuItem({"cmd": "appendPlayQueue", "options": [type, uri, name]}, t('Play')) : '') +
        // console.log('pop', type, uri, name);
        menu += addMenuItem({"cmd": "appendPlayQueue", "options": [type, uri, name]}, t('Play')) +
            addMenuItem({"cmd": "appendQueue", "options": [type, uri, name]}, t('Add to queue')) +
            (type === 'song' ? addMenuItem({"cmd": "appendAfterQueue", "options": [type, uri, nextsongpos, name]}, t('Add after current playing song')) : '') +
            addMenuItem({"cmd": "replaceQueue", "options": [type, uri, name]}, t('Replace queue')) +
            (type !== 'plist' && type !== 'smartpls' && settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": [uri, ""]}, t('Add to playlist')) : '') +
            (type === 'song' ? addMenuItem({"cmd": "songDetails", "options": [uri]}, t('Song details')) : '') +
            (type === 'plist' || type === 'smartpls' ? addMenuItem({"cmd": "playlistDetails", "options": [uri]}, t('View/Edit playlist')) : '') +
            (type === 'dir' && settings.featBookmarks && app.current.tab !== 'Covergrid' ? addMenuItem({"cmd": "showBookmarkSave", "options": [-1, name, uri, type]}, t('Add bookmark')) : '');
        if (app.current.tab === 'Filesystem') {
            menu += (type === 'dir' ? addMenuItem({"cmd": "updateDB", "options": [dirname(uri)]}, t('Update directory')) : '') +
                (type === 'dir' ? addMenuItem({"cmd": "rescanDB", "options": [dirname(uri)]}, t('Rescan directory')) : '');
        }
        if (app.current.app === 'Search') {
            //songs must be arragend in one album per folder
            let baseuri = dirname(uri);
            menu += '<div class="dropdown-divider"></div>' +
                '<a class="dropdown-item" id="advancedMenuLink" data-toggle="collapse" href="#advancedMenu"><span class="material-icons material-icons-small-left">keyboard_arrow_right</span>Album actions</a>' +
                '<div class="collapse" id="advancedMenu">' +
                    addMenuItem({"cmd": "appendPlayQueue", "options": [type, baseuri, name]}, t('Play')) +
                    addMenuItem({"cmd": "appendQueue", "options": [type, baseuri, name]}, t('Add to queue')) +
                    addMenuItem({"cmd": "appendAfterQueue", "options": [type, baseuri, nextsongpos, name]}, t('Add after current playing song')) +
                    addMenuItem({"cmd": "replaceQueue", "options": [type, baseuri, name]}, t('Replace queue')) +
                    (settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": [baseuri, ""]}, t('Add to playlist')) : '') +
                '</div>';
        }
    }
    else if (app.current.tab === 'Tidal') {
        menu += (type === 'song' ? addMenuItem({"cmd": "appendPlayQueue", "options": [type, uri, name]}, t('Play song')) : '') +
        (type === 'song' ? addMenuItem({"cmd": "appendQueue", "options": [type, uri, name]}, t('Add to queue')) : '') +
        (type === 'song' ? addMenuItem({"cmd": "appendAfterQueue", "options": [type, uri, nextsongpos, name]}, t('Add after current playing song')) : '') +
        (type === 'song' ? addMenuItem({"cmd": "replaceQueue", "options": [type, uri, name]}, t('Replace queue')) : '') +
        (type === 'song' && settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": [uri]}, t('Add to playlist')) : '') +
        (type === 'song' ? addMenuItem({"cmd": "songDetails", "options": [uri]}, t('Song details')) : '') +
        (type === 'album' ? addMenuItem({"cmd": "albumDetails", "options": [uri]}, t('Album details')) : '') +
        (type === 'artist' ? addMenuItem({"cmd": "artistDetails", "options": [uri]}, t('Artist info')) : '') +
        (type === 'song' ? addMenuItem({"cmd": "songRadio", "options": [uri]}, t('Go to song radio')) : '') +
        // credits
        (type === 'artist' ? addMenuItem({"cmd": "artistRadio", "options": [uri]}, t('Go to artist radio')) : '');
        // go to artist
    }
    else if (app.current.tab === 'Qobuz') {
        menu += (type !== 'song' ? addMenuItem({"cmd": "appendQueue", "options": [type, uri, name]}, t('Add to queue')) : '') +
        (type === 'song' ? addMenuItem({"cmd": "appendAfterQueue", "options": [type, uri, nextsongpos, name]}, t('Add after current playing song')) : '') +
        (type === 'song' ? addMenuItem({"cmd": "replaceQueue", "options": [type, uri, name]}, t('Replace queue')) : '') +
        (type === 'song' && settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": [uri]}, t('Add to playlist')) : '') +
        (type === 'song' ? addMenuItem({"cmd": "songDetails", "options": [uri]}, t('Song details')) : '') +
        (type === 'album' ? addMenuItem({"cmd": "albumDetails", "options": [uri]}, t('Album details')) : '') +
        (type === 'artist' ? addMenuItem({"cmd": "artistDetails", "options": [uri]}, t('Artist info')) : '');
        // mr
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Playlists' && app.current.view === 'All') {
        menu += addMenuItem({"cmd": "appendPlayQueue", "options": [type, uri, name]}, t('Play')) +
            addMenuItem({"cmd": "appendQueue", "options": [type, uri, name]}, t('Add to queue')) +
            addMenuItem({"cmd": "replaceQueue", "options": [type, uri, name]}, t('Replace queue')) +
            (settings.smartpls === true && type === 'smartpls' ? addMenuItem({"cmd": "playlistDetails", "options": [uri]}, t('View playlist')) : addMenuItem({"cmd": "playlistDetails", "options": [uri]}, t('Edit playlist')))+
            (settings.smartpls === true && type === 'smartpls' ? addMenuItem({"cmd": "showSmartPlaylist", "options": [uri]}, t('Edit smart playlist')) : '') +
            (settings.smartpls === true && type === 'smartpls' ? addMenuItem({"cmd": "updateSmartPlaylist", "options": [uri]}, t('Update smart playlist')) : '') +
            addMenuItem({"cmd": "showRenamePlaylist", "options": [uri]}, t('Rename playlist')) + 
            addMenuItem({"cmd": "showDelPlaylist", "options": [uri]}, t('Delete playlist'));
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Playlists' && app.current.view === 'Detail') {
        if (el.nodeName === 'A') {
        let x = document.getElementById('BrowsePlaylistsDetailList');
        menu += addMenuItem({"cmd": "appendPlayQueue", "options": [type, uri, name]}, t('Play')) +
            addMenuItem({"cmd": "appendQueue", "options": [type, uri, name]}, t('Add to queue')) +
            addMenuItem({"cmd": "replaceQueue", "options": [type, uri, name]}, t('Replace queue')) +
            (x.getAttribute('data-ro') === 'false' ? addMenuItem({"cmd": "removeFromPlaylist", "options": [x.getAttribute('data-uri'), 
                    el.parentNode.parentNode.getAttribute('data-songpos')]}, t('Remove')) : '') +
            (settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": [uri, ""]}, t('Add to playlist')) : '') +
            (uri.indexOf('http') === -1 ? addMenuItem({"cmd": "songDetails", "options": [uri]}, t('Song details')) : '');
        }
        else {
            // wip - plist details cap menu
            // console.log('cap2', app.current.search, type, uri, name);
            type = 'plist';
            name = uri;
            menu += addMenuItem({"cmd": "appendPlayQueue", "options": [type, uri, name]}, t('Play')) +
            addMenuItem({"cmd": "appendQueue", "options": [type, uri, name]}, t('Add to queue')) +
            addMenuItem({"cmd": "replaceQueue", "options": [type, uri, name]}, t('Replace queue'));
        
        }
    }
    else if ((app.current.app === 'Queue' && app.current.tab === 'Current') ||
             (app.current.app === 'Playback' && getTableId(el) === 'QueueCurrentList')) {
        menu += addMenuItem({"cmd": "delQueueSong", "options": ["single", el.parentNode.parentNode.getAttribute('data-trackid')]}, t('Remove')) +
            addMenuItem({"cmd": "delQueueSong", "options": ["range", 0, el.parentNode.parentNode.getAttribute('data-songpos')]}, t('Remove all upwards')) +
            addMenuItem({"cmd": "delQueueSong", "options": ["range", (parseInt(el.parentNode.parentNode.getAttribute('data-songpos'))-1), -1]}, t('Remove all downwards')) +
            (settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": [uri, ""]}, t('Add to playlist')) : '') +
            (uri.indexOf('http') === -1 ? addMenuItem({"cmd": "songDetails", "options": [uri]}, t('Song details')) : '');
    }
    else if (app.current.app === 'Queue' && app.current.tab === 'LastPlayed') {
        menu += addMenuItem({"cmd": "appendPlayQueue", "options": [type, uri, name]}, t('Play song')) +
            addMenuItem({"cmd": "appendQueue", "options": [type, uri, name]}, t('Add to queue')) +
            addMenuItem({"cmd": "replaceQueue", "options": [type, uri, name]}, t('Replace queue')) +
            (settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": [uri, ""]}, t('Add to playlist')) : '') +
            (uri.indexOf('http') === -1 ? addMenuItem({"cmd": "songDetails", "options": [uri]}, t('Song details')) : '');
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Covergrid' && el.nodeName === 'DIV') {
        let album = decodeURI(el.parentNode.getAttribute('data-album'));
        let albumArtist = decodeURI(el.parentNode.getAttribute('data-albumartist'));
        let expression = '((Album == \'' + album + '\') AND (AlbumArtist == \'' + albumArtist + '\'))';
        let id = el.parentNode.getElementsByClassName('card-body')[0].getAttribute('id');
        menu += (el.classList.contains('card-footer') ? addMenuItem({"cmd": "getCovergridTitleList", "options": [id]}, t('Show songs')) : '') +
            addMenuItem({"cmd": "addAllFromSearchPlist", "options": ["queue", expression, false, true]}, t('Play album')) +
            addMenuItem({"cmd": "addAllFromSearchPlist", "options": ["queue", expression, false]}, t('Add to queue')) +
            addMenuItem({"cmd": "addAllFromSearchPlist", "options": ["queue", expression, true]}, t('Replace queue')) +
            (settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": ["ALBUM", expression]}, t('Add to playlist')) : '');
    }/* 
    else if ((app.current.app === 'Browse' && app.current.tab === 'Covergrid' && el.nodeName === 'CAPTION') ||
             (app.current.app === 'Playback' &&  el.nodeName === 'CAPTION')) {
        console.log('cap2', app.current.search, type, uri, name);
        type = 'dir';
        name = uri;
        console.log('popover', type, name, uri);
        menu += addMenuItem({"cmd": "appendPlayQueue", "options": [type, uri, name]}, t('Play')) +
                addMenuItem({"cmd": "appendQueue", "options": [type, uri, name]}, t('Add to queue')) +
                addMenuItem({"cmd": "replaceQueue", "options": [type, uri, name]}, t('Replace queue')) +
                (settings.featPlaylists ? addMenuItem({"cmd": "showAddToPlaylist", "options": [uri, ""]}, t('Add to playlist')) : '');
    }
 */
    new Popover(el, { trigger: 'click', delay: 0, dismissible: true, template: '<div class="popover" role="tooltip">' +
        '<div class="arrow"></div>' +
        '<div class="popover-content">' + menu + '</div>' +
        '</div>', content: ' '});
    let popoverInit = el.Popover;
    el.setAttribute('data-init', 'true');
    el.addEventListener('shown.bs.popover', function(event) {
        event.target.setAttribute('data-popover', 'true');
        document.getElementsByClassName('popover-content')[0].addEventListener('click', function(eventClick) {
            eventClick.preventDefault();
            eventClick.stopPropagation();
            if (eventClick.target.nodeName === 'A') {
                let dh = eventClick.target.getAttribute('data-href');
                if (dh) {
                    let cmd = JSON.parse(b64DecodeUnicode(dh));
                    parseCmd(event, cmd);
                    hideMenu();
                }
            }
        }, false);
        document.getElementsByClassName('popover-content')[0].addEventListener('keydown', function(eventKey) {
            eventKey.preventDefault();
            eventKey.stopPropagation();
            if (eventKey.key === 'ArrowDown' || eventKey.key === 'ArrowUp') {
                let menuItemsHtml = this.getElementsByTagName('a');
                let menuItems = Array.prototype.slice.call(menuItemsHtml);
                let idx = menuItems.indexOf(document.activeElement);
                do {
                    idx = eventKey.key === 'ArrowUp' ? (idx > 1 ? idx - 1 : 0)
                                                 : eventKey.key === 'ArrowDown' ? ( idx < menuItems.length - 1 ? idx + 1 : idx)
                                                                            : idx;
                    if ( idx === 0 || idx === menuItems.length -1 ) {
                        break;
                    }
                } while ( !menuItems[idx].offsetHeight )
                menuItems[idx] && menuItems[idx].focus();
            }
            else if (eventKey.key === 'Enter') {
                eventKey.target.click();
            }
            else if (eventKey.key === 'Escape') {
                hideMenu();
            }
        }, false);
        let collapseLink = document.getElementById('advancedMenuLink');
        if (collapseLink) {
            collapseLink.addEventListener('click', function() {
                let icon = this.getElementsByTagName('span')[0];
                if (icon.innerText === 'keyboard_arrow_right') {
                    icon.innerText = 'keyboard_arrow_down';
                }
                else {
                    icon.innerText = 'keyboard_arrow_right';
                }
            }, false);
            new Collapse(collapseLink);
        }
        document.getElementsByClassName('popover-content')[0].firstChild.focus();
    }, false);
    popoverInit.show();
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function parseUpdateQueue(obj) {
    // Set playstate
    if (obj.result.state === 1) {
        for (let i = 0; i < domCache.btnsPlayLen; i++) {
            domCache.btnsPlay[i].innerText = 'play_arrow';
        }
        playstate = 'stop';
    }
    else if (obj.result.state === 2) {
        for (let i = 0; i < domCache.btnsPlayLen; i++) {
            domCache.btnsPlay[i].innerText = 'pause';
        }
        playstate = 'play';
    }
    else {
        for (let i = 0; i < domCache.btnsPlayLen; i++) {
            domCache.btnsPlay[i].innerText = 'play_arrow';
        }
	playstate = 'pause';
    }

    if (obj.result.queueLength === 0) {
        for (let i = 0; i < domCache.btnsPlayLen; i++) {
            domCache.btnsPlay[i].setAttribute('disabled', 'disabled');
        }
    }
    else {
        for (let i = 0; i < domCache.btnsPlayLen; i++) {
            domCache.btnsPlay[i].removeAttribute('disabled');
        }
    }

    mediaSessionSetState();
    mediaSessionSetPositionState(obj.result.totalTime, obj.result.elapsedTime);

    domCache.badgeQueueItems.innerText = obj.result.queueLength;

    if (obj.result.nextSongPos === -1 && settings.jukeboxMode === false) {
        domCache.btnNext.setAttribute('disabled', 'disabled');
    }
    else {
        domCache.btnNext.removeAttribute('disabled');
    }

    if (obj.result.songPos <= 0) {
        domCache.btnPrev.setAttribute('disabled', 'disabled');
    }
    else {
        domCache.btnPrev.removeAttribute('disabled');
    }
}

function getQueue() {
    if (app.current.search.length >= 2) {
        sendAPI("MPD_API_QUEUE_SEARCH", {"filter": app.current.filter, "offset": app.current.page, "searchstr": app.current.search, "cols": settings.colsQueueCurrent}, parseQueue);
    }
    else {
        sendAPI("MPD_API_QUEUE_LIST", {"offset": app.current.page, "cols": settings.colsQueueCurrent}, parseQueue);
    }
}

function parseQueue(obj) {
    if (obj.result.totalTime && obj.result.totalTime > 0 && obj.result.totalEntities <= settings.maxElementsPerPage ) {
        document.getElementById('cardFooterQueue').innerText = t('Num songs', obj.result.totalEntities) + ' – ' + beautifyDuration(obj.result.totalTime);
    }
    else if (obj.result.totalEntities > 0) {
        document.getElementById('cardFooterQueue').innerText = t('Num songs', obj.result.totalEntities);
    }
    else {
        document.getElementById('cardFooterQueue').innerText = '';
    }

    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById('QueueCurrentList');
    let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
    let activeRow = 0;
    table.setAttribute('data-version', obj.result.queueVersion);
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    for (let i = 0; i < nrItems; i++) {
        obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
        obj.result.data[i].Pos++;
        let row = document.createElement('tr');
        row.setAttribute('draggable', 'true');
        row.setAttribute('data-trackid', obj.result.data[i].id);
        row.setAttribute('id','queueTrackId' + obj.result.data[i].id);
        row.setAttribute('data-songpos', obj.result.data[i].Pos);
        row.setAttribute('data-duration', obj.result.data[i].Duration);
        row.setAttribute('data-uri', obj.result.data[i].uri);
        row.setAttribute('tabindex', 0);
        let tds = '';
        for (let c = 0; c < settings.colsQueueCurrent.length; c++) {
            tds += '<td data-col="' + settings.colsQueueCurrent[c] + '">' + e(obj.result.data[i][settings.colsQueueCurrent[c]]) + '</td>';
        }
        tds += '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a></td>';
        row.innerHTML = tds;
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    let trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i --) {
        tr[i].remove();
    }

    let colspan = settings['colsQueueCurrent'].length;
    colspan--;

    if (obj.result.method === 'MPD_API_QUEUE_SEARCH' && nrItems === 0) {
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                          '<td colspan="' + colspan + '">' + t('No results, please refine your search') + '</td></tr>';
    }
    else if (obj.result.method === 'MPD_API_QUEUE_ADD_TRACK' && nrItems === 0) {
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                          '<td colspan="' + colspan + '">' + t('Empty queue') + '</td></tr>';
    }

    if (navigate === true) {
        focusTable(activeRow);
    }

    setPagination(obj.result.totalEntities, obj.result.returnedEntities);
    document.getElementById('QueueCurrentList').classList.remove('opacity05');
}

function parseLastPlayed(obj) {
    document.getElementById('cardFooterQueue').innerText = t('Num songs', obj.result.totalEntities);
    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById('QueueLastPlayedList');
    let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
    let activeRow = 0;
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    for (let i = 0; i < nrItems; i++) {
        obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
        obj.result.data[i].LastPlayed = localeDate(obj.result.data[i].LastPlayed);
        let row = document.createElement('tr');
        row.setAttribute('data-uri', obj.result.data[i].uri);
        row.setAttribute('data-name', obj.result.data[i].Title);
        row.setAttribute('data-type', 'song');
        row.setAttribute('tabindex', 0);
        let tds = '';
        for (let c = 0; c < settings.colsQueueLastPlayed.length; c++) {
            tds += '<td data-col="' + settings.colsQueueLastPlayed[c] + '">' + e(obj.result.data[i][settings.colsQueueLastPlayed[c]]) + '</td>';
        }
        tds += '<td data-col="Action">';
        if (obj.result.data[i].uri !== '') {
            tds += '<a href="#" class="material-icons color-darkgrey">' + ligatureMore + '</a>';
        }
        tds += '</td>';
        row.innerHTML = tds;
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    let trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i --) {
        tr[i].remove();
    }

    let colspan = settings['colsQueueLastPlayed'].length;
    colspan--;

    if (nrItems === 0) {
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
            '<td colspan="' + colspan + '">' + t('Empty list') + '</td></tr>';
    }

    if (navigate === true) {
        focusTable(activeRow);
    }

    setPagination(obj.result.totalEntities, obj.result.returnedEntities);
    document.getElementById('QueueLastPlayedList').classList.remove('opacity05');
}

//eslint-disable-next-line no-unused-vars
function queueSelectedItem(append) {
    let item = document.activeElement;
    if (item) {
        if (item.parentNode.parentNode.id === 'QueueCurrentList') {
            return;
        }
        if (append === true) {
            appendQueue(item.getAttribute('data-type'), item.getAttribute('data-uri'), item.getAttribute('data-name'));
        }
        else {
            replaceQueue(item.getAttribute('data-type'), item.getAttribute('data-uri'), item.getAttribute('data-name'));
        }
    }
}

//eslint-disable-next-line no-unused-vars
function dequeueSelectedItem() {
    let item = document.activeElement;
    if (item) {
        if (item.parentNode.parentNode.id !== 'QueueCurrentList') {
            return;
        }
        delQueueSong('single', item.getAttribute('data-trackid'));
    }
}

function appendPlayQueue(type, uri, name) {
    switch(type) {
        case 'song':
            sendAPI("MPD_API_QUEUE_ADD_PLAY_TRACK", {"uri": uri});
            showNotification(t('%{name} added to queue', {"name": name}), '', '', 'success');
            break;
        case 'dir':
            sendAPI("MPD_API_QUEUE_ADD_PLAY_DIR", {"uri": uri});
            showNotification(t('%{name} added to queue', {"name": name}), '', '', 'success');
            break;
        case 'plist':
            sendAPI("MPD_API_QUEUE_ADD_PLAY_PLAYLIST", {"plist": uri});
            showNotification(t('%{name} added to queue', {"name": name}), '', '', 'success');
            break;
    }
}

function appendQueue(type, uri, name) {
    switch(type) {
        case 'song':
        case 'dir':
            sendAPI("MPD_API_QUEUE_ADD_TRACK", {"uri": uri});
            showNotification(t('%{name} added to queue', {"name": name}), '', '', 'success');
            break;
        case 'plist':
            sendAPI("MPD_API_QUEUE_ADD_PLAYLIST", {"plist": uri});
            showNotification(t('%{name} added to queue', {"name": name}), '', '', 'success');
            break;
    }
}

//eslint-disable-next-line no-unused-vars
function appendAfterQueue(type, uri, to, name) {
    switch(type) {
        case 'song':
            sendAPI("MPD_API_QUEUE_ADD_TRACK_AFTER", {"uri": uri, "to": to});
            to++;
            showNotification(t('%{name} added to queue position %{to}', {"name": name, "to": to}), '', '', 'success');
            break;
    }
}

function replaceQueue(type, uri, name) {
    switch(type) {
        case 'song':
        case 'dir':
            sendAPI("MPD_API_QUEUE_REPLACE_TRACK", {"uri": uri});
            showNotification(t('Queue replaced with %{name}', {"name": name}), '', '', 'success');
            break;
        case 'plist':
            sendAPI("MPD_API_QUEUE_REPLACE_PLAYLIST", {"plist": uri});
            showNotification(t('Queue replaced with %{name}', {"name": name}), '', '', 'success');
            break;
    }
}

//eslint-disable-next-line no-unused-vars
function addToQueue() {
    let formOK = true;
    let inputAddToQueueQuantityEl = document.getElementById('inputAddToQueueQuantity');
    if (!validateInt(inputAddToQueueQuantityEl)) {
        formOK = false;
    }

    if (formOK === true) {
        let selectAddToQueueMode = document.getElementById('selectAddToQueueMode');
        let selectAddToQueuePlaylist = document.getElementById('selectAddToQueuePlaylist');
        sendAPI("MPD_API_QUEUE_ADD_RANDOM", {
            "mode": selectAddToQueueMode.options[selectAddToQueueMode.selectedIndex].value,
            "playlist": selectAddToQueuePlaylist.options[selectAddToQueuePlaylist.selectedIndex].value,
            "quantity": document.getElementById('inputAddToQueueQuantity').value
        });
        modalAddToQueue.hide();
    }
}

//eslint-disable-next-line no-unused-vars
function saveQueue() {
    let plName = document.getElementById('saveQueueName').value;
    if (validatePlname(plName) === true) {
        sendAPI("MPD_API_QUEUE_SAVE", {"plist": plName});
        modalSaveQueue.hide();
    }
    else {
        document.getElementById('saveQueueName').classList.add('is-invalid');
    }
}

function delQueueSong(mode, start, end) {
    if (mode === 'range') {
        sendAPI("MPD_API_QUEUE_RM_RANGE", {"start": start, "end": end});
    }
    else if (mode === 'single') {
        sendAPI("MPD_API_QUEUE_RM_TRACK", {"track": start});
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function search(x) {
    if (settings.featAdvsearch) {
        let expression = '(';
        let crumbs = domCache.searchCrumb.children;
        for (let i = 0; i < crumbs.length; i++) {
            expression += '(' + decodeURI(crumbs[i].getAttribute('data-filter')) + ')';
            if (x !== '') expression += ' AND ';
        }
        if (x !== '') {
            let match = document.getElementById('searchMatch');
            expression += '(' + app.current.filter + ' ' + match.options[match.selectedIndex].value + ' \'' + x +'\'))';
        }
        else
            expression += ')';
        if (expression.length <= 2)
            expression = '';
        appGoto('Search', 'Database', undefined, '0/' + app.current.filter + '/' + app.current.sort + '/' + encodeURI(expression));
    }
    else
        appGoto('Search', 'Database', undefined, '0/' + app.current.filter + '/' + app.current.sort + '/' + x);
}

function parseSearch(obj) {
    //document.getElementById('panel-heading-search').innerText = gtPage('Num songs', obj.result.returnedEntities, obj.result.totalEntities);
    document.getElementById('cardFooterSearch').innerText = gtPage('Num songs', obj.result.returnedEntities, obj.result.totalEntities);

    let tab = app.current.tab === 'Database' ? '' : app.current.tab;
    if (obj.result.returnedEntities > 0 || obj.result.sumReturnedItems > 0) {
        document.getElementById('search' + tab + 'AddAllSongs').removeAttribute('disabled');
        document.getElementById('search' + tab + 'AddAllSongsBtn').removeAttribute('disabled');
    }
    else {
        document.getElementById('search' + tab + 'AddAllSongs').setAttribute('disabled', 'disabled');
        document.getElementById('search' + tab + 'AddAllSongsBtn').setAttribute('disabled', 'disabled');
    }

    if (tab === '' || tab === 'Qobuz') // database
        parseFilesystem(obj);
    else // tidal/qobuz
        parseTidal(obj);
}

function saveSearchAsSmartPlaylist() {
    parseSmartPlaylist({"jsonrpc":"2.0","id":0,"result":{"method":"MPD_API_SMARTPLS_GET",
        "playlist":"",
        "type":"search",
        "tag": app.current.filter,
        "searchstr": app.current.search}});
}

function addAllFromSearchPlist(plist, searchstr, replace) {
    if (searchstr === null) {
        searchstr = app.current.search;    
    }
    if (settings.featAdvsearch) {
        sendAPI("MPD_API_DATABASE_SEARCH_ADV", {"plist": plist, 
            "sort": "", 
            "sortdesc": false, 
            "expression": searchstr,
            "offset": 0, 
            "cols": settings.colsSearch, 
            "replace": replace});
    }
    else {
        sendAPI("MPD_API_DATABASE_SEARCH", {"plist": plist, 
            "filter": app.current.filter, 
            "searchstr": searchstr,
            "offset": 0, 
            "cols": settings.colsSearch, 
            "replace": replace});
    }
    

    // temp
    appGoto('Search', 'Qobuz', 'All');
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

//eslint-disable-next-line no-unused-vars
function saveConnection() {
    // console.log('saveconnection');
    let formOK = true;
    let mpdHostEl = document.getElementById('inputMpdHost');
    let mpdPortEl = document.getElementById('inputMpdPort');
    let mpdPassEl = document.getElementById('inputMpdPass');
    let musicDirectoryEl  = document.getElementById('selectMusicDirectory');
    let musicDirectory = musicDirectoryEl.options[musicDirectoryEl.selectedIndex].value;

    if (musicDirectory === 'custom') {
        let musicDirectoryValueEl  = document.getElementById('inputMusicDirectory');
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
        sendAPI("MYMPD_API_CONNECTION_SAVE", {"mpdHost": mpdHostEl.value, "mpdPort": mpdPortEl.value, "mpdPass": mpdPassEl.value, "musicDirectory": musicDirectory}, getSettings);
        modalConnection.hide();
    }
}

function getSettings(onerror) {
    if (settingsLock === false) {
        settingsLock = true;
        sendAPI("MYMPD_API_SETTINGS_GET", {}, getMpdSettings, onerror);
    }
}

function getMpdSettings(obj) {
    if (obj !== '' && obj.result) {
        settingsNew = obj.result;
        document.getElementById('splashScreenAlert').innerText = t('Fetch MPD settings');
        sendAPI("MPD_API_SETTINGS_GET", {}, joinSettings, true);
    }
    else {
        settingsParsed = 'error';
        if (appInited === false) {
            showAppInitAlert(obj === '' ? t('Can not parse settings') : t(obj.error.message));
        }
        return false;
    }
}

function joinSettings(obj) {
    if (obj !== '' && obj.result) {
        for (let key in obj.result) {
            settingsNew[key] = obj.result[key];
        }
    }
    else {
        settingsParsed = 'error';
        if (appInited === false) {
            showAppInitAlert(obj === '' ? t('Can not parse settings') : t(obj.error.message));
        }
        settingsNew.mpdConnected = false;
    }
    settings = Object.assign({}, settingsNew);
    settingsLock = false;
    parseSettings();
    toggleUI();
    btnWaiting(document.getElementById('btnApplySettings'), false);
}

function checkConsume() {
    let stateConsume = document.getElementById('btnConsume').classList.contains('active') ? true : false;
    let stateJukeboxMode = getBtnGroupValue('btnJukeboxModeGroup');
    if (stateJukeboxMode > 0 && stateConsume === false) {
        document.getElementById('warnConsume').classList.remove('hide');
    }
    else {
        document.getElementById('warnConsume').classList.add('hide');
    }
}

function parseSettings() {
    if (settings.locale === 'default') {
        locale = navigator.language || navigator.userLanguage;
    }
    else {
        locale = settings.locale;
    }

    let setTheme = settings.theme;
    if (settings.theme === 'theme-autodetect') {
        setTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-default';
    }

    Object.keys(themes).forEach(function(key) {
        if (key === setTheme) {
            domCache.body.classList.add(key);
        }
        else {
            domCache.body.classList.remove(key);
        }
    });

    document.getElementById('selectTheme').value = settings.theme;

    if (settings.mpdConnected === true) {
        parseMPDSettings();
    }

    if (settings.mpdHost.indexOf('/') !== 0) {
        document.getElementById('mpdInfo_host').innerText = settings.mpdHost + ':' + settings.mpdPort;
    }
    else {
        document.getElementById('mpdInfo_host').innerText = settings.mpdHost;
    }

    document.getElementById('inputMpdHost').value = settings.mpdHost;
    document.getElementById('inputMpdPort').value = settings.mpdPort;
    document.getElementById('inputMpdPass').value = settings.mpdPass;

    let btnNotifyWeb = document.getElementById('btnNotifyWeb');
    document.getElementById('warnNotifyWeb').classList.add('hide');
    if (notificationsSupported()) {
        if (Notification.permission !== 'granted') {
            if (settings.notificationWeb === true) {
                document.getElementById('warnNotifyWeb').classList.remove('hide');
            }
            settings.notificationWeb = false;
        }
        if (Notification.permission === 'denied') {
            document.getElementById('warnNotifyWeb').classList.remove('hide');
        }
        toggleBtnChk('btnNotifyWeb', settings.notificationWeb);
        btnNotifyWeb.removeAttribute('disabled');
    }
    else {
        btnNotifyWeb.setAttribute('disabled', 'disabled');
        toggleBtnChk('btnNotifyWeb', false);
    }

    toggleBtnChk('btnNotifyPage', settings.notificationPage);
    toggleBtnChk('btnMediaSession', settings.mediaSession);
    toggleBtnChkCollapse('btnFeatLocalplayer', 'collapseLocalplayer', settings.featLocalplayer);
    toggleBtnChk('btnLocalplayerAutoplay', settings.localplayerAutoplay);
    toggleBtnChk('btnFeatTimer', settings.featTimer);
    toggleBtnChk('btnBookmarks', settings.featBookmarks);
    if (settings.streamUrl === '') {
        document.getElementById('selectStreamMode').value = 'port';
        document.getElementById('inputStreamUrl').value = settings.streamPort;
    }
    else {
        document.getElementById('selectStreamMode').value = 'url';
        document.getElementById('inputStreamUrl').value = settings.streamUrl;
    }
    toggleBtnChkCollapse('btnCoverimage', 'collapseAlbumart', settings.coverimage);

    document.getElementById('inputBookletName').value = settings.bookletName;
    
    document.getElementById('selectLocale').value = settings.locale;
    document.getElementById('inputCoverimageName').value = settings.coverimageName;

    document.getElementById('inputCoverimageSize').value = settings.coverimageSize;
    document.getElementById('inputCovergridSize').value = settings.covergridSize;

    document.documentElement.style.setProperty('--mympd-coverimagesize', settings.coverimageSize + "px");
    document.documentElement.style.setProperty('--mympd-covergridsize', settings.covergridSize + "px");
    document.documentElement.style.setProperty('--mympd-highlightcolor', settings.highlightColor);
    
    document.getElementById('inputHighlightColor').value = settings.highlightColor;
    document.getElementById('inputBgColor').value = settings.bgColor;
    document.getElementsByTagName('body')[0].style.backgroundColor = settings.bgColor;
    
    document.getElementById('highlightColorPreview').style.backgroundColor = settings.highlightColor;
    document.getElementById('bgColorPreview').style.backgroundColor = settings.bgColor;

    toggleBtnChkCollapse('btnBgCover', 'collapseBackground', settings.bgCover);
    document.getElementById('inputBgCssFilter').value = settings.bgCssFilter;    

    let albumartbg = document.querySelectorAll('.albumartbg');
    for (let i = 0; i < albumartbg.length; i++) {
	albumartbg[i].style.filter = settings.bgCssFilter;
    }

    toggleBtnChkCollapse('btnLoveEnable', 'collapseLove', settings.love);
    document.getElementById('inputLoveChannel').value = settings.loveChannel;
    document.getElementById('inputLoveMessage').value = settings.loveMessage;

    document.getElementById('inputMaxElementsPerPage').value = settings.maxElementsPerPage;
    toggleBtnChk('btnStickers', settings.stickers);
    document.getElementById('inputLastPlayedCount').value = settings.lastPlayedCount;
    
    toggleBtnChkCollapse('btnSmartpls', 'collapseSmartpls', settings.smartpls);
    
    let features = ["featLocalplayer", "featSyscmds", "featMixramp", "featCacert", "featBookmarks", "featRegex", "featTimer"];
    for (let j = 0; j < features.length; j++) {
        let Els = document.getElementsByClassName(features[j]);
        let ElsLen = Els.length;
        let displayEl = settings[features[j]] === true ? '' : 'none';
        for (let i = 0; i < ElsLen; i++) {
            Els[i].style.display = displayEl;
        }
    }

    let readonlyEls = document.getElementsByClassName('warnReadonly');
    for (let i = 0; i < readonlyEls.length; i++) {
        if (settings.readonly === false) {
            readonlyEls[i].classList.add('hide');
        }
        else {
            readonlyEls[i].classList.remove('hide');
        }
    }
    if (settings.readonly === true) {
        document.getElementById('btnBookmarks').setAttribute('disabled', 'disabled');
        document.getElementsByClassName('groupClearCovercache')[0].classList.add('hide');
    }
    else {
        document.getElementById('btnBookmarks').removeAttribute('disabled');
        document.getElementsByClassName('groupClearCovercache')[0].classList.remove('hide');
    }

    let timerActions = '<option value="startplay">' + t('Start playback') + '</option>' +
        '<option value="stopplay">' + t('Stop playback') + '</option>';

    if (settings.featSyscmds) {
        let syscmdsMaxListLen = 4;
        let syscmdsList = '';
        let syscmdsListLen = settings.syscmdList.length;
        if (syscmdsListLen > 0) {
            timerActions += '<optgroup label="' + t('System command') + '">';
            syscmdsList = syscmdsListLen > syscmdsMaxListLen ? '' : '<div class="dropdown-divider"></div>';
            for (let i = 0; i < syscmdsListLen; i++) {
                if (settings.syscmdList[i] === 'HR') {
                    syscmdsList += '<div class="dropdown-divider"></div>';
                }
                else {
                    syscmdsList += '<a class="dropdown-item text-light alwaysEnabled" href="#" data-href=\'{"cmd": "execSyscmd", "options": ["' +
                        e(settings.syscmdList[i]) + '"]}\'>' + e(settings.syscmdList[i]) + '</a>';
                    timerActions += '<option value="' + e(settings.syscmdList[i]) + '">' + e(settings.syscmdList[i]) + '</option>';
                }
            }
        }
        document.getElementById('syscmds').innerHTML = syscmdsList;
        timerActions += '</optgroup>';
        
        if (syscmdsListLen > syscmdsMaxListLen) {
            document.getElementById('navSyscmds').classList.remove('hide');
            document.getElementById('syscmds').classList.add('collapse', 'menu-indent');
        }
        else {
            document.getElementById('navSyscmds').classList.add('hide');
            document.getElementById('syscmds').classList.remove('collapse', 'menu-indent');
        }
    }
    else {
        document.getElementById('syscmds').innerHTML = '';
    }
    
    document.getElementById('selectTimerAction').innerHTML = timerActions;
    

    dropdownMainMenu = new Dropdown(document.getElementById('mainMenu'));
    
    toggleBtnGroupValueCollapse(document.getElementById('btnJukeboxModeGroup'), 'collapseJukeboxMode', settings.jukeboxMode);
    document.getElementById('selectJukeboxUniqueTag').value = settings.jukeboxUniqueTag;
    document.getElementById('inputJukeboxQueueLength').value = settings.jukeboxQueueLength;
    document.getElementById('inputJukeboxLastPlayed').value = settings.jukeboxLastPlayed;

    if (settings.jukeboxMode === 0) {
        document.getElementById('inputJukeboxQueueLength').setAttribute('disabled', 'disabled');
        document.getElementById('selectJukeboxPlaylist').setAttribute('disabled', 'disabled');
    }
    else if (settings.jukeboxMode === 2) {
        document.getElementById('inputJukeboxQueueLength').setAttribute('disabled', 'disabled');
        document.getElementById('selectJukeboxPlaylist').setAttribute('disabled', 'disabled');
        document.getElementById('selectJukeboxPlaylist').value = 'Database';
    }
    else if (settings.jukeboxMode === 1) {
        document.getElementById('inputJukeboxQueueLength').removeAttribute('disabled');
        document.getElementById('selectJukeboxPlaylist').removeAttribute('disabled');
    }

    document.getElementById('inputSmartplsPrefix').value = settings.smartplsPrefix;
    document.getElementById('inputSmartplsInterval').value = settings.smartplsInterval / 60 / 60;
    document.getElementById('selectSmartplsSort').value = settings.smartplsSort;

    if (settings.featLocalplayer === true) {
        if (settings.streamUrl === '') {
            settings.mpdstream = 'http://';
            if (settings.mpdHost.match(/^127\./) !== null || settings.mpdHost === 'localhost' || settings.mpdHost.match(/^\//) !== null) {
                settings.mpdstream += window.location.hostname;
            }
            else {
                settings.mpdstream += settings.mpdHost;
            }
            settings.mpdstream += ':' + settings.streamPort + '/';
        }
        else {
            settings.mpdstream = settings.streamUrl;
        }
        let localPlayer = document.getElementById('localPlayer');
        if (localPlayer.src !== settings.mpdstream) {
            localPlayer.pause();
            document.getElementById('alertLocalPlayback').classList.remove('hide');
            localPlayer.src = settings.mpdstream;
            localPlayer.load();
        }
    }

    if (settings.musicDirectory === 'auto') {
        document.getElementById('selectMusicDirectory').value = settings.musicDirectory;
        document.getElementById('inputMusicDirectory').value = settings.musicDirectoryValue !== undefined ? settings.musicDirectoryValue : '';
        document.getElementById('inputMusicDirectory').setAttribute('readonly', 'readonly');
    }
    else if (settings.musicDirectory === 'none') {
        document.getElementById('selectMusicDirectory').value = settings.musicDirectory;
        document.getElementById('inputMusicDirectory').value = '';
        document.getElementById('inputMusicDirectory').setAttribute('readonly', 'readonly');
    }
    else {
        document.getElementById('selectMusicDirectory').value = 'custom';
        document.getElementById('inputMusicDirectory').value = settings.musicDirectoryValue;
        document.getElementById('inputMusicDirectory').removeAttribute('readonly');
    }

    document.getElementById('inputTidalUser').value = settings.tidalUsername;
    document.getElementById('inputTidalPass').value = settings.tidalPassword;
    document.getElementById('selectTidalQual').value = settings.tidalAudioquality;
    // document.getElementById('inputQobuzUser').value = settings.qobuzUsername;
    // document.getElementById('inputQobuzPass').value = settings.qobuzPassword;
    // document.getElementById('selectQobuzQual').value = settings.qobuzFormatId;

    if (app.current.app === 'Queue' && app.current.tab === 'Current') {
        getQueue();
    }
    else if (app.current.app === 'Queue' && app.current.tab === 'LastPlayed') {
        appRoute();
    }
    else if (app.current.app === 'Search') {
        appRoute();
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Filesystem') {
        appRoute();
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Playlists' && app.current.view === 'Detail') {
        appRoute();
    }
    else if (app.current.app === 'Browse' && app.current.tab === 'Database' && app.current.search !== '') {
        appRoute();
    }
    else if (app.current.app === 'Playback') {
        getBrowseCovergrid();
    }

    i18nHtml(document.getElementsByTagName('body')[0]);

    checkConsume();

    if (settings.mediaSession === true && 'mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', clickPlay);
        navigator.mediaSession.setActionHandler('pause', clickPlay);
        navigator.mediaSession.setActionHandler('stop', clickStop);
        navigator.mediaSession.setActionHandler('seekbackward', seekRelativeBackward);
        navigator.mediaSession.setActionHandler('seekforward', seekRelativeForward);
        navigator.mediaSession.setActionHandler('previoustrack', clickPrev);
        navigator.mediaSession.setActionHandler('nexttrack', clickNext);
        
        if (!navigator.mediaSession.setPositionState) {
            logDebug('mediaSession.setPositionState not supported by browser');
        }
    }
    else {
        logDebug('mediaSession not supported by browser');
    }

    settingsParsed = 'true';
}

function parseMPDSettings() {
    toggleBtnChk('btnRandom', settings.random);
    toggleBtnChk('btnConsume', settings.consume);
    toggleBtnChk('btnRepeat', settings.repeat);
    toggleBtnChk('btnAutoPlay', settings.autoPlay);

    toggleBtnGroupValue(document.getElementById('btnSingleGroup'), settings.single);
    toggleBtnGroupValue(document.getElementById('btnReplaygainGroup'), settings.replaygain);
    
    document.getElementById('inputCrossfade').value = settings.crossfade;
    document.getElementById('inputMixrampdb').value = settings.mixrampdb;
    document.getElementById('inputMixrampdelay').value = settings.mixrampdelay;
    
    if (settings.coverimage === false || settings.featTags === false || 
        settings.tags.includes('AlbumArtist') === false || settings.tags.includes('Album') === false
        || settings.tags.includes('Track') === false || settings.featAdvsearch === false)
    {
        settings.featCovergrid = false;
    }
    else {
        settings.featCovergrid = true;
    }

    let features = ['featStickers', 'featSmartpls', 'featPlaylists', 'featTags', 'featCoverimage', 'featAdvsearch',
        'featLove', 'featSingleOneshot', 'featCovergrid'];
    for (let j = 0; j < features.length; j++) {
        let Els = document.getElementsByClassName(features[j]);
        let ElsLen = Els.length;
        let displayEl = settings[features[j]] === true ? '' : 'none';
        if (features[j] === 'featCoverimage' && settings.coverimage === false) {
            displayEl = 'none';
        }
        for (let i = 0; i < ElsLen; i++) {
            Els[i].style.display = displayEl;
        }
    }

    if (settings.featPlaylists === false && settings.smartpls === true) {
        document.getElementById('warnSmartpls').classList.remove('hide');
    }
    else {
        document.getElementById('warnSmartpls').classList.add('hide');
    }

    if (settings.featPlaylists === true && settings.readonly === false) {
        document.getElementById('btnSmartpls').removeAttribute('disabled');
    }
    else {
        document.getElementById('btnSmartpls').setAttribute('disabled', 'disabled');
    }

    if (settings.featStickers === false && settings.stickers === true) {
        document.getElementById('warnStickers').classList.remove('hide');
    }
    else {
        document.getElementById('warnStickers').classList.add('hide');
    }
    
    if (settings.featStickers === false || settings.stickers === false || settings.featStickerCache === false) {
        document.getElementById('warnPlaybackStatistics').classList.remove('hide');
        document.getElementById('inputJukeboxLastPlayed').setAttribute('disabled', 'disabled');
    }
    else {
        document.getElementById('warnPlaybackStatistics').classList.add('hide');
        document.getElementById('inputJukeboxLastPlayed').removeAttribute('disabled');
    }

    if (settings.featLove === false && settings.love === true) {
        document.getElementById('warnScrobbler').classList.remove('hide');
    }
    else {
        document.getElementById('warnScrobbler').classList.add('hide');
    }

    if (settings.featLibrary === false && settings.coverimage === true) {
        document.getElementById('warnAlbumart').classList.remove('hide');
    }
    else {
        document.getElementById('warnAlbumart').classList.add('hide');
    }
    if (settings.musicDirectoryValue === '' && settings.musicDirectory !== 'none') {
        document.getElementById('warnMusicDirectory').classList.remove('hide');
    }
    else {
        document.getElementById('warnMusicDirectory').classList.add('hide');
    }

    if (settings.bgCover === true && settings.featCoverimage === true && settings.coverimage === true) {
        setBackgroundImage(lastSongObj.uri);
    }
    else {
        clearBackgroundImage();
    }

    if (settings.featTags === false) {
        app.apps.Browse.active = 'Filesystem';
        app.apps.Search.Database.state = '0/filename/-/';
        app.apps.Queue.state = '0/filename/-/';
        settings.colsQueueCurrent = ["Pos", "Title", "Duration"];
        settings.colsQueueLastPlayed = ["Pos", "Title", "LastPlayed"];
        settings.colsSearchDatabase = ["Title", "Duration"];
        settings.colsSearchTidal = ["Title", "Duration"];
        // settings.colsSearchQobuz = ["Title", "Duration"];
        settings.colsBrowseFilesystem = ["Type", "Title", "Duration"];
        settings.colsBrowseDatabase = ["Track", "Title", "Duration"];
        settings.colsPlayback = [];
    }
    else {
        let pbtl = '';
        for (let i = 0; i < settings.colsPlayback.length; i++) {
            pbtl += '<div id="current' + settings.colsPlayback[i]  + '" data-tag="' + settings.colsPlayback[i] + '" '+
                    'data-name="' + (lastSongObj[settings.colsPlayback[i]] ? encodeURI(lastSongObj[settings.colsPlayback[i]]) : '') + '">' +
                    '<small>' + t(settings.colsPlayback[i]) + ': </small>' +
                    // '<p';
                    '<span';
            if (settings.browsetags.includes(settings.colsPlayback[i])) {
                pbtl += ' class="clickable"';
            }
            pbtl += '>';
            if (settings.colsPlayback[i] === 'Duration') {
                pbtl += (lastSongObj[settings.colsPlayback[i]] ? beautifySongDuration(lastSongObj[settings.colsPlayback[i]]) : '');
            }
            else if (settings.colsPlayback[i] === 'LastModified') {
                pbtl += (lastSongObj[settings.colsPlayback[i]] ? localeDate(lastSongObj[settings.colsPlayback[i]]) : '');
            }
            else if (settings.colsPlayback[i] === 'Fileformat') {
                pbtl += (lastState ? fileformat(lastState.audioFormat) : '');
            }
            else {
                pbtl += (lastSongObj[settings.colsPlayback[i]] ? e(lastSongObj[settings.colsPlayback[i]]) : '');
            }
            // pbtl += '</p></div>';
            pbtl += '</span></div>';
        }
        document.getElementById('cardPlaybackTags').innerHTML = pbtl;
    }

    if (!settings.tags.includes('AlbumArtist') && settings.featTags) {
        if (settings.tags.includes('Artist')) {
            app.apps.Browse.tabs.Database.active = 'Artist';
        }
        else {
            app.apps.Browse.tabs.Database.active = settings.tags[0];
        }
    }
    if (settings.tags.includes('Title')) {
        app.apps.Search.tabs.Database.state = '0/any/Title/';
        app.apps.Search.tabs.Tidal.views.All.state = '0/any/Title/';
        // app.apps.Search.tabs.Qobuz.views.All.state = '0/any/Title/';
    }

    if (settings.featPlaylists) {
        playlistEl = 'selectJukeboxPlaylist';
        sendAPI("MPD_API_PLAYLIST_LIST", {"offset": 0, "filter": "-"}, getAllPlaylists);
    }
    else {
        document.getElementById('selectJukeboxPlaylist').innerHTML = '<option value="Database">' + t('Database') + '</option>';
    }

    settings.tags.sort();
    settings.searchtags.sort();
    settings.searchtidaltags.sort();
    // settings.searchqobuztags.sort();
    settings.browsetags.sort();

    filterCols('colsSearchDatabase');
    filterCols('colsSearchTidal');
    // filterCols('colsSearchQobuz');
    filterCols('colsQueueCurrent');
    filterCols('colsQueueLastPlayed');
    filterCols('colsBrowsePlaylistsDetail');
    filterCols('colsBrowseFilesystem');
    filterCols('colsBrowseDatabase');
    filterCols('colsPlayback');

    setCols('QueueCurrent');
    setCols('SearchDatabase');
    setCols('SearchTidal');
    // setCols('SearchQobuz');
    setCols('QueueLastPlayed');
    setCols('BrowseFilesystem');
    setCols('BrowsePlaylistsDetail');
    setCols('BrowseDatabase', '.tblAlbumTitles');
    setCols('Playback');

    addTagList('BrowseDatabaseByTagDropdown', 'browsetags');
    addTagList('searchqueuetags', 'searchtags');
    addTagList('searchtags', 'searchtags');
    addTagList('searchtidaltags', 'searchtidaltags');
    // addTagList('searchqobuztags', 'searchqobuztags');
    addTagList('searchCovergridTags', 'browsetags');
    addTagList('covergridSortTagsList', 'browsetags');
    addTagList('dropdownSortPlaylistTags', 'tags');
    addTagList('saveSmartPlaylistSort', 'tags');
    
    addTagListSelect('selectSmartplsSort', 'tags');
    addTagListSelect('saveSmartPlaylistSort', 'tags');
    addTagListSelect('selectJukeboxUniqueTag', 'browsetags');
    
    for (let i = 0; i < settings.tags.length; i++) {
        app.apps.Browse.tabs.Database.views[settings.tags[i]] = { "state": "0/-/-/", "scrollPos": 0 };
    }

    initTagMultiSelect('inputEnabledTags', 'listEnabledTags', settings.allmpdtags, settings.tags);
    initTagMultiSelect('inputSearchTags', 'listSearchTags', settings.tags, settings.searchtags);
    //initTagMultiSelect('inputSearchTidalTags', 'listSearchTidalTags', settings.tags, settings.searchtidaltags);
    //initTagMultiSelect('inputSearchQobuzTags', 'listSearchQobuzTags', settings.tags, settings.searchqobuztags);
    initTagMultiSelect('inputBrowseTags', 'listBrowseTags', settings.tags, settings.browsetags);
    initTagMultiSelect('inputGeneratePlsTags', 'listGeneratePlsTags', settings.browsetags, settings.generatePlsTags);
}

//eslint-disable-next-line no-unused-vars
function resetSettings() {
    sendAPI("MYMPD_API_SETTINGS_RESET", {}, getSettings);
}

//eslint-disable-next-line no-unused-vars
function saveSettings(closeModal) {
    let formOK = true;

    let inputCrossfade = document.getElementById('inputCrossfade');
    if (!inputCrossfade.getAttribute('disabled')) {
        if (!validateInt(inputCrossfade)) {
            formOK = false;
        }
    }

    let inputJukeboxQueueLength = document.getElementById('inputJukeboxQueueLength');
    if (!validateInt(inputJukeboxQueueLength)) {
        formOK = false;
    }

    let inputJukeboxLastPlayed = document.getElementById('inputJukeboxLastPlayed');
    if (!validateInt(inputJukeboxLastPlayed)) {
        formOK = false;
    }

    let selectStreamModeEl = document.getElementById('selectStreamMode');
    let streamUrl = '';
    let streamPort = '';
    let inputStreamUrl = document.getElementById('inputStreamUrl');
    if (selectStreamModeEl.options[selectStreamModeEl.selectedIndex].value === 'port') {
        streamPort = inputStreamUrl.value;
        if (!validateInt(inputStreamUrl)) {
            formOK = false;
        }
    }
    else {
        streamUrl = inputStreamUrl.value;
        if (!validateStream(inputStreamUrl)) {
            formOK = false;
        }
    }

    let inputCovergridSize = document.getElementById('inputCovergridSize');
    if (!validateInt(inputCovergridSize)) {
        formOK = false;
    }

    let inputCoverimageSize = document.getElementById('inputCoverimageSize');
    if (!validateInt(inputCoverimageSize)) {
        formOK = false;
    }

    let inputCoverimageName = document.getElementById('inputCoverimageName');
    if (!validateFilenameList(inputCoverimageName)) {
        formOK = false;
    }
    
    let inputBookletName = document.getElementById('inputBookletName');
    if (!validateFilename(inputBookletName)) {
        formOK = false;
    }
    
    let inputMaxElementsPerPage = document.getElementById('inputMaxElementsPerPage');
    if (!validateInt(inputMaxElementsPerPage)) {
        formOK = false;
    }
    if (parseInt(inputMaxElementsPerPage.value) > 200) {
        formOK = false;
    }

    let inputLastPlayedCount = document.getElementById('inputLastPlayedCount');
    if (!validateInt(inputLastPlayedCount)) {
        formOK = false;
    }

    if (document.getElementById('btnLoveEnable').classList.contains('active')) {
        let inputLoveChannel = document.getElementById('inputLoveChannel');
        let inputLoveMessage = document.getElementById('inputLoveMessage');
        if (!validateNotBlank(inputLoveChannel) || !validateNotBlank(inputLoveMessage)) {
            formOK = false;
        }
    }

    if (settings.featMixramp === true) {
        let inputMixrampdb = document.getElementById('inputMixrampdb');
        if (!inputMixrampdb.getAttribute('disabled')) {
            if (!validateFloat(inputMixrampdb)) {
                formOK = false;
            }
        }
        let inputMixrampdelay = document.getElementById('inputMixrampdelay');
        if (!inputMixrampdelay.getAttribute('disabled')) {
            if (inputMixrampdelay.value === 'nan') {
                inputMixrampdelay.value = '-1';
            }
            if (!validateFloat(inputMixrampdelay)) {
                formOK = false;
            }
        }
    }
    
    let inputSmartplsInterval = document.getElementById('inputSmartplsInterval');
    if (!validateInt(inputSmartplsInterval)) {
        formOK = false;
    }
    let smartplsInterval = document.getElementById('inputSmartplsInterval').value * 60 * 60;

    let singleState = getBtnGroupValue('btnSingleGroup');
    let jukeboxMode = getBtnGroupValue('btnJukeboxModeGroup');
    let replaygain = getBtnGroupValue('btnReplaygainGroup');
    let jukeboxUniqueTag = document.getElementById('selectJukeboxUniqueTag');
    let jukeboxUniqueTagValue = jukeboxUniqueTag.options[jukeboxUniqueTag.selectedIndex].value;

    if (jukeboxMode === '2') {
        jukeboxUniqueTagValue = 'Album';
    }

    if (formOK === true) {
        let selectJukeboxPlaylist = document.getElementById('selectJukeboxPlaylist');
        let selectLocale = document.getElementById('selectLocale');
        let selectTidalQual = document.getElementById('selectTidalQual');
        // let selectQobuzQual = document.getElementById('selectQobuzQual');
        let selectTheme = document.getElementById('selectTheme');
        sendAPI("MYMPD_API_SETTINGS_SET", {
            "consume": (document.getElementById('btnConsume').classList.contains('active') ? 1 : 0),
            "random": (document.getElementById('btnRandom').classList.contains('active') ? 1 : 0),
            "single": parseInt(singleState),
            "repeat": (document.getElementById('btnRepeat').classList.contains('active') ? 1 : 0),
            "replaygain": replaygain,
            "crossfade": document.getElementById('inputCrossfade').value,
            "mixrampdb": (settings.featMixramp === true ? document.getElementById('inputMixrampdb').value : settings.mixrampdb),
            "mixrampdelay": (settings.featMixramp === true ? document.getElementById('inputMixrampdelay').value : settings.mixrampdelay),
            "notificationWeb": (document.getElementById('btnNotifyWeb').classList.contains('active') ? true : false),
            "notificationPage": (document.getElementById('btnNotifyPage').classList.contains('active') ? true : false),
            "mediaSession": (document.getElementById('btnMediaSession').classList.contains('active') ? true : false),
            "jukeboxMode": parseInt(jukeboxMode),
            "jukeboxPlaylist": selectJukeboxPlaylist.options[selectJukeboxPlaylist.selectedIndex].value,
            "jukeboxQueueLength": parseInt(document.getElementById('inputJukeboxQueueLength').value),
            "jukeboxLastPlayed": parseInt(document.getElementById('inputJukeboxLastPlayed').value),
            "jukeboxUniqueTag": jukeboxUniqueTagValue,
            "autoPlay": (document.getElementById('btnAutoPlay').classList.contains('active') ? true : false),
            "bgCover": (document.getElementById('btnBgCover').classList.contains('active') ? true : false),
            "bgColor": document.getElementById('inputBgColor').value,
            "bgCssFilter": document.getElementById('inputBgCssFilter').value,
            "featLocalplayer": (document.getElementById('btnFeatLocalplayer').classList.contains('active') ? true : false),
            "localplayerAutoplay": (document.getElementById('btnLocalplayerAutoplay').classList.contains('active') ? true : false),
            "streamUrl": streamUrl,
            "streamPort": parseInt(streamPort),
            "coverimage": (document.getElementById('btnCoverimage').classList.contains('active') ? true : false),
            "coverimageName": document.getElementById('inputCoverimageName').value,
            "coverimageSize": document.getElementById('inputCoverimageSize').value,
            "covergridSize": document.getElementById('inputCovergridSize').value,
            "locale": selectLocale.options[selectLocale.selectedIndex].value,
            "love": (document.getElementById('btnLoveEnable').classList.contains('active') ? true : false),
            "loveChannel": document.getElementById('inputLoveChannel').value,
            "loveMessage": document.getElementById('inputLoveMessage').value,
            "bookmarks": (document.getElementById('btnBookmarks').classList.contains('active') ? true : false),
            "maxElementsPerPage": document.getElementById('inputMaxElementsPerPage').value,
            "stickers": (document.getElementById('btnStickers').classList.contains('active') ? true : false),
            "lastPlayedCount": document.getElementById('inputLastPlayedCount').value,
            "smartpls": (document.getElementById('btnSmartpls').classList.contains('active') ? true : false),
            "smartplsPrefix": document.getElementById('inputSmartplsPrefix').value,
            "smartplsInterval": smartplsInterval,
            "smartplsSort": document.getElementById('selectSmartplsSort').value,
            "taglist": getTagMultiSelectValues(document.getElementById('listEnabledTags'), false),
            "searchtaglist": getTagMultiSelectValues(document.getElementById('listSearchTags'), false),
            "browsetaglist": getTagMultiSelectValues(document.getElementById('listBrowseTags'), false),
            "generatePlsTags": getTagMultiSelectValues(document.getElementById('listGeneratePlsTags'), false),
            "theme": selectTheme.options[selectTheme.selectedIndex].value,
            "highlightColor": document.getElementById('inputHighlightColor').value,
            "timer": (document.getElementById('btnFeatTimer').classList.contains('active') ? true : false),
            "bookletName": document.getElementById('inputBookletName').value
        }, getSettings);
        if (closeModal === true) {
            modalSettings.hide();
        }
        else {
            btnWaiting(document.getElementById('btnApplySettings'), true);
        }
    }
}

function getTagMultiSelectValues(taglist, translated) {
    let values = [];
    let chkBoxes = taglist.getElementsByTagName('button');
    for (let i = 0; i < chkBoxes.length; i++) {
        if (chkBoxes[i].classList.contains('active')) {
            if (translated === true) {
                values.push(t(chkBoxes[i].name));
            }
            else {
                values.push(chkBoxes[i].name);
            }
        }
    }
    if (translated === true) {
        return values.join(', ');
    }
    return values.join(',');
}

function initTagMultiSelect(inputId, listId, allTags, enabledTags) {
    let values = [];
    let list = '';
    for (let i = 0; i < allTags.length; i++) {
        if (enabledTags.includes(allTags[i])) {
            values.push(t(allTags[i]));
        }
        list += '<div class="form-check">' +
            '<button class="btn btn-secondary btn-xs clickable material-icons material-icons-small' +
            (enabledTags.includes(allTags[i]) ? ' active' : '') + '" name="' + allTags[i] + '">' +
            (enabledTags.includes(allTags[i]) ? 'check' : 'radio_button_unchecked') + '</button>' +
            '<label class="form-check-label" for="' + allTags[i] + '">&nbsp;&nbsp;' + t(allTags[i]) + '</label>' +
            '</div>';
    }
    document.getElementById(listId).innerHTML = list;

    let inputEl = document.getElementById(inputId);
    inputEl.value = values.join(', ');
    if (inputEl.getAttribute('data-init') === 'true') {
        return;
    }
    inputEl.setAttribute('data-init', 'true');
    document.getElementById(listId).addEventListener('click', function(event) {
        event.stopPropagation();
        event.preventDefault();
        if (event.target.nodeName === 'BUTTON') {
            toggleBtnChk(event.target);
            event.target.parentNode.parentNode.parentNode.previousElementSibling.value = getTagMultiSelectValues(event.target.parentNode.parentNode, true);
        }
    });
}

function filterCols(x) {
    let tags = settings.tags.slice();
    if (settings.featTags === false) {
        tags.push('Title');
    }
    tags.push('Duration');
    if (x === 'colsQueueCurrent' || x === 'colsBrowsePlaylistsDetail' || x === 'colsQueueLastPlayed') {
        tags.push('Pos');
    }
    else if (x === 'colsBrowseFilesystem' || x === 'colsSearchTidal' || x === 'colsSearchQobuz') {
        tags.push('Type');
    }
    if (x === 'colsQueueLastPlayed') {
        tags.push('LastPlayed');
    }
    if (x === 'colsPlayback') {
        tags.push('Filetype');
        tags.push('Fileformat');
        tags.push('LastModified');
    }
    let cols = [];
    for (let i = 0; i < settings[x].length; i++) {
        if (tags.includes(settings[x][i])) {
            cols.push(settings[x][i]);
        }
    }
    settings[x] = cols;
}

//eslint-disable-next-line no-unused-vars
function toggleBtnNotifyWeb() {
    let btnNotifyWeb = document.getElementById('btnNotifyWeb');
    let notifyWebState = btnNotifyWeb.classList.contains('active') ? true : false;
    if (notificationsSupported()) {
        if (notifyWebState === false) {
            Notification.requestPermission(function (permission) {
                if (!('permission' in Notification)) {
                    Notification.permission = permission;
                }
                if (permission === 'granted') {
                    toggleBtnChk('btnNotifyWeb', true);
                    settings.notificationWeb = true;
                    document.getElementById('warnNotifyWeb').classList.add('hide');
                } 
                else {
                    toggleBtnChk('btnNotifyWeb', false);
                    settings.notificationWeb = false;
                    document.getElementById('warnNotifyWeb').classList.remove('hide');
                }
            });
        }
        else {
            toggleBtnChk('btnNotifyWeb', false);
            settings.notificationWeb = false;
            document.getElementById('warnNotifyWeb').classList.add('hide');
        }
    }
    else {
        toggleBtnChk('btnNotifyWeb', false);
        settings.notificationWeb = false;
    }
}

//eslint-disable-next-line no-unused-vars
function setPlaySettings(el) {
    if (el.parentNode.classList.contains('btn-group')) {
        toggleBtnGroup(el);
    }
    else {
        toggleBtnChk(el);
    }
    if (el.parentNode.id === 'playDropdownBtnJukeboxModeGroup') {
        if (el.parentNode.getElementsByClassName('active')[0].getAttribute('data-value') !== '0') {
            toggleBtnChk('playDropdownBtnConsume', true);
        }
    }
    else if (el.id === 'playDropdownBtnConsume') {
        if (el.classList.contains('active') === false) {
            toggleBtnGroupValue(document.getElementById('playDropdownBtnJukeboxModeGroup'), 0);
        }
    }

    savePlaySettings();
}

function showPlayDropdown() {
    toggleBtnChk(document.getElementById('playDropdownBtnRandom'), settings.random);
    toggleBtnChk(document.getElementById('playDropdownBtnConsume'), settings.consume);
    toggleBtnChk(document.getElementById('playDropdownBtnRepeat'), settings.repeat);
    toggleBtnChk(document.getElementById('playDropdownBtnRandom'), settings.random);
    toggleBtnGroupValue(document.getElementById('playDropdownBtnSingleGroup'), settings.single);
    toggleBtnGroupValue(document.getElementById('playDropdownBtnJukeboxModeGroup'), settings.jukeboxMode);
}

function savePlaySettings() {
    let singleState = document.getElementById('playDropdownBtnSingleGroup').getElementsByClassName('active')[0].getAttribute('data-value');
    let jukeboxMode = document.getElementById('playDropdownBtnJukeboxModeGroup').getElementsByClassName('active')[0].getAttribute('data-value');
    sendAPI("MYMPD_API_SETTINGS_SET", {
        "consume": (document.getElementById('playDropdownBtnConsume').classList.contains('active') ? 1 : 0),
        "random": (document.getElementById('playDropdownBtnRandom').classList.contains('active') ? 1 : 0),
        "single": parseInt(singleState),
        "repeat": (document.getElementById('playDropdownBtnRepeat').classList.contains('active') ? 1 : 0),
        "jukeboxMode": parseInt(jukeboxMode)
        }, getSettings);
}

function saveSetup() {
    let formOK = true;
    let selectLocale1 = document.getElementById('selectLocale1')
    let smthEl = document.getElementById('smth');
    let smthElseEl = document.getElementById('smthElse');

    // validate

    if (formOK === true) {
        // sendAPI("MYMPD_API_SETUP_SAVE", {"locale": selectLocale1.options[selectLocale1.selectedIndex].value, "smth": smthEl.value, "smthElse": smthElseEl.value}, getSettings);
        modalSetup.hide();
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function songDetails(uri) {
    if (uri.startsWith("tidal://")) {
        sendAPI("MYMPD_API_TIDAL_SONGDETAILS", {"uri": uri}, parseTidalSongDetails);
    }
    else if (uri.startsWith("qobuz://")) {
        sendAPI("MYMPD_API_QOBUZ_SONGDETAILS", {"uri": uri}, parseQobuzSongDetails);
    }
    else {
        sendAPI("MPD_API_DATABASE_SONGDETAILS", {"uri": uri}, parseSongDetails);
    }
    modalSongDetails.show();
}

function parseFingerprint(obj) {
    let textarea = document.createElement('textarea');
    textarea.value = obj.result.fingerprint;
    textarea.classList.add('form-control', 'text-monospace', 'small');
    let fpTd = document.getElementById('fingerprint');
    fpTd.innerHTML = '';
    fpTd.appendChild(textarea);
}

function parseSongDetails(obj) {
    let modal = document.getElementById('modalSongDetails');
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + subdir + '/albumart/' + obj.result.uri + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    
    let elH1s = modal.getElementsByTagName('h1');
    for (let i = 0; i < elH1s.length; i++) {
        elH1s[i].innerText = obj.result.Title;
    }
    
    let songDetailsHTML = '';
    for (let i = 0; i < settings.tags.length; i++) {
        if (settings.tags[i] === 'Title' || obj.result[settings.tags[i]] === '-') {
            continue;
        }
        songDetailsHTML += '<tr><th>' + t(settings.tags[i]) + '</th><td data-tag="' + settings.tags[i] + '" data-name="' + encodeURI(obj.result[settings.tags[i]]) + '">';
        if (settings.browsetags.includes(settings.tags[i]) && obj.result[settings.tags[i]] !== '-') {
            songDetailsHTML += '<a class="text-success" href="#">' + e(obj.result[settings.tags[i]]) + '</a>';
        }
        else {
            songDetailsHTML += obj.result[settings.tags[i]];
        }
        songDetailsHTML += '</td></tr>';
    }
    songDetailsHTML += '<tr><th>' + t('Duration') + '</th><td>' + beautifyDuration(obj.result.Duration) + '</td></tr>';
    if (settings.featLibrary === true && settings.publish === true) {
        songDetailsHTML += '<tr><th>' + t('Filename') + '</th><td><a class="breakAll text-success" href="/browse/music/' + 
            encodeURI(obj.result.uri) + '" target="_blank" title="' + e(obj.result.uri) + '">' + 
            e(basename(obj.result.uri)) + '</a></td></tr>';
    }
    else {
        songDetailsHTML += '<tr><th>' + t('Filename') + '</th><td class="breakAll"><span title="' + e(obj.result.uri) + '">' + 
            e(basename(obj.result.uri)) + '</span></td></tr>';
    }
    songDetailsHTML += '<tr><th>' + t('Filetype') + '</th><td>' + filetype(obj.result.uri) + '</td></tr>';
    songDetailsHTML += '<tr><th>' + t('LastModified') + '</th><td>' + localeDate(obj.result.LastModified) + '</td></tr>';
    if (settings.featFingerprint === true) {
        songDetailsHTML += '<tr><th>' + t('Fingerprint') + '</th><td class="breakAll" id="fingerprint"><a class="text-success" data-uri="' + 
            encodeURI(obj.result.uri) + '" id="calcFingerprint" href="#">' + t('Calculate') + '</a></td></tr>';
    }
    if (obj.result.booklet === true && settings.publish === true) {
        songDetailsHTML += '<tr><th>' + t('Booklet') + '</th><td><a class="text-success" href="/browse/music/' + dirname(obj.result.uri) + '/' + settings.bookletName + '" target="_blank">' + t('Download') + '</a></td></tr>';
    }
    if (settings.featStickers === true) {
        songDetailsHTML += '<tr><th colspan="2" class="pt-3"><h5>' + t('Statistics') + '</h5></th></tr>' +
            '<tr><th>' + t('Play count') + '</th><td>' + obj.result.playCount + '</td></tr>' +
            '<tr><th>' + t('Skip count') + '</th><td>' + obj.result.skipCount + '</td></tr>' +
            '<tr><th>' + t('Last played') + '</th><td>' + (obj.result.lastPlayed === 0 ? t('never') : localeDate(obj.result.lastPlayed)) + '</td></tr>' +
            '<tr><th>' + t('Last skipped') + '</th><td>' + (obj.result.lastSkipped === 0 ? t('never') : localeDate(obj.result.lastSkipped)) + '</td></tr>' +
            '<tr><th>' + t('Like') + '</th><td>' +
              '<div class="btn-group btn-group-sm">' +
                '<button title="' + t('Dislike song') + '" id="btnVoteDown2" data-href=\'{"cmd": "voteSong", "options": [0]}\' class="btn btn-sm btn-light material-icons">thumb_down</button>' +
                '<button title="' + t('Like song') + '" id="btnVoteUp2" data-href=\'{"cmd": "voteSong", "options": [2]}\' class="btn btn-sm btn-light material-icons">thumb_up</button>' +
              '</div>' +
            '</td></tr>';
    }
    
    document.getElementById('tbodySongDetails').innerHTML = songDetailsHTML;
    setVoteSongBtns(obj.result.like, obj.result.uri);
    
    let lyricsEls = document.getElementsByClassName('featLyrics');
    for (let i = 0; i < lyricsEls.length; i++) {
        if (obj.result.lyricsfile === true && settings.featLibrary === true && settings.publish === true) {
            lyricsEls[i].classList.remove('hide');
        }
        else {
            lyricsEls[i].classList.add('hide');
        }
    }
    
    if (obj.result.lyricsfile === true && settings.publish === true) {
        getLyrics(obj.result.uri);
    }
    else {
        document.getElementById('lyricsText').innerText = '';
    }
    
    let pictureEls = document.getElementsByClassName('featPictures');
    for (let i = 0; i < lyricsEls.length; i++) {
        if (obj.result.images.length > 0 && settings.featLibrary === true && settings.publish === true) {
            pictureEls[i].classList.remove('hide');
        }
        else {
            pictureEls[i].classList.add('hide');
        }
    }
    
    let carousel = '<div id="songPicsCarousel" class="carousel slide" data-ride="carousel">' +
        '<ol class="carousel-indicators">';
    for (let i = 0; i < obj.result.images.length; i++) {
        carousel += '<li data-target="#songPicsCarousel" data-slide-to="' + i + '"' +
            (i === 0 ? ' class="active"' : '') + '></li>';
    }    
    carousel += '</ol>' +
        '<div class="carousel-inner" role="listbox">';
    for (let i = 0; i < obj.result.images.length; i++) {
        carousel += '<div class="carousel-item' + (i === 0 ? ' active' : '') + '"><div></div></div>';
    }
    carousel += '</div>' +
            '<a class="carousel-control-prev" href="#songPicsCarousel" data-slide="prev">' +
                '<span class="carousel-control-prev-icon"></span>' +
            '</a>' +
            '<a class="carousel-control-next" href="#songPicsCarousel" data-slide="next">' +
                '<span class="carousel-control-next-icon"></span>' +
            '</a>' +
            '</div>';
    
    document.getElementById('tabSongPics').innerHTML = carousel;
    let carouselItems = document.getElementById('tabSongPics').getElementsByClassName('carousel-item');
    for (let i = 0; i < carouselItems.length; i++) {
        carouselItems[i].children[0].style.backgroundImage = 'url(' + subdir + '/browse/music/' + encodeURI(obj.result.images[i]) + ')';
    }
    let myCarousel = document.getElementById('songPicsCarousel');
    //eslint-disable-next-line no-undef, no-unused-vars
    let myCarouselInit = new Carousel(myCarousel, {
        interval: false,
        pause: false
    });
}

function getLyrics(uri) {
    document.getElementById('lyricsText').classList.add('opacity05');
    let ajaxRequest=new XMLHttpRequest();
    
    let lyricsfile = uri.replace(/\.\w+$/, ".txt");
    ajaxRequest.open('GET', subdir + '/browse/music/' + lyricsfile, true);
    ajaxRequest.onreadystatechange = function() {
        if (ajaxRequest.readyState === 4) {
            let elLyricsText = document.getElementById('lyricsText');
            elLyricsText.innerText = ajaxRequest.responseText;
            elLyricsText.classList.remove('opacity05');
        }
    };
    ajaxRequest.send();
}

//eslint-disable-next-line no-unused-vars
function loveSong() {
    sendAPI("MPD_API_LOVE", {});
}

//eslint-disable-next-line no-unused-vars
function voteSong(vote) {
    let uri = decodeURI(domCache.currentTitle.getAttribute('data-uri'));
    if (uri === '') {
        return;
    }
        
    if (vote === 2 && domCache.btnVoteUp.classList.contains('highlight')) {
        vote = 1;
    }
    else if (vote === 0 && domCache.btnVoteDown.classList.contains('highlight')) {
        vote = 1;
    }
    sendAPI("MPD_API_LIKE", {"uri": uri, "like": vote});
    setVoteSongBtns(vote, uri);
}

function setVoteSongBtns(vote, uri) {
    domCache.btnVoteUp2 = document.getElementById('btnVoteUp2');
    domCache.btnVoteDown2 = document.getElementById('btnVoteDown2');

    if (uri === '' || uri.indexOf('://') > -1) {
        domCache.btnVoteUp.setAttribute('disabled', 'disabled');
        domCache.btnVoteDown.setAttribute('disabled', 'disabled');
        if (domCache.btnVoteUp2) {
            domCache.btnVoteUp2.setAttribute('disabled', 'disabled');
            domCache.btnVoteDown2.setAttribute('disabled', 'disabled');
        }
    } else {
        domCache.btnVoteUp.removeAttribute('disabled');
        domCache.btnVoteDown.removeAttribute('disabled');
        if (domCache.btnVoteUp2) {
            domCache.btnVoteUp2.removeAttribute('disabled');
            domCache.btnVoteDown2.removeAttribute('disabled');
        }
    }

    if (vote === 0) {
        domCache.btnVoteUp.classList.remove('highlight');
        domCache.btnVoteDown.classList.add('highlight');
        if (domCache.btnVoteUp2) {
            domCache.btnVoteUp2.classList.remove('highlight');
            domCache.btnVoteDown2.classList.add('highlight');
        }
    } else if (vote === 1) {
        domCache.btnVoteUp.classList.remove('highlight');
        domCache.btnVoteDown.classList.remove('highlight');
        if (domCache.btnVoteUp2) {
            domCache.btnVoteUp2.classList.remove('highlight');
            domCache.btnVoteDown2.classList.remove('highlight');
        }
    } else if (vote === 2) {
        domCache.btnVoteUp.classList.add('highlight');
        domCache.btnVoteDown.classList.remove('highlight');
        if (domCache.btnVoteUp2) {
            domCache.btnVoteUp2.classList.add('highlight');
            domCache.btnVoteDown2.classList.remove('highlight');
        }
    }
}

function parseTidalSongDetails(obj) {
    let modal = document.getElementById('modalSongDetails');
    let cover = obj.result.album.cover;
    if (cover) {
        cover = subdir + '/image/' + obj.result.album.cover.replace(/-/g, '/') + '/320x320.jpg';
    }
    else {
        cover = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + cover + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.title;

    let songDetails = '';
    // use settings (tidal) tags
    songDetails += '<tr><th>' + t('Album') + '</th><td>' + obj.result.album.title + '</td></tr>';
    songDetails += '<tr><th>' + t('AlbumArtist') + '</th><td>' + obj.result.album.artist + '</td></tr>';
    songDetails += '<tr><th>' + t('Artist') + '</th><td>' + obj.result.artist.name + '</td></tr>';
    songDetails += '<tr><th>' + t('Date') + '</th><td>' + obj.result.album.releaseDate + '</td></tr>';
    songDetails += '<tr><th>' + t('Track') + '</th><td>' + obj.result.trackNumber + '</td></tr>';
    songDetails += '<tr><th>' + t('Duration') + '</th><td>' + beautifyDuration(obj.result.duration) + '</td></tr>';

    modal.getElementsByTagName('tbody')[0].innerHTML = songDetails;
}

function parseQobuzSongDetails(obj) {
    let modal = document.getElementById('modalSongDetails');
    let cover = obj.result.cover;
    if (cover) {
        cover = subdir + '/image/' + obj.result.cover.split('/').pop();
    }
    else {
        cover = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + cover + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.Title;

    let songDetails = '';
    obj.result.Date = new Date(obj.result.Date).toLocaleDateString();
    for (let i = 0; i < settings.tags.length; i++) {
        if (settings.tags[i] === 'Title') {
            continue;
        }
        songDetails += '<tr><th>' + t(settings.tags[i]) + '</th><td>' + obj.result[settings.tags[i]] + '</td></tr>';
    }
    songDetails += '<tr><th>' + t('Duration') + '</th><td>' + beautifyDuration(obj.result.Duration) + '</td></tr>';

    modal.getElementsByTagName('tbody')[0].innerHTML = songDetails;
}

function songRadio(uri) { // tidal track radio
    uri = uri.split('://').pop() + '/mix';
    searchTidal(uri);
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function parseStats(obj) {
    document.getElementById('mpdstats_artists').innerText =  obj.result.artists;
    document.getElementById('mpdstats_albums').innerText = obj.result.albums;
    document.getElementById('mpdstats_songs').innerText = obj.result.songs;
    document.getElementById('mpdstats_dbPlaytime').innerText = beautifyDuration(obj.result.dbPlaytime);
    document.getElementById('mpdstats_playtime').innerText = beautifyDuration(obj.result.playtime);
    document.getElementById('mpdstats_uptime').innerText = beautifyDuration(obj.result.uptime);
    document.getElementById('mpdstats_mympd_uptime').innerText = beautifyDuration(obj.result.myMPDuptime);
    document.getElementById('mpdstats_dbUpdated').innerText = localeDate(obj.result.dbUpdated);
    document.getElementById('mympdVersion').innerText = obj.result.mympdVersion;
    document.getElementById('mpdInfo_version').innerText = obj.result.mpdVersion;
    document.getElementById('mpdInfo_libmpdclientVersion').innerText = obj.result.libmpdclientVersion;
    if (obj.result.libmympdclientVersion !== undefined) {
        document.getElementById('mpdInfo_libmympdclientVersion').innerText = obj.result.libmympdclientVersion;
        document.getElementById('mpdInfo_libmympdclientVersion').parentNode.classList.remove('hide');
    }
    else {
        document.getElementById('mpdInfo_libmympdclientVersion').parentNode.classList.add('hide');    
    }
}

function getServerinfo() {
    let ajaxRequest=new XMLHttpRequest();
    ajaxRequest.open('GET', subdir + '/api/serverinfo', true);
    ajaxRequest.onreadystatechange = function() {
        if (ajaxRequest.readyState === 4) {
            let obj = JSON.parse(ajaxRequest.responseText);
            document.getElementById('wsIP').innerText = obj.result.ip;
            document.getElementById('wsMongooseVersion').innerText = obj.result.version;
        }
    };
    ajaxRequest.send();
}

function parseOutputs(obj) {
    let btns = '';
    for (let i = 0; i < obj.result.numOutputs; i++) {
        btns += '<button id="btnOutput' + obj.result.data[i].id +'" data-output-id="' + obj.result.data[i].id + '" class="btn btn-secondary btn-block';
        if (obj.result.data[i].state === 1) {
            btns += ' active';
        }
        btns += '"><span class="material-icons float-left">volume_up</span> ' + e(obj.result.data[i].name) + '</button>';
    }
    domCache.outputs.innerHTML = btns;
}

function setCounter(currentSongId, totalTime, elapsedTime) {
    currentSong.totalTime = totalTime;
    currentSong.elapsedTime = elapsedTime;
    currentSong.currentSongId = currentSongId;

    domCache.progressBar.value = Math.floor(1000 * elapsedTime / totalTime);

    let counterText = beautifySongDuration(elapsedTime) + "&nbsp;/&nbsp;" + beautifySongDuration(totalTime);
    domCache.counter.innerHTML = counterText;
    
    //Set playing track in queue view
    if (lastState) {
        if (lastState.currentSongId !== currentSongId) {
            let tr = document.getElementById('queueTrackId' + lastState.currentSongId);
            if (tr) {
                let durationTd = tr.querySelector('[data-col=Duration]');
                if (durationTd) {
                    durationTd.innerText = tr.getAttribute('data-duration');
                }
                let posTd = tr.querySelector('[data-col=Pos]');
                if (posTd) {
                    posTd.classList.remove('material-icons');
                    posTd.innerText = tr.getAttribute('data-songpos');
                }
                tr.classList.remove('font-weight-bold');
                tr.classList.remove('playing');
            }
        }
    }
    let tr = document.getElementById('queueTrackId' + currentSongId);
    if (tr) {
        let durationTd = tr.querySelector('[data-col=Duration]');
        if (durationTd) {
            durationTd.innerHTML = counterText;
        }
        let posTd = tr.querySelector('[data-col=Pos]');
        if (posTd) {
            if (!posTd.classList.contains('material-icons')) {
                posTd.classList.add('material-icons');
                posTd.innerText = 'play_arrow';
            }
        }
        tr.classList.add('font-weight-bold');
        tr.classList.add('playing');
    }
    
    // Set playing track in playback view (queue mini)
    if (lastState) {
        if (lastState.currentSongId !== currentSongId) {
            let tr = document.getElementById('queueMiniTrackId' + lastState.currentSongId);
            if (tr) {
                let durationTd = tr.querySelector('[data-col=Duration]');
                if (durationTd) {
                    durationTd.innerText = tr.getAttribute('data-duration');
                }
                let posTd = tr.querySelector('[data-col=Pos]');
                if (posTd) {
                    posTd.classList.remove('material-icons');
                    posTd.innerText = tr.getAttribute('data-songpos');
                }
                tr.classList.remove('font-weight-bold');
                tr.classList.remove('playing');
            }
        }
    }
    tr = document.getElementById('queueMiniTrackId' + currentSongId);
    if (tr) {
        let durationTd = tr.querySelector('[data-col=Duration]');
        if (durationTd) {
            durationTd.innerHTML = counterText;
        }
        let posTd = tr.querySelector('[data-col=Pos]');
        if (posTd) {
            if (!posTd.classList.contains('material-icons')) {
                posTd.classList.add('material-icons');
                posTd.innerText = 'play_arrow';
            }
        }
        tr.classList.add('font-weight-bold');
        tr.classList.add('playing');
    }
    
    if (progressTimer) {
        clearTimeout(progressTimer);
    }
    if (playstate === 'play') {
        progressTimer = setTimeout(function() {
            currentSong.elapsedTime ++;
            requestAnimationFrame(function() {
                setCounter(currentSong.currentSongId, currentSong.totalTime, currentSong.elapsedTime);
            });
        }, 1000);
    }
}

function parseState(obj) {
    if (JSON.stringify(obj.result) === JSON.stringify(lastState)) {
        toggleUI();
        return;
    }

    // Set play and queue state
    parseUpdateQueue(obj);
    
    // Set volume
    parseVolume(obj);

    // Set play counters
    setCounter(obj.result.currentSongId, obj.result.totalTime, obj.result.elapsedTime);
    
    // Get current song
    if (!lastState || lastState.currentSongId !== obj.result.currentSongId ||
        lastState.queueVersion !== obj.result.queueVersion)
    {
        sendAPI("MPD_API_PLAYER_CURRENT_SONG", {}, songChange);
    }
    //clear playback card if no current song
    if (obj.result.songPos === '-1') {
        domCache.currentTitle.innerText = 'Not playing';
        document.title = 'myMPD';
        let headerTitle = document.getElementById('headerTitle');
        headerTitle.innerText = '';
        headerTitle.removeAttribute('title');
        headerTitle.classList.remove('clickable');
        clearCurrentCover();
        if (settings.bgCover === true) {
            clearBackgroundImage();
        }
        // let pb = document.getElementById('cardPlaybackTags').getElementsByTagName('p');
        let pb = document.getElementById('cardPlaybackTags').getElementsByTagName('span');
        for (let i = 0; i < pb.length; i++) {
            pb[i].innerText = '';
        }
    }
    else {
        let cff = document.getElementById('currentFileformat');
        if (cff) {
            // cff.getElementsByTagName('p')[0].innerText = fileformat(obj.result.audioFormat);
            cff.getElementsByTagName('span')[0].innerText = fileformat(obj.result.audioFormat);
        }
    }

    lastState = obj.result;                    
    
    if (settings.mpdConnected === false || uiEnabled === false) {
        getSettings(true);
    }
}

function parseVolume(obj) {
    if (obj.result.volume === -1) {
        domCache.volumePrct.innerText = t('Volumecontrol disabled');
        domCache.volumeControl.classList.add('hide');
    } 
    else {
        domCache.volumeControl.classList.remove('hide');
        domCache.volumePrct.innerText = obj.result.volume + ' %';
        if (obj.result.volume === 0) {
            domCache.volumeMenu.innerText = 'volume_off';
        }
        else if (obj.result.volume < 50) {
            domCache.volumeMenu.innerText = 'volume_down';
        }
        else {
            domCache.volumeMenu.innerText = 'volume_up';
        }
    }
    domCache.volumeBar.value = obj.result.volume;
}

function setBackgroundImage(url) {
    if (url === undefined) {
        clearBackgroundImage();
        return;
    }
    let old = document.querySelectorAll('.albumartbg');
    for (let i = 0; i < old.length; i++) {
        if (old[i].style.zIndex === '-10') {
            old[i].remove();
        }
        else {
            old[i].style.zIndex = '-10';
        }
    }
    let div = document.createElement('div');
    div.classList.add('albumartbg');
    div.style.filter = settings.bgCssFilter;
    div.style.backgroundImage = 'url("' + subdir + '/albumart/' + url + '")';
    div.style.opacity = 0;
    let body = document.getElementsByTagName('body')[0];
    body.insertBefore(div, body.firstChild);

    let img = new Image();
    img.onload = function() {
        document.querySelector('.albumartbg').style.opacity = 1;
    };
    img.src = subdir + '/albumart/' + url;
}

function clearBackgroundImage() {
    let old = document.querySelectorAll('.albumartbg');
    for (let i = 0; i < old.length; i++) {
        if (old[i].style.zIndex === '-10') {
            old[i].remove();        
        }
        else {
            old[i].style.zIndex = '-10';
            old[i].style.opacity = '0';
        }
    }
}

function setCurrentCover(url) {
    if (url === undefined) {
        clearCurrentCover();
        return;
    }
    let old = domCache.currentCover.querySelectorAll('.coverbg');
    for (let i = 0; i < old.length; i++) {
        if (old[i].style.zIndex === '2') {
            old[i].remove();        
        }
        else {
            old[i].style.zIndex = '2';
        }
    }

    let div = document.createElement('div');
    div.classList.add('coverbg');
    div.style.backgroundImage = 'url("' + subdir + '/albumart/' + url + '")';
    div.style.opacity = 0;
    domCache.currentCover.insertBefore(div, domCache.currentCover.firstChild);

    let img = new Image();
    img.onload = function() {
        domCache.currentCover.querySelector('.coverbg').style.opacity = 1;
    };
    img.src = subdir + '/albumart/' + url;
}

function clearCurrentCover() {
    let old = domCache.currentCover.querySelectorAll('.coverbg');
    for (let i = 0; i < old.length; i++) {
        if (old[i].style.zIndex === '2') {
            old[i].remove();        
        }
        else {
            old[i].style.zIndex = '2';
            old[i].style.opacity = '0';
        }
    }
}

function songChange(obj) {
    getQueueMini(obj.result.pos);
    let curSong = obj.result.Title + ':' + obj.result.Artist + ':' + obj.result.Album + ':' + obj.result.uri + ':' + obj.result.currentSongId;
    if (lastSong === curSong) {
        return;
    }
    let textNotification = '';
    let htmlNotification = '';
    let pageTitle = '';

    mediaSessionSetMetadata(obj.result.Title, obj.result.Artist, obj.result.Album, obj.result.uri);
    
    setCurrentCover(obj.result.uri);
    if (settings.bgCover === true && settings.featCoverimage === true) {
        setBackgroundImage(obj.result.uri);
    }

    if (obj.result.Artist !== undefined && obj.result.Artist.length > 0 && obj.result.Artist !== '-') {
        textNotification += obj.result.Artist;
        htmlNotification += obj.result.Artist;
        pageTitle += obj.result.Artist + ' - ';
    } 

    if (obj.result.Album !== undefined && obj.result.Album.length > 0 && obj.result.Album !== '-') {
        textNotification += ' - ' + obj.result.Album;
        htmlNotification += '<br/>' + obj.result.Album;
    }

    if (obj.result.Title !== undefined && obj.result.Title.length > 0) {
        pageTitle += obj.result.Title;
        domCache.currentTitle.innerText = obj.result.Title;
        domCache.currentTitle.setAttribute('data-uri', encodeURI(obj.result.uri));
    }
    else {
        domCache.currentTitle.innerText = '';
        domCache.currentTitle.setAttribute('data-uri', '');
    }
    document.title = 'myMPD: ' + pageTitle;
    let headerTitle = document.getElementById('headerTitle');
    headerTitle.innerText = pageTitle;
    headerTitle.title = pageTitle;
    
    if (obj.result.uri !== undefined && obj.result.uri !== '' && (obj.result.uri.indexOf('://') === -1 || obj.result.uri.startsWith('tidal://'))) {
        headerTitle.classList.add('clickable');
    }
    else {
        headerTitle.classList.remove('clickable');
    }

    if (obj.result.uri !== undefined) {
        if (settings.featStickers === true) {
            setVoteSongBtns(obj.result.like, obj.result.uri);
        }
        obj.result['Filetype'] = filetype(obj.result.uri);
    }
    else {
        obj.result['Filetype'] = '';
    }
    
    if (lastState) {
        obj.result['Fileformat'] = fileformat(lastState.audioFormat);
    }
    else {
        obj.result['Fileformat'] = '';
    }

    for (let i = 0; i < settings.colsPlayback.length; i++) {
        let c = document.getElementById('current' + settings.colsPlayback[i]);
        if (c) {
            let value = obj.result[settings.colsPlayback[i]];
            if (value === undefined) {
                value = '';
            }
            if (settings.colsPlayback[i] === 'Duration') {
                value = beautifySongDuration(value);
            }
            else if (settings.colsPlayback[i] === 'LastModified') {
                value = localeDate(value);
            }
            c.getElementsByTagName('p')[0].innerText = value;
            c.setAttribute('data-name', encodeURI(value));
        }
    }
    
    // Update Artist in queue view for http streams
    let playingTr = document.getElementById('queueTrackId' + obj.result.currentSongId);
    if (playingTr) {
        playingTr.getElementsByTagName('td')[1].innerText = obj.result.Title;
    }

    if (playstate === 'play') {
        showNotification(obj.result.Title, textNotification, htmlNotification, 'success');
    }
    
    lastSong = curSong;
    lastSongObj = obj.result;
}

//eslint-disable-next-line no-unused-vars
function gotoTagList() {
    appGoto(app.current.app, app.current.tab, app.current.view, '0/-/-/');
}

//eslint-disable-next-line no-unused-vars
function volumeStep(dir) {
    let inc = dir === 'up' ? settings.volumeStep : 0 - settings.volumeStep;
    chVolume(inc);
}

function chVolume(increment) {
    let newValue = parseInt(domCache.volumeBar.value) + increment;
    if (newValue < 0)  {
        newValue = 0;
    }
    else if (newValue > 100) {
        newValue = 100;
    }
    domCache.volumeBar.value = newValue;
    sendAPI("MPD_API_PLAYER_VOLUME_SET", {"volume": newValue});
}

//eslint-disable-next-line no-unused-vars
function clickTitle() {
    let uri = decodeURI(domCache.currentTitle.getAttribute('data-uri'));
    if (uri !== '' && (uri.indexOf('://') === -1 || uri.startsWith('tidal://'))) {
        songDetails(uri);
    }
}

function mediaSessionSetPositionState(duration, position) {
    if (settings.mediaSession === true && 'mediaSession' in navigator && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({
            duration: duration,
            position: position
        });
    }
}

function mediaSessionSetState() {
    if (settings.mediaSession === true && 'mediaSession' in navigator) {
        if (playstate === 'play') {
            navigator.mediaSession.playbackState = 'playing';
        }
        else {
            navigator.mediaSession.playbackState = 'paused';
        }
    }
}

function mediaSessionSetMetadata(title, artist, album, url) {
    if (settings.mediaSession === true && 'mediaSession' in navigator) {
        let hostname = window.location.hostname;
        let protocol = window.location.protocol;
        let port = window.location.port;
        let artwork = protocol + '//' + hostname + (port !== '' ? ':' + port : '') + subdir + '/albumart/' + url;

        if (settings.coverimage === true) {
            //eslint-disable-next-line no-undef
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: album,
                artwork: [{src: artwork}]
            });
        }
        else {
            //eslint-disable-next-line no-undef
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: album
            });
        }
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function focusTable(rownr, table) {
    if (table === undefined) {
        table = document.getElementById(app.current.app + (app.current.tab !== undefined ? app.current.tab : '') + (app.current.view !== undefined ? app.current.view : '') + 'List');
        //support for BrowseDatabaseAlbum list
        if (table === null) {
            table = document.getElementById(app.current.app + app.current.tab + 'TagList');
        }
        //support for BrowseDatabaseAlbum cards
        if (app.current.app === 'Browse' && app.current.tab === 'Database' &&
            !document.getElementById('BrowseDatabaseAlbumList').classList.contains('hide'))
        {
            table = document.getElementById('BrowseDatabaseAlbumList').getElementsByTagName('table')[0];
        }
    }

    if (app.current.app === 'Browse' && app.current.tab === 'Covergrid' &&
            table.getElementsByTagName('tbody').length === 0)
    {
        table = document.getElementsByClassName('card-grid')[0];
        table.focus();
        return;
    }

    if (table !== null) {
        let sel = table.getElementsByClassName('selected');
        if (rownr === undefined) {
            if (sel.length === 0) {
                let row = table.getElementsByTagName('tbody')[0].rows[0];
                row.focus();
                row.classList.add('selected');
            }
            else {
                sel[0].focus();
            }
        }
        else {
            if (sel && sel.length > 0) {
                sel[0].classList.remove('selected');
            }
            let rows = table.getElementsByTagName('tbody')[0].rows;
            let rowsLen = rows.length;
            if (rowsLen < rownr) {
                rownr = 0;
            }
            if (rowsLen > rownr) {
                rows[rownr].focus();
                rows[rownr].classList.add('selected');
            }
        }
        //insert goto parent row
        if (table.id === 'BrowseFilesystemList') {
            let tbody = table.getElementsByTagName('tbody')[0];
            if (tbody.rows.length > 0 && tbody.rows[0].getAttribute('data-type') !== 'parentDir' && app.current.search !== '') {
                let nrCells = table.getElementsByTagName('thead')[0].rows[0].cells.length;
                let uri = app.current.search.replace(/\/?([^/]+)$/,'');
                let row = tbody.insertRow(0);
                row.setAttribute('data-type', 'parentDir');
                row.setAttribute('tabindex', 0);
                row.setAttribute('data-uri', encodeURI(uri));
                row.innerHTML = '<td colspan="' + nrCells + '">..</td>';
            }
        }
        scrollFocusIntoView();
    }
}

function scrollFocusIntoView() {
    let el = document.activeElement;
    let posY = el.getBoundingClientRect().top;
    let height = el.offsetHeight;

    if (posY < 74) {
        window.scrollBy(0, - 74);
    }
    else if (posY + height > window.innerHeight - 74) {
        window.scrollBy(0, 74);
    }
}

function navigateTable(table, keyCode) {
    let cur = document.activeElement;
    if (cur) {
        let next = null;
        let handled = false;
        if (keyCode === 'ArrowDown') {
            next = cur.nextElementSibling;
            handled = true;
        }
        else if (keyCode === 'ArrowUp') {
            next = cur.previousElementSibling;
            handled = true;
        }
        else if (keyCode === ' ') {
            let popupBtn = cur.lastChild.firstChild;
            if (popupBtn.nodeName === 'A') {
                popupBtn.click();
            }
            handled = true;
        }
        else if (keyCode === 'Enter') {
            cur.firstChild.click();
            handled = true;
        }
        else if (keyCode === 'Escape') {
            cur.blur();
            cur.classList.remove('selected');
            handled = true;
        }
        //only for BrowseDatabaseAlbum cards
        else if (app.current.app === 'Browse' && app.current.tab === 'Database' &&
                 !document.getElementById('BrowseDatabaseAlbumList').classList.contains('hide') &&
                 (keyCode === 'n' || keyCode === 'p')) {
            let tablesHtml = document.getElementById('BrowseDatabaseAlbumList').getElementsByTagName('table');
            let tables = Array.prototype.slice.call(tablesHtml);
            let idx = document.activeElement.nodeName === 'TR' ? tables.indexOf(document.activeElement.parentNode.parentNode)
                                                              : tables.indexOf(document.activeElement);
            idx = event.key === 'p' ? (idx > 1 ? idx - 1 : 0)
                                   : event.key === 'n' ? ( idx < tables.length - 1 ? ( document.activeElement.nodeName === 'TR' ? idx + 1 : idx )
                                                                                  : idx)
                                                      : idx;

            if (tables[idx].getElementsByTagName('tbody')[0].rows.length > 0) {
                next = tables[idx].getElementsByTagName('tbody')[0].rows[0];
            }
            else {
                //Titlelist not loaded yet, scroll table into view
                tables[idx].focus();
                scrollFocusIntoView();
            }
            handled = true;
        }
        if (handled === true) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (next) {
            cur.classList.remove('selected');
            next.classList.add('selected');
            next.focus();
            scrollFocusIntoView();
        }
    }
}

function dragAndDropTable(table) {
    let tableBody = document.getElementById(table).getElementsByTagName('tbody')[0];
    tableBody.addEventListener('dragstart', function(event) {
        if (event.target.nodeName === 'TR') {
            event.target.classList.add('opacity05');
            event.dataTransfer.setDragImage(event.target, 0, 0);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('Text', event.target.getAttribute('id'));
            dragEl = event.target.cloneNode(true);
        }
    }, false);
    tableBody.addEventListener('dragleave', function(event) {
        event.preventDefault();
        if (dragEl.nodeName !== 'TR') {
            return;
        }
        let target = event.target;
        if (event.target.nodeName === 'TD') {
            target = event.target.parentNode;
        }
        if (target.nodeName === 'TR') {
            target.classList.remove('dragover');
        }
    }, false);
    tableBody.addEventListener('dragover', function(event) {
        event.preventDefault();
        if (dragEl.nodeName !== 'TR') {
            return;
        }
        let tr = tableBody.getElementsByClassName('dragover');
        let trLen = tr.length;
        for (let i = 0; i < trLen; i++) {
            tr[i].classList.remove('dragover');
        }
        let target = event.target;
        if (event.target.nodeName === 'TD') {
            target = event.target.parentNode;
        }
        if (target.nodeName === 'TR') {
            target.classList.add('dragover');
        }
        event.dataTransfer.dropEffect = 'move';
    }, false);
    tableBody.addEventListener('dragend', function(event) {
        event.preventDefault();
        if (dragEl.nodeName !== 'TR') {
            return;
        }
        let tr = tableBody.getElementsByClassName('dragover');
        let trLen = tr.length;
        for (let i = 0; i < trLen; i++) {
            tr[i].classList.remove('dragover');
        }
        if (document.getElementById(event.dataTransfer.getData('Text'))) {
            document.getElementById(event.dataTransfer.getData('Text')).classList.remove('opacity05');
        }
    }, false);
    tableBody.addEventListener('drop', function(event) {
        event.stopPropagation();
        event.preventDefault();
        if (dragEl.nodeName !== 'TR') {
            return;
        }
        let target = event.target;
        if (event.target.nodeName === 'TD') {
            target = event.target.parentNode;
        }
        let oldSongpos = document.getElementById(event.dataTransfer.getData('Text')).getAttribute('data-songpos');
        let newSongpos = target.getAttribute('data-songpos');
        document.getElementById(event.dataTransfer.getData('Text')).remove();
        dragEl.classList.remove('opacity05');
        tableBody.insertBefore(dragEl, target);
        let tr = tableBody.getElementsByClassName('dragover');
        let trLen = tr.length;
        for (let i = 0; i < trLen; i++) {
            tr[i].classList.remove('dragover');
        }
        document.getElementById(table).classList.add('opacity05');
        if ((app.current.app === 'Queue' && app.current.tab === 'Current') ||
             app.current.app === 'Playlist') {
            sendAPI("MPD_API_QUEUE_MOVE_TRACK", {"from": oldSongpos, "to": newSongpos});
        }
        else if (app.current.app === 'Browse' && app.current.tab === 'Playlists' && app.current.view === 'Detail') {
            playlistMoveTrack(oldSongpos, newSongpos);
        }
    }, false);
}

function dragAndDropTableHeader(table) {
    let tableHeader;
    if (document.getElementById(table + 'List')) {
        tableHeader = document.getElementById(table + 'List').getElementsByTagName('tr')[0];
    }
    else {
        tableHeader = table.getElementsByTagName('tr')[0];
        table = 'BrowseDatabase';
    }

    tableHeader.addEventListener('dragstart', function(event) {
        if (event.target.nodeName === 'TH') {
            event.target.classList.add('opacity05');
            event.dataTransfer.setDragImage(event.target, 0, 0);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('Text', event.target.getAttribute('data-col'));
            dragEl = event.target.cloneNode(true);
        }
    }, false);
    tableHeader.addEventListener('dragleave', function(event) {
        event.preventDefault();
        if (dragEl.nodeName !== 'TH') {
            return;
        }
        if (event.target.nodeName === 'TH') {
            event.target.classList.remove('dragover-th');
        }
    }, false);
    tableHeader.addEventListener('dragover', function(event) {
        event.preventDefault();
        if (dragEl.nodeName !== 'TH') {
            return;
        }
        let th = tableHeader.getElementsByClassName('dragover-th');
        let thLen = th.length;
        for (let i = 0; i < thLen; i++) {
            th[i].classList.remove('dragover-th');
        }
        if (event.target.nodeName === 'TH') {
            event.target.classList.add('dragover-th');
        }
        event.dataTransfer.dropEffect = 'move';
    }, false);
    tableHeader.addEventListener('dragend', function(event) {
        event.preventDefault();
        if (dragEl.nodeName !== 'TH') {
            return;
        }
        let th = tableHeader.getElementsByClassName('dragover-th');
        let thLen = th.length;
        for (let i = 0; i < thLen; i++) {
            th[i].classList.remove('dragover-th');
        }
        if (this.querySelector('[data-col=' + event.dataTransfer.getData('Text') + ']')) {
            this.querySelector('[data-col=' + event.dataTransfer.getData('Text') + ']').classList.remove('opacity05');
        }
    }, false);
    tableHeader.addEventListener('drop', function(event) {
        event.stopPropagation();
        event.preventDefault();
        if (dragEl.nodeName !== 'TH') {
            return;
        }
        this.querySelector('[data-col=' + event.dataTransfer.getData('Text') + ']').remove();
        dragEl.classList.remove('opacity05');
        tableHeader.insertBefore(dragEl, event.target);
        let th = tableHeader.getElementsByClassName('dragover-th');
        let thLen = th.length;
        for (let i = 0; i < thLen; i++) {
            th[i].classList.remove('dragover-th');
        }
        if (document.getElementById(table + 'List')) {
            document.getElementById(table + 'List').classList.add('opacity05');
            saveCols(table);
        }
        else {
            saveCols(table, this.parentNode.parentNode);
        }
    }, false);
}

function setColTags(table) {
    let tags = settings.tags.slice();
    if (settings.featTags === false) {
        tags.push('Title');
    }
    tags.push('Duration');
    if (table === 'QueueCurrent' || table === 'BrowsePlaylistsDetail' || table === 'QueueLastPlayed') {
        tags.push('Pos');
    }
    if (table === 'BrowseFilesystem') {
        tags.push('Type');
    }
    if (table === 'QueueLastPlayed') {
        tags.push('LastPlayed');
    }
    if (table === 'Playback') {
        tags.push('Filetype');
        tags.push('Fileformat');
        tags.push('LastModified');
    }
    if (table == 'SearchTidal') { // wip - add more cols
        tags = settings.searchtidaltags.slice();
        tags.push('Type');
        tags.push('Duration');
        tags.push('Track');
    }

    tags.sort();
    return tags;
}

function setColsChecklist(table) {
    let tagChks = '';
    let tags = setColTags(table);

    for (let i = 0; i < tags.length; i++) {
        if (table === 'Playback' && tags[i] === 'Title') {
            continue;
        }
        tagChks += '<div>' +
            '<button class="btn btn-secondary btn-xs clickable material-icons material-icons-small' +
            (settings['cols' + table].includes(tags[i]) ? ' active' : '') + '" name="' + tags[i] + '">' +
            (settings['cols' + table].includes(tags[i]) ? 'check' : 'radio_button_unchecked') + '</button>' +
            '<label class="form-check-label" for="' + tags[i] + '">&nbsp;&nbsp;' + t(tags[i]) + '</label>' +
            '</div>';
    }
    return tagChks;
}

function setCols(table, className) {
    let colsChkList = document.getElementById(table + 'ColsDropdown');
    if (colsChkList) {
        colsChkList.firstChild.innerHTML = setColsChecklist(table);
    }
    let sort = app.current.sort;

    if (table === 'SearchDatabase' && app.apps.Search.tabs.Database.state === '0/any/Title/') {
        if (settings.tags.includes('Title')) {
            sort = 'Title';
        }
        else if (settings.featTags === false) {
            sort = 'Filename';
        }
        else {
            sort = '-';
        }
    }

    if (table === 'SearchTidal' && app.apps.Search.tabs.Tidal.views.All.state === '0/any/Title/') {
        if (settings.tags.includes('Title')) {
            sort = 'Title';
        }
        else {
            sort = '-';
        }
    }

    if (table === 'SearchQobuz' && app.apps.Search.tabs.Qobuz.views.All.state === '0/any/Title/') {
        if (settings.tags.includes('Title')) {
            sort = 'Title';
        }
        else {
            sort = '-';
        }
    }

    if (table !== 'Playback') {
        let heading = '';
        for (let i = 0; i < settings['cols' + table].length; i++) {
            let h = settings['cols' + table][i];
            heading += '<th draggable="true" data-col="' + h  + '">';
            if (h === 'Track' || h === 'Pos') {
                h = '#';
            }
            heading += t(h);

            if ((table === 'SearchDatabase') && (h === sort || '-' + h === sort) ) {
                let sortdesc = false;
                if (app.current.sort.indexOf('-') === 0) {
                    sortdesc = true;
                }
                heading += '<span class="sort-dir material-icons pull-right">' + (sortdesc === true ? 'arrow_drop_up' : 'arrow_drop_down') + '</span>';
            }
            heading += '</th>';
        }
        if (settings.featTags === true && table !== 'BrowseDatabase') {
            /* if (table === 'BrowseFilesystem' || table === 'SearchDatabase' || table === 'SearchTidal')
                heading += '<th data-col="Add"></th>'; */
            heading += '<th data-col="Action"><a href="#" class="text-secondary align-middle material-icons material-icons-small">settings</a></th>';
        }
        else {
            heading += '<th></th>';
        }

        if (className === undefined) {
            document.getElementById(table + 'List').getElementsByTagName('tr')[0].innerHTML = heading;
        }
        else {
            let tbls = document.querySelectorAll(className);
            for (let i = 0; i < tbls.length; i++) {
                tbls[i].getElementsByTagName('tr')[0].innerHTML = heading;
            }
        }
    }
}

function saveCols(table, tableEl) {
    let colsDropdown = document.getElementById(table + 'ColsDropdown');
    let header;
    if (tableEl === undefined) {
        header = document.getElementById(table + 'List').getElementsByTagName('tr')[0];
    }
    else if (typeof(tableEl) === 'string') {
        header = document.querySelector(tableEl).getElementsByTagName('tr')[0];
    }
    else {
        header = tableEl.getElementsByTagName('tr')[0];
    }
    if (colsDropdown) {
        let colInputs = colsDropdown.firstChild.getElementsByTagName('button');
        for (let i = 0; i < colInputs.length; i++) {
            if (colInputs[i].getAttribute('name') === null) {
                continue;
            }
            let th = header.querySelector('[data-col=' + colInputs[i].name + ']');
            if (colInputs[i].classList.contains('active') === false) {
                if (th) {
                    th.remove();
                }
            }
            else if (!th) {
                th = document.createElement('th');
                th.innerText = colInputs[i].name;
                th.setAttribute('data-col', colInputs[i].name);
                header.insertBefore(th, header.lastChild);
            }
        }
    }

    let params = {"table": "cols" + table, "cols": []};
    let ths = header.getElementsByTagName('th');
    for (let i = 0; i < ths.length; i++) {
        let name = ths[i].getAttribute('data-col');
        if (name !== 'Action' && name !== null && name !== 'Add') {
            params.cols.push(name);
        }
    }
    sendAPI("MYMPD_API_COLS_SAVE", params, getSettings);
}

//eslint-disable-next-line no-unused-vars
function saveColsPlayback(table) {
    let colInputs = document.getElementById(table + 'ColsDropdown').firstChild.getElementsByTagName('button');
    let header = document.getElementById('cardPlaybackTags');

    for (let i = 0; i < colInputs.length - 1; i++) {
        let th = document.getElementById('current' + colInputs[i].name);
        if (colInputs[i].classList.contains('active') === false) {
            if (th) {
                th.remove();
            }
        }
        else if (!th) {
            th = document.createElement('div');
            // th.innerHTML = '<small>' + t(colInputs[i].name) + '</small><p></p>';
            th.innerHTML = '<small>' + t(colInputs[i].name) + ': </small><span></span>';
            th.setAttribute('id', 'current' + colInputs[i].name);
            th.setAttribute('data-tag', colInputs[i].name);
            header.appendChild(th);
        }
    }

    let params = {"table": "cols" + table, "cols": []};
    let ths = header.getElementsByTagName('div');
    for (let i = 0; i < ths.length; i++) {
        let name = ths[i].getAttribute('data-tag');
        if (name) {
            params.cols.push(name);
        }
    }
    sendAPI("MYMPD_API_COLS_SAVE", params, getSettings);
}

function replaceTblRow(row, el) {
    let menuEl = row.querySelector('[data-popover]');
    let result = false;
    if (menuEl) {
        hideMenu();
    }
    if (row.classList.contains('selected')) {
        el.classList.add('selected');
        el.focus();
        result = true;
    }
    row.replaceWith(el);
    return result;
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

//eslint-disable-next-line no-unused-vars
var themes = {
    "theme-autodetect": "Autodetect",
    "theme-default": "Default",
    "theme-dark": "Dark",
    "theme-light": "Light"
};

// mw/ utility/setPagination
function setTidalPagination(total, returned, limit = settings.maxElementsPerPage) {
    let cat = app.current.app + app.current.tab;
    let totalPages = Math.ceil(total / limit);
    if (totalPages === 0)
        totalPages = 1;
    let p = ['PaginationTop', 'PaginationBottom'];
    for (let i = 0; i < 2; i++) {
        document.getElementById(cat + p[i] + 'Page').innerText = (app.current.page / limit + 1) + ' / ' + totalPages;
        if (totalPages > 1) {
            document.getElementById(cat + p[i] + 'Page').removeAttribute('disabled');
            let pl = '';
            for (let j = 0; j < totalPages; j++) {
                pl += '<button data-page="' + (j * limit) + '" type="button" class="mr-1 mb-1 btn-sm btn btn-secondary">' +
                    (j + 1) + '</button>';
            }
            document.getElementById(cat + p[i] + 'Pages').innerHTML = pl;
            document.getElementById(cat + p[i] + 'Page').classList.remove('nodropdown');
        }
        else if (total === -1) {
            document.getElementById(cat + p[i] + 'Page').setAttribute('disabled', 'disabled');
            document.getElementById(cat + p[i] + 'Page').innerText = (app.current.page / limit + 1);
            document.getElementById(cat + p[i] + 'Page').classList.add('nodropdown');
        }
        else {
            document.getElementById(cat + p[i] + 'Page').setAttribute('disabled', 'disabled');
            document.getElementById(cat + p[i] + 'Page').classList.add('nodropdown');
        }
    
        if (total > app.current.page + limit || total === -1 && returned >= limit) {
            document.getElementById(cat + p[i] + 'Next').removeAttribute('disabled');
            document.getElementById(cat + p[i]).classList.remove('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.remove('hide');
        }
        else {
            document.getElementById(cat + p[i] + 'Next').setAttribute('disabled', 'disabled');
            document.getElementById(cat + p[i]).classList.add('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.add('hide');
        }
    
        if (app.current.page > 0) {
            document.getElementById(cat + p[i] + 'Prev').removeAttribute('disabled');
            document.getElementById(cat + p[i]).classList.remove('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.remove('hide');
        } else {
            document.getElementById(cat + p[i] + 'Prev').setAttribute('disabled', 'disabled');
        }
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

//eslint-disable-next-line no-unused-vars
function deleteTimer(timerid) {
    sendAPI("MYMPD_API_TIMER_RM", {"timerid": timerid}, showListTimer);
}

//eslint-disable-next-line no-unused-vars
function toggleTimer(target, timerid) {
    if (target.classList.contains('active')) {
        target.classList.remove('active');
        sendAPI("MYMPD_API_TIMER_TOGGLE", {"timerid": timerid, "enabled": false}, showListTimer);
    }
    else {
        target.classList.add('active');
        sendAPI("MYMPD_API_TIMER_TOGGLE", {"timerid": timerid, "enabled": true}, showListTimer);
    }
}

//eslint-disable-next-line no-unused-vars
function saveTimer() {
    let formOK = true;
    let nameEl = document.getElementById('inputTimerName');
    if (!validateNotBlank(nameEl)) {
        formOK = false;
    }
    let minOneDay = false;
    let weekdayBtns = ['btnTimerMon', 'btnTimerTue', 'btnTimerWed', 'btnTimerThu', 'btnTimerFri', 'btnTimerSat', 'btnTimerSun'];
    let weekdays = [];
    for (let i = 0; i < weekdayBtns.length; i++) {
        let checked = document.getElementById(weekdayBtns[i]).classList.contains('active') ? true : false;
        weekdays.push(checked);
        if (checked === true) {
            minOneDay = true;
        }
    }
    if (minOneDay === false) {
        formOK = false;
        document.getElementById('invalidTimerWeekdays').style.display = 'block';
    }
    else {
        document.getElementById('invalidTimerWeekdays').style.display = 'none';
    }
    let selectTimerAction = document.getElementById('selectTimerAction');
    let selectTimerPlaylist = document.getElementById('selectTimerPlaylist');
    let selectTimerHour = document.getElementById('selectTimerHour');
    let selectTimerMinute = document.getElementById('selectTimerMinute');
    let jukeboxMode = document.getElementById('btnTimerJukeboxModeGroup').getElementsByClassName('active')[0].getAttribute('data-value');

    if (jukeboxMode === '0' &&
        selectTimerPlaylist.options[selectTimerPlaylist.selectedIndex].value === 'Database'&&
        selectTimerAction.options[selectTimerAction.selectedIndex].value === 'startplay')
    {
        formOK = false;
        document.getElementById('btnTimerJukeboxModeGroup').classList.add('is-invalid');
    }
    if (formOK === true) {
        sendAPI("MYMPD_API_TIMER_SAVE", {
            "timerid": parseInt(document.getElementById('inputTimerId').value),
            "name": nameEl.value,
            "enabled": (document.getElementById('btnTimerEnabled').classList.contains('active') ? true : false),
            "startHour": parseInt(selectTimerHour.options[selectTimerHour.selectedIndex].value),
            "startMinute": parseInt(selectTimerMinute.options[selectTimerMinute.selectedIndex].value),
            "weekdays": weekdays,
            "action": selectTimerAction.options[selectTimerAction.selectedIndex].value,
            "volume": parseInt(document.getElementById('inputTimerVolume').value),
            "playlist": selectTimerPlaylist.options[selectTimerPlaylist.selectedIndex].value,
            "jukeboxMode": parseInt(jukeboxMode),
            }, showListTimer);
    }
}

//eslint-disable-next-line no-unused-vars
function showEditTimer(timerid) {
    document.getElementById('timerActionPlay').classList.add('hide');
    document.getElementById('listTimer').classList.remove('active');
    document.getElementById('editTimer').classList.add('active');
    document.getElementById('listTimerFooter').classList.add('hide');
    document.getElementById('editTimerFooter').classList.remove('hide');
    playlistEl = 'selectTimerPlaylist';
    sendAPI("MPD_API_PLAYLIST_LIST", {"offset": 0, "filter": "-"}, getAllPlaylists);
    if (timerid !== 0) {
        sendAPI("MYMPD_API_TIMER_GET", {"timerid": timerid}, parseEditTimer);
    }
    else {
        document.getElementById('inputTimerId').value = '0';
        document.getElementById('inputTimerName').value = '';
        toggleBtnChk('btnTimerEnabled', true);
        document.getElementById('selectTimerHour').value = '12';
        document.getElementById('selectTimerMinute').value = '0';
        document.getElementById('selectTimerAction').value = 'startplay';
        document.getElementById('inputTimerVolume').value = '50';
        document.getElementById('selectTimerPlaylist').value = 'Database';
        toggleBtnGroupValue(document.getElementById('btnTimerJukeboxModeGroup'), 1);
        let weekdayBtns = ['btnTimerMon', 'btnTimerTue', 'btnTimerWed', 'btnTimerThu', 'btnTimerFri', 'btnTimerSat', 'btnTimerSun'];
        for (let i = 0; i < weekdayBtns.length; i++) {
            toggleBtnChk(weekdayBtns[i], false);
        }
        document.getElementById('timerActionPlay').classList.remove('hide');
    }
    document.getElementById('inputTimerName').focus();
    document.getElementById('inputTimerName').classList.remove('is-invalid');
    document.getElementById('btnTimerJukeboxModeGroup').classList.remove('is-invalid');
    document.getElementById('invalidTimerWeekdays').style.display = 'none';
}

function parseEditTimer(obj) {
    if (obj.result.action === 'startplay') {
        document.getElementById('timerActionPlay').classList.remove('hide');
    }
    else {
        document.getElementById('timerActionPlay').classList.add('hide');
    }
    document.getElementById('inputTimerId').value = obj.result.timerid;
    document.getElementById('inputTimerName').value = obj.result.name;
    toggleBtnChk('btnTimerEnabled', obj.result.enabled);
    document.getElementById('selectTimerHour').value = obj.result.startHour;
    document.getElementById('selectTimerMinute').value = obj.result.startMinute;
    document.getElementById('selectTimerAction').value = obj.result.action;
    document.getElementById('inputTimerVolume').value = obj.result.volume;
    document.getElementById('selectTimerPlaylist').value = obj.result.playlist;
    toggleBtnGroupValue(document.getElementById('btnTimerJukeboxModeGroup'), obj.result.jukeboxMode);
    let weekdayBtns = ['btnTimerMon', 'btnTimerTue', 'btnTimerWed', 'btnTimerThu', 'btnTimerFri', 'btnTimerSat', 'btnTimerSun'];
    for (let i = 0; i < weekdayBtns.length; i++) {
        toggleBtnChk(weekdayBtns[i], obj.result.weekdays[i]);
    }
}

function showListTimer() {
    document.getElementById('listTimer').classList.add('active');
    document.getElementById('editTimer').classList.remove('active');
    document.getElementById('listTimerFooter').classList.remove('hide');
    document.getElementById('editTimerFooter').classList.add('hide');
    sendAPI("MYMPD_API_TIMER_LIST", {}, parseListTimer);
}

function parseListTimer(obj) {
    let tbody = document.getElementById('listTimer').getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');

    let activeRow = 0;
    let weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < obj.result.returnedEntities; i++) {
        let row = document.createElement('tr');
        row.setAttribute('data-id', obj.result.data[i].timerid);
        let tds = '<td>' + obj.result.data[i].name + '</td>' +
                  '<td><button name="enabled" class="btn btn-secondary btn-xs clickable material-icons material-icons-small' +
                  (obj.result.data[i].enabled === true ? ' active' : '') + '">' +
                  (obj.result.data[i].enabled === true ? 'check' : 'radio_button_unchecked') + '</button></td>' +
                  '<td>' + zeroPad(obj.result.data[i].startHour, 2) + ':' + zeroPad(obj.result.data[i].startMinute,2) + ' ' + t('on') + ' ';
        let days = [];
        for (let j = 0; j < 7; j++) {
            if (obj.result.data[i].weekdays[j] === true) {
                days.push(t(weekdays[j]))
            }
        }
        tds += days.join(', ')  + '</td><td>' + t(obj.result.data[i].action) + '</td>' +
               '<td data-col="Action"><a href="#" class="material-icons color-darkgrey">delete</a></td>';
        row.innerHTML = tds;
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    let trLen = tr.length - 1;
    for (let i = trLen; i >= obj.result.returnedEntities; i --) {
        tr[i].remove();
    }

    if (obj.result.returnedEntities === 0) {
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
                          '<td colspan="4">' + t('Empty list') + '</td></tr>';
    }
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function alignDropdown(el) {
    if (getXpos(el.children[0]) > domCache.body.offsetWidth * 0.66) {
        el.getElementsByClassName('dropdown-menu')[0].classList.add('dropdown-menu-right');
    }
    else {
        el.getElementsByClassName('dropdown-menu')[0].classList.remove('dropdown-menu-right');
    }
}

function getXpos(el) {
    var xPos = 0;
    while (el) {
        xPos += (el.offsetLeft - el.scrollLeft + el.clientLeft);
        el = el.offsetParent;
    }
    return xPos;
}

function zeroPad(num, places) {
  var zero = places - num.toString().length + 1;
  return Array(+(zero > 0 && zero)).join("0") + num;
}

function dirname(uri) {
    return uri.replace(/\/[^/]*$/, '');
}

function basename(uri) {
   return uri.split('/').reverse()[0];
}

function filetype(uri) {
    if (uri === undefined) {
        return '';
    }
    let ext = uri.split('.').pop().toUpperCase();
    if (uri.includes('tidal')) {
        ext = ext.slice(0, ext.indexOf('?')); // remove token from tidal streamUrl
    }
    switch (ext) {
        case 'MP3':  return ext + ' - MPEG-1 Audio Layer III';
        case 'FLAC': return ext + ' - Free Lossless Audio Codec';
        case 'OGG':  return ext + ' - Ogg Vorbis';
        case 'OPUS': return ext + ' - Opus Audio';
        case 'WAV':  return ext + ' - WAVE Audio File';
        case 'WV':   return ext + ' - WavPack';
        case 'AAC':  return ext + ' - Advancded Audio Coding';
        case 'MPC':  return ext + ' - Musepack';
        case 'MP4':  return ext + ' - MPEG-4';
        case 'M4A':  return ext + ' - MPEG-4 Audio';
        case 'APE':  return ext + ' - Monkey Audio ';
        case 'WMA':  return ext + ' - Windows Media Audio';
        default:     return ext;
    }
}

function fileformat(audioformat) {
    return audioformat.bits + t('bits') + ' - ' + audioformat.sampleRate / 1000 + t('kHz');
}

function scrollToPosY(pos) {
    document.body.scrollTop = pos; // For Safari
    document.documentElement.scrollTop = pos; // For Chrome, Firefox, IE and Opera
}

function doSetFilterLetter(x) {
    let af = document.getElementById(x + 'Letters').getElementsByClassName('active')[0];
    if (af) {
        af.classList.remove('active');
    }
    let filter = app.current.filter;
    if (filter === '0') {
        filter = '#';
    }
    
    document.getElementById(x).innerHTML = '<span class="material-icons">filter_list</span>' + (filter !== '-' ? ' ' + filter : '');
    
    if (filter !== '-') {
        let btns = document.getElementById(x + 'Letters').getElementsByTagName('button');
        let btnsLen = btns.length;
        for (let i = 0; i < btnsLen; i++) {
            if (btns[i].innerText === filter) {
                btns[i].classList.add('active');
                break;
            }
        }
    }
}

function addFilterLetter(x) {
    let filter = '<button class="mr-1 mb-1 btn btn-sm btn-secondary material-icons material-icons-small">delete</button>' +
        '<button class="mr-1 mb-1 btn btn-sm btn-secondary">#</button>';
    for (let i = 65; i <= 90; i++) {
        filter += '<button class="mr-1 mb-1 btn-sm btn btn-secondary">' + String.fromCharCode(i) + '</button>';
    }

    let letters = document.getElementById(x);
    letters.innerHTML = filter;
    
    letters.addEventListener('click', function(event) {
        switch (event.target.innerText) {
            case 'delete':
                filter = '-';
                break;
            case '#':
                filter = '0';
                break;
            default:
                filter = event.target.innerText;
        }
        appGoto(app.current.app, app.current.tab, app.current.view, '0/' + filter + '/' + app.current.sort + '/' + app.current.search);
    }, false);
}

function selectTag(btnsEl, desc, setTo) {
    let btns = document.getElementById(btnsEl);
    let aBtn = btns.querySelector('.active')
    if (aBtn) {
        aBtn.classList.remove('active');
    }
    aBtn = btns.querySelector('[data-tag=' + setTo + ']');
    if (aBtn) {
        aBtn.classList.add('active');
        if (desc !== undefined) {
            document.getElementById(desc).innerText = aBtn.innerText;
            document.getElementById(desc).setAttribute('data-phrase', aBtn.innerText);
        }
    }
}

function addTagList(el, list) {
    let tagList = '';
    if (list === 'searchtags') {
        if (settings.featTags === true) {
            tagList += '<button type="button" class="btn btn-secondary btn-sm btn-block" data-tag="any">' + t('Any Tag') + '</button>';
        }
        tagList += '<button type="button" class="btn btn-secondary btn-sm btn-block" data-tag="filename">' + t('Filename') + '</button>';
    }
    else if (list === 'searchtidaltags' || list === 'searchqobuztags') {
        tagList += '<button type="button" class="btn btn-secondary btn-sm btn-block" data-tag="any">' + t('Any Tag') + '</button>';
    }
    for (let i = 0; i < settings[list].length; i++) {
        tagList += '<button type="button" class="btn btn-secondary btn-sm btn-block" data-tag="' + settings[list][i] + '">' + t(settings[list][i]) + '</button>';
    }
    if (el === 'covergridSortTagsList' && settings.tags.includes('Date')) {
        tagList += '<button type="button" class="btn btn-secondary btn-sm btn-block" data-tag="Date">' + t('Date') + '</button>';
    }
    document.getElementById(el).innerHTML = tagList;
}

function addTagListSelect(el, list) {
    let tagList = '';
    if (el === 'saveSmartPlaylistSort' || el === 'selectSmartplsSort') {
        tagList += '<option value="">' + t('Disabled') + '</option>';
        tagList += '<option value="shuffle">' + t('Shuffle') + '</option>';
        tagList += '<optgroup label="' + t('Sort by tag') + '">';
        tagList += '<option value="filename">' + t('Filename') + '</option>';
    }
    else if (el === 'selectJukeboxUniqueTag' && settings.browsetags.includes('Title') === false) {
        //Title tag should be always in the list
        tagList = '<option value="Title">' + t('Song') + '</option>';
    }
    for (let i = 0; i < settings[list].length; i++) {
        tagList += '<option value="' + settings[list][i] + '">' + t(settings[list][i]) + '</option>';
    }
    if (el === 'saveSmartPlaylistSort' || el === 'selectSmartplsSort') {
        tagList += '</optgroup>';
    }
    document.getElementById(el).innerHTML = tagList;
}

//eslint-disable-next-line no-unused-vars
function openModal(modal) {
    window[modal].show();
}

//eslint-disable-next-line no-unused-vars
function openDropdown(dropdown) {
    window[dropdown].toggle();
}

//eslint-disable-next-line no-unused-vars
function focusSearch() {
    if (app.current.app === 'Queue') {
        document.getElementById('searchqueuestr').focus();
    }
    else if (app.current.app === 'Search' && app.current.tab === 'Database') {
        domCache.searchstr.focus();
    }
    else if (app.current.app === 'Search' && app.current.tab === 'Tidal') {
        domCache.searchtidalstr.focus();
    }
    else if (app.current.app === 'Search' && app.current.tab === 'Qobuz') {
        domCache.searchqobuzstr.focus();
    }
    else {
        appGoto('Search');
    }
}

function btnWaiting(btn, waiting) {
    if (waiting === true) {
        let spinner = document.createElement('span');
        spinner.classList.add('spinner-border', 'spinner-border-sm', 'mr-2');
        btn.insertBefore(spinner, btn.firstChild);
        btn.setAttribute('disabled', 'disabled');
    }
    else {
        btn.removeAttribute('disabled');
        if (btn.firstChild.nodeName === 'SPAN') {
            btn.firstChild.remove();
        }
    }
}

function toggleBtnGroupValue(btngrp, value) {
    let btns = btngrp.getElementsByTagName('button');
    let b = btns[0];
    let valuestr = value;
    if (isNaN(value) === false) {
        valuestr = value.toString();
    }
    for (let i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-value') === valuestr) {
            btns[i].classList.add('active');
            b = btns[i];
        }
        else {
            btns[i].classList.remove('active');
        }
    }
    return b;
}

function toggleBtnGroupValueCollapse(btngrp, collapse, value) {
    let activeBtn = toggleBtnGroupValue(btngrp, value);
    if (activeBtn.getAttribute('data-collapse') === 'show') {
        document.getElementById(collapse).classList.add('show');
    }
    else {
        document.getElementById(collapse).classList.remove('show');
    }
}

function toggleBtnGroup(btn) {
    let b = btn;
    if (typeof btn === 'string') {
        b = document.getElementById(btn);
    }
    let btns = b.parentNode.getElementsByTagName('button');
    for (let i = 0; i < btns.length; i++) {
        if (btns[i] === b) {
            btns[i].classList.add('active');
        }
        else {
            btns[i].classList.remove('active');
        }
    }
    return b;
}

function getBtnGroupValue(btnGroup) {
    let activeBtn = document.getElementById(btnGroup).getElementsByClassName('active');
    if (activeBtn.length === 0) {
        activeBtn = document.getElementById(btnGroup).getElementsByTagName('button');    
    }
    return activeBtn[0].getAttribute('data-value');
}

//eslint-disable-next-line no-unused-vars
function toggleBtnGroupCollapse(btn, collapse) {
    let activeBtn = toggleBtnGroup(btn);
    if (activeBtn.getAttribute('data-collapse') === 'show') {
        if (document.getElementById(collapse).classList.contains('show') === false) {
            window[collapse].show();
        }
    }
    else {
        window[collapse].hide();
    }
}

function toggleBtn(btn, state) {
    let b = btn;
    if (typeof btn === 'string') {
        b = document.getElementById(btn);
    }
    if (!b) {
        return;
    }
    if (state === undefined) {
        //toggle state
        state = b.classList.contains('active') ? false : true;
    }

    if (state === true || state === 1) {
        b.classList.add('active');
    }
    else {
        b.classList.remove('active');
    }
}

function toggleBtnChk(btn, state) {
    let b = btn;
    if (typeof btn === 'string') {
        b = document.getElementById(btn);
    }
    if (!b) {
        return;
    }
    if (state === undefined) {
        //toggle state
        state = b.classList.contains('active') ? false : true;
    }

    if (state === true || state === 1) {
        b.classList.add('active');
        b.innerText = 'check';
        return true;
    }
    else {
        b.classList.remove('active');
        b.innerText = 'radio_button_unchecked';
        return false;
    }
}

function toggleBtnChkCollapse(btn, collapse, state) {
    let checked = toggleBtnChk(btn, state);
    if (checked === true) {
        document.getElementById(collapse).classList.add('show');
    }
    else{
        document.getElementById(collapse).classList.remove('show');
    }
}

function setPagination(total, returned, at) {
    let cat = app.current.app + app.current.tab;
    if (at !== undefined) {
        // call with AppTab param
        cat = at;
    }
    let totalPages = Math.ceil(total / settings.maxElementsPerPage);
    if (totalPages === 0) {
        totalPages = 1;
    }
    let p = [ document.getElementById(cat + 'PaginationTop'), document.getElementById(cat + 'PaginationBottom') ];
    
    for (let i = 0; i < p.length; i++) {
        let prev = p[i].children[0];
        let page = p[i].children[1].children[0];
        let pages = p[i].children[1].children[1];
        let next = p[i].children[2];
    
        page.innerText = (app.current.page / settings.maxElementsPerPage + 1) + ' / ' + totalPages;
        if (totalPages > 1) {
            page.removeAttribute('disabled');
            let pl = '';
            for (let j = 0; j < totalPages; j++) {
                pl += '<button data-page="' + (j * settings.maxElementsPerPage) + '" type="button" class="mr-1 mb-1 btn-sm btn btn-secondary">' +
                      ( j + 1) + '</button>';
            }
            pages.innerHTML = pl;
            page.classList.remove('nodropdown');
        }
        else if (total === -1) {
            page.setAttribute('disabled', 'disabled');
            page.innerText = (app.current.page / settings.maxElementsPerPage + 1);
            page.classList.add('nodropdown');
        }
        else {
            page.setAttribute('disabled', 'disabled');
            page.classList.add('nodropdown');
        }
        
        if (total > app.current.page + settings.maxElementsPerPage || total === -1 && returned >= settings.maxElementsPerPage) {
            next.removeAttribute('disabled');
            p[i].classList.remove('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.remove('hide');
        }
        else {
            next.setAttribute('disabled', 'disabled');
            p[i].classList.add('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.add('hide');
        }
    
        if (app.current.page > 0) {
            prev.removeAttribute('disabled');
            p[i].classList.remove('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.remove('hide');
        }
        else {
            prev.setAttribute('disabled', 'disabled');
        }
    }
}

function genId(x) {
    return 'id' + x.replace(/[^\w-]/g, '');
}

function parseCmd(event, href) {
    event.preventDefault();
    let cmd = href;
    if (typeof(href) === 'string') {
        cmd = JSON.parse(href);
    }

    if (typeof window[cmd.cmd] === 'function') {
        switch(cmd.cmd) {
            case 'sendAPI':
                sendAPI(cmd.options[0].cmd, {}); 
                break;
            case 'toggleBtn':
            case 'toggleBtnChk':
            case 'toggleBtnGroup':
            case 'toggleBtnGroupCollapse':
            case 'setPlaySettings':
                window[cmd.cmd](event.target, ... cmd.options);
                break;
            case 'toggleBtnChkCollapse':
                window[cmd.cmd](event.target, undefined, ... cmd.options);
                break;
            default:
                window[cmd.cmd](... cmd.options);
        }
    }
    else {
        logError('Can not execute cmd: ' + cmd);
    }
}

function gotoPage(x) {
    // rm - scroll top nav 58
    // check for playback
    // document.getElementById(app.current.app + app.current.tab + 'PaginationTop').scrollIntoView();
    document.getElementById('card' + app.current.app).scrollIntoView(); // cardHeader
    
    let offset = settings.maxElementsPerPage;
    if (app.current.tab === 'Tidal') {
        if (app.current.view === 'All') {
            offset = 10;
        }
        else if (app.current.view === 'Artist') {
            offset = 50;
        }
    }
    switch (x) {
        case 'next':
            app.current.page += offset;
            break;
        case 'prev':
            app.current.page -= offset;
            if (app.current.page < 0)
                app.current.page = 0;
            break;
        default:
            app.current.page = x;
    }
    // console.log(app.current.app, app.current.tab, app.current.view, app.current.page + '/' + app.current.filter + '/' + app.current.sort + '/' + app.current.search);
    appGoto(app.current.app, app.current.tab, app.current.view, app.current.page + '/' + app.current.filter + '/' + app.current.sort + '/' + app.current.search);
}

function gotoPage2(x) { // old one - rm
    switch (x) {
        case 'next':
            app.current.page += settings.maxElementsPerPage;
            break;
        case 'prev':
            app.current.page -= settings.maxElementsPerPage;
            if (app.current.page < 0) {
                app.current.page = 0;
            }
            break;
        default:
            app.current.page = x;
    }
    appGoto(app.current.app, app.current.tab, app.current.view, app.current.page + '/' + app.current.filter + '/' + app.current.sort + '/' + app.current.search);
}
/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

function validateFilenameString(str) {
    if (str === '') {
        return false;
    }
    else if (str.match(/^[\w-.]+$/) !== null) {
        return true;
    }
    else {
        return false;
    }
}

function validateFilename(el) {
    if (validateFilenameString(el.value) === false) {
        el.classList.add('is-invalid');
        return false;
    }
    else {
        el.classList.remove('is-invalid');
        return true;
    }
}

function validateFilenameList(el) {
    el.classList.remove('is-invalid');

    let filenames = el.value.split(',');
    for (let i = 0; i < filenames.length; i++) {
        if (validateFilenameString(filenames[i].trim()) === false) {
            el.classList.add('is-invalid');
            return false;
        }
    }
    return true;
}

function validatePath(el) {
    if (el.value === '') {
        el.classList.add('is-invalid');
        return false;
    }
    else if (el.value.match(/^\/[/.\w-]+$/) !== null) {
        el.classList.remove('is-invalid');
        return true;
    }
    else {
        el.classList.add('is-invalid');
        return false;
    }
}

function validatePlname(x) {
    if (x === '') {
        return false;
    }
    else if (x.match(/\/|\r|\n|"|'/) === null) {
        return true;
    }
    else {
        return false;
    }
}

function validateNotBlank(el) {
    let value = el.value.replace(/\s/g, '');
    if (value === '') {
        el.classList.add('is-invalid');
        return false;
    }
    else {
        el.classList.remove('is-invalid');
        return true;
    }
}

function validateInt(el) {
    let value = el.value.replace(/\d/g, '');
    if (value !== '') {
        el.classList.add('is-invalid');
        return false;
    }
    else {
        el.classList.remove('is-invalid');
        return true;
    }
}

function validateFloat(el) {
    let value = el.value.replace(/[\d-.]/g, '');
    if (value !== '') {
        el.classList.add('is-invalid');
        return false;
    }
    else {
        el.classList.remove('is-invalid');
        return true;
    }
}

function validateStream(el) {
    if (el.value.indexOf('://') > -1) {
        el.classList.remove('is-invalid');
        return true;
    }
    else {
        el.classList.add('is-invalid');
        return false;
    }
}

function validateHost(el) {
    if (el.value.match(/^([\w-.]+)$/) !== null) {
        el.classList.remove('is-invalid');
        return true;
    }
    else {
        el.classList.add('is-invalid');
        return false;
    }
}
