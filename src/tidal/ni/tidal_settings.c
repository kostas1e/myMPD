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
