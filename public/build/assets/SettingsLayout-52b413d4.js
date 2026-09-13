import{S as v,V as f,a0 as x,N as u,W as b,r as s,L as e,M as n,c8 as w,a3 as y}from"./vendor-react-76e6893f.js";import{a0 as c}from"./main-52adaac0.js";import{n as t}from"./vendor-motion-charts-05d56cec.js";import{w as $}from"./vendor-mantine-9ff60707.js";const k=t(v)`
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
`,N=t.div`
    ${{display:"grid"}}

    @media (min-width: 960px) {
        ${{gridTemplateColumns:"repeat(4, minmax(0, 1fr))",gap:"4rem"}}
    }
    @media (max-width: 960px) {
        ${{gridTemplateColumns:"repeat(1, minmax(0, 1fr))"}}
    }
`,L=t.div`
    ${{display:"flex",flexDirection:"column"}}

    @media (max-width: 960px) {
        ${{"> :not([hidden]) ~ :not([hidden])":{"--tw-divide-y-reverse":"0",borderTopWidth:"calc(1px * calc(1 - var(--tw-divide-y-reverse)))",borderBottomWidth:"calc(1px * var(--tw-divide-y-reverse))",borderColor:"var(--color-accent-2)"}}}

        & > a:is(:first-of-type) {
            ${{paddingTop:"0px"}}
        }
    }
`,S=t(f)`
    ${{display:"flex",alignItems:"center","> :not([hidden]) ~ :not([hidden])":{"--tw-space-x-reverse":"0",marginRight:"calc(0.75rem * var(--tw-space-x-reverse))",marginLeft:"calc(0.75rem * calc(1 - var(--tw-space-x-reverse)))"},paddingBottom:"1.5rem",fontSize:"0.875rem",lineHeight:"1.25rem",fontWeight:"600",color:"var(--color-foreground)"}}
`,z=({indexPattern:d,defaultUrl:l,contentBlock:m,routes:p})=>{const r=x(),{width:o}=$(),a=u(d),h=b();s.useEffect(()=>{o>960&&a&&h(c(l,r[r.length-1].params),{replace:!0})},[a,o]);const g=m??s.Fragment;return e("div",{className:"bg-background min-h-screen",children:e(g,{children:n(N,{className:a?"border-b border-accent-200":"",children:[o>960||a?e(L,{children:p.map(i=>e(k,{to:c(i.path,r[r.length-1].params),end:i.end,children:i.name},i.name))}):null,n("div",{className:" col-span-3",children:[o<=960&&!a?n(S,{to:c(d,r[r.length-1].params),children:[e(w,{className:"w-5 h-5"}),e("span",{children:"Settings"})]}):null,e("div",{className:"space-y-8",children:e(y,{})})]})]})})})};export{z as S};
