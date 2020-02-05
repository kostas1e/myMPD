#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <inttypes.h>
#include <stdbool.h>

#include "../../dist/src/sds/sds.h"
#include "../sds_extras.h"
#include "../../dist/src/frozen/frozen.h"
#include "../utility.h"
#include "../log.h"
#include "../list.h"
#include "config_defs.h"
#include "tidal_utility.h"
#include "mpd_client_settings.h"

//public functions
bool tidal_api_settings_set(t_config *config, t_tidal_state *tidal_state,
    struct json_token *key, struct json_token *val, bool *tidal_key_changed)
{
    sds settingname = sdsempty();
    sds settingvalue = sdscatlen(sdsempty(), val->ptr, val->len);
    char *crap;

    LOG_DEBUG("Parse setting %.*s: %.*s", key->len, key->ptr, val->len, val->ptr);
    if (strncmp(key->ptr, "tidalUsername", key->len) == 0) {
        tidal_state->tidal_username = sdsreplacelen(mympd_state->tidal_username, settingvalue, sdslen(settingvalue));
        settingname = sdscat(settingname, "tidal_username");
        *tidal_keys_changed = sdscat(*tidal_keys_changed, "user");
    }
    else if (strncmp(key->ptr, "tidalPassword", key->len) == 0) {
        mympd_state->tidal_password = sdsreplacelen(mympd_state->tidal_password, settingvalue, sdslen(settingvalue));
        settingname = sdscat(settingname, "tidal_password");
        *tidal_keys_changed = sdscat(*tidal_keys_changed, "pass");
    }
    else if (strncmp(key->ptr, "tidalAudioquality", key->len) == 0) {
        mympd_state->tidal_audioquality = sdsreplacelen(mympd_state->tidal_audioquality, settingvalue, sdslen(settingvalue));
        settingname = sdscat(settingname, "tidal_audioquality");
        *tidal_keys_changed = sdscat(*tidal_keys_changed, "qual");
    }
    else if (strncmp(key->ptr, "searchtidaltaglist", key->len) == 0) {
        mympd_state->searchtidaltaglist = sdsreplacelen(mympd_state->searchtidaltaglist, settingvalue, sdslen(settingvalue));
        settingname = sdscat(settingname, "searchtidaltaglist");
    }
else {
        sdsfree(settingname);
        sdsfree(settingvalue);
        return true;
    }
bool rc = state_file_write(config, settingname, settingvalue);
    sdsfree(settingname);
    sdsfree(settingvalue);
    return rc;





    bool rc = true;
    char *crap;
    sds settingvalue = sdscatlen(sdsempty(), val->ptr, val->len);
    LOG_DEBUG("Parse setting \"%.*s\" with value \"%.*s\"", key->len, key->ptr, val->len, val->ptr);
    if (strncmp(key->ptr, "mpdPass", key->len) == 0) {
        if (strncmp(val->ptr, "dontsetpassword", val->len) != 0) {
            *mpd_host_changed = true;
            mpd_state->mpd_pass = sdsreplacelen(mpd_state->mpd_pass, settingvalue, sdslen(settingvalue));
        }
        else {
            sdsfree(settingvalue);
            return true;
        }
    }
    else if (strncmp(key->ptr, "mpdHost", key->len) == 0) {
        if (strncmp(val->ptr, mpd_state->mpd_host, val->len) != 0) {
            *mpd_host_changed = true;
            mpd_state->mpd_host = sdsreplacelen(mpd_state->mpd_host, settingvalue, sdslen(settingvalue));
        }
    }
    else if (strncmp(key->ptr, "mpdPort", key->len) == 0) {
        int mpd_port = strtoimax(settingvalue, &crap, 10);
        if (mpd_state->mpd_port != mpd_port) {
            *mpd_host_changed = true;
            mpd_state->mpd_port = mpd_port;
        }
    }
    else if (strncmp(key->ptr, "musicDirectory", key->len) == 0) {
        mpd_state->music_directory = sdsreplacelen(mpd_state->music_directory, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "jukeboxMode", key->len) == 0) {
        int jukebox_mode = strtoimax(settingvalue, &crap, 10);
        if (jukebox_mode < 0 || jukebox_mode > 2) {
            sdsfree(settingvalue);
            return false;
        }
        mpd_state->jukebox_mode = jukebox_mode;
    }
    else if (strncmp(key->ptr, "jukeboxPlaylist", key->len) == 0) {
        mpd_state->jukebox_playlist = sdsreplacelen(mpd_state->jukebox_playlist, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "jukeboxQueueLength", key->len) == 0) {
        int jukebox_queue_length = strtoimax(settingvalue, &crap, 10);
        if (jukebox_queue_length <= 0 || jukebox_queue_length > 999) {
            sdsfree(settingvalue);
            return false;
        }
        mpd_state->jukebox_queue_length = jukebox_queue_length;
    }
    else if (strncmp(key->ptr, "autoPlay", key->len) == 0) {
        mpd_state->auto_play = val->type == JSON_TYPE_TRUE ? true : false;
    }
    else if (strncmp(key->ptr, "coverimage", key->len) == 0) {
        mpd_state->coverimage = val->type == JSON_TYPE_TRUE ? true : false;
    }
    else if (strncmp(key->ptr, "coverimageName", key->len) == 0) {
        if (validate_string(settingvalue) && sdslen(settingvalue) > 0) {
            mpd_state->coverimage_name = sdsreplacelen(mpd_state->coverimage_name, settingvalue, sdslen(settingvalue));
        }
        else {
            sdsfree(settingvalue);
            return false;
        }
    }
    else if (strncmp(key->ptr, "love", key->len) == 0) {
        mpd_state->love = val->type == JSON_TYPE_TRUE ? true : false;
    }
    else if (strncmp(key->ptr, "loveChannel", key->len) == 0) {
        mpd_state->love_channel = sdsreplacelen(mpd_state->love_channel, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "loveMessage", key->len) == 0) {
        mpd_state->love_message = sdsreplacelen(mpd_state->love_message, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "taglist", key->len) == 0) {
        mpd_state->taglist = sdsreplacelen(mpd_state->taglist, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "searchtaglist", key->len) == 0) {
        mpd_state->searchtaglist = sdsreplacelen(mpd_state->searchtaglist, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "searchtidaltaglist", key->len) == 0) {
        mpd_state->searchtidaltaglist = sdsreplacelen(mpd_state->searchtidaltaglist, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "searchqobuztaglist", key->len) == 0) {
        mpd_state->searchqobuztaglist = sdsreplacelen(mpd_state->searchqobuztaglist, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "browsetaglist", key->len) == 0) {
        mpd_state->browsetaglist = sdsreplacelen(mpd_state->browsetaglist, settingvalue, sdslen(settingvalue));
    }
    else if (strncmp(key->ptr, "stickers", key->len) == 0) {
        mpd_state->stickers = val->type == JSON_TYPE_TRUE ? true : false;
    }
    else if (strncmp(key->ptr, "smartpls", key->len) == 0) {
        mpd_state->smartpls = val->type == JSON_TYPE_TRUE ? true : false;
    }
    else if (strncmp(key->ptr, "maxElementsPerPage", key->len) == 0) {
        int max_elements_per_page = strtoimax(settingvalue, &crap, 10);
        if (max_elements_per_page <= 0 || max_elements_per_page > 999) {
            sdsfree(settingvalue);
            return false;
        }
        mpd_state->max_elements_per_page = max_elements_per_page;
    }
    else if (strncmp(key->ptr, "lastPlayedCount", key->len) == 0) {
        int last_played_count = strtoimax(settingvalue, &crap, 10);
        if (last_played_count <= 0) {
            sdsfree(settingvalue);
            return false;
        }
        mpd_state->last_played_count = last_played_count;
    }
    else if (strncmp(key->ptr, "random", key->len) == 0) {
        unsigned uint_buf = strtoumax(settingvalue, &crap, 10);
        rc = mpd_run_random(mpd_state->conn, uint_buf);
    }
    else if (strncmp(key->ptr, "repeat", key->len) == 0) {
        unsigned uint_buf = strtoumax(settingvalue, &crap, 10);
        rc = mpd_run_repeat(mpd_state->conn, uint_buf);
    }
    else if (strncmp(key->ptr, "consume", key->len) == 0) {
        unsigned uint_buf = strtoumax(settingvalue, &crap, 10);
        rc = mpd_run_consume(mpd_state->conn, uint_buf);
    }
    else if (strncmp(key->ptr, "single", key->len) == 0) {
        unsigned uint_buf = strtoumax(settingvalue, &crap, 10);
        rc = mpd_run_single(mpd_state->conn, uint_buf);
    }
    else if (strncmp(key->ptr, "crossfade", key->len) == 0) {
        unsigned uint_buf = strtoumax(settingvalue, &crap, 10);
        rc = mpd_run_crossfade(mpd_state->conn, uint_buf);
    }
    else if (strncmp(key->ptr, "mixrampdb", key->len) == 0) {
        if (config->mixramp == true) {
            float float_buf = strtof(settingvalue, &crap);
            rc = mpd_run_mixrampdb(mpd_state->conn, float_buf);
        }
    }
    else if (strncmp(key->ptr, "mixrampdelay", key->len) == 0) {
        if (config->mixramp == true) {
            float float_buf = strtof(settingvalue, &crap);
            rc = mpd_run_mixrampdelay(mpd_state->conn, float_buf);
        }
    }
    else if (strncmp(key->ptr, "replaygain", key->len) == 0) {
        rc = mpd_send_command(mpd_state->conn, "replay_gain_mode", settingvalue, NULL);
        mpd_response_finish(mpd_state->conn);
    }    

    sdsfree(settingvalue);
    return rc;
}

sds tidal_put_settings(t_tidal_state *tidal_state, sds buffer, sds method, int request_id) {
    
    char *replaygain = strdup(pair->value);
    mpd_return_pair(mpd_state->conn, pair);
    mpd_response_finish(mpd_state->conn);
    
    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",");
    buffer = tojson_long(buffer, "repeat", mpd_status_get_repeat(status), true);
    buffer = tojson_float(buffer, "mixrampdelay", mpd_status_get_mixrampdelay(status), true);
    buffer = tojson_char(buffer, "replaygain", replaygain == NULL ? "" : replaygain, true);
    buffer = tojson_bool(buffer, "mpdConnected", true, true);
    mpd_status_free(status);
    FREE_PTR(replaygain);

    buffer = print_tags_array(buffer, "searchtidaltags", mpd_state->search_tidal_tag_types);

    buffer = jsonrpc_end_result(buffer);
    
    return buffer;
}
