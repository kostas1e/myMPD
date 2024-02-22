"use strict";

/** @module viewQobuzAlbum_js */

/**
 * Handles QobuzAlbumDetail
 * @returns {void}
 */
function handleQobuzAlbumDetail() {
    // TODO rm
    if (settings.qobuz_logged_in === false) {
        appGoto('Qobuz', 'Login');
    }

    sendAPI("MYMPD_API_QOBUZ_ALBUM_DETAIL", {
        "albumid": app.current.filter
    }, parseQobuzAlbumDetails, true);
}

/**
 * Initializes the qobuz album elements
 * @returns {void}
 */
function initViewQobuzAlbum() {
    elGetById('QobuzAlbumDetailList').addEventListener('click', function(event) {
        const target = tableClickHandler(event);
        if (target !== null) {
            clickSong(getData(target, 'uri'), event);
        }
    }, false);
}

/**
 * Parses the MYMPD_API_QOBUZ_ALBUM_DETAIL response
 * @param {object} obj jsonrpc response object
 * @returns {void}
 */
function parseQobuzAlbumDetails(obj) {
    const table = elGetById('QobuzAlbumDetailList');
    const tfoot = table.querySelector('tfoot');
    // FIXME add fav col
    const cols = ['Track', 'Title', 'Duration'];
    const colspan = cols.length;
    const infoEl = elGetById('tabQobuzAlbumDetailInfoTags');

    if (checkResultId(obj, 'QobuzAlbumDetailList') === false) {
        elClear(infoEl);
        return;
    }

    // FIXME removed .carousel from html
    // support carousel/booklet
    const coverEl = elGetById('tabQobuzAlbumDetailCover');
    // coverEl.style.backgroundImage = getCssImageUri('/albumart?offset=0&uri=' + myEncodeURIComponent(obj.result.data[0].uri));
    coverEl.style.backgroundImage = getCssImageUri(obj.result.ImageLarge);
    setData(coverEl, 'images', obj.result.images);
    setData(coverEl, 'embeddedImageCount', obj.result.embeddedImageCount);
    setData(coverEl, 'uri', obj.result.data[0].uri);

    elClear(infoEl);
    infoEl.appendChild(
        elCreateText('h1', {}, obj.result.Album)
    );
    for (const col of ['AlbumArtist']) { // FIXME
        infoEl.appendChild(
            elCreateNodes('div', {"class": ["col-xl-6"]}, [
                elCreateTextTn('small', {}, col),
                elCreateNode('p', {},
                    printValue(col, obj.result[col])
                )
            ])
        );
    }

    const rowTitle = tn(settingsWebuiFields.clickSong.validValues[settings.webuiSettings.clickSong]);
    updateTable(obj, 'QobuzAlbumDetail', function(row, data) {
        setData(row, 'type', data.Type);
        setData(row, 'name', data.Title);
        setData(row, 'uri', data.uri);
        row.setAttribute('title', rowTitle);
    }, function(row, data) {
        for (let c = 0; c < cols.length; c++) {
            row.appendChild(
                elCreateNode('td', {"data-col": cols[c]},
                    printValue(cols[c], data[cols[c]])
                )
            );
            if (cols[c] === 'Title' && data.parental_warning === true) {
                row.lastChild.classList.add('explicit');
            }
        }
        // TODO fav support
        const favoriteEl = pEl.favoriteBtn.cloneNode(true);
        const trackId = getId(data.uri);
        // if (favoriteIds.tracks.includes(trackId)) {
        // FIXME all favorite
        if (favoriteIds.tracks.indexOf(trackId) !== -1) {
            favoriteEl.textContent = 'favorite';
        }
        row.appendChild(
            elCreateNode('td', { "data-col": "Fav" }, favoriteEl)
        );

        row.appendChild(
            pEl.actionTd.cloneNode(true)
        );
        if (data.streamable === false) {
            // elDisable(row);
            row.classList.add('disabled'); // FIXME properly impl, allow fav
        }
    });

    elReplaceChild(tfoot,
        elCreateNode('tr', {"class": ["not-clickable"]},
            elCreateNode('td', {"colspan": colspan + 2},
                elCreateNodes('small', {}, [
                    elCreateTextTnNr('span', {}, 'Num songs', obj.result.returnedEntities),
                    elCreateText('span', {}, smallSpace + nDash + smallSpace + fmtDuration(obj.result.Duration))
                ])
            )
        )
    );
}

/**
 * Go's to the last qobuz grid view
 * @returns {void}
 */
//eslint-disable-next-line no-unused-vars
function backToQobuzAlbumGrid() {
    appGoto('Qobuz', app.current.tag);
}


//////


function addAlbumFavoriteButton(parentEl) {
    // FIXME move
    const favoriteBtn = pEl.coverFavoriteBtn.cloneNode(true);
    const albumId = getData(parentEl.parentNode, 'AlbumId');
    if (favoriteIds.albums.indexOf(albumId) !== -1) {
        favoriteBtn.textContent = 'favorite';
    }
    parentEl.appendChild(favoriteBtn);
    favoriteBtn.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        clickFavoriteAlbum(event.target);
    }, false);
}

function clickFavoriteAlbum(target) {
    const el = target.parentNode.parentNode;
    const itemId = getData(el, 'AlbumId');
    sendAPI("MYMPD_API_QOBUZ_FAVORITE_TOGGLE", {
        "type": "album",
        "item_id": itemId
    }, function (obj) {
        const status = obj.result.data.status;
        if (status === true) {
            favoriteIds.albums.push(itemId);
        }
        else {
            favoriteIds.albums = favoriteIds.albums.filter(id => id !== itemId);
        }

        if (app.id === 'QobuzLibraryAlbumList') {
            handleQobuzLibraryAlbumList();
            // no scroll
        }
        else {
            target.textContent = status ? 'favorite' : 'favorite_border';
        }
    }, true);
}
