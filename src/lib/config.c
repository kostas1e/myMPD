/*
 SPDX-License-Identifier: GPL-3.0-or-later
 myMPD (c) 2018-2023 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

#include "compile_time.h"
#include "src/lib/config.h"

#include "src/lib/album_cache.h"
#include "src/lib/env.h"
#include "src/lib/filehandler.h"
#include "src/lib/log.h"
#include "src/lib/mem.h"
#include "src/lib/sds_extras.h"
#include "src/lib/state_files.h"
#include "src/lib/utility.h"
#include "src/lib/validate.h"

#include <inttypes.h>
#include <stdbool.h>
#include <string.h>
#include <time.h>

/**
 * Private declarations
 */

static sds startup_getenv_string(const char *env_var, const char *default_value, validate_callback vcb, bool first_startup);
static int startup_getenv_int(const char *env_var, int default_value, int min, int max, bool first_startup);
static bool startup_getenv_bool(const char *env_var, bool default_value, bool first_startup);

/**
 * Public functions
 */

/**
 * Frees the config struct
 * @param config pointer to config struct
 */
void *mympd_config_free(struct t_config *config) {
    FREE_SDS(config->acl);
    FREE_SDS(config->cachedir);
    FREE_SDS(config->http_host);
    FREE_SDS(config->lualibs);
    FREE_SDS(config->mympd_uri);
    FREE_SDS(config->pin_hash);
    FREE_SDS(config->scriptacl);
    FREE_SDS(config->ssl_cert);
    FREE_SDS(config->ssl_key);
    FREE_SDS(config->ssl_san);
    FREE_SDS(config->user);
    FREE_SDS(config->workdir);
    FREE_SDS(config->qobuz_app_id);
    FREE_SDS(config->qobuz_app_secret);
    FREE_SDS(config->qobuz_username);
    FREE_SDS(config->qobuz_password);
    FREE_PTR(config);
    return NULL;
}

/**
 * Sets the initial default values for config struct
 * This function is used before reading command line arguments
 * @param config pointer to config struct
 */
void mympd_config_defaults_initial(struct t_config *config) {
    //command line options
    config->log_to_syslog = CFG_MYMPD_LOG_TO_SYSLOG;
    config->cachedir = sdsnew(MYMPD_CACHE_DIR);
    config->user = sdsnew(CFG_MYMPD_USER);
    config->workdir = sdsnew(MYMPD_WORK_DIR);
    //not configurable
    config->bootstrap = false;
    config->first_startup = false;
    config->startup_time = time(NULL);
    //set all other sds strings to NULL
    config->acl = NULL;
    config->http_host = NULL;
    config->lualibs = NULL;
    config->mympd_uri = NULL;
    config->pin_hash = NULL;
    config->scriptacl = NULL;
    config->ssl_cert = NULL;
    config->ssl_key = NULL;
    config->ssl_san = NULL;
    config->qobuz_app_id = NULL;
    config->qobuz_app_secret = NULL;
    config->qobuz_username = NULL;
    config->qobuz_password = NULL;
}

/**
 * Sets the default values for config struct
 * This function is used after reading command line arguments and
 * reads the environment variables.
 * Environment variables are only respected at first startup.
 * @param config pointer to config struct
 */
void mympd_config_defaults(struct t_config *config) {
    if (config->first_startup == true) {
        MYMPD_LOG_INFO(NULL, "Reading environment variables");
    }
    //configurable with environment variables at first startup
    config->http = startup_getenv_bool("MYMPD_HTTP", CFG_MYMPD_HTTP, config->first_startup);
    #ifdef MYMPD_ENABLE_IPV6
        if (get_ipv6_support() == true) {
            config->http_host = startup_getenv_string("MYMPD_HTTP_HOST", CFG_MYMPD_HTTP_HOST_IPV6, vcb_isname, config->first_startup);
        }
        else {
            config->http_host = startup_getenv_string("MYMPD_HTTP_HOST", CFG_MYMPD_HTTP_HOST_IPV4, vcb_isname, config->first_startup);
        }
    #else
        config->http_host = startup_getenv_string("MYMPD_HTTP_HOST", CFG_MYMPD_HTTP_HOST_IPV4, vcb_isname, config->first_startup);
    #endif
    config->http_port = startup_getenv_int("MYMPD_HTTP_PORT", CFG_MYMPD_HTTP_PORT, 0, MPD_PORT_MAX, config->first_startup);
    config->ssl = startup_getenv_bool("MYMPD_SSL", CFG_MYMPD_SSL, config->first_startup);
    config->ssl_port = startup_getenv_int("MYMPD_SSL_PORT", CFG_MYMPD_SSL_PORT, 0, MPD_PORT_MAX, config->first_startup);
    config->ssl_san = startup_getenv_string("MYMPD_SSL_SAN", CFG_MYMPD_SSL_SAN, vcb_isname, config->first_startup);
    config->custom_cert = startup_getenv_bool("MYMPD_CUSTOM_CERT", CFG_MYMPD_CUSTOM_CERT, config->first_startup);
    sds default_cert = sdscatfmt(sdsempty(), "%S/%s/server.pem", config->workdir, DIR_WORK_SSL);
    sds default_key = sdscatfmt(sdsempty(), "%S/%s/server.key", config->workdir, DIR_WORK_SSL);
    if (config->custom_cert == true) {
        config->ssl_cert = startup_getenv_string("MYMPD_SSL_CERT", default_cert, vcb_isfilepath, config->first_startup);
        config->ssl_key = startup_getenv_string("MYMPD_SSL_KEY", default_key, vcb_isfilepath, config->first_startup);
        FREE_SDS(default_cert);
        FREE_SDS(default_key);
    }
    else {
        config->ssl_cert = default_cert;
        config->ssl_key = default_key;
    }
    config->acl = startup_getenv_string("MYMPD_ACL", CFG_MYMPD_ACL, vcb_isname, config->first_startup);
    config->scriptacl = startup_getenv_string("MYMPD_SCRIPTACL", CFG_MYMPD_SCRIPTACL, vcb_isname, config->first_startup);
    #ifdef MYMPD_ENABLE_LUA
        config->lualibs = startup_getenv_string("MYMPD_LUALIBS", CFG_MYMPD_LUALIBS, vcb_isalnum, config->first_startup);
    #else
        config->lualibs = sdsempty();
    #endif
    config->loglevel = getenv_int("MYMPD_LOGLEVEL", CFG_MYMPD_LOGLEVEL, LOGLEVEL_MIN, LOGLEVEL_MAX);
    config->pin_hash = sdsnew(CFG_MYMPD_PIN_HASH);
    config->covercache_keep_days = startup_getenv_int("MYMPD_COVERCACHE_KEEP_DAYS", CFG_MYMPD_COVERCACHE_KEEP_DAYS, COVERCACHE_AGE_MIN, COVERCACHE_AGE_MAX, config->first_startup);
    config->save_caches = startup_getenv_bool("MYMPD_SAVE_CACHES", CFG_MYMPD_SAVE_CACHES, config->first_startup);
    config->mympd_uri = startup_getenv_string("MYMPD_URI", CFG_MYMPD_URI, vcb_isname, config->first_startup);
    config->stickers = startup_getenv_bool("MYMPD_STICKERS", CFG_MYMPD_STICKERS, config->first_startup);

    sds album_mode_str = startup_getenv_string("MYMPD_ALBUM_MODE", CFG_MYMPD_ALBUM_MODE, vcb_isname, config->first_startup);
    config->albums.mode = parse_album_mode(album_mode_str);
    FREE_SDS(album_mode_str);

    sds album_group_tag_str = startup_getenv_string("MYMPD_ALBUM_GROUP_TAG", CFG_MYMPD_ALBUM_GROUP_TAG, vcb_isname, config->first_startup);
    config->albums.group_tag = mpd_tag_name_iparse(album_group_tag_str);
    FREE_SDS(album_group_tag_str);
    config->qobuz_app_id = startup_getenv_string("QOBUZ_APP_ID", CFG_IDEON_QOBUZ_APP_ID, vcb_isname, config->first_startup);
    config->qobuz_app_secret = startup_getenv_string("QOBUZ_APP_SECRET", CFG_IDEON_QOBUZ_APP_SECRET, vcb_isname, config->first_startup);
    config->qobuz_username = startup_getenv_string("QOBUZ_USERNAME", CFG_IDEON_QOBUZ_USERNAME, vcb_isname, config->first_startup);
    config->qobuz_password = startup_getenv_string("QOBUZ_PASSWORD", CFG_IDEON_QOBUZ_PASSWORD, vcb_isname, config->first_startup);
}

/**
 * Reads or writes the config from the /var/lib/mympd/config directory
 * @param config pointer to config struct
 * @param write if true create the file if not exists
 */
bool mympd_config_rw(struct t_config *config, bool write) {
    config->http = state_file_rw_bool(config->workdir, DIR_WORK_CONFIG, "http", config->http, write);
    config->http_host = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "http_host", config->http_host, vcb_isname, write);
    config->http_port = state_file_rw_int(config->workdir, DIR_WORK_CONFIG, "http_port", config->http_port, 0, MPD_PORT_MAX, write);
    
    // for compatibility with v10.2.0
    if (config->http_port == 0) {
        config->http = false;
    }

    config->ssl = state_file_rw_bool(config->workdir, DIR_WORK_CONFIG, "ssl", config->ssl, write);
    config->ssl_port = state_file_rw_int(config->workdir, DIR_WORK_CONFIG, "ssl_port", config->ssl_port, 0, MPD_PORT_MAX, write);
    config->ssl_san = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "ssl_san", config->ssl_san, vcb_isname, write);
    config->custom_cert = state_file_rw_bool(config->workdir, DIR_WORK_CONFIG, "custom_cert", config->custom_cert, write);
    if (config->custom_cert == true) {
        config->ssl_cert = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "ssl_cert", config->ssl_cert, vcb_isname, write);
        config->ssl_key = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "ssl_key", config->ssl_key, vcb_isname, write);
    }
    config->pin_hash = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "pin_hash", config->pin_hash, vcb_isname, write);
    config->acl = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "acl", config->acl, vcb_isname, write);
    config->scriptacl = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "scriptacl", config->scriptacl, vcb_isname, write);
    #ifdef MYMPD_ENABLE_LUA
        config->lualibs = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "lualibs", config->lualibs, vcb_isname, write);
    #else
        MYMPD_LOG_NOTICE(NULL, "Lua is disabled, ignoring lua settings");
    #endif
    config->covercache_keep_days = state_file_rw_int(config->workdir, DIR_WORK_CONFIG, "covercache_keep_days", config->covercache_keep_days, COVERCACHE_AGE_MIN, COVERCACHE_AGE_MAX, write);
    config->loglevel = state_file_rw_int(config->workdir, DIR_WORK_CONFIG, "loglevel", config->loglevel, LOGLEVEL_MIN, LOGLEVEL_MAX, write);
    config->save_caches = state_file_rw_bool(config->workdir, DIR_WORK_CONFIG, "save_caches", config->save_caches, write);
    config->mympd_uri = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "mympd_uri", config->mympd_uri, vcb_isname, write);
    config->stickers = state_file_rw_bool(config->workdir, DIR_WORK_CONFIG, "stickers", config->stickers, write);

    sds album_mode_str = state_file_rw_string(config->workdir, DIR_WORK_CONFIG, "album_mode", lookup_album_mode(config->albums.mode), vcb_isname, write);
    config->albums.mode = parse_album_mode(album_mode_str);
    FREE_SDS(album_mode_str);

    sds album_group_tag_str = state_file_rw_string(config->workdir, DIR_WORK_CONFIG, "album_group_tag", mpd_tag_name(config->albums.group_tag), vcb_isname, write);
    config->albums.group_tag = mpd_tag_name_iparse(album_group_tag_str);
    FREE_SDS(album_group_tag_str);

    //overwrite configured loglevel
    config->loglevel = getenv_int("MYMPD_LOGLEVEL", config->loglevel, LOGLEVEL_MIN, LOGLEVEL_MAX);

    //ideon
    config->qobuz_app_id = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "qobuz_app_id", config->qobuz_app_id, vcb_isname, write);
    config->qobuz_app_secret = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "qobuz_app_secret", config->qobuz_app_secret, vcb_isname, write);
    config->qobuz_username = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "qobuz_username", config->qobuz_username, vcb_isname, write);
    config->qobuz_password = state_file_rw_string_sds(config->workdir, DIR_WORK_CONFIG, "qobuz_password", config->qobuz_password, vcb_isname, write);
    return true;
}

/**
 * Writes the current version to the version file
 * @param workdir working directory
 * @return true if file was written, else false
 */
bool mympd_version_set(sds workdir) {
    sds version = sdsnew(MYMPD_VERSION);
    sds filepath = sdscatfmt(sdsempty(), "%S/%s/version", workdir, DIR_WORK_CONFIG);
    bool rc = write_data_to_file(filepath, version, sdslen(version));
    FREE_SDS(version);
    FREE_SDS(filepath);
    return rc;
}

/**
 * Checks the version of the configuration against current version
 * @param workdir working directory
 * @return true if version has not changed, else false
 */
bool mympd_version_check(sds workdir) {
    sds version = sdsempty();
    sds filepath = sdscatfmt(sdsempty(), "%S/%s/version", workdir, DIR_WORK_CONFIG);
    sds_getfile(&version, filepath, 10, true, false);
    bool rc = strcmp(version, MYMPD_VERSION) == 0
        ? true
        : false;
    FREE_SDS(version);
    FREE_SDS(filepath);
    return rc;
}

/**
 * Private functions
 */

/**
 * Gets an environment variable as sds string
 * @param env_var variable name to read
 * @param default_value default value if variable is not set
 * @param vcb validation callback
 * @param first_startup true for first startup else false
 * @return environment variable as sds string
 */
static sds startup_getenv_string(const char *env_var, const char *default_value, validate_callback vcb, bool first_startup) {
    return first_startup == true 
        ? getenv_string(env_var, default_value, vcb)
        : sdsnew(default_value);
}

/**
 * Gets an environment variable as int
 * @param env_var variable name to read
 * @param default_value default value if variable is not set
 * @param min minimum value (including)
 * @param max maximum value (including)
 * @param first_startup true for first startup else false
 * @return environment variable as integer
 */
static int startup_getenv_int(const char *env_var, int default_value, int min, int max, bool first_startup) {
    return first_startup == true
        ? getenv_int(env_var, default_value, min, max)
        : default_value;
}

/**
 * Gets an environment variable as bool
 * @param env_var variable name to read
 * @param default_value default value if variable is not set
 * @param first_startup true for first startup else false
 * @return environment variable as bool
 */
static bool startup_getenv_bool(const char *env_var, bool default_value, bool first_startup) {
    return first_startup == true
        ? getenv_bool(env_var, default_value)
        : default_value;
}
