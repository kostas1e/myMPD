#ifndef MEMORY_H
#define MEMORY_H

#include <stddef.h>

// FIXME typedef
struct t_memory {
    char *memory;
    size_t size;
};

size_t write_memory_callback(void *data, size_t size, size_t nmemb,
                             void *clientp);

#endif
