#ifndef __TIDAL_H__
#define __TIDAL_H__

struct memory_struct {
    char *memory;
    size_t size;
};

size_t write_callback(void *contents, size_t size, size_t nmemb, void *userp);
bool tidal_init(t_config *config);
void tidal_cleanup(void);
void tidal_session_init(sds username, sds password, sds audioquality);
void tidal_session_update(sds username, sds password, sds audioquality);
sds tidal_search(sds buffer, sds method, int request_id, const char *query, const char *type, const char *plist, unsigned offset);
sds tidal_get_cover(sds cover, const char *uri);
sds tidal_songdetails(sds buffer, sds method, int request_id, const char *uri);
sds tidal_albumdetails(sds buffer, sds method, int request_id, const char *uri);
sds tidal_artistdetails(sds buffer, sds method, int request_id, const char *uri);

#endif
