(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,[4471,(e,t,r)=>{function n(e,t,r,n){return!1}e.i(461),Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"getDomainLocale",{enumerable:!0,get:function(){return n}}),e.r(90),("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},9149,(e,t,r)=>{e.i(461),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return w},useLinkStatus:function(){return j}};for(var i in n)Object.defineProperty(r,i,{enumerable:!0,get:n[i]});let a=e.r(2456),l=e.r(1398),o=a._(e.r(1788)),d=e.r(472),s=e.r(1112),c=e.r(8169),u=e.r(9129),p=e.r(4862),f=e.r(5479),h=e.r(1914),m=e.r(4471),g=e.r(4113),x=e.r(3230),b=new Set;function y(e,t,r,n){if(!("u"<typeof window)&&(0,s.isLocalURL)(t)){if(!n.bypassPrefetchedCheck){let i=t+"%"+r+"%"+(void 0!==n.locale?n.locale:"locale"in e?e.locale:void 0);if(b.has(i))return;b.add(i)}e.prefetch(t,r,n).catch(e=>{})}}function v(e){return"string"==typeof e?e:(0,c.formatUrl)(e)}let k=o.default.forwardRef(function(e,t){let r,n,{href:i,as:a,children:c,prefetch:b=null,passHref:k,replace:_,shallow:j,scroll:w,locale:C,onClick:P,onNavigate:T,onMouseEnter:M,onTouchStart:I,legacyBehavior:O=!1,transitionTypes:E,...R}=e;r=c,O&&("string"==typeof r||"number"==typeof r)&&(r=(0,l.jsx)("a",{children:r}));let A=o.default.useContext(f.RouterContext),U=!1!==b,{href:N,as:S}=o.default.useMemo(()=>{if(!A){let e=v(i);return{href:e,as:a?v(a):e}}let[e,t]=(0,d.resolveHref)(A,i,!0);return{href:e,as:a?(0,d.resolveHref)(A,a):t||e}},[A,i,a]),$=o.default.useRef(N),L=o.default.useRef(S);O&&(n=o.default.Children.only(r));let D=O?n&&"object"==typeof n&&n.ref:t,[z,K,B]=(0,h.useIntersection)({rootMargin:"200px"}),X=o.default.useCallback(e=>{(L.current!==S||$.current!==N)&&(B(),L.current=S,$.current=N),z(e)},[S,N,B,z]),H=(0,x.useMergedRef)(X,D);o.default.useEffect(()=>{!A||K&&U&&y(A,N,S,{bypassPrefetchedCheck:!1,locale:C})},[S,N,K,C,U,A?.locale,A]);let q={ref:H,onClick(e){O||"function"!=typeof P||P(e),O&&n.props&&"function"==typeof n.props.onClick&&n.props.onClick(e),!A||e.defaultPrevented||function(e,t,r,n,i,a,l,o,d){let c,{nodeName:u}=e.currentTarget;if(!("A"===u.toUpperCase()&&((c=e.currentTarget.getAttribute("target"))&&"_self"!==c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.nativeEvent&&2===e.nativeEvent.which)||e.currentTarget.hasAttribute("download"))){if(!(0,s.isLocalURL)(r)){i&&(e.preventDefault(),location.replace(r));return}e.preventDefault(),(()=>{if(d){let e=!1;if(d({preventDefault:()=>{e=!0}}),e)return}let e=l??!0;"beforePopState"in t?t[i?"replace":"push"](r,n,{shallow:a,locale:o,scroll:e}):t[i?"replace":"push"](n||r,{scroll:e})})()}}(e,A,N,S,_,j,w,C,T)},onMouseEnter(e){O||"function"!=typeof M||M(e),O&&n.props&&"function"==typeof n.props.onMouseEnter&&n.props.onMouseEnter(e),A&&y(A,N,S,{locale:C,priority:!0,bypassPrefetchedCheck:!0})},onTouchStart:function(e){O||"function"!=typeof I||I(e),O&&n.props&&"function"==typeof n.props.onTouchStart&&n.props.onTouchStart(e),A&&y(A,N,S,{locale:C,priority:!0,bypassPrefetchedCheck:!0})}};if((0,u.isAbsoluteUrl)(S))q.href=S;else if(!O||k||"a"===n.type&&!("href"in n.props)){let e=void 0!==C?C:A?.locale;q.href=A?.isLocaleDomain&&(0,m.getDomainLocale)(S,e,A?.locales,A?.domainLocales)||(0,g.addBasePath)((0,p.addLocale)(S,e,A?.defaultLocale))}return O?o.default.cloneElement(n,q):(0,l.jsx)("a",{...R,...q,children:r})}),_=(0,o.createContext)({pending:!1}),j=()=>(0,o.useContext)(_),w=k;("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1914,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useIntersection",{enumerable:!0,get:function(){return d}});let n=e.r(1788),i=e.r(9604),a="function"==typeof IntersectionObserver,l=new Map,o=[];function d({rootRef:e,rootMargin:t,disabled:r}){let s=r||!a,[c,u]=(0,n.useState)(!1),p=(0,n.useRef)(null),f=(0,n.useCallback)(e=>{p.current=e},[]);return(0,n.useEffect)(()=>{if(a){if(s||c)return;let r=p.current;if(r&&r.tagName)return function(e,t,r){let{id:n,observer:i,elements:a}=function(e){let t,r={root:e.root||null,margin:e.rootMargin||""},n=o.find(e=>e.root===r.root&&e.margin===r.margin);if(n&&(t=l.get(n)))return t;let i=new Map;return t={id:r,observer:new IntersectionObserver(e=>{e.forEach(e=>{let t=i.get(e.target),r=e.isIntersecting||e.intersectionRatio>0;t&&r&&t(r)})},e),elements:i},o.push(r),l.set(r,t),t}(r);return a.set(e,t),i.observe(e),function(){if(a.delete(e),i.unobserve(e),0===a.size){i.disconnect(),l.delete(n);let e=o.findIndex(e=>e.root===n.root&&e.margin===n.margin);e>-1&&o.splice(e,1)}}}(r,e=>e&&u(e),{root:e?.current,rootMargin:t})}else if(!c){let e=(0,i.requestIdleCallback)(()=>u(!0));return()=>(0,i.cancelIdleCallback)(e)}},[s,t,e,c,p.current]),[f,c,(0,n.useCallback)(()=>{u(!1)},[])]}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},3230,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return i}});let n=e.r(1788);function i(e,t){let r=(0,n.useRef)(null),i=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=i.current;t&&(i.current=null,t())}else e&&(r.current=a(e,n)),t&&(i.current=a(t,n))},[e,t])}function a(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},1562,e=>{var t=e.i(1398),r=e.i(1158),n=e.i(814),i=e.i(9877),a=e.i(9835),l=e.i(6224),o=e.i(4787);let d=n.U.div.withConfig({displayName:"help__Grid",componentId:"sc-f6b861fc-0"})`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 12px;
  container: help-sections / inline-size;
`,s=n.m`
  --help-card-background: #ffffff;
  --help-card-ink: #202126;
  --help-card-border: #dfe2e7;
  --help-card-hover: #f3f4f6;
`,c=n.m`
  --help-card-background: #202126;
  --help-card-ink: #ffffff;
  --help-card-border: #202126;
  --help-card-hover: #303238;
`,u=n.m`
  ${s}
  --ink: var(--help-card-ink);
  --desk-ink: var(--help-card-ink);
  --desk-muted: var(--help-card-ink);
  --apple-secondary: var(--help-card-ink);
  background: var(--help-card-background);
  color: var(--help-card-ink);
  border-color: var(--help-card-border);
  &:nth-child(even) {
    ${c}
  }
`,p=(0,n.U)(r.default).withConfig({displayName:"help__Card",componentId:"sc-f6b861fc-1"})`
  display: grid;
  gap: 0.6rem;
  padding: 1.6rem;
  border-radius: ${({theme:e})=>e.radius.lg};
  border: 1px solid;
  ${u}
  font-size: 15px;
  line-height: 1.55;
  transition: background 0.15s;
  &:hover { background: var(--help-card-hover); }

  /* With odd column counts, alternating items already form a checkerboard.
     Even counts need every second row inverted. Thresholds match 260px + 12px. */
  @container help-sections (532px <= width < 804px) {
    &:nth-child(n) { ${s} }
    &:nth-child(4n + 2), &:nth-child(4n + 3) { ${c} }
  }
  @container help-sections (1076px <= width < 1348px) {
    &:nth-child(n) { ${s} }
    &:nth-child(8n + 2), &:nth-child(8n + 4),
    &:nth-child(8n + 5), &:nth-child(8n + 7) { ${c} }
  }
`,f=(0,n.U)(a.B).withConfig({displayName:"help__RuleTile",componentId:"sc-f6b861fc-2"})`
  ${u}
  &:nth-child(odd) { ${c} }
  &:nth-child(even) { ${s} }
`,h=n.U.div.withConfig({displayName:"help__Rules",componentId:"sc-f6b861fc-3"})`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 1.2rem;
  ${({theme:e})=>e.mobile} { grid-template-columns: 1fr; }
`,m=n.U.div.withConfig({displayName:"help__Big",componentId:"sc-f6b861fc-4"})`
  font-size: 2.6rem;
  font-weight: 500;
  color: inherit;
  word-break: break-word;
`,g=n.U.div.withConfig({displayName:"help__DisclosureList",componentId:"sc-f6b861fc-5"})`
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  background: var(--desk-surface);
  overflow: hidden;
  details + details { border-top: 1px solid var(--desk-border); }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 58px;
    padding: 16px 20px;
    cursor: pointer;
    list-style: none;
    color: var(--desk-ink);
    font-size: 16px;
    font-weight: 550;
    line-height: 1.5;
  }
  summary::-webkit-details-marker { display: none; }
  summary::after {
    content: '';
    flex: 0 0 8px;
    width: 8px;
    height: 8px;
    margin: -4px 3px 0;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(45deg);
  }
  details[open] > summary::after { transform: rotate(225deg); margin-top: 4px; }
  summary:hover { background: var(--desk-raised); }
  summary:focus-visible { outline-offset: -3px; }
  p {
    max-width: 78ch;
    margin: 0;
    padding: 0 20px 18px;
    color: var(--desk-ink);
    font-size: 15px;
    line-height: 1.7;
  }
  @media (max-width: 480px) {
    summary { padding: 15px 16px; }
    p { padding: 0 16px 16px; }
  }
`,x=n.U.a.withConfig({displayName:"help__DocsLink",componentId:"sc-f6b861fc-6"})`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px;
  margin-top: 24px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  background: var(--desk-surface);
  color: var(--desk-ink);
  > span:first-child { display: grid; gap: 4px; }
  b { font-size: 16px; font-weight: 550; }
  > span:first-child > span { font-size: 15px; line-height: 1.5; color: var(--desk-muted); }
  > span:last-child { font-size: 22px; }
  &:hover { border-color: var(--desk-control); background: var(--desk-raised); }
`,b=n.U.details.withConfig({displayName:"help__HelpGroup",componentId:"sc-f6b861fc-7"})`
  margin-top: 28px;
  > summary {
    display: flex; align-items: center; justify-content: space-between; gap: 20px;
    padding: 18px 20px; min-height: 64px; cursor: pointer; list-style: none;
    border: 1px solid var(--desk-border); border-radius: var(--desk-radius);
    background: var(--desk-surface); color: var(--desk-ink); font-size: 20px; font-weight: 600;
    > span::first-letter { text-transform: uppercase; }
    &::-webkit-details-marker { display: none; }
    &::after { content: ''; width: 9px; height: 9px; flex-shrink: 0; border-right: 2px solid; border-bottom: 2px solid; transform: rotate(45deg); margin-right: 4px; }
    &:hover { background: var(--desk-raised); }
  }
  &[open] > summary { border-radius: var(--desk-radius) var(--desk-radius) 0 0; }
  &[open] > summary::after { transform: rotate(225deg); }
  > div { border-top: 0; border-radius: 0 0 var(--desk-radius) var(--desk-radius); }
`;e.s(["default",0,function(){let{settings:e,isAdmin:r}=(0,o.U)(),n=[{href:"/payments",title:(0,l.t)("Платежи"),text:(0,l.t)("Периоды месяца, итоги по валютам, отметка оплаты, чеки и выгрузка в CSV.")},{href:"/recurring",title:(0,l.t)("Регулярные"),text:(0,l.t)("Платежи с повтором: месяц, квартал или год. Изменение, пауза, импорт из CSV.")},{href:"/calendar",title:(0,l.t)("Календарь"),text:(0,l.t)("Сроки месяца по дням; клик по платежу открывает отметку оплаты.")},{href:"/budget",title:(0,l.t)("Бюджет"),text:(0,l.t)("План на год по месяцам и категориям, оплачено и остаток в каждой валюте.")},{href:"/account",title:(0,l.t)("Аккаунт"),text:(0,l.t)("Привязка Telegram, пароль или двухфакторный вход, активные сессии и токены API.")},{href:"/extension",title:(0,l.t)("Расширение"),text:(0,l.t)("Подтягивает платежи из кабинетов сервисов в один клик.")},...r?[{href:"/team",title:(0,l.t)("Команда"),text:(0,l.t)("Обычные пользователи: создать, изменить, удалить.")},{href:"/suggestions",title:(0,l.t)("Предложения"),text:(0,l.t)("Платежи, найденные расширением: принять или отклонить.")},{href:"/activity",title:(0,l.t)("Журнал"),text:(0,l.t)("Отправка напоминаний и все действия в системе.")}]:[]],s=[[(0,l.t)("Когда приходит напоминание?"),(0,l.t)("За {days} дня до срока, один раз на каждый период. Если платёж добавлен позже, напоминание уходит сразу. Оплаченные периоды и платежи на паузе не напоминают.",{days:e.reminder_days})],[(0,l.t)("Когда платёж считается просроченным?"),(0,l.t)("Со следующего дня после срока. Оплата в сам день срока — вовремя. Если исправить фактическую дату оплаты, просрочка пересчитается, а срок не изменится.")],[(0,l.t)("Что если в месяце нет нужного числа?"),(0,l.t)("Срок переносится на последний день месяца: 31 января → 28 февраля → 31 марта. Годовой платёж от 29 февраля в обычный год придёт 28 февраля.")],[(0,l.t)("Как отметить оплату из Telegram?"),(0,l.t)("Нажмите «✅ Оплачено» под напоминанием. Период отметится сегодняшней датой, кнопка исчезнет, а в журнале будет видно, кто отметил.")],[(0,l.t)("Что если срок прошёл, а оплату не отметили?"),e.overdue_reminders?(0,l.t)("На следующий день после срока приходит одно повторное напоминание «Платёж просрочен» — в те же каналы, что и обычное."):(0,l.t)("Повторные напоминания о просрочке на этом сервере выключены (OVERDUE_REMINDERS=false). Просроченные платежи видны в панели и по команде /overdue.")],[(0,l.t)("Что значит «санкционный список OFAC» у кошелька?"),(0,l.t)("Если у платежа указан криптокошелёк получателя, он сверяется со списком санкций Минфина США (SDN). При совпадении платёж помечается ⛔, в напоминаниях появляется предупреждение и пропадает кнопка «Оплатить». Это проверка только по опубликованным адресам, а не оценка риска кошелька.")],[(0,l.t)("Где оплатить?"),(0,l.t)("Если у платежа указана ссылка на оплату, в напоминании есть кнопка «💳 Оплатить», а в списке платежей — значок 💳. Реквизиты показываются в напоминании и в окне оплаты.")],[(0,l.t)("Что делает пауза?"),(0,l.t)("С сегодняшнего дня до выбранной даты или до возобновления новых периодов и напоминаний нет. Пропущенные месяцы не становятся долгом, прошлые оплаты остаются.")],[(0,l.t)("Почему суммы не складываются в одну?"),(0,l.t)("Рубли, доллары и евро считаются отдельно: курсы и конвертация не используются, чтобы итоги всегда совпадали со счетами.")]],c=[[(0,l.t)("Доступ и права"),[(0,l.t)("Без входа недоступны ни панель, ни данные API. Права проверяет сервер: пользователь не выполнит действия администратора даже через API."),(0,l.t)("Токены API хранятся как SHA-256 и показываются один раз. По токену нельзя сменить пароль, второй фактор, создать новый токен или завершить сессии.")]],[(0,l.t)("Пароли и защита входа"),[(0,l.t)("Пароли хешируются Argon2id; пароли из списков утечек, с логином внутри и простые последовательности не принимаются."),(0,l.t)("Смена пароля завершает остальные сессии."),(0,l.t)("Администратор может включить вход по коду из приложения-аутентификатора (раздел «Аккаунт»)."),...e.security?.login_alerts?[(0,l.t)("О каждом входе и о подборе пароля приходит сообщение в привязанный Telegram.")]:[]]],[(0,l.t)("Оплата через Telegram"),[(0,l.t)("Кнопку «Оплачено» принимает только чат команды и личные чаты привязанных пользователей."),...e.security?.paid_linked_only?[(0,l.t)("«Оплачено» в Telegram могут нажать только участники, привязавшие аккаунт в панели.")]:[]]],[(0,l.t)("Чеки и хранение данных"),[e.security?.encryption?(0,l.t)("Секрет второго фактора, чеки и реквизиты хранятся зашифрованными (XChaCha20-Poly1305): копия базы без ключа их не раскрывает."):(0,l.t)("Шифрование данных в базе выключено: задайте DATA_ENCRYPTION_KEY (invoice-keeper keygen)."),(0,l.t)("Чеки проверяются по содержимому файла, а не по имени, и скачиваются как вложения.")]],[(0,l.t)("Целостность журнала"),[(0,l.t)("Журнал защищён от подмены: каждая запись подписана вместе с предыдущей, проверка — во вкладке «Журнал».")]]],u=e.timezone,y=["telegram","max","email","webhook"].filter(t=>e.channels?.[t]).map(e=>({telegram:"Telegram",max:"MAX",email:"Email",webhook:"Webhook"})[e]);return(0,t.jsxs)(i.u,{title:(0,l.t)("Помощь"),heading:(0,l.t)("Помощь"),subtitle:(0,l.t)("Как устроен Invoice Keeper и что делать, если что-то не так."),action:(0,t.jsx)(t.Fragment,{}),children:[(0,t.jsx)(a.n,{children:(0,l.t)("разделы")}),(0,t.jsx)(d,{children:n.map(e=>(0,t.jsxs)(p,{href:e.href,children:[(0,t.jsxs)(a.h,{children:[e.title,(0,t.jsx)(a.T,{"aria-hidden":"true",children:"›"})]}),(0,t.jsx)(a.k,{children:e.text})]},e.href))}),(0,t.jsx)(a.n,{children:(0,l.t)("правила этого сервера")}),(0,t.jsxs)(h,{children:[(0,t.jsxs)(f,{children:[(0,t.jsx)(m,{children:e.reminder_days}),(0,t.jsx)(a.k,{children:(0,l.t)("дня до срока — напоминание")})]}),(0,t.jsxs)(f,{children:[(0,t.jsx)(m,{children:u}),(0,t.jsx)(a.k,{children:(0,l.t)("часовой пояс: от него зависит «сегодня»")})]}),(0,t.jsxs)(f,{children:[(0,t.jsx)(m,{children:y.length?y.join(" · "):"—"}),(0,t.jsx)(a.k,{children:y.length?e.telegram_enabled?e.team_chat?(0,l.t)("Telegram: общий чат и личные сообщения"):(0,l.t)("Telegram: личные сообщения привязанным пользователям"):(0,l.t)("каналы напоминаний"):(0,l.t)("напоминания пока не отправляются")}),e.bot_username&&(0,t.jsxs)(a.k,{children:["@",e.bot_username]})]})]}),(0,t.jsxs)(x,{href:"/api/v1/docs",target:"_blank",rel:"noopener noreferrer",children:[(0,t.jsxs)("span",{children:[(0,t.jsx)("b",{children:(0,l.t)("Документация API")}),(0,t.jsx)("span",{children:(0,l.t)("Методы, параметры и примеры запросов для интеграций.")})]}),(0,t.jsx)("span",{"aria-hidden":"true",children:"↗"})]}),(0,t.jsxs)(b,{children:[(0,t.jsx)("summary",{id:"help-faq",children:(0,t.jsx)("span",{children:(0,l.t)("частые вопросы")})}),(0,t.jsx)(g,{"aria-labelledby":"help-faq",children:s.map(([e,r])=>(0,t.jsxs)("details",{children:[(0,t.jsx)("summary",{children:e}),(0,t.jsx)("p",{children:r})]},e))})]}),(0,t.jsx)(a.n,{id:"help-security",children:(0,l.t)("безопасность")}),(0,t.jsx)(g,{"aria-labelledby":"help-security",children:c.map(([e,r])=>(0,t.jsxs)("details",{children:[(0,t.jsx)("summary",{children:e}),(0,t.jsx)("div",{children:r.map(e=>(0,t.jsx)("p",{children:e},e))})]},e))}),(e.support_telegram||e.support_email)&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(a.n,{children:(0,l.t)("поддержка")}),(0,t.jsxs)(a.B,{children:[e.support_telegram&&(0,t.jsx)("a",{href:`https://t.me/${e.support_telegram.replace(/^@/,"")}`,target:"_blank",rel:"noopener noreferrer",children:e.support_telegram}),e.support_email&&(0,t.jsx)("a",{href:`mailto:${e.support_email}`,children:e.support_email})]})]})]})}])}],5064,(e,t,r)=>{let n="/help";(window.__NEXT_P=window.__NEXT_P||[]).push([n,()=>e.r(1562)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([n])})},1158,(e,t,r)=>{t.exports=e.r(9149)}]);