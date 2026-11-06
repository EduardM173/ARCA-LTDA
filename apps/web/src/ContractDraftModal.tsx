/**
 * HU-19 (ARCA-20) — ContractDraftModal
 * Modal para crear y editar borradores de contrato vinculados a Personal.
 * Incluye vista previa fidedigna del documento resuelto.
 */
import React,{useEffect,useRef,useState} from 'react';
import {api,Row} from './api';
import {Action,Notice,useData} from './components';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  /** Cuando se pasa, el modal edita ese borrador existente */
  draft?:    Row;
  /** Empleado preseleccionado (opcional) */
  employeeId?: string;
  onClose:   ()=>void;
  onSaved:   ()=>void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ContractDraftModal({draft,employeeId:initEmpId='',onClose,onSaved}:Props){
  const ref=useRef<HTMLDialogElement>(null);

  // Form state
  const [empSearch,setEmpSearch]=useState('');
  const [empPage,setEmpPage]=useState(1);
  const [selectedEmpId,setSelectedEmpId]=useState(draft?.employeeId||initEmpId||'');
  const [templateId,setTemplateId]=useState(draft?.templateId||'');
  const [probationDays,setProbationDays]=useState<number>(draft?.probationDays??90);
  const [refreshSnap,setRefreshSnap]=useState(false);

  // UI state
  const [previewText,setPreviewText]=useState<string|null>(null);
  const [previewMeta,setPreviewMeta]=useState<{templateName:string;templateVersion:number}|null>(null);
  const [previewOpen,setPreviewOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  // Data
  const people  = useData(`employees?page=${empPage}&q=${encodeURIComponent(empSearch)}`,0);
  const tmplData= useData('contracts/templates?status=ACTIVE',0);
  // Legacy templates as fallback
  const legacyTmpl=useData('templates',0);

  // Active templates: HU-18 modern + legacy
  const modernTmpls:Row[]=(tmplData.data||[]).filter((t:Row)=>t.status==='ACTIVE');
  const legacyTmpls:Row[]=(legacyTmpl.data||[]).filter((t:Row)=>t.active);
  const allTemplates=[
    ...modernTmpls.map((t:Row)=>({value:t.id,label:`${t.title} · v${t.version} (HU-18)`})),
    ...legacyTmpls.map((t:Row)=>({value:t.id,label:`${t.name} · v${t.version}`})),
  ];

  useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[]);

  // ─── Preview ───────────────────────────────────────────────────────────────
  async function loadPreview(){
    if(!draft){setError('Guarda el borrador primero para ver la vista previa');return}
    setError('');
    try{
      const data=await api(`contracts/drafts/${draft.id}/preview`);
      setPreviewText(data.text);
      setPreviewMeta({templateName:data.templateName,templateVersion:data.templateVersion});
      setPreviewOpen(true);
    }catch(e:any){setError(e.message||'Error al cargar vista previa')}
  }

  // ─── Save (create or update) ───────────────────────────────────────────────
  async function save(){
    if(!selectedEmpId){setError('Selecciona un funcionario');return}
    if(!templateId){setError('Selecciona una plantilla');return}
    setSaving(true);setError('');
    try{
      if(draft){
        // HU-19 §3 — editar borrador existente
        await api(`contracts/drafts/${draft.id}`,'PUT',{
          templateId,
          probationDays,
          version:draft.version,
          refreshSnapshot:refreshSnap,
        });
        setSuccess('Borrador actualizado correctamente.');
      }else{
        // HU-19 §1 — crear nuevo borrador
        const c=await api('contracts/drafts','POST',{
          employeeId:selectedEmpId,
          templateId,
          probationDays,
          requestKey:crypto.randomUUID(),
        });
        setSuccess(`Borrador ${c.id} creado. Puedes previsualizar y luego emitirlo.`);
      }
      onSaved();
      setTimeout(onClose,1200);
    }catch(e:any){
      const msg:string=e.message||'Error al guardar';
      if(msg.includes('emitido')||e.status===409){
        setError('Este contrato ya fue emitido y no puede editarse. (HTTP 409)');
      }else if(e.status===404||msg.includes('no encontrad')){
        setError('Funcionario o plantilla no encontrada. (HTTP 404)');
      }else{
        setError(msg);
      }
    }finally{setSaving(false)}
  }

  const isEditing=!!draft;

  return(
    <dialog ref={ref} onCancel={e=>{e.preventDefault();onClose()}}
      style={{width:'min(680px,calc(100vw - 32px))',maxHeight:'92vh',overflow:'auto',
              border:'1px solid #ced9d1',borderRadius:12,padding:28,color:'#223c36'}}>
      <div className="toolbar">
        <h2>{isEditing?'Editar borrador de contrato':'Nuevo borrador de contrato'}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar">Cerrar ×</button>
      </div>

      {/* ── Selección de funcionario (solo al crear) ── */}
      {!isEditing&&(
        <section style={{marginBottom:16}}>
          <h3 style={{marginBottom:8,fontSize:'0.95rem'}}>Funcionario</h3>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <input
              value={empSearch} onChange={e=>{setEmpSearch(e.target.value);setEmpPage(1)}}
              placeholder="Buscar por nombre o código"
              style={{flex:1,padding:'6px 10px',border:'1px solid #ced9d1',borderRadius:6}}/>
          </div>
          <Notice {...people}/>
          <select value={selectedEmpId} onChange={e=>setSelectedEmpId(e.target.value)}
            style={{width:'100%',padding:'7px 10px',border:'1px solid #ced9d1',borderRadius:6,marginBottom:6}}>
            <option value="">Seleccione funcionario activo…</option>
            {(people.data?.items||[]).filter((e:Row)=>e.status==='ACTIVO').map((e:Row)=>(
              <option key={e.id} value={e.id}>{e.code} · {e.name}</option>
            ))}
          </select>
          <div style={{display:'flex',gap:8}}>
            <button disabled={empPage<=1} onClick={()=>setEmpPage(n=>n-1)} style={{fontSize:'0.8rem'}}>◀ Anterior</button>
            <span style={{fontSize:'0.8rem',alignSelf:'center'}}>Pág. {empPage} · {people.data?.total??'…'} funcionarios</span>
            <button disabled={empPage*25>=(people.data?.total||0)} onClick={()=>setEmpPage(n=>n+1)} style={{fontSize:'0.8rem'}}>Siguiente ▶</button>
          </div>
        </section>
      )}

      {/* ── Empleado en modo edición ── */}
      {isEditing&&(
        <p style={{marginBottom:12,fontSize:'0.9rem',color:'#4a6560'}}>
          Funcionario: <strong>{(draft.snapshot as any)?.name}</strong>
          {' · '}snapshot v{(draft.snapshot as any)?.version}
        </p>
      )}

      {/* ── Plantilla ── */}
      <label style={{display:'block',marginBottom:12}}>
        <span style={{fontSize:'0.9rem',fontWeight:600}}>Plantilla de contrato</span>
        <select value={templateId} onChange={e=>setTemplateId(e.target.value)}
          style={{display:'block',width:'100%',padding:'7px 10px',border:'1px solid #ced9d1',borderRadius:6,marginTop:4}}>
          <option value="">Seleccione plantilla activa…</option>
          {allTemplates.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      {/* ── Periodo de prueba ── */}
      <label style={{display:'block',marginBottom:16}}>
        <span style={{fontSize:'0.9rem',fontWeight:600}}>Periodo de prueba (días)</span>
        <input type="number" min={0} max={365} value={probationDays}
          onChange={e=>setProbationDays(Number(e.target.value))}
          style={{display:'block',width:'100%',padding:'7px 10px',border:'1px solid #ced9d1',borderRadius:6,marginTop:4}}/>
      </label>

      {/* ── Actualizar snapshot (modo edición) ── */}
      {isEditing&&(
        <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,cursor:'pointer'}}>
          <input type="checkbox" checked={refreshSnap} onChange={e=>setRefreshSnap(e.target.checked)}/>
          <span style={{fontSize:'0.9rem'}}>Actualizar datos del funcionario desde Personal</span>
        </label>
      )}

      {/* ── Mensajes ── */}
      {error&&<p role="alert" style={{color:'#c0392b',background:'#fdf2f2',border:'1px solid #e8b4b8',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:'0.9rem'}}>{error}</p>}
      {success&&<p role="status" style={{color:'#1a6b41',background:'#eafaf1',border:'1px solid #a3d9b9',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:'0.9rem'}}>{success}</p>}

      {/* ── Acciones ── */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <button onClick={save} disabled={saving}
          style={{padding:'8px 20px',background:'#1a6b41',color:'#fff',border:'none',borderRadius:6,fontWeight:600,cursor:saving?'not-allowed':'pointer',opacity:saving?0.7:1}}>
          {saving?(isEditing?'Guardando…':'Creando…'):(isEditing?'Guardar cambios':'Crear borrador')}
        </button>

        {isEditing&&(
          <Action run={loadPreview}>Vista previa</Action>
        )}

        <button type="button" onClick={onClose}
          style={{padding:'8px 16px',background:'transparent',border:'1px solid #ced9d1',borderRadius:6,cursor:'pointer'}}>
          Cancelar
        </button>
      </div>

      {/* ── Panel de vista previa ── */}
      {previewOpen&&previewText!==null&&(
        <section style={{marginTop:20,border:'1px solid #ced9d1',borderRadius:8,padding:16,background:'#f9faf8'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <h3 style={{margin:0,fontSize:'0.95rem'}}>
              Vista previa — {previewMeta?.templateName} · v{previewMeta?.templateVersion}
            </h3>
            <button type="button" onClick={()=>setPreviewOpen(false)} style={{fontSize:'0.8rem'}}>Cerrar ×</button>
          </div>
          <pre style={{
            whiteSpace:'pre-wrap',fontFamily:'inherit',lineHeight:1.8,
            background:'#fff',padding:16,borderRadius:6,border:'1px solid #e8ede9',
            maxHeight:320,overflow:'auto',fontSize:'0.9rem',
          }}>
            {previewText}
          </pre>
          <p style={{fontSize:'0.8rem',color:'#6b8a7a',marginTop:8}}>
            Esta vista previa es idéntica al texto que se incluirá en el PDF emitido.
            Los datos del funcionario están congelados al momento del borrador.
          </p>
        </section>
      )}
    </dialog>
  );
}

