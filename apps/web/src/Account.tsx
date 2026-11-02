import './Management.css';
import React,{useState} from 'react';
import {api,Row} from './api';
import {Action,Notice,useData} from './components';

type Props={user:Row;onLoggedOut:()=>void};
export default function Account({user,onLoggedOut}:Props){
 const[revision,setRevision]=useState(0),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(false);
 const me=useData('auth/me',revision),profile=me.data||user;
 return <div className="management-surface"><section className="card"><h3>Perfil de acceso</h3><p>{profile.email}</p><Notice {...me}/><div className="details"><p>Roles asignados<strong>{profile.roles?.join(' · ')}</strong></p><p>Correo<strong>{profile.verifiedAt?'Verificado':'Verificación pendiente'}</strong></p><p>Ámbito<strong>{profile.scopeAll?'Todos los departamentos autorizados':`${profile.departmentIds?.length||0} áreas asignadas`}</strong></p></div>
  {!profile.verifiedAt&&<><p className="muted">Verifica tu dirección antes de utilizar recuperación de acceso y avisos de vacaciones. El correo contiene un enlace de un uso válido por 30 minutos.</p><Action run={async()=>{const r=await api('auth/request-verification','POST',{});setMessage(r.message)}}>Solicitar enlace de verificación</Action></>}
  <button style={{marginLeft:10}} onClick={()=>setRevision(n=>n+1)}>Actualizar estado del correo</button>
  {message&&<p className="success" role="status">{message} La puesta en cola no confirma la recepción en tu buzón.</p>}
 </section><section className="card"><h3>Cambiar contraseña</h3><p className="muted">Al guardar se cerrarán todas tus sesiones. La nueva contraseña debe tener al menos 12 caracteres.</p>
  <form className="form" onSubmit={async e=>{e.preventDefault();const values=new FormData(e.currentTarget),password=String(values.get('password'));setError('');if(password!==values.get('confirmation')){setError('Las contraseñas nuevas no coinciden');return}setBusy(true);try{await api('auth/change-password','POST',{currentPassword:values.get('currentPassword'),password});onLoggedOut()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>
   <div className="fields"><label>Contraseña actual<input name="currentPassword" type={show?'text':'password'} autoComplete="current-password" required maxLength={256}/></label><label>Nueva contraseña<input name="password" type={show?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128} required/></label><label>Confirmar nueva contraseña<input name="confirmation" type={show?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128} required/></label></div>
   <label style={{display:'flex',flexDirection:'row',alignItems:'center',marginBottom:16}}><input style={{width:'auto'}} type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Mostrar contraseñas</label><Notice error={error}/><button className="primary" disabled={busy}>{busy?'Actualizando…':'Cambiar contraseña y cerrar sesiones'}</button>
  </form>
 </section></div>;
}
