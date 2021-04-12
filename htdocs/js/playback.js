"use strict";

function setGridPlayback() {
    const list = ['col-md-6', 'd-none', 'd-md-block'];
    if (app.current.app === 'Playback') {
        document.getElementById('row1').classList.add('row');
        document.getElementById('col1').classList.add('col-md-6');
        document.getElementById('col2').classList.add(...list);
        document.getElementById('cardQueueMini').classList.remove('hide');
        document.getElementById('cardBrowse').classList.remove('hide');
        document.getElementById('tabBrowseDatabase').classList.remove('hide');
        if (app.current.view !== undefined) {
            document.getElementById('viewBrowseDatabase' + app.current.view).classList.remove('hide');
        }
        document.getElementById('searchDatabaseTagsDesc').classList.add('hide');
        calcBoxHeight();
    }
    else {
        document.getElementById('row1').classList.remove('row');
        document.getElementById('col1').classList.remove('col-md-6');
        document.getElementById('col2').classList.remove(...list);
        document.getElementById('cardQueueMini').classList.add('hide');
        document.getElementById('searchDatabaseTagsDesc').classList.remove('hide');
        document.getElementById('viewListDatabaseBox').style.height = '';
        document.getElementById('viewDetailDatabaseBox').style.height = '';
    }
}

// Sync playback and browse cards
function setAppState(offset, limit, filter, sort, tag, search) {
    const card = app.current.app === 'Browse' ? 'Playback' : 'Browse';
    const state = { "offset": offset, "limit": limit, "filter": filter, "sort": sort, "tag": tag, "search": search };
    state.scrollPos = app.apps[card].tabs.Database.views[app.current.view].scrollPos;
    app.apps[card].tabs.Database.active = app.current.view;
    app.apps[card].tabs.Database.views[app.current.view] = state;
}

function playbackRoute() {
    if (app.current.app === 'Playback' && app.last.app !== 'Playback') {
        sendAPI("MPD_API_PLAYER_CURRENT_SONG", {}, songChange);
    }
    if (app.current.view === 'List') {
        setDatabaseList();
    }
}

function getQueueMini(pos) {
    const colsQueueMini = ["Pos", "Title", "Artist", "Album", "Duration"];
    // list
    if (pos !== undefined) {
        if (pos === -1) {
            pos = 0;
        }
        sendAPI("MPD_API_QUEUE_MINI", { "pos": pos, "cols": colsQueueMini }, parseQueueMini);
    }
    else {
        const table = document.getElementById('QueueMiniList');
        const tbody = table.getElementsByTagName('tbody')[0];
        for (let i = tbody.rows.length - 1; i >= 0; i--) {
            tbody.deleteRow(i);
        }
        table.classList.add('opacity05');
    }
    // footer
    sendAPI("MPD_API_QUEUE_LIST", { "offset": app.apps.Queue.tabs.Current.offset, "limit": app.apps.Queue.tabs.Current.limit, "cols": settings.colsQueueCurrent }, parseQueueList, false);
}

function parseQueueMini(obj) {
    const colsQueueMini = ["Pos", "Title", "Artist", "Album", "Duration"];
    const nrItems = obj.result.returnedEntities;
    const table = document.getElementById('QueueMiniList');
    let activeRow = 0;
    table.setAttribute('data-version', obj.result.queueVersion);
    const tbody = table.getElementsByTagName('tbody')[0];
    const tr = tbody.getElementsByTagName('tr');
    for (let i = 0; i < nrItems; i++) {
        obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
        obj.result.data[i].Pos++;
        const row = document.createElement('tr');
        row.setAttribute('data-trackid', obj.result.data[i].id);
        row.setAttribute('id', 'queueMiniTrackId' + obj.result.data[i].id);
        row.setAttribute('data-songpos', obj.result.data[i].Pos);
        row.setAttribute('data-duration', obj.result.data[i].Duration);
        row.setAttribute('data-uri', obj.result.data[i].uri);
        row.setAttribute('tabindex', 0);
        let tds = '';
        for (let c = 0; c < colsQueueMini.length; c++) {
            tds += '<td data-col="' + colsQueueMini[c] + '">' + e(obj.result.data[i][colsQueueMini[c]]) + '</td>';
        }
        row.innerHTML = tds;
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    const trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i--) {
        tr[i].remove();
    }

    table.classList.remove('opacity05');
}

function parseQueueList(obj) {
    if (obj.result.totalTime && obj.result.totalTime > 0 && obj.result.totalEntities <= app.apps.Queue.tabs.Current.limit) {
        document.getElementById('cardFooterQueueMini').innerText = t('Num songs', obj.result.totalEntities) + ' – ' + beautifyDuration(obj.result.totalTime);
    }
    else if (obj.result.totalEntities > 0) {
        document.getElementById('cardFooterQueueMini').innerText = t('Num songs', obj.result.totalEntities);
    }
    else {
        document.getElementById('cardFooterQueueMini').innerText = '';
    }
}

function swapView() {
    const container = document.getElementById('BrowseDatabaseListList').parentNode;
    const table = document.getElementById('BrowseDatabaseSwapList').parentNode;
    if (container.classList.contains('hide')) {
        table.classList.add('hide');
        container.classList.remove('hide');
    }
    else {
        container.classList.add('hide');
        table.classList.remove('hide');
    }
}

function setDatabaseList() {
    if (app.current.tag === 'Album') {
        document.getElementById('btnSwapView').removeAttribute('disabled');
    }
    else {
        document.getElementById('btnSwapView').setAttribute('disabled', 'disabled');
        if (document.getElementById('BrowseDatabaseListList').parentNode.classList.contains('hide')) {
            swapView();
        }
    }
}

function parseDatabaseSwap(obj) {
    const colspan = 3;
    const nrItems = obj.result.returnedEntities;
    const table = document.getElementById('BrowseDatabaseSwapList');
    const tbody = table.getElementsByTagName('tbody')[0];
    const tr = tbody.getElementsByTagName('tr');
    let activeRow = 0;
    for (let i = 0; i < nrItems; i++) {
        const row = document.createElement('tr');
        let tds = '';
        row.setAttribute('data-type', 'dir');
        const uri = dirname(obj.result.data[i].FirstSongUri);
        row.setAttribute('data-uri', encodeURI(uri));
        row.setAttribute('tabindex', 0);
        row.setAttribute('data-album', obj.result.data[i].Album);
        row.setAttribute('data-albumartist', obj.result.data[i].AlbumArtist);
        row.setAttribute('data-name', obj.result.data[i].Album);
        tds += '<td data-col="Type"><span class="mi">album</span></td>';
        tds += '<td data-col="Album">' + e(obj.result.data[i].Album) + '</td>';
        tds += '<td data-col="AlbumArtist">' + e(obj.result.data[i].AlbumArtist) + '</td>';
        tds += '<td data-col="Action"><a href="#" class="mi color-darkgrey">' + ligatureMore + '</a></td>';
        row.innerHTML = tds;
        if (i < tr.length) {
            activeRow = replaceTblRow(tr[i], row) === true ? i : activeRow;
        }
        else {
            tbody.append(row);
        }
    }
    const trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i--) {
        tr[i].remove();
    }

    if (nrItems === 0)
        tbody.innerHTML = '<tr><td><span class="mi">error_outline</span></td>' +
            '<td colspan="' + colspan + '">' + t('Empty list') + '</td></tr>';
    document.getElementById('BrowseDatabaseSwapList').classList.remove('opacity05');
}

function calcBoxHeight() {
    if (app.current.app === 'Playback') {
        const oh1 = document.getElementById('cardPlayback').offsetHeight;
        const oh2 = document.getElementById('cardQueueMini').offsetHeight;
        const oh3 = document.getElementById('BrowseDatabaseButtons').offsetHeight;
        const oh4 = document.getElementById('searchDatabaseCrumb').offsetHeight;
        const oh5 = document.getElementById('PlaybackButtonsTop').offsetHeight;
        document.getElementById('viewListDatabaseBox').style.height = oh1 + oh2 - oh3 - oh4 + 'px';
        document.getElementById('viewDetailDatabaseBox').style.height = oh1 + oh2 - oh5 + 'px';
    }
}
