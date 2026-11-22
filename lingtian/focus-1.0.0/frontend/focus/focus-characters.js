/* 同修头像与试穿：复用进修室精绘人物的同一衣装合成，原版图集仅作加载占位。 */
(function (global) {
  'use strict';
  const PORTRAIT_ATLAS = "assets/companions-v85.webp";
  const script = global.document?.currentScript;
  const atlas = PORTRAIT_ATLAS.startsWith('data:') ? PORTRAIT_ATLAS : script?.src && typeof URL !== 'undefined' ? new URL(PORTRAIT_ATLAS, script.src).href : './focus/' + PORTRAIT_ATLAS;
  const CHARACTERS = Object.freeze([
    Object.freeze({id:'jade',name:'玉衣书生',gender:'male',skin:'#ead0b0',color:'#ead0b0',cream:'#f4e5c8',hair:'#293830',ear:'#c4a68d',blush:'#dfbba5',hairstyle:'bun',back:'#e3e8d7',position:'0% 0%'}),
    Object.freeze({id:'peach',name:'桃衣剑修',gender:'female',skin:'#efd2b8',color:'#efd2b8',cream:'#f7e8d2',hair:'#382e2b',ear:'#cba28e',blush:'#dfb3a4',hairstyle:'long',back:'#eee2cf',position:'100% 0%'}),
    Object.freeze({id:'cloud',name:'云岚丹师',gender:'female',skin:'#ecd3b9',color:'#ecd3b9',cream:'#f4e8d3',hair:'#30333d',ear:'#c8a38e',blush:'#dfbbaa',hairstyle:'double-bun',back:'#e5e5d9',position:'0% 100%'}),
    Object.freeze({id:'ink',name:'墨衣游侠',gender:'male',skin:'#e4c4a5',color:'#e4c4a5',cream:'#f1dfc4',hair:'#263334',ear:'#bc947c',blush:'#d5ad96',hairstyle:'ponytail',back:'#dce5db',position:'100% 100%'})
  ]);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : fallback;
  const mix = (a,b,amount) => {
    const first=parseInt(a.slice(1),16),second=parseInt(b.slice(1),16);
    const channel=shift=>Math.round((first>>shift&255)*(1-amount)+(second>>shift&255)*amount);
    return '#'+[channel(16),channel(8),channel(0)].map(n=>n.toString(16).padStart(2,'0')).join('');
  };
  const shape = (entry, allowed, fallback) => allowed.includes(entry.shape) ? entry.shape : fallback;
  let drawingId = 0;

  function getById(avatarId) {
    return CHARACTERS.find(character => character.id === avatarId) || null;
  }
  function resolve(identityOrProfile) {
    const value=identityOrProfile && typeof identityOrProfile==='object' ? identityOrProfile : {identity:identityOrProfile};
    const nested=value.identity && typeof value.identity==='object' ? value.identity : null;
    // 性别是学生自主选择的资料，不作为头像限制；只接受四个内置头像编号。
    const selected=getById(value.avatarId)||getById(value.profile?.avatarId)||getById(nested?.avatarId);
    if(selected)return selected;
    // 未设置头像的旧存档和 NPC 延续 FNV 身份，不因改名、换席或连接变化而换人。
    const candidate=value.id??value.participantId??value.userId??(nested?(nested.id??nested.participantId):value.identity);
    const key = String(candidate || 'local:self');
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    return CHARACTERS[(hash >>> 0) % CHARACTERS.length];
  }
  function getCharacter(identityOrProfile) {
    return resolve(identityOrProfile);
  }
  function appearance(entries) {
    const {head={},robe={},bottom={},accessory={}}=entries;
    return {
      robe:color(robe.color,'#527b6b'), trim:color(robe.accent,'#e5e3cd'),
      bottom:color(bottom.color,'#d8d4b5'), bottomTrim:color(bottom.accent,'#9a946c'),
      head:color(head.color,'#90ad99'), headTrim:color(head.accent,'#c9b77d'),
      accessory:color(accessory.color,'#ac925e'), accessoryTrim:color(accessory.accent,'#c9b77d'),
      headShape:shape(head,['pin','bamboo','cloud','star'],'pin'),
      robeShape:shape(robe,['plain','rain','crane','celestial'],'plain'),
      hemShape:shape(bottom,['plain','bamboo','cloud','moon'],'plain'),
      adornShape:shape(accessory,['knot','scroll','jade','lantern'],'knot')
    };
  }
  function palette(c, uid, cloth) {
    const radial = (name, light, middle, dark, x='34%', y='24%') =>
      '<radialGradient id="'+uid+name+'" cx="'+x+'" cy="'+y+'" r="80%"><stop stop-color="'+light+'"/><stop offset=".54" stop-color="'+middle+'"/><stop offset="1" stop-color="'+dark+'"/></radialGradient>';
    const linear = (name, a, b) =>
      '<linearGradient id="'+uid+name+'" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient>';
    return '<defs>'+radial('skin',c.cream,c.skin,mix(c.skin,c.ear,.27))+
      radial('hair',mix(c.hair,'#7c8c76',.22),c.hair,mix(c.hair,'#17251f',.24))+
      radial('eyes','#716044','#443d2d','#252f27','30%','20%')+
      radial('cheek',c.blush,c.blush,c.skin)+
      '<radialGradient id="'+uid+'aura"><stop stop-color="#fbf2d3" stop-opacity=".7"/><stop offset=".67" stop-color="#e7e8cd" stop-opacity=".26"/><stop offset="1" stop-color="#e7e8cd" stop-opacity="0"/></radialGradient>'+
      radial('robe',mix(cloth.robe,'#e8e6cd',.18),cloth.robe,mix(cloth.robe,'#294e3b',.24))+
      linear('hem',mix(cloth.bottom,'#f0ead3',.12),mix(cloth.bottom,'#6c7760',.16))+
      linear('cuff',cloth.trim,mix(cloth.trim,cloth.robe,.16))+
      radial('adorn',mix(cloth.accessory,'#e9e2c1',.2),cloth.accessory,mix(cloth.accessory,'#456e60',.23))+
      '</defs>';
  }
  function hairBack(c, uid) {
    const fill='url(#'+uid+'hair)', highlight=mix(c.hair,'#80917c',.3);
    let extra='';
    if(c.hairstyle==='long') {
      extra='<path d="M64 64Q54 99 58 145Q56 163 65 184Q73 174 72 157L77 100H127L129 157Q128 173 137 182Q147 157 141 138Q148 91 135 62Z" fill="'+fill+'"/><path d="M64 95Q60 139 66 163M136 95Q142 141 136 162" stroke="'+highlight+'" stroke-width="1.2" opacity=".55" fill="none"/><ellipse cx="103" cy="29" rx="12" ry="8" fill="'+fill+'"/>';
    } else if(c.hairstyle==='ponytail') {
      extra='<path d="M119 31Q143 31 146 52Q147 73 141 92Q139 123 151 144Q139 141 135 128Q128 105 133 79Q138 57 125 49Z" fill="'+fill+'"/><path d="M135 44Q145 62 137 88Q133 116 142 131" stroke="'+highlight+'" stroke-width="1.3" fill="none"/><ellipse cx="117" cy="30" rx="11" ry="10" fill="'+fill+'"/>';
    } else if(c.hairstyle==='double-bun') {
      extra='<g fill="'+fill+'"><ellipse cx="68" cy="40" rx="11" ry="10" transform="rotate(-18 68 40)"/><ellipse cx="132" cy="40" rx="11" ry="10" transform="rotate(18 132 40)"/></g><g stroke="#bca972" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M59 43Q68 49 76 43M124 43Q132 49 141 43"/><path d="M62 49L60 59M138 49L140 59"/></g>';
    } else {
      extra='<ellipse cx="100" cy="26" rx="13" ry="11" fill="'+fill+'"/><path d="M92 22Q99 17 106 23M92 27Q100 20 109 27" stroke="'+highlight+'" stroke-width="1.3" stroke-linecap="round" fill="none"/>';
    }
    return '<g data-hair="'+c.hairstyle+'">'+extra+'<path d="M59 74Q55 42 76 32Q100 20 125 35Q145 47 141 77L139 87Q136 100 124 105L117 103H83L76 105Q64 100 61 87Z" fill="'+fill+'"/></g>';
  }
  function face(c, uid) {
    const skin='url(#'+uid+'skin)',hair='url(#'+uid+'hair)';
    const bangs=c.hairstyle==='long'?
      'M61 68Q57 43 77 33Q102 20 125 36Q143 49 139 69Q127 59 119 43Q109 59 94 64Q103 53 105 40Q86 65 61 68Z':
      c.hairstyle==='double-bun'?
      'M61 68Q58 43 78 33Q101 23 123 35Q142 47 139 68Q126 60 120 45Q116 56 108 60L103 42Q93 59 81 63L85 49Q76 63 61 68Z':
      c.hairstyle==='ponytail'?
      'M61 70Q55 43 78 32Q103 20 126 36Q143 51 139 70Q129 60 123 45Q113 61 104 65Q108 52 106 42Q91 65 69 69L75 59Z':
      'M61 68Q57 43 78 32Q102 21 124 35Q141 46 139 68Q127 58 120 43Q109 60 94 64Q102 54 104 41Q86 65 61 68Z';
    const leftEye='M72 80Q80 75 88 80Q80 85 72 80Z',rightEye='M112 80Q120 75 128 80Q120 85 112 80Z';
    return '<g data-human-face="'+c.id+'">'+
      '<defs><clipPath id="'+uid+'eye-left"><path d="'+leftEye+'"/></clipPath><clipPath id="'+uid+'eye-right"><path d="'+rightEye+'"/></clipPath></defs>'+
      '<g fill="'+skin+'"><ellipse cx="62" cy="80" rx="5" ry="8"/><ellipse cx="138" cy="80" rx="5" ry="8"/></g>'+
      '<g fill="'+c.ear+'" opacity=".33"><ellipse cx="62" cy="80" rx="2.3" ry="4.5"/><ellipse cx="138" cy="80" rx="2.3" ry="4.5"/></g>'+
      '<path d="M64 63Q64 43 100 41Q136 43 136 63L135 82Q133 101 100 109Q67 101 65 82Z" fill="'+skin+'"/>'+
      '<path d="M71 91Q78 102 94 104" fill="none" stroke="'+c.cream+'" stroke-width="2" stroke-linecap="round" opacity=".38"/>'+
      '<path d="'+bangs+'" fill="'+hair+'"/>'+
      '<path d="M72 44Q85 32 99 32M120 37Q132 45 135 55" fill="none" stroke="'+mix(c.hair,'#82917a',.35)+'" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>'+
      '<path d="M64 62Q61 79 67 90M136 62Q139 79 133 91" fill="none" stroke="'+c.hair+'" stroke-width="3.2" stroke-linecap="round"/>'+
      '<g stroke="'+c.hair+'" stroke-width="1.65" stroke-linecap="round" fill="none" opacity=".86"><path d="M72 72Q80 68 87 71"/><path d="M113 71Q120 68 128 72"/></g>'+
      '<g data-eye-style="almond" fill="#eee3cc"><path d="'+leftEye+'"/><path d="'+rightEye+'"/></g>'+
      '<g fill="url(#'+uid+'eyes)"><ellipse cx="80" cy="80" rx="4.1" ry="4.6" clip-path="url(#'+uid+'eye-left)"/><ellipse cx="120" cy="80" rx="4.1" ry="4.6" clip-path="url(#'+uid+'eye-right)"/></g>'+
      '<g fill="#fbf5df"><circle cx="79" cy="78.5" r="1.1"/><circle cx="119" cy="78.5" r="1.1"/></g>'+
      '<g stroke="'+c.hair+'" stroke-width="1.45" stroke-linecap="round" fill="none"><path d="M72 80Q80 75 88 80"/><path d="M112 80Q120 75 128 80"/></g>'+
      (c.gender==='female'?'<path d="M72 80L70 78.5M128 80L130 78.5" stroke="'+c.hair+'" stroke-width="1.1" stroke-linecap="round"/>':'')+
      '<g fill="url(#'+uid+'cheek)" opacity=".28"><ellipse cx="73" cy="91" rx="5.5" ry="2.4"/><ellipse cx="127" cy="91" rx="5.5" ry="2.4"/></g>'+
      '<path d="M100 85L99 89L101 90" fill="none" stroke="'+c.ear+'" stroke-width="1.05" stroke-linecap="round" opacity=".5"/>'+
      '<path d="M96 98Q100 100 104 98" fill="none" stroke="#a97b68" stroke-width="1.35" stroke-linecap="round"/>'+
      '</g>';
  }
  function headwear(cloth) {
    const selected=cloth.headShape,hc=cloth.head,ha=cloth.headTrim;
    const content=selected==='bamboo'?
      '<path d="M87 28Q100 32 113 28L112 40Q100 43 88 40Z" fill="'+hc+'"/><path d="M88 38Q100 41 112 38M94 31V39M106 31V39" stroke="'+ha+'" stroke-width="1.7" stroke-linecap="round"/>':
      selected==='cloud'?
      '<path d="M86 40Q81 32 89 30Q91 22 100 28Q109 22 111 30Q119 32 114 40Z" fill="'+hc+'" stroke="'+ha+'" stroke-width="1.5"/><path d="M91 36Q95 32 100 36Q105 32 110 35" fill="none" stroke="'+ha+'" stroke-width="1.3" stroke-linecap="round"/>':
      selected==='star'?
      '<path d="M87 39L88 28L95 31L100 23L105 31L112 28L113 39Q100 43 87 39Z" fill="'+hc+'" stroke="'+ha+'" stroke-width="1.5" stroke-linejoin="round"/><path d="M100 30L103 34L100 38L97 34Z" fill="'+ha+'"/>':
      '<path d="M82 33L118 27" stroke="'+ha+'" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="119" cy="27" rx="3.2" ry="3.8" fill="'+hc+'"/><circle cx="118" cy="26" r="1" fill="#f2e6c5" opacity=".8"/>';
    return '<g data-clothing-slot="head" data-shape="'+selected+'">'+content+'</g>';
  }
  function lowerRobe(cloth, uid) {
    const selected=cloth.hemShape,trim=cloth.bottomTrim;
    let hem='<path d="M77 173H123L134 215Q100 226 66 215Z" fill="url(#'+uid+'hem)"/>';
    if(selected==='bamboo') hem+='<path d="M79 194L76 216M91 194L90 219M109 194L110 219M121 194L124 216" stroke="'+trim+'" stroke-width="1.8" stroke-linecap="round"/><path d="M77 208L82 205M121 210L117 206" stroke="'+trim+'" stroke-width="1.3" stroke-linecap="round"/>';
    else if(selected==='cloud') hem+='<path d="M71 213Q76 207 82 213Q87 207 93 214Q99 208 105 214Q111 208 117 213Q123 207 129 213" fill="none" stroke="'+trim+'" stroke-width="2" stroke-linecap="round"/>';
    else if(selected==='moon') hem+='<path d="M70 214Q100 223 130 214" stroke="'+trim+'" stroke-width="1.8" fill="none"/><path d="M114 210A4 4 0 1 0 119 216Q115 218 114 210Z" fill="'+trim+'"/>';
    else hem+='<path d="M72 215Q100 223 128 215" stroke="'+trim+'" stroke-width="1.2" opacity=".65" fill="none"/>';
    return '<g data-clothing-slot="bottom" data-shape="'+selected+'">'+hem+'</g>';
  }
  function robe(cloth, uid) {
    const fill='url(#'+uid+'robe)',cuff='url(#'+uid+'cuff)',trim=cloth.trim,shadow=mix(cloth.robe,'#294e3b',.35);
    let detail='';
    if(cloth.robeShape==='rain') detail='<path d="M77 184L74 200M82 182L80 204M79 190L85 186M78 196L72 191" fill="none" stroke="'+trim+'" stroke-width="1.4" stroke-linecap="round"/><path d="M123 126L129 144M128 132L133 129" fill="none" stroke="'+trim+'" stroke-width="1.3" stroke-linecap="round"/>';
    else if(cloth.robeShape==='crane') detail='<path d="M111 174Q122 163 128 172Q122 168 117 180L113 188M117 178Q126 178 130 184M118 174L117 170" fill="none" stroke="'+trim+'" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M74 191Q84 185 92 191" fill="none" stroke="'+trim+'" stroke-width="1.2" opacity=".65"/>';
    else if(cloth.robeShape==='celestial') detail='<path d="M111 170L113 174L117 176L113 178L111 182L109 178L105 176L109 174Z" fill="'+trim+'"/><path d="M116 177L124 187L119 198" fill="none" stroke="'+trim+'" stroke-width=".9" opacity=".7"/><g fill="'+trim+'"><circle cx="124" cy="187" r="1.5"/><circle cx="119" cy="198" r="1.5"/><circle cx="78" cy="194" r="1.2"/></g>';
    return '<g data-clothing-slot="robe" data-shape="'+cloth.robeShape+'">'+
      '<path d="M81 112Q67 114 61 127L47 162Q53 172 66 174L80 144ZM119 112Q133 114 139 127L153 162Q147 172 134 174L120 144Z" fill="'+fill+'"/>'+
      '<path d="M69 132L60 157M131 132L140 157" stroke="'+shadow+'" stroke-opacity=".45" stroke-width="1.2" fill="none" stroke-linecap="round"/>'+
      '<path d="M49 160Q55 168 66 169L64 176Q53 174 46 166ZM151 160Q145 168 134 169L136 176Q147 174 154 166Z" fill="'+cuff+'"/>'+
      '<path d="M79 111Q100 105 121 111L127 150L138 202Q121 212 100 208Q79 212 62 202L73 150Z" fill="'+fill+'"/>'+
      '<path d="M86 110L100 124L113 110L119 117L100 136L81 117Z" fill="'+cuff+'"/>'+
      // 右衽交领只有一条主襟向腰侧收束，不画成对称 V 领或中间拉链。
      '<path data-collar="crossed" d="M82 110L114 142L109 148L77 117Z" fill="'+cuff+'"/>'+
      '<path d="M84 112L111 141" stroke="'+mix(trim,cloth.robe,.35)+'" stroke-width="1" opacity=".6" fill="none"/>'+
      '<path d="M75 148Q100 153 126 148L128 156Q100 162 73 156Z" fill="'+cuff+'"/>'+
      '<path d="M82 163L75 200M118 162L127 200M96 166L94 204" stroke="'+shadow+'" stroke-opacity=".34" stroke-width="1.3" fill="none" stroke-linecap="round"/>'+
      '<path d="M65 202Q81 210 100 205Q121 210 135 202" stroke="'+trim+'" stroke-width="2.1" opacity=".8" fill="none"/>'+
      detail+'<path d="M108 156L105 180L111 176L115 158M113 157L120 176L123 170L118 155" fill="'+cuff+'"/>'+
      '<path d="M108 151Q114 145 119 151Q116 158 110 156Z" fill="'+cloth.headTrim+'" stroke="'+mix(cloth.headTrim,shadow,.35)+'" stroke-width=".8"/>'+
      '</g>';
  }
  function accessory(cloth, uid) {
    const fill='url(#'+uid+'adorn)',trim=cloth.accessoryTrim;
    let adorn='';
    if(cloth.adornShape==='scroll') adorn='<g transform="rotate(8 10 15)"><rect x="0" y="4" width="19" height="27" rx="3" fill="'+fill+'"/><rect x="4" y="6" width="11" height="23" rx="1.5" fill="#eee4c7"/><path d="M1 5H18M1 30H18" stroke="'+trim+'" stroke-width="3" stroke-linecap="round"/><path d="M7 12H12M7 17H12M7 22H11" stroke="'+trim+'" stroke-width="1.1" stroke-linecap="round"/></g>';
    else if(cloth.adornShape==='jade') adorn='<path d="M9 0V7" stroke="'+trim+'" stroke-width="1.8"/><path d="M2 8Q9 4 16 8L17 22Q13 30 9 30Q5 30 1 22Z" fill="'+fill+'"/><ellipse cx="9" cy="17" rx="3.2" ry="4.2" fill="'+trim+'" opacity=".75"/><path d="M6 30V38M12 30V38" stroke="'+trim+'" stroke-width="1.4" stroke-linecap="round"/><path d="M4 11L4 20" stroke="#f2eacf" stroke-width="1.3" opacity=".65" stroke-linecap="round"/>';
    else if(cloth.adornShape==='lantern') adorn='<path d="M2 7Q9-3 16 7" fill="none" stroke="'+trim+'" stroke-width="1.8"/><rect x="0" y="7" width="18" height="25" rx="8" fill="'+fill+'"/><ellipse cx="9" cy="19.5" rx="5" ry="9" fill="#f3d795"/><path d="M2 9H16M2 30H16M9 32V39" stroke="'+trim+'" stroke-width="1.8" stroke-linecap="round"/>';
    else adorn='<path d="M9 0V10M9 13Q-2 3 1 16Q3 24 9 17Q15 24 17 16Q20 3 9 13Z" stroke="'+trim+'" stroke-width="2" fill="'+fill+'" stroke-linecap="round" stroke-linejoin="round"/><rect x="6" y="11" width="6" height="8" rx="2" fill="'+cloth.accessory+'"/><path d="M6 20L3 34M12 20L15 34" stroke="'+trim+'" stroke-width="2" stroke-linecap="round"/>';
    return '<g data-clothing-slot="accessory" data-shape="'+cloth.adornShape+'"><path d="M126 153Q135 153 134 160" stroke="'+trim+'" stroke-width="1" fill="none"/><g transform="translate(128 159) scale(.72)">'+adorn+'</g></g>';
  }
  function figure(c, uid, cloth) {
    // 头像与全身试穿复用头脸、长袍和四槽，缩略图不会切换为另一种人物比例。
    return hairBack(c,uid)+
      '<g fill="'+mix(cloth.robe,'#253a30',.52)+'"><path d="M70 216Q78 212 89 216L91 222Q80 227 68 222Z"/><path d="M111 216Q122 212 130 216L132 222Q120 227 109 222Z"/></g>'+
      '<path d="M69 222Q80 225 90 222M110 222Q120 225 131 222" stroke="#d7d6bd" stroke-width="1.1" fill="none"/>'+
      lowerRobe(cloth,uid)+'<path d="M94 102H106L109 116L100 124L91 116Z" fill="url(#'+uid+'skin)"/>'+robe(cloth,uid)+
      '<g fill="url(#'+uid+'skin)"><path d="M56 171Q52 176 56 180Q60 183 64 179L66 175Z"/><path d="M144 171Q148 176 144 180Q140 183 136 179L134 175Z"/></g>'+
      accessory(cloth,uid)+face(c,uid)+headwear(cloth);
  }
  function clothingEntries(equipped,catalog=global.SpiritFocusCatalog) {
    return Object.fromEntries(['head','robe','bottom','accessory'].map(slot=>{
      const value=equipped?.[slot];
      const entry=value&&typeof value==='object'&&!Array.isArray(value)?value:catalog?.getItem?.(value)||catalog?.ITEM_MAP?.[value];
      return [slot,entry&&typeof entry==='object'&&!Array.isArray(entry)&&(!entry.slot||entry.slot===slot)?entry:{}];
    }));
  }
  function appearancePerson(identity,equipped,catalog) {
    const profile=identity&&typeof identity==='object'?identity:{id:identity};
    return {...profile,avatarId:getCharacter(identity).id,clothes:clothingEntries(equipped??profile.equipped??profile.clothes,catalog)};
  }
  function appearanceKey(identity,equipped,catalog) {
    const person=appearancePerson(identity,equipped,catalog);
    return global.FocusSprites?.appearanceKey?.(person)||'pending-v92:'+person.avatarId+':'+JSON.stringify(appearance(person.clothes));
  }
  function ready() {
    // 首屏可能先载头像模块；不记忆“合成模块尚未加载”，后续可正常初始化。
    return global.FocusSprites?.ready?global.FocusSprites.ready():Promise.resolve(false);
  }
  function onReady(callback) {
    return typeof callback==='function'&&global.FocusSprites?.onReady?global.FocusSprites.onReady(callback):()=>{};
  }
  function artworkState(picture,person,view) {
    const status=global.FocusSprites?.pictureStatus?.(person,{view})||global.FocusSprites?.status?.();
    return picture?'ready':status==='unavailable'?'unavailable':'loading';
  }
  function portraitMarkup(identity, className='', equipped, catalog=global.SpiritFocusCatalog) {
    const c=getCharacter(identity),selected=identity&&typeof identity==='object'&&identity.equipped!==undefined?identity.equipped:equipped;
    const person=appearancePerson(identity,selected,catalog),picture=global.FocusSprites?.picture?.(person,{view:'portrait'}),state=artworkState(picture,person,'portrait');
    const classes=String(className).replace(/[^a-z0-9_\- ]/gi,'');
    const key=picture?.key||appearanceKey(identity,selected,catalog);
    const artwork=picture?'<img class="fx-companion-rendered" src="'+escape(picture.url)+'" width="256" height="256" alt="" aria-hidden="true" decoding="async" draggable="false">':
      '<span class="fx-companion-atlas" aria-hidden="true" style="background-image:url(&quot;'+escape(atlas)+'&quot;);background-position:'+c.position+'"></span>';
    return '<span class="fx-companion-avatar '+classes+'" data-companion="'+c.id+'" data-appearance-key="'+escape(key)+'" data-appearance-state="'+state+'" role="img" aria-label="'+escape(c.name)+'同修头像'+(state==='ready'?'，当前衣装':state==='loading'?'，衣装正在加载':'，衣装暂不可用，显示原画')+'">'+artwork+'</span>';
  }
  function previewMarkup(identity,equipped,catalog) {
    const c=getCharacter(identity),uid='fx-spirit-'+(++drawingId)+'-';
    const slots=[['head','发冠'],['robe','衣袍'],['bottom','下裳'],['accessory','配饰']];
    const entries=clothingEntries(equipped,catalog),person=appearancePerson(identity,equipped,catalog);
    const picture=global.FocusSprites?.picture?.(person,{view:'full'}),state=artworkState(picture,person,'full'),key=picture?.key||appearanceKey(identity,equipped,catalog);
    const cloth=appearance(entries);
    const views={head:'72 16 57 36',robe:'42 105 116 109',bottom:'60 167 80 61',accessory:'120 147 29 45'};
    // 试穿完整人物来自场景的同一帧；画签只说明各槽，不代替人物的实际衣装变化。
    const badges=slots.map(([slot,label])=>{
      const current=entries[slot],canonical=catalog?.getItem?.(current.id)||catalog?.ITEM_MAP?.[current.id];
      const known=canonical?.slot===slot?canonical:null;
      const name=known?.name||'素色'+label;
      const local=uid+slot+'-';
      const drawing=slot==='head'?headwear(cloth):slot==='robe'?robe(cloth,local):slot==='bottom'?lowerRobe(cloth,local):accessory(cloth,local);
      return '<div class="fx-outfit-token" data-outfit-slot="'+slot+'" data-item="'+escape(known?.id||'')+'" style="--fx-outfit-color:'+cloth[slot]+'" title="'+label+'：'+escape(name)+'">'+
        '<span class="fx-outfit-token-art" aria-hidden="true"><svg viewBox="'+views[slot]+'" fill="none">'+palette(c,local,cloth)+drawing+'</svg></span>'+
        '<span class="fx-outfit-token-copy"><small>'+label+'</small><strong>'+escape(name)+'</strong></span></div>';
    }).join('');
    const artwork=picture?'<img class="fx-outfit-rendered" src="'+escape(picture.url)+'" width="512" height="512" alt="" aria-hidden="true" decoding="async" draggable="false">':
      '<span class="fx-illustration-atlas" aria-hidden="true" style="background-image:url(&quot;'+escape(atlas)+'&quot;);background-position:'+c.position+'"></span><span class="fx-appearance-notice" role="status">'+(state==='unavailable'?'衣装预览暂不可用，显示原画':'正在展开当前衣装…')+'</span>';
    return '<div class="fx-avatar-preview fx-avatar-preview-2d" data-character="'+c.id+'">'+
      '<div class="fx-illustration-hero" data-appearance-key="'+escape(key)+'" data-appearance-state="'+state+'" role="img" aria-label="'+escape(c.name)+'二维 Q 版形象'+(state==='ready'?'，当前试穿效果':'，衣装尚未展开')+'">'+artwork+'</div>'+
      '<div class="fx-outfit-tokens" role="group" aria-label="四槽衣装搭配">'+badges+'</div></div>';
  }
  global.FocusCharacters=Object.freeze({CHARACTERS,getById,resolve,getCharacter,appearanceKey,portraitMarkup,previewMarkup,ready,onReady});
})(typeof window!=='undefined'?window:globalThis);
