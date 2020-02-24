"use strict";

function albumDetails(uri) {
    if (uri.startsWith("tidal://")) {
        sendAPI("MYMPD_API_TIDAL_ALBUMDETAILS", {"uri": uri}, parseTidalAlbumDetails);
    }
    else if (uri.startsWith("qobuz://")) {
        sendAPI("MYMPD_API_QOBUZ_ALBUMDETAILS", {"uri": uri}, parseQobuzAlbumDetails);
    }
    modalAlbumDetails.show();
}

function parseTidalAlbumDetails(obj) {
    let modal = document.getElementById('modalAlbumDetails');
    let cover = obj.result.cover;
    if (cover) {
        // cover = subdir + '/image/' + obj.result.cover.replace(/-/g, '/') + '/320x320.jpg';
        // csp check
        // <img src="img_chania.jpg" alt="Chania"> 
        // cover = subdir + 'https://resources.tidal.com/images/cb23981d/e1f6/404f/9902/840a5ec20f59/80x80.jpg';
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

function parseQobuzAlbumDetails(obj) {
    let modal = document.getElementById('modalAlbumDetails');
    let image = obj.result.image.large;
    if (image) {
        image = subdir + '/image/' + image.split('/').pop();
    }
    else {
        image = subdir + '/assets/coverimage-notavailable.svg';
    }
    modal.getElementsByClassName('album-cover')[0].style.backgroundImage = 'url("' + image + '"), url("' + subdir + '/assets/coverimage-loading.svg")';
    modal.getElementsByTagName('h1')[0].innerText = obj.result.title;

    let albumDetails = '';
    albumDetails += '<tr><th>' + t('AlbumArtist') + '</th><td>' + obj.result.artist.name + '</td></tr>';
    albumDetails += '<tr><th>' + t('Date') + '</th><td>' + new Date(obj.result.released_at).toLocaleDateString() + '</td></tr>';
    albumDetails += '<tr><th>' + t('NumberOfTracks') + '</th><td>' + obj.result.tracks_count + '</td></tr>';
    albumDetails += '<tr><th>' + t('Duration') + '</th><td>' + beautifyDuration(obj.result.duration) + '</td></tr>';
    albumDetails += '<tr><th>' + t('Genre') + '</th><td>' + obj.result.genre.name + '</td></tr>';

    modal.getElementsByTagName('tbody')[0].innerHTML = albumDetails;
}
