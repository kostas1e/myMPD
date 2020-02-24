#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <curl/curl.h>

#include "../../dist/src/sds/sds.h"
#include "../log.h"
#include "../list.h"
#include "config_defs.h"
#include "../utility.h"
#include "tidal_utility.h"

char *escape(const char *string) {
    char *encoded_string = NULL;
    CURL *curl = curl_easy_init();
    if (curl) {
        char *output = curl_easy_escape(curl, string, strlen(string));
        if (output) {
            encoded_string = strdup(output);
            LOG_DEBUG("Encoded: %s\n", output);
            curl_free(output);
        }
        else { // NULL
            LOG_ERROR("curl_easy_escape");
        }
        curl_easy_cleanup(curl);
    }
    else { // NULL
        LOG_ERROR("curl_easy_init");
    }
    return encoded_string;
}

// supported schemes album/id, artist/id, artist/id/mix, track/id/mix,
// tidal://type/id, www.tidal.com/type/id, streamurl
char *extract_id(const char *uri) {
    char *id;
    int count;
    sds *tokens = sdssplitlen(uri, strlen(uri), "/", 1, &count);
    if ((strstr(uri, "artist/") || strstr(uri, "track/")) && strstr(uri, "/mix")) {
        id = strdup(tokens[count - 2]);
    }
    else if (strstr(uri, "tidal://") || strstr(uri, "www.tidal.com") || strstr(uri, "album/") || strstr(uri, "artist/")) {
        id = strdup(tokens[count - 1]);
    }
    else { // streamUrl
        id = strdup(tokens[count - 2]);
        if (!strstr(uri, "/mix")) {
            strrev(id);
        }
    }
    sdsfreesplitres(tokens, count);
    return id;
}

char *strrev(char *str) {
    char *p1, *p2;

    if (! str || ! *str)
        return str;
    for (p1 = str, p2 = str + strlen(str) - 1; p2 > p1; ++p1, --p2) {
        *p1 ^= *p2;
        *p2 ^= *p1;
        *p1 ^= *p2;
    }
    return str;
}

unsigned max_of_four(unsigned a, unsigned b, unsigned c, unsigned d) {
    if ((a>b) && (a>c) && (a>d)) return a;
    else if ((b>a) && (b>c) && (b>d)) return b;
    else if ((c>a) && (c>b) && (c>d)) return c;
    else return d;
}

unsigned number_of_items(unsigned limit, unsigned offset, unsigned total) {
    if (total > offset) {
        return limit < (total - offset) ? limit : (total - offset);
    }
    else {
        return 0;
    }
}

void free_tidal_state(t_tidal_state *tidal_state) {
    //sdsfree(tidal_state->tidal_token);
    sdsfree(tidal_state->username);
    sdsfree(tidal_state->password);
    sdsfree(tidal_state->audioquality);
    //sdsfree(tidal_state->searchtaglist);
    //sdsfree(tidal_state->cols_search);
    FREE_PTR(tidal_state);
}

void default_tidal_state(t_tidal_state *tidal_state) {
    //tidal_state->tidal_token = sdsnew("");
    tidal_state->username = sdsempty();
    tidal_state->password = sdsempty();
    tidal_state->audioquality = sdsnew("HIGH");
    //searchtags
    //cols
}
