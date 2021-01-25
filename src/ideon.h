#ifndef __IDEON_H__
#define __IDEON_H__

extern pthread_mutex_t lock;

typedef struct memory_struct
{
    char *memory;
    size_t size;
} memory_struct;

void ideon_init(void);
void ideon_cleanup(void);
void ideon_dc_handle(int *dc);
bool ideon_output_name_set(t_mympd_state *mympd_state);
int ideon_settings_set(t_mympd_state *mympd_state, bool mpd_conf_changed,
                       bool ns_changed, bool airplay_changed, bool roon_changed,
                       bool spotify_changed);
sds ideon_update_check(sds buffer, sds method, int request_id);
sds ideon_update_install(sds buffer, sds method, int request_id);
#endif
