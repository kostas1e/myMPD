
#include <stdbool.h>
#include <curl/curl.h>
//#include stdlib;

#include "../../dist/src/frozen/frozen.h"
#include "../../dist/src/sds/sds.h"
#include "log.h"
#include "sds_extras.h"
#include "tidal_utility.h"
#include "tidal.h"

#define TIDALHIFI_API "https://api.tidalhifi.com/v1"

static sds tidal_token;
static sds tidal_username;
static sds tidal_password;
static sds tidal_audioquality;

static char *user_id = NULL;
static char *session_id = NULL;
static char *country_code = NULL;
static bool is_logged_in = false;

static void logout(void) {
    user_id = NULL;
    session_id = NULL;
    country_code = NULL;
    is_logged_in = false;
}

static bool login(const char *username, const char *password) {
    logout();
    if (!username || !password)
        return false;
    
    CURL *easy_handle = curl_easy_init();
    if (easy_handle) {
        struct memory_struct chunk;
        chunk.memory = malloc(1);
        chunk.size = 0;
        
        sds url = sdscat(sdsnew(TIDALHIFI_API), "/login/username");
        curl_easy_setopt(easy_handle, CURLOPT_URL, url);
        // x-tidal-token
        sds data = sdscatfmt(sdsempty(), "token=%s&username=%s&password=%s", tidal_token, username, password);
        curl_easy_setopt(easy_handle, CURLOPT_POSTFIELDS, data);
        // bypass auth w/ ua plus opts
        
        CURLcode res = curl_easy_perform(easy_handle);
        sdsfree(data);
        sdsfree(url);
        if (res != CURLE_OK) {
            LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
            free(chunk.memory);
            curl_easy_cleanup(easy_handle);
            return false;
        }
        else { // 0
            int je = json_scanf(chunk.memory, chunk.size, "{userId:%lu,sessionId:%Q,countryCode:%Q}", &user_id, &session_id, &country_code);
            if (je == 3) {
                LOG_INFO("Login successful");
                LOG_DEBUG(chunk.memory);
                free(chunk.memory);
                curl_easy_cleanup(easy_handle);
                return true;
            }
            else {
                // status subStatus userMessage
                char *user_message = NULL;
                json_scanf(chunk.memory, chunk.size, "{userMessage:%Q}", &user_message);
                LOG_ERROR(user_message);
                FREE_PTR(user_message);
                free(chunk.memory);
                curl_easy_cleanup(easy_handle);
                return false;
            }
        }
    }
    else { // NULL
        LOG_ERROR("curl_easy_init");
        return false;
    }
}

void tidal_session_init(sds username, sds password, sds audioquality) {
    tidal_token = sdsnew("kgsOOmYk3zShYrNP");
    tidal_username = sdsreplacelen(tidal_username, username, sdslen(username));
    tidal_password = sdsreplacelen(tidal_password, password, sdslen(password));
    tidal_audioquality = sdsreplacelen(tidal_audioquality, audioquality, sdslen(audioquality));
    is_logged_in = login(username, password);
}

// Write tidal_input_plugin.conf with settings for mpd
static bool otherconf_w(const char *filename) {
    // path is relative to mpd.conf
    //sds other_conf = sdscatfmt(sdsempty(), "%s/%s", ETC_PATH, filename);
    sds other_conf = sdscatfmt(sdsempty(), "/usr/local/etc/%s", filename);
    FILE *fp = fopen(other_conf, "w");
    sdsfree(other_conf);
    if (fp) { // other.conf successfully opened
        sds buffer = sdscatfmt(sdsempty(), "input {\n\tplugin \"tidal\"\n\ttoken \"%s\"\n\tusername \"%s\"\n\tpassword \"%s\"\n\taudioquality \"%s\"\n}\n",
            tidal_token, tidal_username, tidal_password, tidal_audioquality);
        fputs(buffer, fp);
        sdsfree(buffer);
        fclose(fp);
        return true;
    }
    return false;
}

// Read mpd.conf for include "tidal_input_plugin.conf" and append if needed
static bool mpdconf_ra(const char *filename) {
    // add to config/settings with default location /etc/mpd.conf
    //sds mpd_conf = sdscatfmt(sdsempty(), "%s/mpd.conf", ETC_PATH);
    sds mpd_conf = sdsnew("/usr/local/etc/mpd.conf");
    sds include = sdscatfmt(sdsempty(), "include \"%s\"", filename);
    bool found = false;
    char *line = NULL;
    size_t n =0;
    ssize_t read= 0;
    FILE *fp = fopen(mpd_conf, "r");
    if (fp) { // mpd.conf successfully opened
        while ((read = getline(&line, &n, fp)) > 0) {
            if (strcmp(line, include) == 0) {
                found = true;
                break;
            }
        }
        sdsfree(mpd_conf);
        if (!found) { // append mpd.conf
            fp = freopen(NULL, "a", fp);
            if (fp) { // mpd.conf successfully reopend
                fputs("\n", fp);
                fputs(include, fp);
                fputs("\n", fp);
                sdsfree(include);
                fclose(fp);
                return otherconf_w(filename); // proceed with restart if true
            }
            else {
                LOG_ERROR("Can't open %s for write", mpd_conf);
                sdsfree(include);
                return false;
            }
        }
        else { // found
            fputs("\n", fp);
            fputs(include, fp);
            fputs("\n", fp);
            sdsfree(include);
            fclose(fp);
            return otherconf_w(filename); // proceed with restart if true
        }
    }
    sdsfree(include);
    return false;
}

// Restarts mpd service (since config file updated)
static bool restart_mpd(void) {
    sds cmdline = sdsnew("systemctl restart mpd");
    const int rc = system(cmdline);
    LOG_INFO("Restarting mpd service...");
    if (rc == 0) {
        LOG_INFO("Success");
        return true;
    }
    else {
        LOG_ERROR("Fail");
        return false;
    }
}

// Update username, password and/or audioquality for mpd plugin and restart mpd
void tidal_session_update(sds username, sds password, sds audioquality) {
    bool user = false;
    bool qual = false;
    if (sdscmp(username, tidal_username) || sdscmp(password, tidal_password) || sdscmp(audioquality, tidal_audioquality)) {
        tidal_username = sdsreplacelen(tidal_username, username, sdslen(username));
        tidal_password = sdsreplacelen(tidal_password, password, sdslen(password));
        is_logged_in = login(username, password);
        LOG_DEBUG("username set to %s, password set to %s", username, password);
        user = true;
    }
    if (sdscmp(audioquality, tidal_audioquality)) {
        tidal_audioquality = sdsreplacelen(tidal_audioquality, audioquality, sdslen(audioquality));
        LOG_DEBUG("audioquality set to %s", audioquality);
        qual = true;
    }
    if (user || qual) {
        if (mpdconf_ra("tidal_input_plugin.conf")) {
            LOG_INFO("mpd.conf updated, attempting to restart service");
            restart_mpd();
        }
    }
}
