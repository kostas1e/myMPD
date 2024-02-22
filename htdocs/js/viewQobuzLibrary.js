"use strict";

// let favTimer = null;
// if (resizeTimer !== null) {
//     clearTimeout(resizeTimer);
// }
// resizeTimer = setTimeout(function() {
//     const list = elGetById(app.id + 'List');
//     if (list) {
//         setScrollViewHeight(list);
//     }
//     resizeTimer = null;
// }, 100);

/** @module viewQobuzLibrary_js */

function handleQobuzLibraryAlbumList() {
    console.log('     routed to ablum list         ');
    // handleSearchExpression('QobuzLibraryAlbumList');

    selectTag('QobuzLibraryAlbumListTagDropdown', 'btnQobuzLibraryAlbumListTagDesc', 'Album');
    // selectTag('QobuzLibraryAlbumListTagDropdown', 'btnQobuzLibraryAlbumListTagDesc', app.current.tag);
    // toggleBtnChkId('QobuzLibraryAlbumListSortDesc', app.current.sort.desc);
    // selectTag('QobuzLibraryAlbumListSortTags', undefined, app.current.sort.tag);

    // sendAPI("MYMPD_API_DATABASE_ALBUM_LIST", {
    //     "offset": app.current.offset,
    //     "limit": app.current.limit,
    //     "expression": app.current.search,
    //     "sort": app.current.sort.tag,
    //     "sortdesc": app.current.sort.desc,
    //     "cols": settings.colsQobuzLibraryAlbumListFetch
    // }, parseDatabaseAlbumList, true);
    // FIXME tmp
    if (settings.qobuz_logged_in === false) {
        appGoto('Qobuz', 'Login');
        return;
    }

    sendAPI("MYMPD_API_QOBUZ_FAVORITES", {
        "offset": app.current.offset,
        "limit": app.current.limit,
        // "expression": app.current.search,
        // "sort": app.current.sort.tag,
        // "sortdesc": app.current.sort.desc,
        // "cols": settings.colsQobuzLibraryAlbumListFetch
        "type": "albums"
    }, parseQobuzAlbumList, true);
}

// handleQobuzLibraryTagList()

function handleQobuzLibraryTrackList() {
    console.log('     routed to track list         ');
    selectTag('QobuzLibraryTrackListTagDropdown', 'btnQobuzLibraryTrackListTagDesc', 'Title');
    // selectTag('QobuzLibraryTrackListTagDropdown', 'btnQobuzLibraryTrackListTagDesc', app.current.tag);
    if (settings.qobuz_logged_in === false) {
        appGoto('Qobuz', 'Login');
        return;
    }
    sendAPI("MYMPD_API_QOBUZ_FAVORITES", {
        "offset": app.current.offset,
        "limit": app.current.limit,
        // "expression": app.current.search,
        // "sort": app.current.sort.tag,
        // "sortdesc": app.current.sort.desc,
        // "cols": settings.colsQobuzLibraryAlbumListFetch
        "type": "tracks"
    }, parseQobuzTrackList, true);
}

function parseQobuzTrackList(obj) {
    console.log('                   parsing qobuz track list for ', app.id);
    // FIXME generic use for track search too
    const listId = app.id === 'QobuzSearch' ? 'QobuzSearchList' : 'QobuzLibraryTrackListList';
    const table = elGetById(listId);
    const tfoot = table.querySelector('tfoot');
    elClear(tfoot);

    if (checkResultId(obj, listId) === false) {
        return;
    }

    // FIXME
    // if (obj.result.returnedEntities > 0 && app.current.filter !== 'qobuz') {
    //     elEnableId('QobuzAddAllSongsBtn');
    //     elEnableId('QobuzAddAllSongsDropdownBtn');
    // }
    // else {
    //     elDisableId('QobuzAddAllSongsBtn');
    //     elDisableId('QobuzAddAllSongsDropdownBtn');
    // }

    const rowTitle = settingsWebuiFields.clickSong.validValues[settings.webuiSettings.clickSong];

    // const cols = ['Title', 'Artist', 'Album', 'Fav', 'Duration', 'Action']
    // const cols = ['Title', 'Artist', 'Album', 'Fav', 'Duration']
    const cols = ['Title', 'Artist', 'Album', 'Duration']

    updateTable(obj, app.id, function (row, data) { // FIXME app.id
        setData(row, 'type', data.Type); // stream
        setData(row, 'uri', data.uri);
        setData(row, 'name', data.Title);
        // setData(row, 'streamable', data.streamable); //
        row.setAttribute('tabindex', 0);
        row.setAttribute('title', rowTitle);
    }, function (row, data) {
        // FIXME smallWidth
        // const list = 'QobuzLibraryTrackList';
        // TODO foreach
        for (let c = 0; c < cols.length; c++) {
            row.appendChild(
                elCreateNode('td', { "data-col": cols[c] },
                    printValue(cols[c], data[cols[c]])
                )
            );
            if (cols[c] === 'Title' && data.parental_warning === true) {
                row.lastChild.classList.add('explicit');
            }
        }
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
            row.classList.add('disabled'); // TODO properly impl, allow fav
        }
    });

    // FIXME
    if (obj.result.totalEntities > 0) {
        const colspan = settings.colsSearch.length + 2; // fav + action
        tfoot.appendChild(
            elCreateNode('tr', { "class": ["not-clickable"] },
                elCreateTextTnNr('td', { "colspan": colspan }, 'Num songs', obj.result.totalEntities)
            )
        );
    }
}

function handleQobuzLibraryAlbumDetail() {
    // FIXME tmp
    if (settings.qobuz_logged_in === false) {
        appGoto('Qobuz', 'Login');
    }

    sendAPI("MYMPD_API_QOBUZ_ALBUM_DETAIL", {
        "albumid": app.current.filter
    }, parseQobuzAlbumDetails3, true);
}

function backToQobuzAlbumGrid3() {
    appGoto('Qobuz', 'Library', 'AlbumList');
}

function parseQobuzAlbumDetails3(obj) {
    const table = elGetById('QobuzLibraryAlbumDetailList');
    const tfoot = table.querySelector('tfoot');
    // FIXME
    const colspan = settings.colsQobuzLibraryAlbumDetail.length;
    const infoEl = elGetById('viewLibraryAlbumDetailInfoTags');

    if (checkResultId(obj, 'QobuzLibraryAlbumDetailList') === false) {
        elClear(infoEl);
        return;
    }

    // FIXME removed .carousel from html
    // support carousel/booklet
    const coverEl = elGetById('viewLibraryAlbumDetailCover');
    // coverEl.style.backgroundImage = getCssImageUri('/albumart?offset=0&uri=' + myEncodeURIComponent(obj.result.data[0].uri));
    coverEl.style.backgroundImage = getCssImageUri(obj.result.ImageLarge);
    setData(coverEl, 'images', obj.result.images);
    setData(coverEl, 'embeddedImageCount', obj.result.embeddedImageCount);
    setData(coverEl, 'uri', obj.result.data[0].uri);

    elClear(infoEl);
    infoEl.appendChild(
        elCreateText('h1', {}, obj.result.Album)
    );
    for (const col of settings.colsQobuzLibraryAlbumDetailInfo) {
        infoEl.appendChild(
            elCreateNodes('div', {"class": ["col-xl-6"]}, [
                elCreateTextTn('small', {}, col),
                elCreateNode('p', {},
                    printValue(col, obj.result[col])
                )
            ])
        );
    }

    // if (obj.result.bookletPath !== '' &&
    //     features.featLibrary === true)
    // {
    //     infoEl.appendChild(
    //         elCreateNodes('div', {"class": ["col-xl-6"]}, [
    //             elCreateText('span', {"class": ["mi", "me-2"]}, 'description'),
    //             elCreateTextTn('a', {"target": "_blank", "href": subdir + myEncodeURI(obj.result.bookletPath)}, 'Download booklet')
    //         ])
    //     );
    // }

    // const mbField = addMusicbrainzFields(obj.result, false);
    // if (mbField !== null) {
    //     infoEl.appendChild(mbField);
    // }

    const rowTitle = tn(settingsWebuiFields.clickSong.validValues[settings.webuiSettings.clickSong]);
    updateTable(obj, 'QobuzLibraryAlbumDetail', function(row, data) {
        setData(row, 'type', 'stream');  // FIXME stream from song
        setData(row, 'name', data.Title);
        setData(row, 'uri', data.uri);
        row.setAttribute('title', rowTitle);
    });

    elReplaceChild(tfoot,
        elCreateNode('tr', {"class": ["not-clickable"]},
            elCreateNode('td', {"colspan": colspan + 1},
                elCreateNodes('small', {}, [
                    elCreateTextTnNr('span', {}, 'Num songs', obj.result.returnedEntities),
                    elCreateText('span', {}, smallSpace + nDash + smallSpace + fmtDuration(obj.result.Duration))
                ])
            )
        )
    );
}

function initViewQobuzLibrary() {
    // elGetById('BrowseDatabaseTagListList').addEventListener('click', function(event) {
    //     if (event.target.classList.contains('row')) {
    //         return;
    //     }
    //     app.current.search = '';
    //     if (event.target.nodeName === 'DIV') {
    //         elGetById('BrowseDatabaseTagSearchStr').value = '';
    //         // clear album search input
    //         elGetById('BrowseDatabaseAlbumListSearchStr').value = '';
    //         gotoBrowse(event);
    //     }
    //     else if (event.target.nodeName === 'A') {
    //         event.preventDefault();
    //         event.stopPropagation();
    //         if (event.target.getAttribute('data-list') === 'song') {
    //             elGetById('SearchSearchStr').value = '';
    //             const tag = getData(event.target.parentNode.parentNode, 'tag');
    //             const value = getData(event.target.parentNode.parentNode, 'name');
    //             gotoSearch(tag, value);
    //         }
    //         else {
    //             elGetById('BrowseDatabaseTagSearchStr').value = '';
    //             // clear album search input
    //             elGetById('BrowseDatabaseAlbumListSearchStr').value = '';
    //             gotoBrowse(event);
    //         }
    //     }
    // }, false);

    // initSearchSimple('BrowseDatabaseTag');

    // elGetById('BrowseDatabaseTagListSortDesc').addEventListener('click', function(event) {
    //     event.stopPropagation();
    //     event.preventDefault();
    //     app.current.sort.desc = app.current.sort.desc === true ? false : true;
    //     appGoto(app.current.card, app.current.tab, app.current.view, 0, app.current.limit, app.current.filter, app.current.sort, app.current.tag, app.current.search);
    // }, false);

    elGetById('QobuzLibraryAlbumListList').addEventListener('click', function(event) {
        const target = gridClickHandler(event);
        if (target !== null) {
            // appGoto('Qobuz', 'Library', 'AlbumDetail', 0, undefined, getData(target.parentNode, 'AlbumId'));
            // FIXME we use tag to know where to return
            appGoto('Qobuz', 'AlbumDetail', undefined, 0, undefined, getData(target.parentNode, 'AlbumId'), undefined, 'Library');
        }
    }, false);

    // elGetById('QobuzLibraryAlbumDetailList').addEventListener('click', function(event) {
    //     const target = tableClickHandler(event);
    //     if (target !== null) {
    //         clickSong(getData(target, 'uri'), event);
    //     }
    // }, false);

    elGetById('QobuzLibraryTrackListList').addEventListener('click', function(event) {
        const target = tableClickHandler(event);
        if (target !== null) {
            clickSong(getData(target, 'uri'), event);
        }
    }, false);
    
    // elGetById('BrowseDatabaseAlbumListColsDropdown').addEventListener('click', function(event) {
    //     if (event.target.nodeName === 'BUTTON' &&
    //         event.target.classList.contains('mi'))
    //     {
    //         event.stopPropagation();
    //         event.preventDefault();
    //         toggleBtnChk(event.target, undefined);
    //     }
    // }, false);

    // elGetById('BrowseDatabaseAlbumDetailInfoColsDropdown').addEventListener('click', function(event) {
    //     if (event.target.nodeName === 'BUTTON' &&
    //         event.target.classList.contains('mi'))
    //     {
    //         event.stopPropagation();
    //         event.preventDefault();
    //         toggleBtnChk(event.target, undefined);
    //     }
    // }, false);

    // elGetById('BrowseDatabaseAlbumListSortDesc').addEventListener('click', function(event) {
    //     event.stopPropagation();
    //     event.preventDefault();
    //     toggleBtnChk(this, undefined);
    //     app.current.sort.desc = app.current.sort.desc === true ? false : true;
    //     appGoto(app.current.card, app.current.tab, app.current.view, 0, app.current.limit, app.current.filter, app.current.sort, app.current.tag, app.current.search);
    // }, false);

    // elGetById('BrowseDatabaseAlbumListSortTags').addEventListener('click', function(event) {
    //     if (event.target.nodeName === 'BUTTON') {
    //         event.preventDefault();
    //         event.stopPropagation();
    //         app.current.sort.tag = getData(event.target, 'tag');
    //         appGoto(app.current.card, app.current.tab, app.current.view, 0, app.current.limit, app.current.filter, app.current.sort, app.current.tag, app.current.search);
    //     }
    // }, false);

    // initSearchExpression('BrowseDatabaseAlbumList');
}

// qobuz user library favorites albums
function parseQobuzAlbumList(obj) {
    const cardContainer = elGetById(app.id === 'QobuzSearch' ? 'QobuzSearchAlbumList' : 'QobuzLibraryAlbumListList'); // FIXME
    // const cardContainer = elGetById('QobuzLibraryAlbumListList');
    unsetUpdateView(cardContainer);

    if (obj.error !== undefined) {
        elReplaceChild(cardContainer,
            elCreateTextTn('div', {"class": ["col", "not-clickable", "alert", "alert-warning"]}, obj.error.message, obj.error.data)
        );
        setPagination(0, 0);
        return;
    }

    const nrItems = obj.result.returnedEntities;
    if (nrItems === 0) {
        elReplaceChild(cardContainer,
            elCreateTextTn('div', {"class": ["col", "not-clickable", "alert", "alert-secondary"]}, 'Empty list')
        );
        setPagination(0, 0);
        return;
    }

    if (cardContainer.querySelector('.not-clickable') !== null) {
        elClear(cardContainer);
    }
    let cols = cardContainer.querySelectorAll('.col');
    for (let i = 0; i < nrItems; i++) {
        const card = elCreateEmpty('div', {"data-contextmenu": "album", "class": ["card", "card-grid", "clickable"]});
        const image = obj.result.data[i].ImageSmall;
        card.appendChild(
            elCreateEmpty('div', {"class": ["card-body", "album-cover-loading", "album-cover-grid", "d-flex"]})
        );
        const taglist = [
            pEl.gridSelectBtn.cloneNode(true)
        ];
        for (const tag of ['Album', 'AlbumArtist']) {
            taglist.push(
                elCreateNode((tag === 'Album' ? 'span' : 'small'), {"class": ["d-block"]},
                    printValue(tag, obj.result.data[i][tag])
                )
            );
        }
        card.appendChild(
            elCreateNodes('div', {"class": ["card-footer", "card-footer-grid", "p-2"],
                "title": obj.result.data[i][tagAlbumArtist] + ': ' + obj.result.data[i].Album}, taglist)
        );
        setData(card, 'image', image);
        setData(card, 'uri', obj.result.data[i].uri);
        setData(card, 'type', 'album'); // TODO obj.result.data[i].Type
        setData(card, 'name', obj.result.data[i].Album);
        setData(card, 'Album', obj.result.data[i].Album);
        setData(card, tagAlbumArtist, obj.result.data[i][tagAlbumArtist]);
        setData(card, 'AlbumId', obj.result.data[i].AlbumId);
        addQobuzAlbumPlayButton(card.firstChild);
        addAlbumFavoriteButton(card.firstChild);
        const col = elCreateNode('div', {"class": ["col", "px-0", "mb-2", "flex-grow-0"]}, card);

        if (i < cols.length) {
            cols[i].replaceWith(col);
        }
        else {
            cardContainer.append(col);
        }

        if (userAgentData.hasIO === true) {
            const observer = new IntersectionObserver(setGridImage, {root: null, rootMargin: '0px'});
            observer.observe(col);
        }
        else {
            col.firstChild.firstChild.style.backgroundImage = getCssImageUri(image);
        }
    }
    //remove obsolete cards
    cols = cardContainer.querySelectorAll('.col');
    for (let i = cols.length - 1; i >= nrItems; i--) {
        cols[i].remove();
    }

    setPagination(obj.result.totalEntities, obj.result.returnedEntities);
    setScrollViewHeight(cardContainer);
    scrollToPosY(cardContainer.parentNode, app.current.scrollPos);
}

/**
 * Adds the Qobuz album play button
 * @param {ChildNode | HTMLElement} parentEl parent element for the button
 * @returns {void}
 */
function addQobuzAlbumPlayButton(parentEl) {
    // FIXME similar to addAlbumPlayButton and addRadioFavoritesPlayButton
    const playBtn = pEl.coverPlayBtn.cloneNode(true);
    parentEl.appendChild(playBtn);
    playBtn.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        // clickQuickPlay(event.target);
        // console.log("🚀 ~ playBtn.addEventListener ~ event.target:", event.target)
        const type = getData(event.target.parentNode.parentNode, 'type');
        // console.log("🚀 ~ playBtn.addEventListener ~ type:", type)
        const uri = type === 'album'
        ? getData(event.target.parentNode.parentNode, 'AlbumId')
        : getData(event.target.parentNode.parentNode, 'uri');
        // console.log("🚀 ~ playBtn.addEventListener ~ uri:", uri)
        // console.log('-----------call append--------------');
        // switch (settings.webuiSettings.clickQuickPlay) {}
        // FIXME replace and play for now
        // replacePlayQueue(type, [uri]);
        sendAPI("MYMPD_API_QOBUZ_QUEUE_REPLACE_ALBUMS", {
            // "albumids": [uri],
            "albumids": uri,
            "play": true
        }, console.log, true);
    }, false);
}
