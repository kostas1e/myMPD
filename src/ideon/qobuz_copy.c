#include "compile_time.h"
#include "src/ideon/qobuz.h"

#include "dist/mjson/mjson.h"
#include "dist/sds/sds.h"
#include "src/ideon/memory.h"
#include "src/lib/jsonrpc.h"
#include "src/lib/log.h"
#include "src/lib/sds_extras.h"
#include "src/lib/validate.h"

#include <openssl/evp.h>
#include <openssl/md5.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define API_URL "https://www.qobuz.com/api.json/0.2/"

static struct t_qobuz_client qobuz_client;

/**
 * Private definitions
 */

// FIXME
// sds qobuz_get_cover(const char *uri, sds cover) { // track uri
//     sds id = get_id(uri);
//     long track_id = atol(id);
//     sds res = track_get(sdsempty(), track_id);
//     // parse track
//     char *album_image_large = NULL;
//     json_scanf(res, sdslen(res), "{album:{image:{large:%Q}}}",
//     &album_image_large); if (album_image_large) {
//         get_image(album_image_large);
//         int count;
//         sds *tokens = sdssplitlen(album_image_large,
//         strlen(album_image_large), "/", 1, &count); cover = sdscatfmt(cover,
//         "/image/%s", tokens[count - 1]); sdsfreesplitres(tokens, count);
//     }
//     FREE_PTR(album_image_large);
//     sdsfree(res);
//     sdsfree(id);
//     return cover;
// }
// // fail silent with error log in be only, no image result
// static bool get_image(const char *image) { // check again
//     int count;
//     sds *tokens = sdssplitlen(image, strlen(image), "/", 1, &count);
//     //char *c = strdup(cover);
//     //replacechar(c, '-', '_');
//     sds path = sdscatfmt(sdsnew(cache_dir), "/%s", tokens[count - 1]);
//     FILE *file = fopen(path, "wbx");
//     sdsfree(path);
//     sdsfreesplitres(tokens, count);
//     if (file == NULL) {
//         perror("Error opening file");
//         return false; // may exist
//     }
//     else {
//         CURL *easyhandle = curl_easy_init();
//         if (easyhandle) {
//             //replacechar(c, '_', '/');
//             //sds url = sdscatfmt(sdsnew(TIDAL_RESOURCES), "/%s/320x320.jpg",
//             c); curl_easy_setopt(easyhandle, CURLOPT_URL, image);
//             curl_easy_setopt(easyhandle, CURLOPT_WRITEFUNCTION, NULL);
//             curl_easy_setopt(easyhandle, CURLOPT_WRITEDATA, file);
//             CURLcode res = curl_easy_perform(easyhandle);
//             if (res != CURLE_OK) {
//                 LOG_ERROR("curl_easy_perform() failed: %s\n",
//                 curl_easy_strerror(res)); return false;
//             }
//             //sdsfree(url);
//         }
//         else {
//             LOG_ERROR("curl_easy_init");
//             return false;
//         }
//         fclose(file);
//         return true;
//     }
// }

static sds album_get(const char *album_id) __attribute__((unused));
static sds build_request_sig(const char *object, const char *method,
                             const Parameter *parameters, size_t param_count,
                             time_t timestamp, const char *app_secret);
static sds build_url(const char *endpoint, const Parameter *params,
                     const size_t num_params);
static char *calculate_md5(const char *input);
static int compare_params(const void *p1, const void *p2);
static void parameter_free(Parameter *params, size_t num_params);
static sds parse_track(sds buffer, sds res);
static sds parse_tracks(sds buffer, sds res, unsigned *cnt, unsigned *ret);
static void print_headers(struct curl_slist *headers);
static void print_parameters(const Parameter *params,
                             size_t num_params) __attribute_maybe_unused__;
static sds request(const char *method, const char *url, const char *postdata);
static sds track_get(int track_id);
static sds track_get_file_url(int track_id, int format_id, const char *intent,
                              sds request_sig, long request_ts);
static sds track_get_list(struct t_list *tracks_id);
static sds track_search(const char* query, unsigned limit, unsigned offset);
static sds user_login(const char *username, const char *password);

static int extract_track_id(const char* uri);

/**
 * Public functions
 */

bool qobuz_user_login(const char *username, const char *password) {
    // escape user, pass is md5

    // TODO encode username, hash password, call user_login priv

    // use rc to clean once OR guard clauses
    // bool rc = false;

    // validate input
    // if (username == NULL || password == NULL || username[0] == '\0' ||
    // password[0] == '\0') {
    //     MYMPD_LOG_ERROR(NULL, "empty username or password");
    //     return NULL;
    // }

    // TODO to get device id required for streaming start/end
    // device_manufacturer_id=6922031-0352-59D3-ADA2-B8E98226E8F0
    
    // TODO rm should already be null from logout
    qobuz_client.user_auth_token = NULL;

    // FIXME headers qobuz_client.headers = temp
    curl_slist_free_all(qobuz_client.headers);
    qobuz_client.headers = NULL;
    sds header = sdsempty();
    // TODO check after append
    // headers = curl_slist_append(headers, "Content-Type: application/json");
    // headers = curl_slist_append(headers, "Accept: application/json");
    header = sdscatfmt(header, "x-app-id: %s", qobuz_client.app_id);
    qobuz_client.headers = curl_slist_append(qobuz_client.headers, header);

    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPHEADER,
                     qobuz_client.headers);

    sds username_encoded = sds_urlencode(sdsempty(), username, strlen(username));
    sds response = user_login(username_encoded, password);

    // parse response, set user auth token

    // return success/failure

    // struct t_jsonrpc_parse_error parse_error;
    // jsonrpc_parse_error_init(&parse_error);
    
    FREE_SDS(username_encoded);

    // FIXME block based on status code of http request
    // FIXME use vcb in_name, is_alnum, pass empty/none

    // TODO check the response code of curl instead to verify success or failure

    // if (res == CURLE_OK) {
    //     long response_code;
    //     curl_easy_getinfo(qobuz_client.curl_handle, CURLINFO_RESPONSE_CODE,
    //     &response_code); MYMPD_LOG_WARN(NULL, "%ld\n%s", response_code,
    //     chunk.memory);
    // if (response_code == 200) {
    //         // success
    //     }
    //     else if (response_code == 400 || response_code == 401) {
    //         //
    //     }
    //     else {
    //         //
    //     }
    // }
    if (json_get_string(response, "$.user_auth_token", 1, 100,
                        &qobuz_client.user_auth_token, vcb_isalnum,
                        NULL) == true) {
        MYMPD_LOG_INFO(NULL,
                       "login successful, appending x-user-auth-token header");
        sdsclear(header);
        header = sdscatfmt(header, "x-user-auth-token: %S",
                           qobuz_client.user_auth_token);
        qobuz_client.headers = curl_slist_append(qobuz_client.headers, header);
        curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPHEADER,
                         qobuz_client.headers);

        FREE_SDS(header);
        FREE_SDS(response);
        return true;
    } else {
        // status code message
        sds message = NULL;
        // FIXME if else, show error in frontend
        json_get_string(response, "$.message", 1, 100, &message, vcb_istext,
                        NULL);
        MYMPD_LOG_ERROR(NULL, "%s", message);

        FREE_SDS(header);
        FREE_SDS(message);
        FREE_SDS(response);
        return false;
    }
}

bool qobuz_init(struct t_config *config) {
    MYMPD_LOG_WARN(NULL, "qobuz_init");
    qobuz_client.app_id = config->qobuz_app_id;
    qobuz_client.app_secret = config->qobuz_app_secret;
    qobuz_client.username = config->qobuz_username; // plain
    qobuz_client.password = config->qobuz_password; // md5_hash
    // logged in
    qobuz_client.format_id = 27;                    // enum
    // cache_dir = sdscatfmt(sdsempty(), "%s/covercache", config->cachedir); //
    // FIXME covercache directory
    qobuz_client.user_auth_token = NULL;
    qobuz_client.curl_handle = curl_easy_init();
    if (qobuz_client.curl_handle == NULL) {
        MYMPD_LOG_ERROR(NULL, "curl_easy_init()");
        return false;
    }

    // const char* uri1 = "qobuz://track_id/12345";
    // int a = extract_track_id(uri1);
    // unsigned b = extract_track_id2(uri1);
    // MYMPD_LOG_WARN(NULL, "%d %u", a, b);

    qobuz_client.headers = NULL; // http

    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_USERAGENT,
                     "Ideon/0.2 libcurl");
    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_WRITEFUNCTION,
                     write_memory_callback);

    // TODO check state file and auto login if needed
    qobuz_user_login(qobuz_client.username, qobuz_client.password);

    return true;
}

void qobuz_cleanup(void) {
    FREE_SDS(qobuz_client.user_auth_token);
    // free cache dir
    curl_slist_free_all(qobuz_client.headers);
    if (qobuz_client.curl_handle != NULL) {
        curl_easy_cleanup(qobuz_client.curl_handle);
    }
}

// TODO return struct response rc,response_code,header,body

sds qobuz_search_tracks(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                       const char *query, unsigned limit, unsigned offset) {
    // FIXME wrapper for catalog/search w/ type=tracks
    // vs mympd_addpi_search_songs in search.c

    sds query_encoded = sds_urlencode(sdsempty(), query, strlen(query));
    sds response = track_search(query_encoded, limit, offset);

    unsigned total = 0;
    unsigned items = 0;

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscat(buffer, "\"data\":[");

    // jsonrpc_respond_message(buffer, cmd_id, request_id,
    //             JSONRPC_FACILITY_DATABASE, JSONRPC_SEVERITY_ERROR, "Error
    //             creating MPD search command");

    // FIXME only when curl ok
    buffer = parse_tracks(buffer, response, &total, &items);

    buffer = sdscatlen(buffer, "],", 2);
    buffer = tojson_long(buffer, "totalEntities", total, true);
    buffer = tojson_long(buffer, "offset", limit, true);
    buffer = tojson_long(buffer, "returnedEntities", items, true);
    buffer = tojson_char(buffer, "query", query, false); // expression
    buffer = jsonrpc_end(buffer);
    // items limit offset total

    FREE_SDS(response);
    FREE_SDS(query_encoded);

    return buffer;
}

static sds build_json(struct t_list *tracks_id) {
    // TODO change name
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
    return json;
}

sds qobuz_track_get_list(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                         struct t_list *tracks_id) {
    unsigned total = 0;
    unsigned items = 0;

    // FIXME empty sds or NULL for error ???
    sds response = track_get_list(tracks_id);

    // FIXME if res ok else error message
    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscat(buffer, "\"data\":[");

    //    sds res = sdsempty();
    //    if (ret != CURLE_OK) {
    //        MYMPD_LOG_ERROR(NULL, "curl_easy_perform() failed: %s\n",
    //        curl_easy_strerror(ret));
    //    }
    //    else {
    //        MYMPD_LOG_INFO(NULL, "%lu bytes retrieved\n%s", (unsigned
    //        long)chunk.size, chunk.memory); res = sds_replacelen(res,
    //        chunk.memory, chunk.size);
    //    }

    // FIXME only when curl ok
    //    buffer = parse_tracks(buffer, res, &total, &items);
    buffer = parse_tracks(buffer, response, &total, &items);

    buffer = sdscatlen(buffer, "],", 2);
    buffer = tojson_long(buffer, "totalEntities", total, true);
    buffer = tojson_long(buffer, "offset", 0, true);
    buffer = tojson_long(buffer, "returnedEntities", items, true);
    // list [] tracks_id
    // buffer = tojson_char(buffer, "json", json, false); // rm
    buffer = jsonrpc_end(buffer);

    FREE_SDS(response);
    return buffer;
}

int extract_track_id(const char *uri) {
    // TODO rm
    const char *delimiter = "/";
    const char *last_delimiter = strrchr(uri, delimiter[0]);
    const char *track_id_str = last_delimiter + 1;
    int track_id = atoi(track_id_str);
    // unsigned int track_id = strtoul(track_id_str, NULL, 10);
    return track_id;
}

// unsigned extract_track_id2(const char* uri) {
//     unsigned track_id;
//     sscanf(uri, "qobuz://track/%u", &track_id);
//     return track_id;
// }

sds qobuz_track_get(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                    int track_id) {
                    // const char *uri) {
    // FIXME pass track_id, change to unsinged

    // int track_id = extract_track_id(uri);
    // int track_id2 = extract_track_id2(uri);
    // MYMPD_LOG_WARN(NULL, "1. %d - 2. %d", track_id, track_id2);
    MYMPD_LOG_WARN(NULL, "GET track/get - %u", track_id);

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);

    sds response = track_get(track_id);

    // FIXME only when curl ok

    sds tmp = parse_track(sdsempty(), response);
    sdsrange(tmp, 1, -2);
    buffer = sdscatsds(buffer, tmp);
    // buffer = sdscatlen(buffer, ",", 1);
    // buffer = tojson_char(buffer, "cover", album_image_large, false);
    buffer = jsonrpc_end(buffer);

    FREE_SDS(tmp);
    FREE_SDS(response);

    return buffer;
}

sds qobuz_track_get_stream_url(sds buffer, enum mympd_cmd_ids cmd_id,
                               long request_id, int track_id) {
    // TODO rename to qobuz_track_get_file_url
    // format id check
    const char *method_object = "track";
    const char *method = "getFileUrl";
    int format_id = qobuz_client.format_id;
    const char *intent = "stream";

    Parameter params[] = {{"track_id", sdsfromlonglong(track_id)},
                          {"format_id", sdsfromlonglong(format_id)},
                          {"intent", sdsnew(intent)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    qsort(params, num_params, sizeof(Parameter), compare_params);
    time_t request_ts = time(NULL);
    const char *app_secret = qobuz_client.app_secret;

    sds request_sig = build_request_sig(method_object, method, params,
                                        num_params, request_ts, app_secret);

    sds response = track_get_file_url(track_id, format_id, intent, request_sig,
                                      request_ts);

    sds stream_url = NULL;
    // FILEPATH_LEN_MAX
    if (json_get_string(response, "$.url", 0, 1000, &stream_url, vcb_istext,
                        NULL) == false) {
        MYMPD_LOG_WARN(NULL, "false");
        // create json error message
        // return
    }
    // TODO include rest in else block

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscatfmt(buffer, "\"url\":\"%S\"", stream_url);
    buffer = jsonrpc_end(buffer);
    MYMPD_LOG_WARN(NULL, "%s", buffer);

    FREE_SDS(request_sig);
    FREE_SDS(response);
    FREE_SDS(stream_url);

    parameter_free(params, num_params);

    return buffer;
}

/**
 * Private functions
 */

// admin/search-filter

static sds album_get(const char *album_id) {
    Parameter params[] = {{"albun_id", sdsnew(album_id)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("album/get", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

// album/getFeatured
// album/search
// artist/get - will be DEPRECATE, use OFFICIAL DISCOGRAPHY endpoints instead
// artist/getReleasesGrid (OFFICIAL DISCOGRAPHY)
// artist/getReleasesList (OFFICIAL DISCOGRAPHY)
// artist/getSimilarArtists - will be DEPRECATE, use OFFICIAL DISCOGRAPHY
// endpoints instead artist/page (OFFICIAL DISCOGRAPHY) artist/search
// catalog/autocomplete
// catalog/count
// catalog/getFeatured
// catalog/getFeaturedTypes
// catalog/search
// dynamic/suggest
// dunamic-tracks/get
// dynamic-tracks/list
// favorite/create
// favorite/delete
// favorite/getUserFavorites
// favorite/getUserFavoriteIds
// favorite/status
// favorite/toggle
// genre/get
// genre/list
// label/get
// lable/list [DEPRECATED]
// most-popular/get
// playlist/addTracks
// playlist/create
// playlist/delete
// playlist/deleteTracks
// playlist/get
// playlist/getFeatured
// playlist/getTags
// playlist/getUserPlaylists
// playlist/search
// playlist/subscribe
// playlists/unsubscribe
// playlist/update
// playlist/updatePlaylistsPosition
// playlist/updateTracksPosition
// purchase/getArticles
// purchase/getUserPurchases
// purchase/getUserPurchasesIds

static sds track_get(int track_id) {
    Parameter params[] = {{"track_id", sdsfromlonglong(track_id)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("track/get", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

static sds track_get_file_url(int track_id, int format_id, const char *intent,
                              sds request_sig, long request_ts) {
    Parameter params[] = {{"format_id", sdsfromlonglong(format_id)},
                          {"intent", sdsnew(intent)},
                          {"request_sig", sdsdup(request_sig)},
                          {"request_ts", sdsfromlonglong(request_ts)},
                          {"track_id", sdsfromlonglong(track_id)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("track/getFileUrl", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

static sds track_get_list(struct t_list *tracks_id) {
    sds url = build_url("tracks/getList", NULL, 0);
    sds json = build_json(tracks_id);
    sds response = request("POST", url, json);
    FREE_SDS(json);
    FREE_SDS(url);
    return response;
}

// track/reportStreamingEnd
// track/reportStreamingStart

static sds track_search(const char* query, unsigned limit, unsigned offset) {
    Parameter params[] = {{"query", sdsnew(query)},
                          {"limit", sdsfromlonglong(limit)},
                          {"offset", sdsfromlonglong(offset)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("track/search", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

// user/get
// user/lastUpdate

static sds user_login(const char *username, const char *password) {
    Parameter params[] = {{"username", sdsnew(username)},
                          {"password", sdsnew(password)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("user/login", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

//////////////////////////////////////

static sds build_request_sig(const char *object, const char *method,
                             const Parameter *parameters, size_t param_count,
                             time_t timestamp, const char *app_secret) {
    sds string_to_hash = sdsempty();
    string_to_hash = sdscatfmt(string_to_hash, "%s%s", object, method);
    MYMPD_LOG_WARN(NULL, "1. %s", string_to_hash);

    for (size_t i = 0; i < param_count; i++) {
        string_to_hash = sdscatfmt(string_to_hash, "%s%s", parameters[i].name,
                                   parameters[i].value);
        MYMPD_LOG_WARN(NULL, "2. %s", string_to_hash);
    }

    string_to_hash = sdscatfmt(string_to_hash, "%l", timestamp);
    MYMPD_LOG_WARN(NULL, "3. %s", string_to_hash);
    string_to_hash = sdscatfmt(string_to_hash, "%s", app_secret);
    MYMPD_LOG_WARN(NULL, "4. %s", string_to_hash);
    // above two into one cat

    char *request_sig = calculate_md5(string_to_hash);
    sds request_sig_sds = sdsnew(request_sig);
    // sds md5_hash_str = sdsnew(calculate_md5(string_to_hash));

    MYMPD_LOG_WARN(NULL, "requestsig2_unhashed = %s", string_to_hash);
    MYMPD_LOG_WARN(NULL, "5. requestsig2_hashed = %s", request_sig_sds);
    free(request_sig);
    FREE_SDS(string_to_hash);

    return request_sig_sds; // md5_hash_str
}

// /**
//  * Hashes a string with sha1
//  * @param p string to hash
//  * @return the hash as a newly allocated sds string
//  */
// sds sds_hash_sha1(const char *p) {
//     sds hex_hash = sdsnew(p);
//     return sds_hash_sha1_sds(hex_hash);
// }

// /**
//  * Hashes a sds string with sha1 inplace
//  * @param s string to hash
//  * @return pointer to s
//  */
// sds sds_hash_sha1_sds(sds s) {
//     unsigned char hash[SHA_DIGEST_LENGTH];
//     SHA1((unsigned char *)s, sdslen(s), hash);
//     sdsclear(s);
//     for (unsigned i = 0; i < SHA_DIGEST_LENGTH; i++) {
//         s = sdscatprintf(s, "%02x", hash[i]);
//     }
//     return s;
// }

// void calculate_md5(const char* input, unsigned char* output) {
//     EVP_MD_CTX* mdctx = EVP_MD_CTX_new();
//     EVP_DigestInit_ex(mdctx, EVP_md5(), NULL);
//     EVP_DigestUpdate(mdctx, input, strlen(input));
//     EVP_DigestFinal_ex(mdctx, output, NULL);
//     EVP_MD_CTX_free(mdctx);
// }

static char *calculate_md5(const char *input) {
    // FIXME sds instead of char? handle errors
    EVP_MD_CTX *ctx = EVP_MD_CTX_create();
    // if (mdContext == NULL) {
    //     // Handle error
    //     return NULL;
    // }

    const EVP_MD *md = EVP_md5();
    EVP_DigestInit_ex(ctx, md, NULL);
    EVP_DigestUpdate(ctx, input, strlen(input));

    unsigned char md5sum[EVP_MAX_MD_SIZE];
    EVP_DigestFinal_ex(ctx, md5sum, NULL);
    EVP_MD_CTX_destroy(ctx);

    char *md5String = malloc((size_t)(2 * EVP_MD_size(md) + 1));
    // sds md5_hash_str = sdsempty();

    for (int i = 0; i < EVP_MD_size(md); i++) {
        snprintf(&md5String[i * 2], 3, "%02x", md5sum[i]);
        // md5_hash_str = sdscatprintf(md5_hash_str, "%02x", md5_hash[i]);
    }

    md5String[2 * EVP_MD_size(md)] = '\0';

    return md5String;
}

static int compare_params(const void *a, const void *b) {
    return strcmp(((Parameter *)a)->name, ((Parameter *)b)->name);
}

static sds parse_track(sds buffer, sds res) {
    // artist album
    // int maximum_channel_count;
    sds album_genre_name = NULL;
    sds album_image_large = NULL;
    long int album_released_at;
    sds album_title = NULL;
    sds album_artist_name = NULL;
    // float maximum_sampling_rate;
    int track_number;
    // char *id = NULL;
    long id;
    // int maximum_bit_depth;
    //  sds composer_name = NULL;
    //  char *performers = NULL;
    int duration;
    sds title = NULL;
    // sds performer_name = NULL;
    // bool streamable;
    // hires hires_streamable
    // sds artist_name = NULL;

    json_get_int_max(res, "$.track_number", &track_number, NULL);
    json_get_long_max(res, "$.id", &id, NULL);
    json_get_int_max(res, "$.duration", &duration, NULL);
    json_get_string(res, "$.title", 0, 100, &title, vcb_istext, NULL);
    // json_get_string(res, "$.composer.name", 0, 100, &composer_name,
    // vcb_istext, NULL); json_get_string(res, "$.performer.name", 0, 100,
    // &performer_name, vcb_istext, NULL); json_get_string(res, "$.artist.name",
    // 0, 100, &artist_name, vcb_istext, NULL);

    json_get_string(res, "$.album.genre.name", 0, 100, &album_genre_name,
                    vcb_istext, NULL);
    json_get_string(res, "$.album.image.large", 0, 100, &album_image_large,
                    vcb_istext, NULL);
    json_get_long_max(res, "$.album.released_at", &album_released_at, NULL);
    json_get_string(res, "$.album.title", 0, 100, &album_title, vcb_istext,
                    NULL);
    json_get_string(res, "$.album.artist.name", 0, 100, &album_artist_name,
                    vcb_istext, NULL);

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
    // json_scanf(res, sdslen(res), "{tracks:{limit:%d,total:%d}}", &limit,
    // &total); if (limit && total) {
    // FIXME get int or
    // TODO guard clause
    // TODO verify limit check
    json_get_uint_max(res, "$.tracks.limit", &limit, NULL);
    if (json_get_uint_max(res, "$.tracks.total", &total, NULL) == true &&
        total) {
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
        for (off = 0; (off = mjson_next(items, (int)sdslen(items), off, &koff,
                                        &klen, &voff, &vlen, &vtype)) != 0;) {
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

static sds build_url(const char *endpoint, const Parameter *params,
                     const size_t num_params) {
    // ? api_endpoint api_params
    sds url = sdscat(sdsnew(API_URL), endpoint);

    for (size_t i = 0; i < num_params; i++) {
        url = sdscatlen(url, i == 0 ? "?" : "&", 1);
        url = sdscatfmt(url, "%s=%S", params[i].name, params[i].value);
    }

    return url;
}

// void set_curl_options(const char *method, const char *postdata, const char
// *url, struct MemoryChunk *chunk) {
//     if (strcmp(method, "GET") == 0) {
//         curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPGET, 1L);
//     } else if (strcmp(method, "POST") == 0) {
//         curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_POST, 1L);
//         curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_POSTFIELDS,
//         postdata);
//     } else {
//         // Handle unsupported methods here
//         // return an error or do something else
//     }

//     curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_URL, url);
//     curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_WRITEDATA, (void
//     *)chunk);
// }

// void handle_curl_response(CURLcode result, const char *errorBuffer, struct
// MemoryChunk *chunk) {
//     if (result != CURLE_OK) {
//         size_t errorBufferLength = strlen(errorBuffer);
//         MYMPD_LOG_ERROR(NULL, "libcurl: (%d)", result);
//         if (errorBufferLength) {
//             MYMPD_LOG_ERROR(NULL, "%s", errorBuffer);
//         } else {
//             MYMPD_LOG_ERROR(NULL, "%s", curl_easy_strerror(result));
//         }
//     } else {
//         MYMPD_LOG_DEBUG(NULL, "%lu bytes retrieved", (unsigned
//         long)chunk->size);
//     }
// }

static sds request(const char *method, const char *url, const char *post_data) {
    // caller needs to free the returned response
    // postdata is a pointer not copied
    MYMPD_LOG_DEBUG(NULL, "Request method: %s", method);
    MYMPD_LOG_DEBUG(NULL, "Request url: %s", url);
    MYMPD_LOG_DEBUG(NULL, "Request headers:");
    print_headers(qobuz_client.headers);
    MYMPD_LOG_DEBUG(NULL, "Request postdata: %s", post_data);

    struct t_memory chunk;
    chunk.memory = malloc(1);
    chunk.size = 0;

    // set curl options

    char errbuf[CURL_ERROR_SIZE];
    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_ERRORBUFFER, errbuf);
    errbuf[0] = 0;

    if (strcmp(method, "GET") == 0) {
        curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPGET, 1L);
    } else if (strcmp(method, "POST") == 0) {
        curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_POST, 1L);
        curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_POSTFIELDS,
                         post_data);
    } else {
        // Handle unsupported methods here
        // return an error or do something else
    }

    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_URL, url);
    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_WRITEDATA,
                     (void *)&chunk);

    CURLcode res = curl_easy_perform(qobuz_client.curl_handle);

    // handle curl response

    if (res != CURLE_OK) {
        size_t len = strlen(errbuf);
        MYMPD_LOG_ERROR(NULL, "libcurl: (%d)", res);
        if (len) {
            MYMPD_LOG_ERROR(NULL, "%s", errbuf);
        } else {
            MYMPD_LOG_ERROR(NULL, "%s", curl_easy_strerror(res));
        }
    } else {
        MYMPD_LOG_DEBUG(NULL, "%lu bytes retrieved", (unsigned long)chunk.size);
    }

    // TODO return null on failure ?

    sds response = sdsnewlen(chunk.memory, chunk.size);
    MYMPD_LOG_DEBUG(NULL, "%s", response);
    free(chunk.memory);

    return response;
}

static void parameter_free(Parameter *params, size_t num_params) {
    for (size_t i = 0; i < num_params; i++) {
        FREE_SDS(params[i].value);
    }
}

static void print_headers(struct curl_slist *headers) {
    struct curl_slist *node = headers;
    MYMPD_LOG_INFO(NULL, "Headers:");
    while (node) {
        MYMPD_LOG_INFO(NULL, "%s", node->data);
        node = node->next;
    }
}

static void print_parameters(const Parameter *params, size_t num_params) {
    MYMPD_LOG_INFO(NULL, "Parameters:");
    for (size_t i = 0; i < num_params; i++) {
        MYMPD_LOG_INFO(NULL, "%s: %s", params[i].name, params[i].value);
    }
}

// curl escape/unescape - jsonrpc~ escape unescape

// const char* str = "12345";
// char* end_ptr;
// unsigned long value = strtoul(str, &end_ptr, 10);

// if (*end_ptr != '\0') {
//     // Error: the string contains characters that are not part of a number
// } else {
//     // Conversion successful, use the value variable
// }

// void construct_url(const char *object, const char *method, const char
// *params) {
//     // FIXME
// }

// if (strcmp(method, "POST") == 0) {
//         curl_easy_setopt(curl, CURLOPT_POST, 1L);
//     } else if (strcmp(method, "GET") == 0) {
//         curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
//     }
// char* _request(char *method, char *url, ...) {
//     CURL *curl;
//     CURLcode res;
//     va_list args;
//     struct curl_slist *headers = NULL;
//     MemoryStruct chunk;

//     curl = curl_easy_init();
//     if (curl) {
//         curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method);
//         curl_easy_setopt(curl, CURLOPT_URL, url);

//         va_start(args, url);
//         char *key, *value;
//         while ((key = va_arg(args, char*)) != NULL) {
//             value = va_arg(args, char*);
//             headers = curl_slist_append(headers, key);
//             headers = curl_slist_append(headers, value);
//         }
//         va_end(args);

//         curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

//         chunk.data = malloc(1);
//         chunk.size = 0;
//         curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
//         curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void *)&chunk);

//         res = curl_easy_perform(curl);
//         if (res != CURLE_OK) {
//             fprintf(stderr, "curl_easy_perform() failed: %s\n",
//                 curl_easy_strerror(res));
//         }

//         curl_slist_free_all(headers);
//         curl_easy_cleanup(curl);
//     }

//     return chunk.data;
// }

// bool qobuz_init(struct t_config *config) {
//     // struct t_memory_struct chunk = {0};
//     // struct t_memory_struct chunk;
//     // chunk.memory = malloc(1);
//     // chunk.size = 0;
//     qobuz_app_id = config->qobuz_app_id;
//     qobuz_app_secret = config->qobuz_app_secret;
//     qobuz_username = config->qobuz_username;
//     qobuz_password = config->qobuz_password;
//     // qobuz_format_id = config->qobuz_format_id;
//     qobuz_format_id = 5;
//     cache_dir = sdscatfmt(sdsempty(), "%s/covercache", config->cachedir); //
//     FIXME covercache directory qobuz_handle = curl_easy_init(); if
//     (qobuz_handle) {
//         curl_cleanup++;
//         curl_easy_setopt(qobuz_handle, CURLOPT_WRITEFUNCTION,
//         write_memory_callback);
//         // curl_easy_setopt(qobuz_handle, CURLOPT_WRITEDATA, &chunk);

//         // char *md5Result = calculateMD5(qobuz_password);
//         // user_login(qobuz_username, md5Result);
//         user_login(qobuz_username, qobuz_password);
//         // free(md5Result);

//         return true;
//     }
//     else { // NULL
//         MYMPD_LOG_ERROR(NULL, "curl_easy_init");
//         return false;
//     }
// }

// void qobuz_cleanup(void) {
//     free(user_auth_token); // FIXME
//     if (curl_cleanup--)
//         curl_easy_cleanup(qobuz_handle);
//     sdsfree(cache_dir);
// }

// static bool user_login(const char *username, const char *password) {
//     // TODO: use oauth2
//     // GET user/login

//     struct t_memory chunk = {0};

//     if (username == NULL || password == NULL || username[0] == '\0' ||
//     password[0] == '\0') {
//         MYMPD_LOG_WARN(NULL, "empty user/pass");
//         return false;
//     }

//     char *username_encoded = curl_easy_escape(qobuz_handle, username,
//     (int)strlen(username));

//     struct t_jsonrpc_parse_error parse_error;
//     jsonrpc_parse_error_init(&parse_error);

//     // FIXME generate unique for first login
//     // query parameters
//     sds params = sdscatfmt(sdsempty(), "?username=%s&password=%s",
//     username_encoded, password);
//     // dmi 6922031-0352-59D3-ADA2-B8E98226E8F0
//     // data = sdscat(data,
//     "&device_manufacturer_id=16922031-0352-59D3-ADA2-B8E48246E8F0");

//     sds url = sdscat(sdsnew(API_URL), "user/login");
//     url = sdscatsds(url, params);

//     curl_easy_setopt(qobuz_handle, CURLOPT_HTTPGET, 1L);
//     curl_easy_setopt(qobuz_handle, CURLOPT_URL, url);

//     curl_easy_setopt(qobuz_handle, CURLOPT_WRITEDATA, (void *)&chunk);

//     struct curl_slist *headers = NULL;
//     sds h = sdscat(sdsnew("x-app-id: "), qobuz_app_id); // FIXME
//     headers = curl_slist_append(headers, h);
//     sdsfree(h);
//     curl_easy_setopt(qobuz_handle, CURLOPT_HTTPHEADER, headers);

//     CURLcode res = curl_easy_perform(qobuz_handle);
//     curl_slist_free_all(headers);

//     sdsfree(params); // FIXME change to FREE_SDS from sds_extras.h move up
//     sdsfree(url);
//     if (res != CURLE_OK) {
//         MYMPD_LOG_ERROR(NULL, "curl_easy_perform() failed: %s\n",
//         curl_easy_strerror(res)); free(chunk.memory); return false;
//     }
//     // FIXME block based on status code of http request
//     else { // 0
//         // FIXME use vcb in_name, is_alnum, pass empty/none
//         // TODO use enums for limits
//         // TODO check the response code of curl instead to verify success or
//         failure sds cm = sdsnew(chunk.memory);
//         // TODO free chunk memory here
//         if (json_get_string(cm, "$.user_auth_token", 1, 200,
//         &user_auth_token, vcb_isalnum, &parse_error) == true &&
//             json_get_int_max(cm, "$.user.id", &user_id, NULL) == true) {
//             // FIXME change user id to uint max
//             MYMPD_LOG_INFO(NULL, "login successful");
//             free(chunk.memory);
//             FREE_SDS(cm);
//             return true;
//         }
//         else {
//             // status code message
//             sds message = NULL;
//             // FIXME if else
//             json_get_string(cm, "$.message", 1, 200, &message, vcb_istext,
//             &parse_error); MYMPD_LOG_ERROR(NULL, "%s", message);
//             FREE_SDS(message);
//             free(chunk.memory);
//             FREE_SDS(cm);
//             return false;
//         }
//     }
// }
// #include <mbedtls/md5.h>

// static char* md5(const char *input) {
//     mbedtls_md5_context ctx;
//     unsigned char md5sum[16];

//     mbedtls_md5_init(&ctx);
//     mbedtls_md5_starts(&ctx);
//     mbedtls_md5_update(&ctx, (const unsigned char *)input, strlen(input));
//     mbedtls_md5_finish(&ctx, md5sum);
//     mbedtls_md5_free(&ctx);

//     char *md5String = malloc(33); // 32 characters + 1 null terminator

//     for (int i = 0; i < 16; i++) {
//         sprintf(&md5String[i * 2], "%02x", md5sum[i]);
//     }

//     return md5String;
// }
// int main(void)
// {
//   CURL *handle;
//   struct curl_slist *slist = NULL;
//   struct curl_slist *temp = NULL;

//   slist = curl_slist_append(slist, "pragma:");

//   if(!slist)
//     return -1;

//   temp = curl_slist_append(slist, "Accept:");

//   if(!temp) {
//     curl_slist_free_all(slist);
//     return -1;
//   }

//   slist = temp;

//   curl_easy_setopt(handle, CURLOPT_HTTPHEADER, slist);

//   curl_easy_perform(handle);

//   curl_slist_free_all(slist); /* free the list again */
// }
