/*
 SPDX-License-Identifier: GPL-2.0-or-later
 myMPD (c) 2018-2020 Juergen Mang <mail@jcgames.de>
 https://github.com/jcorporation/mympd
*/

#define INCBIN_PREFIX
#define INCBIN_STYLE INCBIN_STYLE_SNAKE
#include "../../dist/src/incbin/incbin.h"

//compressed assets
INCBIN(sw_js, "../dist/htdocs/sw.js.gz");
INCBIN(mympd_webmanifest, "../dist/htdocs/mympd.webmanifest.gz");
INCBIN(index_html, "../dist/htdocs/index.html.gz");
INCBIN(coverimage_notavailable_svg, "../dist/htdocs/assets/coverimage-notavailable.svg.gz");
INCBIN(coverimage_stream_svg, "../dist/htdocs/assets/coverimage-stream.svg.gz");
INCBIN(coverimage_loading_svg, "../dist/htdocs/assets/coverimage-loading.svg.gz");
INCBIN(coverimage_booklet_svg, "../dist/htdocs/assets/coverimage-booklet.svg.gz");
INCBIN(coverimage_mympd_svg, "../dist/htdocs/assets/coverimage-mympd.svg.gz");
INCBIN(combined_css, "../dist/htdocs/css/combined.css.gz");
INCBIN(combined_js, "../dist/htdocs/js/combined.js.gz");
//uncompressed assets
INCBIN(favicon_ico, "../htdocs/assets/favicon.ico");
INCBIN(appicon_192_png, "../htdocs/assets/appicon-192.png");
INCBIN(appicon_512_png, "../htdocs/assets/appicon-512.png");
INCBIN(MaterialIcons_Regular_woff2, "../htdocs/assets/MaterialIcons-Regular.woff2");
INCBIN(logo_ideon_png, "../htdocs/assets/logo-ideon.png");
