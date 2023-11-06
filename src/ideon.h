#ifndef IDEON_H
#define IDEON_H

#include "dist/sds/sds.h"
#include "src/lib/api.h"
#include "src/lib/mympd_state.h"

extern pthread_mutex_t lock;

typedef struct memory_struct {
    char *memory;
    size_t size;
} memory_struct;

void ideon_init(void);
void ideon_cleanup(void);
void ideon_dc_handle(int *dc);
// TODO remove
// int ideon_settings_set(struct t_mympd_state *mympd_state, bool mpd_conf_changed, bool ns_changed, bool airplay_changed,
//                        bool roon_changed, bool spotify_changed);
int ideon_settings_set(struct t_mympd_state *mympd_state, struct t_mympd_state *old_mympd_state);
sds ideon_ns_server_list(sds buffer, enum mympd_cmd_ids cmd_id, long request_id);
sds ideon_update_check(sds buffer, enum mympd_cmd_ids cmd_id, long request_id);
sds ideon_update_install(sds buffer, enum mympd_cmd_ids cmd_id, long request_id);
#endif
