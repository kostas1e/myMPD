"use strict";

/** @module Qobuz_js */

const favoriteIds = {
    albums: [],
    tracks: [],
    artists: [],
    articles: []
}

/**
 * Initialization function for the qobuz view
 * @returns {void}
 */
function initQobuz() {
    for (const nav of ['QobuzLibraryAlbumListTagDropdown', 'QobuzSearchNavDropdown', 'QobuzLibraryTrackListTagDropdown',
                    //    'QobuzSearch2AlbumListTagDropdown']) {
                         ]) {
        elGetById(nav).addEventListener('click', function (event) {
            navQobuzHandler(event);
        }, false);
    }
    // FIXME rm
    console.log('initQobuz qobuz_logged_in:', settings.qobuz_logged_in);
    // handle refresh
    if (settings.qobuz_logged_in === true) {
        getUserFavoriteIds();
        // TODO change active tab to library instead of login
    }
}

/**
 * Event handler for the navigation dropdown in the qobuz views
 * @param {event} event triggering event
 * @returns {void}
 */
function navQobuzHandler(event) {
    if (event.target.nodeName === 'BUTTON') {
        const tag = getData(event.target, 'tag');
        if (tag === 'Search') {
            appGoto('Qobuz', tag, undefined);
            return;
        }
        // if (tag === 'SearchAlbum') {
        //     appGoto('Qobuz', 'Search2', 'AlbumList');
        //     return;
        // }

        if (app.current.card === 'Qobuz' &&
            app.current.tab !== 'Library') {
            appGoto('Qobuz', 'Library', 'AlbumList');
            return;
        }

        if (tag === 'Log-out') {
            console.log('logout from nav handler');
            console.log('                    call logout here');
            qobuzLogout();
            return;
        }

        if (tag === 'Title') {
            // app.current.filter = tag;
            app.current.view = 'TrackList';
        }
        else if (tag === 'Album') {
            app.current.view = 'AlbumList';
        }
        else {
            logDebug('NYI');
            return;
        }
        appGoto(app.current.card, app.current.tab, app.current.view, 0, app.current.limit, tag);
    }
}

// gotoBrowse

// gotoBrowseAlbum

// gotoBrowseAlbumList

// gotoFilesystem

// gotoSearch

// setGridImage

// 

function qobuzLogout() {
    sendAPI("MYMPD_API_QOBUZ_LOGOUT", {}, logout, true);
}

function logout() {
    console.log('logout');
    // FIXME get
    settings.qobuz_logged_in = false;
    appGoto('Qobuz', 'Login');
}

function qobuzLogin(target) {
    console.log('qobuzLogin');
    // FIXME
    // cleanupModalId('tabQobuzLogin');
    // const params = {};
    // const defaultFields = {
    //     "email": {
    //         "defaultValue": "",
    //         "inputType": "text",
    //         "title": "Email",
    //         "form": "qobuzLoginFrm"
    //     }, 
    //     "password": {
    //         "defaultValue": "",
    //         "inputType": "passwrod",
    //         "title": "Password",
    //         "form": "qobuzLoginFrm"
    //     }
    // }
    // FIXME tabQobuzLogin
    // if (formToJson('qobuz', params, defaultFields) == true) {
    //     btnWaiting(target, true);
    //     sendAPI('MYMPD_API_IDEON_QOBUZ_LOGIN', params, login, true);
    // }

    let formOK = true;

    const email = elGetById('qobuzEmailInput'); // username
    const password = elGetById('qobuzPasswordInput');

    if (!validateNotBlank(email)) {
        formOK = false;
    }
    if (!validateNotBlank(password)) {
        formOK = false;
    }
    if (formOK === true) {
        // const params = JSON.stringify({ username: email.value, password: password.value })
        btnWaiting(target, true);
        const myString = 'Hello, "world"';
        const escapedString = JSON.stringify(myString);
        const jsonObject = { "escapedString": escapedString };
        console.log(jsonObject);
        sendAPI("MYMPD_API_QOBUZ_LOGIN", {
            "username": decode(encode(email.value)),
            "password": decode(encode(password.value))
            // "username": decode(email.value),
            // "password": decode(password.value)
            // "username": escapeString(email.value),
            // "password": escapeString(password.value)
        }, login, true);
    }

}
// function init(buffer) {
// 	data = JSON.parse(	
// 		buffer.toString('utf-8')
// 	);
// }
// export function clone(
// 	obj)
// {
// 	return JSON.parse(JSON.stringify(obj));
// }

function login(obj) {
    console.log('login', obj);

    // const modal = getOpenModal();
    // const modalId = modal.getAttribute('id');
    const spinnerEl = elGetById('tabQobuzLogin').querySelector('.spinner-border');
    if (spinnerEl) {
        btnWaiting(spinnerEl.parentNode, false);
    }
    if (obj.error) {
        // 
        settings.qobuz_logged_in = false;
        return false;
    }
    // no error
    settings.qobuz_logged_in = true;
    getUserFavoriteIds();
    appGoto('Qobuz', 'Library', 'AlbumList', 0, 25, 'any', undefined, 'Album', '', 0);
    return true;
    // if (obj.error) {
    //     if (highlightInvalidInput(modalId, obj) === false) {
    //         showModalAlert(obj);
    //     }
    //     return false;
    // }
    // // no error
    // if (close === true) {
    //     uiElements[modalId].hide();
    // }
    // return true;
}
// function showConfirm(text, btnText, callback) {
//     elGetById('modalConfirmText').textContent = text;
//     const yesBtn = elCreateText('button', {"id": "modalConfirmYesBtn", "class": ["btn", "btn-danger"]}, btnText);
//     yesBtn.addEventListener('click', function() {
//         if (callback !== undefined &&
//             typeof(callback) === 'function')
//         {
//             callback();
//         }
//         uiElements.modalConfirm.hide();
//     }, false);
//     elGetById('modalConfirmYesBtn').replaceWith(yesBtn);
//     uiElements.modalConfirm.show();
// }

function encode(val) {
    return JSON.stringify(val);
}

function decode(val) {
    if (typeof val === 'string') {
        return JSON.parse(val);
    }
}

function srcEscape(str) {
    return JSON.stringify({
        [str]: 1
    }).slice(1, -3);
}

function escapeString(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getUserFavoriteIds() {
    sendAPI("MYMPD_API_QOBUZ_FAVORITE_IDS", {}, function (obj) {
        favoriteIds.albums = obj.result.data.albums;
        favoriteIds.tracks = obj.result.data.tracks;
        favoriteIds.artists = obj.result.data.aritsts;
        favoriteIds.articles = obj.result.data.articles;
    }, true);
}

function handleQobuzLogin() {
    console.log('handling login ................ ', settings.qobuz_logged_in);
    // TODO use gotoQobuzAlbumList, or login~
    // appGoto('Qobuz', 'Library', 'AlbumList', 0, undefined, tag, 'Album', );
    // return
    if (settings.qobuz_logged_in === true) {
        // FIXME get favorite ids
        getUserFavoriteIds();
        appGoto('Qobuz', 'Library', 'AlbumList', 0, 25, undefined, undefined, 'Album', undefined, 0);
    }
}

function getId(qobuzScheme) {
    // FIXME
    if (qobuzScheme.startsWith("qobuz://track/") == false) {
        return
    }
    const id = qobuzScheme.split("/").pop();
    if (id) {
        return parseInt(id);
    }
}

function getEid(streamUrl) {
    // FIXME
    if (streamUrl.includes("streaming-qobuz-std.akamaized.net") == false) {
        return null;
    }
    const eid = streamUrl.match(/eid=(\d+)/)[1];
    if (eid) {
        return parseInt(eid);
    }
}

function addQobuzFavorite(name, uris) {
}

function toggleFavorite(target) {
    // const type = getData(target.parentNode.parentNode, 'type');
    // const uri = type === 'album'
    //     ? getData(target.parentNode.parentNode, 'AlbumId')
    //     : getData(target.parentNode.parentNode, 'uri');
    const uri = getData(target.parentNode.parentNode, 'uri');
    const itemId = getId(uri);
    // console.log("🚀 ~ toggleFavorite ~ itemId:", itemId)
    sendAPI("MYMPD_API_QOBUZ_FAVORITE_TOGGLE", {
        "type": "track",
        "item_id": itemId.toString()
    }, function (obj) {
        parseToggleFavorite(obj, target, itemId);
    // }, function (obj) {
    //     const status = obj.result.data.status;
    //     target.textContent = status ? 'favorite' : 'favorite_border';
    }, true);
}

function parseToggleFavorite(obj, target, itemId) {
    // console.log("🚀 ~ parseToggleFavorite ~ itemId:", itemId)
    // FIXME
    const status = obj.result.data.status;
    // TODO
    if (status === true) {
        favoriteIds.tracks.push(itemId);
    }
    else {
        favoriteIds.tracks = favoriteIds.tracks.filter(id => id !== itemId);
    }

    if (app.id === 'QobuzLibraryTrackList') {
        console.log('handle lib');
        handleQobuzLibraryTrackList();
    }
    else {
        console.log('search');
        target.textContent = status ? 'favorite' : 'favorite_border';
    }
}
