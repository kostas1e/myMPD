#ifndef __IDEON_H__
#define __IDEON_H__

bool ideon_settings_set(t_mympd_state *mympd_state, bool mpd_conf_changed);
sds ideon_check_for_updates(sds buffer, sds method, int request_id);
bool ideon_install_updates(void);
#endif
