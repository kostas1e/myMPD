#ifndef __TIDAL_UTILITY_H__
#define __TIDAL_UTILITY_H__

typedef struct t_tidal_state {
    //sds token;
    sds username;
    sds password;
    sds audioquality;
    sds searchtaglist;
    sds cols_search;
} t_tidal_state;

char *escape(const char *string);
char *extract_id(const char *uri);
char *strrev(char *str);
unsigned max_of_four(unsigned a, unsigned b, unsigned c, unsigned d);
unsigned number_of_items(unsigned limit, unsigned offset, unsigned total);
void free_tidal_state(t_tidal_state *tidal_state);
void default_tidal_state(t_tidal_state *tidal_state);

#endif
