"use strict";

function artistDetails(uri) {
    if (uri.startsWith("tidal://")) {
        sendAPI("MYMPD_API_TIDAL_ARTISTDETAILS", { "uri": uri }, parseTidalArtistDetails);
    }
    modalArtistDetails.show();
}

function parseTidalArtistDetails(obj) {
    let modal = document.getElementById('modalArtistDetails');
    let picture = obj.result.picture;
    if (picture) {
        picture = subdir + '/image/' + picture.replace(/-/g, '/') + '/320x320.jpg';
    }
    else {
        picture = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + picture + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.name;

    let artistDetails = '';
    artistDetails += '<tr><th>' + t('Biography') + '</th></tr>';
    let bio = obj.result.bio;
    if (bio.hasOwnProperty('text')) {
        bio.text = bio.text.replace(/\[.*?\]/g, '');
        bio.text = bio.text.replace(/<br\s*[\/]?>/gi, '\n');
        artistDetails += '<tr><td>' + bio.text + '</td></tr>';
        artistDetails += '<tr><th>' + t('Artist bio from ') + bio.source + '.</th></tr>';
    }

    modal.getElementsByTagName('tbody')[0].innerHTML = artistDetails;
}

function artistRadio(uri) { // tidal artist radio
    uri = uri.split('://').pop() + '/mix';
    searchTidal(uri);
}
