#ifndef IDEON_QOBUZ_H
#define IDEON_QOBUZ_H

#include "dist/sds/sds.h"
#include "src/lib/api.h"
#include "src/lib/config_def.h"
#include "src/lib/list.h"
#include <stdbool.h>

// TODO add qobuz struct here, move struct below

struct t_memory {
    char* memory;
    size_t size;
};

bool qobuz_init(struct t_config *config);
void qobuz_cleanup(void);
sds qobuz_track_search(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, const char *query, unsigned offset, unsigned limit);
sds qobuz_track_get(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, const char *uri);
sds qobuz_track_get_list(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, struct t_list *tracks_id);

bool qobuz_init2(struct t_config *config);
void qobuz_cleanup2(void);

sds qobuz_track_get_stream_url(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, int track_id);

#endif
