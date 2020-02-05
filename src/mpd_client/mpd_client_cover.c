/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>
#include <unistd.h>

#include <mpd/client.h>

#include "../../dist/src/sds/sds.h"
#include "../sds_extras.h"
#include "../api.h"
#include "../log.h"
#include "../list.h"
#include "config_defs.h"
#include "../utility.h"
#include "mpd_client_utility.h"
#include "mpd_client_cover.h"
#include "../tidal.h"
#include "../qobuz.h"

/*
sds mpd_client_get_cover(t_config *config, t_mpd_state *mpd_state, const char *uri, sds cover) {
    char *orgpath = strdup(uri);
    char *path = orgpath;

    if (mpd_state->feat_coverimage == false) {
        cover = sdsreplace(cover, "/assets/coverimage-notavailable.svg");
    }
    else if (strstr(path, "://") != NULL) {
        if (strstr(path, "tidal")) {
            cover = tidal_get_cover(uri, cover);
            //check for null ret
        }
        else if (strstr(path, "qobuz")) {
            cover = qobuz_get_cover(uri, cover);
        }
        else { // check end bracket
        char *name = strstr(path, "://");
        name += 3;
        replacechar(name, '/', '_');
        replacechar(name, '.', '_');
        replacechar(name, ':', '_');
        cover = sdscatfmt(cover, "%s/pics/%s.png", config->varlibdir, name);
        LOG_DEBUG("Check for cover %s", cover);
        if (access(cover, F_OK ) == -1 ) { // Flawfinder: ignore
            cover = sdscrop(cover);
            cover = sdscatfmt(cover, "/assets/coverimage-stream.svg");
        }
        else {
            cover = sdscrop(cover);
            cover = sdscatfmt(cover, "/pics/%s.png", name);
*/
#ifdef EMBEDDED_LIBMPDCLIENT
sds mpd_client_getcover(t_config *config, t_mpd_state *mpd_state, sds buffer, sds method, int request_id,
                        const char *uri, sds *binary)
{
    unsigned offset = 0;
    if (mpd_state->feat_mpd_albumart == true) {
        struct mpd_albumart albumart_buffer;
        while (mpd_run_albumart(mpd_state->conn, uri, offset, &albumart_buffer) == true) {
            *binary = sdscatlen(*binary, albumart_buffer.data, albumart_buffer.data_length);
            offset += albumart_buffer.data_length;
            if (albumart_buffer.data_length == 0) {
                break;
            }
        }
    }
    if (offset == 0 && mpd_state->feat_mpd_readpicture == true) {
        struct mpd_readpicture readpicture_buffer;
        while (mpd_run_readpicture(mpd_state->conn, uri, offset, &readpicture_buffer) == true) {
            *binary = sdscatlen(*binary, readpicture_buffer.data, readpicture_buffer.data_length);
            offset += readpicture_buffer.data_length;
            mpd_free_readpicture(&readpicture_buffer);
            if (readpicture_buffer.data_length == 0) {
                break;
            }
        }
        mpd_free_readpicture(&readpicture_buffer);
    }
    if (offset > 0) {
        sds mime_type = get_mime_type_by_magic_stream(*binary);
        buffer = jsonrpc_start_result(buffer, method, request_id);
        buffer = sdscat(buffer, ",");
        buffer = tojson_char(buffer, "mime_type", mime_type, false);
        buffer = jsonrpc_end_result(buffer);
        if (config->covercache == true) {
            write_covercache_file(config, uri, mime_type, *binary);
        }
        sdsfree(mime_type);
    }
    else {
        buffer = jsonrpc_respond_message(buffer, method, request_id, "No albumart found by mpd", true);
    }
    return buffer;
}
#else
sds mpd_client_getcover(t_config *config, t_mpd_state *mpd_state, sds buffer, sds method, int request_id,
                        const char *uri, sds *binary)
{
    (void) config;
    (void) mpd_state;
    (void) uri;
    (void) binary;
    buffer = jsonrpc_respond_message(buffer, method, request_id, "No albumart found by mpd", true);
    return buffer;
}
#endif
