'use strict';
window.addEventListener('DOMContentLoaded',()=>{
  window.ui=SwaggerUIBundle({
    url:'/api/v1/openapi.json',
    dom_id:'#swagger-ui',
    deepLinking:true,
    displayRequestDuration:true,
    persistAuthorization:false,
    validatorUrl: null,
    presets:[SwaggerUIBundle.presets.apis],
    layout:'BaseLayout',
    requestInterceptor:async(request)=>{
      const target=new URL(request.url,window.location.origin);
      if(target.origin===window.location.origin){
        request.credentials='same-origin';
        if(!['GET','HEAD','OPTIONS'].includes((request.method || 'GET').toUpperCase()) && target.pathname!=='/api/v1/auth/login'){
          const response=await fetch('/api/v1/auth/me',{credentials:'same-origin',cache:'no-store'});
          if(response.ok){
            const user=await response.json();
            request.headers['X-CSRF-Token']=user.csrf_token;
          }
        }
      }
      return request;
    }
  });
});
