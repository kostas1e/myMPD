"use strict";

var currentTab;

function checkInit() {
    if (settings.init === false) {
        getServerinfo();

        document.getElementById('selectNsTypeInit').addEventListener('change', function () {
            let value = this.options[this.selectedIndex].value;
            if (value === '0') {
                document.getElementById('inputNsServerInit').setAttribute('disabled', 'disabled');
                document.getElementById('inputNsShareInit').setAttribute('disabled', 'disabled');
                document.getElementById('inputNsUsernameInit').setAttribute('disabled', 'disabled');
                document.getElementById('inputNsPasswordInit').setAttribute('disabled', 'disabled');
                document.getElementById('inputNsServerInit').value = '';
                document.getElementById('inputNsShareInit').value = '';
                document.getElementById('inputNsUsernameInit').value = '';
                document.getElementById('inputNsPasswordInit').value = '';
            }
            else if (value === '1') {
                document.getElementById('inputNsServerInit').removeAttribute('disabled');
                document.getElementById('inputNsShareInit').removeAttribute('disabled');
                document.getElementById('inputNsUsernameInit').setAttribute('readonly', 'readonly');
                document.getElementById('inputNsPasswordInit').setAttribute('readonly', 'readonly');
                document.getElementById('inputNsUsernameInit').value = 'guest';
                document.getElementById('inputNsPasswordInit').value = '';
            }
            else if (value === '2') {
                document.getElementById('inputNsServerInit').removeAttribute('disabled');
                document.getElementById('inputNsShareInit').removeAttribute('disabled');
                document.getElementById('inputNsUsernameInit').removeAttribute('readonly');
                document.getElementById('inputNsPasswordInit').removeAttribute('readonly');
                document.getElementById('inputNsUsernameInit').value = '';
            }
        });

        document.getElementById('selectLocaleInit').innerHTML = document.getElementById('selectLocale').innerHTML;

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

    let selectNsType = document.getElementById('selectNsTypeInit');
    let selectNsTypeValue = selectNsType.options[selectNsType.selectedIndex].value;
    let inputNsServer = document.getElementById('inputNsServerInit');
    let inputNsShare = document.getElementById('inputNsShareInit');
    let inputNsUsername = document.getElementById('inputNsUsernameInit');
    let inputNsPassword = document.getElementById('inputNsPasswordInit');

    if (selectNsTypeValue !== '0') {
        if (inputNsServer.value.indexOf('/') !== 0) {
            if (!validateHost(inputNsServer)) {
                formOK = false;
            }
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
    let selectLocale = document.getElementById('selectLocaleInit');
    let selectNsType = document.getElementById('selectNsTypeInit');
    sendAPI("MYMPD_API_SETTINGS_SET", {
        "locale": selectLocale.options[selectLocale.selectedIndex].value,
        "nsType": parseInt(selectNsType.options[selectNsType.selectedIndex].value),
        "nsServer": document.getElementById('inputNsServerInit').value,
        "nsShare": document.getElementById('inputNsShareInit').value,
        "nsUsername": document.getElementById('inputNsUsernameInit').value,
        "nsPassword": document.getElementById('inputNsPasswordInit').value,
        "init": true
    }, getSettings);
    modalInit.hide();
}
