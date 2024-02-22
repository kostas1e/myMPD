#ifndef IDEON_QOBUZ_H
#define IDEON_QOBUZ_H

#include "dist/sds/sds.h"
#include "src/lib/api.h"
#include "src/lib/config_def.h"
#include "src/lib/list.h"
#include <curl/curl.h>
#include <stdbool.h>

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
    CURL *curl_handle;
    struct curl_slist *headers; // http request
    const char *app_id;
    const char *app_secret;
    sds username; // rm use config value instead
    sds password; // rm use config value instead
    sds user_auth_token;
    int format_id; // TODO change to formatid enum
    // sds workdir;
    struct t_config *config;
};

bool qobuz_init(struct t_config *config);
void qobuz_cleanup(void);
sds qobuz_track_get(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                    int track_id);
                    // const char *uri);
sds qobuz_track_get_list(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                         struct t_list *tracks_id);
sds qobuz_track_get_stream_url(sds buffer, enum mympd_cmd_ids cmd_id,
                               long request_id, int track_id);
sds qobuz_logout(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, struct t_config *config);

sds qobuz_user_library_favorites(sds buffer, enum mympd_cmd_ids cmd_id,
                                 long request_id, const char *type,
                                 unsigned limit, unsigned offset);

sds qobuz_library_album_detail(sds buffer, enum mympd_cmd_ids cmd_id,
                               long request_id, const char *album_id);

bool qobuz_login(const char *username, const char *password, struct t_config *config, sds *error);

sds qobuz_search(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                 const char *query, const char *type, unsigned offset,
                 unsigned limit);
sds qobuz_search_albums(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                       const char *query, unsigned offset, unsigned limit);
sds qobuz_search_tracks(sds buffer, enum mympd_cmd_ids cmd_id, long request_id,
                       const char *query, unsigned offset, unsigned limit);
void qobuz_logout2(void);
sds qobuz_favorite_ids(sds buffer, enum mympd_cmd_ids cmd_id, long request_id);
sds qobuz_favorite_toggle(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, const char* type, const char* item_id);

void qobuz_get_album_streams(const char* album_id, struct t_list *uris);
void extract_info(const char *uri);
#endif
