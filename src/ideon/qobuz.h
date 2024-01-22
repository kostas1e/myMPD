#ifndef IDEON_QOBUZ_H
#define IDEON_QOBUZ_H

#include "dist/sds/sds.h"
#include "src/lib/api.h"
#include "src/lib/config_def.h"
#include "src/lib/list.h"
#include <curl/curl.h>
#include <stdbool.h>


// FIXME
typedef enum {
    MP3_320 = 5,
    FLAC_LOSSLESS = 6,
    FLAC_HI_RES_24_BIT_96KHZ = 7,
    FLAC_HI_RES_24_BIT_192KHZ = 27
} FormatId;

typedef struct {
    const char *name;
    sds value;
} Parameter;

struct t_qobuz_client {
    // TODO use typedef
    const char *app_id;
    const char *app_secret;
    const char *username;
    const char *password;
    sds user_auth_token;
    int format_id; // TODO change to formatid enum
    // sds cache_dir
    CURL *curl_handle;
    struct curl_slist *headers; // http request
};

bool qobuz_init(struct t_config *config);
void qobuz_cleanup(void);
sds qobuz_track_get(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                    const char *uri);
sds qobuz_track_get_list(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                         struct t_list *tracks_id);
sds qobuz_track_get_stream_url(sds buffer, enum mympd_cmd_ids cmd_id,
                               long request_id, int track_id);
sds qobuz_track_search(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                       const char *query, unsigned limit, unsigned offset);
bool qobuz_user_login(const char *username, const char *password);

#endif
