// The bundled pictures of the picture skins: our own flat SVG illustrations, 512 x 512, drawn so
// that every part of each looks different (a child solving a 5x5 needs every tile to be findable):
// gradient backgrounds and a different object in each region, no large plain areas.

export interface Picture {
  id: PictureId;
  title: string;
  /** What the picture shows, for the skin picker's thumbnail. */
  alt: string;
  svg: string;
}

export const PICTURE_IDS = ['rocket', 'cat', 'balloon', 'fish', 'castle'] as const;
export type PictureId = (typeof PICTURE_IDS)[number];

const ROCKET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d1b6b"/><stop offset=".55" stop-color="#3d2a8f"/><stop offset="1" stop-color="#7a2f87"/></linearGradient>
<radialGradient id="n" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff6fb5" stop-opacity=".75"/><stop offset="1" stop-color="#ff6fb5" stop-opacity="0"/></radialGradient>
<radialGradient id="t" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3ad2c9" stop-opacity=".7"/><stop offset="1" stop-color="#3ad2c9" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#s)"/>
<circle cx="400" cy="170" r="130" fill="url(#n)"/><circle cx="110" cy="400" r="140" fill="url(#t)"/>
<g fill="#fff"><circle cx="40" cy="30" r="3"/><circle cx="210" cy="40" r="2.5"/><circle cx="300" cy="22" r="3"/><circle cx="480" cy="250" r="3"/><circle cx="250" cy="480" r="3"/><circle cx="30" cy="250" r="2.5"/><circle cx="170" cy="300" r="2"/><circle cx="350" cy="330" r="2.5"/><circle cx="460" cy="490" r="2"/><circle cx="130" cy="210" r="2"/></g>
<g fill="#ffd23f"><path d="M250 120l6 14 14 6-14 6-6 14-6-14-14-6 14-6z"/><path d="M60 160l5 11 11 5-11 5-5 11-5-11-11-5 11-5z"/><path d="M470 370l5 11 11 5-11 5-5 11-5-11-11-5 11-5z"/><path d="M330 440l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/><path d="M180 470l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/></g>
<g transform="rotate(-20 110 110)"><circle cx="110" cy="110" r="56" fill="#ff9f1c"/><path d="M58 92h104M55 112h110M60 132h100" stroke="#e85d04" stroke-width="10"/><ellipse cx="110" cy="110" rx="92" ry="22" fill="none" stroke="#ffe066" stroke-width="9"/><path d="M54 110a56 56 0 0 1 112 0" fill="#ff9f1c" opacity="0"/></g>
<circle cx="440" cy="70" r="30" fill="#4cc9f0"/><path d="M414 60q26 14 54 0" stroke="#2a9dc8" stroke-width="6" fill="none"/>
<g transform="translate(360 245)"><ellipse rx="44" ry="13" fill="#7ae582"/><path d="M-20-4a20 18 0 0 1 40 0z" fill="#c7f9cc"/><circle cx="-24" cy="3" r="3" fill="#ffd23f"/><circle cx="0" cy="5" r="3" fill="#ffd23f"/><circle cx="24" cy="3" r="3" fill="#ffd23f"/></g>
<circle cx="420" cy="420" r="68" fill="#d9d9e8"/><circle cx="398" cy="400" r="14" fill="#b8b8cc"/><circle cx="445" cy="438" r="18" fill="#b8b8cc"/><circle cx="430" cy="380" r="8" fill="#b8b8cc"/><circle cx="392" cy="452" r="9" fill="#b8b8cc"/>
<path d="M30 470q60-40 120-50" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/><circle cx="155" cy="418" r="10" fill="#fff"/>
<g transform="rotate(35 256 256)">
<path d="M236 330q-10 50 20 90 30-40 20-90z" fill="#ffb703"/><path d="M244 330q-4 34 12 60 16-26 12-60z" fill="#ff4d4d"/>
<path d="M216 300l-40 40 4-60 36-20z" fill="#e63946"/><path d="M296 300l40 40-4-60-36-20z" fill="#e63946"/>
<path d="M256 120c-40 40-46 120-40 210h80c6-90 0-170-40-210z" fill="#f1f1f6"/><path d="M256 120c-20 18-30 40-34 62h68c-4-22-14-44-34-62z" fill="#e63946"/>
<circle cx="256" cy="232" r="24" fill="#1d3557"/><circle cx="256" cy="232" r="16" fill="#4cc9f0"/><circle cx="250" cy="226" r="5" fill="#fff"/>
<rect x="222" y="292" width="68" height="12" fill="#457b9d"/><path d="M250 304v26h12v-26z" fill="#e63946"/></g>
</svg>`;

const CAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="w" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#ffe8a3"/><stop offset="1" stop-color="#ffc8a8"/></linearGradient>
<pattern id="d" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="3" fill="#f4a261" opacity=".55"/><circle cx="24" cy="24" r="3" fill="#e76f51" opacity=".45"/></pattern></defs>
<rect width="512" height="340" fill="url(#w)"/><rect width="512" height="340" fill="url(#d)"/>
<rect y="330" width="512" height="182" fill="#8d5a3b"/><path d="M0 368h512M0 410h512M0 452h512M0 494h512" stroke="#6f4429" stroke-width="4"/>
<g transform="translate(36 34)"><rect width="150" height="130" rx="6" fill="#7b4b2a"/><rect x="10" y="10" width="130" height="110" fill="#8fd3ff"/><circle cx="104" cy="44" r="20" fill="#ffd23f"/><path d="M20 90q16-22 36-6 14-14 30 0 14-4 20 10v26H20z" fill="#fff"/><path d="M75 10v110M10 65h130" stroke="#7b4b2a" stroke-width="8"/></g>
<g transform="translate(350 50)"><rect width="120" height="92" rx="4" fill="#2a9d8f"/><rect x="9" y="9" width="102" height="74" fill="#caf0f8"/><path d="M30 46q30-26 56 0-26 26-56 0z" fill="#ff7f11"/><path d="M86 46l16-14v28z" fill="#ff7f11"/><circle cx="44" cy="42" r="4" fill="#222"/></g>
<g transform="translate(410 226)"><path d="M-30 44h68l-10 60H-20z" fill="#e76f51"/><path d="M4 44q-30-30-20-70M4 44q24-36 34-60M4 44q0-40-6-80" stroke="#2d6a4f" stroke-width="10" fill="none" stroke-linecap="round"/></g>
<g transform="translate(40 250)"><path d="M0 60q10-60 30-80 6 30 10 80z" fill="#52b788"/><path d="M30 60q14-50 44-64-4 34-20 64z" fill="#40916c"/><path d="M-6 56h80l-10 50H4z" fill="#3a86ff"/><path d="M0 74h70" stroke="#fff" stroke-width="5"/></g>
<rect x="0" y="420" width="512" height="92" fill="#e63946"/><path d="M0 438h512M0 494h512" stroke="#ffd166" stroke-width="8"/><path d="M0 466h512" stroke="#fff" stroke-width="6" stroke-dasharray="18 14"/>
<path d="M330 430q90 10 70-60-6-26 18-30" stroke="#f08c2e" stroke-width="22" fill="none" stroke-linecap="round"/>
<path d="M176 440c-30-110 0-200 80-200s110 90 80 200z" fill="#f08c2e"/>
<path d="M200 300q20 10 30 0M200 340q24 10 36 0M282 300q-20 10-30 0M286 340q-24 10-36 0" stroke="#c4600f" stroke-width="9" fill="none" stroke-linecap="round"/>
<ellipse cx="256" cy="372" rx="42" ry="56" fill="#ffe1c2"/>
<ellipse cx="214" cy="436" rx="26" ry="14" fill="#ffe1c2"/><ellipse cx="298" cy="436" rx="26" ry="14" fill="#ffe1c2"/>
<path d="M180 150l10-80 50 50zM332 150l-10-80-50 50z" fill="#f08c2e"/><path d="M194 132l4-42 28 28zM318 132l-4-42-28 28z" fill="#ffadad"/>
<circle cx="256" cy="180" r="84" fill="#f08c2e"/><path d="M232 104q24 14 48 0M226 122q30 10 60 0" stroke="#c4600f" stroke-width="8" fill="none" stroke-linecap="round"/>
<ellipse cx="224" cy="176" rx="17" ry="20" fill="#fff"/><ellipse cx="288" cy="176" rx="17" ry="20" fill="#fff"/><ellipse cx="226" cy="178" rx="10" ry="15" fill="#2a9d3f"/><ellipse cx="286" cy="178" rx="10" ry="15" fill="#2a9d3f"/><circle cx="226" cy="178" r="5" fill="#111"/><circle cx="286" cy="178" r="5" fill="#111"/><circle cx="229" cy="172" r="3" fill="#fff"/><circle cx="289" cy="172" r="3" fill="#fff"/>
<path d="M246 206h20l-10 12z" fill="#ff6b8b"/><path d="M256 218q-10 14-22 8M256 218q10 14 22 8" stroke="#6b2e0f" stroke-width="4" fill="none"/>
<path d="M150 200l60 4M150 222l60-6M362 200l-60 4M362 222l-60-6" stroke="#fff" stroke-width="3"/>
<g transform="translate(410 440)"><circle r="40" fill="#3a86ff"/><path d="M-38-10q38 20 76 0M-36 14q36-26 72 0M-14-36q24 36 2 74" stroke="#bde0fe" stroke-width="5" fill="none"/><path d="M-40 10q-40 20-80 0" stroke="#bde0fe" stroke-width="4" fill="none"/></g>
<g transform="translate(70 450)"><path d="M-36 0h72l-10 34h-52z" fill="#9b5de5"/><ellipse rx="36" ry="10" fill="#c77dff"/><path d="M-14-6q14-14 30 0" stroke="#ff7f11" stroke-width="8" fill="none"/></g>
</svg>`;

const BALLOON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb3ff"/><stop offset=".7" stop-color="#bfe6ff"/><stop offset="1" stop-color="#fff3b0"/></linearGradient>
<clipPath id="b"><path d="M256 40c-74 0-118 54-118 116 0 70 76 120 96 160h44c20-40 96-90 96-160 0-62-44-116-118-116z"/></clipPath></defs>
<rect width="512" height="512" fill="url(#k)"/>
<g fill="#ffd23f"><circle cx="440" cy="70" r="38"/><path d="M440 10v-12M440 142v12M380 70h-12M500 70h12M398 28l-9-9M482 112l9 9M398 112l-9 9M482 28l9-9" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/></g>
<g fill="#fff"><path d="M20 120a26 26 0 0 1 46-14 22 22 0 0 1 40 10 18 18 0 0 1 0 36H30a18 18 0 0 1-10-32z"/><path d="M380 200a20 20 0 0 1 36-10 18 18 0 0 1 32 8 14 14 0 0 1 0 28h-60a14 14 0 0 1-8-26z"/><path d="M60 240a16 16 0 0 1 28-8 14 14 0 0 1 26 6 11 11 0 0 1 0 22H66a11 11 0 0 1-6-20z"/></g>
<path d="M330 120q8-8 16 0 8-8 16 0M370 150q6-6 12 0 6-6 12 0M100 50q7-7 14 0 7-7 14 0" stroke="#2b2d42" stroke-width="4" fill="none" stroke-linecap="round"/>
<g transform="translate(90 190) scale(.32)"><path d="M0 0c-60 0-96 44-96 94 0 56 62 96 78 128h36c16-32 78-72 78-128C96 44 60 0 0 0z" fill="#9b5de5"/><path d="M0 0c-24 0-38 44-38 94 0 56 24 96 30 128h16c6-32 30-72 30-128C38 44 24 0 0 0z" fill="#f15bb5"/><rect x="-20" y="240" width="40" height="30" fill="#8d5a3b"/></g>
<g clip-path="url(#b)"><rect x="130" y="30" width="260" height="300" fill="#e63946"/><rect x="170" y="30" width="34" height="300" fill="#ffd23f"/><rect x="238" y="30" width="36" height="300" fill="#3a86ff"/><rect x="308" y="30" width="34" height="300" fill="#2ec27e"/><path d="M130 130h260" stroke="#fff" stroke-width="14"/><path d="M130 200h260" stroke="#ff9f1c" stroke-width="10"/></g>
<path d="M236 316l-6 40M276 316l6 40" stroke="#6b4226" stroke-width="4"/><rect x="222" y="354" width="68" height="44" rx="6" fill="#a0612f"/><path d="M222 370h68M240 354v44M272 354v44" stroke="#7a4520" stroke-width="4"/>
<path d="M0 380q120-70 260-20t252-10v162H0z" fill="#8fd16a"/>
<path d="M0 430q140-60 300-10 120 30 212-20v112H0z" fill="#4caf50"/>
<path d="M60 512q30-60 120-80M200 512q10-50 80-84M330 512q-10-50 60-90" stroke="#ffd23f" stroke-width="12" fill="none" opacity=".8"/>
<path d="M380 512q-40-60 40-100 50-26 92-20" stroke="#4fb3ff" stroke-width="22" fill="none"/>
<g transform="translate(70 400)"><rect width="46" height="34" fill="#fff"/><path d="M-6 2l29-26 29 26z" fill="#e63946"/><rect x="18" y="14" width="12" height="20" fill="#8d5a3b"/></g>
<g transform="translate(150 430)"><rect width="36" height="26" fill="#ffe066"/><path d="M-5 2l23-20 23 20z" fill="#3a86ff"/></g>
<g transform="translate(450 410)"><rect x="-4" y="10" width="8" height="26" fill="#6b4226"/><circle cy="0" r="22" fill="#2d6a4f"/></g><g transform="translate(300 460)"><rect x="-3" y="8" width="6" height="20" fill="#6b4226"/><circle r="17" fill="#1b4332"/></g>
<g fill="#ff4d6d"><circle cx="40" cy="480" r="5"/><circle cx="240" cy="496" r="5"/><circle cx="110" cy="500" r="5"/></g>
</svg>`;

const FISH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="o" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#5ee0f5"/><stop offset=".6" stop-color="#1b8fd6"/><stop offset="1" stop-color="#0b4f9c"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#o)"/>
<path d="M60 0l60 0-120 300V160zM200 0h40L80 400H40z" fill="#fff" opacity=".12"/>
<path d="M0 450q60-30 130-6t140-4 130 0 112-10v82H0z" fill="#f6d58e"/><path d="M0 480q90-20 200 0t312-8" stroke="#e9b44c" stroke-width="5" fill="none"/>
<g fill="#2d9a4e"><path d="M30 470q-20-60 10-110t0-120q30 50 6 110t4 120z"/><path d="M70 470q-10-50 14-90t-4-90q26 40 10 86t-4 94z" fill="#3fbf6a"/></g>
<g stroke="#ff5d8f" stroke-width="12" stroke-linecap="round" fill="none"><path d="M420 470v-70M420 420l-30-30M420 410l34-36M390 390v-26M454 374v-24"/></g><g stroke="#ff9e00" stroke-width="10" stroke-linecap="round" fill="none"><path d="M480 474v-46M480 440l18-20"/></g>
<path d="M120 470l9 18 20 3-14 14 3 20-18-9-18 9 3-20-14-14 20-3z" fill="#ff7b00" transform="translate(-30 -20)"/>
<g transform="translate(300 474)"><path d="M-20 0a20 20 0 0 1 40 0z" fill="#ffadad"/><path d="M-12 0l12-18 12 18M0 0v-18" stroke="#e5989b" stroke-width="3" fill="none"/></g>
<g transform="translate(220 470)"><ellipse rx="22" ry="13" fill="#e63946"/><circle cx="-8" cy="-16" r="4" fill="#111"/><circle cx="8" cy="-16" r="4" fill="#111"/><path d="M-22-4l-14-10M22-4l14-10M-18 6l-14 8M18 6l14 8" stroke="#e63946" stroke-width="4"/></g>
<g transform="translate(70 300)"><path d="M-26 0q26-22 52 0-26 22-52 0z" fill="#ff8fab"/><path d="M26 0l16-12v24z" fill="#ff8fab"/><circle cx="-12" cy="-3" r="3" fill="#111"/></g>
<g fill="#ffd23f"><path d="M50 70q20-16 40 0-20 16-40 0zM90 70l12-10v20z"/><path d="M110 110q20-16 40 0-20 16-40 0zM150 110l12-10v20z"/><path d="M40 140q20-16 40 0-20 16-40 0zM80 140l12-10v20z"/></g>
<g transform="translate(420 90)"><path d="M-46 0a46 40 0 0 1 92 0z" fill="#c77dff"/><path d="M-46 0h92" stroke="#9b5de5" stroke-width="6"/><path d="M-34 4q-8 30 4 60M-12 4q8 34-4 70M12 4q-8 34 4 66M34 4q8 30-4 56" stroke="#e0aaff" stroke-width="5" fill="none"/><circle cx="-14" cy="-14" r="4" fill="#fff"/><circle cx="14" cy="-14" r="4" fill="#fff"/></g>
<g fill="none" stroke="#e8fbff" stroke-width="4"><circle cx="350" cy="200" r="10"/><circle cx="370" cy="160" r="7"/><circle cx="356" cy="120" r="12"/><circle cx="380" cy="80" r="6"/><circle cx="270" cy="60" r="8"/><circle cx="160" cy="330" r="9"/><circle cx="480" cy="300" r="10"/></g>
<g transform="translate(250 280)"><path d="M90 0l60-50v100z" fill="#ff7f11"/><ellipse rx="110" ry="74" fill="#ff7f11"/><path d="M-50-70q-6 70 0 140M10-74q-8 74 0 148M66-56q-6 56 0 112" stroke="#fff" stroke-width="18"/><path d="M-50-70q-6 70 0 140M10-74q-8 74 0 148M66-56q-6 56 0 112" stroke="#222" stroke-width="3" fill="none"/>
<path d="M-20-70q30-40 70-6z" fill="#ff9e3d"/><path d="M0 60q20 40 50 10z" fill="#ff9e3d"/><circle cx="-74" cy="-16" r="16" fill="#fff"/><circle cx="-76" cy="-16" r="9" fill="#111"/><circle cx="-79" cy="-20" r="3" fill="#fff"/><path d="M-104 20q12 8 24 0" stroke="#7a2e00" stroke-width="4" fill="none"/></g>
</svg>`;

const CASTLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb4a2"/><stop offset=".55" stop-color="#ffd6a5"/><stop offset="1" stop-color="#bde0fe"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#y)"/>
<g fill="none" stroke-width="12"><path d="M-20 260a170 170 0 0 1 340-60" stroke="#e63946"/><path d="M-8 268a158 158 0 0 1 316-58" stroke="#ff9f1c"/><path d="M4 276a146 146 0 0 1 292-56" stroke="#ffd23f"/><path d="M16 284a134 134 0 0 1 268-54" stroke="#2ec27e"/><path d="M28 292a122 122 0 0 1 244-52" stroke="#3a86ff"/></g>
<g fill="#fff"><path d="M350 70a24 24 0 0 1 44-12 20 20 0 0 1 36 10 16 16 0 0 1 0 32h-74a16 16 0 0 1-6-30z"/><path d="M60 40a18 18 0 0 1 32-8 15 15 0 0 1 28 6 12 12 0 0 1 0 24H64a12 12 0 0 1-4-22z"/></g>
<g transform="translate(450 170) rotate(-15)"><path d="M0-30l24 30-24 30-24-30z" fill="#9b5de5"/><path d="M0-30v60M-24 0h48" stroke="#fff" stroke-width="3"/><path d="M0 30q-10 20 6 34t-4 34" stroke="#2b2d42" stroke-width="2" fill="none"/><path d="M-4 52l8 4-8 4zM-2 78l8 4-8 4z" fill="#ff4d6d"/></g>
<rect y="380" width="512" height="132" fill="#57cc99"/><path d="M0 430q256-30 512 0v30q-256-30-512 0z" fill="#3a86ff"/><path d="M40 438q20-6 40 0M200 428q20-6 40 0M380 432q20-6 40 0" stroke="#bde0fe" stroke-width="4" fill="none"/>
<rect x="150" y="230" width="212" height="170" fill="#c9c3d9"/><path d="M150 230v-24h22v24h20v-24h22v24h20v-24h22v24h20v-24h22v24h20v-24h22v24h20v-24h22v24" fill="#c9c3d9"/>
<path d="M150 270h212M150 310h212M150 350h212M190 230v40M260 270v40M320 230v40M210 310v40M300 310v40" stroke="#a79fbf" stroke-width="3"/>
<path d="M226 400v-80a30 30 0 0 1 60 0v80z" fill="#6b4226"/><path d="M236 330v70M256 320v80M276 330v70" stroke="#4a2c17" stroke-width="3"/><path d="M226 400l-20 40h100l-20-40z" fill="#a0612f"/>
<rect x="100" y="180" width="70" height="220" fill="#b8b0cf"/><path d="M92 184l43-90 43 90z" fill="#9b5de5"/><path d="M135 94V54" stroke="#4a4a4a" stroke-width="4"/><path d="M135 54l34 12-34 12z" fill="#e63946"/>
<rect x="342" y="180" width="70" height="220" fill="#b8b0cf"/><path d="M334 184l43-90 43 90z" fill="#2ec4b6"/><path d="M377 94V54" stroke="#4a4a4a" stroke-width="4"/><path d="M377 54l34 12-34 12z" fill="#ffd23f"/>
<rect x="226" y="130" width="60" height="100" fill="#d8d2e6"/><path d="M218 134l38-70 38 70z" fill="#ff5d8f"/><path d="M256 64V30" stroke="#4a4a4a" stroke-width="4"/><path d="M256 30l28 10-28 10z" fill="#3a86ff"/>
<g fill="#ffd23f" stroke="#4a2c17" stroke-width="3"><rect x="122" y="220" width="26" height="36" rx="13"/><rect x="364" y="220" width="26" height="36" rx="13"/><rect x="243" y="160" width="26" height="36" rx="13"/><rect x="122" y="300" width="26" height="36" rx="13"/><rect x="364" y="300" width="26" height="36" rx="13"/></g>
<g transform="translate(470 400)"><rect x="-5" y="0" width="10" height="40" fill="#6b4226"/><circle cy="-10" r="28" fill="#2d6a4f"/><circle cx="-10" cy="-16" r="5" fill="#e63946"/><circle cx="10" cy="-4" r="5" fill="#e63946"/></g>
<g transform="translate(40 410)"><rect x="-4" y="0" width="8" height="30" fill="#6b4226"/><circle cy="-8" r="22" fill="#40916c"/></g>
<g><circle cx="40" cy="480" r="7" fill="#ff4d6d"/><circle cx="80" cy="494" r="7" fill="#ffd23f"/><circle cx="120" cy="478" r="7" fill="#9b5de5"/><circle cx="400" cy="486" r="7" fill="#ff9f1c"/><circle cx="450" cy="500" r="7" fill="#ff4d6d"/><circle cx="350" cy="498" r="7" fill="#fff"/></g>
<path d="M226 440q30 30 0 72h60q-30-42 0-72z" fill="#e9c46a"/>
</svg>`;

const BY_ID: Record<PictureId, Omit<Picture, 'id'>> = {
  rocket: {
    title: 'Rocket',
    alt: 'A red and white rocket flying through space past a ringed planet, a moon and stars',
    svg: ROCKET,
  },
  cat: {
    title: 'Cat',
    alt: 'A ginger cat sitting on a rug by a window, with a plant, a ball of wool and a bowl',
    svg: CAT,
  },
  balloon: {
    title: 'Balloon',
    alt: 'A striped hot-air balloon over green hills with houses, trees, a river and the sun',
    svg: BALLOON,
  },
  fish: {
    title: 'Fish',
    alt: 'An orange striped fish in the sea with a jellyfish, seaweed, coral, a crab and a starfish',
    svg: FISH,
  },
  castle: {
    title: 'Castle',
    alt: 'A castle with pointed towers and flags, a moat, a rainbow and a kite in the sky',
    svg: CASTLE,
  },
};

/** The picture with this id. */
export function pictureOf(id: PictureId): Picture {
  return { id, ...BY_ID[id] };
}

/** An SVG as a URL for an <img> or a CSS background. */
export function svgUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
