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

const FORBIDDEN_WORDS = /展现|体现候选人|出色|深厚|优秀|自洽|靠谱可信/;

let errors = [];
const seenIds = new Set();
const cardCounts = {};
const cardApCounts = {};
const enCounts = {};
const studyCounts = {};
const studyPlainCounts = {};

function checkForbidden(text, label) {
  if (typeof text !== 'string') return;
  const m = text.match(FORBIDDEN_WORDS);
  if (m) {
    errors.push(`[评价词违规] ${label} 包含禁止词 '${m[0]}': "${text.slice(0, 30)}..."`);
  }
  if (text.includes('$$')) {
    errors.push(`[LaTeX违规] ${label} 包含 '$$'`);
  }
  const latexM = text.match(/\\[a-zA-Z]+/);
  if (latexM) {
    errors.push(`[LaTeX违规] ${label} 包含 LaTeX 指令 '${latexM[0]}'`);
  }
}

// Check raw files for $$
for (const file of dataFiles) {
  const raw = fs.readFileSync(path.join(dataDir, file), 'utf-8');
  if (raw.includes('$$')) {
    errors.push(`[LaTeX违规] 文件 ${file} 包含 '$$'`);
  }
}

console.log('\n=== 正在校验公司元数据 (companies.js) ===');
if (companies.length !== 8) {
  errors.push(`公司数量应为 8，实际为 ${companies.length}`);
}

for (const comp of companies) {
  const { slug, name, short, role, location, salary, match, about, duties, requirements, whyFit, concerns, study, plain } = comp;
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

  // 校验通俗版 (plain)
  if (!plain || typeof plain !== 'object') {
    errors.push(`公司 ${slug} 缺少 plain 对象`);
  } else {
    if (!plain.about || typeof plain.about !== 'string' || plain.about.trim() === '') {
      errors.push(`公司 ${slug} plain.about 为空`);
    } else {
      checkForbidden(plain.about, `公司 ${slug} plain.about`);
    }

    if (!plain.roleInOneLine || typeof plain.roleInOneLine !== 'string' || plain.roleInOneLine.trim() === '') {
      errors.push(`公司 ${slug} plain.roleInOneLine 为空`);
    } else {
      checkForbidden(plain.roleInOneLine, `公司 ${slug} plain.roleInOneLine`);
    }

    if (!Array.isArray(plain.duties)) {
      errors.push(`公司 ${slug} plain.duties 必须为数组`);
    } else if (plain.duties.length !== duties.length) {
      errors.push(`公司 ${slug} plain.duties 长度 (${plain.duties.length}) 与 duties 长度 (${duties.length}) 不一致`);
    } else {
      plain.duties.forEach((d, i) => {
        if (!d || typeof d !== 'string' || d.trim() === '') {
          errors.push(`公司 ${slug} plain.duties[${i}] 为空`);
        } else {
          checkForbidden(d, `公司 ${slug} plain.duties[${i}]`);
        }
      });
    }

    if (!Array.isArray(plain.requirements)) {
      errors.push(`公司 ${slug} plain.requirements 必须为数组`);
    } else if (plain.requirements.length !== requirements.length) {
      errors.push(`公司 ${slug} plain.requirements 长度 (${plain.requirements.length}) 与 requirements 长度 (${requirements.length}) 不一致`);
    } else {
      plain.requirements.forEach((r, i) => {
        if (!r || typeof r !== 'string' || r.trim() === '') {
          errors.push(`公司 ${slug} plain.requirements[${i}] 为空`);
        } else {
          checkForbidden(r, `公司 ${slug} plain.requirements[${i}]`);
        }
      });
    }

    if (!Array.isArray(plain.whyFit) || plain.whyFit.length === 0) {
      errors.push(`公司 ${slug} plain.whyFit 为空`);
    } else {
      plain.whyFit.forEach((w, i) => checkForbidden(w, `公司 ${slug} plain.whyFit[${i}]`));
    }

    if (!Array.isArray(plain.concerns) || plain.concerns.length === 0) {
      errors.push(`公司 ${slug} plain.concerns 为空`);
    } else {
      plain.concerns.forEach((c, i) => checkForbidden(c, `公司 ${slug} plain.concerns[${i}]`));
    }
  }

  // 校验 study 中的 plainNote
  let sTotal = 0;
  let sPlain = 0;
  const allStudyItems = [...(study && study.must ? study.must : []), ...(study && study.nice ? study.nice : [])];
  for (const item of allStudyItems) {
    sTotal++;
    if (!item.plainNote || typeof item.plainNote !== 'string' || item.plainNote.trim() === '') {
      errors.push(`公司 ${slug} 考点 '${item.topic}' 缺少 plainNote`);
    } else {
      const len = item.plainNote.trim().length;
      if (len < 30 || len > 140) {
        errors.push(`公司 ${slug} 考点 '${item.topic}' plainNote 字数不合规 (${len} 字，要求 30–140 字)`);
      }
      checkForbidden(item.plainNote, `公司 ${slug} 考点 '${item.topic}' plainNote`);
      sPlain++;
    }
  }
  studyCounts[slug] = sTotal;
  studyPlainCounts[slug] = sPlain;
}

console.log('\n=== 正在校验闪卡数据 (cards-*.js) ===');
const allDecks = ['common', ...companies.map(c => c.slug)];

for (const deckKey of allDecks) {
  const deckCards = cards[deckKey];
  if (!Array.isArray(deckCards)) {
    errors.push(`缺失卡片卡组: ZDY_CARDS['${deckKey}']`);
    continue;
  }

  cardCounts[deckKey] = deckCards.length;
  cardApCounts[deckKey] = 0;
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

    // 校验通俗版字段: qp, ap, tipp
    if (!card.qp || typeof card.qp !== 'string' || card.qp.trim() === '') {
      errors.push(`[${deckKey}] 卡片 ${card.id} 缺少 qp`);
    } else {
      const qpLen = card.qp.trim().length;
      if (qpLen < 20 || qpLen > 60) {
        errors.push(`[${deckKey}] 卡片 ${card.id} qp 字数不合规 (${qpLen} 字，要求 20–60 字)`);
      }
      checkForbidden(card.qp, `[${deckKey}] 卡片 ${card.id} qp`);
    }

    if (!card.ap || typeof card.ap !== 'string' || card.ap.trim() === '') {
      errors.push(`[${deckKey}] 卡片 ${card.id} 缺少 ap`);
    } else {
      const apLen = card.ap.trim().length;
      if (apLen < 120 || apLen > 300) {
        errors.push(`[${deckKey}] 卡片 ${card.id} ap 字数不合规 (${apLen} 字，要求 120–300 字)`);
      }
      if (!card.ap.includes('**一句话说白了**') || !card.ap.includes('**打个比方**') || !card.ap.includes('**面试就这么说**')) {
        errors.push(`[${deckKey}] 卡片 ${card.id} ap 必须包含「**一句话说白了**」「**打个比方**」「**面试就这么说**」三个标记`);
      }
      checkForbidden(card.ap, `[${deckKey}] 卡片 ${card.id} ap`);
      cardApCounts[deckKey]++;
    }

    if (!card.tipp || typeof card.tipp !== 'string' || card.tipp.trim() === '') {
      errors.push(`[${deckKey}] 卡片 ${card.id} 缺少 tipp`);
    } else {
      const tippLen = card.tipp.trim().length;
      if (tippLen < 20 || tippLen > 80) {
        errors.push(`[${deckKey}] 卡片 ${card.id} tipp 字数不合规 (${tippLen} 字，要求 20–80 字)`);
      }
      checkForbidden(card.tipp, `[${deckKey}] 卡片 ${card.id} tipp`);
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

console.log('\n--------------------------------------------------------------------------------');
console.log('数据覆盖度与通俗版统计表:');
console.log('--------------------------------------------------------------------------------');
console.log('| 卡组 Slug           | 闪卡数 (有 ap / 总数) | 英文题 (最低) | 补习清单 (有 plain / 总数) |');
console.log('|---------------------|---------------------|--------------|--------------------------|');
let totalCards = 0;
let totalAp = 0;
for (const deckKey of allDecks) {
  const count = cardCounts[deckKey] || 0;
  const apCount = cardApCounts[deckKey] || 0;
  const enCount = enCounts[deckKey] || 0;
  const minEn = MIN_EN_CARDS[deckKey] || 0;
  const sTotal = studyCounts[deckKey] !== undefined ? studyCounts[deckKey] : '-';
  const sPlain = studyPlainCounts[deckKey] !== undefined ? studyPlainCounts[deckKey] : '-';
  const sStr = sTotal === '-' ? '       -        ' : `${String(sPlain).padStart(2)} / ${String(sTotal).padEnd(2)} 项`;
  totalCards += count;
  totalAp += apCount;
  console.log(`| ${deckKey.padEnd(19)} | ${String(apCount).padStart(3)} / ${String(count).padEnd(3)} 张        | ${String(enCount).padStart(3)} / min ${String(minEn).padEnd(3)} | ${sStr.padEnd(24)} |`);
}
console.log('--------------------------------------------------------------------------------');
console.log(`总卡片数: ${totalCards} 张 (有 ap: ${totalAp} 张, 唯一 ID: ${seenIds.size})\n`);

if (errors.length > 0) {
  console.error(`=== 校验失败，共发现 ${errors.length} 个错误: ===`);
  for (const err of errors.slice(0, 30)) {
    console.error(`  - ${err}`);
  }
  if (errors.length > 30) {
    console.error(`  ... 还有 ${errors.length - 30} 个错误未展示`);
  }
  process.exit(1);
} else {
  console.log('🎉 所有数据校验（包含通俗版字段与规则）全部通过！(Exit 0)');
  process.exit(0);
}
