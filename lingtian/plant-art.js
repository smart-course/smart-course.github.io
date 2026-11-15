/* Original botanical illustrations for 云间灵田. No external image assets. */
(function () {
  'use strict';
  let sequence = 0;

  window.spiritPlantArt = function spiritPlantArt(cropId, size, variant) {
    const n = Number(size);
    const width = Number.isFinite(n) && n > 0 ? Math.min(600, Math.max(20, n)) : 120;
    const p = 'spirit-art-' + (++sequence) + '-';
    const mature = variant === 'mature';
    const url = key => 'url(#' + p + key + ')';
    const defs = `<defs>
      <linearGradient id="${p}leaf" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#d9e6a0"/><stop offset=".48" stop-color="#9bb475"/><stop offset="1" stop-color="#658a53"/></linearGradient>
      <linearGradient id="${p}gold" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="#ffe7a0"/><stop offset=".44" stop-color="#e5b353"/><stop offset="1" stop-color="#b88335"/></linearGradient>
      <linearGradient id="${p}stem" x1="0" x2="1"><stop stop-color="#b98e46"/><stop offset=".46" stop-color="#fff0ba"/><stop offset="1" stop-color="#d5a24f"/></linearGradient>
      <linearGradient id="${p}purple" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#ffe0eb"/><stop offset=".4" stop-color="#dca3cb"/><stop offset="1" stop-color="#a76b9f"/></linearGradient>
      <linearGradient id="${p}jade" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eff6cc"/><stop offset=".44" stop-color="#c3dfb4"/><stop offset="1" stop-color="#88b696"/></linearGradient>
      <linearGradient id="${p}fruit" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe8ab"/><stop offset=".43" stop-color="#eda75f"/><stop offset="1" stop-color="#d67556"/></linearGradient>
      <radialGradient id="${p}glow"><stop stop-color="#f5d174" stop-opacity="${mature ? '.6' : '.38'}"/><stop offset="1" stop-color="#fff0b4" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}coolglow"><stop stop-color="#e0e7a7" stop-opacity="${mature ? '.52' : '.35'}"/><stop offset="1" stop-color="#faf0cc" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}amber" cx=".35" cy=".16" r=".9"><stop stop-color="#fff1a9"/><stop offset=".3" stop-color="#f5cd68"/><stop offset=".64" stop-color="#d79b36"/><stop offset="1" stop-color="#a8652c"/></radialGradient>
      <radialGradient id="${p}peach" cx=".28" cy=".24" r=".87"><stop stop-color="#fff7c0"/><stop offset=".3" stop-color="#ffcf77"/><stop offset=".63" stop-color="#ee9b5e"/><stop offset="1" stop-color="#c96a5f"/></radialGradient>
      <radialGradient id="${p}pearl" cx=".28" cy=".2" r=".85"><stop stop-color="#fffef5"/><stop offset=".25" stop-color="#fff4d3"/><stop offset=".57" stop-color="#dce9c5"/><stop offset="1" stop-color="#a2c3a3"/></radialGradient>
      <radialGradient id="${p}ruby" cx=".27" cy=".2" r=".9"><stop stop-color="#ffddae"/><stop offset=".28" stop-color="#f38a70"/><stop offset=".66" stop-color="#cb5656"/><stop offset="1" stop-color="#a43e53"/></radialGradient>
      <linearGradient id="${p}crystal" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="#fff7cd"/><stop offset=".33" stop-color="#dfedb7"/><stop offset=".63" stop-color="#a6ce9d"/><stop offset="1" stop-color="#cee3b6"/></linearGradient>
    </defs>`;
    const leaf = (x, y, scale, rotation, pale) => `<g transform="translate(${x} ${y}) rotate(${rotation || 0}) scale(${scale || 1})"><path d="M0 0C-4-12 0-22 8-28C13-14 9-5 0 0Z" fill="${url(pale ? 'jade' : 'leaf')}"/><path d="M0 0Q5-12 8-25" fill="none" stroke="#e4e9ce" stroke-width=".7" opacity=".64"/></g>`;
    const star = (x, y, r, color) => `<path d="M${x} ${y-r}Q${x+1} ${y-1} ${x+r} ${y}Q${x+1} ${y+1} ${x} ${y+r}Q${x-1} ${y+1} ${x-r} ${y}Q${x-1} ${y-1} ${x} ${y-r}Z" fill="${color || '#d1b874'}" opacity=".8"/>`;
    const ground = `<ellipse cx="60" cy="88" rx="28" ry="5" fill="#586e54" opacity=".09"/><ellipse cx="60" cy="86.4" rx="18" ry="2.6" fill="#6f8766" opacity=".08"/>`;
    const blossom = (x, y, s, rotation) => `<g transform="translate(${x} ${y}) rotate(${rotation || 0}) scale(${s})">${[0,72,144,216,288].map(a => `<path transform="rotate(${a})" d="M0 1C-9-3-10-13-3-16C3-20 8-12 6-6C5-2 2 0 0 1Z" fill="${url('purple')}" stroke="#846d98" stroke-opacity=".28" stroke-width=".6"/>`).join('')}<circle r="4.3" fill="#ffdf82"/><circle r="1.8" fill="#d1a046"/><path d="M-2-2L-3-5M2-2L4-4M0 2L0 5" stroke="#fff3c6" stroke-width=".8" stroke-linecap="round"/></g>`;
    let art;

    switch (cropId) {
      case 'zihou':
        art = `<ellipse cx="60" cy="46" rx="39" ry="35" fill="${url('coolglow')}"/>
          <path d="M59 86Q64 56 58 32M61 68Q46 61 40 49M61 62Q72 49 81 45" fill="none" stroke="#668464" stroke-width="2.5" stroke-linecap="round"/>
          ${leaf(59,79,.95,-65)}${leaf(61,73,.8,48)}${leaf(57,59,.65,-78)}${leaf(72,55,.52,46)}
          ${blossom(60,31,.95,8)}${blossom(37,49,.7,-17)}${blossom(83,46,.68,15)}
          <path d="M58 21Q58 17 62 13" stroke="#b7a5c7" fill="none" stroke-width="1"/>
          ${star(28,29,3,'#b4a2bf')}${star(87,22,2.8,'#c9bbd2')}
          <circle cx="26" cy="65" r="1.4" fill="#b2a0bd" opacity=".55"/>`;
        break;
      case 'tianling':
        art = `<ellipse cx="62" cy="46" rx="43" ry="36" fill="${url('glow')}"/>
          <path d="M57 87Q64 65 60 43Q56 34 58 24M60 61Q43 48 34 34M61 51Q77 41 84 27" fill="none" stroke="#8b8060" stroke-width="3.8" stroke-linecap="round"/>
          <path d="M59 85Q63 65 61 49" fill="none" stroke="#bdaf88" stroke-width="1.1"/>
          ${leaf(41,43,.8,-53)}${leaf(41,41,.7,12)}${leaf(59,34,.82,-25)}${leaf(62,48,.7,64)}${leaf(77,40,.85,26)}${leaf(83,31,.54,50)}${leaf(57,72,.64,-74)}
          <path d="M37 42Q32 47 34 51M71 47Q77 52 76 56M60 31Q53 36 53 41" stroke="#748963" stroke-width="1.7" fill="none"/>
          <g fill="${url('fruit')}" stroke="#b28355" stroke-width=".5"><path d="M34 50C23 46 21 65 32 69C42 69 45 52 34 50Z"/><path d="M76 55C65 52 63 71 75 76C87 74 87 57 76 55Z"/><path d="M53 40C45 36 41 51 51 55C61 55 62 41 53 40Z"/></g>
          <path d="M28 55Q25 59 28 62M70 60Q67 65 71 68M48 43Q46 46 48 49" fill="none" stroke="#f8e5bc" stroke-width="2" stroke-linecap="round" opacity=".8"/>
          <path d="M28 50L34 52L38 49M69 55L76 57L81 54M48 40L53 42L58 39" stroke="#7f946a" stroke-width="2" fill="none" stroke-linecap="round"/>
          ${star(91,48,3.3)}${star(29,19,2.5)}`;
        break;
      case 'yueyang':
        art = `<ellipse cx="60" cy="47" rx="42" ry="39" fill="${url('coolglow')}"/>
          <path d="M51 86Q68 75 60 56Q55 43 65 29M61 65Q45 56 38 42M60 53Q77 51 83 39M62 42Q49 35 50 23" fill="none" stroke="#7e9e8d" stroke-width="5.2" stroke-linecap="round"/>
          <path d="M54 84Q66 72 60 58Q57 43 66 30" fill="none" stroke="#d6e6cd" stroke-width="1.3"/>
          ${leaf(40,47,.85,-46,true)}${leaf(41,43,.71,13,true)}${leaf(52,31,.8,-44,true)}${leaf(58,31,.75,29,true)}${leaf(68,35,.88,35,true)}${leaf(77,48,.78,57,true)}${leaf(83,42,.72,10,true)}${leaf(64,67,.65,68,true)}
          <path d="M31 59C13 74 50 82 79 70C101 61 88 52 81 55" fill="none" stroke="#a8ccc1" stroke-width="1.2" opacity=".7"/>
          <path d="M26 66Q42 77 68 70" fill="none" stroke="#e0eee1" stroke-width="1.1"/>
          ${star(25,46,3.5,'#95b8ab')}${star(85,25,3,'#a6c7b4')}${star(91,65,2.8,'#a4c4b8')}
          <circle cx="67" cy="19" r="2.2" fill="#e3eecb"/><circle cx="35" cy="24" r="1.5" fill="#bad9c8"/>`;
        break;
      case 'ningcui':
        art = `<ellipse cx="60" cy="54" rx="39" ry="34" fill="${url('coolglow')}"/>
          <path d="M59 86Q34 61 35 35Q50 41 59 86Z" fill="${url('leaf')}"/>
          <path d="M60 85Q45 48 57 18Q68 46 60 85Z" fill="${url('jade')}"/>
          <path d="M60 86Q69 51 88 37Q86 65 60 86Z" fill="${url('leaf')}"/>
          <path d="M59 86Q28 75 24 55Q47 59 59 86Z" fill="${url('jade')}"/>
          <path d="M60 86Q78 64 96 64Q86 81 60 86Z" fill="${url('jade')}"/>
          <path d="M60 84Q63 57 74 29Q82 53 60 84Z" fill="${url('leaf')}"/>
          <path d="M59 84Q53 54 57 23M58 81Q44 56 36 40M63 82Q80 60 86 42M56 81L29 59M65 81L91 67M62 81L74 35" fill="none" stroke="#d7e8c7" stroke-width=".85" opacity=".8"/>
          <g fill="#e3f1e6" stroke="#9cc5b7" stroke-width=".6"><path d="M58 36L63 44L58 49L53 44Z"/><path d="M81 53L85 59L81 63L77 59Z"/><path d="M38 63L41 67L38 70L35 67Z"/></g>
          ${star(28,30,3,'#9ebb9c')}${star(87,24,3.2,'#a0bea1')}
          <circle cx="68" cy="13" r="1.7" fill="#b0c69d" opacity=".75"/>`;
        break;
      case 'jiuqu':
        art = `<ellipse cx="59" cy="51" rx="42" ry="38" fill="${url('glow')}"/>
          <path d="M55 48C44 53 44 67 48 73C53 79 44 85 36 87C49 90 57 80 57 73C59 67 65 71 65 77C65 84 76 86 83 82C72 82 71 75 73 69C74 62 65 53 63 48Z" fill="${url('gold')}" stroke="#b58f50" stroke-width=".65"/>
          <path d="M49 60Q38 65 32 62Q25 61 25 67M71 62Q83 58 87 64Q90 70 96 65M47 76Q36 73 35 80M71 77Q78 72 84 75" fill="none" stroke="#be9d64" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M53 55Q59 58 65 55M50 61Q55 64 61 62M52 68Q57 70 61 68M64 71L68 73" fill="none" stroke="#af8b51" stroke-width=".85" opacity=".6"/>
          <path d="M59 50Q57 36 59 26M59 36L46 27M59 35L73 24" fill="none" stroke="#7d9866" stroke-width="2"/>
          ${leaf(59,36,.8,-23)}${leaf(58,38,.7,-83)}${leaf(60,37,.72,53)}${leaf(47,30,.56,-57)}${leaf(72,29,.56,32)}
          <g fill="#bc7860" stroke="#a56850" stroke-width=".4"><circle cx="56" cy="31" r="3.2"/><circle cx="62" cy="28" r="3.5"/><circle cx="66" cy="33" r="3"/><circle cx="60" cy="35" r="3.1"/></g>
          <g fill="#f1cab1" opacity=".9"><circle cx="55" cy="30" r=".9"/><circle cx="61" cy="27" r="1"/><circle cx="65" cy="32" r=".8"/></g>
          ${star(28,39,4)}${star(88,42,3)}${star(78,14,2.8)}
          <path d="M19 76Q16 70 20 65" stroke="#d2bb7e" fill="none" stroke-width=".8" opacity=".6"/>`;
        break;
      case 'huangjing':
      default:
        art = `<ellipse cx="60" cy="49" rx="41" ry="36" fill="${url('glow')}"/>
          <path d="M58 84Q62 61 56 42L67 40Q64 64 69 84Z" fill="${url('stem')}" stroke="#b69563" stroke-width=".6"/>
          <path d="M35 84Q39 71 34 62L42 60Q40 74 43 85Z" fill="${url('stem')}"/>
          <path d="M79 85Q80 72 77 66L85 65Q83 78 87 85Z" fill="${url('stem')}"/>
          <path d="M30 41C30 30 43 23 57 26C66 18 88 25 91 35C94 45 80 51 65 48C50 54 28 52 30 41Z" fill="${url('gold')}" stroke="#b5975a" stroke-width=".8"/>
          <path d="M34 41C42 47 53 48 64 43C76 47 84 42 88 38" stroke="#f6e6b6" stroke-width="1.6" fill="none" opacity=".85"/>
          <path d="M38 37C45 31 55 32 60 34C70 28 79 31 83 36M43 38Q53 35 61 38Q72 33 79 37" stroke="#9d7d43" stroke-width=".85" fill="none" opacity=".35"/>
          <path d="M20 61C20 54 29 50 37 53C45 47 54 53 54 59C56 67 43 70 35 66C26 70 18 67 20 61Z" fill="${url('gold')}" stroke="#b5975a" stroke-width=".6"/>
          <path d="M23 61Q31 65 37 61Q45 65 51 60" fill="none" stroke="#f3e4b5" stroke-width="1.1"/>
          <path d="M67 64C68 57 76 55 82 58C90 54 99 62 95 67C92 71 83 73 78 69C70 72 64 68 67 64Z" fill="${url('gold')}" stroke="#b5975a" stroke-width=".6"/>
          <path d="M69 65Q77 69 82 64Q89 68 93 65" stroke="#efdfaa" stroke-width="1" fill="none"/>
          ${leaf(47,87,.45,-61)}${leaf(72,87,.39,52)}
          ${star(23,33,3.2)}${star(97,47,3.3)}${star(74,17,2.3)}
          <circle cx="33" cy="21" r="1.4" fill="#d6c28c" opacity=".6"/>`;
    }
    // The ripe variation changes the plant itself: fuller caps, double flowers,
    // heavy fruit and translucent gems. It is deliberately separate from glow.
    if (mature) {
      const ripeFlower = (x, y, s, rotation) => `<g transform="translate(${x} ${y}) rotate(${rotation || 0}) scale(${s})">
        ${[0,60,120,180,240,300].map(a => `<path transform="rotate(${a})" d="M0 2C-10-1-14-11-10-17C-8-21-3-21 0-18C5-23 11-18 10-12C10-5 5-1 0 2Z" fill="${url('purple')}" stroke="#ba7da8" stroke-width=".5"/><path transform="rotate(${a})" d="M-7-14Q-3-18 0-14Q4-18 7-14" fill="none" stroke="#fff0f5" stroke-width="1.2" opacity=".77"/>`).join('')}
        ${[30,90,150,210,270,330].map(a => `<path transform="rotate(${a})" d="M0 2C-7-1-8-9-4-12C0-15 6-11 5-6C4-2 1 0 0 2Z" fill="#efbce0" stroke="#ffe7ed" stroke-width=".45"/>`).join('')}
        <circle cy=".7" r="5.8" fill="#ba8b48" opacity=".22"/><circle r="5.2" fill="${url('amber')}"/>
        ${[[0,-3.4],[-3,-1.2],[3,-1.3],[-1.8,2.1],[2,2]].map(([a,b])=>`<circle cx="${a}" cy="${b}" r="1.05" fill="#fff1b4"/>`).join('')}
      </g>`;
      const ripeFruit = (x,y,s,rot) => `<g transform="translate(${x} ${y}) rotate(${rot || 0}) scale(${s})">
        <path d="M0-14C-9-19-18-8-17 3C-16 14-6 21 0 22C7 21 17 13 18 2C19-9 9-19 0-14Z" fill="${url('peach')}" stroke="#d68f5b" stroke-width=".65"/>
        <path d="M0-13Q4 1 0 19" fill="none" stroke="#dd9566" stroke-width=".7" opacity=".6"/>
        <path d="M-10-7C-15-2-13 7-10 9" fill="none" stroke="#fff9d9" stroke-width="3" stroke-linecap="round" opacity=".84"/>
        <ellipse cx="-6" cy="-8.5" rx="3.2" ry="1.8" transform="rotate(-30 -6 -8.5)" fill="#fffbed" opacity=".88"/>
        <path d="M-6-14L0-11L6-14M0-13Q0-18 3-20" stroke="#6d8b51" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${leaf(1,-16,.34,42)}
      </g>`;
      const orb = (x,y,r) => `<g><circle cx="${x}" cy="${y}" r="${r*1.75}" fill="${url('coolglow')}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${url('pearl')}" stroke="#f1ffe2" stroke-width=".65"/><ellipse cx="${x-r*.32}" cy="${y-r*.36}" rx="${r*.3}" ry="${r*.18}" fill="#fffef6" transform="rotate(-35 ${x-r*.32} ${y-r*.36})"/><circle cx="${x+r*.29}" cy="${y+r*.36}" r="${r*.12}" fill="#e6fff0"/></g>`;
      const crystal = (x,y,s,rot) => `<g transform="translate(${x} ${y}) rotate(${rot || 0}) scale(${s})"><path d="M0-20L10-7L8 13L0 22L-8 13L-10-7Z" fill="${url('crystal')}" stroke="#fff4d6" stroke-width="1"/><path d="M0-20L-3-6L0 22L6-5Z" fill="#fffadf" opacity=".62"/><path d="M-10-7L-3-6L6-5L10-7M-3-6L-8 13M6-5L8 13" fill="none" stroke="#8aab75" stroke-opacity=".5" stroke-width=".6"/><path d="M0-18L-2-6" stroke="#fffef2" stroke-width="1.1" stroke-linecap="round"/></g>`;
      const cap = (x,y,s,rot) => `<g transform="translate(${x} ${y}) rotate(${rot || 0}) scale(${s})">
        <path d="M-5 4Q-2 23-9 35Q-1 39 9 35Q3 20 6 4Z" fill="${url('stem')}" stroke="#cfab61" stroke-width=".6"/>
        <path d="M-3 10Q0 23-4 31" stroke="#fff2c9" stroke-width="1.2" fill="none" opacity=".8"/>
        <path d="M-29-1C-28-13-13-22 0-17C10-26 30-16 31-4L30 1C26 12 12 15 0 11C-14 17-29 10-29-1Z" fill="#a46930"/>
        <path d="M-29-1C-28-13-13-22 0-17C10-26 30-16 31-4C31 7 14 11 1 7C-12 13-28 8-29-1Z" fill="${url('amber')}" stroke="#e1ac4d" stroke-width=".65"/>
        <path d="M-28 0C-24 8-11 11 1 6C14 11 28 6 30-3" fill="none" stroke="#fff0bd" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M-23-5C-16-14-6-13 1-11C9-17 20-12 24-6M-16-3Q-6-10 1-5Q12-12 19-5" fill="none" stroke="#ffe3a3" stroke-width="1.2" opacity=".86"/>
        <path d="M-19-11Q-12-16-7-14M9-16Q16-17 21-12" fill="none" stroke="#fff8d5" stroke-width="2" stroke-linecap="round" opacity=".82"/>
        <path d="M-24 7Q-11 12-3 9M10 11Q19 10 25 6" stroke="#e3b86c" stroke-width=".65" fill="none" opacity=".65"/>
      </g>`;
      const halo = `<ellipse cx="60" cy="48" rx="49" ry="44" fill="${url(cropId === 'yueyang' || cropId === 'ningcui' ? 'coolglow' : 'glow')}"/>`;
      switch (cropId) {
        case 'zihou':
          art = `${halo}<path d="M59 88Q63 62 60 33M59 77Q41 69 32 53M61 69Q80 59 86 42M58 64Q47 47 42 29" stroke="#708e55" stroke-width="3" fill="none" stroke-linecap="round"/>
            ${leaf(58,86,.85,-72)}${leaf(62,85,.8,61)}${leaf(48,73,.65,-67)}${leaf(73,69,.7,50)}
            ${ripeFlower(39,31,.66,-16)}${ripeFlower(82,42,.73,15)}${ripeFlower(59,29,.91,5)}${ripeFlower(32,58,.67,-9)}${ripeFlower(65,60,.87,25)}
            <path d="M49 84Q44 77 39 77M71 82Q80 76 85 77" stroke="#9bbd7d" stroke-width="1.2" fill="none"/>
            ${star(19,37,3.2,'#e2bd7b')}${star(99,61,3.7,'#e6c87d')}${star(89,17,2.8,'#dfbbd6')}`;
          break;
        case 'tianling':
          art = `${halo}<path d="M58 88Q65 67 61 43Q56 31 59 19M61 62Q42 48 35 27M61 51Q78 39 85 23" stroke="#8e8857" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M59 86Q65 67 62 49" stroke="#e1c991" stroke-width="1.4" fill="none"/>
            ${leaf(39,39,.87,-57)}${leaf(46,32,.71,-28)}${leaf(57,33,.81,-11)}${leaf(71,34,.88,26)}${leaf(86,39,.74,54)}${leaf(58,79,.68,-70)}${leaf(65,77,.61,57)}
            ${ripeFruit(57,38,.69,-8)}${ripeFruit(34,59,.85,-16)}${ripeFruit(82,59,.91,14)}${ripeFruit(59,72,.68,-3)}
            ${star(18,30,3.4,'#e3b85d')}${star(101,38,3,'#e3b85d')}${star(92,82,2.5,'#e8c578')}`;
          break;
        case 'yueyang':
          art = `${halo}<path d="M48 88Q65 80 61 65Q54 51 61 39Q66 31 64 22M60 65Q44 58 35 43M61 53Q78 49 84 35M62 41Q49 37 46 24" stroke="#83a17a" stroke-width="6" fill="none" stroke-linecap="round"/>
            <path d="M51 86Q65 77 61 65Q57 52 63 39Q68 29 65 24" stroke="#eef0bd" stroke-width="1.8" fill="none"/>
            ${leaf(39,51,.88,-65,true)}${leaf(37,42,.72,-14,true)}${leaf(49,36,.84,-42,true)}${leaf(57,32,.91,5,true)}${leaf(70,36,.86,33,true)}${leaf(79,45,.83,54,true)}${leaf(86,39,.73,12,true)}${leaf(63,76,.72,55,true)}${leaf(57,79,.56,-82,true)}
            <path d="M35 49L32 58M55 32L53 42M78 46L82 56M67 27L74 30" stroke="#bfcea0" stroke-width="1" fill="none"/>
            ${orb(32,61,6.9)}${orb(53,45,6.2)}${orb(82,59,7.3)}${orb(74,31,4.7)}
            <path d="M26 68C13 80 52 88 84 74C99 68 99 62 92 61" stroke="#c4d7a7" stroke-width="1.3" fill="none" opacity=".9"/>
            <path d="M29 77Q55 87 80 77" stroke="#fff4ca" stroke-width="1" fill="none"/>
            ${star(21,38,3.4,'#b5d393')}${star(95,44,3.2,'#d6d6a1')}${star(88,18,2.6,'#c7dfab')}`;
          break;
        case 'ningcui':
          art = `${halo}<path d="M59 87Q27 71 23 42Q46 45 59 87Z" fill="${url('jade')}" stroke="#bceac7" stroke-width=".65"/>
            <path d="M59 87Q30 51 42 20Q61 43 59 87Z" fill="${url('leaf')}" stroke="#b8e7af" stroke-width=".65"/>
            <path d="M60 87Q47 43 59 11Q76 42 60 87Z" fill="${url('jade')}" stroke="#f4efbf" stroke-width=".65"/>
            <path d="M60 87Q68 49 92 26Q95 60 60 87Z" fill="${url('leaf')}" stroke="#b8e7af" stroke-width=".65"/>
            <path d="M62 87Q81 63 103 59Q97 82 62 87Z" fill="${url('jade')}" stroke="#c6edbe" stroke-width=".65"/>
            <path d="M58 85L28 48M57 82Q42 48 43 28M59 84L59 17M63 83Q83 51 90 33M64 85L98 64" stroke="#fff5cb" stroke-width="1.15" fill="none" opacity=".8"/>
            ${crystal(60,58,.9,0)}${crystal(37,69,.56,-29)}${crystal(82,68,.59,27)}
            ${orb(48,40,3.7)}${orb(81,40,3.1)}${orb(24,47,2.6)}
            ${star(24,25,3.5,'#d2dfa1')}${star(96,44,3.5,'#d2dfa1')}${star(73,14,2.7,'#b3d9b1')}`;
          break;
        case 'jiuqu':
          art = `${halo}<path d="M53 45C39 52 41 66 46 73C51 79 39 87 30 87C44 95 57 82 57 74C59 68 65 71 66 78C66 87 78 91 88 84C75 85 74 77 77 70C81 58 68 48 65 43Z" fill="${url('stem')}" stroke="#d3a14c" stroke-width=".8"/>
            <path d="M47 58Q36 57 30 64Q22 71 19 65M73 58Q85 53 91 61Q98 70 103 61M47 76Q34 74 32 81M74 78Q82 74 91 78" stroke="#d2a757" stroke-width="1.6" fill="none" stroke-linecap="round"/>
            <path d="M52 52Q59 55 66 51M48 59Q56 63 63 59M49 66Q56 70 62 65M68 70L72 73" stroke="#bb8739" stroke-width=".9" fill="none" opacity=".6"/>
            <path d="M51 54Q46 61 50 68M57 78Q54 84 48 86M69 60Q73 64 72 68" stroke="#fff7d2" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>
            <path d="M59 48Q59 31 58 21M58 35Q45 30 39 19M60 33Q73 26 81 18" stroke="#73a268" stroke-width="2.4" fill="none"/>
            ${leaf(55,36,.85,-78)}${leaf(57,33,.73,-34)}${leaf(60,32,.76,21)}${leaf(63,37,.82,59)}${leaf(42,26,.6,-55)}${leaf(77,26,.6,38)}
            <g fill="${url('ruby')}" stroke="#bf6b56" stroke-width=".4"><circle cx="53" cy="28" r="5.3"/><circle cx="62" cy="24" r="5.6"/><circle cx="70" cy="30" r="4.9"/><circle cx="61" cy="34" r="5.4"/></g>
            <g fill="#fff0c5" opacity=".9"><ellipse cx="51" cy="26" rx="1.6" ry="1.1" transform="rotate(-30 51 26)"/><ellipse cx="60" cy="22" rx="1.7" ry="1.1" transform="rotate(-30 60 22)"/><ellipse cx="68" cy="28" rx="1.4" ry="1"/><ellipse cx="59" cy="32" rx="1.6" ry="1"/></g>
            ${star(22,42,4.1,'#e3b85d')}${star(94,42,3.5,'#e3b85d')}${star(78,10,2.5,'#e7c477')}`;
          break;
        case 'huangjing':
        default:
          art = `${halo}${cap(62,34,1.18,-5)}${cap(33,65,.7,-13)}${cap(84,67,.68,10)}
            ${leaf(49,88,.44,-62)}${leaf(73,89,.47,56)}
            ${star(20,29,3.9,'#e8bf66')}${star(99,42,4,'#e8bf66')}${star(78,9,2.6,'#e3bd65')}
            <circle cx="27" cy="43" r="1.5" fill="#fff1b4"/><circle cx="95" cy="76" r="1.5" fill="#e6c97b"/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="plant-art${mature ? ' is-mature' : ''}" width="${width}" height="${width * 5 / 6}" viewBox="0 0 120 100" fill="none" aria-hidden="true" focusable="false">${defs}${ground}${art}</svg>`;
  };
})();
