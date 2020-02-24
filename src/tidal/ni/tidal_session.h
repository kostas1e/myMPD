#ifndef __TIDAL_SESSION_H__
#define __TIDAL_SESSION_H__

void tidal_session_init(sds username, sds password, sds audioquality);
void tidal_session_update(sds username, sds password, sds audioquality);

#endif
