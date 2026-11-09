import './Management.css';
import React,{useEffect,useRef,useState} from 'react';
import {api,Row} from './api';
import {Action,Badge,Form,Notice,short,useData} from './components';
import ContractTemplatesManager from './ContractTemplatesManager';
import ContractDraftModal from './ContractDraftModal';

type Props={employeeId:string;onEmployeeChange:(id:string)=>void;canAdmin:boolean;canIssue?:boolean;onChanged?:()=>void};
type Modal={type:string;record?:Row;data?:any};
type DraftModalState={open:boolean;draft?:Row};
function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),[discard,setDiscard]=useState(false);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[]);
 const close=()=>{if(ref.current?.querySelector('form[data-dirty="true"]'))setDiscard(true);else onClose()};
 return <dialog ref={ref} onCancel={e=>{e.preventDefault();close()}} style={{width:'min(850px,calc(100vw - 32px))',maxHeight:'90vh',overflow:'auto',border:'1px solid #ced9d1',borderRadius:12,padding:28,color:'#223c36'}}><div className="toolbar"><h2>{title}</h2><button type="button" onClick={close} aria-label="Cerrar diálogo">Cerrar ×</button></div>{discard&&<div className="notice"><p>Hay cambios sin guardar en este diálogo.</p><div className="actions"><button type="button" onClick={()=>setDiscard(false)}>Seguir editando</button><button type="button" onClick={onClose}>Descartar cambios</button></div></div>}{children}</dialog>;
}
const actions:Record<string,string>={DRAFT_CREATED:'Borrador creado',DRAFT_UPDATED:'Borrador actualizado',ISSUED:'Documento emitido',ISSUE_RECOVERED:'Emisión recuperada',VOIDED:'Contrato anulado',RECTIFICATION_DRAFT:'Borrador de rectificación',RECTIFICATION_LINKED:'Rectificación vinculada'};
export default function Contracts({employeeId,onEmployeeChange,canAdmin,canIssue=false,onChanged}:Props){
 const[revision,setRevision]=useState(0),[page,setPage]=useState(1),[filterEmployee,setFilterEmployee]=useState(false),[status,setStatus]=useState(''),[search,setSearch]=useState(''),[employeePage,setEmployeePage]=useState(1),[modal,setModal]=useState<Modal|null>(null),[message,setMessage]=useState('');
 const[draftModal,setDraftModal]=useState<DraftModalState>({open:false});
 const requestKey=useRef(crypto.randomUUID());
 const refresh=()=>{setRevision(n=>n+1);onChanged?.()};
 const templates=useData('templates',revision),policy=useData('contracts/policy',revision),people=useData(`employees?page=${employeePage}&q=${encodeURIComponent(search)}`,revision);
 const list=useData(`contracts?page=${page}${status?'&status='+status:''}${filterEmployee&&employeeId?'&employeeId='+employeeId:''}`,revision);
 const templateOptions=(templates.data||[]).filter((t:Row)=>t.active).map((t:Row)=>({value:t.id,label:`${t.name} · versión ${t.version}`}));
 async function open(type:string,c:Row){const data=await api(`contracts/${c.id}/${type==='history'?'audit':'preview'}`);setModal({type,record:type==='history'?c:data.contract,data})}
 const selectedPerson=useData(employeeId?'employees?id='+encodeURIComponent(employeeId):null,revision);
 const employeeRows:Row[]=[...(people.data?.items||[])];
 if(employeeId&&!employeeRows.some(e=>e.id===employeeId)){const selected=selectedPerson.data?.items?.find((e:Row)=>e.id===employeeId);employeeRows.push(selected||{id:employeeId,code:'',name:selectedPerson.error?'Funcionario seleccionado no disponible':'Consultando funcionario seleccionado…'})}
 return <div className="management-surface">
  <section className="card"><h3>Preparar un contrato</h3><p className="muted">Selecciona un funcionario existente. Se conservarán sus datos al momento de preparar el borrador.</p><div className="employee-picker"><label>Buscar funcionario<input value={search} onChange={e=>{setSearch(e.target.value);setEmployeePage(1)}} placeholder="Nombre o código"/></label><label>Funcionario<select value={employeeId} onChange={e=>onEmployeeChange(e.target.value)}><option value="">Seleccione…</option>{employeeRows.map((e:Row)=><option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></label></div>
    {search.trim() && (
        <div className="search-results-box" style={{ marginTop: 10, padding: '10px 14px', background: '#f8faf9', border: '1px solid #dce5df', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <small style={{ fontWeight: 600, color: '#194e40' }}>
              {people.loading ? 'Buscando…' : `${people.data?.total || 0} funcionario(s) encontrado(s) para "${search}":`}
            </small>
            <button type="button" className="text" style={{ padding: 0, fontSize: 12, cursor: 'pointer' }} onClick={() => setSearch('')}>
              Limpiar búsqueda ✕
            </button>
          </div>
          {people.loading && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Consultando registros…</p>}
          {!people.loading && people.data?.items?.length === 0 && (
            <p className="notice" style={{ margin: 0, fontSize: 13 }}>
              No se encontró ningún funcionario que coincida con "{search}".
            </p>
          )}
          {!people.loading && (people.data?.items?.length || 0) > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {people.data.items.map((e: Row) => (
                <button
                  type="button"
                  key={e.id}
                  className={employeeId === e.id ? 'primary' : ''}
                  style={{ padding: '6px 12px', fontSize: 13, borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => {
                    onEmployeeChange(e.id);
                  }}
                >
                  <strong>{e.code}</strong> · {e.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}<Notice {...people}/><Notice error={selectedPerson.error}/><div className="pagination"><button disabled={employeePage<=1} onClick={()=>setEmployeePage(n=>n-1)}>Anterior</button><span>Página {employeePage} · {people.data?.total??'…'} funcionarios</span><button disabled={employeePage*25>=(people.data?.total||0)} onClick={()=>setEmployeePage(n=>n+1)}>Siguiente</button></div>
   {employeeId&&templateOptions.length>0&&<Form title="Nuevo borrador" fields={[{name:'templateId',label:'Plantilla activa',options:templateOptions},{name:'probationDays',label:'Periodo de prueba (días)',type:'number'}]} submit="Guardar borrador" onSubmit={async v=>{const c=await api('contracts','POST',{employeeId,templateId:v.templateId,probationDays:Number(v.probationDays),requestKey:requestKey.current});requestKey.current=crypto.randomUUID();setMessage('Borrador '+c.id+' guardado. Puedes revisarlo antes de emitir.');refresh();await open('edit',c)}}/>}<Notice {...templates}/>{templates.data&&!templateOptions.length&&<p className="muted">No hay plantilla activa. Un administrador puede crearla en Plantillas versionadas.</p>}
  </section>
  {message&&<p className="success" role="status">{message}</p>}
  {/* HU-19: Bandeja de borradores con acceso rápido al modal */}
  <section className="card"><div className="toolbar"><h3>Borradores de contrato (HU-19)</h3><button onClick={()=>setDraftModal({open:true})}>+ Nuevo borrador</button></div><p className="muted">Genera un borrador vinculado a Personal — los datos del funcionario quedan congelados al crearlos.</p></section>
  <section className="card"><div className="toolbar"><h3>Contratos y documentos históricos</h3><button onClick={refresh}>Actualizar</button></div><div className="fields"><label>Estado<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Todos</option>{['BORRADOR','EMITIENDO','ERROR_EMISION','EMITIDO','ANULADO'].map(s=><option key={s}>{s}</option>)}</select></label><label>Funcionario<select value={filterEmployee?'selected':'all'} onChange={e=>{setFilterEmployee(e.target.value==='selected');setPage(1)}}><option value="all">Todos los autorizados</option><option value="selected" disabled={!employeeId}>Solo el seleccionado</option></select></label></div><Notice {...list}/>
   {list.data?.items.length===0&&<p className="empty">No hay contratos con estos filtros.</p>}
   {list.data?.items.map((c:Row)=><article className="record" key={c.id}><div><strong>{c.snapshot.name}</strong><p>{short(c.createdAt)} · {c.probationDays} días de prueba · {c.id}</p>{c.originalId&&<p>Rectifica: {c.originalId}</p>}<Badge value={c.status}/></div><div className="actions"><Action run={()=>open('preview',c)}>Vista previa</Action><Action run={()=>open('history',c)}>Historial</Action>{['BORRADOR','ERROR_EMISION'].includes(c.status)&&<Action run={()=>open('edit',c)}>Editar borrador</Action>}{canIssue&&['BORRADOR','ERROR_EMISION','EMITIENDO'].includes(c.status)&&<Action run={()=>open('issue',c)}>{c.status==='EMITIENDO'?'Recuperar emisión':'Revisar y emitir PDF'}</Action>}{['EMITIDO','ANULADO'].includes(c.status)&&<a className="button" href={`/api/v1/contracts/${c.id}/pdf`}>Descargar PDF ↗</a>}{canAdmin&&canIssue&&c.status==='EMITIDO'&&policy.data?.allowVoid&&<button onClick={()=>setModal({type:'void',record:c})}>Anular</button>}{canAdmin&&canIssue&&['EMITIDO','ANULADO'].includes(c.status)&&policy.data?.allowRectification&&<button onClick={()=>setModal({type:'rectify',record:c})}>Rectificar</button>}</div></article>)}
   <div className="pagination"><button disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>Página {page} · {list.data?.total??'…'} contratos</span><button disabled={page*25>=(list.data?.total||0)} onClick={()=>setPage(n=>n+1)}>Siguiente</button></div>
  </section>
  {canAdmin&&<section className="card"><div className="toolbar"><h3>Plantillas versionadas (HU-18)</h3></div><ContractTemplatesManager revision={revision} onChanged={refresh}/></section>}
  {canAdmin&&<section className="card"><div className="toolbar"><h3>Plantillas clásicas</h3><button onClick={()=>setModal({type:'template'})}>Nueva plantilla</button></div><p className="muted">El contenido de una versión existente no se sobrescribe. Crear una nueva versión conserva los documentos anteriores.</p>{templates.data?.map((t:Row)=><article className="record" key={t.id}><div><strong>{t.name} · versión {t.version}</strong><p>{t.active?'Activa':'Inactiva'}</p></div><div className="actions"><button onClick={()=>setModal({type:'template',record:t})}>Crear nueva versión</button><Action run={async()=>{await api('templates/'+t.id,'PATCH',{active:!t.active});refresh()}}>{t.active?'Desactivar':'Activar'}</Action></div></article>)}</section>}
  {canAdmin&&<section className="card"><h3>Política de documentos</h3><Notice {...policy}/>{!policy.loading&&!policy.error&&policy.data?<p>Última aprobación: {short(policy.data.approvedAt)}. Anulación: {policy.data.allowVoid?'autorizada':'no autorizada'}. Rectificación: {policy.data.allowRectification?'autorizada':'no autorizada'}.</p>:!policy.loading&&!policy.error?<p className="muted">No hay política aprobada. Anulación y rectificación están bloqueadas.</p>:null}{policy.error&&<button onClick={refresh}>Reintentar consulta</button>}{!policy.loading&&!policy.error&&<button onClick={()=>setModal({type:'policy'})}>Registrar aprobación institucional</button>}</section>}
  {modal&&<Dialog title={{preview:'Vista previa del contrato',edit:'Editar borrador',history:'Historial del contrato',issue:'Confirmar emisión',void:'Anular contrato',rectify:'Preparar rectificación',template:'Nueva versión de plantilla',policy:'Aprobar política documental'}[modal.type]||'Contrato'} onClose={()=>setModal(null)}>
   {modal.type==='preview'&&<><p>{modal.data.templateName} · versión {modal.data.templateVersion}</p><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',lineHeight:1.8,background:'#f5f7f2',padding:24}}>{modal.data.text}</pre><p className="muted">Esta vista previa no sustituye al PDF emitido. Los datos de una emisión finalizada permanecen inmutables.</p></>}
   {modal.type==='history'&&<>{modal.data.length===0?<p>No hay movimientos registrados para este contrato anterior.</p>:modal.data.map((a:Row)=><article className="record" key={a.id}><div><strong>{actions[a.action]||a.action}</strong><p>{new Date(a.createdAt).toLocaleString('es-BO',{timeZone:'America/La_Paz'})} · responsable {a.actorId}</p>{a.details.reason&&<p>{a.details.reason}</p>}</div></article>)}</>}
   {modal.type==='edit'&&<><p className="muted">Funcionario: {modal.record?.snapshot.name}. Marca si deseas actualizar los datos desde Personal. La emisión rechazará una ficha desactualizada.</p><Notice {...templates}/>{templates.data&&<Form inline key={modal.record?.version} fields={[{name:'templateId',label:'Plantilla',options:templateOptions,value:modal.record?.templateId},{name:'probationDays',label:'Periodo de prueba (días)',type:'number',value:String(modal.record?.probationDays)},{name:'refreshSnapshot',label:'Datos del funcionario',options:[{value:'false',label:'Conservar datos del borrador'},{value:'true',label:'Actualizar desde Personal'}],value:'false'}]} submit="Guardar cambios" onSubmit={async v=>{const c=await api(`contracts/${modal.record?.id}`,'PATCH',{templateId:v.templateId,probationDays:Number(v.probationDays),refreshSnapshot:v.refreshSnapshot==='true',version:modal.record?.version});setMessage('Borrador actualizado.');refresh();setModal(null)}}/>}</>}
   {modal.type==='issue'&&<><p>Se emitirá el contrato de <strong>{modal.record?.snapshot.name}</strong> con los datos revisados. El sistema comprobará Personal, la plantilla y el archivo antes de confirmar la emisión.</p><p>{modal.data?.templateName} · versión {modal.data?.templateVersion}</p><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',lineHeight:1.7,background:'#f5f7f2',padding:18,maxHeight:280,overflow:'auto'}}>{modal.data?.text}</pre><p className="muted">Si un intento anterior se interrumpió, se recupera con el mismo identificador sin duplicar el documento.</p><Action run={async()=>{const c=await api(`contracts/${modal.record?.id}/issue`,'POST',{});setMessage('Contrato '+c.id+' emitido y conservado.');refresh();setModal(null)}}>Confirmar emisión</Action></>}
   {['void','rectify'].includes(modal.type)&&<Form inline fields={[{name:'reason',label:'Motivo y referencia de la autorización',type:'textarea'}]} submit={modal.type==='void'?'Confirmar anulación':'Crear borrador de rectificación'} onSubmit={async v=>{const c=await api(`contracts/${modal.record?.id}/${modal.type}`,'POST',modal.type==='void'?v:{...v,requestKey:requestKey.current});requestKey.current=crypto.randomUUID();setMessage(modal.type==='void'?'Contrato anulado. Su documento histórico permanece disponible.':'Borrador de rectificación '+c.id+' creado; el original permanece intacto.');refresh();setModal(null)}}/>}
   {modal.type==='template'&&<Form inline fields={[{name:'name',label:'Nombre de plantilla',value:modal.record?.name},{name:'body',label:'Texto',type:'textarea',value:modal.record?.body}]} submit="Guardar nueva versión" onSubmit={async v=>{const t=await api('templates','POST',v);setMessage(`Plantilla ${t.name} versión ${t.version} guardada.`);refresh();setModal(null)}}><p className="muted">Variables permitidas: {'{{name}}, {{code}}, {{hiredAt}}, {{salary}}, {{currency}}, {{probationDays}}'}. Texto únicamente.</p></Form>}
   {modal.type==='policy'&&!policy.loading&&!policy.error&&<Form inline fields={[{name:'allowVoid',label:'Anulación de documentos emitidos',options:[{value:'false',label:'No autorizada'},{value:'true',label:'Autorizada con motivo registrado'}],value:String(policy.data?.allowVoid||false)},{name:'allowRectification',label:'Rectificación con nuevo documento vinculado',options:[{value:'false',label:'No autorizada'},{value:'true',label:'Autorizada conservando el original'}],value:String(policy.data?.allowRectification||false)},{name:'rationale',label:'Decisión institucional y autoridad que aprueba',type:'textarea'}]} submit="Confirmar aprobación institucional" onSubmit={async v=>{await api('contracts/policy','POST',{allowVoid:v.allowVoid==='true',allowRectification:v.allowRectification==='true',rationale:v.rationale,approved:true});setMessage('Política documental registrada con responsable y fecha.');refresh();setModal(null)}}><p className="muted">Registrar esta acción requiere autorización institucional. No representa una regla legal automática.</p></Form>}
  </Dialog>}
  {/* HU-19: ContractDraftModal para crear/editar borradores vinculados a Personal */}
  {draftModal.open&&<ContractDraftModal draft={draftModal.draft} employeeId={employeeId} canIssue={canIssue} onClose={()=>setDraftModal({open:false})} onSaved={()=>{setDraftModal({open:false});refresh()}}/>}
 </div>;
}

