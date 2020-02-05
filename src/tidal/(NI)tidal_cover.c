
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>
//#include <unistd.h>
//#include <libgen.h>
//#include <mpd/client.h>
#include <curl/curl.h>

#include "../../dist/src/sds/sds.h"
//#include "../sds_extras.h"
#include "../utility.h"
#include "../log.h"
//#include "../list.h"
//#include "config_defs.h"
//#include "../plugins.h"
#include "tidal_utility.h"
#include "tidal_cover.h"
//#include "../tidal.h"
//#include "../qobuz.h"

sds tidal_get_cover(const char *uri, sds cover) { // track uri
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
static bool get_image(const char *cover) { // mrg w/ get cover
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
                LOG_ERROR("curl_easy_perform() failed: %s", curl_easy_strerror(res));
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
