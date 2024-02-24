/*
 SPDX-License-Identifier: GPL-3.0-or-later
 myMPD (c) 2018-2024 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

#include "compile_time.h"
#include "src/lib/cache.h"

#include "src/lib/log.h"

/**
 * Initializes a cache struct
 * @param cache 
 */
bool cache_init(struct t_cache *cache) {
    cache->building = false;
    cache->cache = NULL;
    int rc = pthread_rwlock_init(&cache->rwlock, NULL);
    if (rc == 0) {
        return true;
    }
    MYMPD_LOG_ERROR(NULL, "Can not init lock");
    MYMPD_LOG_ERRNO(NULL, rc);
    return false;
}

/**
 * Initializes a cache struct
 * @param cache 
 */
bool cache_free(struct t_cache *cache) {
    cache->cache = NULL;
    int rc = pthread_rwlock_destroy(&cache->rwlock);
    if (rc == 0) {
        return true;
    }
    MYMPD_LOG_ERROR(NULL, "Can not get destroy lock");
    MYMPD_LOG_ERRNO(NULL, rc);
    return false;
}

/**
 * Acquires a read lock
 * @param cache pointer to cache struct
 * @return true on success, else false
 */
bool cache_get_read_lock(struct t_cache *cache) {
    int rc = pthread_rwlock_rdlock(&cache->rwlock);
    if (rc == 0) {
        return true;
    }
    MYMPD_LOG_ERROR(NULL, "Can not get read lock");
    MYMPD_LOG_ERRNO(NULL, rc);
    return false;
}

/**
 * Acquires a read lock
 * @param cache pointer to cache struct
 * @return true on success, else false
 */
bool cache_get_write_lock(struct t_cache *cache) {
    int rc = pthread_rwlock_wrlock(&cache->rwlock);
    if (rc == 0) {
        return true;
    }
    MYMPD_LOG_ERROR(NULL, "Can not get write lock");
    MYMPD_LOG_ERRNO(NULL, rc);
    return false;
}

/**
 * Frees the lock
 * @param cache pointer to cache struct
 * @return true on success, else false
 */
bool cache_release_lock(struct t_cache *cache) {
    int rc = pthread_rwlock_unlock(&cache->rwlock);
    if (rc == 0) {
        return true;
    }
    MYMPD_LOG_ERROR(NULL, "Can not free the lock");
    MYMPD_LOG_ERRNO(NULL, rc);
    return false;
}
