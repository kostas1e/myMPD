/*
#include "../../dist/src/sds/sds.h"
#include "../sds_extras.h"
#include "../dist/src/frozen/frozen.h"
#include "../api.h"
#include "../global.h"
#include "../list.h"
#include "../log.h"
#include "../tiny_queue.h"
#include "../utility.h"
#include "config_defs.h"
#include "tidal_utility.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <signal.h>
#include <assert.h>
#include <mpd/client.h>

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <signal.h>
#include <assert.h>

*/


#include <stdlib.h>
#include <signal.h>
#include <assert.h>

#include "../../dist/src/sds/sds.h"
//#include "../sds_extras.h"
#include "../dist/src/frozen/frozen.h"
#include "../utility.h"
#include "../api.h"
#include "../log.h"
//#include "../list.h"
#include "../tiny_queue.h"
#include "../global.h"
#include "config_defs.h"
#include "tidal_utility.h"
#include "tidal_api.h"

#include "../tidal.h" // replace w/ tidal dir hs

void *tidal_api_loop(void *arg_config) {
    t_config *config = (t_config *) arg_config;
    
    t_tidal_state *tidal_state = (t_tidal_state *)malloc(sizeof(t_tidal_state));
    default_mpd_state(tidal_state);

    //mympd_api_read_statefiles(config, mympd_state);

    //push settings to mpd_client queue
    //mympd_api_push_to_mpd_client(mympd_state);

    // streaming services
    //tidal_session_manager(mympd_state, "userpassqual");
    //qobuz_session_manager(mympd_state);

    while (s_signal_received == 0) {
        struct t_work_request *request = tiny_queue_shift(tidal_api_queue, 0);
        if (request != NULL) {
            tidal_api(config, tidal_state, request);
        }
    }

    free_tidal_state(tidal_state);
    return NULL;
}

void tidal_api(t_config *config, t_tidal_state *tidal_state, void *arg_request) {
    t_work_request *request = (t_work_request*) arg_request;
    unsigned int uint_buf1, uint_buf2;
    int je, int_buf1;
    bool bool_buf, rc;
    char *p_charbuf1 = NULL;
    char *p_charbuf2 = NULL;
    char *p_charbuf3 = NULL;
    char *p_charbuf4 = NULL;

    LOG_VERBOSE("TIDAL API request (%d)(%d) %s: %s", request->conn_id, request->id, request->method, request->data);
    //create response struct
    t_work_result *response = (t_work_result*)malloc(sizeof(t_work_result));
    assert(response);
    response->conn_id = request->conn_id;
    sds data = sdsempty();
    
    switch(request->cmd_id) {
        case MYMPD_API_SETTINGS_SET: {
            void *h = NULL;
            struct json_token key;
            struct json_token val;
            rc = true;
            bool tidal_session_changed = false;
            while ((h = json_next_key(request->data, sdslen(request->data), h, ".params", &key, &val)) != NULL) {
                rc = tidal_api_settings_set(config, tidal_state, &key, &val, &tidal_session_changed);
                if (rc == false) {
                    break;
                }
            }
            if (rc == true) {/*
                if (mpd_host_changed == true) {
                    //reconnect with new settings
                    mpd_state->conn_state = MPD_DISCONNECT;
                }
                if (mpd_state->conn_state == MPD_CONNECTED) {
                    //feature detection
                    mpd_client_mpd_features(config, mpd_state);
                    
                    if (mpd_state->jukebox_mode != JUKEBOX_OFF) {
                        //enable jukebox
                        mpd_client_jukebox(mpd_state);
                    }
                }*/
                data = jsonrpc_respond_ok(data, request->method, request->id);
            }
            else {
                data = jsonrpc_start_phrase(data, request->method, request->id, "Can't save setting %{setting}", true);
                data = tojson_char_len(data, "setting", val.ptr, val.len, false);
                data = jsonrpc_end_phrase(data);
            }
            break;
        }
        case TIDAL_API_SEARCH:
            je = json_scanf(request->data, sdslen(request->data), "{params:{searchstr:%Q,filter:%Q,plist:%Q,offset:%u}}", &p_charbuf1, &p_charbuf2, &p_charbuf3, &uint_buf1);
            if (je == 4) {
                data = tidal_search(data, request->method, request->id, p_charbuf1, p_charbuf2, p_charbuf3, uint_buf1);
            }
            break;
        case TIDAL_API_SONGDETAILS:
            je = json_scanf(request->data, sdslen(request->data), "{params:{uri:%Q}}", &p_charbuf1);
            if (je == 1) {
                data = tidal_songdetails(data, request->method, request->id, p_charbuf1);
            }
            break;
        case TIDAL_API_ALBUMDETAILS:
            je = json_scanf(request->data, sdslen(request->data), "{params:{uri:%Q}}", &p_charbuf1);
            if (je == 1) {
                data = tidal_albumdetails(data, request->method, request->id, p_charbuf1);
            }
            break;
        case TIDAL_API_ARTISTDETAILS:
            je = json_scanf(request->data, sdslen(request->data), "{params:{uri:%Q}}", &p_charbuf1);
            if (je == 1) {
                data = tidal_artistdetails(data, request->method, request->id, p_charbuf1);
            }
            break;
        default:
            data = jsonrpc_respond_message(data, request->method, request->id, "Unknown request", true);
            LOG_ERROR("Unknown API request: %.*s", sdslen(request->data), request->data);
    }
    FREE_PTR(p_charbuf1);
    FREE_PTR(p_charbuf2);
    FREE_PTR(p_charbuf3);               
    FREE_PTR(p_charbuf4);

    if (sdslen(data) == 0) {
        data = jsonrpc_start_phrase(data, request->method, request->id, "No response for method %{method}", true);
        data = tojson_char(data, "method", request->method, false);
        data = jsonrpc_end_phrase(data);
        LOG_ERROR("No response for cmd_id %u", request->cmd_id);
    }
    if (response->conn_id > -1) {
        LOG_DEBUG("Push response to queue for connection %lu: %s", request->conn_id, data);
        response->data = data;
        tiny_queue_push(web_server_queue, response);
    }
    else {
        sdsfree(data);
        FREE_PTR(response);
    }
    free_request(request);
}
