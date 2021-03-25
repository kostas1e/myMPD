"use strict";

var currentTab;
var bgColor;

function checkInit() {
    if (settings.init !== true) {
        getServerinfo();

        document.getElementById('selectTheme1').innerHTML = document.getElementById('selectTheme').innerHTML;
        document.getElementById('selectTheme1').value = settings.theme;

        document.getElementById('selectTheme1').addEventListener('change', function (event) {
            const value = getSelectValue(event.target);
            if (value === 'theme-autodetect') {
                value = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-default';
            }

            Object.keys(themes).forEach(function (key) {
                if (key === value) {
                    domCache.body.classList.add(key);
                }
                else {
                    domCache.body.classList.remove(key);
                }
            });

            if (value === 'theme-default') {
                bgColor = '#aaaaaa';
            }
            else if (value === 'theme-light') {
                bgColor = '#ffffff';
            }
            else if (value === 'theme-dark') {
                bgColor = '#060708';
            }
            else if (value === 'theme-maroon') {
                bgColor = '#800000';
            }
            domCache.body.style.backgroundColor = bgColor;
        }, false);

        document.getElementById('selectNsType1').addEventListener('change', function () {
            let value = this.options[this.selectedIndex].value;
            if (value === '0') {
                document.getElementById('nsServerShare1').classList.add('hide');
                document.getElementById('sambaVersion1').classList.add('hide');
                document.getElementById('nsCredentials1').classList.add('hide');
                document.getElementById('inputNsServer1').value = '';
                document.getElementById('inputNsShare1').value = '';
                document.getElementById('inputNsUsername1').value = '';
                document.getElementById('inputNsPassword1').value = '';
            }
            else if (value === '2') {
                document.getElementById('nsServerShare1').classList.remove('hide');
                document.getElementById('sambaVersion1').classList.remove('hide');
                document.getElementById('nsCredentials1').classList.remove('hide');
            }
            else {
                document.getElementById('nsServerShare1').classList.remove('hide');
                if (value === '1') {
                    document.getElementById('sambaVersion1').classList.remove('hide');
                }
                else {
                    document.getElementById('sambaVersion1').classList.add('hide');
                }
                document.getElementById('nsCredentials1').classList.add('hide');
                document.getElementById('inputNsUsername1').value = '';
                document.getElementById('inputNsPassword1').value = '';
            }
        }, false);

        document.getElementById('btnDropdownServers1').parentNode.addEventListener('show.bs.dropdown', function () {
            sendAPI("MYMPD_API_NS_SERVER_LIST", {}, parseServers, true);
        });

        document.getElementById('dropdownServers1').children[0].addEventListener('click', function (event) {
            event.preventDefault();
            if (event.target.nodeName === 'A') {
                document.getElementById('inputNsServer1').value = event.target.getAttribute('data-value');
            }
        });

        currentTab = 0;
        showTab(currentTab);
        modalInit.show();
    }
}

function showTab(n) {
    let x = document.getElementsByClassName("tab");
    x[n].style.display = "block";
    if (n == 0) {
        document.getElementById("prevBtn").style.display = "none";
    } else {
        document.getElementById("prevBtn").style.display = "inline";
    }
    if (n == (x.length - 1)) {
        document.getElementById("nextBtn").innerHTML = "Submit";
    } else {
        document.getElementById("nextBtn").innerHTML = "Next";
    }
}

function nextPrev(n) {
    let x = document.getElementsByClassName("tab");
    if (n == 1 && currentTab == 1 && !validateForm()) {
        return;
    }
    x[currentTab].style.display = "none";
    currentTab = currentTab + n;
    if (currentTab >= x.length) {
        saveInitSettings();
        return;
    }
    showTab(currentTab);
}

function validateForm() {
    let formOK = true;

    let selectNsType = document.getElementById('selectNsType1');
    let selectNsTypeValue = selectNsType.options[selectNsType.selectedIndex].value;
    let inputNsServer = document.getElementById('inputNsServer1');
    let inputNsShare = document.getElementById('inputNsShare1');
    let inputNsUsername = document.getElementById('inputNsUsername1');
    let inputNsPassword = document.getElementById('inputNsPassword1');

    if (selectNsTypeValue !== '0') {
        if (!validateIPAddress(inputNsServer)) {
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

    return formOK;
}

function saveInitSettings() {
    // let selectLocale = document.getElementById('selectLocale1');
    let selectTheme = document.getElementById('selectTheme1');
    let selectNsType = document.getElementById('selectNsType1');
    let selectSambaVersion = document.getElementById('selectSambaVersion1');
    sendAPI("MYMPD_API_SETTINGS_SET", {
        // "locale": selectLocale.options[selectLocale.selectedIndex].value,
        "theme": selectTheme.options[selectTheme.selectedIndex].value,
        "bgColor": bgColor,
        "nsType": parseInt(selectNsType.options[selectNsType.selectedIndex].value),
        "nsServer": document.getElementById('inputNsServer1').value,
        "nsShare": document.getElementById('inputNsShare1').value,
        "sambaVersion": selectSambaVersion.options[selectSambaVersion.selectedIndex].value,
        "nsUsername": document.getElementById('inputNsUsername1').value,
        "nsPassword": document.getElementById('inputNsPassword1').value,
        "init": true
    }, getSettings);
    modalInit.hide();
}
