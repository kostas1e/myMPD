#ifndef __IDEON_H__
#define __IDEON_H__

int ideon_settings_set(t_mympd_state *mympd_state, bool mpd_conf_changed,
                       bool ns_changed, bool airplay_changed,
                       bool roon_changed, bool spotify_changed);
sds ideon_check_for_updates(sds buffer, sds method, int request_id);
sds ideon_install_updates(sds buffer, sds method, int request_id);
#endif
