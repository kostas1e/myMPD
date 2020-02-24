"use strict";

// mw/ utility/setPagination
function setTidalPagination(total, returned, limit = settings.maxElementsPerPage) {
    let cat = app.current.app + app.current.tab;
    let totalPages = Math.ceil(total / limit);
    if (totalPages === 0)
        totalPages = 1;
    let p = ['PaginationTop', 'PaginationBottom'];
    for (let i = 0; i < 2; i++) {
        document.getElementById(cat + p[i] + 'Page').innerText = (app.current.page / limit + 1) + ' / ' + totalPages;
        if (totalPages > 1) {
            document.getElementById(cat + p[i] + 'Page').removeAttribute('disabled');
            let pl = '';
            for (let j = 0; j < totalPages; j++) {
                pl += '<button data-page="' + (j * limit) + '" type="button" class="mr-1 mb-1 btn-sm btn btn-secondary">' +
                    (j + 1) + '</button>';
            }
            document.getElementById(cat + p[i] + 'Pages').innerHTML = pl;
            document.getElementById(cat + p[i] + 'Page').classList.remove('nodropdown');
        }
        else if (total === -1) {
            document.getElementById(cat + p[i] + 'Page').setAttribute('disabled', 'disabled');
            document.getElementById(cat + p[i] + 'Page').innerText = (app.current.page / limit + 1);
            document.getElementById(cat + p[i] + 'Page').classList.add('nodropdown');
        }
        else {
            document.getElementById(cat + p[i] + 'Page').setAttribute('disabled', 'disabled');
            document.getElementById(cat + p[i] + 'Page').classList.add('nodropdown');
        }
    
        if (total > app.current.page + limit || total === -1 && returned >= limit) {
            document.getElementById(cat + p[i] + 'Next').removeAttribute('disabled');
            document.getElementById(cat + p[i]).classList.remove('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.remove('hide');
        }
        else {
            document.getElementById(cat + p[i] + 'Next').setAttribute('disabled', 'disabled');
            document.getElementById(cat + p[i]).classList.add('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.add('hide');
        }
    
        if (app.current.page > 0) {
            document.getElementById(cat + p[i] + 'Prev').removeAttribute('disabled');
            document.getElementById(cat + p[i]).classList.remove('hide');
            document.getElementById(cat + 'ButtonsBottom').classList.remove('hide');
        } else {
            document.getElementById(cat + p[i] + 'Prev').setAttribute('disabled', 'disabled');
        }
    }
}
