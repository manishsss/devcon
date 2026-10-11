export function logoResponse(object:{body:BodyInit;httpMetadata?:{contentType?:string}}){
  if(object.httpMetadata?.contentType!=='image/png')return Response.json({error:'Logo requires normalization.'},{status:404});
  return new Response(object.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'}});
}
