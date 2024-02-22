"use strict";

/** @module viewQobuzSearch_js */

// TODO change tags to correct values, rm
const typeMapping = {
    any: "any",
    Album: "albums",
    Artist: "artists",
    Title: "tracks"
};
function getTypeFromFilter(filter) {
    return typeMapping[filter];
}


const lists = ['QobuzSearchList', 'QobuzSearchAlbumList'] // FIXME


/**
 * Handler for qobuz search
 * @returns {void}
 */
function handleQobuzSearch() {

    const l = app.current.filter === 'tracks' ? 'QobuzSearchList' : 'QobuzSearchAlbumList'

    // qobuzSearchPrepare
    // hide all lists except current
    lists.forEach(function (list) {
        if (list === l) {
            console.log('show');
            elShowId(list);
            setUpdateViewId(list); // this is done in appprepare
        }
        else {
            console.log('hide');
            elHideId(list);
        }
    })

    console.log('handleQobuzSearch()');
    console.log(app.id); // QobuzSearch
    // TODO login check
    const filter = app.current.filter;
    const callback = getQobuzSearchCallback(filter);
    // const list = getQobuzSearchList(filter);

    // handleSearchSimple('QobuzSearch');
    const searchStrEl = elGetById('QobuzSearchSearchStr');
    setFocus(searchStrEl);
    if (app.current.search === '') {
        searchStrEl.value = '';
    }
    selectTag('QobuzSearchSearchTags', 'QobuzSearchSearchTagsDesc', filter);

    if (searchStrEl.value.length >= 2) {
        sendAPI("MYMPD_API_QOBUZ_SEARCH", {
            "query": app.current.search,
            // "query": searchStrEl.value,
            "type": filter,
            "offset": app.current.offset,
            "limit": app.current.limit,
        }, callback, true);
        // }, parseQobuzSearch, true);
    }
    else {
        // clear list if no search is defined
        const SearchListEl = elGetById('QobuzSearchList');
        elClear(SearchListEl.querySelector('tbody'));
        elClear(SearchListEl.querySelector('tfoot'));
        // elDisableId('QobuzAddAllSongsBtn');
        // elDisableId('QobuzAddAllSongsDropdownBtn');
        unsetUpdateViewId('QobuzSearchList');
        setPagination(0, 0);
    }
}

function getQobuzSearchCallback(type) {
    switch (type) {
        case 'albums':
            return parseQobuzAlbumList;
        case 'tracks':
            return parseQobuzTrackList;
            // return parseQobuzSearch; // rename
        default:
            return null;
    }
}

// function getQobuzSearchList(type) {
//     return 'QobuzSearch' + type.charAt(0).toUpperCase() + type.slice(1, -1) + 'List';
// }




/**
 * Initialization function for the qobuz search elements
 * @returns {void}
 */
function initViewQobuzSearch() {
    elGetById('QobuzSearchList').addEventListener('click', function (event) {
        const target = tableClickHandler(event);
        if (target !== null) {
            clickSong(getData(target, 'uri'), event);
        }
    }, false);

    elGetById('QobuzSearchSearchTags').addEventListener('click', function (event) {
        if (event.target.nodeName === 'BUTTON') {
            app.current.filter = getData(event.target, 'tag');
            const search = elGetById('QobuzSearchSearchStr').value;
            appGoto('Qobuz', 'Search', app.current.view, 0, app.current.limit, app.current.filter, app.current.sort, app.current.tag, search, 0);
            console.log('\n\n\nshow table\n\n\n');
        }
    }, false);


    // TODO generic for all grid lists
    elGetById('QobuzSearchAlbumList').addEventListener('click', function(event) {
        const target = gridClickHandler(event);
        if (target !== null) {
            // FIXME we use tag to know where to return
            appGoto('Qobuz', 'AlbumDetail', undefined, 0, undefined, getData(target.parentNode, 'AlbumId'), undefined, 'Search');
        }
    }, false);

    initSearchSimple('QobuzSearch');
}

/**
 * Parses the MYMPD_API_QOBUZ_SEARCH jsonrpc response
 * @param {object} obj jsonrpc response
 * @returns {void}
 */
// function parseQobuzSearch(obj) {
//     // FIXME pass type and choose table or container

//     const filter = app.cards.Qobuz.tabs.Search.filter;




//     const table = elGetById('QobuzSearchList');
//     const tfoot = table.querySelector('tfoot');
//     elClear(tfoot);

//     if (checkResultId(obj, 'QobuzSearchList') === false) {
//         return;
//     }

//     // FIXME
//     // if (obj.result.returnedEntities > 0 && app.current.filter !== 'qobuz') {
//     //     elEnableId('QobuzAddAllSongsBtn');
//     //     elEnableId('QobuzAddAllSongsDropdownBtn');
//     // }
//     // else {
//     //     elDisableId('QobuzAddAllSongsBtn');
//     //     elDisableId('QobuzAddAllSongsDropdownBtn');
//     // }

//     const rowTitle = settingsWebuiFields.clickSong.validValues[settings.webuiSettings.clickSong];

//     // const cols = ['Title', 'Artist', 'Album', 'Fav', 'Duration', 'Action']
//     // const cols = ['Title', 'Artist', 'Album', 'Fav', 'Duration']
//     const cols = ['Title', 'Artist', 'Album', 'Duration']

//     updateTable(obj, 'QobuzSearch', function (row, data) {
//         setData(row, 'type', data.Type);
//         setData(row, 'uri', data.uri);
//         setData(row, 'name', data.Title);
//         row.setAttribute('tabindex', 0);
//         row.setAttribute('title', rowTitle);
//     }, function (row, data) {
//         // FIXME smallWidth
//         // const list = 'QobuzSearch';
//         // const cols = ['Title', 'Artist', 'Album', 'Fav', 'Duration', 'Action']
//         // for (let c = 0, d = settings['cols' + list].length; c < d; c++) {
//         //     row.appendChild(
//         //         elCreateNode('td', { "data-col": settings['cols' + list][c] },
//         //             printValue(settings['cols' + list][c], data[settings['cols' + list][c]])
//         //         )
//         //     );
//         // }
//         // TODO foreach
//         for (let c = 0; c < cols.length; c++) {
//             // if (cols[c] === 'Fav') {
//             //     // TODO extract to function
//             //     const favEl = pEl.favoriteBtn.cloneNode(true);
//             //     const trackId = getId(data.uri);
//             //     // if (favoriteIds.tracks.includes(trackId)) {
//             //     if (favoriteIds.tracks.indexOf(trackId) !== -1) {
//             //         favEl.textContent = 'favorite';
//             //     }
//             //     row.appendChild(
//             //         elCreateNode('td', { "data-col": cols[c] }, favEl)
//             //     );
//             //     continue;
//             // }
//             row.appendChild(
//                 elCreateNode('td', { "data-col": cols[c] },
//                     printValue(cols[c], data[cols[c]])
//                 )
//             );
//         }

//         // TODO function
//         const favEl = pEl.favoriteBtn.cloneNode(true);
//         const trackId = getId(data.uri);
//         // if (favoriteIds.tracks.includes(trackId)) {
//         if (favoriteIds.tracks.indexOf(trackId) !== -1) {
//             favEl.textContent = 'favorite';
//         }

//         row.appendChild(
//             elCreateNode('td', { "data-col": "Fav" }, favEl)
//         );

//         row.appendChild(
//             pEl.actionTd.cloneNode(true)
//         );
//     });

//     // FIXME
//     if (obj.result.totalEntities > 0) {
//         const colspan = cols.length + 2; // fav + action
//         tfoot.appendChild(
//             elCreateNode('tr', { "class": ["not-clickable"] },
//                 elCreateTextTnNr('td', { "colspan": colspan }, 'Num songs', obj.result.totalEntities)
//             )
//         );
//     }
// }

// viewSearch
// saveSearchAsSmartPlaylist
// addAllFromSearch
// showAddToPlaylistCurrentSearch
