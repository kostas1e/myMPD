"use strict";

function albumDetails(uri) {
    if (uri.startsWith("tidal://")) {
        sendAPI("MYMPD_API_TIDAL_ALBUMDETAILS", { "uri": uri }, parseTidalAlbumDetails);
    }
    modalAlbumDetails.show();
}

function parseTidalAlbumDetails(obj) {
    let modal = document.getElementById('modalAlbumDetails');
    let cover = obj.result.cover;
    if (cover) {
        cover = subdir + '/image/' + obj.result.cover.replace(/-/g, '/') + '/320x320.jpg';
    }
    else {
        image = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + cover + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.title;

    let albumDetails = '';
    albumDetails += '<tr><th>' + t('AlbumArtist') + '</th><td>' + obj.result.artist.name + '</td></tr>';
    albumDetails += '<tr><th>' + t('Date') + '</th><td>' + obj.result.releaseDate + '</td></tr>';
    albumDetails += '<tr><th>' + t('NumberOfTracks') + '</th><td>' + obj.result.numberOfTracks + '</td></tr>';
    albumDetails += '<tr><th>' + t('Duration') + '</th><td>' + beautifyDuration(obj.result.duration) + '</td></tr>';

    modal.getElementsByTagName('tbody')[0].innerHTML = albumDetails;
}
