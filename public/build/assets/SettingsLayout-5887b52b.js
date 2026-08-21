import{r as i,N as u,O as w,W as x,z as b,P as y,a as e,b as l,d7 as k,Z as S}from"./vendor-react-d66e42fa.js";import{ar as p,E as d,aC as m}from"./main-6d7a3c9c.js";const h={passive:!0};function $(){const[t,s]=i.useState({width:0,height:0}),a=i.useCallback(()=>{s({width:window.innerWidth||0,height:window.innerHeight||0})},[]);return p("resize",a,h),p("orientationchange",a,h),i.useEffect(a,[]),t}const N=d(u)`
    ${{display:"block",fontSize:"0.875rem",lineHeight:"1.25rem",color:"var(--color-accent-6)",transitionProperty:"color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter",transitionTimingFunction:"cubic-bezier(0.4, 0, 0.2, 1)",transitionDuration:"150ms"}}

    @media (min-width: 960px) {
        ${{borderRadius:"5px",paddingLeft:"0.75rem",paddingRight:"0.75rem",paddingTop:"0.5rem",paddingBottom:"0.5rem",":hover":{backgroundColor:"var(--color-accent-2)",color:"var(--color-foreground)"}}}

        &.active {
            ${{fontWeight:"500",color:"var(--color-foreground)"}}
        }
    }
    @media (max-width: 960px) {
        ${{paddingTop:"1.5rem",paddingBottom:"1.5rem",color:"var(--color-foreground)"}}
    }
`,z=d.div`
    ${{display:"grid"}}

    @media (min-width: 960px) {
        ${{gridTemplateColumns:"repeat(4, minmax(0, 1fr))",gap:"4rem"}}
    }
    @media (max-width: 960px) {
        ${{gridTemplateColumns:"repeat(1, minmax(0, 1fr))"}}
    }
`,W=d.div`
    ${{display:"flex",flexDirection:"column"}}

    @media (max-width: 960px) {
        ${{"> :not([hidden]) ~ :not([hidden])":{"--tw-divide-y-reverse":"0",borderTopWidth:"calc(1px * calc(1 - var(--tw-divide-y-reverse)))",borderBottomWidth:"calc(1px * var(--tw-divide-y-reverse))",borderColor:"var(--color-accent-2)"}}}

        & > a:is(:first-of-type) {
            ${{paddingTop:"0px"}}
        }
    }
`,C=d(w)`
    ${{display:"flex",alignItems:"center","> :not([hidden]) ~ :not([hidden])":{"--tw-space-x-reverse":"0",marginRight:"calc(0.75rem * var(--tw-space-x-reverse))",marginLeft:"calc(0.75rem * calc(1 - var(--tw-space-x-reverse)))"},paddingBottom:"1.5rem",fontSize:"0.875rem",lineHeight:"1.25rem",fontWeight:"600",color:"var(--color-foreground)"}}
`,B=({indexPattern:t,defaultUrl:s,contentBlock:a,routes:g})=>{const r=x(),{width:n}=$(),o=b(t),v=y();i.useEffect(()=>{n>960&&o&&v(m(s,r[r.length-1].params),{replace:!0})},[o,n]);const f=a??i.Fragment;return e("div",{className:"bg-background min-h-screen",children:e(f,{children:l(z,{className:o?"border-b border-accent-200":"",children:[n>960||o?e(W,{children:g.map(c=>e(N,{to:m(c.path,r[r.length-1].params),end:c.end,children:c.name},c.name))}):null,l("div",{className:" col-span-3",children:[n<=960&&!o?l(C,{to:m(t,r[r.length-1].params),children:[e(k,{className:"w-5 h-5"}),e("span",{children:"Settings"})]}):null,e("div",{className:"space-y-8",children:e(S,{})})]})]})})})};export{B as S};
