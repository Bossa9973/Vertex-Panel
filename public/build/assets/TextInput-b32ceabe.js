import{b as c,a as o,a4 as t,r as l}from"./vendor-react-d66e42fa.js";import{E as n}from"./main-6d7a3c9c.js";import{T as s}from"./TextInput-a58ab77e.js";const d=({children:r})=>c("div",{className:"flex space-x-1 mt-2",children:[o(t,{className:"h-5 w-5 text-error"})," ",o("p",{className:"text-sm text-error",children:r})]}),i=n(s)`
    .mantine-TextInput-label {
        ${{marginBottom:"0.25rem",fontSize:"0.75rem",lineHeight:"1rem",fontWeight:"500",color:"var(--color-accent-5)"}}
    }

    .mantine-TextInput-input {
        ${{backgroundColor:"var(--color-background)",":disabled":{backgroundColor:"var(--color-accent-1)",color:"var(--color-accent-5)"},":disabled::placeholder":{color:"var(--color-accent-3)"}}}
        ${({error:r})=>r?{borderColor:"var(--color-error)",color:"var(--color-error)","::placeholder":{color:"var(--color-error-lighter)"}}:{borderColor:"var(--color-accent-2)","::placeholder":{color:"var(--color-accent-4)"},":focus":{borderColor:"var(--color-accent-5)"}}}
    }
`,v=l.forwardRef(({error:r,...e},a)=>o(i,{ref:a,error:r?o(d,{children:r}):void 0,...e}));export{d as E,v as T};
