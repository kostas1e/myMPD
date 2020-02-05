#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <curl/curl.h>
#include <openssl/md5.h>

#include "../dist/src/frozen/frozen.h"
#include "../dist/src/sds/sds.h"
#include "list.h"
#include "config_defs.h"
#include "log.h"
#include "sds_extras.h"
#include "tidal.h"
#include "qobuz.h"
#include "utility.h"

#define QOBUZ_API "https://www.qobuz.com/api.json/0.2"

static int curl_cleanup = 1;
static int qobuz_app_id;
static const char *qobuz_app_secret;
static const char *qobuz_username;
static const char *qobuz_password;
static int qobuz_format_id;
static sds cache_dir;
static CURL *qobuzhandle;
static struct memory_struct chunk;
//static struct curl_slist *slist = NULL;
static int user_id;
static char *user_auth_token = NULL;

//private definitions
static bool user_login(const char *username, const char *password);
static sds api_request(sds buffer, sds uri);

static sds album_get(sds buffer,  const char *album_id, const char *extra, const int limit, const int offset);
static sds track_get(sds buffer, long track_id);
static sds artist_get(sds buffer, long artist_id, const char *extra, const int limit, const int offset);

static bool get_image(const char *image);
static sds get_id(const char *uri); // extract id from uri

static sds parse_album(sds buffer, sds res);
static sds parse_albums(sds buffer, sds res, unsigned *cnt, unsigned *ret);
static sds parse_track(sds buffer, sds res);
static sds parse_tracks(sds buffer, sds res, unsigned *cnt, unsigned *ret);
static sds parse_artist(sds buffer, sds res);
static sds parse_artists(sds buffer, sds res, unsigned *cnt, unsigned *ret);

//static int test(void);

//public functions
bool qobuz_init(t_config *config) {
    qobuz_app_id = config->qobuz_app_id;
    qobuz_app_secret = config->qobuz_app_secret;
    // hard code app id and secret
    qobuz_username = config->qobuz_username;
    qobuz_password = config->qobuz_password;
    qobuz_format_id = config->qobuz_format_id;
    cache_dir = sdscatfmt(sdsempty(), "%s/covercache", config->varlibdir);
    qobuzhandle = curl_easy_init();
    if (qobuzhandle) {
        curl_cleanup++;
        curl_easy_setopt(qobuzhandle, CURLOPT_WRITEFUNCTION, write_callback);
        curl_easy_setopt(qobuzhandle, CURLOPT_WRITEDATA, &chunk);
        
        user_login(qobuz_username, qobuz_password);
        //test();

        return true;
    }
    else { // NULL
        LOG_ERROR("curl_easy_init");
        return false;
    }
}

void qobuz_cleanup(void) {
    FREE_PTR(user_auth_token);
    if (curl_cleanup--)
        curl_easy_cleanup(qobuzhandle);
    sdsfree(cache_dir);
}

sds qobuz_catalog_search(sds buffer, sds method, int request_id, const char *query,
        const char *type, const char *plist, const unsigned int offset) {
    // parameters
    // app_id req
    // query req
    // type opt tracks albums artists articles playlists focus
    (void)(plist); // unused

    unsigned total = 0; // entity_count
    unsigned items = 0; // entities_returned
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",\"data\":[");

    artist_get(sdsempty(), 0, "", 50, 0);
    track_get(sdsempty(), 0);

    if (strstr(query, "artist/")) {
        sds id = get_id(query);
        long artist_id = atol(id);
        sds res = artist_get(sdsempty(), artist_id, "albums", 100, offset);
        buffer = parse_albums(buffer, res, &total, &items);
        sdsfree(res);
        sdsfree(id);
    }
    else if (strstr(query, "album/")) {
        sds album_id = get_id(query);
        sds res = album_get(sdsempty(), album_id, "", 50, offset);
        buffer = parse_tracks(buffer, res, &total, &items);
        sdsfree(res);
        sdsfree(album_id);
    }
    else {
        char *query_encoded = curl_easy_escape(qobuzhandle, query, strlen(query));
        if (query_encoded) {
            sds url = sdscatfmt(sdsempty(), "/catalog/search?query=%s&offset=%u&limit=100", query_encoded, offset);
            if (strcmp(type, "Artist") == 0)
                url = sdscat(url, "&type=artists");
            else if (strcmp(type, "Album") == 0)
                url = sdscat(url, "&type=albums");
            else if (strcmp(type, "Title") == 0)
                url = sdscat(url, "&type=tracks");

            // zone test
            //url = sdscat(url, "&zone=NL");
            
            sds res = api_request(sdsempty(), url);
            // check order form web
            buffer = parse_tracks(buffer, res, &total, &items);
            buffer = parse_artists(buffer, res, &total, &items);
            buffer = parse_albums(buffer, res, &total, &items);
            
            sdsfree(res);
            sdsfree(url);
            curl_free(query_encoded);
        }
        else { // NULL
            LOG_ERROR("curl_easy_escape failed");
        }
    }
    buffer = sdscat(buffer, "],");
    buffer = tojson_long(buffer, "totalEntities", total, true);
    buffer = tojson_long(buffer, "offset", offset, true);
    buffer = tojson_long(buffer, "returnedEntities", items, true);
    buffer = tojson_char(buffer, "searchstr", query, false);
    buffer = jsonrpc_end_result(buffer);
    return buffer;
}

sds qobuz_songdetails(sds buffer, sds method, int request_id, const char *uri) {
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",");
    sds id = get_id(uri);
    long track_id = atol(id);
    sds res = track_get(sdsempty(), track_id);
    char *album_image_large = NULL;
    json_scanf(res, sdslen(res), "{album:{image:{large:%Q}}}", &album_image_large);
    if (album_image_large)
        get_image(album_image_large);
    sds tmp = parse_track(sdsempty(), res); // parse ?
    sdsrange(tmp, 1, -2);
    buffer = sdscatsds(buffer, tmp);
    buffer = sdscatlen(buffer, ",", 1);
    buffer = tojson_char(buffer, "cover", album_image_large, false);
    buffer = jsonrpc_end_result(buffer);
    FREE_PTR(album_image_large);
    sdsfree(tmp);
    sdsfree(id);
    sdsfree(res);
    return buffer;
}

sds qobuz_albumdetails(sds buffer, sds method, int request_id, const char *uri) {
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",");

    sds id = get_id(uri);
    sds res = album_get(sdsempty(), id, "", 0, 0);
    char *image_large = NULL;
    json_scanf(res, sdslen(res), "{image:{large:%Q}}", &image_large);
    if (image_large)
        get_image(image_large);
    sdsrange(res, 1, -2);
    buffer = sdscatsds(buffer, res);
    buffer = jsonrpc_end_result(buffer);
    FREE_PTR(image_large);
    sdsfree(res);
    sdsfree(id);
    return buffer;
}

sds qobuz_artistdetails(sds buffer, sds method, int request_id, const char *uri) {
    // check uri for album or track id
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",");
    
    sds id = get_id(uri);
    long artist_id = atol(id);
    sds res = artist_get(sdsempty(), artist_id, "", 0, 0);
    char *image_large = NULL;
    json_scanf(res, sdslen(res), "{image:{large:%Q}}", &image_large);
    if (image_large)
        get_image(image_large);
    sdsrange(res, 1, -2);
    buffer = sdscatsds(buffer, res); // raw data parse front
    buffer = jsonrpc_end_result(buffer);
    FREE_PTR(image_large);
    sdsfree(res);
    sdsfree(id);
    return buffer;
}

sds qobuz_get_cover(const char *uri, sds cover) { // track uri
    sds id = get_id(uri);
    long track_id = atol(id);
    sds res = track_get(sdsempty(), track_id);
    // parse track
    char *album_image_large = NULL;
    json_scanf(res, sdslen(res), "{album:{image:{large:%Q}}}", &album_image_large);
    if (album_image_large) {
        get_image(album_image_large);
        int count;
        sds *tokens = sdssplitlen(album_image_large, strlen(album_image_large), "/", 1, &count);
        cover = sdscatfmt(cover, "/image/%s", tokens[count - 1]);
        sdsfreesplitres(tokens, count);
    }
    FREE_PTR(album_image_large);
    sdsfree(res);
    sdsfree(id);
    return cover;
}

//private functions
static bool user_login(const char *username, const char *password) {
    // params
    // app_id req
    // username req
    // email opt alt
    // password req md5
    // device_manufacturer_id opt
    chunk.memory = malloc(1);
    chunk.size = 0;

    sds url = sdscat(sdsnew(QOBUZ_API), "/user/login");
    curl_easy_setopt(qobuzhandle, CURLOPT_URL, url);
    sds data = sdscatfmt(sdsempty(), "app_id=%u&username=%s&password=%s", qobuz_app_id, username, password);
    // dmi
    data = sdscat(data, "&device_manufacturer_id=16922031-0352-59D3-ADA2-B8E48246E8F0");

    curl_easy_setopt(qobuzhandle, CURLOPT_POSTFIELDS, data);

    CURLcode res = curl_easy_perform(qobuzhandle);
    sdsfree(data);
    sdsfree(url);
    if (res != CURLE_OK) {
        LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        free(chunk.memory);
        return false;
    }
    else { // 0
        int je = json_scanf(chunk.memory, chunk.size, "{user_auth_token:%Q,user:{id:%d}}", &user_auth_token, &user_id);
        if (je == 2) {
            LOG_INFO("login successful");
            LOG_DEBUG(chunk.memory);
            free(chunk.memory);
            return true;
        }
        else {
            // status code message
            char *message = NULL;
            json_scanf(chunk.memory, chunk.size, "{message:%Q}", &message);
            LOG_ERROR(message);
            FREE_PTR(message);
            free(chunk.memory);
            return false;
        }
    }
}

static sds api_request(sds buffer, sds uri) { // add bool token param
    chunk.memory = malloc(1);
    chunk.size = 0;

    sds url = sdscatfmt(sdsnew(QOBUZ_API), "%s&app_id=%u", uri, qobuz_app_id);
    curl_easy_setopt(qobuzhandle, CURLOPT_URL, url);
    curl_easy_setopt(qobuzhandle, CURLOPT_POST, 0);
    // token opt plus headers
    // set x user auth token and x app id headers for server side caching
    
    CURLcode res = curl_easy_perform(qobuzhandle);
    LOG_DEBUG("URI %s", uri);
    if (res != CURLE_OK) {
        LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
    }
    else {
        buffer = sdscatlen(buffer, chunk.memory, chunk.size);
        LOG_INFO("%lu bytes retrieved", (unsigned long)chunk.size);
    }

    sdsfree(url);
    free(chunk.memory);
    return buffer;
}

static sds album_get(sds buffer, const char *album_id, const char *extra, const int limit, const int offset) {
    // streamable hires hires_streamable
    /* params
     * - app_id req
     * - album_id req
     * - extra opt (albumsFromSameArtist, focus, focusAll)
     * - limit opt (max tracks 1200)
     * - offset opt (0)
     */
    sds url = sdscatprintf(sdsempty(), "/album/get?album_id=%s&extra=%s&limit=%d&offset=%d", album_id, extra, limit, offset);
    buffer = api_request(buffer, url);
    sdsfree(url);
    return buffer;
}

static sds track_get(sds buffer, long track_id) {
    // streamable hires hires_streamable
    /* params
     * . app_id req
     * . track_id req
     */
    sds url = sdscatprintf(sdsempty(), "/track/get?track_id=%ld", track_id);
    buffer = api_request(buffer, url);
    sdsfree(url);
    return buffer;
}

static sds artist_get(sds buffer, long artist_id, const char *extra, const int limit, const int offset) {
    /* params
     * - app_id req
     * - artist_id req
     * - extra opt (albums)
     * Invalid argument: extra (accepted values are albums, tracks, playlists, tracks_appears_on, albums_with_last_release, focus, focusAll)
     * - limit opt (max albums def=25, max=500)
     * - offset opt (def=0)
     * - album_filter opt
     * - playlist_filter opt
     * - track_filter opt
     */
    sds url = sdscatprintf(sdsempty(), "/artist/get?artist_id=%ld&extra=%s&limit=%d&offset=%d", artist_id, extra, limit, offset);
    buffer = api_request(buffer, url);
    sdsfree(url);
    return buffer;
}

// artist_getsimilarartists
/*
sds tidal_get_cover(const char *uri, sds cover) { // track uri
    sds id = get_id(uri);

    sds res = get_track(sdsempty(), get_id(uri));
    // parse track
    char *c = NULL;
    json_scanf(res, sdslen(res), "{album:{cover:%Q}}", &c);
    if (c != NULL) {
        get_image(c);
        replacechar(c, '-', '/');
        cover = sdscatfmt(cover, "/image/%s/320x320.jpg", c);
    }
    FREE_PTR(c);
    sdsfree(res);
    sdsfree(id);
    return cover;
}
*/
static bool get_image(const char *image) { // check again
    int count;
    sds *tokens = sdssplitlen(image, strlen(image), "/", 1, &count);
    //char *c = strdup(cover);
    //replacechar(c, '-', '_');
    sds path = sdscatfmt(sdsnew(cache_dir), "/%s", tokens[count - 1]);
    FILE *file = fopen(path, "wbx");
    sdsfree(path);
    sdsfreesplitres(tokens, count);
    if (file == NULL) {
        perror("Error opening file");
        return false; // may exist
    }
    else {
        CURL *easyhandle = curl_easy_init();
        if (easyhandle) {
            //replacechar(c, '_', '/');
            //sds url = sdscatfmt(sdsnew(TIDAL_RESOURCES), "/%s/320x320.jpg", c);
            curl_easy_setopt(easyhandle, CURLOPT_URL, image);
            curl_easy_setopt(easyhandle, CURLOPT_WRITEFUNCTION, NULL);
            curl_easy_setopt(easyhandle, CURLOPT_WRITEDATA, file);
            CURLcode res = curl_easy_perform(easyhandle);
            if (res != CURLE_OK) {
                LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
                return false;
            }
            //sdsfree(url);
        }
        else {
            LOG_ERROR("curl_easy_init");
            return false;
        }
        fclose(file);
        return true;
    }
}

static sds get_id(const char *uri) {
    const char *sep = "/";
    int count, pos;
    sds *tokens = sdssplitlen(uri, strlen(uri), sep, 1, &count);
    pos = count -1;
    sds id = sdscpy(sdsempty(), tokens[pos]);
    sdsfreesplitres(tokens, count);
    return id;
}

static sds parse_album(sds buffer, sds res) {
    // parse artist
    int tracks_count;
    char *genre_name = NULL;
    //int maximum_channel_count;
    char *image_large = NULL;
    //float maximum_sampling_rate;
    char *id = NULL;
    //int maximum_bit_depth;
    char *title = NULL;
    long int released_at; // change to unsigned long parse front ?
    int duration;
    char *artist_name = NULL; // long artist_id ?
    //bool streamable;
    // hires hires_streamable
    
    json_scanf(res, sdslen(res), "{tracks_count:%d,genre:{name:%Q},image:{large:%Q},id:%Q,title:%Q,released_at:%lu,duration:%d,artist:{name:%Q}}",
        &tracks_count, &genre_name, &image_large, &id, &title, &released_at, &duration, &artist_name);
    
    buffer = sdscatlen(buffer, "{", 1);
    buffer = tojson_char(buffer, "Type", "album", true);
    sds uri = sdscatfmt(sdsempty(), "qobuz://album/%s", id);
    buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    buffer = tojson_char(buffer, "Artist", artist_name, true);
    buffer = tojson_char(buffer, "Album", title, true);
    buffer = tojson_char(buffer, "AlbumArtist", artist_name, true);
    buffer = tojson_char(buffer, "Title", NULL, true);
    buffer = tojson_char(buffer, "Track", NULL, true);
    buffer = tojson_char(buffer, "Genre", genre_name, true);
    buffer = tojson_long(buffer, "Date", released_at, true);
    buffer = tojson_char(buffer, "Composer", NULL, true);
    buffer = tojson_char(buffer, "Performer", NULL, false);
    buffer = sdscatlen(buffer, "}", 1);

    sdsfree(uri);
    FREE_PTR(artist_name);
    FREE_PTR(title);
    FREE_PTR(id);
    FREE_PTR(image_large);
    FREE_PTR(genre_name);
    return buffer;
}

static sds parse_albums(sds buffer, sds res, unsigned *cnt, unsigned *ret) {
    unsigned limit = 0;
    unsigned total = 0;
    json_scanf(res, sdslen(res), "{albums:{limit:%d,total:%d}}", &limit, &total);
    if (limit && total) {
        (*cnt) += total;
        struct json_token item;
        for (int i = 0; json_scanf_array_elem(res, sdslen(res), ".albums.items", i, &item) > 0; i++) {
            if ((*ret)++) {
                buffer = sdscatlen(buffer, ",", 1);
            }
            sds token = sdsnewlen(item.ptr, item.len);
            buffer = parse_album(buffer, token);
            sdsfree(token);
        }
    }
    return buffer;
}

static sds parse_track(sds buffer, sds res) {
    // artist album
    //int maximum_channel_count;
    char *album_genre_name = NULL;
    char *album_image_large = NULL;
    long int album_released_at;
    char *album_title = NULL;
    char *album_artist_name = NULL;
    //float maximum_sampling_rate;
    int track_number;
    //char *id = NULL;
    long id; // ?
    //int maximum_bit_depth;
    char *composer_name = NULL;
    // char *performers = NULL;
    int duration;
    char *title = NULL;
    char *performer_name = NULL;
    //bool streamable;
    // hires hires_streamable
    char *artist_name = NULL;

    json_scanf(res, sdslen(res), "{track_number:%d,id:%ld,duration:%d,title:%Q,composer:{name:%Q},performer:{name:%Q},artist:{name:%Q}}",
        &track_number, &id, &duration, &title, &composer_name, &performer_name, &artist_name);
    json_scanf(res, sdslen(res), "{album:{genre:{name:%Q},image:{large:%Q},released_at:%ld,title:%Q,artist:{name:%Q}}}",
        &album_genre_name, &album_image_large, &album_released_at, &album_title, &album_artist_name);
    
    buffer = sdscatlen(buffer, "{", 1);
    buffer = tojson_char(buffer, "Type", "song", true);
    sds uri = sdscatprintf(sdsempty(), "qobuz://track/%ld", id);
    buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    if (artist_name)
        buffer = tojson_char(buffer, "Artist", artist_name, true);
    else if (performer_name)
        buffer = tojson_char(buffer, "Artist", performer_name, true);
    else if (album_artist_name)
        buffer = tojson_char(buffer, "Artist", album_artist_name, true);
    buffer = tojson_char(buffer, "Album", album_title, true);
    buffer = tojson_char(buffer, "AlbumArtist", album_artist_name, true);
    buffer = tojson_char(buffer, "Title", title, true);
    buffer = tojson_long(buffer, "Track", track_number, true);
    buffer = tojson_char(buffer, "Genre", album_genre_name, true);
    buffer = tojson_long(buffer, "Date", album_released_at, true);
    buffer = tojson_char(buffer, "Composer", composer_name, true);
    buffer = tojson_char(buffer, "Performer", performer_name, false);
    buffer = sdscatlen(buffer, "}", 1);

    sdsfree(uri);
    FREE_PTR(artist_name);
    FREE_PTR(performer_name);
    FREE_PTR(title);
    FREE_PTR(composer_name);
    FREE_PTR(album_artist_name);
    FREE_PTR(album_title);
    FREE_PTR(album_image_large);
    FREE_PTR(album_genre_name);
    return buffer;
}

static sds parse_tracks(sds buffer, sds res, unsigned *cnt, unsigned *ret) {
    unsigned limit = 0;
    unsigned total = 0;
    json_scanf(res, sdslen(res), "{tracks:{limit:%d,total:%d}}", &limit, &total);
    if (limit && total) {
        (*cnt) += total;
        struct json_token item;
        for (int i = 0; json_scanf_array_elem(res, sdslen(res), ".tracks.items", i, &item) > 0; i++) {
            if ((*ret)++) {
                buffer = sdscatlen(buffer, ",", 1);
            }
            sds token = sdsnewlen(item.ptr, item.len);
            buffer = parse_track(buffer, token);
            sdsfree(token);
        }
    }
    return buffer;
}

static sds parse_artist(sds buffer, sds res) {
    long id;
    char *name = NULL;
    //char *picture = NULL;
    
    //json_scanf(res, sdslen(res), "{id:%ld,name:%Q,picture:%Q}", &id, &name, &picture);
    json_scanf(res, sdslen(res), "{id:%ld,name:%Q}", &id, &name);
    
    buffer = sdscatlen(buffer, "{", 1);
    buffer = tojson_char(buffer, "Type", "artist", true);
    sds uri = sdscatprintf(sdsempty(), "qobuz://artist/%ld", id);
    buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_char(buffer, "Duration", NULL, true);
    buffer = tojson_char(buffer, "Artist", name, true);
    buffer = tojson_char(buffer, "Album", NULL, true);
    buffer = tojson_char(buffer, "AlbumArtist", NULL, true);
    buffer = tojson_char(buffer, "Title", NULL, true);
    buffer = tojson_char(buffer, "Track", NULL, true);
    buffer = tojson_char(buffer, "Genre", NULL, true);
    buffer = tojson_char(buffer, "Date", NULL, true);
    buffer = tojson_char(buffer, "Composer", NULL, true);
    buffer = tojson_char(buffer, "Performer", NULL, false);
    buffer = sdscatlen(buffer, "}", 1);

    sdsfree(uri);
    //FREE_PTR(picture);
    FREE_PTR(name);
    return buffer;
}

static sds parse_artists(sds buffer, sds res, unsigned *cnt, unsigned *ret) {
    unsigned limit = 0;
    unsigned total = 0;
    //json_scanf(res, sdslen(res), "{.artists.total:%d}", &total);
    json_scanf(res, sdslen(res), "{artists:{limit:%d,total:%d}}", &limit, &total);
    if (limit && total) {
        (*cnt) += total;
        struct json_token item;
        for (int i = 0; json_scanf_array_elem(res, sdslen(res), ".artists.items", i, &item) > 0; i++) {
            if ((*ret)++) {
                buffer = sdscatlen(buffer, ",", 1);
            }
            sds token = sdsnewlen(item.ptr, item.len);
            buffer = parse_artist(buffer, token);
            sdsfree(token);
        }
    }
    return buffer;
}
/*
static void compute_md5(char *str, unsigned char digest[16]) {
    MD5_CTX ctx;
    MD5Init(&ctx);
    MD5Update(&ctx, str, strlen(str));
    MD5Final(digest, &ctx);
}
*/
/*
static int test(void) {
    printf("\ntesting...\n\n");
    sds s4 = sdsnew("e28e9f3d71d274a605693111477d4fe2");
    // 285473059
    // 47249d0eaefa6bf43a959c09aacdbce8
    // 854233864
    // 579169010
    // e28e9f3d71d274a605693111477d4fe2
    unsigned long request_ts = (unsigned long)time(NULL);
    sds url = sdsnew("https://www.qobuz.com/api.json/0.2/track/getFileUrl?track_id=6618815&app_id=579169010&format_id=5");
    sds sig = sdsnew("trackgetFileUrlformat_id5track_id6618815");
    sig = sdscatprintf(sig, "%lu", request_ts);
    //sig = sdscat(sig, qobuz_app_secret);
    sig = sdscat(sig, s4);
    //sds sig2 = (unsigned char)sdsnew(sig);
    //.MD5Context md5;
    //
    unsigned char digest[16]; // 32
    MD5_CTX md5;
    int init = MD5_Init(&md5);
    MD5_Update(&md5, sig, sdslen(sig));
    //unsigned char *out = MD5((unsigned char)sig, sdslen(sig), &md5);
    int final = MD5_Final(digest, &md5);

    char *out = (char*)malloc(33);
    for (int n = 0; n < 16; ++n) {
        //snprintf(&(out[n*2]), 16*2, "%02x", (unsigned int)digest[n]);
        snprintf(&(out[n*2]), 16*2, "%02x", (unsigned int)digest[n]);
    }



    //char *out = NULL;
    printf("init %d\nmd5 %s\nfinal %d\ndigest %s\n", init, out, final, digest);
    url = sdscatprintf(url, "&request_ts=%lu&request_sig=%s", request_ts, out); // digest io sig
    printf("url %s\n", url);

    chunk.memory = malloc(1);
    chunk.size = 0;

    //sds url = sdscatfmt(sdsnew(QOBUZ_API), "%s&app_id=%u", uri, qobuz_app_id);
    curl_easy_setopt(qobuzhandle, CURLOPT_URL, url);
    curl_easy_setopt(qobuzhandle, CURLOPT_POST, 0);
    // token opt plus headers
    // set x user auth token and x app id headers for server side caching
    sds buffer = sdsempty();
    CURLcode res = curl_easy_perform(qobuzhandle);
    LOG_DEBUG("URI %s", url);
    if (res != CURLE_OK) {
        LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
    }
    else {
        buffer = sdscatlen(buffer, chunk.memory, chunk.size);
        LOG_INFO("%lu bytes retrieved", (unsigned long)chunk.size);
        LOG_INFO(chunk.memory);
    }

    char *u = NULL;
    json_scanf(chunk.memory, chunk.size, "{url:%Q}", &u);
    printf("\n%s\n\n", chunk.memory);
    //replacechar(u, '\\', "");
    free(chunk.memory);
    chunk.memory = malloc(1);
    chunk.size = 0;
    curl_easy_setopt(qobuzhandle, CURLOPT_URL, url);
    printf("%s\n", chunk.memory);


    sdsfree(url);
    free(chunk.memory);




    return 1;
    //compute_md5()
}
*/
