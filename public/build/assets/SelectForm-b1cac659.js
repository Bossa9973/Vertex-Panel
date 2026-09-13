import{r as c,M as s,L as e,bZ as i,bR as m}from"./vendor-react-76e6893f.js";import{n as l}from"./vendor-motion-charts-05d56cec.js";import{E as p}from"./TextInput-340636b1.js";import{R as h}from"./main-52adaac0.js";import{p as w}from"./vendor-mantine-9ff60707.js";const g=l(w)`
    & .mantine-Select-label {
        ${{marginBottom:"0.25rem",fontSize:"0.75rem",lineHeight:"1rem",fontWeight:"500",color:"var(--color-accent-5)"}}
    }

    & .mantine-Select-input {
        ${{backgroundColor:"var(--color-background)"}}
        ${({error:o})=>o?{borderColor:"var(--color-error)",color:"var(--color-error)","::placeholder":{color:"var(--color-error-lighter)"}}:{borderColor:"var(--color-accent-2)","::placeholder":{color:"var(--color-accent-4)"},":focus":{borderColor:"var(--color-accent-5)"}}}
    }

    & .mantine-Select-dropdown {
        ${{borderWidth:"1px",borderColor:"var(--color-accent-2)",backgroundColor:"var(--color-background)","--tw-shadow":"0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)","--tw-shadow-colored":"0 10px 15px -3px var(--tw-shadow-color), 0 4px 6px -4px var(--tw-shadow-color)",boxShadow:"var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",".dark &":{"--tw-shadow":"0 0 #0000","--tw-shadow-colored":"0 0 #0000",boxShadow:"var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)"}}}
    }

    & .mantine-Select-itemsWrapper {
        ${{padding:"0.5rem"}}
    }
`,v=l.div`
    ${{display:"flex",cursor:"pointer",alignItems:"center",justifyContent:"space-between",borderRadius:"5px",padding:"0.5rem",fontSize:"0.875rem",lineHeight:"1.25rem",color:"var(--color-accent-5)",":hover":{backgroundColor:"var(--color-accent-2)"}}}
    & .select-item-icon {
        ${{display:"none"}}
    }

    &[data-selected] {
        ${{backgroundColor:"var(--color-background)",fontWeight:"500",color:"var(--color-foreground)",":hover":{backgroundColor:"var(--color-accent-2)"}}}
    }

    &[data-selected] .select-item-icon {
        ${{display:"block"}}
    }
`,f=c.forwardRef(({label:o,className:a,...t},r)=>s(v,{ref:r,...t,children:[e("span",{children:o}),e(i,{className:"h-4 w-4 text-foreground select-item-icon",title:"checked"})]})),b=c.forwardRef(({loading:o,nothingFound:a,rightSection:t,error:r,...n},d)=>e(g,{error:r?e(p,{children:r}):void 0,nothingFound:o?"Loading...":a,rightSection:o?e(h,{size:4}):t,itemComponent:f,ref:d,...n})),$=({control:o,...a})=>{const{field:t,fieldState:{error:r}}=m({name:a.name,control:o});return e(b,{...t,...a,error:r?.message})};export{$ as S,b as a};
