#include "src/ideon/qobuz.h"
#include "compile_time.h"

#include "dist/mjson/mjson.h"
#include "dist/sds/sds.h"
#include "src/ideon/memory.h"
#include "src/lib/jsonrpc.h"
#include "src/lib/log.h"
#include "src/lib/sds_extras.h"
#include "src/lib/state_files.h"
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

static sds album_get(const char *album_id);
static sds album_search(const char *query, unsigned limit, unsigned offset);
static sds build_request_sig(const char *object, const char *method,
                             const Parameter *parameters, size_t param_count,
                             time_t timestamp, const char *app_secret);
static sds build_url(const char *endpoint, const Parameter *params,
                     const size_t num_params);
static char *calculate_md5(const char *input);
static int compare_params(const void *p1, const void *p2);
static int extract_track_id(const char *uri) __attribute_maybe_unused__;
static bool login(const char *username, const char *passwrod, sds *error);
static sds favorite_get_user_favorites(const char *type, unsigned limit,
                                       unsigned offset);
static sds favorite_get_user_favorite_ids(void);
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

static sds parse_albums(sds buffer, sds res, unsigned *cnt, unsigned *ret);
static sds parse_album(sds buffer, sds res);

sds internal_get_stream_url(int track_id);

/**
 * Public functions
 */

static bool clear_credentials(void) {
    // validate
    MYMPD_LOG_DEBUG(NULL, "clearing credentials");
    sdsclear(qobuz_client.username);
    sdsclear(qobuz_client.password);
    MYMPD_LOG_DEBUG(NULL, "new creds after clear username [%s] password [%s]",
                   qobuz_client.username, qobuz_client.password);
    if (state_file_write(qobuz_client.config->workdir, DIR_WORK_CONFIG,
                         "qobuz_username", "") == false ||
        state_file_write(qobuz_client.config->workdir, DIR_WORK_CONFIG,
                         "qobuz_password", "") == false ||
        state_file_write(qobuz_client.config->workdir, DIR_WORK_STATE,
                         "qobuz_logged_in", "false") == false) {
        MYMPD_LOG_ERROR(NULL, "unable to write files");
        return false;
    }
    return true;
}

void qobuz_logout2(void) {
    // FIXME checks
    MYMPD_LOG_DEBUG(NULL, "logging out user");
    // sdsclear(config->qobuz_username);
    // sdsclear(config->qobuz_password);
    clear_credentials();
}

sds qobuz_logout(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                 struct t_config *config) {
    // config->qobuz_username = state_file_rw_string_sds(config->workdir,
    // DIR_WORK_CONFIG, "qobuz_username", config->qobuz_username, vcb_isname,
    // write);

    // config->qobuz_username = state_file_rw_string_sds(config->workdir,
    // DIR_WORK_CONFIG, "qobuz_username", config->qobuz_username, vcb_isname,
    // write);
    sdsclear(config->qobuz_username);
    sdsclear(config->qobuz_password);
    MYMPD_LOG_DEBUG(NULL, "%s", config->qobuz_username);
    // sdsclear(qobuz_client.username);
    // sdsclear(qobuz_client.password);
    // TODO check bool rc
    state_file_write(config->workdir, DIR_WORK_CONFIG, "qobuz_username",
                     config->qobuz_username);
    state_file_write(config->workdir, DIR_WORK_CONFIG, "qobuz_password",
                     config->qobuz_password);
    state_file_write(config->workdir, DIR_WORK_STATE, "qobuz_logged_in",
                     "false");

    // qobuz_client.user_auth_token = NULL;
    sdsclear(qobuz_client.user_auth_token);

    curl_slist_free_all(qobuz_client.headers);
    qobuz_client.headers = NULL;
    sds header = sdsempty();
    header = sdscatfmt(header, "x-app-id: %s", qobuz_client.app_id);
    qobuz_client.headers = curl_slist_append(qobuz_client.headers, header);

    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPHEADER,
                     qobuz_client.headers);

    // FIXME msg
    // jsonrpc_respond_message
    // jsonrpc_respond_message_phrase
    // jsonrpc_respond_with_message_or_error
    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = tojson_char(buffer, "logout", "success", false);
    buffer = jsonrpc_end(buffer);

    MYMPD_LOG_WARN(NULL, "logout");
    FREE_SDS(header);

    return buffer;
}

static bool set_credentials(const char *username, const char *password) {
    // sds workdir
    // validate
    MYMPD_LOG_DEBUG(NULL, "setting %s, %s", username, password);
    // revert

    if (state_file_write(qobuz_client.config->workdir, DIR_WORK_CONFIG,
                         "qobuz_username", username) == false ||
        state_file_write(qobuz_client.config->workdir, DIR_WORK_CONFIG,
                         "qobuz_password", password) == false ||
        state_file_write(qobuz_client.config->workdir, DIR_WORK_STATE,
                         "qobuz_logged_in", "true") == false) {
        MYMPD_LOG_ERROR(NULL, "unable to write files");
        return false;
    }
    // FIXME move before write to state files
    // this could be sdscat
    qobuz_client.username = sds_replace(qobuz_client.username, username);
    qobuz_client.password = sds_replace(qobuz_client.password, password);
    MYMPD_LOG_DEBUG(NULL, "set credentials %s %s", qobuz_client.username,
                   qobuz_client.password);
    MYMPD_LOG_DEBUG(NULL, "chk credentials %s %s",
                   qobuz_client.config->qobuz_username,
                   qobuz_client.config->qobuz_password);
    return true;
}

bool qobuz_login(const char *username, const char *password,
                 struct t_config *config, sds *error) {

    // check if already logged in

    char *password_md5 = calculate_md5(password);

    bool rc = login(username, password_md5, error);
    MYMPD_LOG_DEBUG(NULL, "before %s %s", qobuz_client.username,
                   qobuz_client.password);
    if (rc == true) {
        set_credentials(username, password_md5);
    } else {
        // set_credentials("", "");
        // not needed if we make sure that always have loged out before login
        clear_credentials();
    }
    MYMPD_LOG_DEBUG(NULL, "s %s", config->qobuz_username);
    MYMPD_LOG_DEBUG(NULL, "s %s", config->qobuz_password);
    MYMPD_LOG_DEBUG(NULL, "after %s %s", qobuz_client.username,
                   qobuz_client.password);
    return rc;

    // qobuz_client.user_auth_token = NULL;

    // curl_slist_free_all(qobuz_client.headers);
    // qobuz_client.headers = NULL;
    // sds header = sdsempty();
    // header = sdscatfmt(header, "x-app-id: %s", qobuz_client.app_id);
    // qobuz_client.headers = curl_slist_append(qobuz_client.headers, header);
    // curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPHEADER,
    //                  qobuz_client.headers);

    // sds username_encoded =
    //     sds_urlencode(sdsempty(), username, strlen(username));
    // sds response = user_login(username_encoded, password_md5);

    // FREE_SDS(username_encoded);

    // if (json_get_string(response, "$.user_auth_token", 1, 100,
    //                     &qobuz_client.user_auth_token, vcb_isalnum,
    //                     NULL) == true) {
    //     MYMPD_LOG_INFO(NULL, "login successful");
    //     sdsclear(header);
    //     header = sdscatfmt(header, "x-user-auth-token: %S",
    //                        qobuz_client.user_auth_token);
    //     qobuz_client.headers = curl_slist_append(qobuz_client.headers,
    //     header); curl_easy_setopt(qobuz_client.curl_handle,
    //     CURLOPT_HTTPHEADER,
    //                      qobuz_client.headers);

    //     // write credentials
    //     sdsclear(config->qobuz_username);
    //     config->qobuz_username = sdscat(config->qobuz_username, username);
    //     sdsclear(config->qobuz_password);
    //     config->qobuz_password = sdscat(config->qobuz_password,
    //     password_md5);
    //     // write state files
    //     state_file_write(config->workdir, DIR_WORK_CONFIG, "qobuz_username",
    //                      config->qobuz_username);
    //     state_file_write(config->workdir, DIR_WORK_CONFIG, "qobuz_password",
    //                      config->qobuz_password);
    //     // state_file_write(config->workdir, DIR_WORK_CONFIG,
    //     "qobuz_logged_in",
    //     // "true");
    //     state_file_write(config->workdir, DIR_WORK_STATE, "qobuz_logged_in",
    //                      "true");

    //     FREE_SDS(header);
    //     FREE_SDS(response);

    //     return true;
    // } else {
    //     // status code message
    //     sds message = NULL;
    //     json_get_string(response, "$.message", 1, 100, &message, vcb_istext,
    //                     NULL);
    //     *error = sdscatsds(*error, message);

    //     // FIXME move to func / set befare call (on logout)
    //     sdsclear(config->qobuz_username);
    //     sdsclear(config->qobuz_password);
    //     MYMPD_LOG_WARN(NULL, "%s", config->qobuz_username);
    //     // TODO check bool rc
    //     state_file_write(config->workdir, DIR_WORK_CONFIG, "qobuz_username",
    //                      config->qobuz_username);
    //     state_file_write(config->workdir, DIR_WORK_CONFIG, "qobuz_password",
    //                      config->qobuz_password);
    //     state_file_write(config->workdir, DIR_WORK_CONFIG, "qobuz_logged_in",
    //                      "false");
    //     state_file_write(config->workdir, DIR_WORK_STATE, "qobuz_logged_in",
    //                      "false");

    //     FREE_SDS(header);
    //     FREE_SDS(message);
    //     FREE_SDS(response);

    //     return false;
    // }
}

bool qobuz_init(struct t_config *config) {
    qobuz_client.curl_handle = curl_easy_init();
    if (qobuz_client.curl_handle == NULL) {
        MYMPD_LOG_ERROR(NULL, "curl_easy_init()");
        return false;
    }
    qobuz_client.app_id = config->qobuz_app_id;
    qobuz_client.app_secret = config->qobuz_app_secret;
    qobuz_client.username = config->qobuz_username; // plain
    qobuz_client.password = config->qobuz_password; // hashed
    qobuz_client.format_id = 27;
    qobuz_client.user_auth_token = NULL;
    qobuz_client.headers = NULL;
    qobuz_client.config = config;

    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_USERAGENT,
                     "Ideon/0.2 libcurl");
    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_WRITEFUNCTION,
                     write_memory_callback);

    // Attempt to log in with stored credentials
    if (sdslen(qobuz_client.username) > 0 &&
        sdslen(qobuz_client.password) > 0) {
        sds error = sdsempty();
        MYMPD_LOG_WARN(NULL, "Auto log in user %s", qobuz_client.username);
        bool a = login(qobuz_client.username, qobuz_client.password, &error);
        if (a)
            MYMPD_LOG_DEBUG(NULL, "auto login true");
        else
            MYMPD_LOG_DEBUG(NULL, "auto login false");
        // FIXME rm below
        // if (sdslen(error) > 0) {
        //     MYMPD_LOG_ERROR(NULL, error);
        // }


        // qobuz_get_album_streams("5414939679377");



        FREE_SDS(error);
    }
    MYMPD_LOG_WARN(NULL, "User %s logged in", qobuz_client.username);

    return true;
}

void qobuz_cleanup(void) {
    FREE_SDS(qobuz_client.user_auth_token);
    curl_slist_free_all(qobuz_client.headers);
    if (qobuz_client.curl_handle != NULL) {
        curl_easy_cleanup(qobuz_client.curl_handle);
    }
}

sds qobuz_search_albums(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                        const char *query, unsigned offset, unsigned limit) {
    // FIXME
    MYMPD_LOG_WARN(NULL, "qobuz album search query: %s", query);

    sds query_encoded = sds_urlencode(sdsempty(), query, strlen(query));
    sds response = album_search(query_encoded, limit, offset);

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscat(buffer, "\"data\":[");

    // return jsonrpc_respond_message(
    //     buffer, cmd_id, request_id, JSONRPC_FACILITY_DATABASE,
    //     JSONRPC_SEVERITY_ERROR, "Error message");

    unsigned total = 0;
    unsigned items = 0;

    buffer = parse_albums(buffer, response, &total, &items);

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

sds qobuz_search_tracks(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                        const char *query, unsigned offset, unsigned limit) {
    // FIXME
    // catalog/search wrapper
    // mympd_api_search_songs()
    MYMPD_LOG_WARN(NULL, "qobuz track search query: %s", query);

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
    // FIXME generic pass key
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
    // TODO rm, extract from scheme qobuz://type/id
    const char *delimiter = "/";
    const char *last_delimiter = strrchr(uri, delimiter[0]);
    const char *track_id_str = last_delimiter + 1;
    int track_id = atoi(track_id_str);
    // unsigned int track_id = strtoul(track_id_str, NULL, 10);
    return track_id;
}

void extract_info(const char *uri) {
    // FIXME
    // sds *tokens;
    // int count, j;

    // sds line = sdsnew("Hello World!");
    // tokens = sdssplitlen(line,sdslen(line)," ",1,&count);

    // for (j = 0; j < count; j++)
    //     printf("%s\n", tokens[j]);
    // sdsfreesplitres(tokens,count);

    MYMPD_LOG_WARN(NULL, "extract info");
    sds s_uri = sdsnew(uri);
    int count = 0;
    sds *tokens = sdssplitlen(s_uri, (ssize_t)sdslen(s_uri), "/", 1, &count);
    int track_id = sds_toimax(tokens[4]);
    // int track_id = atoi(tokens[4]);
    sds availability = tokens[5];
    MYMPD_LOG_WARN(NULL, "%d %s", track_id, availability);

    sdsfreesplitres(tokens, count);

}

// unsigned extract_track_id2(const char* uri) {
//     unsigned track_id;
//     sscanf(uri, "qobuz://track/%u", &track_id);
//     return track_id;
// }

sds qobuz_search(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                 const char *query, const char *type, unsigned offset,
                 unsigned limit) {
    MYMPD_LOG_WARN(NULL, "qobuz search %s %s", query, type);

    // TODO use switch (type)
    if (strcmp(type, "tracks") == 0) {
        buffer = qobuz_search_tracks(buffer, cmd_id, request_id, query, offset,
                                     limit);
    } else if (strcmp(type, "albums") == 0) {
        buffer = qobuz_search_albums(buffer, cmd_id, request_id, query, offset,
                                     limit);
    } else {
        MYMPD_LOG_WARN(NULL, "nyi");
    }

    return buffer;
}

sds print_qobuz_album_tags(sds buffer, sds res) {
    // FIXME use parse album instead
    sds id = NULL;
    sds genre_name = NULL;
    int tracks_count;
    int duration;
    sds title = NULL;
    sds artist_name = NULL;
    sds image_small = NULL;
    sds image_large = NULL;
    if (json_get_string(res, "$.id", 0, 100, &id, vcb_isalnum, NULL) == false) {
        id = sdsempty();
    }
    if (json_get_string(res, "$.genre.name", 0, 100, &genre_name, vcb_istext,
                        NULL) == false) {
        genre_name = sdsempty();
    }
    json_get_int_max(res, "$.tracks_count", &tracks_count, NULL);
    json_get_string_max(res, "$.title", &title, vcb_istext, NULL); // FIXME max
    json_get_int_max(res, "$.duration", &duration, NULL);
    // image
    if (json_get_string(res, "$.artist.name", 0, 100, &artist_name, vcb_istext,
                        NULL) == false) {
        artist_name = sdsempty();
    }
    if (json_get_string_max(res, "$.image.small", &image_small, vcb_isstreamuri,
                            NULL) == false) {
        image_small = sdsempty();
    }
    if (json_get_string_max(res, "$.image.large", &image_large, vcb_isstreamuri,
                            NULL) == false) {
        // FIXME tojson here, or null
        image_large = sdsempty();
    }

    // buffer = tojson_char(buffer, "Type", "album", true);
    buffer = tojson_sds(buffer, "Album", title, true);
    buffer = sdscatfmt(buffer, "\"AlbumArtist\":[\"%S\"],", artist_name);
    // artist
    buffer = sdscatfmt(buffer, "\"Genre\":[\"%S\"],", genre_name);
    // date
    // original date
    buffer = tojson_sds(buffer, "AlbumId", id, true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    buffer = tojson_sds(buffer, "ImageSmall", image_small, true);
    buffer = tojson_sds(buffer, "ImageLarge", image_large, true);
    // discs
    // buffer = tojson_int_max(buffer, "SongCount", tracks_count, true);
    sds uri = sdscatfmt(sdsempty(), "qobuz://album/%S", id);
    buffer = tojson_sds(buffer, "uri", uri, false);

    FREE_SDS(id);
    FREE_SDS(genre_name);
    FREE_SDS(title);
    FREE_SDS(image_small);
    FREE_SDS(image_large);
    FREE_SDS(artist_name);

    return buffer;
}

sds qobuz_library_album_detail(sds buffer, enum mympd_cmd_ids cmd_id,
                               long request_id, const char *album_id) {
    // FIXME
    // qobuz api library album detail
    // MYMPD_LOG_WARN(NULL, "GET album/get %s", album_id);

    sds response = album_get(album_id);

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscat(buffer, "\"data\":[");

    unsigned total = 0;
    unsigned items = 0;

    buffer = parse_tracks(buffer, response, &total, &items);

    buffer = sdscatlen(buffer, "],", 2);
    // buffer = tojson_long(buffer, "totalEntities", total, true);
    // buffer = tojson_long(buffer, "offset", 0, true);

    buffer = tojson_long(buffer, "returnedEntities", items, true);

    buffer = print_qobuz_album_tags(buffer, response);
    // buffer = tojson_char(buffer, "AlbumId", album_id, false);
    buffer = jsonrpc_end(buffer);

    FREE_SDS(response);

    return buffer;
}

sds qobuz_track_get(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                    int track_id) {
    // const char *uri) {
    // FIXME pass track_id, change to unsinged

    // int track_id = extract_track_id(uri);
    // int track_id2 = extract_track_id2(uri);
    MYMPD_LOG_DEBUG(NULL, "GET track/get %u", track_id);

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

sds qobuz_user_library_favorites(sds buffer, enum mympd_cmd_ids cmd_id,
                                 long request_id, const char *type,
                                 unsigned limit, unsigned offset) {
    // mympd_api_browse_album_list
    sds response = favorite_get_user_favorites(type, limit, offset);

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    buffer = sdscat(buffer, "\"data\":[");

    unsigned total = 0;
    unsigned items = 0;

    // FIXME parse based on type
    if (strcmp(type, "tracks") == 0) {
        buffer = parse_tracks(buffer, response, &total, &items);
    } else if (strcmp(type, "albums") == 0) {
        buffer = parse_albums(buffer, response, &total, &items);
    } else {
        MYMPD_LOG_WARN(NULL, "NYI");
    }

    buffer = sdscatlen(buffer, "],", 2);
    buffer = tojson_long(buffer, "totalEntities", total, true);
    buffer = tojson_long(buffer, "offset", offset, true);
    buffer = tojson_long(buffer, "returnedEntities", items, true);
    buffer = tojson_char(buffer, "type", type, false);
    buffer = jsonrpc_end(buffer);

    FREE_SDS(response);

    return buffer;
}

sds qobuz_favorite_ids(sds buffer, enum mympd_cmd_ids cmd_id, long request_id) {
    sds response = favorite_get_user_favorite_ids();

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    // tojson_sds
    buffer = tojson_raw(buffer, "data", response, false);
    buffer = jsonrpc_end(buffer);

    FREE_SDS(response);

    return buffer;
}

sds internal_get_stream_url(int track_id) { // TODO track id to long long
    // FIXME use this in public qobuz track get stream url
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
    // if (json_get_string(response, "$.url", 0, 1000, &stream_url, vcb_istext,
    //                     NULL) == false) {
    //     MYMPD_LOG_WARN(NULL, "false");
    //     stream_url = sdsempty();
    // }
    json_get_string(response, "$.url", 0, 1000, &stream_url, vcb_istext, NULL);
    return stream_url; // null or sds with stream url (caller needs to free)
}


sds qobuz_track_get_stream_url(sds buffer, enum mympd_cmd_ids cmd_id,
                               long request_id, int track_id) {
    // TODO rename to qobuz_track_get_file_url,
    //      wrapper to another function
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
    // TODO FILEPATH_LEN_MAX
    if (json_get_string(response, "$.url", 0, 1000, &stream_url, vcb_istext,
                        NULL) == false) {
        MYMPD_LOG_WARN(NULL, "false");
        stream_url = sdsempty();
        // create json error message
        // return
    }
    // TODO include rest in else block

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    // TODO json add sds
    buffer = sdscatfmt(buffer, "\"url\":\"%S\"", stream_url);
    buffer = jsonrpc_end(buffer);
    MYMPD_LOG_WARN(NULL, "%s", buffer);

    FREE_SDS(request_sig);
    FREE_SDS(response);
    FREE_SDS(stream_url);

    parameter_free(params, num_params);

    return buffer;
}

// static void parse_tracks_simple(sds data, struct t_list *uris) {
//     sds items = json_get_key_as_sds(data, "$.tracks.items");
//     MYMPD_LOG_DEBUG(NULL, "items: %s", items);
//     // unsigned cnt = 0;
//     int count = 0;
//     sds temp = sdsempty();
//     int koff, klen, voff, vlen, vtype, off;
//     for (off = 0; (off = mjson_next(items, (int)sdslen(items), off, &koff,
//                                     &klen, &voff, &vlen, &vtype)) != 0;) {
//         // if (cnt++) {
//         //     buffer = sdscatlen(buffer, ",", 1);
//         // }
//         sds token = sdsnewlen(items + voff, (size_t)vlen);
//         // MYMPD_LOG_WARN(NULL, "parsing %s", token);
//         // buffer = parse_track(buffer, token);

//         bool streamable; // TODO check if not available and cmp
//         json_get_bool(token, "$.streamable", &streamable, NULL); // error, check if parsed
//         if (streamable == true) {
//             // long id;
//             // json_get_long_max(token, "$.id", &id, NULL);
//             int id;
//             json_get_int_max(token, "$.id", &id, NULL);
//             sds stream_url = internal_get_stream_url(id);
//             if (stream_url != NULL) {
//                 list_push(uris, stream_url, 0, NULL, NULL);
//             }

//             // tracks_id[count] = id;
//             temp = sdscatfmt(temp, "%i ", id);
//             count++;
//             FREE_SDS(stream_url);
//         }
//         else {
//             MYMPD_LOG_WARN(NULL, "streamable false");
//         }

//         FREE_SDS(token);
//     }
//     MYMPD_LOG_WARN(NULL, "ids = [ %s]\ncount = %d", temp, count);
//     FREE_SDS(temp);
//     FREE_SDS(items);
// }

void parse_album_data_for_streams(sds album_data, struct t_list *uris) {
    MYMPD_LOG_WARN(NULL, "parse album data for streams");
    sds items = json_get_key_as_sds(album_data, "$.tracks.items");

    // int tracks_count;
    // json_get_int_max(album_data, "$.tracks_count", &tracks_count, NULL); // TODO use min/max
    
    int tracks_count;
    json_get_int_max(album_data, "$.tracks_count", &tracks_count, NULL); // TODO use min/max
    MYMPD_LOG_WARN(NULL, " tracks count %d", tracks_count);

    int count = 0;
    int koff, klen, voff, vlen, vtype, off;
    for (off = 0; (off = mjson_next(items, (int)sdslen(items), off, &koff,
                                    &klen, &voff, &vlen, &vtype)) != 0;) {
        sds token = sdsnewlen(items + voff, (size_t)vlen);
        // MYMPD_LOG_WARN(NULL, "parsing %s", token);
        bool streamable;
        if (json_get_bool(token, "$.streamable", &streamable, NULL) == false) {
            streamable = false;
        }
        bool sampleable;
        if (json_get_bool(token, "$.sampleable", &sampleable, NULL) == false) {
            sampleable = false;
        }
        const char *availability = (streamable == true) ? "stream" : (sampleable == true) ? "sample" : NULL;
        if (availability != NULL) {
            MYMPD_LOG_WARN(NULL, "availability: %sable", availability);
            int id; // TODO change to long long or long
            if (json_get_int_max(token, "$.id", &id, NULL) == true) {
                sds uri = sdscatfmt(sdsempty(), "https://mympd-qobuz/track/%i/%s", id, availability);
                MYMPD_LOG_WARN(NULL, "%s", uri);
                list_push(uris, uri, id, availability, NULL);
                count++;
                FREE_SDS(uri); // FIXME clear/replace should be faster
            }
        }
        else {
            MYMPD_LOG_WARN(NULL, "not available");
        }

        // if (streamable == true) {
        //     MYMPD_LOG_WARN(NULL, "streamable true");
        //     int id;
        //     json_get_int_max(token, "$.id", &id, NULL);
        //     sds stream_url = internal_get_stream_url(id);
        //     if (stream_url != NULL) {
        //         list_push(uris, stream_url, id, NULL, NULL);
        //     }
        //     count++;
        //     FREE_SDS(stream_url);
        // }
        // else {
        //     MYMPD_LOG_WARN(NULL, "streamable false");
        // }

        FREE_SDS(token);
    }

    // separate function
    // struct t_list_node *first_node = list_node_at(uris, 0);
    struct t_list_node *first = list_shift_first(uris);
    if (first != NULL) {
        // long long first_id = first_node->value_i;
        // const char* first_availability = first_node->value_p;
        sds first_song_uri = internal_get_stream_url((int)first->value_i);
        if (first_song_uri != NULL) {
            // list_replace(uris, 0, first_song_uri, first_id, first_availability, NULL);
            list_insert(uris, first_song_uri, first->value_i, first->value_p, NULL);
        }
        FREE_SDS(first_song_uri);
    }
    list_node_free(first);

    MYMPD_LOG_WARN(NULL, "count = %d", count);
    // FREE_SDS(temp);
    FREE_SDS(items);

}

// void get_album_streams(const char* album_id, struct t_list *uris) {
//     MYMPD_LOG_WARN(NULL, "get album streams %s", album_id);
//     sds album_data = album_get(album_id);
//     parse_album_data_for_streams(album_data, uris);
// }

void qobuz_get_album_streams(const char* album_id, struct t_list *uris) {
    // collection type album, validation
    // album
    // clock_t start, end;
    // double cpu_time_used;
    // start = clock();
    MYMPD_LOG_WARN(NULL, "get album %s", album_id);


    sds response = album_get(album_id);
    // get_album_streams(album_id, uris);

        
    // int tracks_count;
    // json_get_int_max(response, "$.tracks_count", &tracks_count, NULL); // TODO use min/max
    // MYMPD_LOG_WARN(NULL, " tracks count %d", tracks_count);
    // long tracks_id[tracks_count];
    // long *tracks_id = malloc((size_t)tracks_count * sizeof(long));
    // parse_tracks_simple(response, tracks_id, tracks_count);
        
    
    // parse_tracks_simple(response, uris);
    parse_album_data_for_streams(response, uris);
    
    
    // end = clock();
    // cpu_time_used = ((double) (end - start)) / CLOCKS_PER_SEC;
    // MYMPD_LOG_WARN(NULL, "%f", cpu_time_used);
    FREE_SDS(response);
}

/**
 * Private functions
 */

// admin/search-filter

static sds album_get(const char *album_id) {
    Parameter params[] = {{"album_id", sdsnew(album_id)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("album/get", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

// album/getFeatured

// TODO common function for type_search

static sds album_search(const char *query, unsigned limit, unsigned offset) {
    Parameter params[] = {{"query", sdsnew(query)},
                          {"limit", sdsfromlonglong(limit)},
                          {"offset", sdsfromlonglong(offset)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    // qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("album/search", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

// artist/get - will be DEPRECATE, use OFFICIAL DISCOGRAPHY endpoints instead
// artist/getReleasesGrid (OFFICIAL DISCOGRAPHY)
// artist/getReleasesList (OFFICIAL DISCOGRAPHY)
// artist/getSimilarArtists - will be DEPRECATE, use OFFICIAL DISCOGRAPHY
// endpoints instead artist/page (OFFICIAL DISCOGRAPHY) artist/search
// catalog/autocomplete
// catalog/count
// catalog/getFeatured
// catalog/getFeaturedTypes

// static sds catalog_search(const char *query, unsigned offset, unsigned limit)
// {
//     Parameter params[] = {
//         {"query", sdsnew(query)},
//         {"offset", sdsfromlonglong(offset)},
//         {"limit", sdsfromlonglong(limit)}
//     };
//     size_t num_params = sizeof(params) / sizeof(params[0]);
//     qsort(params, num_params, sizeof(Parameter), compare_params);
//     sds url = build_url("catalog/search", params, num_params);
//     sds response = request("GET", url, NULL);
//     parameter_free(params, num_params);
//     FREE_SDS(url);
//     return response;
// }

// static Parameter* build_params(int num_args, ...) {
//     va_list args;
//     va_start(args, num_args);
//     Parameter *params = malloc(num_args * sizeof(Parameter));
//     for (int i = 0; i < num_args; i++) {
//         if (i % 2 == 0) {
//             params[i].key = va_arg(args, const char *);
//         } else {
//             params[i].value = va_arg(args, sds);
//         }
//     }
//     va_end(args);
//     return params;
// }
// Parameter *params = build_params(3, "query", sdsnew(query), "offset",
// sdsfromlonglong(offset), "limit", sdsfromlonglong(limit));

// dynamic/suggest
// dunamic-tracks/get
// dynamic-tracks/list
// favorite/create

// TODO add album_ids, aricle_ids, artist_ids
// static sds favorite_create(struct t_list *track_ids) {
//     sds url = build_url("favorite/create", NULL, 0);
//     sds json = build_json(track_ids);
// }

// favorite/delete

static sds favorite_get_user_favorites(const char *type, unsigned limit,
                                       unsigned offset) {
    Parameter params[] = {{"limit", sdsfromlonglong(limit)},
                          {"offset", sdsfromlonglong(offset)},
                          {"type", sdsnew(type)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    // qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("favorite/getUserFavorites", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

static sds favorite_get_user_favorite_ids(void) {
    sds url = build_url("favorite/getUserFavoriteIds", NULL, 0);
    sds response = request("GET", url, NULL);
    FREE_SDS(url);
    return response;
}

// favorite/status

static sds favorite_toggle(const char *type, const char *item_id) {
    // FIXME use POST
    Parameter params[] = {{"item_id", sdsnew(item_id)}, {"type", sdsnew(type)}};
    size_t num_params = sizeof(params) / sizeof(params[0]);
    // qsort(params, num_params, sizeof(Parameter), compare_params);
    sds url = build_url("favorite/toggle", params, num_params);
    sds response = request("GET", url, NULL);
    parameter_free(params, num_params);
    FREE_SDS(url);
    return response;
}

sds qobuz_favorite_toggle(sds buffer, enum mympd_cmd_ids cmd_id,
                          long request_id, const char *type,
                          const char *item_id) {
    sds response = favorite_toggle(type, item_id);

    buffer = jsonrpc_respond_start(buffer, cmd_id, request_id);
    // FIXME no data, key/value
    buffer = tojson_raw(buffer, "data", response, false);
    buffer = jsonrpc_end(buffer);

    FREE_SDS(response);

    return buffer;
}

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
    // TODO
    // sds json = sdsempty();
    // json = list_to_json_array(json, tracks_id);
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
    // qsort(params, num_params, sizeof(Parameter), compare_params);
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

static bool login(const char *username, const char *password, sds *error) {
    qobuz_client.user_auth_token = NULL;

    curl_slist_free_all(qobuz_client.headers);
    qobuz_client.headers = NULL;
    sds header = sdsempty();
    header = sdscatfmt(header, "x-app-id: %s", qobuz_client.app_id);
    qobuz_client.headers = curl_slist_append(qobuz_client.headers, header);
    curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPHEADER,
                     qobuz_client.headers);

    sds username_encoded =
        sds_urlencode(sdsempty(), username, strlen(username));
    sds response = user_login(username_encoded, password);

    bool rc = json_get_string(response, "$.user_auth_token", 1, 100,
                              &qobuz_client.user_auth_token, vcb_isalnum, NULL);
    if (rc) {
        sdsclear(header);
        header = sdscatfmt(header, "x-user-auth-token: %S",
                           qobuz_client.user_auth_token);
        qobuz_client.headers = curl_slist_append(qobuz_client.headers, header);
        curl_easy_setopt(qobuz_client.curl_handle, CURLOPT_HTTPHEADER,
                         qobuz_client.headers);

        // if (set_credentials(username, password) == false) {
        //     MYMPD_LOG_ERROR(NULL, "Unable to store credentials");
        // }
        // bool a = set_credentials(username, password, qobuz_client.config);
        MYMPD_LOG_INFO(NULL, "Log in successful");
    } else {
        sds message = NULL; // error
        json_get_string(response, "$.message", 1, 100, &message, vcb_istext,
                        NULL);
        *error = sdscatsds(*error, message);
        MYMPD_LOG_ERROR(NULL, "%s %s", message, *error);

        // FIXME move to func / set befare call (on logout)
        // if (set_credentials("", "") == false) {
        //     MYMPD_LOG_ERROR(NULL, "Unable to clear credentials");
        // }
        // bool a = set_credentials(NULL, NULL, qobuz_client.config);
    }

    FREE_SDS(header);
    FREE_SDS(response);
    FREE_SDS(username_encoded);

    return rc;
}

static sds parse_album(sds buffer, sds res) {
    // FIXME allow non obj print
    // char *id = NULL;
    // long id;
    sds id = NULL;
    // char *genre_name = NULL;
    sds genre_name = NULL;
    int tracks_count;
    // int media_count;
    // char *title = NULL;
    sds title = NULL;
    // long int released_at; // change to unsigned long parse front ?
    int duration;
    sds artist_name = NULL;
    // sds release_date_original = NULL;
    // released_at
    sds image_small = NULL;
    sds image_large = NULL;

    // int maximum_channel_count;
    // float maximum_sampling_rate;
    // int maximum_bit_depth;
    // bool streamable;
    // hires hires_streamable

    // json_scanf(res, sdslen(res),
    // "{tracks_count:%d,genre:{name:%Q},image:{large:%Q},id:%Q,title:%Q,released_at:%lu,duration:%d,artist:{name:%Q}}",
    //     &tracks_count, &genre_name, &image_large, &id, &title, &released_at,
    //     &duration, &artist_name);

    // json_get_long_max(res, "$.id", &id, NULL);
    if (json_get_string(res, "$.id", 0, 100, &id, vcb_isalnum, NULL) == false) {
        id = sdsempty();
    }
    if (json_get_string(res, "$.genre.name", 0, 100, &genre_name, vcb_istext,
                        NULL) == false) {
        genre_name = sdsempty();
    }
    json_get_int_max(res, "$.tracks_count", &tracks_count, NULL);
    json_get_string_max(res, "$.title", &title, vcb_istext, NULL); // FIXME max
    json_get_int_max(res, "$.duration", &duration, NULL);
    // image
    if (json_get_string(res, "$.artist.name", 0, 100, &artist_name, vcb_istext,
                        NULL) == false) {
        artist_name = sdsempty();
    }
    if (json_get_string_max(res, "$.image.small", &image_small, vcb_isstreamuri,
                            NULL) == false) {
        image_small = sdsempty();
    }
    if (json_get_string_max(res, "$.image.large", &image_large, vcb_isstreamuri,
                            NULL) == false) {
        image_large = sdsempty();
    }

    // json_get_int_max(res, "$.media_count", &media_count, NULL);

    buffer = sdscatlen(buffer, "{", 1);
    buffer = tojson_char(buffer, "Type", "qobuzAlbum", true); // FIXME create custom context menu for this type
    // buffer = tojson_char(buffer, "Artist", artist_name, true);
    buffer = tojson_sds(buffer, "Album", title, true);
    // buffer = tojson_char(buffer, "AlbumArtist", artist_name, true);
    buffer = sdscatfmt(buffer, "\"AlbumArtist\":[\"%S\"],", artist_name);
    buffer = tojson_sds(buffer, "AlbumId", id, true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    buffer = tojson_sds(buffer, "ImageSmall", image_small, true);
    buffer = tojson_sds(buffer, "ImageLarge", image_large, true);
    // last modified
    sds uri = sdscatfmt(sdsempty(), "qobuz://album/%S", id);
    buffer = tojson_sds(buffer, "uri", uri, false);
    // discs
    // song count
    // first song uri
    // buffer = tojson_char(buffer, "Title", NULL, true);
    // buffer = tojson_char(buffer, "Track", NULL, true);
    // buffer = tojson_char(buffer, "Genre", genre_name, true);
    // buffer = tojson_long(buffer, "Date", released_at, true);
    // buffer = tojson_char(buffer, "Composer", NULL, true);
    // buffer = tojson_char(buffer, "Performer", NULL, false);
    buffer = sdscatlen(buffer, "}", 1);

    FREE_SDS(uri);
    FREE_SDS(artist_name);
    FREE_SDS(title);
    FREE_SDS(id);
    FREE_SDS(image_small);
    FREE_SDS(image_large);
    FREE_SDS(genre_name);

    return buffer;
}

// FIXME generic type parser

static sds parse_albums(sds buffer, sds res, unsigned *cnt, unsigned *ret) {
    // FIXME generic parse [] of type
    struct t_jsonrpc_parse_error parse_error;
    jsonrpc_parse_error_init(&parse_error);
    unsigned limit = 0;
    unsigned total;
    // json_scanf(res, sdslen(res), "{albums:{limit:%d,total:%d}}", &limit,
    // &total); if (limit && total) {
    //     (*cnt) += total;
    //     struct json_token item;
    //     for (int i = 0; json_scanf_array_elem(res, sdslen(res),
    //     ".albums.items", i, &item) > 0; i++) {
    //         if ((*ret)++) {
    //             buffer = sdscatlen(buffer, ",", 1);
    //         }
    //         sds token = sdsnewlen(item.ptr, item.len);
    //         buffer = parse_album(buffer, token);
    //         sdsfree(token);
    //     }
    // }
    json_get_uint_max(res, "$.albums.limit", &limit, NULL);
    if (json_get_uint_max(res, "$.albums.total", &total, NULL) == true &&
        total > 0) {
        (*cnt) += total;
        // struct json_token item;
        sds items = json_get_key_as_sds(res, "$.albums.items");
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
            buffer = parse_album(buffer, token);
            FREE_SDS(token);
        }
        FREE_SDS(items);
    }
    return buffer;
}

// parse_album_tracks

static sds parse_track(sds buffer, sds res) {
    sds album_genre_name = NULL;
    sds album_title = NULL;
    sds album_artist_name = NULL;
    sds album_image_small = NULL;
    sds album_image_large = NULL;
    int track_number;
    long id;
    int duration;
    sds title = NULL;
    bool parental_warning;
    bool streamable;
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
    if (json_get_string_max(res, "$.album.image.small", &album_image_small,
                            vcb_isstreamuri, NULL) == false) {
        album_image_small = sdsempty();
    }
    if (json_get_string_max(res, "$.album.image.large", &album_image_large,
                            vcb_isstreamuri, NULL) == false) {
        // FIXME tojson here, or null
        album_image_large = sdsempty();
    }
    if (json_get_string(res, "$.album.title", 0, 100, &album_title, vcb_istext,
                        NULL) == false) {
        album_title = sdsempty();
    }
    // FIXME handle null token
    if (json_get_string(res, "$.album.artist.name", 0, 100, &album_artist_name,
                        vcb_istext, NULL) == false) {
        album_artist_name = sdsempty();
    }

    json_get_bool(res, "$.parental_warning", &parental_warning, NULL);
    json_get_bool(res, "$.streamable", &streamable, NULL);

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
    buffer = tojson_sds(buffer, "ImageSmall", album_image_small, true);
    buffer = tojson_sds(buffer, "ImageLarge", album_image_large, true);
    buffer = tojson_bool(buffer, "parental_warning", parental_warning, true);
    buffer = tojson_bool(buffer, "streamable", streamable, true);
    buffer = tojson_char(buffer, "Genre", album_genre_name, false);
    buffer = sdscatlen(buffer, "}", 1);

    FREE_SDS(uri);
    FREE_SDS(title);
    FREE_SDS(album_artist_name);
    FREE_SDS(album_title);
    FREE_SDS(album_image_large);
    FREE_SDS(album_genre_name);
    FREE_SDS(album_image_small);
    FREE_SDS(album_image_large);

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
    // print_headers(qobuz_client.headers);
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

    sds response = sdsnewlen(chunk.memory, chunk.size);
    // FIXME handle error message properly
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
    struct curl_slist *current = headers;
    MYMPD_LOG_INFO(NULL, "Headers:");
    while (current) {
        MYMPD_LOG_INFO(NULL, "%s", current->data);
        current = current->next;
    }
}

static void print_parameters(const Parameter *params, size_t num_params) {
    MYMPD_LOG_INFO(NULL, "Parameters:");
    for (size_t i = 0; i < num_params; i++) {
        MYMPD_LOG_INFO(NULL, "%s: %s", params[i].name, params[i].value);
    }
}

// A simple function to split a string by a delimiter and return the nth token
char* get_nth_token(char* string, const char* delimiter, int n) {
    char* token;
    char* rest = string;
    int i = 0;

    while ((token = strtok_r(rest, delimiter, &rest))) {
        if (++i == n) {
            return token;
        }
    }
    return NULL;
}

// A function to parse the custom URI
void parseCustomUri(const char* uri, char* trackId, char* availability, bool* isCustomUri) {
    const char* customDomain = "mympd-qobuz";
    char uriCopy[256];
    strcpy(uriCopy, uri); // Make a copy of the URI for tokenization

    // Check if the URI is a custom one
    *isCustomUri = strstr(uri, customDomain) != NULL;

    // Extract the track ID and availability
    strcpy(trackId, get_nth_token(uriCopy, "/", 4));
    strcpy(availability, get_nth_token(uriCopy, "/", 5));
}
