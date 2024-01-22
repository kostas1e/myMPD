#include "src/ideon/qobuz.h"
#include "compile_time.h"

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

static sds album_get(const char *album_id) __attribute__((unused));
static sds build_request_sig(const char *object, const char *method,
                             const Parameter *parameters, size_t param_count,
                             time_t timestamp, const char *app_secret);
static sds build_url(const char *endpoint, const Parameter *params,
                     const size_t num_params);
static char *calculate_md5(const char *input);
static int compare_params(const void *p1, const void *p2);
static int extract_track_id(const char *uri);
static void parameter_free(Parameter *params, size_t num_params);
static sds parse_track(sds buffer, sds res);
static sds parse_tracks(sds buffer, sds res, unsigned *cnt, unsigned *ret);
static void
print_headers(struct curl_slist *headers) __attribute_maybe_unused__;
static void print_parameters(const Parameter *params,
                             size_t num_params) __attribute_maybe_unused__;
static sds request(const char *method, const char *url, const char *postdata);
static sds track_get(int track_id);
static sds track_get_file_url(int track_id, int format_id, const char *intent,
                              sds request_sig, long request_ts);
static sds track_get_list(struct t_list *tracks_id);
static sds track_search(const char *query, unsigned limit, unsigned offset);
static sds user_login(const char *username, const char *password);

/**
 * Public functions
 */

bool qobuz_user_login(const char *username, const char *password) {
    // FIXME encode username, hash password, call user_login priv
    // use rc to clean once OR guard clauses
    // bool rc = false;
    // validate input
    // get device id required for streaming start/end
    // device_manufacturer_id=6922031-0352-59D3-ADA2-B8E98226E8F0

    qobuz_client.user_auth_token = NULL;

    curl_slist_free_all(qobuz_client.headers);
    qobuz_client.headers = NULL;
    sds header = sdsempty();
    // TODO check after append, qobuz_client.headers = temp
    // qobuz_client.headers = curl_slist_append(qobuz_client.headers, "Content-Type: application/json");
    // qobuz_client.headers = curl_slist_append(qobuz_client.headers, "Accept: application/json");

    header = sdscatfmt(header, "x-app-id: %s", qobuz_client.app_id);
    qobuz_client.headers = curl_slist_append(qobuz_client.headers, header);

    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPHEADER,
                     qobuz_client.headers);

    sds username_encoded =
        sds_urlencode(sdsempty(), username, strlen(username));
    sds response = user_login(username_encoded, password);

    // parse response, set user auth token
    // return success/failure

    // struct t_jsonrpc_parse_error parse_error;
    // jsonrpc_parse_error_init(&parse_error);

    FREE_SDS(username_encoded);

    // block based on status code of http request
    // use vcb in_name, is_alnum, pass empty/none

    // check the response code of curl instead to verify success or failure
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
        MYMPD_LOG_INFO(NULL, "login successful");
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
        // status code message, show error front
        sds message = NULL;
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
    // FIXME
    qobuz_client.app_id = config->qobuz_app_id;
    qobuz_client.app_secret = config->qobuz_app_secret;
    qobuz_client.username = config->qobuz_username;
    qobuz_client.password = config->qobuz_password;
    qobuz_client.format_id = 27;
    // covercache directory
    // cache_dir = sdscatfmt(sdsempty(), "%s/covercache", config->cachedir);
    qobuz_client.user_auth_token = NULL;
    qobuz_client.curl_handle = curl_easy_init();
    if (qobuz_client.curl_handle == NULL) {
        MYMPD_LOG_ERROR(NULL, "curl_easy_init()");
        return false;
    }

    qobuz_client.headers = NULL;

    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_USERAGENT,
                     "Ideon/0.2 libcurl");
    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_WRITEFUNCTION,
                     write_memory_callback);

    // TODO check state and auto login
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

sds qobuz_track_search(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                       const char *query, unsigned limit, unsigned offset) {
    // FIXME
    // catalog/search wrapper
    // mympd_api_search_songs()

    sds query_encoded = sds_urlencode(sdsempty(), query, strlen(query));
    sds response = track_search(query_encoded, limit, offset);

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscat(buffer, "\"data\":[");

    // return jsonrpc_respond_message(
    //     buffer, cmd_id, request_id, JSONRPC_FACILITY_DATABASE,
    //     JSONRPC_SEVERITY_ERROR, "Error message");

    unsigned total = 0;
    unsigned items = 0;

    buffer = parse_tracks(buffer, response, &total, &items);

    buffer = sdscatlen(buffer, "],", 2);
    buffer = tojson_long(buffer, "totalEntities", total, true);
    buffer = tojson_long(buffer, "offset", offset, true);
    buffer = tojson_long(buffer, "returnedEntities", items, true);
    buffer = tojson_char(buffer, "expression", query, false);
    buffer = jsonrpc_end(buffer);

    FREE_SDS(response);
    FREE_SDS(query_encoded);

    return buffer;
}

static sds build_json(struct t_list *tracks_id) {
    // FIXME
    sds json = sdsnew("{\"tracks_id\":[");
    struct t_list_node *current = tracks_id->head;
    int i = 0;
    // shift
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
    buffer = tojson_long(buffer, "returnedEntities", items, false);
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
                    const char *uri) {
    // FIXME pass track_id, change to unsinged

    int track_id = extract_track_id(uri);
    // int track_id2 = extract_track_id2(uri);
    // MYMPD_LOG_WARN(NULL, "1. %d - 2. %d", track_id, track_id2);
    MYMPD_LOG_WARN(NULL, "GET track/get %s - %u", uri, track_id);

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
    sds url = build_url("track/getList", NULL, 0);
    sds json = build_json(tracks_id);
    sds response = request("POST", url, json);
    FREE_SDS(json);
    FREE_SDS(url);
    return response;
}

// track/reportStreamingEnd
// track/reportStreamingStart

static sds track_search(const char *query, unsigned limit, unsigned offset) {
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

///////////////////////////////////////////////////////////////////////////////

static sds build_request_sig(const char *object, const char *method,
                             const Parameter *parameters, size_t param_count,
                             time_t timestamp, const char *app_secret) {
    sds string_to_hash = sdsempty();
    string_to_hash = sdscatfmt(string_to_hash, "%s%s", object, method);
    MYMPD_LOG_DEBUG(NULL, "1. %s", string_to_hash);

    for (size_t i = 0; i < param_count; i++) {
        string_to_hash = sdscatfmt(string_to_hash, "%s%s", parameters[i].name,
                                   parameters[i].value);
        MYMPD_LOG_DEBUG(NULL, "2. %s", string_to_hash);
    }

    string_to_hash = sdscatfmt(string_to_hash, "%l", timestamp);
    MYMPD_LOG_DEBUG(NULL, "3. %s", string_to_hash);
    string_to_hash = sdscatfmt(string_to_hash, "%s", app_secret);
    MYMPD_LOG_DEBUG(NULL, "4. %s", string_to_hash);

    char *request_sig = calculate_md5(string_to_hash);
    sds request_sig_sds = sdsnew(request_sig);

    MYMPD_LOG_DEBUG(NULL, "requestsig2_unhashed = %s", string_to_hash);
    MYMPD_LOG_DEBUG(NULL, "5. requestsig2_hashed = %s", request_sig_sds);
    free(request_sig);
    FREE_SDS(string_to_hash);

    return request_sig_sds;
}

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
    sds album_genre_name = NULL;
    sds album_image_large = NULL;
    sds album_title = NULL;
    sds album_artist_name = NULL;
    int track_number;
    long id;
    int duration;
    sds title = NULL;
    // bool streamable;
    // hires hires_streamable

    json_get_int_max(res, "$.track_number", &track_number, NULL);
    json_get_long_max(res, "$.id", &id, NULL);
    json_get_int_max(res, "$.duration", &duration, NULL);
    json_get_string_max(res, "$.title", &title, vcb_istext, NULL); // FIXME max
    if (json_get_string(res, "$.album.genre.name", 0, 100, &album_genre_name,
                        vcb_istext, NULL) == false) {
        album_genre_name = sdsempty();
    }
    // if (json_get_string(res, "$.album.image.large", 0, 100,
    // &album_image_large,
    //                     vcb_istext, NULL) == false) {
    //     album_image_large = sdsempty();
    // }
    if (json_get_string(res, "$.album.title", 0, 100, &album_title, vcb_istext,
                        NULL) == false) {
        album_title = sdsempty();
    }
    // FIXME handle null token
    if (json_get_string(res, "$.album.artist.name", 0, 100, &album_artist_name,
                        vcb_istext, NULL) == false) {
        album_artist_name = sdsempty();
    }
    buffer = sdscatlen(buffer, "{", 1);
    buffer = tojson_char(buffer, "Type", "stream", true);
    sds uri = sdscatprintf(sdsempty(), "qobuz://track/%ld", id);
    buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    // FIXME check list_to_json_array and other
    buffer = sdscatfmt(buffer, "\"Artist\":[\"%S\"],", album_artist_name);
    buffer = tojson_char(buffer, "Album", album_title, true);
    // buffer = tojson_char(buffer, "AlbumArtist", album_artist_name, true);
    buffer = sdscatfmt(buffer, "\"AlbumArtist\":[\"%S\"],", album_artist_name);
    buffer = tojson_char(buffer, "Title", title, true);
    buffer = tojson_long(buffer, "Track", track_number, true);
    buffer = tojson_char(buffer, "Genre", album_genre_name, false);
    buffer = sdscatlen(buffer, "}", 1);

    FREE_SDS(uri);
    FREE_SDS(title);
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
        MYMPD_LOG_DEBUG(NULL, "items: %s", items);
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
            // MYMPD_LOG_WARN(NULL, "parsing %s", token);
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
    }

    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_URL, url);
    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_WRITEDATA,
                     (void *)&chunk);

    CURLcode res = curl_easy_perform(qobuz_client.curl_handle);

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
    MYMPD_LOG_DEBUG(NULL, "Return\n%s", response);
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
