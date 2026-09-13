import{M as c,L as o,ab as t,r as l}from"./vendor-react-76e6893f.js";import{n}from"./vendor-motion-charts-05d56cec.js";import{i as s}from"./vendor-mantine-9ff60707.js";const i=({children:r})=>c("div",{className:"flex space-x-1 mt-2",children:[o(t,{className:"h-5 w-5 text-error"})," ",o("p",{className:"text-sm text-error",children:r})]}),d=n(s)`
    .mantine-TextInput-label {
        ${{marginBottom:"0.25rem",fontSize:"0.75rem",lineHeight:"1rem",fontWeight:"500",color:"var(--color-accent-5)"}}
    }

    .mantine-TextInput-input {
        ${{backgroundColor:"var(--color-background)",":disabled":{backgroundColor:"var(--color-accent-1)",color:"var(--color-accent-5)"},":disabled::placeholder":{color:"var(--color-accent-3)"}}}
        ${({error:r})=>r?{borderColor:"var(--color-error)",color:"var(--color-error)","::placeholder":{color:"var(--color-error-lighter)"}}:{borderColor:"var(--color-accent-2)","::placeholder":{color:"var(--color-accent-4)"},":focus":{borderColor:"var(--color-accent-5)"}}}
    }
`,v=l.forwardRef(({error:r,...e},a)=>o(d,{ref:a,error:r?o(i,{children:r}):void 0,...e}));export{i as E,v as T};
