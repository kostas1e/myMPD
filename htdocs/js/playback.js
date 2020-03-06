"use strict";

var scrollToTopBtn = document.getElementById('scrollToTopBtn');
/* 
window.onscroll = function () {
    scrollFunction();
};
 */
window.onresize = function () {
    calculateBoxHeight();
};

function scrollFunction() {
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        scrollToTopBtn.style.display = 'block';
    } else {
        scrollToTopBtn.style.display = 'none';
    }
}

function setGridPlayback() {
    closeCover();
    let bts = document.getElementsByClassName('btnText');
    let list = ['col-md-6', 'd-none', 'd-md-block'];
    if (app.current.app === 'Playback') {
        document.getElementById('row1').classList.add('row');
        document.getElementById('col1').classList.add('col-md-6');
        document.getElementById('col2').classList.add(...list);
        document.getElementById('cardQueueMini').classList.remove('hide');
        document.getElementById('cardBrowse').classList.remove('hide');
        document.getElementById('cardHeaderBrowse').classList.add('hide');
        document.getElementById('cardBrowseCovergrid').classList.remove('hide');
        for (let i = 0; i < bts.length; i++) {
            bts[i].style.display = 'none';
        }
    }
    else {
        document.getElementById('row1').classList.remove('row');
        document.getElementById('col1').classList.remove('col-md-6');
        document.getElementById('col2').classList.remove(...list);
        document.getElementById('cardQueueMini').classList.add('hide');
        document.getElementById('cardHeaderBrowse').classList.remove('hide');
        for (let i = 0; i < bts.length; i++) {
            bts[i].style.display = 'inline';
        }
        document.getElementById('BrowseCovergridBox').style.height = '';
    }
    //lists
}

function getQueueMini(pos, updFooter = false) {
    let colsQueueMini = ["Pos", "Title", "Artist", "Album", "Duration"];
    // footer
    sendAPI("MPD_API_QUEUE_LIST", { "offset": 0, "cols": [] }, parseQueueList);
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
        row.setAttribute('id', 'queueMiniTrackId' + obj.result.data[i].id);
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
    for (let i = trLen; i >= nrItems; i--) {
        tr[i].remove();
    }
    document.getElementById('QueueMiniList').classList.remove('opacity05');
}

function setCovergridList() {
    if (document.getElementById('BrowseCovergridList').classList.contains('hide')) {
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
    sendAPI("MPD_API_DATABASE_GET_ALBUMS", {
        "offset": app.current.page, "searchstr": app.current.search,
        "tag": app.current.filter, "sort": sort, "sortdesc": sortdesc
    }, parseCovergrid);
}

function calculateBoxHeight() {
    let p = document.getElementById('cardPlayback').offsetHeight;
    let qm = document.getElementById('cardQueueMini').offsetHeight;
    let bcb = document.getElementById('BrowseCovergridButtons').offsetHeight;
    let bcbb = document.getElementById('BrowseCovergridButtonsBottom').offsetHeight;
    let fb = document.getElementById('cardFooterBrowse').offsetHeight;
    let boxHeight = p + qm - bcb - bcbb - fb - 54 - 1;
    if (app.current.app === 'Playback') {
        document.getElementById('BrowseCovergridBox').style.height = boxHeight + 'px';
    }
}

function swapView() {
    document.getElementById('btnBrowseCovergridAlbum').parentNode.classList.add('hide');
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
    // maxof document.body.scrollTop document.documentElement.scrollTop // second one
    document.getElementById('btnBrowseCovergridAlbum').parentNode.classList.add('hide');
    getBrowseCovergrid();
}

function parseCovergridAlbum(obj) {
    let colspan = 3;
    let nrItems = obj.result.returnedEntities;
    let table = document.getElementById('BrowseCovergridAlbumList');
    let tbody = table.getElementsByTagName('tbody')[0];
    let tr = tbody.getElementsByTagName('tr');
    // let navigate = document.activeElement.parentNode.parentNode === table ? true : false;
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
    for (let i = trLen; i >= nrItems; i--) {
        tr[i].remove();
    }
/* 
    if (navigate === true) {
        focusTable(0);
    }
 */
    if (nrItems === 0)
        tbody.innerHTML = '<tr><td><span class="material-icons">error_outline</span></td>' +
            '<td colspan="' + colspan + '">' + t('Empty list') + '</td></tr>';
    document.getElementById('BrowseCovergridAlbumList').classList.remove('opacity05');
}

function getCovergridTitle(tr) {
    sendAPI("MPD_API_DATABASE_TAG_ALBUM_TITLE_LIST", {
        "album": decodeURI(tr.getAttribute('data-album')),
        "search": decodeURI(tr.getAttribute('data-albumartist')),
        "tag": "AlbumArtist", "cols": settings.colsBrowseDatabase
    }, parseCovergridTitle);
}

function parseCovergridTitle(obj) {
    document.getElementById('card' + app.current.app).scrollIntoView();
    document.getElementById('BrowseCovergridAlbumList').classList.add('hide');
    document.getElementById('BrowseCovergridTitleList').classList.remove('hide');
    document.getElementById('BrowseCovergridTitleList').getElementsByTagName('caption')[0].innerHTML =
        t(obj.result.AlbumArtist) + ' - ' + t(obj.result.Album);
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
    for (let i = trLen; i >= nrItems; i--) {
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
    sendAPI("MPD_API_DATABASE_STATS", {}, parseDBstats);
}

function parseDBstats(obj) {
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
