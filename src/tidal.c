#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>

#include "../dist/src/frozen/frozen.h"
#include "../dist/src/sds/sds.h"
#include "list.h"
#include "config_defs.h"
#include "log.h"
#include "sds_extras.h"
#include "utility.h"
#include "tidal/tidal_utility.h"
#include "tidal.h"

#define TIDAL_API = "https://api.tidal.com/v1"
#define TIDALHIFI_API "https://api.tidalhifi.com/v1"
#define TIDAL_RESOURCES "https://resources.tidal.com/images"
// 320x320 480x480 640x428
//IMG_URL = "http://images.osl.wimpmusic.com/im/im?w={width}&h={height}&{id_type}={id}" // 512x512
//http://resources.wimpmusic.com/images/%s/342x342.jpg moods
//http://resources.wimpmusic.com/images/%s/460x306.jpg genres

// TODO: fxssl

static int curl_cleanup = 0;
static const char *tidal_token; // hard code token
static sds tidal_username;
static sds tidal_password;
static sds tidal_audioquality;
static sds cache_dir;
static CURL *tidalhandle; // pass handler as param
struct memory_struct chunk;
//static struct curl_slist *slist = NULL;
static char *user_id = NULL;
static char *session_id = NULL;
static char *country_code = NULL; // "US"
static bool is_logged_in = false;

static void unused(void);

size_t write_callback(void *contents, size_t size, size_t nmemb, void *userp) {
    size_t realsize = size * nmemb;
    struct memory_struct *mem = (struct memory_struct *)userp;

    char *ptr = realloc(mem->memory, mem->size + realsize + 1);
    if (ptr == NULL) {
        // out of memory
        LOG_ERROR("not enough memory (realloc returned NULL)");
        return 0;
    }

    mem->memory = ptr;
    memcpy(&(mem->memory[mem->size]), contents, realsize);
    mem->size += realsize;
    mem->memory[mem->size] = 0;

    return realsize;
}

bool tidal_init(t_config *config) {
    if (curl_global_init(CURL_GLOBAL_ALL) == 0) {
        curl_cleanup++;
        // api_token = "kgsOOmYk3zShYrNP";
        // preview_token = "8C7kRFdkaRp0dLBp";
        tidal_token = "kgsOOmYk3zShYrNP";
        tidal_username = sdsempty();
        tidal_password = sdsempty();
        tidal_audioquality = sdsnew("HIGH");
        //tidal_token = config->tidal_token;
        //tidal_username = config->tidal_username;
        //tidal_password = config->tidal_password;
        //tidal_audioquality = config->tidal_audioquality;
        cache_dir = sdscatfmt(sdsempty(), "%s/covercache", config->varlibdir);
        tidalhandle = curl_easy_init();
        if (tidalhandle) {
            curl_cleanup++;
            curl_easy_setopt(tidalhandle, CURLOPT_WRITEFUNCTION, write_callback);
            curl_easy_setopt(tidalhandle, CURLOPT_WRITEDATA, &chunk);
            //errorbuffer opt for adv error handling
            //sds s = sdscat(sdsnew("x-tidal-token: "), tidal_token);
            //slist = curl_slist_append(slist, s);
            //curl_easy_setopt(tidalhandle, CURLOPT_HTTPHEADER, slist);
            //sdsfree(s);
            unused();
            return true;
        }
        else { // NULL
            LOG_ERROR("curl_easy_init");
            return false;
        }
    }
    else { // non-zero
        LOG_ERROR("curl_global_init");
        return false;
    }
}

void tidal_cleanup(void) {
    FREE_PTR(country_code);
    FREE_PTR(session_id);
    //curl_slist_free_all(slist);
    if (curl_cleanup--)
        curl_easy_cleanup(tidalhandle);
    sdsfree(cache_dir);
    sdsfree(tidal_audioquality);
    sdsfree(tidal_password);
    sdsfree(tidal_username);
    if (curl_cleanup--)
        curl_global_cleanup();
}

static void logout(void) {
    user_id = NULL; // ""
    session_id = NULL; // ""
    country_code = NULL; // ""
}

static bool login(const char *username, const char *password) {
    logout();
    if (!username || !password)
        return false;
    
    chunk.memory = malloc(1);
    chunk.size = 0;
    
    sds url = sdscat(sdsnew(TIDALHIFI_API), "/login/username");
    curl_easy_setopt(tidalhandle, CURLOPT_URL, url);
    // x-tidal-token
    sds data = sdscatfmt(sdsempty(), "token=%s&username=%s&password=%s", tidal_token, username, password);
    curl_easy_setopt(tidalhandle, CURLOPT_POSTFIELDS, data);
    // bypass auth w/ ua plus opts
    
    CURLcode res = curl_easy_perform(tidalhandle);
    sdsfree(data);
    sdsfree(url);
    if (res != CURLE_OK) {
        LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        free(chunk.memory);
        return false;
    }
    else { // 0
        int je = json_scanf(chunk.memory, chunk.size, "{userId:%lu,sessionId:%Q,countryCode:%Q}", &user_id, &session_id, &country_code);
        if (je == 3) {
            LOG_INFO("Login successful");
            LOG_DEBUG(chunk.memory);
            free(chunk.memory);
            return true;
        }
        else {
            // status subStatus userMessage
            char *user_message = NULL;
            json_scanf(chunk.memory, chunk.size, "{userMessage:%Q}", &user_message);
            LOG_ERROR(user_message);
            FREE_PTR(user_message);
            free(chunk.memory);
            return false;
        }
    }
}

void tidal_session_init(sds username, sds password, sds audioquality) {
    tidal_username = sdsreplacelen(tidal_username, username, sdslen(username));
    tidal_password = sdsreplacelen(tidal_password, password, sdslen(password));
    tidal_audioquality = sdsreplacelen(tidal_audioquality, audioquality, sdslen(audioquality));
    is_logged_in = login(username, password);
}

static bool otherconf_w(const char *filename) {
    // same locations as mpd.conf
    //sds other_conf = sdscatfmt(sdsempty(), "%s/%s", ETC_PATH, filename);
    sds other_conf = sdscatfmt(sdsempty(), "/usr/local/etc/%s", filename);
    FILE *fp = fopen(other_conf, "w");
    sdsfree(other_conf);
    if (fp) { // other.conf soccessfully opened
        sds buffer = sdscatfmt(sdsempty(), "input {\n\tplugin \"tidal\"\n\ttoken \"%s\"\n\tusername \"%s\"\n\tpassword \"%s\"\n\taudioquality \"%s\"\n}\n",
            tidal_token, tidal_username, tidal_password, tidal_audioquality);
        fputs(buffer, fp);
        sdsfree(buffer);
        fclose(fp);
        return true;
    }
    return false;
}

static bool mpdconf_ra(const char *filename) {
    // add to config/settings with default location /etc/mpd.conf
    //sds mpd_conf = sdscatfmt(sdsempty(), "%s/mpd.conf", ETC_PATH);
    sds mpd_conf = sdsnew("/usr/local/etc/mpd.conf");
    //sds include = sdsnew("include \"tidal_input_plugin.conf\"");
    sds include = sdscatfmt(sdsempty(), "include \"%s\"", filename);
    bool found = false;
    char *line = NULL;
    size_t n =0;
    ssize_t read= 0;
    FILE *fp = fopen(mpd_conf, "r");
    if (fp) { // mpd.conf successfully opened
        while ((read = getline(&line, &n, fp)) > 0) {
            if (strcmp(line, include) == 0) {
                found = true;
                break;
            }
        }
        sdsfree(mpd_conf);
        if (!found) { // append mpd.conf
            fp = freopen(NULL, "a", fp);
            if (fp) { // mpd.conf successfully reopend
                fputs("\n", fp);
                fputs(include, fp);
                fputs("\n", fp);
                sdsfree(include);
                fclose(fp);
                return otherconf_w(filename); // proceed with restart if true
            }
            else {
                LOG_ERROR("Can't open %s for write", mpd_conf);
                sdsfree(include);
                return false;
            }
        }
        else { // found
            fputs("\n", fp);
            fputs(include, fp);
            fputs("\n", fp);
            sdsfree(include);
            fclose(fp);
            return otherconf_w(filename); // proceed with restart if true
        }
    }
    sdsfree(include);
    return false;
}

static bool restart_mpd(void) {
    sds cmdline = sdsnew("systemctl restart mpd");
    LOG_DEBUG("Executing syscmd: %s", cmdline);
    LOG_INFO("Restarting mpd service...");
    const int rc = system(cmdline);
    if (rc == 0) {
        LOG_INFO("Success");
        return true;
    }
    else {
        LOG_ERROR("Fail");
        return false;
    }
}

void tidal_session_update(sds username, sds password, sds audioquality) {
    bool user = false;
    bool qual = false;
    if (sdscmp(username, tidal_username) || sdscmp(password, tidal_password) || sdscmp(audioquality, tidal_audioquality)) {
        tidal_username = sdsreplacelen(tidal_username, username, sdslen(username));
        tidal_password = sdsreplacelen(tidal_password, password, sdslen(password));
        is_logged_in = login(username, password);
        LOG_DEBUG("username set to %s, password set to %s", username, password);
        user = true;
    }
    if (sdscmp(audioquality, tidal_audioquality)) {
        tidal_audioquality = sdsreplacelen(tidal_audioquality, audioquality, sdslen(audioquality));
        LOG_DEBUG("audioquality set to %s", audioquality);
        qual = true;
    }
    if (user || qual) {
        if (mpdconf_ra("tidal_input_plugin.conf")) {
            LOG_INFO("mpd.conf updated, attempting to restart service");
            restart_mpd();
        }
    }
}

static sds request(sds buffer, const char *method, sds uri) {
    if (!is_logged_in) {
        buffer = sdscrop(buffer);
        return buffer;
    }
    // add x-tidal-sessionid and x-tidal-token headers
    chunk.memory = malloc(1);
    chunk.size = 0;

    sds url = sdscatfmt(sdsnew(TIDALHIFI_API), "%s&sessionId=%s&countryCode=%s", uri, session_id, country_code);
    curl_easy_setopt(tidalhandle, CURLOPT_URL, url);
    if (strcmp(method, "GET") == 0)
        curl_easy_setopt(tidalhandle, CURLOPT_HTTPGET, 1L);
    
    CURLcode res = curl_easy_perform(tidalhandle);
    LOG_DEBUG("%s %s", method, url);
    if (res != CURLE_OK) {
        LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
    }
    else {
        // check for usermessage in response
        // 401 6001 user does not have a valid session -> call login and make the request again
        buffer = sdscatlen(buffer, chunk.memory, chunk.size);
        LOG_INFO("%lu bytes retrieved", (unsigned long)chunk.size);
    }

    sdsfree(url);
    free(chunk.memory);
    return buffer;
}

// save image to cache dir, merge w/ get cover
static bool get_image(const char *cover) {
    char *c = strdup(cover);
    replacechar(c, '-', '_');
    sds path = sdscatfmt(sdsnew(cache_dir), "/%s_320x320.jpg", c);
    FILE *file = fopen(path, "wbx");
    if (file == NULL) {
        perror("Error opening file"); // upd if file exists
        return false;
    }
    else {
        CURL *easyhandle = curl_easy_init();
        if (easyhandle) {
            replacechar(c, '_', '/');
            sds url = sdscatfmt(sdsnew(TIDAL_RESOURCES), "/%s/320x320.jpg", c);
            curl_easy_setopt(easyhandle, CURLOPT_URL, url);
            curl_easy_setopt(easyhandle, CURLOPT_WRITEFUNCTION, NULL);
            curl_easy_setopt(easyhandle, CURLOPT_WRITEDATA, file);
            CURLcode res = curl_easy_perform(easyhandle);
            if (res != CURLE_OK) {
                LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
                return false;
            }
            sdsfree(url);
        }
        else {
            LOG_ERROR("curl_easy_init");
            return false;
        }
        fclose(file);
    }
    sdsfree(path);
    FREE_PTR(c);
    return true;
}
/*
static sds get_user(sds buffer, int id) {
    sds url= sdscatfmt(sdsempty(), "/users/%u?", user_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_user_subscription(sds buffer, int id) {
    sds url = sdscatprintf(sdsempty(), "/users/%lu/subscrtiption?", user_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_user_playlists(sds buffer, int id) {
    sds url = sdscatfmt(sdsempty(), "/users/%u/playlists?", user_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_playlist(sds buffer, int playlist_id) {
    sds url = sdscatfmt(sdsempty(), "/playlists/%u?", playlist_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_playlist_tracks(sds buffer, int playlist_id) {
    sds url = sdscatfmt(sdsempty(), "/playlists/%u/tracks?", playlist_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}
*/
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
/*
static sds get_artist_similar(sds buffer, const char *artist_id, const unsigned limit, const unsigned offset) {
    sds url = sdscatfmt(sdsempty(), "/artists/%s/similar?limit=%u&offset=%u", artist_id, limit, offset);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}
*/
static sds get_artist_radio(sds buffer, const char *artist_id) {
    // items ? set 100/0
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
    // items ? set 100/0
    sds url = sdscatfmt(sdsempty(), "/tracks/%s/radio?limit=100", track_id);
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

static sds get_track_url(sds buffer, const char *track_id) {
    // /tracks/track_id/urlpost(pre)paywall?assetpresentation=FULL(PREVIEW)&audioquality=audioquality&urlusagemode=STREAM(?)
    // urls[] trackId assetPresentation audioQuality audioMode streamingSessionId codec securityType securityToken
    sds url = sdscatfmt(sdsempty(), "/tracks/%s/streamUrl?soundQuality=%s", track_id, tidal_audioquality);
    // url trackId playTimeLeftInMinutes soundQuality encryptionKey codec
    buffer = request(buffer, "GET", url);
    sdsfree(url);
    return buffer;
}

// featured featured_items moods mood_playlists genres genre_items

static sds parse_artist(sds buffer, sds res) {
    char *id = NULL;
    char *name = NULL;
    json_scanf(res, sdslen(res), "{id:%Q,name:%Q}", &id, &name);
    buffer = sdscat(buffer, "{");
    buffer = tojson_char(buffer, "Type", "artist", true);
    buffer = tojson_char(buffer, "id", id, true);
    //sds uri = sdscatfmt(sdsempty(), "tidal://artist/%s", id);
    //buffer = tojson_char_len(buffer, "uri", uri, sdslen(uri), true);
    buffer = tojson_char(buffer, "Artist", name, true);
    buffer = tojson_char(buffer, "Title", NULL, true);
    buffer = tojson_char(buffer, "Duration", NULL, true);
    buffer = tojson_char(buffer, "Track", NULL, true);
    buffer = tojson_char(buffer, "Album", NULL, true);
    buffer = tojson_char(buffer, "AlbumArtist", NULL, true); // name
    //buffer = tojson_char(buffer, "Genre", NULL, true);
    //buffer = tojson_char(buffer, "Composer", NULL, true);
    //buffer = tojson_char(buffer, "Performer", NULL, true);
    buffer = tojson_char(buffer, "Date", NULL, false);
    buffer = sdscat(buffer, "}");
    //sdsfree(uri);
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
        struct json_token item;
        for (int i = 0; json_scanf_array_elem(res, sdslen(res), path, i, &item) > 0; i++) {
            sds token = sdscatlen(sdsempty(), item.ptr, item.len);
            buffer = parse_artist(buffer, token);
            buffer = sdscat(buffer, ",");
            sdsfree(token);
        }
        sdsrange(buffer, 0, -2);
    }
    sdsfree(path);
    return buffer;
}

static sds parse_album(sds buffer, sds res) {
    char *id = NULL;
    char *title = NULL;
    int duration;
    char *releasedate = NULL;
    char *artist0 = NULL;
    //sds artist0 = sdsempty();
    //sds artists = sdsempty();
    json_scanf(res, sdslen(res), "{id:%Q,title:%Q,duration:%d,releaseDate:%Q}", &id, &title, &duration, &releasedate);
    struct json_token artist;
    json_scanf_array_elem(res, sdslen(res), ".artists", 0, &artist);
    json_scanf(artist.ptr, artist.len, "{name:%Q}", &artist0);
    /*
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
    */
    buffer = sdscat(buffer, "{");
    buffer = tojson_char(buffer, "Type", "album", true);
    buffer = tojson_char(buffer, "id", id, true);
    buffer = tojson_char(buffer, "Title", NULL, true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    buffer = tojson_char(buffer, "Track", NULL, true);
    buffer = tojson_char(buffer, "Artist", artist0, true);
    buffer = tojson_char(buffer, "Album", title, true);
    buffer = tojson_char(buffer, "AlbumArtist", artist0, true); // artist0
    //buffer = tojson_char(buffer, "Genre", NULL, true);
    //buffer = tojson_char(buffer, "Composer", NULL, true);
    //buffer = tojson_char(buffer, "Performer", NULL, true);
    buffer = tojson_char(buffer, "Date", releasedate, false);
    buffer = sdscat(buffer, "}");
    //sdsfree(artist0);
    //sdsfree(artists);
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
            buffer = sdscat(buffer, ",");
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
    //char *album_cover = NULL;
    char *album_releasedate = NULL;
    char *artist0 = NULL;
    //sds artist0 = sdsempty();
    //sds artists = sdsempty();
    json_scanf(res, sdslen(res), "{id:%Q,title:%Q,duration:%d,trackNumber:%d,artist:{name:%Q},album:{title:%Q,releaseDate:%Q}}",
            &id, &title, &duration, &tracknumber, &artist_name, &album_title, &album_releasedate);
    struct json_token artist;
    json_scanf_array_elem(res, sdslen(res), ".artists", 0, &artist);
    json_scanf(artist.ptr, artist.len, "{name:%Q}", &artist0);
    /*
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
    */
    buffer = sdscat(buffer, "{");
    buffer = tojson_char(buffer, "Type", "song", true);
    buffer = tojson_char(buffer, "id", id, true);
    buffer = tojson_char(buffer, "Title", title, true);
    buffer = tojson_long(buffer, "Duration", duration, true);
    buffer = tojson_long(buffer, "Track", tracknumber, true);
    buffer = tojson_char(buffer, "Artist", artist0, true);
    buffer = tojson_char(buffer, "Album", album_title, true);
    buffer = tojson_char(buffer, "AlbumArtist", artist0, true); // artist0
    //buffer = tojson_char(buffer, "Genre", NULL, true);
    //buffer = tojson_char(buffer, "Composer", NULL, true);
    //buffer = tojson_char(buffer, "Performer", NULL, true);
    buffer = tojson_char(buffer, "Date", album_releasedate, false);
    buffer = sdscat(buffer, "}");
    //sdsfree(artist0);
    //sdsfree(artists);
    FREE_PTR(id);
    FREE_PTR(title);
    FREE_PTR(artist_name);
    FREE_PTR(artists_name);
    FREE_PTR(album_title);
    //FREE_PTR(album_cover);
    FREE_PTR(album_releasedate);
    FREE_PTR(artist0);
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
            sds token = sdsnewlen(item.ptr, item.len);
            buffer = parse_track(buffer, token);
            buffer = sdscat(buffer, ",");
            sdsfree(token);
        }
        sdsrange(buffer, 0, -2);
    }
    sdsfree(path);
    return buffer;
}

static sds parse_tophit(sds buffer, sds res, unsigned *count) {
    char *value = NULL;
    char *type = NULL;
    int je = json_scanf(res, sdslen(res), "{topHit:{value:%Q,type:%Q}}", &value, &type);
    if (je == 2) {
        (*count)++;
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

sds tidal_search(sds buffer, sds method, int request_id, const char *query,
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
        limit = r1;
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
        char *query_encoded = curl_easy_escape(tidalhandle, query, strlen(query));
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
                    buffer = sdscat(buffer, ",");
                }
                buffer = sdscatsds(buffer, items);
            }
            items = sdscrop(items);
            items = parse_albums(sdsempty(), res, &t4);
            r4 = number_of_items(limit, offset, t4);
            if (r4) {
                if (r3 || r2 || r1) {
                    buffer = sdscat(buffer, ",");
                }
                buffer = sdscatsds(buffer, items);
            }
            r1 = t1; // dont count tophit
            sdsfree(items);
            sdsfree(url);
            curl_free(query_encoded);
        }
        else { // NULL
            LOG_ERROR("curl_easy_escape failed");
        }
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
    buffer = tojson_long(buffer, "maxTotalItems", max_item_cnt, true);
    buffer = tojson_long(buffer, "maxReturnedItems", max_items_ret, true);
    buffer = tojson_long(buffer, "sumTotalItems", sum_item_cnt, true);
    buffer = tojson_long(buffer, "sumReturnedItems", sum_items_ret, false);
    buffer = jsonrpc_end_result(buffer);
    sdsfree(res);
    return buffer;
}

sds tidal_get_cover(sds cover, const char *uri) { // track uri
    char *track_id = extract_id(uri);
    sds res = get_track(sdsempty(), track_id);
    // parse track
    char *c = NULL;
    json_scanf(res, sdslen(res), "{album:{cover:%Q}}", &c);
    if (c != NULL) {
        get_image(c);
        replacechar(c, '-', '/');
        cover = sdscatfmt(cover, "/image/%s/320x320.jpg", c);
    }
    FREE_PTR(track_id);
    FREE_PTR(c);
    sdsfree(res);
    return cover;
}

// tidal trackdetails, parse here for tags
sds tidal_songdetails(sds buffer, sds method, int request_id, const char *uri) {
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",");
    
    sds res = sdsempty();
    char *track_id = extract_id(uri);
    res = get_track(res, track_id);
    // parse_track
    char *album_id = NULL;
    char *album_cover = NULL;
    json_scanf(res, sdslen(res), "{album:{id:%Q,cover:%Q}}", &album_id, &album_cover);
    if (album_cover != NULL) {
        get_image(album_cover);
    }
    sdsrange(res, 1, -3);
    buffer = sdscatsds(buffer, res);
    buffer = sdscat(buffer, ",");
    res = sdscrop(res);
    res = get_album(res, album_id);
    char *releasedate = NULL;
    char *artist = NULL;
    json_scanf(res, sdslen(res), "{releaseDate:%Q,artist:{name:%Q}}", &releasedate, &artist);
    buffer = tojson_char(buffer, "releaseDate", releasedate, true);
    buffer = tojson_char(buffer, "artist", artist, false);
    buffer = sdscat(buffer, "}");
    buffer = jsonrpc_end_result(buffer);
    FREE_PTR(track_id);
    FREE_PTR(album_id);
    FREE_PTR(album_cover);
    FREE_PTR(releasedate);
    FREE_PTR(artist);
    sdsfree(res);
    return buffer;
}

sds tidal_albumdetails(sds buffer, sds method, int request_id, const char *uri) {
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",");
    char *album_id = extract_id(uri);
    sds res = get_album(sdsempty(), album_id);
    char *cover = NULL;
    json_scanf(res, sdslen(res), "{cover:%Q}", &cover);
    if (cover != NULL) {
        get_image(cover);
    }
    sdsrange(res, 1, -2);
    buffer = sdscatsds(buffer, res);
    buffer = jsonrpc_end_result(buffer);
    FREE_PTR(album_id);
    FREE_PTR(cover);
    sdsfree(res);
    return buffer;
}

sds tidal_artistdetails(sds buffer, sds method, int request_id, const char *uri) {
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",");
    sds res = sdsempty();
    char *artist_id = extract_id(uri);
    res = get_artist(res, artist_id);
    char *picture = NULL;
    json_scanf(res, sdslen(res), "{picture:%Q}", &picture);
    if (picture) {
        get_image(picture);
    }
    sdsrange(res, 1, -2);
    buffer = sdscatsds(buffer, res);
    buffer = sdscat(buffer, ",\"bio\":");
    // handle err no bio
    // handle null pic
    res = sdscrop(res);
    res = get_artist_bio(res, artist_id);
    buffer = sdscatsds(buffer, res);
    buffer = jsonrpc_end_result(buffer);
    FREE_PTR(artist_id);
    FREE_PTR(picture);
    sdsfree(res);
    return buffer;
}

// returns parsed track data plus streamUrl
sds tidal_queue_add_track(sds buffer, const char *uri) {
    char *track_id = extract_id(uri);
    sds res = get_track(sdsempty(), track_id); // raw track
    buffer = parse_track(buffer, res);
    res = sdscrop(res);
    res = get_track_url(res, track_id);
    char *url = NULL;
    json_scanf(res ,sdslen(res), "{url:%Q}", &url);
    sdsrange(buffer, 0, -2); // rm trailing bracket
    buffer = tojson_char(buffer, "url", url, false);
    buffer = sdscat(buffer, "}"); // add trailing bracket
    sdsfree(res);
    FREE_PTR(track_id);
    return buffer;
}
/* 
sds tidal_get_track_url(sds buffer, const char *track_id) {
    // /tracks/track_id/urlpost(pre)paywall?assetpresentation=FULL(PREVIEW)&audioquality=audioquality&urlusagemode=STREAM(?)
    // urls[] trackId assetPresentation audioQuality audioMode streamingSessionId codec securityType securityToken
    sds url = sdscatfmt(sdsempty(), "/tracks/%s/streamUrl?soundQuality=%s", track_id, tidal_audioquality);
    // url trackId playTimeLeftInMinutes soundQuality encryptionKey codec
    sds res = request(sdsempty(), "GET", url);
    //char *track_url = NULL;
    json_scanf(res, sdslen(res), "{url:%Q}", &buffer);
    sdsfree(url);
    sdsfree(res);
    return buffer;
}
 */
// test function
static void unused(void) {
    //printf("\n\tunsused start\n");
}
