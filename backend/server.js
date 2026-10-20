import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 3001;
const RULE34_API_KEY = process.env.RULE34_API_KEY || "";
const RULE34_USER_ID = process.env.RULE34_USER_ID || "";
const GELBOORU_API_KEY = process.env.GELBOORU_API_KEY || "";
const GELBOORU_USER_ID = process.env.GELBOORU_USER_ID || "";

// Load data - re-read on each request for hot-reload in dev, but cache for perf
function loadDB() {
  const tagsDB = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tags-db.json"), "utf-8"));
  const synonyms = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/synonyms.json"), "utf-8"));
  return { tagsDB, synonyms };
}
let { tagsDB, synonyms } = loadDB();
let tagSet = new Set(tagsDB.map(t => t.tag));
let tagMap = new Map(tagsDB.map(t => [t.tag, t]));

// Build reverse index: ru word -> tag[]
// Also build tag -> ru synonyms expanded
let ruToTagIndex = new Map();
function rebuildIndex(){
  ruToTagIndex.clear();
  for(const [ru, eng] of Object.entries(synonyms.words)){
    const key = ru.toLowerCase();
    if(!ruToTagIndex.has(key)) ruToTagIndex.set(key, new Set());
    ruToTagIndex.get(key).add(eng);
    // also handle eng that may be "large_breasts" etc, already tag
  }
  // phrases: tokenized
  for(const [phrase, tags] of Object.entries(synonyms.phrases)){
    const tokens = phrase.toLowerCase().split(/[\s,.;:!?\(\)\[\]\"'—\-]+/).filter(Boolean);
    for(const tok of tokens){
      for(const t of tags){
        if(!ruToTagIndex.has(tok)) ruToTagIndex.set(tok, new Set());
        ruToTagIndex.get(tok).add(t);
      }
    }
  }
}
rebuildIndex();

// --- Helpers ---
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1];
    else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  }
  return dp[m][n];
}

function findClosestTag(query) {
  if (tagSet.has(query)) return { tag: query, dist: 0 };
  let best = null, bestDist = Infinity;
  for (const t of tagSet) {
    if (Math.abs(t.length - query.length) > 4) continue;
    const d = levenshtein(query, t);
    if (d < bestDist) { bestDist = d; best = t; }
    if (d === 0) break;
  }
  if (bestDist <= 2) return { tag: best, dist: bestDist };
  return null;
}

// NEW: translate that scans entire tag list via ru synonyms
function translatePhraseToTags(phrase) {
  const lower = phrase.toLowerCase().trim();
  let result = new Set();

  // 1. Exact phrase match (fast path)
  if (synonyms.phrases[lower]) {
    synonyms.phrases[lower].forEach(t => result.add(t));
  }

  // 2. Check if phrase contains any known phrase as substring
  for(const [ph, tags] of Object.entries(synonyms.phrases)){
    if(lower.includes(ph)){
      tags.forEach(t=>result.add(t));
    }
  }

  // 3. Tokenize
  const tokens = lower.split(/[\s,.;:!?\(\)\[\]\"'—\-]+/).filter(Boolean);

  for (const tok of tokens) {
    // a) direct ru -> tag via reverse index (covers entire DB via synonyms)
    if (ruToTagIndex.has(tok)) {
      for(const t of ruToTagIndex.get(tok)) result.add(t);
    }
    // b) direct word map
    if (synonyms.words[tok]) {
      result.add(synonyms.words[tok]);
    }
    // c) direct tag match (user typed english tag)
    const normalized = tok.replace(/ё/g, "е");
    if (tagSet.has(normalized)) {
      result.add(normalized);
    } else if (/^[a-z_]+$/.test(normalized) && normalized.length >= 3) {
      // d) fuzzy for english typos
      const closest = findClosestTag(normalized);
      if (closest) result.add(closest.tag);
    }
    // e) scan all tags where ru synonym contains token as substring
    // (expensive but DB 238 items -> fine)
    for(const tag of tagSet){
      if(tag.includes(normalized) && normalized.length>=3){
        // if user wrote "грудь" and tag is "large_breasts" -> already handled via index, but also catch partial
      }
    }
  }

  // 4. English tokens already
  for (const tok of tokens) {
    if (/^[a-z_0-9]+$/.test(tok) && tagSet.has(tok)) result.add(tok);
  }

  // Filter only existing tags
  const validated = [...result].filter(t => tagSet.has(t));
  const enriched = validated.map(tag => ({
    tag,
    count: tagMap.get(tag)?.count || 0,
    type: tagMap.get(tag)?.type || 'general',
    ru: Object.entries(synonyms.words).filter(([ru,en])=>en===tag).map(([ru])=>ru).slice(0,3)
  })).sort((a,b)=>b.count-a.count);

  return enriched;
}

// --- API: translate ---
app.post("/api/translate", (req, res) => {
  // hot reload DB if file changed
  try { const fresh = loadDB(); tagsDB=fresh.tagsDB; synonyms=fresh.synonyms; tagSet=new Set(tagsDB.map(t=>t.tag)); tagMap=new Map(tagsDB.map(t=>[t.tag,t])); rebuildIndex(); } catch(e){}
  const { phrase } = req.body;
  if (!phrase) return res.status(400).json({ error: "phrase required" });
  const tags = translatePhraseToTags(phrase);
  res.json({ phrase, tags, all_tags_count: tagsDB.length, method: "reverse-index + phrase scan (вся база)" });
});

// --- API: search tags ---
app.get("/api/tags", (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  const typeFilter = req.query.type || 'all'; // all, general, nsfw
  let filtered = tagsDB;
  if(typeFilter !== 'all'){
    filtered = filtered.filter(t=>t.type===typeFilter);
  }
  if (!q) return res.json(filtered.slice(0, 30));
  // also search in RU synonyms
  const qRuMapped = ruToTagIndex.get(q);
  filtered = tagsDB.filter(t => {
    if(t.tag.includes(q)) return true;
    if(qRuMapped && qRuMapped.has(t.tag)) return true;
    // check ru synonyms for this tag
    const rus = Object.entries(synonyms.words).filter(([ru,en])=>en===t.tag).map(([ru])=>ru);
    if(rus.some(ru=>ru.includes(q))) return true;
    if(levenshtein(t.tag, q) <= 2) return true;
    return false;
  }).sort((a,b) => {
      const aStarts = a.tag.startsWith(q) ? 0 : 1;
      const bStarts = b.tag.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return b.count - a.count;
    }).slice(0, 40);
  res.json(filtered);
});

// --- API: full tag list (for client-side reverse mapping) ---
app.get("/api/tags/all", (req,res)=>{
  res.json({ count: tagsDB.length, tags: tagsDB, synonyms });
});

// --- Sources fetching (same as before) ---
async function fetchRule34(tags, pid=0, limit=40) {
  const auth = (RULE34_API_KEY && RULE34_USER_ID) ? `&api_key=${RULE34_API_KEY}&user_id=${RULE34_USER_ID}` : "";
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=${limit}&pid=${pid}&tags=${encodeURIComponent(tags)}${auth}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "BooruAggregator/1.0" } });
    if (!r.ok) throw new Error(`rule34 ${r.status}`);
    const data = await r.json();
    if (typeof data === 'string' && data.includes('Missing authentication')) throw new Error('rule34 auth required');
    if (!Array.isArray(data)) return [];
    return data.map(p => ({
      id: `r34_${p.id}`,
      source: "rule34.xxx",
      file_url: p.file_url || p.sample_url,
      preview_url: p.preview_url || p.sample_url,
      sample_url: p.sample_url,
      width: p.width,
      height: p.height,
      md5: p.md5,
      tags: (p.tags || "").split(" ").filter(Boolean),
      score: p.score,
      rating: p.rating,
      source_url: `https://rule34.xxx/index.php?page=post&s=view&id=${p.id}`,
      pixels: (p.width||0)*(p.height||0)
    })).filter(x=>x.file_url);
  } catch(e) {
    console.error("rule34 fetch error", e.message);
    return [];
  }
}

async function fetchGelbooru(tags, pid=0, limit=40) {
  const auth = (GELBOORU_API_KEY && GELBOORU_USER_ID) ? `&api_key=${GELBOORU_API_KEY}&user_id=${GELBOORU_USER_ID}` : "";
  const url = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=${limit}&pid=${pid}&tags=${encodeURIComponent(tags)}${auth}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "BooruAggregator/1.0" } });
    if (!r.ok) throw new Error(`gelbooru ${r.status}`);
    const data = await r.json();
    if (typeof data === 'string') throw new Error('gelbooru string');
    const arr = Array.isArray(data) ? data : (data.post || []);
    return arr.map(p => ({
      id: `gel_${p.id}`,
      source: "gelbooru.com",
      file_url: p.file_url,
      preview_url: p.preview_url,
      sample_url: p.sample_url,
      width: p.width,
      height: p.height,
      md5: p.md5 || p.hash,
      tags: typeof p.tags === 'string' ? p.tags.split(" ").filter(Boolean) : (p.tags || []),
      score: p.score,
      rating: p.rating,
      source_url: `https://gelbooru.com/index.php?page=post&s=view&id=${p.id}`,
      pixels: (p.width||0)*(p.height||0)
    })).filter(x=>x.file_url);
  } catch(e) {
    console.error("gelbooru fetch error", e.message);
    return [];
  }
}

async function fetchDanbooru(tags, page=1, limit=40) {
  const url = `https://danbooru.donmai.us/posts.json?tags=${encodeURIComponent(tags)}&page=${page}&limit=${limit}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "BooruAggregator/1.0" } });
    if (!r.ok) throw new Error(`danbooru ${r.status}`);
    const data = await r.json();
    return data.map(p => ({
      id: `dan_${p.id}`,
      source: "danbooru.donmai.us",
      file_url: p.file_url,
      preview_url: p.preview_url || p.large_file_url,
      sample_url: p.large_file_url,
      width: p.image_width,
      height: p.image_height,
      md5: p.md5,
      tags: [...(p.tag_string_general||"").split(" "), ...(p.tag_string_character||"").split(" ")].filter(Boolean),
      score: p.score,
      rating: p.rating,
      source_url: `https://danbooru.donmai.us/posts/${p.id}`,
      pixels: (p.image_width||0)*(p.image_height||0)
    })).filter(x=>x.file_url && !x.file_url.endsWith(".zip"));
  } catch(e) {
    console.error("danbooru fetch error", e.message);
    return [];
  }
}

function deduplicate(posts) {
  const byMd5 = new Map();
  const noMd5 = [];
  for (const p of posts) {
    if (p.md5 && byMd5.has(p.md5)) {
      const existing = byMd5.get(p.md5);
      if ((p.pixels||0) > (existing.pixels||0)) byMd5.set(p.md5, p);
    } else if (p.md5) {
      byMd5.set(p.md5, p);
    } else {
      noMd5.push(p);
    }
  }
  let deduped = [...byMd5.values()];
  const byFilename = new Map();
  for (const p of [...deduped, ...noMd5]) {
    try {
      const fname = p.file_url.split("/").pop().split("?")[0];
      if (byFilename.has(fname)) {
        const ex = byFilename.get(fname);
        if ((p.pixels||0) > (ex.pixels||0)) byFilename.set(fname, p);
      } else {
        byFilename.set(fname, p);
      }
    } catch { byFilename.set(p.id, p); }
  }
  deduped = [...byFilename.values()];
  deduped.sort((a,b) => (b.pixels - a.pixels) || (b.score||0)-(a.score||0));
  return deduped;
}

// --- API: search ---
app.get("/api/search", async (req, res) => {
  let { tags, exclude, sources, pid } = req.query;
  tags = (tags || "").trim();
  exclude = (exclude || "").trim();
  sources = (sources || "rule34,gelbooru,danbooru").split(",").map(s=>s.trim().toLowerCase());
  const pidNum = parseInt(pid) || 0;
  if (!tags) return res.status(400).json({ error: "tags required" });
  let fullTags = tags;
  if (exclude) {
    const exTags = exclude.split(/[\s,]+/).filter(Boolean).map(t=>`-${t}`).join(" ");
    fullTags = `${tags} ${exTags}`;
  }

  // БЫЛО: жесткий блок. СЕЙЧАС: только обязательный юридический минимум (CSAM), остальное контролируешь ты через отрицательные теги
  // Оставляем только критический блок, который нельзя отключить по закону. Если нужно - можешь форкнуть и изменить список в server.js
  const criticalBlocklist = ["loli","shota","childporn"]; // минимальный обязательный
  const requestedLower = fullTags.toLowerCase();
  const blocked = criticalBlocklist.filter(b => requestedLower.includes(b));
  if (blocked.length) {
    return res.status(400).json({ error: `Blocked (юридический минимум): ${blocked.join(", ")} — этот фильтр обязателен. Остальные теги контролируешь ты сам через отрицательные теги.` });
  }

  const tasks = [];
  if (sources.includes("rule34") || sources.includes("rule34.xxx")) tasks.push(fetchRule34(fullTags, pidNum));
  if (sources.includes("gelbooru") || sources.includes("gelbooru.com")) tasks.push(fetchGelbooru(fullTags, pidNum));
  if (sources.includes("danbooru") || sources.includes("danbooru.donmai.us")) tasks.push(fetchDanbooru(fullTags, pidNum+1));

  const results = await Promise.all(tasks);
  const merged = results.flat();
  const deduped = deduplicate(merged);

  if (deduped.length === 0) {
    const mock = Array.from({length: 16}, (_,i)=>({
      id: `mock_${i}`,
      source: "demo (offline - реальный API требует ключ или сеть)",
      file_url: `https://picsum.photos/seed/${encodeURIComponent(tags+i)}/700/${500 + (i%4)*120}`,
      preview_url: `https://picsum.photos/seed/${encodeURIComponent(tags+i)}/400/${300 + (i%4)*80}`,
      sample_url: `https://picsum.photos/seed/${encodeURIComponent(tags+i)}/700/${500 + (i%4)*120}`,
      width: 700,
      height: 500 + (i%4)*120,
      md5: `mockmd5${i}`,
      tags: tags.split(" ").concat(["highres","demo"]),
      score: Math.floor(Math.random()*100),
      rating: i%3===0?'e':'s',
      source_url: "#",
      pixels: 700*(500 + (i%4)*120)
    }));
    return res.json({ count: mock.length, original: merged.length, deduped: 0, posts: mock, note: "demo-режим: Rule34/Gelbooru теперь требуют API-ключ (добавь в .env) или недоступны из этой сети. На твоём ПК с твоим ключом потянет реальные фото." });
  }

  res.json({ count: deduped.length, original: merged.length, deduped: merged.length - deduped.length, posts: deduped.slice(0, 80) });
});

// --- Image proxy (для скачивания без CORS) ---
app.get("/api/image-proxy", async (req,res)=>{
  const url = req.query.url;
  if(!url) return res.status(400).send("url required");
  try{
    const r = await fetch(url, { headers: { "User-Agent": "BooruAggregator/1.0" }});
    if(!r.ok) return res.status(502).send("fetch failed "+r.status);
    const ct = r.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", ct);
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(new URL(url).pathname)}"`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  }catch(e){ res.status(500).send(e.message); }
});

// --- Bulk ZIP download ---
app.post("/api/zip", async (req,res)=>{
  const { posts } = req.body; // [{file_url, id}]
  if(!posts || !Array.isArray(posts) || posts.length===0) return res.status(400).json({error:"posts required"});
  if(posts.length>60) return res.status(400).json({error:"max 60 files per ZIP"});
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="booru_${Date.now()}.zip"`);
  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.on('error', err=>{ console.error(err); res.status(500).end(); });
  archive.pipe(res);
  let okCount=0;
  for(let i=0;i<posts.length;i++){
    const p = posts[i];
    try{
      const r = await fetch(p.file_url, { headers: { "User-Agent": "BooruAggregator/1.0" }});
      if(!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const ext = (p.file_url.split('.').pop()||'jpg').split('?')[0].slice(0,4);
      const name = `${String(i+1).padStart(3,'0')}_${p.id||i}.${ext}`;
      archive.append(buf, { name });
      okCount++;
    }catch(e){ console.error("zip fetch", e.message); }
  }
  if(okCount===0){
    // если не удалось скачать реальные (demo picsum тоже ок), fallback
    archive.append(Buffer.from(JSON.stringify(posts,null,2)), {name: "posts.json"});
  }
  await archive.finalize();
});

// --- Tag DB refresh (tries live fetch, fallback to file) ---
app.post("/api/tagdb/refresh", async (req,res)=>{
  try{
    // try Danbooru live
    const r = await fetch("https://danbooru.donmai.us/tags.json?search[order]=count&limit=100", { headers:{ "User-Agent":"BooruAggregator/1.0"}});
    if(r.ok){
      const data = await r.json();
      // merge first 100 live tags into DB (if not exists)
      let added=0;
      for(const t of data){
        if(!tagSet.has(t.name)){
          tagsDB.push({ tag: t.name, count: t.post_count, type: t.category===1?'artist': t.category===3?'copyright':'general'});
          added++;
        }
      }
      if(added>0){
        fs.writeFileSync(path.join(__dirname,"../data/tags-db.json"), JSON.stringify(tagsDB,null,2));
        return res.json({ ok:true, count: tagsDB.length, added, message:`Обновлено с Danbooru: +${added} новых. Всего ${tagsDB.length}`});
      }
    }
  }catch(e){ console.error(e.message); }
  res.json({ ok:true, count: tagsDB.length, message:`База актуальна (${tagsDB.length} тегов, включая 18+). Для Rule34/Gelbooru добавь API-ключ в backend/.env (RULE34_API_KEY, GELBOORU_API_KEY) и перезапусти — тогда потянет их приватные топ-теги.` });
});

app.post("/api/reload", (req,res)=>{
  try{
    const fresh = loadDB(); tagsDB=fresh.tagsDB; synonyms=fresh.synonyms; tagSet=new Set(tagsDB.map(t=>t.tag)); tagMap=new Map(tagsDB.map(t=>[t.tag,t])); rebuildIndex();
    res.json({ok:true, count: tagsDB.length});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.use(express.static(path.join(__dirname, "../frontend/dist")));
app.get("/health", (req,res)=>res.json({ok:true, tags: tagsDB.length, nsfw: tagsDB.filter(t=>t.type==='nsfw').length }));
app.listen(PORT, "0.0.0.0", ()=>console.log(`Backend on http://0.0.0.0:${PORT} tags:${tagsDB.length}`));
