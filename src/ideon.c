#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <curl/curl.h>
#include <mntent.h>

#include "../dist/src/sds/sds.h"
#include "list.h"
#include "config_defs.h"
#include "log.h"
#include "mympd_api/mympd_api_utility.h"
#include "sds_extras.h"
#include "tidal.h"
#include "utility.h"
#include "ideon.h"

#define IDEONAUDIO_REPO "https://ideonaudio.com/repo/v1.1.0/web_version"

static bool syscmd(const char *cmdline)
{
    LOG_DEBUG("Executing syscmd \"%s\"", cmdline);
    const int rc = system(cmdline);
    if (rc == 0)
    {
        return true;
    }
    else
    {
        LOG_ERROR("Executing syscmd \"%s\" failed", cmdline);
        return false;
    }
}

static bool ns_set(int type, const char *server, const char *share, const char *username, const char *password)
{
    sds tmp_file = sdsnew("/tmp/fstab.XXXXXX");
    int fd = mkstemp(tmp_file);
    if (fd < 0)
    {
        LOG_ERROR("Can't open %s for write", tmp_file);
        sdsfree(tmp_file);
        return false;
    }
    // sds tmp_file = sdsnew("/tmp/fstab.new");
    FILE *tmp = setmntent(tmp_file, "w");
    sds org_file = sdsnew("/etc/fstab");
    FILE *org = setmntent(org_file, "r");
    if (tmp && org)
    {
        syscmd("umount /mnt/nas-samba"); // check if mounted
        sds mnt_fsname = sdscatfmt(sdsempty(), "//%s%s", server, share);
        sds mnt_dir = sdsnew("/mnt/nas-samba");
        sds mnt_type = sdsnew("cifs");
        sds user = sdsempty();
        if (type == 1) {
            user = sdscatfmt(user, "guest");
        }
        else if (type == 2) {
            user = sdscatfmt(user, "username=%s,password=%s", username, password);
        }
        sds mnt_opts = sdscatfmt(sdsempty(), "vers=3.0,%s,ro,uid=mpd,gid=audio,iocharset=utf8,nolock,noauto,x-systemd.automount,x-systemd.device-timeout=10s", user);
        struct mntent n = {mnt_fsname, mnt_dir, mnt_type, mnt_opts, 0, 0};
        bool append = true;
        bool mount = true;

        struct mntent *m;
        while ((m = getmntent(org)))
        {
            if (strcmp(m->mnt_dir, mnt_dir) == 0)
            {
                append = false;
                if (type == 0)
                {
                    mount = false;
                    continue;
                }
                else
                {
                    addmntent(tmp, &n);
                    continue;
                }
            }
            addmntent(tmp, m);
        }
        if (type != 0 && append)
        {
            addmntent(tmp, &n);
        }
        fflush(tmp);
        endmntent(tmp);
        endmntent(org);

        int rc = rename(tmp_file, org_file);
        if (rc == -1)
        {
            LOG_ERROR("Renaming file from %s to %s failed", tmp_file, org_file);
        }
        sdsfree(mnt_fsname);
        sdsfree(mnt_dir);
        sdsfree(mnt_type);
        sdsfree(mnt_opts);
        sdsfree(tmp_file);
        sdsfree(org_file);
        if (rc == -1)
        {
            return false;
        }
        printf("fstab updated\n");
        if (mount == true) {
            syscmd("mount /mnt/nas-samba");
        }
        return true;
    }
    else
    {
        LOG_ERROR("Can't open %s for read", org_file);
        if (tmp)
            endmntent(tmp);
        if (org)
            endmntent(org);
        sdsfree(tmp_file);
        sdsfree(org_file);
        return false;
    }
}

bool ideon_settings_set(t_mympd_state *mympd_state, bool mpd_conf_changed)
{
     // TODO: error checking
    bool rc = true;

    if (mpd_conf_changed == true)
    {
        LOG_DEBUG("mpd conf changed");
        //audio settings
        const char *dop = mympd_state->dop == true ? "yes" : "no";
        sds conf = sdsnew("/etc/mpd.conf");
        sds cmdline = sdscatfmt(sdsempty(), "sed -i 's/^mixer_type.*/mixer_type \"%S\"/;s/^dop.*/dop \"%s\"/' %S",
                                mympd_state->mixer_type, dop, conf);
        rc = syscmd(cmdline);

        //streaming services
        const char *tidal_enabled = mympd_state->tidal_enabled == true ? "yes" : "no";
        conf = sdsreplace(conf, "/etc/tidal_input_plugin.conf");
        cmdline = sdscrop(cmdline);
        cmdline = sdscatfmt(cmdline, "sed -i 's/^enabled.*/enabled \"%s\"/;s/^username.*/username \"%S\"/;s/^password.*/password \"%S\"/;s/^audioquality.*/audioquality \"%S\"/' %S",
                            tidal_enabled, mympd_state->tidal_username, mympd_state->tidal_password, mympd_state->tidal_audioquality, conf);
        rc = syscmd(cmdline);
        if (rc == true && mympd_state->tidal_enabled == true)
            tidal_session_manager(mympd_state->tidal_username, mympd_state->tidal_password);

        syscmd("systemctl restart mpd");
        sdsfree(conf);
        sdsfree(cmdline);
    }

    //network share
    ns_set(mympd_state->ns_type, mympd_state->ns_server, mympd_state->ns_share, mympd_state->ns_username, mympd_state->ns_password);

    //streaming services
    if (mympd_state->airplay == true) {
        syscmd("systemctl enable shairport-sync");
        syscmd("systemctl start shairport-sync");
    }
    else {
        syscmd("systemctl stop shairport-sync");
        syscmd("systemctl disable shairport-sync");
    }
    if (mympd_state->spotify == true) {
        syscmd("systemctl enable spotifyd");
        syscmd("systemctl start spotifyd");
    }
    else {
        syscmd("systemctl stop spotifyd");
        syscmd("systemctl disable spotifyd");
    }
    
    return rc;
}

static sds get_version(sds version)
{
    struct memory_struct chunk;
    chunk.memory = malloc(1);
    chunk.size = 0;

    CURL *curl_handle = curl_easy_init();
    if (curl_handle)
    {
        curl_easy_setopt(curl_handle, CURLOPT_URL, IDEONAUDIO_REPO);
        curl_easy_setopt(curl_handle, CURLOPT_WRITEFUNCTION, write_callback);
        curl_easy_setopt(curl_handle, CURLOPT_WRITEDATA, (void *)&chunk);

        CURLcode res = curl_easy_perform(curl_handle);
        if (res != CURLE_OK)
        {
            LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        }
        else
        {
            version = sdscatlen(version, chunk.memory, chunk.size);
            LOG_INFO("%lu bytes retrieved", (unsigned long)chunk.size);
        }

        curl_easy_cleanup(curl_handle);
    }
    else
    {
        LOG_ERROR("curl_easy_init");
    }
    free(chunk.memory);
    return version;
}

sds ideon_check_for_updates(sds buffer, sds method, int request_id)
{
    sds latest_version = get_version(sdsempty()); // trim
    bool updates_available;
    if (sdslen(latest_version) > 0)
    {
        updates_available = strcmp(latest_version, IDEON_VERSION) > 0 ? true : false;
    }
    else
    {
        updates_available = false;
    }

    buffer = jsonrpc_start_result(buffer, method, request_id);
    buffer = sdscat(buffer, ",");
    buffer = tojson_char(buffer, "currentVersion", IDEON_VERSION, true);
    buffer = tojson_char(buffer, "latestVersion", latest_version, true);
    buffer = tojson_bool(buffer, "updatesAvailable", updates_available, false);
    buffer = jsonrpc_end_result(buffer);
    sdsfree(latest_version);
    return buffer;
}

bool ideon_install_updates(void)
{
    // system commands
    // reboot or reload daemon & restart service

    return false;
}
