#ifndef __QOBUZ_H__
#define __QOBUZ_H__

bool qobuz_init(t_config *config);
void qobuz_cleanup(void);
sds qobuz_catalog_search(sds buffer, sds method, int request_id, const char *query, const char *type, const char *plist, unsigned int offset);
sds qobuz_songdetails(sds buffer, sds method, int request_id, const char *uri);
sds qobuz_albumdetails(sds buffer, sds method, int request_id, const char *uri);
sds qobuz_artistdetails(sds buffer, sds method, int request_id, const char *uri);
sds qobuz_get_cover(const char *uri, sds cover);
#endif
