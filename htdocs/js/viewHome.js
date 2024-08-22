"use strict";
// SPDX-License-Identifier: GPL-3.0-or-later
// myMPD (c) 2018-2024 Juergen Mang <mail@jcgames.de>
// https://github.com/jcorporation/mympd

/** @module viewHome_js */

/**
 * Handles home
 * @returns {void}
 */
function handleHome() {
    sendAPI("MYMPD_API_HOME_ICON_LIST", {}, parseHomeIcons, false);
}

/**
 * Initializes the home feature elements
 * @returns {void}
 */
function initViewHome() {
    dragAndDropGrid('HomeList');
}

/**
 * Moves a home icon
 * @param {number} oldPos Old icon pos
 * @param {number} newPos New icon pos
 * @returns {void}
 */
function homeMoveIcon(oldPos, newPos) {
    sendAPI("MYMPD_API_HOME_ICON_MOVE", {
        "from": oldPos,
        "to": newPos
    }, null, false);
}

/**
 * Click event handler for home icons
 * @param {MouseEvent} event click event
 * @param {HTMLElement} target calculated target
 * @returns {void}
 */
function viewHomeClickHandler(event, target) {
    if (event.target.classList.contains('card-body')) {
        showContextMenu(event);
        return;
    }
    const href = getData(target, 'href');
    if (href !== undefined) {
        parseCmd(event, href);
    }
}

/**
 * Returns the friendly type of the home icon
 * @param {string} cmd the command
 * @param {string} action action of the command
 * @returns {string} friendly type
 */
function getHomeIconType(cmd, action) {
    switch(cmd) {
        case 'appGoto':
        case 'execScriptFromOptions':
        case 'openExternalLink':
        case 'openModal':
            return typeFriendly[cmd];
        default:
            return typeFriendly[action];
    }
}

/**
 * Parses the MYMPD_API_HOME_ICON_LIST response
 * @param {object} obj jsonrpc response object
 * @returns {void}
 */
function parseHomeIcons(obj) {
    const cardContainer = elGetById('HomeList');
    unsetUpdateView(cardContainer);
    const cols = cardContainer.querySelectorAll('.col');
    if (cols.length === 0) {
        // remove warning messages
        elClear(cardContainer);
    }
    if (obj.result && obj.result.returnedEntities === 0) {
        elClear(cardContainer);
        const div = elCreateNodes('div', {"class": ["px-3", "py-1"]}, [
            elCreateTextTn('h3', {}, 'Homescreen'),
            elCreateNodes('p', {}, [
                document.createTextNode(tn('Homescreen welcome')),
                elCreateText('span', {"class": ["mi"]}, 'add_to_home_screen'),
                document.createTextNode(' '),
                elCreateText('span', {"class": ["mi"]}, 'library_add')
            ])
        ]);
        cardContainer.appendChild(div);
        return;
    }

    if (checkResult(obj, cardContainer, undefined) === false) {
        return;
    }

    for (let i = 0; i < obj.result.returnedEntities; i++) {
        const homeType = getHomeIconType(obj.result.data[i].cmd, obj.result.data[i].options[0]);
        const actionType = friendlyActions[obj.result.data[i].cmd];

        if (obj.result.data[i].cmd !== 'appGoto') {
            const opt0 = obj.result.data[i].options[0];
            const opt1 = [];
            // convert array to [opt0, [opt1,...]] and parse 
            if (obj.result.data[i].options[1] !== undefined) {
                for (let j = 1; j < obj.result.data[i].options.length; j++) {
                    opt1.push(convertType(obj.result.data[i].options[j]));
                }
            }
            obj.result.data[i].options = [opt0, opt1];
        }

        const col = elCreateEmpty('div', {"class": ["col", "px-0", "flex-grow-0"]});
        const card = elCreateEmpty('div', {"data-contextmenu": "home", "class": ["card", "home-icons"], "draggable": "true",
            "title": tn(homeType) + ':' + smallSpace + obj.result.data[i].name +
            '\n' + tn(actionType)});
        //decode json options
        for (let j = 0, k = obj.result.data[i].options.length; j < k; j++) {
            if (obj.result.data[i].options[j].indexOf('{"') === 0 ||
                obj.result.data[i].options[j].indexOf('["') === 0)
            {
                obj.result.data[i].options[j] = JSON.parse(obj.result.data[i].options[j]);
            }
        }

        setData(card, 'href', {"cmd": obj.result.data[i].cmd, "options": obj.result.data[i].options});
        setData(card, 'pos', i);
        const cardTitle = elCreateText('div', {"class": ["card-title", "mi", "rounded", "clickable"]}, obj.result.data[i].ligature);
        if (obj.result.data[i].image !== '') {
            cardTitle.style.backgroundImage = getCssImageUri(obj.result.data[i].image);
        }
        if (obj.result.data[i].bgcolor !== '') {
            cardTitle.style.backgroundColor = obj.result.data[i].bgcolor;
        }
        if (obj.result.data[i].color !== '' &&
            obj.result.data[i].color !== undefined)
        {
            cardTitle.style.color = obj.result.data[i].color;
        }
        card.appendChild(cardTitle);
        card.appendChild(
            elCreateText('div', {"class": ["card-body", "card-body-grid", "p-2", "clickable"]}, obj.result.data[i].name)
        );
        col.appendChild(card);
        if (i < cols.length) {
            cols[i].replaceWith(col);
        }
        else {
            cardContainer.append(col);
        }
    }
    for (let i = cols.length - 1; i >= obj.result.returnedEntities; i--) {
        cols[i].remove();
    }
    setScrollViewHeight(cardContainer);
}

/**
 * Executes the home icon action
 * @param {number} pos home icon position
 * @returns {void}
 */
//eslint-disable-next-line no-unused-vars
function executeHomeIcon(pos) {
    const el = elGetById('HomeList').children[pos].firstChild;
    parseCmd(null, getData(el, 'href'));
}
