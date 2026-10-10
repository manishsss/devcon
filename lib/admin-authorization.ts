export function authorizeAdministrator(user:{userId:string;email:string}|null,settings:{ADMIN_USER_ID?:string;ADMIN_EMAIL?:string;PLATFORM_AUTH_BOUNDARY_VERIFIED?:string}){
  if(settings.PLATFORM_AUTH_BOUNDARY_VERIFIED!=='1')throw new Error('Administrator authentication boundary has not been verified.');
  if(!settings.ADMIN_USER_ID||!user||user.userId!==settings.ADMIN_USER_ID)throw new Error('Administrator access denied.');
  if(settings.ADMIN_EMAIL&&user.email.toLowerCase()!==settings.ADMIN_EMAIL.toLowerCase())throw new Error('Administrator access denied.');
  return user;
}
export function requireAdminOrigin(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw Object.assign(new Error('Administrator request origin rejected.'),{status:403});}

// Provider URLs can contain credentials; expose only fields used by the form.
export function browserAdminConfig(settings:Record<string,unknown>){
  return {treasury:settings.treasury,reservationMinutes:settings.reservationMinutes,maxUploadMB:settings.maxUploadMB,policy:settings.policy,target:settings.target};
}
