#include "compile_time.h"
#include "src/ideon/qobuz.h"

#include <curl/curl.h>
#include <openssl/md5.h>
#include <openssl/evp.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#include "dist/mjson/mjson.h"
#include "dist/sds/sds.h"
#include "src/ideon.h" // FIXME temp needed for memory struct
#include "src/lib/jsonrpc.h"
#include "src/lib/log.h"
#include "src/lib/sds_extras.h"
#include "src/lib/validate.h"

// FIXME
#define QOBUZ_API "https://www.qobuz.com/api.json/0.2/"

static int curl_cleanup = 1;
static const char *qobuz_app_id;
static const char *qobuz_app_secret;
static const char *qobuz_username;
static const char *qobuz_password;
static int qobuz_format_id;
static sds cache_dir;
static CURL *qobuz_handle;
static struct memory_struct chunk;

static int user_id;
static char *user_auth_token = NULL;

//private definitions
static bool user_login(const char *username, const char *password);

static sds parse_tracks(sds buffer, sds res, unsigned *cnt, unsigned *ret);
static size_t write_memory_callback(void *contents, size_t size, size_t nmemb, void *userp);
char *calculateMD5(const char *input);

//public functions

// TODO write qobuz params to mpd config

bool qobuz_init(struct t_config *config) {
    qobuz_app_id = config->qobuz_app_id;
    qobuz_app_secret = config->qobuz_app_secret;
    qobuz_username = config->qobuz_username;
    qobuz_password = config->qobuz_password;
    // qobuz_format_id = config->qobuz_format_id;
    qobuz_format_id = 5;
    cache_dir = sdscatfmt(sdsempty(), "%s/covercache", config->cachedir); // FIXME covercache directory
    qobuz_handle = curl_easy_init();
    if (qobuz_handle) {
        curl_cleanup++;
        curl_easy_setopt(qobuz_handle, CURLOPT_WRITEFUNCTION, write_memory_callback);
        curl_easy_setopt(qobuz_handle, CURLOPT_WRITEDATA, &chunk);
        
        char *md5Result = calculateMD5(qobuz_password);

        user_login(qobuz_username, md5Result);
        free(md5Result);

        return true;
    }
    else { // NULL
        MYMPD_LOG_ERROR(NULL, "curl_easy_init");
        return false;
    }
}

static size_t write_memory_callback(void *contents, size_t size, size_t nmemb, void *userp) {
    // FIXME same in ideon.c, move this and memory_struct from ideon.h to utilities
    size_t realsize = size * nmemb;
    struct memory_struct *mem = (struct memory_struct *)userp;

    char *ptr = realloc(mem->memory, mem->size + realsize + 1);
    if (ptr == NULL) {
        // out of memory
        MYMPD_LOG_ERROR(NULL, "not enough memory (realloc returned NULL)");
        return 0;
    }

    mem->memory = ptr;
    memcpy(&(mem->memory[mem->size]), contents, realsize);
    mem->size += realsize;
    mem->memory[mem->size] = 0;

    return realsize;
}

void qobuz_cleanup(void) {
    free(user_auth_token); // FIXME
    if (curl_cleanup--)
        curl_easy_cleanup(qobuz_handle);
    sdsfree(cache_dir);
}

sds qobuz_track_search(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, const char *query, unsigned offset, unsigned limit) {
    // GET track/search
    // FIXME wrapper for catalog/search w/ type=tracks
    // vs mympd_addpi_search_songs in search.c
    MYMPD_LOG_WARN(NULL, "qobuz track search off %u lim %u", offset, limit);
    // buffer = qobuz_catalog_search(buffer, cmd_id, request_id, query, "Any", NULL, 0);

    unsigned total = 0; // entity_count
    unsigned items = 0; // entities_returned

    chunk.memory = malloc(1);
    chunk.size = 0;

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscat(buffer, "\"data\":[");
    
    // FIXME use existing handler
    CURL *hnd = curl_easy_init();
    char *query_encoded = curl_easy_escape(hnd, query, (int)strlen(query));
    if (query_encoded) {
        curl_easy_setopt(hnd, CURLOPT_HTTPGET, 1L);
        sds url = sdscatfmt(sdsnew(QOBUZ_API), "track/search?query=%s&offset=%u&limit=%u", query_encoded, offset, limit);
        curl_easy_setopt(hnd, CURLOPT_URL, url);
        struct curl_slist *headers = NULL;
        sds x_app_id = sdscatfmt(sdsempty(), "x-app-id: %s", qobuz_app_id);
        headers = curl_slist_append(headers, x_app_id);
        sds x_user_auth_token = sdscatfmt(sdsempty(), "x-user-auth-token: %s", user_auth_token);
        headers = curl_slist_append(headers, x_user_auth_token);
        curl_easy_setopt(hnd, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(hnd, CURLOPT_WRITEFUNCTION, write_memory_callback);
        curl_easy_setopt(hnd, CURLOPT_WRITEDATA, &chunk);
        CURLcode ret = curl_easy_perform(hnd);
        curl_slist_free_all(headers);

        sds res = sdsempty();
        if (ret != CURLE_OK) {
            MYMPD_LOG_ERROR(NULL, "curl_easy_perform() failed: %s\n", curl_easy_strerror(ret));
        }
        else {
            MYMPD_LOG_INFO(NULL, "%lu bytes retrieved\n%s", (unsigned long)chunk.size, chunk.memory);
            res = sds_replacelen(res, chunk.memory, chunk.size);
        }

        // FIXME only when curl ok
        buffer = parse_tracks(buffer, res, &total, &items);

        FREE_SDS(res);
        // TODO move outside of the block
        free(chunk.memory);
        curl_free(query_encoded);
        FREE_SDS(url);
        FREE_SDS(x_app_id);
        FREE_SDS(x_user_auth_token);
    }
    else {
        MYMPD_LOG_ERROR(NULL, "curl_easy_escape failed");
    }
    buffer = sdscatlen(buffer, "],", 2);
    // 
    buffer = tojson_long(buffer, "totalEntities", total, true);
    buffer = tojson_long(buffer, "offset", offset, true);
    buffer = tojson_long(buffer, "returnedEntities", items, true);
    buffer = tojson_char(buffer, "query", query, false);
    buffer = jsonrpc_end(buffer);

    curl_easy_cleanup(hnd);

    return buffer;
}

sds qobuz_track_get_list(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, struct t_list *tracks_id) {
    // POST track/getList
    sds json = sdsnew("{\"tracks_id\":[");
    
    struct t_list_node *current = tracks_id->head;
    int i = 0;
    // FIXME use shift
    while (current != NULL) {
        if (i++) {
            json = sdscatlen(json, ",", 1);
        }
        json = sdscatfmt(json, "%U", (unsigned)current->value_i);
        current = current->next;
    }
    json = sdscatlen(json, "]}", 2);

    unsigned total = 0; // entity_count
    unsigned items = 0; // entities_returned

    chunk.memory = malloc(1);
    chunk.size = 0;

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscat(buffer, "\"data\":[");

    /* send an application/json POST */
    CURL *curl = curl_easy_init();
    if(curl) {
        struct curl_slist *slist1 = NULL;
        slist1 = curl_slist_append(slist1, "Content-Type: application/json");
        slist1 = curl_slist_append(slist1, "Accept: application/json");

        sds x_app_id = sdscatfmt(sdsempty(), "x-app-id: %s", qobuz_app_id);
        slist1 = curl_slist_append(slist1, x_app_id);
        sds x_user_auth_token = sdscatfmt(sdsempty(), "x-user-auth-token: %s", user_auth_token);
        slist1 = curl_slist_append(slist1, x_user_auth_token);
        /* set custom headers */
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, slist1);

        sds url = sdscatfmt(sdsnew(QOBUZ_API), "track/getList");
        curl_easy_setopt(curl, CURLOPT_URL, url);

        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_memory_callback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &chunk);

        curl_easy_setopt(curl, CURLOPT_POST, 1L);
        /* pass in a pointer to the data - libcurl does not copy */
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json);

        CURLcode ret = curl_easy_perform(curl);

        curl_slist_free_all(slist1);

        sds res = sdsempty();
        if (ret != CURLE_OK) {
            MYMPD_LOG_ERROR(NULL, "curl_easy_perform() failed: %s\n", curl_easy_strerror(ret));
        }
        else {
            MYMPD_LOG_INFO(NULL, "%lu bytes retrieved\n%s", (unsigned long)chunk.size, chunk.memory);
            res = sds_replacelen(res, chunk.memory, chunk.size);
        }

        // FIXME only when curl ok
        buffer = parse_tracks(buffer, res, &total, &items);
        
        FREE_SDS(res);
        FREE_SDS(url);
        FREE_SDS(x_app_id);
        FREE_SDS(x_user_auth_token);
    }

    free(chunk.memory);

    buffer = sdscatlen(buffer, "],", 2);
    buffer = tojson_long(buffer, "totalEntities", total, true);
    buffer = tojson_long(buffer, "offset", 0, true);
    buffer = tojson_long(buffer, "returnedEntities", items, true);
    buffer = tojson_char(buffer, "json", json, false);
    buffer = jsonrpc_end(buffer);

    curl_easy_cleanup(curl);

    FREE_SDS(json);

    return buffer;
}

//private functions

char* calculateMD5(const char *input) {
    // FIXME
    EVP_MD_CTX *mdctx;
    const EVP_MD *md;
    unsigned char md5sum[EVP_MAX_MD_SIZE];

    OpenSSL_add_all_digests();
    md = EVP_get_digestbyname("md5");
    mdctx = EVP_MD_CTX_new();
    EVP_DigestInit_ex(mdctx, md, NULL);
    EVP_DigestUpdate(mdctx, input, strlen(input));
    EVP_DigestFinal_ex(mdctx, md5sum, NULL);
    EVP_MD_CTX_free(mdctx);

    // Allocate memory for the hexadecimal representation of the MD5 hash
    char *md5String = (char *)malloc((size_t)(2 * EVP_MD_size(md) + 1));

    // Convert the binary MD5 hash to a hexadecimal string
    for (int i = 0; i < EVP_MD_size(md); i++) {
        sprintf(&md5String[i * 2], "%02x", md5sum[i]);
    }

    // Null-terminate the string
    md5String[2 * EVP_MD_size(md)] = '\0';

    return md5String;
}

static bool user_login(const char *username, const char *password) {
    // TODO: use oauth2
    // GET user/login

    // params
    // app_id - required
    // username - required
    // password - required md5 hash
    // device_manufacturer_id opt
    // device_model
    // device_os_version
    // email
    // extra
    // facebook_access_token
    // facebook_access_token_expired
    // facebook_user_id
    // session_id
    // 
    // ok 200
    // error 400 invalid or missing app_id parameter
    // error 401 invalid username/email and password combination
    chunk.memory = malloc(1);
    chunk.size = 0;

    if (username == NULL || password == NULL || username[0] == '\0' || password[0] == '\0') {
        MYMPD_LOG_WARN(NULL, "empty user/pass");
        return false;
    }

    char *username_encoded = curl_easy_escape(qobuz_handle, username, (int)strlen(username));

    struct t_jsonrpc_parse_error parse_error;
    jsonrpc_parse_error_init(&parse_error);

    // FIXME generate unique for first login
    // query parameters
    sds params = sdscatfmt(sdsempty(), "?username=%s&password=%s", username_encoded, password);
    // dmi 6922031-0352-59D3-ADA2-B8E98226E8F0
    // data = sdscat(data, "&device_manufacturer_id=16922031-0352-59D3-ADA2-B8E48246E8F0");

    sds url = sdscat(sdsnew(QOBUZ_API), "user/login");
    url = sdscatsds(url, params);

    curl_easy_setopt(qobuz_handle, CURLOPT_HTTPGET, 1L);
    curl_easy_setopt(qobuz_handle, CURLOPT_URL, url);

    struct curl_slist *headers = NULL;
    sds h = sdscat(sdsnew("x-app-id: "), qobuz_app_id); // FIXME
    headers = curl_slist_append(headers, h);
    sdsfree(h);
    curl_easy_setopt(qobuz_handle, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(qobuz_handle);
    curl_slist_free_all(headers);
    
    sdsfree(params); // FIXME change to FREE_SDS from sds_extras.h move up
    sdsfree(url);
    if (res != CURLE_OK) {
        MYMPD_LOG_ERROR(NULL, "curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        free(chunk.memory);
        return false;
    }
    // FIXME block based on status code of http request
    else { // 0
        // FIXME use vcb in_name, is_alnum, pass empty/none
        // TODO use enums for limits
        // TODO check the response code of curl instead to verify success or failure
        sds cm = sdsnew(chunk.memory);
        // TODO free chunk memory here
        if (json_get_string(cm, "$.user_auth_token", 1, 200, &user_auth_token, vcb_isalnum, &parse_error) == true &&
            json_get_int_max(cm, "$.user.id", &user_id, NULL) == true) {
            // FIXME change user id to uint max
            MYMPD_LOG_INFO(NULL, "login successful");
            free(chunk.memory);
            FREE_SDS(cm);
            return true;
        }
        else {
            // status code message
            sds message = NULL;
            // FIXME if else
            json_get_string(cm, "$.message", 1, 200, &message, vcb_istext, &parse_error);
            MYMPD_LOG_ERROR(NULL, "%s", message);
            FREE_SDS(message);
            free(chunk.memory);
            FREE_SDS(cm);
            return false;
        }
    }
}

static sds parse_track(sds buffer, sds res) {
    // artist album
    //int maximum_channel_count;
    sds album_genre_name = NULL;
    sds album_image_large = NULL;
    long int album_released_at;
    sds album_title = NULL;
    sds album_artist_name = NULL;
    //float maximum_sampling_rate;
    int track_number;
    //char *id = NULL;
    long id;
    //int maximum_bit_depth;
    // sds composer_name = NULL;
    // char *performers = NULL;
    int duration;
    sds title = NULL;
    // sds performer_name = NULL;
    //bool streamable;
    // hires hires_streamable
    // sds artist_name = NULL;

    json_get_int_max(res, "$.track_number", &track_number, NULL);
    json_get_long_max(res, "$.id", &id, NULL);
    json_get_int_max(res, "$.duration", &duration, NULL);
    json_get_string(res, "$.title", 0, 100, &title, vcb_istext, NULL);
    // json_get_string(res, "$.composer.name", 0, 100, &composer_name, vcb_istext, NULL);
    // json_get_string(res, "$.performer.name", 0, 100, &performer_name, vcb_istext, NULL);
    // json_get_string(res, "$.artist.name", 0, 100, &artist_name, vcb_istext, NULL);

    json_get_string(res, "$.album.genre.name", 0, 100, &album_genre_name, vcb_istext, NULL);
    json_get_string(res, "$.album.image.large", 0, 100, &album_image_large, vcb_istext, NULL);
    json_get_long_max(res, "$.album.released_at", &album_released_at, NULL);
    json_get_string(res, "$.album.title", 0, 100, &album_title, vcb_istext, NULL);
    json_get_string(res, "$.album.artist.name", 0, 100, &album_artist_name, vcb_istext, NULL);

    buffer = sdscatlen(buffer, "{", 1);
    buffer = tojson_char(buffer, "Type", "stream", true);
    sds uri = sdscatprintf(sdsempty(), "qobuz://track/%ld", id);
    buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    // if (artist_name)
    //     buffer = tojson_char(buffer, "Artist", artist_name, true);
    // else if (performer_name)
    //     buffer = tojson_char(buffer, "Artist", performer_name, true);
    // else if (album_artist_name)
    //     buffer = tojson_char(buffer, "Artist", album_artist_name, true);
    // FIXME check list_to_json_array and other sds functions
    buffer = sdscatfmt(buffer, "\"Artist\":[\"%S\"],", album_artist_name);
    buffer = tojson_char(buffer, "Album", album_title, true);
    // buffer = tojson_char(buffer, "AlbumArtist", album_artist_name, true);
    buffer = sdscatfmt(buffer, "\"AlbumArtist\":[\"%S\"],", album_artist_name);
    buffer = tojson_char(buffer, "Title", title, true);
    buffer = tojson_long(buffer, "Track", track_number, true);
    buffer = tojson_char(buffer, "Genre", album_genre_name, true);
    buffer = tojson_long(buffer, "Date", album_released_at, false);
    // buffer = tojson_char(buffer, "Composer", composer_name, true);
    // buffer = tojson_char(buffer, "Performer", performer_name, false);
    buffer = sdscatlen(buffer, "}", 1);

    FREE_SDS(uri);
    // FREE_SDS(artist_name);
    // FREE_SDS(performer_name);
    FREE_SDS(title);
    // FREE_SDS(composer_name);
    FREE_SDS(album_artist_name);
    FREE_SDS(album_title);
    FREE_SDS(album_image_large);
    FREE_SDS(album_genre_name);
    return buffer;
}

static sds parse_tracks(sds buffer, sds res, unsigned *cnt, unsigned *ret) {
    // FIXME
    struct t_jsonrpc_parse_error parse_error;
    jsonrpc_parse_error_init(&parse_error);
    unsigned limit = 0;
    unsigned total = 0;
    // json_scanf(res, sdslen(res), "{tracks:{limit:%d,total:%d}}", &limit, &total);
    // if (limit && total) {
    // FIXME get int or
    // TODO guard clause
    // TODO verify limit check
    json_get_uint_max(res, "$.tracks.limit", &limit, NULL);
    if (json_get_uint_max(res, "$.tracks.total", &total, NULL) == true && total) {
        (*cnt) += total;
        // struct json_token item;
        sds items = json_get_key_as_sds(res, "$.tracks.items");
        MYMPD_LOG_INFO(NULL, "%s", items);
        // if (strcmp("[]", items) == 0) {
        //     MYMPD_LOG_INFO(NULL, "[] = %s", items);
        // }
        // if (total == 0) {
        //     MYMPD_LOG_INFO(NULL, "%d", total);
        // }
        int koff, klen, voff, vlen, vtype, off;
        for (off = 0; (off = mjson_next(items, (int)sdslen(items), off, &koff, &klen, &voff, &vlen, &vtype)) != 0;) {
            if ((*ret)++) {
                buffer = sdscatlen(buffer, ",", 1);
            }
            sds token = sdsnewlen(items + voff, (size_t)vlen);
            buffer = parse_track(buffer, token);
            FREE_SDS(token);
        }
        FREE_SDS(items);
    }
    return buffer;
}

int extract_track_id(const char* uri) {
    // TODO chech sds lib

    const char* delimiter = "/";
    const char* last_delimiter = strrchr(uri, delimiter[0]);
    const char* track_id_str = last_delimiter + 1;
    int track_id = atoi(track_id_str);
    // unsigned int track_id = strtoul(track_id_str, NULL, 10);
    return track_id;
}

sds qobuz_track_get(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, const char *uri) {
    // GET track/get
    // FIXME pass track_id, change to unsinged

    int track_id = extract_track_id(uri);
    MYMPD_LOG_WARN(NULL, "GET track/get %s - %u", uri, track_id);
    
    chunk.memory = malloc(1);
    chunk.size = 0;

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    
    CURL *curl = curl_easy_init();
    curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
    sds url = sdscatfmt(sdsnew(QOBUZ_API), "track/get?track_id=%i", track_id);
    MYMPD_LOG_WARN(NULL, "url %s", url);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    struct curl_slist *headers = NULL;
    sds x_app_id = sdscatfmt(sdsempty(), "x-app-id: %s", qobuz_app_id);
    headers = curl_slist_append(headers, x_app_id);
    sds x_user_auth_token = sdscatfmt(sdsempty(), "x-user-auth-token: %s", user_auth_token);
    headers = curl_slist_append(headers, x_user_auth_token);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_memory_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &chunk);
    CURLcode ret = curl_easy_perform(curl);
    curl_slist_free_all(headers);

    sds res = sdsempty();
    if (ret != CURLE_OK) {
        MYMPD_LOG_ERROR(NULL, "curl_easy_perform() failed: %s\n", curl_easy_strerror(ret));
    }
    else {
        MYMPD_LOG_INFO(NULL, "%lu bytes retrieved\n%s", (unsigned long)chunk.size, chunk.memory);
        res = sds_replacelen(res, chunk.memory, chunk.size);
    }

    // FIXME only when curl ok

    sds tmp = parse_track(sdsempty(), res);
    sdsrange(tmp, 1, -2);
    buffer = sdscatsds(buffer, tmp);
    // buffer = sdscatlen(buffer, ",", 1);
    // buffer = tojson_char(buffer, "cover", album_image_large, false);
    buffer = jsonrpc_end(buffer);

    FREE_SDS(tmp);

    FREE_SDS(res);
    free(chunk.memory);
    FREE_SDS(url);
    FREE_SDS(x_app_id);
    FREE_SDS(x_user_auth_token);

    curl_easy_cleanup(curl);

    return buffer;
}
