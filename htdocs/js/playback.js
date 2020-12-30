"use strict";

function setGridPlayback() {
    let list = ['col-md-6', 'd-none', 'd-md-block'];
    // let bts = document.getElementsByClassName('btnText');
    if (app.current.app === 'Playback') {
        document.getElementById('row1').classList.add('row');
        document.getElementById('col1').classList.add('col-md-6');
        document.getElementById('col2').classList.add(...list);
        document.getElementById('cardQueueMini').classList.remove('hide');
        document.getElementById('cardBrowse').classList.remove('hide');
        document.getElementById('cardBrowseDatabase').classList.remove('hide');
        // for (let i = 0; i < bts.length; i++) {
        //     bts[i].classList.add('hide');
        // }
    }
    else {
        document.getElementById('row1').classList.remove('row');
        document.getElementById('col1').classList.remove('col-md-6');
        document.getElementById('col2').classList.remove(...list);
        document.getElementById('cardQueueMini').classList.add('hide');
        // for (let i = 0; i < bts.length; i++) {
        //     bts[i].classList.remove('hide');
        // }
        document.getElementById('viewListDatabaseBox').style.height = '';
        document.getElementById('viewDetailDatabaseBox').style.height = '';
    }
}

function setAppState(page, filter, sort, tag, search) {
    let card = app.current.app === 'Browse' ? 'Playback' : 'Browse';
    let state = { "page": page, "filter": filter, "sort": sort, "tag": tag, "search": search };
    state.scrollPos = app.apps[card].tabs.Database.views[app.current.view].scrollPos;
    app.apps[card].tabs.Database.active = app.current.view;
    app.apps[card].tabs.Database.views[app.current.view] = state;
}

function getQueueMini(pos) {
    let colsQueueMini = ["Pos", "Title", "Artist", "Album", "Duration"];
    // list
    if (pos !== undefined && pos !== -1) {
        sendAPI("MPD_API_QUEUE_MINI", { "pos": pos, "cols": colsQueueMini }, parseQueueMini);
    }
    else if (pos === undefined) {
        let table = document.getElementById('QueueMiniList');
        let tbody = table.getElementsByTagName('tbody')[0];
        for (let i = tbody.rows.length - 1; i >= 0; i--) {
            tbody.deleteRow(i);
        }
        table.classList.add('opacity05');
    }
    // footer
    sendAPI("MPD_API_QUEUE_LIST", { "offset": 0, "cols": [] }, parseQueueList);
}

function parseQueueMini(obj) {
    let colsQueueMini = ["Pos", "Title", "Artist", "Album", "Duration"];
    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById('QueueMiniList');
    let activeRow = 0;
    table.setAttribute('data-version', obj.result.queueVersion);
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    for (let i = 0; i < nrItems; i++) {
        obj.result.data[i].Duration = beautifySongDuration(obj.result.data[i].Duration);
        obj.result.data[i].Pos++;
        let row = document.createElement('tr');
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
    let trLen = tr.length - 1;
    for (let i = trLen; i >= nrItems; i--) {
        tr[i].remove();
    }
    document.getElementById('QueueMiniList').classList.remove('opacity05');
}

function parseQueueList(obj) {
    if (obj.result.totalTime && obj.result.totalTime > 0 && obj.result.totalEntities <= settings.maxElementsPerPage) {
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
    let container = document.getElementById('BrowseDatabaseCards').parentNode;
    let table = document.getElementById('BrowseDatabaseAlbumList').parentNode;
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
        if (document.getElementById('BrowseDatabaseCards').parentNode.classList.contains('hide')) {
            swapView();
        }
    }
}

function parseDatabaseAlbum(obj) {
    let colspan = 3;
    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById('BrowseDatabaseAlbumList');
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    let activeRow = 0;
    for (let i = 0; i < nrItems; i++) {
        let row = document.createElement('tr');
        let tds = '';
        row.setAttribute('data-type', 'dir');
        let uri = dirname(obj.result.data[i].FirstSongUri);
        row.setAttribute('data-uri', encodeURI(uri));
        row.setAttribute('tabindex', 0);
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
    for (let i = trLen; i >= nrItems; i--) {
        tr[i].remove();
    }

    if (nrItems === 0)
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
            '<td colspan="' + colspan + '">' + t('Empty list') + '</td></tr>';
    document.getElementById('BrowseDatabaseAlbumList').classList.remove('opacity05');
}

function calcBoxHeight() {
    if (app.current.app === 'Playback') {
        let oh1 = document.getElementById('cardPlayback').offsetHeight;
        let oh2 = document.getElementById('cardQueueMini').offsetHeight;
        let oh3 = document.getElementById('BrowseDatabaseButtons').offsetHeight;
        let oh4 = document.getElementById('searchDatabaseCrumb').offsetHeight;
        let oh5 = document.getElementById('PlaybackButtonsTop').offsetHeight;
        document.getElementById('viewListDatabaseBox').style.height = oh1 + oh2 - oh3 - oh4 - 17 + 'px';
        document.getElementById('viewDetailDatabaseBox').style.height = oh1 + oh2 - oh5 - 1 + 'px';
    }
}
