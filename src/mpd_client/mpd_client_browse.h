/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2021 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

#ifndef MYMPD_MPD_CLIENT_BROWSE_H
#define MYMPD_MPD_CLIENT_BROWSE_H

#include "../lib/mympd_state.h"

sds mpd_client_put_fingerprint(struct t_mympd_state *mympd_state, sds buffer, sds method,
                               long request_id, const char *uri);
sds mpd_client_put_songdetails(struct t_mympd_state *mympd_state, sds buffer, sds method,
                               long request_id, const char *uri);
sds mpd_client_put_filesystem(struct t_mympd_state *mympd_state, sds buffer, 
                              sds method, long request_id, sds path, const unsigned int offset, 
                              const unsigned int limit, sds searchstr,
                              const struct t_tags *tagcols);
sds mpd_client_put_songs_in_album(struct t_mympd_state *mympd_state, sds buffer, sds method,
                                  long request_id, const char *album, const char *albumartist, 
                                  const struct t_tags *tagcols);
sds mpd_client_put_firstsong_in_albums(struct t_mympd_state *mympd_state, sds buffer, sds method,
                                       long request_id, const char *expression,
                                       const char *sort, bool sortdesc, const unsigned int offset,
                                       unsigned int limit);
sds mpd_client_put_db_tag(struct t_mympd_state *mympd_state, sds buffer, sds method, long request_id, 
                          sds searchstr, sds tag, const unsigned int offset, const unsigned int limit);
sds mpd_client_read_comments(struct t_mympd_state *mympd_state, sds buffer, sds method, long request_id, 
                             const char *uri);
#endif
