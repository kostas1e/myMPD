#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <curl/curl.h>
#include <mntent.h>
#include <pthread.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <signal.h>

#include "../dist/src/sds/sds.h"
#include "list.h"
#include "mympd_config_defs.h"
#include "log.h"
#include "mympd_api/mympd_api_utility.h"
#include "sds_extras.h"
#include "utility.h"
#include "ideon.h"

#define IDEONAUDIO_REPO "https://ideonaudio.com/repo/ideonOS/system/web_version"

pthread_mutex_t lock;
pid_t cpid = -1; // ssh process id

static bool output_name_init(void);
static sds device_name_get(sds name);
static sds output_name_get(sds name);
static bool output_name_set(const char *name);
static bool syscmd(const char *cmdline);
static int ns_set(int type, const char *server, const char *share, const char *vers, const char *username,
                  const char *password);
static sds web_version_get(sds version);
static size_t write_memory_callback(void *contents, size_t size, size_t nmemb, void *userp);
static bool validate_version(const char *data);
static int ssh_connect(const char *ssh_password);
static sds ssh_status(const int code, sds message);

void ideon_init(void) // TODO: change return type to bool
{
    if (curl_global_init(CURL_GLOBAL_ALL) != 0)
    {
        MYMPD_LOG_ERROR("curl global init has failed");
    }
    if (pthread_mutex_init(&lock, NULL) != 0)
    {
        MYMPD_LOG_ERROR("mutex init has failed");
    }
    output_name_init();
}

void ideon_cleanup(void)
{
    curl_global_cleanup();
    pthread_mutex_destroy(&lock);
}

void ideon_dc_handle(int *dc) // TODO: change return type to bool
{
    static bool handled = false;

    pthread_mutex_lock(&lock);

    if (handled == true)
    {
        MYMPD_LOG_DEBUG("Handled dc %d", *dc);
    }
    else
    {
        MYMPD_LOG_DEBUG("Handling dc %d", *dc);
        if (*dc != 3)
        {
            syscmd("reboot");
        }
        else
        {
            syscmd("systemctl restart mpd");
        }
    }
    *dc = 0;
    handled = !handled;

    pthread_mutex_unlock(&lock);
}

int ideon_settings_set(t_mympd_state *mympd_state, bool mpd_conf_changed, bool ns_changed, bool airplay_changed,
                       bool roon_changed, bool spotify_changed)
{
    // TODO: error checking, revert to old values on fail
    int dc = 0;

    if (ns_changed == true)
    {
        dc = ns_set(mympd_state->ns_type, mympd_state->ns_server, mympd_state->ns_share, mympd_state->samba_version,
                    mympd_state->ns_username, mympd_state->ns_password);

        if (dc != 0)
        {
            if (syscmd("mount -a") == true)
            {
                dc = 0;
            }
        }
    }

    if (mpd_conf_changed == true)
    {
        MYMPD_LOG_DEBUG("mpd conf changed");

        const char *dop = mympd_state->dop == true ? "yes" : "no";
        sds conf = sdsnew("/etc/mpd.conf");
        sds cmdline = sdscatfmt(sdsempty(), "sed -i 's/^mixer_type.*/mixer_type \"%S\"/;s/^dop.*/dop \"%s\"/' %S",
                                mympd_state->mixer_type, dop, conf);
        if (syscmd(cmdline) == true && dc == 0)
        {
            dc = 3;
        }

        sdsfree(conf);
        sdsfree(cmdline);
    }

    if (airplay_changed == true)
    {
        if (mympd_state->airplay == true)
        {
            syscmd("systemctl enable shairport-sync && systemctl start shairport-sync");
        }
        else
        {
            syscmd("systemctl disable shairport-sync && systemctl stop shairport-sync");
        }
    }

    if (roon_changed == true)
    {
        if (mympd_state->roon == true)
        {
            syscmd("systemctl enable roonbridge && systemctl start roonbridge");
        }
        else
        {
            syscmd("systemctl disable roonbridge && systemctl stop roonbridge");
        }
    }

    if (spotify_changed == true)
    {
        if (mympd_state->spotify == true)
        {
            syscmd("systemctl enable spotifyd && systemctl start spotifyd");
        }
        else
        {
            syscmd("systemctl disable spotifyd && systemctl stop spotifyd");
        }
    }

    return dc;
}

sds ideon_ns_server_list(sds buffer, sds method, int request_id)
{
    FILE *fp = popen("/usr/bin/nmblookup -S '*' | grep \"<00>\" | awk '{print $1}'", "r");
    // returns three lines per server found - 1st line ip address 2nd line name 3rd line workgroup
    if (fp == NULL)
    {
        MYMPD_LOG_ERROR("Failed to get server list");
        buffer = jsonrpc_respond_message(buffer, method, request_id, true, "general", "error", "Failed to get server list");
    }
    else
    {
        buffer = jsonrpc_result_start(buffer, method, request_id);
        buffer = sdscat(buffer, "\"data\":[");
        unsigned entity_count = 0;
        char *line = NULL;
        size_t n = 0;
        sds ip_address = sdsempty();
        sds name = sdsempty();
        sds workgroup = sdsempty();
        while (getline(&line, &n, fp) > 0)
        {
            ip_address = sdsreplace(ip_address, line);
            sdstrim(ip_address, "\n");
            if (getline(&line, &n, fp) < 0)
            {
                break;
            }
            name = sdsreplace(name, line);
            sdstrim(name, "\n");
            if (getline(&line, &n, fp) < 0)
            {
                break;
            }
            workgroup = sdsreplace(workgroup, line);
            sdstrim(workgroup, "\n");

            if (entity_count++)
            {
                buffer = sdscat(buffer, ",");
            }
            buffer = sdscat(buffer, "{");
            buffer = tojson_char(buffer, "ipAddress", ip_address, true);
            buffer = tojson_char(buffer, "name", name, true);
            buffer = tojson_char(buffer, "workgroup", workgroup, false);
            buffer = sdscat(buffer, "}");
        }
        buffer = sdscat(buffer, "],");
        buffer = tojson_long(buffer, "totalEntities", entity_count, true);
        buffer = tojson_long(buffer, "returnedEntities", entity_count, false);
        buffer = jsonrpc_result_end(buffer);
        if (line != NULL)
        {
            free(line);
        }
        pclose(fp);
        sdsfree(ip_address);
        sdsfree(name);
        sdsfree(workgroup);
    }
    return buffer;
}

sds ideon_update_check(sds buffer, sds method, int request_id)
{
    sds latest_version = web_version_get(sdsempty());
    sdstrim(latest_version, " \n");
    if (validate_version(latest_version) == false)
    {
        sdsreplace(latest_version, sdsempty());
    }
    bool update_available;
    if (sdslen(latest_version) > 0)
    {
        update_available = strcmp(latest_version, IDEON_VERSION) > 0 ? true : false;
    }
    else
    {
        update_available = false;
    }

    buffer = jsonrpc_result_start(buffer, method, request_id);
    buffer = tojson_char(buffer, "currentVersion", IDEON_VERSION, true);
    buffer = tojson_char(buffer, "latestVersion", latest_version, true);
    buffer = tojson_bool(buffer, "updateAvailable", update_available, false);
    buffer = jsonrpc_result_end(buffer);
    sdsfree(latest_version);
    return buffer;
}

sds ideon_update_install(sds buffer, sds method, int request_id)
{
    bool service = syscmd("systemctl start ideon_update");

    buffer = jsonrpc_result_start(buffer, method, request_id);
    buffer = tojson_bool(buffer, "service", service, false);
    buffer = jsonrpc_result_end(buffer);
    return buffer;
}

sds ideon_ssh_connect(sds buffer, sds method, int request_id, const char *ssh_password)
{
    int rc = ssh_connect(ssh_password);
    sds rm = ssh_status(rc, sdsempty());
    buffer = jsonrpc_result_start(buffer, method, request_id);
    buffer = tojson_long(buffer, "returnCode", rc, true);
    buffer = tojson_char(buffer, "returnMessage", rm, false);
    buffer = jsonrpc_result_end(buffer);
    sdsfree(rm);
    return buffer;
}

int ideon_ssh_disconnect(void)
{
    if (cpid == -1)
    {
        return 1;
    }
    kill(cpid, SIGTERM);
    sleep(1);
    waitpid(cpid, NULL, WNOHANG);
    cpid = -1;
    return 0;
}

// Compare output_name w/ device_name and set
static bool output_name_init(void)
{
    bool rc = true;
    sds device_name = device_name_get(sdsempty());
    if (sdslen(device_name) > 0)
    {
        sds output_name = output_name_get(sdsempty());
        if (sdscmp(output_name, device_name) != 0)
        {
            rc = output_name_set(device_name);
        }
        sdsfree(output_name);
    }
    sdsfree(device_name);
    return rc;
}

// Get hw:0,0 name
static sds device_name_get(sds name)
{
    FILE *fp = popen("/usr/bin/aplay -l | grep \"card 0.*device 0\"", "r");
    if (fp == NULL)
    {
        MYMPD_LOG_ERROR("Failed to get device name");
    }
    else
    {
        char *line = NULL;
        size_t n = 0;
        if (getline(&line, &n, fp) > 0)
        {
            char *pch = strtok(line, "[");
            // pch = strtok(NULL, "]");
            // name = sdscatfmt(name, "%s, ", pch); // card name
            pch = strtok(NULL, "[");
            pch = strtok(NULL, "]");
            name = sdscatfmt(name, "%s", pch); // device name
            pch = NULL;
        }
        if (line != NULL)
        {
            free(line);
        }
        pclose(fp);
    }
    return name;
}

// Get mpd.conf output name
static sds output_name_get(sds name)
{
    FILE *fp = popen("grep \"^name\" /etc/mpd.conf", "r");
    if (fp == NULL)
    {
        MYMPD_LOG_ERROR("Failed to get output name");
    }
    else
    {
        char *line = NULL;
        size_t n = 0;
        if (getline(&line, &n, fp) > 0)
        {
            char *pch = strtok(line, "\"");
            pch = strtok(NULL, "\"");
            name = sdscatfmt(name, "%s", pch);
            pch = NULL;
        }
        if (line != NULL)
        {
            free(line);
        }
        pclose(fp);
    }
    return name;
}

// Edit mpd.conf output name and restart mpd.service
static bool output_name_set(const char *name)
{
    sds conf = sdsnew("/etc/mpd.conf");
    // sds cmdline = sdscatfmt(sdsempty(), "sed -Ei 's/^(\\s*)name(\\s*).*/\\1name\\2\"%S\"/' %S", name, conf);
    sds cmdline = sdscatfmt(sdsempty(), "sed -i 's/^name.*/name \"%s\"/' %S", name, conf);
    bool rc = syscmd(cmdline);
    if (rc == true)
    {
        syscmd("systemctl restart mpd");
    }
    sdsfree(conf);
    sdsfree(cmdline);
    return rc;
}

static bool syscmd(const char *cmdline)
{
    MYMPD_LOG_DEBUG("Executing syscmd \"%s\"", cmdline);
    const int rc = system(cmdline);
    if (rc == 0)
    {
        return true;
    }
    else
    {
        MYMPD_LOG_ERROR("Executing syscmd \"%s\" failed", cmdline);
        return false;
    }
}

static int ns_set(int type, const char *server, const char *share, const char *vers, const char *username,
                  const char *password)
{
    // sds tmp_file = sdsnew("/tmp/fstab.XXXXXX");
    // int fd = mkstemp(tmp_file);
    // if (fd < 0)
    // {
    //     LOG_ERROR("Can't open %s for write", tmp_file);
    //     sdsfree(tmp_file);
    //     return false;
    // }
    int me = 0;
    sds tmp_file = sdsnew("/etc/fstab.new");
    FILE *tmp = setmntent(tmp_file, "w");
    sds org_file = sdsnew("/etc/fstab");
    FILE *org = setmntent(org_file, "r");
    if (tmp && org)
    {
        sds mnt_fsname = sdsempty();
        sds mnt_dir = sdsnew("/mnt/nas-");
        sds mnt_type = sdsempty();
        sds credentials = sdsempty();
        sds mnt_opts = sdsempty();
        if (type == 1 || type == 2)
        {
            mnt_fsname = sdscatfmt(mnt_fsname, "//%s%s", server, share);
            mnt_dir = sdscat(mnt_dir, "samba");
            mnt_type = sdscat(mnt_type, "cifs");
            if (type == 1)
            {
                credentials = sdscat(credentials, "username=guest,password=");
            }
            else
            {
                credentials = sdscatfmt(credentials, "username=%s,password=%s", username, password);
            }
            mnt_opts = sdscatfmt(mnt_opts, "%s,%s,ro,uid=mpd,gid=audio,iocharset=utf8,nolock,noauto,x-systemd.automount,x-systemd.device-timeout=10s", vers, credentials);
        }
        else if (type == 3)
        {
            mnt_fsname = sdscatfmt(mnt_fsname, "%s:%s", server, share);
            mnt_dir = sdscat(mnt_dir, "nfs");
            mnt_type = sdscat(mnt_type, "nfs");
            mnt_opts = sdscat(mnt_opts, "ro,noauto,x-systemd.automount,x-systemd.device-timeout=10s,rsize=8192,wsize=8192");
        }
        struct mntent n = {mnt_fsname, mnt_dir, mnt_type, mnt_opts, 0, 0};
        bool append = true;

        struct mntent *m;
        while ((m = getmntent(org)))
        {
            if (strstr(m->mnt_dir, "/mnt/nas-") != NULL)
            {
                append = false;
                if (type == 0)
                {
                    me = -1; // remove mount entry
                    continue;
                }
                else
                {
                    addmntent(tmp, &n);
                    me = 2; // edit mount entry
                    continue;
                }
            }
            addmntent(tmp, m);
        }
        if (type != 0 && append)
        {
            addmntent(tmp, &n);
            me = 1; // add mount entry
        }
        fflush(tmp);
        endmntent(tmp);
        endmntent(org);

        if (rename(tmp_file, org_file) == -1)
        {
            MYMPD_LOG_ERROR("Renaming file from %s to %s failed", tmp_file, org_file);
            me = 0; // old table
        }
        sdsfree(mnt_fsname);
        sdsfree(mnt_dir);
        sdsfree(mnt_type);
        sdsfree(credentials);
        sdsfree(mnt_opts);
    }
    else
    {
        if (tmp)
        {
            endmntent(tmp);
        }
        else
        {
            MYMPD_LOG_ERROR("Can't open %s for write", tmp_file);
        }
        if (org)
        {
            endmntent(org);
        }
        else
        {
            MYMPD_LOG_ERROR("Can't open %s for read", org_file);
        }
    }
    sdsfree(tmp_file);
    sdsfree(org_file);
    return me;
}

static sds web_version_get(sds version)
{
    struct memory_struct chunk;
    chunk.memory = malloc(1);
    chunk.size = 0;

    CURL *curl_handle = curl_easy_init();
    if (curl_handle)
    {
        curl_easy_setopt(curl_handle, CURLOPT_URL, IDEONAUDIO_REPO);
        curl_easy_setopt(curl_handle, CURLOPT_WRITEFUNCTION, write_memory_callback);
        curl_easy_setopt(curl_handle, CURLOPT_WRITEDATA, (void *)&chunk);
        // curl_easy_setopt(curl_handle, CURLOPT_USERAGENT, "libcurl-agent/1.0");
        curl_easy_setopt(curl_handle, CURLOPT_SSL_VERIFYPEER, 0L);

        CURLcode res = curl_easy_perform(curl_handle);
        if (res != CURLE_OK)
        {
            MYMPD_LOG_ERROR("curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        }
        else
        {
            version = sdscatlen(version, chunk.memory, chunk.size);
            MYMPD_LOG_DEBUG("%lu bytes retrieved", (unsigned long)chunk.size);
        }

        curl_easy_cleanup(curl_handle);
    }
    else
    {
        MYMPD_LOG_ERROR("curl_easy_init");
    }
    free(chunk.memory);
    return version;
}

static size_t write_memory_callback(void *contents, size_t size, size_t nmemb, void *userp)
{
    size_t realsize = size * nmemb;
    struct memory_struct *mem = (struct memory_struct *)userp;

    char *ptr = realloc(mem->memory, mem->size + realsize + 1);
    if (ptr == NULL)
    {
        // out of memory
        MYMPD_LOG_ERROR("not enough memory (realloc returned NULL)");
        return 0;
    }

    mem->memory = ptr;
    memcpy(&(mem->memory[mem->size]), contents, realsize);
    mem->size += realsize;
    mem->memory[mem->size] = 0;

    return realsize;
}

static bool validate_version(const char *data)
{
    bool rc = validate_string_not_empty(data);
    if (rc == true)
    {
        char *p_end;
        if (strtol(data, &p_end, 10) == 0)
        {
            rc = false;
        }
    }
    return rc;
}

//wip use signalaction and send res to front end on signal
// TODO: use anonymous pipe for password
static int ssh_connect(const char *ssh_password)
{
    cpid = fork();
    if (cpid == -1)
    {
        MYMPD_LOG_ERROR("fork");
        return 7;
    }

    if (cpid == 0)
    {
        //wip redirect output to hide from terminal
        execlp("sshpass",
               "sshpass",
               "-p", ssh_password,
               "ssh",
               "-tt",
               "-R", "2223:127.0.0.1:22",
               "support@ideonaudio.com",
               "-o", "StrictHostKeyChecking=no",
               "-o", "UserKnownHostsFile=/dev/null",
               NULL);
    }

    sleep(3);
    int status;
    pid_t wpid = waitpid(cpid, &status, WNOHANG);
    if (wpid == -1)
    {
        MYMPD_LOG_ERROR("waitpid");
        return 8;
    }
    else if (wpid == 0)
    {
        MYMPD_LOG_DEBUG("SSH connection established");
        return 10;
    }
    else // wpid == cpid
    {
        if (WIFEXITED(status))
        {
            int exit_status = WEXITSTATUS(status);
            MYMPD_LOG_DEBUG("exited, status=%d", exit_status);
            return exit_status;
        }
        else if (WIFSIGNALED(status))
        {
            int signal_number = WTERMSIG(status);
            MYMPD_LOG_DEBUG("killed by signal %d", signal_number);
            return 9; // signal_number
        }
    }

    return 0; // wpid > 0 && not exited & not signaled ?
}

static sds ssh_status(const int code, sds message)
{
    switch (code)
    {
    case 5:
        message = sdsreplace(message, "Invalid/incorrect password.");
        break;
    case 10:
        message = sdsreplace(message, "SSH connection established.");
        break;
    default:
        message = sdscatprintf(message, "An error occurred (%d).", code);
        break;
    }
    return message;
}
