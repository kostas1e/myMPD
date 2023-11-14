#ifndef IDEON_QOBUZ_H
#define IDEON_QOBUZ_H

#include "dist/sds/sds.h"
#include "src/lib/api.h"
#include "src/lib/config_def.h"

bool qobuz_init(struct t_config *config);
void qobuz_cleanup(void);
sds qobuz_track_search(sds buffer, enum mympd_cmd_ids cmd_id, long request_id, const char *query);
#endif
