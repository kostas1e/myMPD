//#include <stdio.h>
//#include <string.h>
//#include <unistd.h>
#include <stdlib.h>
#include <stdbool.h>

#include "../dist/src/sds/sds.h"
#include "../dist/src/frozen/frozen.h" // temp
#include "../sds_extras.h"
#include "../utility.h"
//#include "../log.h"
//#include "../list.h"
//#include "config_defs.h"

#include "tidal_utility.h"
#include "tidal_search.h"

//#include "../tidal.h" // tmp

static sds get_artist(sds buffer, const char *artist_id) {
    sds url = sdscatfmt(sdsempty(), "/artists/%s?", artist_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_artist_albums(sds buffer, const char *artist_id, const unsigned limit, const unsigned offset) {
    sds url = sdscatfmt(sdsempty(), "/artists/%s/albums?limit=%u&offset=%u", artist_id, limit, offset);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_artist_albums_ep_singles(sds buffer, const char *artist_id, const unsigned limit, const unsigned offset) {
    sds url = sdscatfmt(sdsempty(), "/artists/%s/albums?filter=EPSANDSINGLES&limit=%u&offset=%u", artist_id, limit, offset);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_artist_albums_other(sds buffer, const char *artist_id, const unsigned limit, const unsigned offset) {
    sds url = sdscatfmt(sdsempty(), "/artists/%s/albums?filter=COMPILATIONS&limit=%u&offset=%u", artist_id, limit, offset);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_artist_toptracks(sds buffer, const char *artist_id, const unsigned limit, const unsigned offset) {
    // items 50 per page
    sds url = sdscatfmt(sdsempty(), "/artists/%s/toptracks?limit=%u&offset=%u", artist_id, limit, offset);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_artist_bio(sds buffer, const char *artist_id) {
    // source lastUpdated text summary
    sds url = sdscatfmt(sdsempty(), "/artists/%s/bio?", artist_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_artist_radio(sds buffer, const char *artist_id) {
    // max items 100
    sds url = sdscatfmt(sdsempty(), "/artists/%s/radio?limit=100", artist_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_album(sds buffer, const char *album_id) {
    sds url = sdscatfmt(sdsempty(), "/albums/%s?", album_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_album_tracks(sds buffer, const char *album_id) {
    sds url = sdscatfmt(sdsempty(), "/albums/%s/tracks?", album_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_track(sds buffer, const char *track_id) {
    sds url = sdscatfmt(sdsempty(), "/tracks/%s?", track_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_track_radio(sds buffer, const char *track_id) {
    // max items 99
    sds url = sdscatfmt(sdsempty(), "/tracks/%s/radio?", track_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds parse_artist(sds buffer, sds res) {
    char *id = NULL;
    char *name = NULL;

    json_scanf(res, sdslen(res), "{id:%Q,name:%Q}", &id, &name);
    buffer = sdscat(buffer, "{");
    buffer = tojson_char(buffer, "Type", "artist", true);
    buffer = tojson_char(buffer, "id", id, true);
    sds uri = sdscatfmt(sdsempty(), "tidal://artist/%s", id);
    buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_char(buffer, "Artist", name, true);
    buffer = tojson_char(buffer, "Title", NULL, true);
    buffer = tojson_char(buffer, "Duration", NULL, true);
    buffer = tojson_char(buffer, "Track", NULL, true);
    buffer = tojson_char(buffer, "Album", NULL, true);
    buffer = tojson_char(buffer, "Date", NULL, false);
    buffer = sdscat(buffer, "}");

    sdsfree(uri);
    FREE_PTR(id);
    FREE_PTR(name);
    return buffer;
}

static sds parse_artists(sds buffer, sds res, unsigned *total) {
    sds path = sdsempty();
    int je = json_scanf(res, sdslen(res), "{totalNumberOfItems:%d}", total);
    if (je == 1) {
        path = sdscat(path, ".items");
    }
    else {
        json_scanf(res, sdslen(res), "{artists:{totalNumberOfItems:%d}}", total);
        path = sdscat(path, ".artists.items");
    }
    if (*total) {
        sds token = sdsempty();
        struct json_token item;
        for (int i = 0; json_scanf_array_elem(res, sdslen(res), path, i, &item) > 0; i++) {
            //sds token = sdscatlen(sdsempty(), item.ptr, item.len);
            sdsreplacelen(token, item.ptr, item.len);
            buffer = parse_artist(buffer, token);
            //sdsfree(token);
        }
        sdsrange(buffer, 0, -2);
        sdsfree(token);
    }
    sdsfree(path);
    return buffer;
}

static sds parse_album(sds buffer, sds res) {
    char *id = NULL;
    char *title = NULL;
    int duration;
    char *releasedate = NULL;
    sds artist0 = sdsempty();
    sds artists = sdsempty();

    json_scanf(res, sdslen(res), "{id:%Q,title:%Q,duration:%d,releaseDate:%Q}", &id, &title, &duration, &releasedate);
    struct json_token artist;
    for (int j = 0; json_scanf_array_elem(res, sdslen(res), ".artists", j, &artist) > 0; j++) {
        char *name = NULL;
        int je = json_scanf(artist.ptr, artist.len, "{name:%Q}", &name);
        if (je == 1 && sdslen(artists) > 0) {
            artists = sdscatfmt(artists, ", %s", name);
        }
        else {
            artist0 = sdscat(artist0, name);
            artists = sdscat(artists, name);
        }
        FREE_PTR(name);
    }
    buffer = sdscat(buffer, "{");
    buffer = tojson_char(buffer, "Type", "album", true);
    buffer = tojson_char(buffer, "id", id, true);
    sds uri = sdscatfmt(sdsempty(), "tidal://album/%s", id);
    buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_char(buffer, "Title", NULL, true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    buffer = tojson_char(buffer, "Track", NULL, true);
    buffer = tojson_char(buffer, "Artist", artist0, true);
    buffer = tojson_char(buffer, "Album", title, true);
    buffer = tojson_char(buffer, "Date", releasedate, false);
    buffer = sdscat(buffer, "}");

    sdsfree(uri);
    sdsfree(artist0);
    sdsfree(artists);
    FREE_PTR(id);
    FREE_PTR(title);
    FREE_PTR(releasedate);
    return buffer;
}

static sds parse_albums(sds buffer, sds res, unsigned *total) {
    sds path = sdsempty();
    int je = json_scanf(res, sdslen(res), "{totalNumberOfItems:%d}", total);
    if (je == 1) {
        path = sdscat(path, ".items");
    }
    else {
        json_scanf(res, sdslen(res), "{albums:{totalNumberOfItems:%d}}", total);
        path = sdscat(path, ".albums.items");
    }
    if (*total) {
        struct json_token item;
        for (int i = 0; json_scanf_array_elem(res, sdslen(res), path, i, &item) > 0; i++) {
            sds token = sdscatlen(sdsempty(), item.ptr, item.len);
            buffer = parse_album(buffer, token);
            sdsfree(token);
        }
        sdsrange(buffer, 0, -2);
    }
    sdsfree(path);
    return buffer;
}

static sds parse_track(sds buffer, sds res) {
    char *id = NULL;
    char *title = NULL;
    int duration;
    //bool streamready;
    int tracknumber;
    //int volumenumber;
    //int popularity;
    char *artist_name = NULL;
    char *artists_name = NULL;
    char *album_title = NULL;
    char *album_cover = NULL;
    char *album_releasedate = NULL;
    sds artist0 = sdsempty();
    sds artists = sdsempty();

    json_scanf(res, sdslen(res), "{id:%Q,title:%Q,duration:%d,trackNumber:%d,artist:{name:%Q},album:{title:%Q,releaseDate:%Q}}",
            &id, &title, &duration, &tracknumber, &artist_name, &album_title, &album_releasedate);
    struct json_token artist;
    for (int j = 0; json_scanf_array_elem(res, sdslen(res), ".artists", j, &artist) > 0; j++) {
        char *name = NULL;
        int je = json_scanf(artist.ptr, artist.len, "{name:%Q}", &name);
        if (je == 1 && sdslen(artists) > 0) {
            artists = sdscatfmt(artists, ", %s", name);
        }
        else {
            artist0 = sdscat(artist0, name);
            artists = sdscat(artists, name);
        }
        FREE_PTR(name);
    }
    buffer = sdscat(buffer, "{");
    buffer = tojson_char(buffer, "Type", "song", true);
    buffer = tojson_char(buffer, "id", id, true);
    sds uri = sdscatfmt(sdsempty(), "tidal://track/%s", id);
    buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_char(buffer, "Title", title, true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    buffer = tojson_long(buffer, "Track", tracknumber, true);
    buffer = tojson_char(buffer, "Artist", artist0, true);
    buffer = tojson_char(buffer, "Album", album_title, true);
    buffer = tojson_char(buffer, "Date", album_releasedate, false);
    buffer = sdscat(buffer, "}");

    sdsfree(uri);
    sdsfree(artist0);
    sdsfree(artists);
    FREE_PTR(id);
    FREE_PTR(title);
    FREE_PTR(artist_name);
    FREE_PTR(artists_name);
    FREE_PTR(album_title);
    FREE_PTR(album_cover);
    FREE_PTR(album_releasedate);
    return buffer;
}

static sds parse_tracks(sds buffer, sds res, unsigned *total) {
    sds path = sdsempty();
    int je = json_scanf(res, sdslen(res), "{totalNumberOfItems:%d}", total);
    if (je == 1) {
        path = sdscat(path, ".items");
    }
    else {
        json_scanf(res, sdslen(res), "{tracks:{totalNumberOfItems:%d}}", total);
        path = sdscat(path, ".tracks.items");
    }
    if (*total) {
        struct json_token item;
        for (int i = 0; json_scanf_array_elem(res, sdslen(res), path, i, &item) > 0; i++) {
            sds token = sdsnewlen(item.ptr, item.len); // change here
            buffer = parse_track(buffer, token);
            buffer = sdscat(buffer, ",");
            sdsfree(token); // change here
        }
        sdsrange(buffer, 0, -2);
    }
    sdsfree(path);
    return buffer;
}

static sds parse_tophit(sds buffer, sds res, unsigned *cnt) {
    char *value = NULL;
    char *type = NULL;
    int je = json_scanf(res, sdslen(res), "{topHit:{value:%Q,type:%Q}}", &value, &type);
    if (je == 2) {
        (*cnt)++;
        sds val = sdsnew(value);
        if (strcmp(type, "ARTISTS") == 0)
            buffer = parse_artist(buffer, val);
        else if (strcmp(type, "ALBUMS") == 0)
            buffer = parse_album(buffer, val);
        else if (strcmp(type, "TRACKS") == 0)
            buffer = parse_track(buffer, val);
        sdsfree(val);
    }
    FREE_PTR(value);
    FREE_PTR(type);
    return buffer;
}

sds tidal_search2(sds buffer, sds method, int request_id, const char *query,
        const char *type, const char *plist, const unsigned offset) {

    (void)(plist); // unused

    unsigned limit = 10;
    unsigned t1, t2, t3, t4, r1, r2, r3, r4;
    t1 = t2 = t3 = t4 = r1 = r2 = r3 = r4 = 0;
    
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",\"data\":[");
    sds res = sdsempty();
    if (strstr(query, "artist/")) {
        char *artist_id = extract_id(query);
        if (strstr(query, "/mix")) { // artist radio
            limit = 100;
            res = get_artist_radio(res, artist_id); // raw tracks
            buffer = parse_tracks(buffer, res, &t1);
            r1 = number_of_items(limit, offset, t1);
        }
        else {
            limit = 50;
            res = get_artist_toptracks(res, artist_id, limit, offset); // raw tracks
            buffer = parse_tracks(buffer, res, &t1);
            r1 = number_of_items(limit, offset, t1);
            res = sdscrop(res);
            res = get_artist_albums(res, artist_id, limit, offset); // raw albums
            sds albums = parse_albums(sdsempty(), res, &t2);
            r2 = number_of_items(limit, offset, t2);
            if (r2) {
                if (r1) {
                    buffer = sdscat(buffer, ",");
                }
                buffer = sdscatsds(buffer, albums);
            }
            res = sdscrop(res);
            res = get_artist_albums_ep_singles(res, artist_id, limit, offset); // raw albums
            albums = sdscrop(albums);
            albums = parse_albums(sdsempty(), res, &t3);
            r3 = number_of_items(limit, offset, t3);
            if (r3) {
                if (r2 || r1) {
                    buffer = sdscat(buffer, ",");
                }
                buffer = sdscatsds(buffer, albums);
            }
            res = sdscrop(res);
            res = get_artist_albums_other(res, artist_id, limit, offset); // raw albums
            albums = sdscrop(albums);
            albums = parse_albums(sdsempty(), res, &t4);
            r4 = number_of_items(limit, offset, t4);
            if (r4) {
                if (r3 || r2 || r1) {
                    buffer = sdscat(buffer, ",");
                }
                buffer = sdscatsds(buffer, albums);
            }
            sdsfree(albums);
        }
        FREE_PTR(artist_id);
    }
    else if (strstr(query, "album/")) {
        char *album_id = extract_id(query);
        res = get_album_tracks(res, album_id); // raw tracks
        buffer = parse_tracks(buffer, res, &t1);
        r1 = t1;
        limit = t1;
        FREE_PTR(album_id);
    }
    else if (strstr(query, "track/") && strstr(query, "/mix")) { // track radio
        char *track_id = extract_id(query);
        limit = 100;
        res = get_track_radio(res, track_id); // raw tracks
        buffer = parse_tracks(buffer, res, &t1);
        r1 = t1;
        FREE_PTR(track_id);
    }
    else {
        char *query_encoded = escape(query);
        if (query_encoded) {
            limit = 30;
            sds url = sdscatfmt(sdsempty(), "/search?query=%s&limit=%u&offset=%u", query_encoded, limit, offset);
            if (strcmp(type, "Artist") == 0)
                url = sdscat(url, "&types=ARTISTS");
            else if (strcmp(type, "Album") == 0)
                url = sdscat(url, "&types=ALBUMS");
            else if (strcmp(type, "Title") == 0)
                url = sdscat(url, "&types=TRACKS");
            else // "any" or incorrect type
                url = sdscat(url, "&types=ARTISTS,ALBUMS,TRACKS");
            url = sdscat(url, "&includeContributors=true");
            
            res = request(res, "GET", url); // raw items
            
            if (offset == 0 && (strcmp(type, "any") == 0))
                buffer = parse_tophit(buffer, res, &r1);
            sds items = parse_tracks(sdsempty(), res, &t2);
            r2 = number_of_items(limit, offset, t2);
            if (r2) {
                if (r1) {
                    buffer = sdscat(buffer, ",");
                }
                buffer = sdscatsds(buffer, items);
            }
            items = sdscrop(items);
            items = parse_artists(sdsempty(), res, &t3);
            r3 = number_of_items(limit, offset, t3);
            if (r3) {
                if (r2 || r1) {
                    buffer = sdscatlen(buffer, ",", 1);
                }
                buffer = sdscatsds(buffer, items);
            }
            items = sdscrop(items);
            items = parse_albums(sdsempty(), res, &t4);
            r4 = number_of_items(limit, offset, t4);
            if (r4) {
                if (r3 || r2 || r1) {
                    buffer = sdscatlen(buffer, ",", 1);
                }
                buffer = sdscatsds(buffer, items);
            }
            r1 = t1; // dont cnt tophit
            sdsfree(items);
            sdsfree(url);
        }
        FREE_PTR(query_encoded);
    }

    // max and sum differ when searching more than one types
    unsigned max_item_cnt = max_of_four(t1, t2, t3, t4);
    unsigned max_items_ret = max_of_four(r1, r2, r3, r4);
    unsigned sum_item_cnt = t1 + t2 + t3 + t4;
    unsigned sum_items_ret = r1 + r2 + r3 + r4;
    buffer = sdscatlen(buffer, "],", 2);
    buffer = tojson_char(buffer, "query", query, true); // searchstr
    buffer = tojson_long(buffer, "limit", limit, true);
    buffer = tojson_long(buffer, "offset", offset, true);
    buffer = tojson_long(buffer, "maxTotalItems", max_item_cnt, true); // maxTotalItems
    buffer = tojson_long(buffer, "maxReturnedItems", max_items_ret, true); // maxReturnedItems
    buffer = tojson_long(buffer, "sumTotalItems", sum_item_cnt, true); // sumTotalItems
    buffer = tojson_long(buffer, "sumReturnedItems", sum_items_ret, false); // sumReturnedItems
    buffer = jsonrpc_end_result(buffer);
    sdsfree(res);
    return buffer;
}
