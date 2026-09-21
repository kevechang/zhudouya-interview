const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

// Create vm context with window
const sandbox = {
  window: {}
};
sandbox.window = sandbox;
const context = vm.createContext(sandbox);

// Data files to load in order
const dataFiles = [
  'companies.js',
  'cards-common.js',
  'cards-bambu.js',
  'cards-dh.js',
  'cards-yueteng-plan.js',
  'cards-xinyameiyun.js',
  'cards-sunwoda.js',
  'cards-yueteng-buy.js',
  'cards-yueteng-product.js',
  'cards-moluo.js'
];

console.log('=== 正在加载数据文件到沙箱 ===');
for (const file of dataFiles) {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`[ERROR] 数据文件不存在: ${filePath}`);
    process.exit(1);
  }
  const code = fs.readFileSync(filePath, 'utf-8');
  try {
    vm.runInContext(code, context);
    console.log(`✓ 成功载入: ${file}`);
  } catch (err) {
    console.error(`[ERROR] 载入 ${file} 出错:`, err);
    process.exit(1);
  }
}

const companies = sandbox.window.ZDY_COMPANIES;
const cards = sandbox.window.ZDY_CARDS;

if (!Array.isArray(companies)) {
  console.error('[ERROR] ZDY_COMPANIES 不是数组');
  process.exit(1);
}

if (!cards || typeof cards !== 'object') {
  console.error('[ERROR] ZDY_CARDS 不是对象');
  process.exit(1);
}

const ALLOWED_CATS = new Set([
  "自我介绍与动机",
  "专业硬技能",
  "简历追问",
  "情景与案例",
  "行为面试",
  "英语",
  "反问环节"
]);

const MIN_CARDS = {
  "common": 22,
  "bambu": 16,
  "dh": 16,
  "yueteng-plan": 15,
  "xinyameiyun": 15,
  "sunwoda": 12,
  "yueteng-buy": 12,
  "yueteng-product": 12,
  "moluo": 12
};

const MIN_EN_CARDS = {
  "common": 3,
  "bambu": 3,
  "xinyameiyun": 3,
  "sunwoda": 1,
  "moluo": 3
};

let errors = [];
const seenIds = new Set();
const cardCounts = {};
const enCounts = {};

console.log('\n=== 正在校验公司元数据 (companies.js) ===');
if (companies.length !== 8) {
  errors.push(`公司数量应为 8，实际为 ${companies.length}`);
}

for (const comp of companies) {
  const { slug, name, short, role, location, salary, match, about, duties, requirements, whyFit, concerns, study } = comp;
  if (!slug) errors.push(`公司缺少 slug: ${JSON.stringify(comp)}`);
  if (!name) errors.push(`公司 ${slug} 缺少 name`);
  if (!short) errors.push(`公司 ${slug} 缺少 short`);
  if (!role) errors.push(`公司 ${slug} 缺少 role`);
  if (!location) errors.push(`公司 ${slug} 缺少 location`);
  if (!Array.isArray(salary) || salary.length !== 2) errors.push(`公司 ${slug} salary 格式不正确`);
  if (typeof match !== 'number' || match < 1 || match > 5) errors.push(`公司 ${slug} match 评分不合法`);
  if (!about || typeof about !== 'string') errors.push(`公司 ${slug} about 为空`);

  if (!Array.isArray(duties) || duties.length === 0) errors.push(`公司 ${slug} duties 为空`);
  if (!Array.isArray(requirements) || requirements.length === 0) errors.push(`公司 ${slug} requirements 为空`);
  if (!Array.isArray(whyFit) || whyFit.length === 0) errors.push(`公司 ${slug} whyFit 为空`);
  if (!Array.isArray(concerns) || concerns.length === 0) errors.push(`公司 ${slug} concerns 为空`);

  if (!study || !Array.isArray(study.must) || study.must.length === 0) {
    errors.push(`公司 ${slug} study.must 为空`);
  }
}

console.log(`✓ 8 家公司元数据字段完整性校验通过`);

console.log('\n=== 正在校验闪卡数据 (cards-*.js) ===');
const allDecks = ['common', ...companies.map(c => c.slug)];

for (const deckKey of allDecks) {
  const deckCards = cards[deckKey];
  if (!Array.isArray(deckCards)) {
    errors.push(`缺失卡片卡组: ZDY_CARDS['${deckKey}']`);
    continue;
  }

  cardCounts[deckKey] = deckCards.length;
  enCounts[deckKey] = 0;

  for (const card of deckCards) {
    if (!card.id || typeof card.id !== 'string') {
      errors.push(`[${deckKey}] 卡片缺少 id: ${JSON.stringify(card)}`);
    } else {
      if (seenIds.has(card.id)) {
        errors.push(`重复的卡片 id: ${card.id}`);
      }
      seenIds.add(card.id);
    }

    if (!card.cat || !ALLOWED_CATS.has(card.cat)) {
      errors.push(`[${deckKey}] 卡片 ${card.id} 分类 '${card.cat}' 不在 7 个枚举中`);
    }

    if (!card.q || typeof card.q !== 'string' || card.q.trim() === '') {
      errors.push(`[${deckKey}] 卡片 ${card.id} 问题 q 为空`);
    }

    if (!card.a || typeof card.a !== 'string' || card.a.trim() === '') {
      errors.push(`[${deckKey}] 卡片 ${card.id} 答案 a 为空`);
    }

    if (card.en === true || card.cat === '英语') {
      enCounts[deckKey]++;
    }
  }

  const minReq = MIN_CARDS[deckKey] || 0;
  if (deckCards.length < minReq) {
    errors.push(`[${deckKey}] 卡片总数不足: 当前 ${deckCards.length}, 最少需要 ${minReq}`);
  }

  const minEn = MIN_EN_CARDS[deckKey] || 0;
  if (enCounts[deckKey] < minEn) {
    errors.push(`[${deckKey}] 英文题数量不足: 当前 ${enCounts[deckKey]}, 最少需要 ${minEn}`);
  }
}

console.log('\n----------------------------------------');
console.log('卡片数量统计表:');
console.log('----------------------------------------');
console.log('| 卡组 Slug           | 数量 (最低要求) | 英文题 (最低) |');
console.log('|---------------------|----------------|--------------|');
let totalCards = 0;
for (const deckKey of allDecks) {
  const count = cardCounts[deckKey] || 0;
  const enCount = enCounts[deckKey] || 0;
  const minReq = MIN_CARDS[deckKey] || 0;
  const minEn = MIN_EN_CARDS[deckKey] || 0;
  totalCards += count;
  console.log(`| ${deckKey.padEnd(19)} | ${String(count).padStart(3)} / min ${String(minReq).padEnd(5)} | ${String(enCount).padStart(3)} / min ${String(minEn).padEnd(3)} |`);
}
console.log('----------------------------------------');
console.log(`总卡片数: ${totalCards} 张 (唯一 ID 校验数: ${seenIds.size})\n`);

if (errors.length > 0) {
  console.error(`=== 校验失败，共发现 ${errors.length} 个错误: ===`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
} else {
  console.log('🎉 所有数据校验全部通过！(Exit 0)');
  process.exit(0);
}
