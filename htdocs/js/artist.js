"use strict";

function artistDetails(uri) {
    if (uri.includes("tidal")) {
        sendAPI("MYMPD_API_TIDAL_ARTISTDETAILS", {"uri": uri}, parseTidalArtistDetails);
    }
    else if (uri.includes("qobuz")) {
        sendAPI("MYMPD_API_QOBUZ_ARTISTDETAILS", {"uri": uri}, parseQobuzArtistDetails);
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
    // id name artistTypes url picture popularity
    // source lastUpdated text summary
    let bio = obj.result.bio;
    // let text = obj.result.bio.text; // cmp null
    if (bio.hasOwnProperty('text')) {
        bio.text = bio.text.replace(/\[.*?\]/g, '');
        bio.text = bio.text.replace(/<br\s*[\/]?>/gi, '\n');
        artistDetails += '<tr><td>' + bio.text + '</td></tr>';
        artistDetails += '<tr><th>' + t('Artist bio from ') + bio.source + '.</th></tr>';
    }
    modal.getElementsByTagName('tbody')[0].innerHTML = artistDetails;
}

function parseQobuzArtistDetails(obj) {
    let modal = document.getElementById('modalArtistDetails');
    let image = obj.result.image.large;
    if (image) {
        image = subdir + '/image/' + image.split('/').pop();
    }
    else {
        image = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + image + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.name;
    
    // summury plus read link

    let artistDetails = '';
    artistDetails += '<tr><th>' + t('Portrait') + '</th></tr>';
    artistDetails += '<tr><td>' + obj.result.biography.content + '</td></tr>';

    modal.getElementsByTagName('tbody')[0].innerHTML = artistDetails;
}

function artistRadio(uri) { // for tidal artist
    uri = uri.split('://').pop() + '/mix';
    searchTidal(uri);
}
