const dictionaries = {
  zh: {
    'page.title': 'APEX / 飞车实验室',
    'page.description': 'APEX 飞车实验室：六种 3D 特技赛道、四款试验车、喷气侧滚与实时车辆损伤。电脑和手机均可驾驶。',
    'scene.label': '3D 飞车赛道', 'brand.label': 'APEX 飞车实验室',
    'language.label': 'Switch to English', 'sound.label': '切换声音', 'sound.on': '声音 开', 'sound.off': '声音 关',
    'fullscreen.label': '切换全屏', 'fullscreen.title': '全屏', 'fullscreen.hint': '请将手机横屏',
    'eyebrow.program': '驾驶试验计划 / 06', 'hero.first': '地面，', 'hero.second': '只是起点', 'hero.punctuation': '。',
    'hero.intro': '踩下电门，挣脱重力。在悬空跑道与倒挂路段，找到你的飞行方式。',
    'hero.vehicle': '四款试验车 · 实时驾驶动态', 'hero.features': '底部喷气 · 主动吸附 · 实时损伤',
    'tracks.title': '选择试验场', 'tracks.count': '06 个地点', 'tracks.length': '赛道长度', 'tracks.best': '本机最高分',
    'vehicle.label': '试验车辆', 'vehicle.roadster': 'R-01 · 飞行跑车', 'vehicle.coupe': 'C-02 · 双门 GT',
    'vehicle.rally': 'R-03 · 拉力赛车', 'vehicle.prototype': 'P-04 · 原型赛车',
    'vehicle.note': '{mass} kg · 加速度 {acceleration} m/s² · 极速 {speed} km/h',
    'quality.label': '画面质量', 'quality.auto': '自动', 'quality.low': '流畅', 'quality.medium': '均衡',
    'quality.high': '高画质', 'quality.ultra': '极致 · 4K 阴影',
    'quality.note.low': '轻量场景 · 适合手机', 'quality.note.medium': '动态阴影 · 平衡性能',
    'quality.note.high': '精细材质 · 环境遮蔽 · 柔和光晕', 'quality.note.ultra': '最高细节 · 4K 阴影 · 高精度环境遮蔽',
    'motionBlur.label': '运动模糊', 'motionBlur.note': '随车速增强，可随时关闭',
    'start': '开始驾驶', 'start.loading': '准备试验场…', 'controls.help': '操作说明 ↗',
    'controls.accelerate': '加速', 'controls.brake': '刹车', 'controls.steer': '转向', 'controls.roll': '侧滚',
    'controls.jet': '底部喷气', 'controls.retry': '重试', 'controls.space': '空格', 'controls.arrows': '或方向键',
    'footer.independent': '独立特技模拟游戏 · 非特斯拉官方产品', 'footer.gpu': 'WEBGL / GPU 硬件加速',
    'hud.running': '车辆遥测 / 试验进行中', 'hud.time': '时间', 'hud.score': '得分', 'hud.pause': '暂停',
    'hud.fuel': '喷气储量', 'hud.integrity': '车辆完整度', 'hud.minimap': '赛道位置图', 'hud.route': '赛道遥测',
    'gear.label': '挡位', 'gear.drive': 'D', 'gear.neutral': 'N', 'grip.label': '抓地力',
    'magnet.on': '吸附 开', 'magnet.off': '吸附 关', 'camera.0': '车后跟随', 'camera.1': '远距跟随', 'camera.2': '贴近跟随',
    'mode.jet': '推进器工作中', 'mode.air': '自由飞行', 'mode.ground': '地面驾驶', 'mode.inverted': '倒挂驾驶',
    'mode.adhesion': '吸附中', 'mode.roll': '侧滚 {value}°', 'mode.explore': '自由探索', 'recover': '返回赛道', 'platform.warning': '平台将在 {seconds} 秒后消失',
    'touch.left': '左转 A', 'touch.right': '右转 D', 'touch.rollLeft': '左侧滚 Q', 'touch.rollRight': '右侧滚 E',
    'touch.rollLeft.short': 'Q 左滚', 'touch.rollRight.short': 'E 右滚', 'touch.throttle': '加速 ↑',
    'touch.jet': '喷气', 'touch.hold': '按住起飞',
    'pause.label': '模拟暂停', 'pause.eyebrow': '模拟已暂停', 'pause.title': '稍作停留。',
    'pause.tip': 'A / D 转向，Q / E 左右侧滚。落地前松开喷气并调平侧倾，使轮胎朝向赛道。',
    'pause.resume': '继续驾驶', 'pause.restart': '重新挑战', 'pause.exit': '返回试验场',
    'result.label': '本局结果', 'result.eyebrow': '驾驶分析报告', 'result.success': '试验完成。',
    'result.failure': '下次，飞得更好。', 'result.newRecord': '↗ 本机新纪录', 'result.score': '本次综合得分',
    'result.time': '驾驶时间', 'result.flips': '空中侧滚', 'result.airtime': '滞空时间', 'result.speed': '最高速度',
    'result.damageTitle': '车辆损伤报告', 'result.integrity': '完整度 {value}%', 'result.damage': '{value}% 损伤',
    'result.note': '行驶进度、滞空、侧滚和落地表现带来分数；碰撞会扣分。车辆损伤采用游戏模型。',
    'result.retry': '再飞一把', 'result.choose': '更换赛道',
    'damage.body': '车身', 'damage.suspension': '悬挂', 'damage.battery': '电池', 'damage.thrusters': '推进器',
    'unit.seconds': '秒', 'unit.times': '次',
    'help.close': '关闭操作说明', 'help.eyebrow': '驾驶员简报', 'help.title': '你的第一次飞行。',
    'help.drive': 'W / ↑ 加速，S / ↓ 刹车。A / D 或 ← / → 转向。',
    'help.roll': 'Q / E 在空中向左 / 向右侧滚。按住空格，底部喷气沿车身朝上方向推动车辆；侧滚后喷气也会产生横向推力。坡道接触、离地惯性和空气阻尼决定前后俯仰。',
    'help.magnet': 'M 开关吸附辅助，可用于环形与倒挂路段。喷气会让车辆脱离赛道，落地后自动补充储量。',
    'help.platform': '悬空发布场：橙色平台接近后开始倒计时，随后消失。留意倒计时，提前喷气，跨过断口。',
    'help.explore': '驶出赛道后可以自由探索；只有实际穿过终点门才会结算。错过终点可继续驾驶，按 T 或点“返回赛道”重新进入赛道。没有自动限时。',
    'help.other': 'C 切换视角，R 重新开始，Esc / P 暂停。手机按钮支持同时按住加速、侧滚和喷气；横屏视野更宽。',
    'help.tip': '先加速，短按喷气 0.5～1 秒，空中轻点 Q / E 调平侧倾。着陆前让四轮对准路面。',
    'help.disclaimer': '这是以飞行跑车为灵感的街机物理模拟。吸附、气体补给与损伤数值为游戏设计。',
    'help.done': '明白，准备出发 →',
    'fatal.start': '无法启动 3D 画面：', 'fatal.help': '请使用支持 WebGL 2 的近期 Chrome、Edge 或 Safari，并开启浏览器硬件加速。',
    'fatal.context': '图形上下文已断开，请刷新页面重试。',
  },
  en: {
    'page.title': 'APEX / Flight Lab',
    'page.description': 'APEX Flight Lab: six 3D stunt courses, four test vehicles, jet-powered barrel rolls and live vehicle damage. Play on desktop or mobile.',
    'scene.label': '3D stunt driving course', 'brand.label': 'APEX Flight Lab',
    'language.label': '切换到中文', 'sound.label': 'Toggle sound', 'sound.on': 'Sound On', 'sound.off': 'Sound Off',
    'fullscreen.label': 'Toggle fullscreen', 'fullscreen.title': 'Fullscreen', 'fullscreen.hint': 'Rotate to landscape',
    'eyebrow.program': 'EXPERIMENTAL DRIVING PROGRAM / 06', 'hero.first': 'The ground', 'hero.second': 'is just the start', 'hero.punctuation': '.',
    'hero.intro': 'Open the throttle. Break free of gravity. Find your line across floating roads and inverted highways.',
    'hero.vehicle': 'FOUR TEST VEHICLES / LIVE DYNAMICS', 'hero.features': 'Underbody jets · Active adhesion · Real-time damage',
    'tracks.title': 'Select proving ground', 'tracks.count': '06 LOCATIONS', 'tracks.length': 'Course length', 'tracks.best': 'Local best',
    'vehicle.label': 'Test vehicle', 'vehicle.roadster': 'R-01 · Jet Roadster', 'vehicle.coupe': 'C-02 · GT Coupe',
    'vehicle.rally': 'R-03 · Rally Sport', 'vehicle.prototype': 'P-04 · Track Prototype',
    'vehicle.note': '{mass} kg · {acceleration} m/s² acceleration · {speed} km/h top speed',
    'quality.label': 'Graphics', 'quality.auto': 'Auto', 'quality.low': 'Low', 'quality.medium': 'Balanced',
    'quality.high': 'High', 'quality.ultra': 'Ultra · 4K shadows',
    'quality.note.low': 'Lightweight scenes · Mobile friendly', 'quality.note.medium': 'Dynamic shadows · Balanced performance',
    'quality.note.high': 'Detailed materials · Ambient occlusion · Soft bloom', 'quality.note.ultra': 'Maximum detail · 4K shadows · High-precision occlusion',
    'motionBlur.label': 'Motion blur', 'motionBlur.note': 'Builds with speed; optional',
    'start': 'Start driving', 'start.loading': 'Preparing the course…', 'controls.help': 'Controls ↗',
    'controls.accelerate': 'Throttle', 'controls.brake': 'Brake', 'controls.steer': 'Steer', 'controls.roll': 'Roll',
    'controls.jet': 'Underbody jets', 'controls.retry': 'Retry', 'controls.space': 'SPACE', 'controls.arrows': 'or arrow keys',
    'footer.independent': 'Independent stunt game · Not affiliated with Tesla', 'footer.gpu': 'WEBGL / GPU ACCELERATED',
    'hud.running': 'VEHICLE TELEMETRY / TEST IN PROGRESS', 'hud.time': 'Time', 'hud.score': 'Score', 'hud.pause': 'Pause',
    'hud.fuel': 'Jet reserve', 'hud.integrity': 'Vehicle integrity', 'hud.minimap': 'Course position map', 'hud.route': 'ROUTE TELEMETRY',
    'gear.label': 'GEAR', 'gear.drive': 'D', 'gear.neutral': 'N', 'grip.label': 'GRIP',
    'magnet.on': 'Adhesion On', 'magnet.off': 'Adhesion Off', 'camera.0': 'Chase', 'camera.1': 'Wide chase', 'camera.2': 'Close chase',
    'mode.jet': 'Jets firing', 'mode.air': 'Free flight', 'mode.ground': 'Ground driving', 'mode.inverted': 'Inverted driving',
    'mode.adhesion': 'Adhesion active', 'mode.roll': 'Roll {value}°', 'mode.explore': 'Free exploration', 'recover': 'Return to track', 'platform.warning': 'Platform vanishes in {seconds}s',
    'touch.left': 'Steer left A', 'touch.right': 'Steer right D', 'touch.rollLeft': 'Roll left Q', 'touch.rollRight': 'Roll right E',
    'touch.rollLeft.short': 'Q ROLL', 'touch.rollRight.short': 'E ROLL', 'touch.throttle': 'Throttle ↑',
    'touch.jet': 'JETS', 'touch.hold': 'HOLD TO FLY',
    'pause.label': 'Simulation paused', 'pause.eyebrow': 'SIMULATION PAUSED', 'pause.title': 'Take a breath.',
    'pause.tip': 'A / D steer. Q / E roll left or right. Release the jets and level the car before landing, with your tyres facing the road.',
    'pause.resume': 'Resume driving', 'pause.restart': 'Restart run', 'pause.exit': 'Back to proving grounds',
    'result.label': 'Run results', 'result.eyebrow': 'POST-RUN ANALYSIS', 'result.success': 'Test complete.',
    'result.failure': 'Next time, fly further.', 'result.newRecord': '↗ NEW LOCAL BEST', 'result.score': 'Total run score',
    'result.time': 'Run time', 'result.flips': 'Barrel rolls', 'result.airtime': 'Air time', 'result.speed': 'Top speed',
    'result.damageTitle': 'Vehicle damage report', 'result.integrity': '{value}% integrity', 'result.damage': '{value}% damage',
    'result.note': 'Earn points for progress, airtime, rolls and clean landings. Collisions cost points. Damage uses a game simulation model.',
    'result.retry': 'Fly again', 'result.choose': 'Change course',
    'damage.body': 'Body', 'damage.suspension': 'Suspension', 'damage.battery': 'Battery', 'damage.thrusters': 'Thrusters',
    'unit.seconds': 's', 'unit.times': 'rolls',
    'help.close': 'Close controls', 'help.eyebrow': 'PILOT BRIEFING', 'help.title': 'Your first flight.',
    'help.drive': 'W / ↑ accelerate. S / ↓ brake. A / D or ← / → steer.',
    'help.roll': 'Q / E roll the car left or right in the air. Hold SPACE to fire the underbody jets along the car’s upward axis. Rolling redirects their thrust sideways. Road contact, takeoff inertia and air damping control pitch.',
    'help.magnet': 'M toggles adhesion assistance for loops and inverted roads. Firing the jets detaches the car. Jet reserve refills after landing.',
    'help.platform': 'The Reveal: orange platforms begin a countdown when you approach, then disappear. Watch the timer, fire your jets early and clear the gap.',
    'help.explore': 'You can explore outside the course. A run ends only when you cross the actual finish gate. If you miss it, keep driving or press T / Return to track to rejoin. There is no automatic time limit.',
    'help.other': 'C changes camera. R restarts. Esc / P pauses. On mobile, hold several on-screen buttons at once to accelerate, roll and fire the jets. Landscape gives a wider view.',
    'help.tip': 'Build speed, fire the jets for 0.5–1 second, then tap Q / E to level your roll. Aim all four tyres at the road before touchdown.',
    'help.disclaimer': 'An arcade physics simulation inspired by flying sports cars. Adhesion, gas refilling and damage values are gameplay mechanics.',
    'help.done': 'Understood. Ready to drive →',
    'fatal.start': 'Unable to start the 3D renderer: ', 'fatal.help': 'Use a recent WebGL 2 capable Chrome, Edge or Safari, with browser hardware acceleration enabled.',
    'fatal.context': 'The graphics context was lost. Refresh the page to try again.',
  },
};

let language = 'zh';
try { const stored = localStorage.getItem('apex-language'); if (stored === 'en' || stored === 'zh') language = stored; } catch {}

export const getLanguage = () => language;

export function t(key, params = {}) {
  const template = dictionaries[language][key] ?? dictionaries.zh[key] ?? String(key);
  return template.replace(/\{(\w+)\}/g, (match, name) => params[name] == null ? match : String(params[name]));
}

export function setLanguage(next) {
  language = next === 'en' ? 'en' : 'zh';
  try { localStorage.setItem('apex-language', language); } catch {}
  if (typeof document !== 'undefined') applyTranslations(document);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('apex-language-change', { detail: { language } }));
  return language;
}

export function applyTranslations(root = document) {
  const apply = element => {
    if (element.dataset.i18n) element.textContent = t(element.dataset.i18n);
    if (element.dataset.i18nAria) element.setAttribute('aria-label', t(element.dataset.i18nAria));
    if (element.dataset.i18nTitle) element.setAttribute('title', t(element.dataset.i18nTitle));
  };
  if (root.nodeType === 1) apply(root);
  root.querySelectorAll('[data-i18n], [data-i18n-aria], [data-i18n-title]').forEach(apply);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = t('page.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('page.description'));
    const button = document.getElementById('language');
    if (button) { button.textContent = language === 'zh' ? 'EN' : '中文'; button.setAttribute('aria-label', t('language.label')); button.title = t('language.label'); }
  }
}

const englishTracks = {
  reveal: { name: 'The Reveal', description: 'A floating course with missing road sections. Orange platforms count down as you approach, then vanish. Use your jets to cross the gaps and land cleanly.', difficulty: 'NEW COURSE', subtitle: 'THE REVEAL' },
  proving: { name: 'Desert Proving Ground', description: 'Wide straights, rolling roads and a small jump. Practise your jets and smooth landings.', difficulty: 'ROOKIE', subtitle: 'DESERT PROVING GROUND' },
  loop: { name: 'Skyline Loop', description: 'Take on a full vertical loop, then clear a broken bridge. Maintain your speed or enable adhesion assistance.', difficulty: 'ADVANCED', subtitle: 'SKYLINE LOOP' },
  inverted: { name: 'Inverted Highway', description: 'Drive upside down beneath an elevated road, then ride its rolling bridges. Adhesion helps you hold the ceiling.', difficulty: 'CHALLENGE', subtitle: 'INVERTED HIGHWAY' },
  lunar: { name: 'Lunar Expedition', description: 'A low-gravity test course. Long flights and softer descents offer space to practise consecutive rolls.', difficulty: 'LOW GRAVITY', subtitle: 'LUNAR EXPEDITION' },
  extreme: { name: 'Zero Limit', description: 'Broken bridges, a giant loop and elevated inverted roads. Manage your jet reserve and make every landing count.', difficulty: 'EXPERT', subtitle: 'ZERO LIMIT' },
};

export function trackText(track) {
  const id = typeof track === 'string' ? track : track?.id;
  const original = typeof track === 'object' && track ? track : {};
  if (language === 'en') return { name: original.name || id, description: original.description || '', difficulty: original.difficulty || '', subtitle: original.subtitle || '', ...englishTracks[id] };
  if (id === 'reveal') return { name: '悬空发布场', description: '悬空断续跑道，橙色平台接近后倒计时消失。用喷气跨越断口并平稳着陆。', difficulty: '新地图', subtitle: 'THE REVEAL' };
  return { name: original.name || id, description: original.description || '', difficulty: original.difficulty || '', subtitle: original.subtitle || '' };
}

const englishEvents = {
  '试车就绪': 'Ready for testing', '护栏擦碰 · 车身受损': 'Guardrail scrape · Body damage',
  '推进器点火': 'Jets ignited', '车辆严重损坏': 'Critical vehicle damage', '测试完成': 'Test complete',
  '测试时间结束': 'Test time expired', '偏离试验场': 'Outside the proving ground',
  '坠落 · 撞击地面': 'Fall · Ground impact', '坠落 · 测试终止': 'Fall · Test terminated',
  '撞击桥底': 'Bridge underside impact', '护栏撞击': 'Guardrail impact', '撞击断桥边缘': 'Broken bridge edge impact',
  '翻覆事故 · 车顶着地': 'Rollover · Roof impact', '侧翻事故 · 车身着地': 'Rollover · Side impact',
  '精准着陆 +250': 'Clean landing +250', '硬着陆 · 检查车辆损伤': 'Hard landing · Check vehicle damage', '着陆成功': 'Touchdown',
  '空中横滚 +600': 'Barrel roll +600', '连续横滚 +600': 'Consecutive roll +600',
  '空中翻转 +600': 'Aerial flip +600', '连续翻转 +600': 'Consecutive flip +600',
  '平台消失': 'Platform vanished', '平台已消失': 'Platform vanished', '平台崩塌': 'Platform collapsed',
  '悬空平台消失': 'Floating platform vanished', '平台倒计时启动': 'Platform countdown started',
  '前方平台即将消失 · 准备喷气': 'Platform ahead will vanish · Get ready to fire jets',
  '平台消失 · 保持飞行': 'Platform vanished · Keep flying',
  '测试完成 · 穿过终点门': 'Test complete · Finish gate crossed',
  '已返回最近的安全路面': 'Returned to the nearest safe road',
  '地面翻覆事故': 'Ground rollover', '地面撞击过重': 'Severe ground impact',
  '地面硬着陆 · 可继续探索': 'Hard ground landing · Continue exploring',
  '已进入自由探索': 'Free exploration started',
  '撞击场景障碍': 'Scenery collision',
};

export function eventText(rawZh) {
  const raw = rawZh == null ? '' : String(rawZh);
  if (language === 'zh' || !raw) return raw;
  if (englishEvents[raw]) return englishEvents[raw];
  const checkpoint = raw.match(/^检查点\s*(\d+)\s*\/\s*(\d+)$/);
  if (checkpoint) return `Checkpoint ${checkpoint[1]} / ${checkpoint[2]}`;
  if (raw.endsWith(' · 严重碰撞')) return `${eventText(raw.slice(0, -7))} · Severe collision`;
  const countdown = raw.match(/平台.*?(\d+(?:\.\d+)?)\s*(?:秒|s)/);
  if (countdown) return t('platform.warning', { seconds: countdown[1] });
  return raw;
}
