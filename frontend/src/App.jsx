import { useState, useEffect } from 'react'
import JSZip from 'jszip'

export default function App() {
  const [ageOk, setAgeOk] = useState(localStorage.getItem('ageOk')==='1')
  const [phrase, setPhrase] = useState('птица летит на фоне дома')
  const [translated, setTranslated] = useState([])
  const [selectedTags, setSelectedTags] = useState(['bird','flying'])
  const [negativeTags, setNegativeTags] = useState([])
  const [negInput, setNegInput] = useState('')
  const [sources, setSources] = useState({ 'rule34.xxx': true, 'gelbooru.com': true, 'danbooru.donmai.us': false })
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState(null)
  const [showNSFW, setShowNSFW] = useState(true)
  const [lightbox, setLightbox] = useState(null)
  const [tagSearch, setTagSearch] = useState('')
  const [tagResults, setTagResults] = useState([])
  const [qualityInfo, setQualityInfo] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [downloading, setDownloading] = useState(false)

  useEffect(()=>{
    if (!tagSearch) { setTagResults([]); return }
    fetch(`/api/tags?q=${encodeURIComponent(tagSearch)}`).then(r=>r.json()).then(setTagResults)
  },[tagSearch])

  const translate = async () => {
    if (!phrase.trim()) return
    const res = await fetch('/api/translate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phrase })
    })
    const data = await res.json()
    setTranslated(data.tags)
  }

  const addTag = (t) => {
    const tag = (typeof t === 'string' ? t : t.tag).replace('#','')
    if (!selectedTags.includes(tag)) setSelectedTags([...selectedTags, tag])
  }
  const removeTag = (t) => setSelectedTags(selectedTags.filter(x=>x!==t))
  const addNeg = () => {
    if (!negInput.trim()) return
    const t = negInput.trim().replace(/^-/,'')
    if (!negativeTags.includes(t)) setNegativeTags([...negativeTags, t])
    setNegInput('')
  }

  const doSearch = async () => {
    if (!selectedTags.length) return alert('Выбери хотя бы один тег')
    setLoading(true)
    try {
      const srcList = Object.entries(sources).filter(([k,v])=>v).map(([k])=>k).join(',')
      const params = new URLSearchParams({
        tags: selectedTags.join(' '),
        exclude: negativeTags.join(' '),
        sources: srcList
      })
      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      if (data.error) alert(data.error)
      else {
        setPosts(data.posts || [])
        setMeta(data)
        setSelectedIds(new Set())
      }
    } catch(e) { console.error(e); alert('Ошибка сети') }
    setLoading(false)
  }

  const toggleSelect = (id) => {
    const next = new Set(selectedIds)
    if(next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }
  const selectAll = () => setSelectedIds(new Set(posts.map(p=>p.id)))
  const clearSelect = () => setSelectedIds(new Set())

  // Bulk download: server-side ZIP via /api/zip (обходит CORS) + fallback JSZip на клиенте
  const downloadSelectedZip = async () => {
    const toDownload = posts.filter(p=>selectedIds.size?selectedIds.has(p.id):true)
    if(!toDownload.length) return alert('Нет выбранных')
    if(toDownload.length>60) return alert('Макс 60 за раз — выбери меньше')
    setDownloading(true)
    try{
      // пробуем серверный ZIP (работает даже с CORS)
      const res = await fetch('/api/zip', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ posts: toDownload.map(p=>({file_url:p.file_url, id:p.id})) })
      })
      if(res.ok){
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href=url; a.download=`booru_${selectedTags.join('_')||'download'}.zip`; a.click()
        URL.revokeObjectURL(url)
      } else {
        // fallback: клиентский JSZip через прокси
        const zip = new JSZip()
        for(let i=0;i<toDownload.length;i++){
          const p=toDownload[i]
          try{
            const r = await fetch(`/api/image-proxy?url=${encodeURIComponent(p.file_url)}`)
            if(!r.ok) continue
            const buf = await r.arrayBuffer()
            const ext = (p.file_url.split('.').pop()||'jpg').split('?')[0].slice(0,4)
            zip.file(`${String(i+1).padStart(3,'0')}_${p.id}.${ext}`, buf)
          }catch{}
        }
        const blob = await zip.generateAsync({type:'blob'})
        const url = URL.createObjectURL(blob)
        const a=document.createElement('a'); a.href=url; a.download=`booru_${Date.now()}.zip`; a.click()
        URL.revokeObjectURL(url)
      }
    }catch(e){ alert('Ошибка скачивания: '+e.message)}
    setDownloading(false)
  }

  const downloadSingle = async (p) => {
    try{
      const r = await fetch(`/api/image-proxy?url=${encodeURIComponent(p.file_url)}`)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a=document.createElement('a'); a.href=url; a.download=p.file_url.split('/').pop().split('?')[0]||'image.jpg'; a.click()
      URL.revokeObjectURL(url)
    }catch{
      window.open(p.file_url,'_blank')
    }
  }

  const toggleSource = (k) => setSources({...sources, [k]: !sources[k]})

  if (!ageOk) {
    return (
      <div style={{minHeight:'100vh', display:'grid', placeItems:'center', padding:20, background:'radial-gradient(800px 600px at 50% 0%, #1a1030, #0b0b12)'}}>
        <div style={{maxWidth:560, background:'#14141f', border:'1px solid #242438', borderRadius:20, padding:32, textAlign:'center'}}>
          <div style={{fontSize:48}}>🔞</div>
          <h1 style={{fontSize:28, fontWeight:800, margin:'10px 0'}}>Тебе есть 18 лет?</h1>
          <p style={{color:'#9aa0b5', lineHeight:1.6}}>Приложение агрегирует изображения с открытых борд (включая 18+). Доступ только для совершеннолетних. Нажимая «Да», ты подтверждаешь возраст.</p>
          <div style={{display:'flex', gap:12, justifyContent:'center', marginTop:22}}>
            <button className="btn" onClick={()=>{localStorage.setItem('ageOk','1'); setAgeOk(true)}} style={{flex:1}}>Да, мне 18+ — войти</button>
            <button className="btn-ghost" style={{padding:'10px 18px', borderRadius:10}} onClick={()=>location.href='https://google.com'}>Нет</button>
          </div>
          <p style={{fontSize:12, color:'#6b7280', marginTop:14}}>Ты сам контролируешь фильтры и отрицательные теги. Запрещённый законом контент (CSAM) блокируется на уровне сервера — остальное на твоё усмотрение.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <header style={{position:'sticky', top:0, zIndex:20, background:'rgba(11,11,18,0.92)', backdropFilter:'blur(12px)', borderBottom:'1px solid #242438'}}>
        <div style={{maxWidth:1400, margin:'0 auto', padding:'12px 20px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:36,height:36, borderRadius:10, background:'linear-gradient(135deg,#ff3b6e,#7c5cff)', display:'grid', placeItems:'center', fontWeight:800}}>B</div>
            <div>
              <div style={{fontWeight:800, lineHeight:1}}>BOORU AGGREGATOR</div>
              <div style={{fontSize:11, color:'#9aa0b5', letterSpacing:1}}>238 ТЕГОВ (18+ ВКЛЮЧЕНО) × ДЕДУПЛИКАЦИЯ</div>
            </div>
          </div>
          <div style={{marginLeft:'auto', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
            <label style={{display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#9aa0b5'}}>
              <input type="checkbox" checked={showNSFW} onChange={e=>setShowNSFW(e.target.checked)} /> Показывать NSFW
            </label>
            <button className="btn" style={{padding:'8px 14px', borderRadius:10, background:'linear-gradient(135deg,#00d9ff,#7c5cff)'}} onClick={downloadSelectedZip} disabled={downloading || posts.length===0}>
              {downloading ? '⏳ Собираю ZIP...' : `📦 Скачать ${selectedIds.size?selectedIds.size:posts.length} как ZIP`}
            </button>
            <button className="btn-ghost" style={{padding:'8px 12px', borderRadius:10}} onClick={()=>fetch('/api/tagdb/refresh',{method:'POST'}).then(r=>r.json()).then(d=>alert(d.message))}>🔄 Обновить базу</button>
          </div>
        </div>
      </header>

      <div style={{maxWidth:1400, margin:'0 auto', padding:'20px', display:'grid', gridTemplateColumns:'380px 1fr', gap:20}}>
        <div style={{display:'flex', flexDirection:'column', gap:16, position:'sticky', top:70, alignSelf:'start'}}>
          <div style={{background:'#14141f', border:'1px solid #242438', borderRadius:16, padding:16}}>
            <div style={{fontWeight:700, display:'flex', alignItems:'center', gap:8}}>🧠 Фраза → реальные теги <span style={{fontSize:11, background:'#1e1e32', padding:'3px 8px', borderRadius:999}}>вся база 238</span></div>
            <p style={{fontSize:13, color:'#9aa0b5', margin:'8px 0'}}>Новый принцип: берём <b style={{color:'white'}}>весь список тегов</b> и подставляем под твои слова (раньше наоборот). Пиши по-русски: "большая грудь горничная" → получишь реальные теги.</p>
            <textarea className="input" rows={2} value={phrase} onChange={e=>setPhrase(e.target.value)} placeholder="голая девушка с большой грудью в чулках" style={{resize:'vertical'}} />
            <button className="btn" style={{width:'100%', marginTop:10}} onClick={translate}>✨ Подобрать теги из базы</button>
            {translated.length>0 && (
              <div style={{marginTop:12, display:'flex', flexWrap:'wrap', gap:8}}>
                {translated.map(t=>(
                  <button key={t.tag} onClick={()=>addTag(t.tag)} className="tag" style={{cursor:'pointer', borderColor:'#7c5cff', textAlign:'left'}}>
                    #{t.tag} <span style={{color:'#9aa0b5', fontSize:11}}>{(t.count/1000).toFixed(0)}k</span> {t.ru?.length? <span style={{fontSize:11, color:'#00d9ff'}}> {t.ru.join(',')}</span>:null} <span style={{color:'#00e676'}}>+</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{marginTop:10, fontSize:12, color:'#6b7280'}}>Клик по тегу — добавить в поиск. База включает 18+ (nude, breasts, ass, sex и т.д.).</div>
          </div>

          <div style={{background:'#14141f', border:'1px solid #242438', borderRadius:16, padding:16}}>
            <div style={{fontWeight:700}}>🔍 Поиск по базе (включая русские синонимы)</div>
            <input className="input" style={{marginTop:10}} placeholder="пиши по-русски: грудь, попа, горничная или англ: panties" value={tagSearch} onChange={e=>setTagSearch(e.target.value)} />
            {tagResults.length>0 && (
              <div style={{marginTop:10, maxHeight:260, overflowY:'auto', display:'flex', flexDirection:'column', gap:6}}>
                {tagResults.map(t=>(
                  <button key={t.tag} onClick={()=>addTag(t.tag)} style={{textAlign:'left', background:'#1c1c2b', border:'1px solid #242438', color:'white', padding:'8px 10px', borderRadius:10, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span>#{t.tag} <span style={{fontSize:11, color: t.type==='nsfw'?'#ff3b6e':'#9aa0b5'}}>{t.type==='nsfw'?'🔞':''}</span></span><span style={{color:'#9aa0b5', fontSize:12}}>{t.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{marginTop:10, display:'flex', flexWrap:'wrap', gap:6}}>
              <span style={{fontSize:12, color:'#9aa0b5'}}>Быстрые 18+:</span>
              {['nude','large_breasts','ass','panties','thighhighs','lingerie','ahegao','blowjob','sex','maid'].map(t=>(
                <button key={t} className="tag" style={{fontSize:12, cursor:'pointer', borderColor:'#ff3b6e33'}} onClick={()=>addTag(t)}>#{t}</button>
              ))}
            </div>
          </div>

          <div style={{background:'#14141f', border:'1px solid #242438', borderRadius:16, padding:16}}>
            <div style={{fontWeight:700}}>🏷️ Активные теги ({selectedTags.length}) — ты сам контролируешь</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:8, marginTop:10}}>
              {selectedTags.map(t=>(
                <span key={t} className="tag active">#{t} <button onClick={()=>removeTag(t)} style={{background:'rgba(0,0,0,0.2)', border:'none', color:'white', width:18, height:18, borderRadius:999, cursor:'pointer'}}>×</button></span>
              ))}
              {selectedTags.length===0 && <span style={{fontSize:13, color:'#6b7280'}}>Пусто — добавь теги выше</span>}
            </div>
            <div style={{fontWeight:700, marginTop:16}}>🚫 Отрицательные теги — исключить (твой личный фильтр)</div>
            <p style={{fontSize:12, color:'#9aa0b5', margin:'4px 0'}}>Раньше были жёсткие ограничения — убрал. Теперь только юридический минимум (loli/shota/childporn) блокируется, остальное ты решаешь сам через эти минусы.</p>
            <div style={{display:'flex', gap:8, marginTop:8}}>
              <input className="input" placeholder="например: 3d, lowres, censored" value={negInput} onChange={e=>setNegInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addNeg()} />
              <button className="btn-ghost" onClick={addNeg} style={{padding:'10px 14px', borderRadius:10, whiteSpace:'nowrap'}}>Добавить</button>
            </div>
            <div style={{display:'flex', flexWrap:'wrap', gap:8, marginTop:10}}>
              {negativeTags.map(t=>(
                <span key={t} className="tag negative">-{t} <button onClick={()=>setNegativeTags(negativeTags.filter(x=>x!==t))} style={{background:'transparent', border:'none', color:'#ff6b6a', cursor:'pointer'}}>×</button></span>
              ))}
              {negativeTags.length===0 && <span style={{fontSize:12, color:'#6b7280'}}>пока пусто</span>}
            </div>
          </div>

          <div style={{background:'#14141f', border:'1px solid #242438', borderRadius:16, padding:16}}>
            <div style={{fontWeight:700}}>🌐 Источники (Rule34 теперь с ключом)</div>
            <p style={{fontSize:12, color:'#9aa0b5', margin:'6px 0'}}>Rule34.xxx / Gelbooru теперь требуют API-ключ. Без ключа покажет демо. Добавь ключи в <code>backend/.env</code> чтобы тянуть реальные фото.</p>
            {Object.entries(sources).map(([k,v])=>(
              <label key={k} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1e1e32'}}>
                <input type="checkbox" checked={v} onChange={()=>toggleSource(k)} />
                <span style={{fontSize:13, fontFamily:'JetBrains Mono'}}>{k}</span>
                <span style={{marginLeft:'auto', fontSize:11, padding:'3px 8px', borderRadius:999, background: v ? '#0f2a1a':'#2a1a1a', color: v ? '#00e676':'#ff6b6e'}}>{v?'вкл':'выкл'}</span>
              </label>
            ))}
            <button className="btn" style={{width:'100%', marginTop:12}} onClick={doSearch} disabled={loading}>{loading?'⏳ Загружаю...':'🔍 Искать (дедупликация + лучшее качество)'}</button>
            {meta && <div style={{fontSize:12, color:'#9aa0b5', marginTop:8}}>Найдено: {meta.count} уникальных {meta.note && `— ${meta.note}`}</div>}
          </div>
        </div>

        <div>
          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:14, flexWrap:'wrap'}}>
            <h2 style={{fontSize:20, fontWeight:800}}>Галерея {posts.length?`— ${posts.length}`:''}</h2>
            {posts.length>0 && (
              <>
                <button className="btn-ghost" style={{padding:'6px 12px', borderRadius:999, fontSize:12}} onClick={selectAll}>Выбрать все</button>
                <button className="btn-ghost" style={{padding:'6px 12px', borderRadius:999, fontSize:12}} onClick={clearSelect}>Снять выбор ({selectedIds.size})</button>
                <button className="btn" style={{padding:'8px 14px', borderRadius:10, fontSize:13}} onClick={downloadSelectedZip} disabled={downloading}>{downloading?'⏳...':'📦 Скачать ZIP (выбранные/все)'}</button>
              </>
            )}
            <label style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:8, fontSize:13}}>
              <input type="checkbox" checked={qualityInfo} onChange={e=>setQualityInfo(e.target.checked)} /> Инфо о качестве
            </label>
          </div>

          {posts.length===0 && !loading && (
            <div style={{background:'#14141f', border:'1px dashed #242438', borderRadius:16, padding:40, textAlign:'center'}}>
              <div style={{fontSize:40}}>🖼️</div>
              <div style={{fontWeight:700, marginTop:10}}>Пока пусто</div>
              <p style={{color:'#9aa0b5', marginTop:6}}>Попробуй примеры: "голая горничная с большой грудью", "девушка в чулках ахегао", "попа пляж" → Перевести → Искать → Скачать ZIP одной кнопкой.</p>
              <div style={{display:'flex', gap:10, justifyContent:'center', marginTop:16, flexWrap:'wrap'}}>
                <button className="btn" onClick={()=>{setPhrase('голая горничная с большой грудью'); setTimeout(translate,100)}}>Пример 18+</button>
                <button className="btn-ghost" style={{padding:'10px 18px', borderRadius:10}} onClick={doSearch}>Сразу искать</button>
              </div>
            </div>
          )}

          {loading && <div style={{textAlign:'center', padding:40, color:'#9aa0b5'}}>Загружаю с нескольких борд и убираю дубли…</div>}

          <div className="masonry">
            {posts.map(p=>(
              <div key={p.id} className="card" style={{borderColor: selectedIds.has(p.id)?'#7c5cff':'#242438', borderWidth: selectedIds.has(p.id)?2:1}}>
                <div style={{position:'relative', cursor:'pointer'}} onClick={()=>setLightbox(p)}>
                  <img src={p.preview_url} alt={p.tags.slice(0,3).join(', ')} loading="lazy"
                    style={{width:'100%', display:'block', filter: !showNSFW && p.rating==='e' ? 'blur(18px)' : 'none'}} />
                  <div style={{position:'absolute', top:8, left:8, display:'flex', gap:6}}>
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={()=>toggleSelect(p.id)} onClick={e=>e.stopPropagation()} style={{width:18,height:18}} />
                    <span style={{background:'rgba(0,0,0,0.6)', padding:'4px 8px', borderRadius:999, fontSize:11, border:'1px solid rgba(255,255,255,0.2)'}}>{p.source}</span>
                  </div>
                  {qualityInfo && <div style={{position:'absolute', bottom:8, right:8, background:'rgba(124,92,255,0.9)', padding:'4px 8px', borderRadius:999, fontSize:11, fontWeight:700}}>{p.width}×{p.height}</div>}
                </div>
                <div style={{padding:10}}>
                  <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                    {p.tags.slice(0,6).map(t=>(
                      <span key={t} onClick={()=>addTag(t)} style={{fontSize:11, background:'#1e1e32', border:'1px solid #242438', padding:'3px 7px', borderRadius:999, cursor:'pointer'}}>{t}</span>
                    ))}
                  </div>
                  <div style={{display:'flex', gap:8, marginTop:10}}>
                    <button onClick={()=>downloadSingle(p)} style={{flex:1, background:'#1c1c2b', border:'1px solid #242438', padding:'8px', borderRadius:10, fontSize:13, color:'white', cursor:'pointer'}}>⬇ Скачать</button>
                    <a href={p.file_url} target="_blank" rel="noreferrer" style={{flex:1, textAlign:'center', background:'linear-gradient(135deg,#ff3b6e,#7c5cff)', color:'white', padding:'8px', borderRadius:10, fontSize:13, textDecoration:'none'}}>Открыть</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {lightbox && (
        <div onClick={()=>setLightbox(null)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'grid', placeItems:'center', zIndex:50, padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:900, width:'100%', background:'#14141f', borderRadius:16, overflow:'hidden', border:'1px solid #242438'}}>
            <img src={lightbox.file_url} style={{width:'100%', maxHeight:'75vh', objectFit:'contain', background:'#0b0b12'}} />
            <div style={{padding:14, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
              <span style={{fontWeight:700}}>{lightbox.width}×{lightbox.height} • {lightbox.source}</span>
              <button className="btn" onClick={()=>downloadSingle(lightbox)} style={{marginLeft:'auto'}}>⬇ Скачать</button>
              <a href={lightbox.file_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{padding:'10px 14px', borderRadius:10, textDecoration:'none'}}>Открыть оригинал</a>
              <button className="btn-ghost" style={{padding:'10px 14px', borderRadius:10}} onClick={()=>setLightbox(null)}>Закрыть</button>
            </div>
            <div style={{padding:'0 14px 14px', display:'flex', flexWrap:'wrap', gap:6}}>
              {lightbox.tags.map(t=> <span key={t} style={{fontSize:12, background:'#1e1e32', padding:'5px 9px', borderRadius:999, border:'1px solid #242438'}}>#{t}</span>)}
            </div>
          </div>
        </div>
      )}

      <footer style={{maxWidth:1400, margin:'30px auto 0', padding:'20px', borderTop:'1px solid #1e1e32', color:'#6b7280', fontSize:12, textAlign:'center'}}>
        Ты контролируешь отрицательные теги сам. Юридический минимум (CSAM) остаётся. Скачивание ZIP — одной кнопкой сверху. Для реальных Rule34 фото добавь API-ключи в backend/.env
      </footer>
    </div>
  )
}
