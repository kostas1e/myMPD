/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2021 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <stdlib.h>
#include <limits.h>
#include <mpd/client.h>

#include "../../dist/src/sds/sds.h"
#include "../sds_extras.h"
#include "../api.h"
#include "../log.h"
#include "../list.h"
#include "config_defs.h"
#include "../utility.h"
#include "mpd_shared_typedefs.h"
#include "../mpd_shared.h"
#include "mpd_shared_tags.h"
#include "mpd_shared_search.h"
#include "mpd_shared_sticker.h"

//private definitions
static sds _mpd_shared_search(t_mpd_state *mpd_state, sds buffer, sds method, long request_id,
                              const char *expression, const char *sort, const bool sortdesc,
                              const char *grouptag, const char *plist, const unsigned int offset,
                              unsigned int limit, const t_tags *tagcols, bool adv, const char *searchtag, rax *sticker_cache);
//public functions
sds mpd_shared_search(t_mpd_state *mpd_state, sds buffer, sds method, long request_id,
                      const char *searchstr, const char *searchtag, const char *plist,
                      const unsigned int offset, unsigned int limit, const t_tags *tagcols, rax *sticker_cache)
{
    return _mpd_shared_search(mpd_state, buffer, method, request_id,
                              searchstr, NULL, false, NULL, plist, offset, limit,
                              tagcols, false, searchtag, sticker_cache);
}

sds mpd_shared_search_adv(t_mpd_state *mpd_state, sds buffer, sds method, long request_id,
                          const char *expression, const char *sort, const bool sortdesc,
                          const char *grouptag, const char *plist, const unsigned int offset,
                          unsigned int limit, const t_tags *tagcols, rax *sticker_cache)
{
    return _mpd_shared_search(mpd_state, buffer, method, request_id,
                              expression, sort, sortdesc, grouptag, plist, offset, limit,
                              tagcols, true, NULL, sticker_cache);
}

//private functions
static sds _mpd_shared_search(t_mpd_state *mpd_state, sds buffer, sds method, long request_id,
                              const char *expression, const char *sort, const bool sortdesc,
                              const char *grouptag, const char *plist, const unsigned int offset,
                              unsigned int limit, const t_tags *tagcols, bool adv, const char *searchtag, rax *sticker_cache)
{
    if (strcmp(expression, "") == 0)
    {
        MYMPD_LOG_ERROR("No search expression defined");
        buffer = jsonrpc_respond_message(buffer, method, request_id, true, "mpd", "error", "No search expression defined");
        return buffer;
    }

    if (strcmp(plist, "") == 0)
    {
        bool rc = mpd_search_db_songs(mpd_state->conn, false);
        if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_db_songs") == false)
        {
            mpd_search_cancel(mpd_state->conn);
            return buffer;
        }
        buffer = jsonrpc_result_start(buffer, method, request_id);
        buffer = sdscat(buffer, "\"data\":[");
    }
    else if (strcmp(plist, "queue") == 0)
    {
        bool rc = mpd_search_add_db_songs(mpd_state->conn, false);
        if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_db_songs") == false)
        {
            mpd_search_cancel(mpd_state->conn);
            return buffer;
        }
    }
    else
    {
        bool rc = mpd_search_add_db_songs_to_playlist(mpd_state->conn, plist);
        if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_db_songs_to_playlist") == false)
        {
            mpd_search_cancel(mpd_state->conn);
            return buffer;
        }
    }

    if (adv == true)
    {
        bool rc = mpd_search_add_expression(mpd_state->conn, expression);
        if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_expression") == false)
        {
            mpd_search_cancel(mpd_state->conn);
            return buffer;
        }
    }
    else if (searchtag != NULL && strcmp(searchtag, "any") == 0)
    {
        bool rc = mpd_search_add_any_tag_constraint(mpd_state->conn, MPD_OPERATOR_DEFAULT, expression);
        if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_any_tag_constraint") == false)
        {
            mpd_search_cancel(mpd_state->conn);
            return buffer;
        }
    }
    else if (searchtag != NULL)
    {
        bool rc = mpd_search_add_tag_constraint(mpd_state->conn, MPD_OPERATOR_DEFAULT, mpd_tag_name_parse(searchtag), expression);
        if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_tag_constraint") == false)
        {
            mpd_search_cancel(mpd_state->conn);
            return buffer;
        }
    }
    else
    {
        mpd_search_cancel(mpd_state->conn);
        buffer = jsonrpc_respond_message(buffer, method, request_id, true, "mpd", "error", "No search tag defined and advanced search is disabled");
        return buffer;
    }

    if (strcmp(plist, "") == 0)
    {
        if (sort != NULL && strcmp(sort, "") != 0 && strcmp(sort, "-") != 0 && mpd_state->feat_tags == true)
        {
            enum mpd_tag_type sort_tag = mpd_tag_name_parse(sort);
            if (sort_tag != MPD_TAG_UNKNOWN)
            {
                sort_tag = get_sort_tag(sort_tag);
                bool rc = mpd_search_add_sort_tag(mpd_state->conn, sort_tag, sortdesc);
                if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_sort_tag") == false)
                {
                    mpd_search_cancel(mpd_state->conn);
                    return buffer;
                }
            }
            else if (strcmp(sort, "LastModified") == 0)
            {
                bool rc = mpd_search_add_sort_name(mpd_state->conn, "Last-Modified", sortdesc);
                if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_sort_name") == false)
                {
                    mpd_search_cancel(mpd_state->conn);
                    return buffer;
                }
            }
            else
            {
                MYMPD_LOG_WARN("Unknown sort tag: %s", sort);
            }
        }
        if (grouptag != NULL && strcmp(grouptag, "") != 0 && mpd_state->feat_tags == true)
        {
            bool rc = mpd_search_add_group_tag(mpd_state->conn, mpd_tag_name_parse(grouptag));
            if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_group_tag") == false)
            {
                mpd_search_cancel(mpd_state->conn);
                return buffer;
            }
        }
        if (mpd_state->feat_mpd_searchwindow == true)
        {
            if (limit == 0)
            {
                limit = INT_MAX - offset;
            }
            bool rc = mpd_search_add_window(mpd_state->conn, offset, offset + limit);
            if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_add_window") == false)
            {
                mpd_search_cancel(mpd_state->conn);
                return buffer;
            }
        }
    }

    bool rc = mpd_search_commit(mpd_state->conn);
    if (check_rc_error_and_recover(mpd_state, &buffer, method, request_id, false, rc, "mpd_search_commit") == false)
    {
        return buffer;
    }

    if (strcmp(plist, "") == 0)
    {
        struct mpd_song *song;
        unsigned entities_returned = 0;
        unsigned entity_count = 0;
        while ((song = mpd_recv_song(mpd_state->conn)) != NULL)
        {
            entity_count++;
            if (mpd_state->feat_mpd_searchwindow == true || (entity_count > offset && (entity_count <= offset + limit || limit == 0)))
            {
                if (entities_returned++)
                {
                    buffer = sdscat(buffer, ",");
                }
                buffer = sdscat(buffer, "{");
                buffer = tojson_char(buffer, "Type", "song", true);
                buffer = put_song_tags(buffer, mpd_state, tagcols, song);
                if (sticker_cache != NULL)
                {
                    buffer = sdscat(buffer, ",");
                    buffer = mpd_shared_sticker_list(buffer, sticker_cache, mpd_song_get_uri(song));
                }
                buffer = sdscat(buffer, "}");
            }
            mpd_song_free(song);
        }
        buffer = sdscat(buffer, "],");
        if (mpd_state->feat_mpd_searchwindow == true)
        {
            buffer = tojson_long(buffer, "totalEntities", -1, true);
        }
        else
        {
            buffer = tojson_long(buffer, "totalEntities", entity_count, true);
        }
        buffer = tojson_long(buffer, "offset", offset, true);
        buffer = tojson_long(buffer, "returnedEntities", entities_returned, true);
        if (adv == true)
        {
            buffer = tojson_char(buffer, "expression", expression, true);
            buffer = tojson_char(buffer, "sort", sort, true);
            buffer = tojson_bool(buffer, "sortdesc", sortdesc, true);
            buffer = tojson_char(buffer, "grouptag", grouptag, false);
        }
        else
        {
            buffer = tojson_char(buffer, "searchstr", expression, true);
            buffer = tojson_char(buffer, "searchtag", searchtag, false);
        }
        buffer = jsonrpc_result_end(buffer);
    }
    else if (strcmp(plist, "queue") == 0)
    {
        buffer = jsonrpc_respond_message(buffer, method, request_id, false,
                                         "queue", "info", "Added songs to queue");
    }
    else
    {
        buffer = jsonrpc_respond_message_phrase(buffer, method, request_id, false,
                                                "playlist", "info", "Added songs to %{playlist}", 2, "playlist", plist);
    }

    mpd_response_finish(mpd_state->conn);
    if (check_error_and_recover2(mpd_state, &buffer, method, request_id, false) == false)
    {
        return buffer;
    }
    return buffer;
}
