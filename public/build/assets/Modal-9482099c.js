import{r as i,a as o,b as m,cU as l,cV as d}from"./vendor-react-b2e18a0e.js";import{E as n,ai as u}from"./main-45062b2e.js";const p=i.forwardRef(({open:r,onClose:e,children:a},c)=>{const s=i.useRef(null);return o(l.Root,{appear:!1,show:r,as:i.Fragment,children:m(d,{as:"div",initialFocus:s,className:"relative z-[3000]",onClose:e,children:[o(l.Child,{as:i.Fragment,enter:"ease-in-out duration-500",enterFrom:"opacity-0",enterTo:"opacity-100",leave:"ease-in-out duration-500",leaveFrom:"opacity-100",leaveTo:"opacity-0",children:o("div",{className:"fixed inset-0 bg-black bg-opacity-75 transition-opacity"})}),o("div",{className:"fixed inset-0 z-10 overflow-hidden",children:o("div",{className:"flex min-h-full items-end justify-center sm:items-center p-0",children:o(l.Child,{as:i.Fragment,enter:"ease-out duration-300",enterFrom:"opacity-0 translate-y-[100vh] sm:-translate-y-[10vh]",enterTo:"opacity-100 translate-y-0",leave:"ease-in duration-200",leaveFrom:"opacity-100 translate-y-0",leaveTo:"opacity-0 translate-y-[100vh] sm:-translate-y-[10vh]",children:m(d.Panel,{ref:c,className:"absolute w-full sm:max-w-lg bg-background rounded-t-lg sm:rounded-lg border-t border-x sm:border-b border-accent-200",children:[o("input",{type:"hidden",ref:s,autoFocus:!0}),a]})})})})]})})}),t=({open:r,onClose:e,children:a})=>o(p,{open:r,onClose:e,children:a});t.Header=n.div`
    ${{borderBottomWidth:"1px",borderColor:"var(--color-accent-2)",padding:"2rem","@media (min-width: 640px)":{padding:"1.5rem"}}}
`;t.Title=n.h3`
    ${{textAlign:"center",fontSize:"1.25rem",lineHeight:"1.75rem",fontWeight:"500",color:"var(--color-foreground)"}}
`;t.Body=n.div`
    ${{maxHeight:"60vh",overflowY:"auto",backgroundColor:"var(--color-accent-1)",padding:"1.5rem"}}
`;t.Description=({children:r,bottomMargin:e})=>o(d.Description,{className:`text-accent-600 text-sm ${e&&"mb-5"}`,children:r});t.Actions=n.div`
    ${{display:"flex",borderTopWidth:"1px",borderColor:"var(--color-accent-2)"}}

    & > button:is(:first-of-type) {
        ${{borderBottomLeftRadius:"5px"}}
    }

    & > button:not(:last-child) {
        ${{borderRightWidth:"1px",borderColor:"var(--color-accent-2)"}}
    }

    & > button:is(:last-child) {
        ${{borderBottomRightRadius:"5px",color:"var(--color-foreground) !important"}}
    }
`;const b=n.button`
    ${{flexGrow:"1",backgroundColor:"var(--color-background)",paddingTop:"1.5rem",paddingBottom:"1.5rem",fontSize:"0.75rem",lineHeight:"1rem",textTransform:"uppercase",color:"var(--color-accent-5)",transitionProperty:"color, background-color, border-color, text-decoration-color, fill, stroke",transitionTimingFunction:"cubic-bezier(0.4, 0, 0.2, 1)",transitionDuration:"150ms",":active":{backgroundColor:"var(--color-accent-1)",color:"var(--color-foreground)"},":disabled":{cursor:"not-allowed",backgroundColor:"var(--color-accent-1)"},"@media (min-width: 640px)":{":hover":{backgroundColor:"var(--color-accent-1)",color:"var(--color-foreground)"}}}}
`;t.Action=({loading:r,disabled:e,children:a,...c})=>o(b,{...c,disabled:e||r,children:r?o("div",{className:"grid place-items-center w-full h-full",children:o(u,{size:4})}):a});export{t as M};
