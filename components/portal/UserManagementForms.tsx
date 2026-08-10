"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createUserAction,updateUserAction,type UserFormState } from "../../app/portal/access/actions";
import { ROLES } from "../../lib/roles";

export type AccessUserDto={id:number;name:string;email:string;role:string;active:boolean;createdAt:string};

const initial:UserFormState={error:"",success:""};
function Submit({label}:{label:string}){const{pending}=useFormStatus();return <button className="os-primary-action" type="submit" disabled={pending}>{pending?"Saving…":label}</button>}
function Result({state}:{state:UserFormState}){return <>{state.error&&<p className="os-form-error" role="alert">{state.error}</p>}{state.success&&<p className="os-form-success" role="status">{state.success}</p>}</>}
function RoleSelect({defaultValue}:{defaultValue?:string}){return <select name="role" defaultValue={defaultValue??"Employee"} required>{ROLES.map((role)=><option key={role}>{role}</option>)}</select>}

export function CreateUserForm(){const[state,action]=useActionState(createUserAction,initial);return <form action={action} className="os-user-form">
  <label>Name<input name="name" maxLength={120} autoComplete="name" required/></label>
  <label>Email<input name="email" type="email" maxLength={254} autoComplete="email" required/></label>
  <label>Password<input name="password" type="password" minLength={12} autoComplete="new-password" required/></label>
  <label>Confirm password<input name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required/></label>
  <label>Role<RoleSelect/></label>
  <label>Status<select name="status" defaultValue="Active" required><option>Active</option><option>Inactive</option></select></label>
  <div className="os-user-form-actions"><Submit label="Create user"/><Result state={state}/></div>
</form>}

export function EditUserForm({user,currentUserId}:{user:AccessUserDto;currentUserId:number}){const[state,action]=useActionState(updateUserAction,initial);const isCurrent=user.id===currentUserId;return <form action={action} className="os-user-form os-user-edit-form">
  <input type="hidden" name="id" value={user.id}/>
  <label>Name<input name="name" maxLength={120} defaultValue={user.name} required/></label>
  <label>Email<input name="email" type="email" maxLength={254} defaultValue={user.email} required/></label>
  <label>Role<RoleSelect defaultValue={user.role}/></label>
  <label>Status<select name="status" defaultValue={user.active?"Active":"Inactive"} required><option>Active</option><option disabled={isCurrent}>Inactive</option></select>{isCurrent&&<small>Your active session cannot deactivate itself.</small>}</label>
  <div className="os-user-form-actions"><Submit label="Save user"/><Result state={state}/></div>
</form>}
